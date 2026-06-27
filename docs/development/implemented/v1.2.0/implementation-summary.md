# v1.2.0 — Auth Pages & Admin Settings Store — Implementation Summary

Implements `admin-settings-auth-pages.phase.md`. Two capabilities: standalone
auth front-door pages (login / register / reset + registration approval) and a
runtime admin settings store that overrides environment configuration.

## Deviation from the phase doc

The phase/ADR-007 specified a single `admin_settings.value` jsonb blob. At the
user's request this was implemented as **three grouped jsonb columns** instead:
`login_settings`, `ai_configuration`, and `extended_settings`. Each settings
section maps to its own column, so unrelated cards can be saved without
clobbering one another, and `extended_settings` is a forward-compatible
catch-all. The application-layer `SettingsService` and `DrizzleSettingsRepository`
are built around this column-per-section shape.

## What was built

### Schema & migrations
- `admin_settings` table — `login_settings` / `ai_configuration` /
  `extended_settings` jsonb (NOT NULL, default `{}`), plus `id`/`created_at`/
  `updated_at`. Migration `0006_ordinary_cargill.sql`.
- `core_users.status` column (`active` | `pending` | `rejected`, default
  `active` so existing users migrate to active). Migration
  `0007_oval_thunderbolts.sql`.

### Domain (`@rbrasier/domain`)
- Entities: `AppSettings` (`auth` / `ai` / `extended`), `UserStatus`; `User`
  gains `status`.
- Ports: `ISettingsRepository` (`StoredSettings`), `ISecretCipher`, `IMailer`.

### Shared (`@rbrasier/shared`)
- `app-settings.ts`: `appSettingsSchema`, `settingsUpdateSchema`,
  `RedactedAppSettings`, `defaultAppSettings(env)`. Secrets default empty — env
  keys are a runtime fallback, not seeded defaults.

### Application (`@rbrasier/application`)
- `SettingsService`: merges DB-over-env per field, in-process cache with
  `version()` for auth-refresh detection, `resolveApiKey` (decrypt or env
  fallback), `getRedacted` (set/unset, source hints), encrypt-on-save.
- Use cases: `ApproveUser` (activate + notice), `RejectUser`, `ListPendingUsers`.

### Adapters (`@rbrasier/adapters`)
- `AesSecretCipher` (AES-256-GCM, tamper-detecting), `DrizzleSettingsRepository`
  (singleton get/save over grouped columns), `LoggingMailer`, `seedSettings`
  (idempotent first-boot seed from env, encrypting keys).
- `better-auth.ts`: `sendResetPassword` wired to the mailer; `databaseHooks`
  set new-user `status` from the approval flag and block session creation for
  non-active users (clear message); `status` declared as an additional field.
- AI provider factory + `LanguageModelAdapter` accept a per-request API key
  (`createAnthropic/createOpenAI/createMistral`).

### Web (`@rbrasier/web`)
- Pages: `(auth)/login`, `(auth)/register`, `(auth)/reset-password`,
  `(auth)/reset-password/[token]` on a shared `AuthForm`; `/admin/login` →
  redirect; rebuilt `/admin/settings` (Login Methods + AI Configuration cards
  with masked secrets and per-section source hints); `/admin/users` pending
  queue + status column.
- `env.ts`: `APP_SETTINGS_ENCRYPTION_KEY` (base64→32 bytes, required in prod).
- `container.ts`: settings service, cipher, mailer, settings-driven per-request
  chat model, and lazy Better Auth rebuild on settings-version change.
- tRPC: `settings` router (`get` redacts, `update`, gated `settings.manage`);
  `user.listPending` / `approve` / `reject` (gated `users.write`).
- Installers write `APP_SETTINGS_ENCRYPTION_KEY` and note runtime config.

## Tests (written before implementation)
- `packages/shared/.../app-settings.test.ts` — schema + defaults.
- `packages/application/.../settings-service.test.ts` — merge / cache /
  resolve / encrypt-on-save / redaction.
- `packages/application/.../approve-user.test.ts` — approve / reject / pending.
- `packages/adapters/.../aes-secret-cipher.test.ts` — round-trip / tamper /
  wrong-key / key-length.
- `packages/create/.../helpers.test.ts` — encryption-key generation.

## Known limitations
- DB-backed adapters (`DrizzleSettingsRepository`) and the Better Auth reset /
  status-gate hooks have no unit tests — they require a live database, matching
  the repo's existing no-DB-test convention. The reset/approval logic is
  covered indirectly via the cipher, service, and use-case tests.
- The settings cache is per-process; in a multi-instance deploy a save
  invalidates only the serving instance (others refresh on their next restart
  or cache miss). Documented as acceptable per the phase's caching note.
- Mailer is a logging stub — reset links and approval notices are logged, not
  sent. Real SMTP wiring is out of scope.
- Concurrent saves to the singleton row are last-write-wins at section
  granularity (grouped columns reduce, but do not eliminate, clobber).

## Version
`1.1.0` → `1.2.0` (MINOR — new feature + DB schema change). `VERSION` and root
`package.json` both `1.2.0`. Changeset: `.changeset/admin-settings-auth-pages.md`.
