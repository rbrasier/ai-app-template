# Phase v1.2.0 — Auth Pages (Login / Register / Reset) & Admin Settings Store

## Summary

Two cohesive front-door capabilities:

1. **Standalone auth pages** — dedicated `/login`, `/register`,
   `/reset-password` (+ `/reset-password/[token]`) using **email + password**
   (no username). Adds the missing **password-reset** flow via Better Auth and a
   **registration-approval** path gated by an admin toggle. `/admin/login`
   becomes a redirect to `/login?next=/admin`.
2. **Runtime admin settings store** — `/admin/settings` becomes the single place
   to configure the app, persisted in **one `admin_settings.value` JSON field**
   (ADR-007). Two real cards: **Login Methods** (active method + options +
   "allow users to register without approval" toggle) and **AI Configuration**
   (provider, encrypted keys, default model/options). DB overrides env; env
   seeds and is the fallback; secret keys are encrypted at rest.

See `docs/development/prd/admin-settings-auth-pages.prd.md` and ADR-007
(reuses ADR-005 auth, ADR-006 RBAC).

## Why

v1.1.0 shipped email+password but only as a combined form at `/admin/login`,
with **no password reset** (explicit non-goal then) and no public entry point.
And every operational knob is env-only, so there is no admin UI and changes need
a redeploy. These are the first screens every user and admin touches.

## Version Bump

`1.1.0` → `1.2.0` (MINOR — new feature + DB schema change: `admin_settings` table
and `core_users.status` column).

> **Open decisions** carried from the PRD (confirm in `/doc-review`): page
> placement (standalone, default), secret handling (encrypted, default),
> approval depth (full queue, default), config precedence (DB-over-env, default).
> Build assumes the defaults unless changed.

---

## Scope

### In scope

- `admin_settings` table + `core_users.status` column + Drizzle migration; seed
  the singleton settings row from env (idempotent); existing users → `active`.
- `AppSettings` zod schema + `defaultAppSettings(env)` in `@rbrasier/shared`.
- Domain ports `ISettingsRepository`, `ISecretCipher` (Result pattern).
- `SettingsService` (merge DB-over-env, cache, invalidate-on-save) in
  `@rbrasier/application`.
- Adapters: `DrizzleSettingsRepository`, `AesSecretCipher` (Node crypto GCM),
  settings seed; export from `@rbrasier/adapters`.
- Better Auth: enable `emailAndPassword.sendResetPassword`; gate sign-in/sign-up
  on `core_users.status`; mailer port gains `sendPasswordReset` +
  `sendApprovalNotice` (logging stub by default).
- Web pages: `/login`, `/register`, `/reset-password`, `/reset-password/[token]`;
  `/admin/login` → redirect; rebuilt `/admin/settings` with Login Methods + AI
  Configuration cards; `/admin/users` pending-approval queue + status column.
- tRPC: `settings` router (`get`, `update`, gated `settings.manage`);
  `user.listPending` / `user.approve` / `user.reject` (gated `users.write`).
- `auth-client.ts`: `requestPasswordReset` / `resetPassword`.
- `container.ts`: build `SettingsService`, resolve AI per-request from settings,
  supply cipher + mailer, lazily refresh auth on settings change.
- `env.ts`: `APP_SETTINGS_ENCRYPTION_KEY` (base64 → 32 bytes; required in prod).
- Installers: write `APP_SETTINGS_ENCRYPTION_KEY`; note runtime config moved to
  `/admin/settings`.
- Tests written **before** implementation for every new unit; `.env.example`,
  `VERSION`/`package.json`, changeset updated.

### Out of scope

- Real SMTP wiring (reset/approval use the stub mailer port).
- Email-verification-on-signup.
- Entra/PKI secrets in the settings store (stay env-managed).
- `apps/api` reading the DB settings (stays env).
- General/Email/Maintenance cards (defer; remove the dead placeholders).
- Settings history/audit diffing, key rotation, multi-tenant settings.

---

## Architecture

### Settings store (ADR-007)

- Table `admin_settings`: `id (uuid pk)`, `value (jsonb not null)`,
  `created_at`, `updated_at`; exactly one row.
- Schema `packages/shared/src/schemas/app-settings.ts`:

  ```typescript
  // sections are additive and defaulted; secrets hold ciphertext at rest
  const appSettingsSchema = z.object({
    auth: z.object({
      method: authMethodEnum,                       // mirrors env AUTH_METHOD enum
      enableMagicLink: z.boolean(),
      enableEntra: z.boolean(),
      allowRegistrationWithoutApproval: z.boolean(),
    }),
    ai: z.object({
      provider: z.enum(["anthropic", "openai", "mistral"]),
      defaultModel: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      secrets: z.object({                            // ciphertext, never plaintext in API
        anthropic: z.string().optional(),
        openai: z.string().optional(),
        mistral: z.string().optional(),
      }),
    }),
  });
  export function defaultAppSettings(env): AppSettings { /* from env */ }
  ```

