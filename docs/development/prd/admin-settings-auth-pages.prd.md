# PRD — Auth Pages (Login / Register / Reset) & Admin Settings Store

- **Status**: Draft
- **Date**: 2026-06-27
- **Author**: richy.brasier
- **Target version**: 1.2.0 (bump: MINOR — new feature + DB schema change; see `docs/guides/versioning.md`)

> ## Open decisions (resolve in `/doc-review`)
>
> The requesting prompt did not pin these down and the interactive question
> prompt could not be delivered in this environment. This PRD proceeds on the
> **recommended default** for each; change them here before Build if wrong.
>
> 1. **Page placement** → *standalone top-level* `/login`, `/register`,
>    `/reset-password`. `/admin/login` redirects to `/login?next=/admin`.
> 2. **Secret handling in the JSON store** → *encrypted at rest*. API keys are
>    stored inside the settings JSON but AES-encrypted with a key from env;
>    the UI shows masked values and "set / replace" affordances only.
> 3. **Registration approval** → *full approval queue*. New sign-ups land
>    `pending` when approval is required; admins approve/reject from
>    `/admin/users`; pending users cannot sign in.
> 4. **Config precedence** → *DB overrides env; env seeds*. The settings row is
>    the runtime source of truth; env vars provide first-boot defaults and a
>    fallback when a setting is unset.

## 1. Problem

The template ships email+password auth (v1.1.0) but only as a single combined
sign-in/sign-up form at `/admin/login` — there is no dedicated registration
page, **no password-reset flow at all** (it was an explicit non-goal last
phase), and no public end-user entry point. Separately, every operational knob
(which auth methods are on, whether sign-ups need approval, which AI provider
and keys to use) lives in environment variables, so changing any of them means
a redeploy and there is no admin UI. `/admin/settings` exists but is four
static placeholder cards with no backing store. Administrators have nowhere to
configure the application at runtime.

## 2. Users / Personas

- **End user** — wants to register with email + password, sign in, and recover
  a forgotten password through a self-service reset link, on clear standalone
  pages.
- **Administrator** — wants a single place (`/admin/settings`) to choose and
  configure the active login method(s), decide whether new registrations need
  approval, and set the AI provider/keys/options — without editing env files or
  redeploying.
- **App developer** (bootstraps from the template) — wants these surfaces to
  exist by default and to keep working whether config comes from env (first
  boot) or the DB (after an admin edits it).

## 3. Goals

- A user can **register** (`/register`), **sign in** (`/login`), and **reset a
  forgotten password** (`/reset-password` → emailed token →
  `/reset-password/[token]`) using email + password — no username anywhere.
- `/admin/settings` is the **single source of runtime configuration**, persisted
  in **one JSON field** in the database and editable through cards.
- A **Login Methods** card lets an admin pick which method(s) are active and
  configure each, including an **"allow users to register without approval"**
  toggle.
- An **AI Configuration** card lets an admin choose the provider, set per-
  provider API keys (stored encrypted, shown masked), and set model/options.
- When approval is required, new sign-ups are **held pending** and an admin can
  **approve or reject** them; pending users cannot sign in.
- Settings changes take effect **without a redeploy** for AI config; auth-method
  changes apply per the precedence/refresh rules in ADR-007.
- Existing env-only deployments keep working: env seeds the settings row on
  first boot and remains the fallback.

## 4. Non-goals

- SMTP/transactional-email delivery implementation — the reset and approval
  flows call the existing pluggable mailer port (today a logging stub); wiring a
  real provider stays a deploy concern.
- Email-address verification on registration (separate from password reset).
- Per-provider AI settings beyond provider, key, default model, and base/temperature
  (advanced routing, fallback chains stay future work).
- OAuth/Entra and PKI *configuration* moving into the settings store — this PRD
  moves auth-method selection, the approval toggle, and AI config; Entra/PKI
  secrets remain env-managed for now (noted in §11).
- Multi-tenant / per-workspace settings — the settings row is global (singleton).
- Role/permission changes — RBAC (v1.1.0) is reused as-is; `/admin/settings` is
  gated by the existing `settings.manage` permission.