- `SettingsService.get()` = `merge(defaultAppSettings(env), dbRow.value)`,
  DB winning per field; cached; `save(patch)` validates the merged object,
  encrypts any newly-supplied secret via `ISecretCipher`, persists, invalidates.
- **Secrets**: `AesSecretCipher` (AES-256-GCM, key from
  `APP_SETTINGS_ENCRYPTION_KEY`). The settings router returns
  `{ anthropic: "set" | "unset", ... }` — never plaintext. Blank on save = keep
  existing; non-blank = re-encrypt.

### Resolution & refresh

- **AI**: `LanguageModelAdapter` is selected per-request from
  `settingsService.get().ai` (provider + decrypted key), wrapped by the existing
  usage-tracking / Langfuse decorators. No redeploy to switch provider/key.
- **Auth**: container builds Better Auth from `settingsService.get().auth`; on a
  changed settings version it rebuilds the auth instance lazily on next use.
  **Verify in `node_modules/better-auth`** that rebuild is safe/cheap; if not,
  document a restart for auth-method changes only and record the choice.

### Auth pages & flows

- Refactor the existing `login-form.tsx` logic into a shared client form reused
  by `/login` and `/register` (mode prop), driven by method flags from a small
  `/api/auth/methods` (or settings-exposed) endpoint rather than build-time env.
- **Reset**: `/reset-password` calls `authClient.requestPasswordReset({ email,
  redirectTo })`; Better Auth `sendResetPassword` invokes the mailer port with
  the token URL; `/reset-password/[token]` calls `authClient.resetPassword`.
  **Verify the exact Better Auth API names/shapes in `node_modules`.**
- **Approval**: `/register` → user created with
  `status = allowRegistrationWithoutApproval ? 'active' : 'pending'`. Sign-in and
  session creation reject non-`active` status with a clear message. `/admin/users`
  lists `pending` users with approve (→`active`, send notice) / reject
  (→`rejected`) actions.

---

## Sub-components (build order)

1. **Schema + migration** — `admin_settings`, `core_users.status`; export from
   `schema/index.ts`; generate + run Drizzle migration.
2. **Shared schema (tests first)** — `app-settings.ts` schema +
   `defaultAppSettings`; round-trip + default tests.
3. **Domain ports (tests first)** — `ISettingsRepository`, `ISecretCipher`;
   extend `User` with `status`.
4. **Application (tests first)** — `SettingsService` merge/precedence/cache;
   approval use cases (`ApproveUser`, `RejectUser`, `ListPendingUsers`).
5. **Adapters (tests first)** — `DrizzleSettingsRepository`, `AesSecretCipher`
   (encrypt/decrypt round-trip + tamper-detect), settings seed; status gating in
   the user repo; export from index.
6. **Auth wiring** — `better-auth.ts` reset + status gate; `env.ts`
   `APP_SETTINGS_ENCRYPTION_KEY`; `container.ts` settings-driven AI + auth
   refresh; `auth-client.ts` reset calls.
7. **tRPC** — `settings` router (`get` redacts secrets, `update`); `user`
   pending/approve/reject; register in `router.ts`.
8. **Web UI** — `/login`, `/register`, `/reset-password`,
   `/reset-password/[token]`; `/admin/login` redirect; rebuilt `/admin/settings`
   (Login Methods + AI Configuration cards, masked secret fields, source hints);
   `/admin/users` approval queue.
9. **Config, installers, docs, version** — `.env.example`
   `APP_SETTINGS_ENCRYPTION_KEY`; both installers write it + note runtime config;
   bump `VERSION`/`package.json` to `1.2.0`; changeset; move this phase doc to
   `docs/development/implemented/v1.2.0/` with an implementation summary.

---

## New Env Vars

| Var | Required when | Default | Notes |
|---|---|---|---|
| `APP_SETTINGS_ENCRYPTION_KEY` | production | dev: generated/ephemeral | base64, decodes to 32 bytes; encrypts settings secrets |

(No new auth/AI vars — existing `AUTH_*` / `AI_*` / `*_API_KEY` now **seed** the
settings row and remain the fallback per ADR-007.)

---

## Acceptance Criteria

- [ ] `/register` honours approval toggle: off → signed in; on → `pending`,
      sign-in blocked with a clear message.
- [ ] `/login` authenticates an `active` email+password user; honours `next`.
- [ ] `/reset-password` → emailed token (mailer port) → `/reset-password/[token]`
      sets a new password; old password rejected.
- [ ] `/admin/login` redirects to `/login?next=/admin`.
- [ ] `/admin/settings` persists to a single `admin_settings.value` JSON field;
      reload shows persisted values; effective source shown per field.
- [ ] Login Methods card changes active method(s) + approval toggle and alters
      `/register`//`/login` behaviour with no redeploy.
- [ ] AI Configuration card: key stored encrypted (ciphertext in DB, masked in
      UI, never returned plaintext); next AI request uses new provider/key.
- [ ] Empty `admin_settings` on first boot seeds from env; env unset → defaults.
- [ ] Pending users on `/admin/users`; approve → can sign in; reject → blocked.
- [ ] Every new domain/application/adapter unit has tests written first.
- [ ] `./validate.sh` passes; `VERSION` and `package.json` both `1.2.0`.

---

## Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Better Auth reset API shape differs from assumption | Medium | High | Verify `sendResetPassword`/`forgetPassword`/`resetPassword` in `node_modules`; integration test the full reset |
| Rebuilding Better Auth on settings change is unsafe/costly | Medium | Medium | Verify in node_modules; fall back to documented restart for auth-method changes only; record choice |
| Encryption key loss / rotation | Low | High | Required-in-prod env validation; document that key loss orphans secrets; rotation is future work |
| Plaintext secret leaks via API/logs | Low | High | Router redacts to `set`/`unset`; test asserts no plaintext in responses; never log decrypted keys |
| Singleton JSON concurrent-save clobber | Medium | Medium | Section-scoped patch + optimistic `updated_at` check |
| Env↔DB precedence confuses admins | Medium | Low | Per-field "from environment / set in database" source hint |
| Existing users locked out by status gate | Low | High | Migration defaults `status='active'`; only new sign-ups can be `pending` |
| Per-request settings read on AI path adds latency | Low | Low | Served from in-process cache; invalidate only on save |

---

## Tests (representative)

| File | Covers |
|---|---|
| `packages/shared/src/schemas/__tests__/app-settings.test.ts` | schema validation, `defaultAppSettings` from env |
| `packages/application/src/services/__tests__/settings-service.test.ts` | DB-over-env merge, cache, invalidate-on-save |
| `packages/application/src/use-cases/__tests__/approve-user.test.ts` etc. | approve/reject/list-pending, status transitions |
| `packages/adapters/src/__tests__/aes-secret-cipher.test.ts` | encrypt/decrypt round-trip, GCM tamper-detect |
| `packages/adapters/src/repositories/__tests__/drizzle-settings-repository.test.ts` | singleton get/save persistence |
| `packages/adapters/src/auth/__tests__/better-auth-reset.test.ts` | reset send + status gate on sign-in |
| `apps/web/src/server/routers/__tests__/settings.test.ts` | authz, secret redaction, no plaintext in response |
| `apps/web` route tests | register approval branch, login, reset token flow |

---

## Files Changed (indicative)

| File | Change |
|---|---|
| `packages/adapters/src/db/schema/admin.ts` | New — `admin_settings` |
| `packages/adapters/src/db/schema/core.ts` | `core_users.status` column |
| `packages/adapters/src/db/schema/index.ts` | export `admin_settings` |
| `packages/adapters/src/db/migrations/<ts>.sql` | migration |
| `packages/shared/src/schemas/app-settings.ts` (+ index) | New schema + defaults |
| `packages/domain/src/ports/{settings-repository,secret-cipher}.ts` (+ index) | New ports |
| `packages/domain/src/entities/user.ts` | add `status` |
| `packages/application/src/services/settings-service.ts` (+ index) | New |
| `packages/application/src/use-cases/{approve,reject,list-pending}-user.ts` | New |
| `packages/adapters/src/repositories/drizzle-settings-repository.ts` | New |
| `packages/adapters/src/crypto/aes-secret-cipher.ts` | New |
| `packages/adapters/src/settings/seed-settings.ts` | New |
| `packages/adapters/src/auth/better-auth.ts` | reset + status gate |
| `packages/adapters/src/index.ts` | exports |
| `apps/web/src/lib/env.ts` | `APP_SETTINGS_ENCRYPTION_KEY` |
| `apps/web/src/lib/container.ts` | settings service, per-request AI, auth refresh, cipher, mailer |
| `apps/web/src/lib/auth-client.ts` | reset calls |
| `apps/web/src/server/routers/settings.ts` + `router.ts` | New router + register |
| `apps/web/src/server/routers/user.ts` | pending/approve/reject |
| `apps/web/src/app/(auth)/login/page.tsx` | New |
| `apps/web/src/app/(auth)/register/page.tsx` | New |
| `apps/web/src/app/(auth)/reset-password/page.tsx` | New |
| `apps/web/src/app/(auth)/reset-password/[token]/page.tsx` | New |
| `apps/web/src/app/(auth)/auth-form.tsx` | shared form (refactored from admin login-form) |
| `apps/web/src/app/(admin)/admin/login/page.tsx` | redirect to `/login?next=/admin` |
| `apps/web/src/app/(admin)/admin/settings/page.tsx` | rebuilt: Login Methods + AI cards |
| `apps/web/src/app/(admin)/admin/users/page.tsx` | approval queue + status |
| `.env.example` | `APP_SETTINGS_ENCRYPTION_KEY` |
| `scripts/init-project.sh` | write encryption key; note runtime config |
| `packages/create/src/index.ts` (+ helpers/.test) | write encryption key |
| `VERSION`, `package.json`, `.changeset/*` | `1.2.0` + changeset |