## 5. Key entities

| Entity | Lives in | New / existing | Notes |
| ------ | -------- | -------------- | ----- |
| `AppSettings` (schema + defaults) | `packages/shared/src/schemas/app-settings.ts` | new | zod schema for the whole config object; default factory; section types |
| `ISettingsRepository` | `packages/domain/src/ports/settings-repository.ts` | new | Result-pattern `get()` / `save(patch)` over the singleton row |
| `SettingsService` (resolver) | `packages/application/src/services/settings-service.ts` | new | merges DB row over env seed; caches; exposes typed getters; invalidate on save |
| `ISecretCipher` | `packages/domain/src/ports/secret-cipher.ts` | new | `encrypt`/`decrypt` port for secret fields in the JSON store |
| `AppSettings` row | `packages/adapters/src/db/schema/admin.ts` → `admin_settings` | new table | singleton; `value jsonb` holds the config object |
| `User` | `packages/domain/src/entities/user.ts` | existing | gains `status` (`pending`/`active`/`rejected`/`suspended`) |
| Mailer port | existing (`sendMagicLink`-style stub in container) | reuse/extend | adds `sendPasswordReset` and `sendApprovalNotice` |

## 6. User stories

1. As a visitor, I open `/register`, enter name + email + password, and (when
   approval is off) am signed in immediately.
2. As a visitor where approval is required, I register and see a "pending
   approval" message; I cannot sign in until approved.
3. As a visitor, I open `/login`, enter email + password, and reach the app (or
   `next` target).
4. As a visitor who forgot my password, I open `/reset-password`, enter my
   email, receive a reset link, open `/reset-password/[token]`, set a new
   password, and am returned to `/login`.
5. As an admin, I open `/admin/settings`, and on the **Login Methods** card pick
   email+password (and optionally magic-link/Entra), and toggle "allow users to
   register without approval".
6. As an admin, I open the **AI Configuration** card, pick `anthropic`, paste an
   API key (saved encrypted, shown as `••••`), set a default model, and save.
7. As an admin, when approval is on, I see pending users on `/admin/users` and
   approve or reject each; approval lets them sign in.
8. As an admin, after I change the AI provider, the next chat request uses the
   new provider with no redeploy.

## 7. Pages / surfaces affected

- `/login` — **new** standalone email+password sign-in (replaces the sign-in
  half of the combined form).
- `/register` — **new** standalone registration; honours the approval toggle.
- `/reset-password` — **new** request-a-reset (enter email).
- `/reset-password/[token]` — **new** set-new-password from emailed token.
- `/admin/login` — redirects to `/login?next=/admin` (kept as a stable alias).
- `/admin/settings` — **rebuilt**: real cards bound to the settings store
  (Login Methods, AI Configuration; the existing General/Email/Maintenance
  placeholders become real or are removed — see §11).
- `/admin/users` — gains a pending-approval queue (approve/reject) and a status
  column.
- tRPC: **new** `settings` router (`get`, `update`); **new** `user.listPending`,
  `user.approve`, `user.reject`; all gated by `settings.manage` / `users.write`.
- `apps/web/src/lib/container.ts` — builds a `SettingsService` (DB-over-env),
  resolves AI provider/keys through it, supplies the cipher and mailer.
- `apps/web/src/lib/auth-client.ts` — adds `requestPasswordReset` / `resetPassword`
  client calls (Better Auth `forgetPassword`/`resetPassword`).
- `packages/adapters/src/auth/better-auth.ts` — enables
  `emailAndPassword.sendResetPassword`; gates sign-up/sign-in on user `status`.
- **Installers** (`scripts/init-project.sh`, `packages/create`) — write an
  `APP_SETTINGS_ENCRYPTION_KEY` and note that auth/AI config is now also
  editable at `/admin/settings` after boot.

## 8. Database changes

| Table | Change | Prefix valid? |
| ----- | ------ | ------------- |
| `admin_settings` | NEW — singleton config row: `id (uuid)`, `value jsonb not null`, `created_at`, `updated_at` | yes (`admin_`) |
| `core_users` | add column `status text not null default 'active'` (`pending`/`active`/`rejected`/`suspended`) | n/a |
| `core_verification_tokens` | reused for reset tokens (Better Auth) — no schema change expected | n/a |

A Drizzle migration accompanies the change. An idempotent seed inserts the
singleton `admin_settings` row from env values on first boot (see ADR-007).
Existing users default to `status = 'active'` so no one is locked out.

## 9. Architectural decisions

- **ADR-007 — Runtime application settings store** (new, introduced here):
  a single `admin_settings` JSONB row is the runtime source of truth; env seeds
  it and is the fallback; a `SettingsService` merges + caches; secret fields are
  encrypted via an `ISecretCipher` adapter keyed from
  `APP_SETTINGS_ENCRYPTION_KEY`; the schema lives in `packages/shared`.
- Reuses **ADR-005** (composable auth) — the Login Methods card writes the same
  method flags the container already understands; reset password uses Better
  Auth's built-in `forgetPassword`/`resetPassword`.
- Reuses **ADR-006** (RBAC) — `/admin/settings` and the settings router are
  gated by the existing `settings.manage` permission; the approval queue uses
  `users.write`.

## 10. Acceptance criteria

- [ ] `/register` creates a user; with approval **off** the user is signed in;
      with approval **on** the user is `pending` and cannot sign in.
- [ ] `/login` authenticates an `active` email+password user and honours `next`.
- [ ] `/reset-password` sends a reset link (via the mailer port); the token page
      sets a new password; the old password no longer works.
- [ ] `/admin/login` redirects to `/login?next=/admin`.
- [ ] `/admin/settings` reads and writes a single `admin_settings.value` JSON
      field; reload shows persisted values.
- [ ] Login Methods card: changing active method(s) and the approval toggle
      persists and changes `/register` and `/login` behaviour accordingly.
- [ ] AI Configuration card: selecting provider + saving a key + default model
      persists; the key is stored encrypted (ciphertext in DB, not plaintext)
      and rendered masked; the next AI request uses the new provider/key with no
      redeploy.
- [ ] First boot with an empty `admin_settings` seeds the row from env; with env
      unset, documented defaults apply.
- [ ] Pending users appear on `/admin/users`; approve → user can sign in; reject
      → user stays blocked.
- [ ] All new domain/application/adapter code has tests written **before**
      implementation (settings schema/defaults, merge precedence, cipher
      round-trip, status gating, reset flow).
- [ ] `./validate.sh` passes; `VERSION` and `package.json` both `1.2.0`.

## 11. Out of scope / future work

- Real SMTP provider wiring (reset + approval emails use the existing stub port).
- Email-verification-on-signup.
- Moving Entra/PKI secrets into the settings store (kept in env this phase).
- General/Email/Maintenance settings cards — either ship as real cards in this
  phase or defer; default plan is to **defer** them and ship only Login Methods
  + AI Configuration, removing the dead placeholders.
- Per-environment settings overrides / settings history & audit diffing.
- `apps/api` reading the DB settings store (it continues to read env until a
  later phase).

## 12. Risks / open questions

- **Hot-reload of auth wiring.** Better Auth is built once in the container.
  AI provider/key resolution can be made per-request (cheap), but switching the
  *base auth method* may need an auth-instance rebuild on settings change or a
  documented restart — ADR-007 picks the approach; verify the Better Auth
  rebuild cost.
- **Secret encryption key management.** Losing `APP_SETTINGS_ENCRYPTION_KEY`
  makes stored keys unrecoverable; rotation needs a re-encrypt step (future).
- **Env↔DB drift / confusion.** With DB-overrides-env, an admin edit silently
  wins over env; the UI must show effective source. Mitigation: show "set in
  database / from environment" hints per field.
- **Singleton race.** Concurrent saves to one JSON row can clobber sections;
  mitigate with section-scoped patch + optimistic `updated_at` check.
- **Open question:** should the four open decisions above be confirmed before
  Build, or is the recommended set acceptable? (Resolve in `/doc-review`.)
