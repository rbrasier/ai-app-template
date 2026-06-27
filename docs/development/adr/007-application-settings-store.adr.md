# ADR-007 — Runtime Application Settings Store (DB-backed JSON, env-seeded, encrypted secrets)

- **Status**: Proposed
- **Date**: 2026-06-27

## Context

All operational configuration in the template is environment-driven and read
once, at container construction (`apps/web/src/lib/container.ts`):
`AI_DEFAULT_PROVIDER` and `*_API_KEY` build the `LanguageModelAdapter`;
`AUTH_METHOD` / `AUTH_ENABLE_*` build the Better Auth instance via the ADR-005
composable config. Changing any of these requires editing env and redeploying.
`/admin/settings` is a static placeholder with no persistence.

The new requirement is an admin-editable settings surface at `/admin/settings`
where **all application configuration is stored in a single JSON field**, with
cards for (1) which login method is active and its options — including an
"allow users to register without approval" toggle — and (2) AI provider, keys,
and options. This means config must become **runtime-mutable and DB-backed**,
while not breaking existing env-only deployments, and while storing secrets
(API keys) responsibly.

Constraints from the architecture rules:

- `packages/domain` has zero external deps — the settings *port* lives there but
  the zod *schema* cannot.
- `packages/application` may import `@rbrasier/domain` and `@rbrasier/shared`
  only — so the schema belongs in `@rbrasier/shared` (which already depends on
  zod and already hosts schemas).
- ORM/crypto live in `packages/adapters`.
- Result pattern at all boundaries.

## Decision

Introduce a **single-row, JSONB-backed settings store** that the application
reads through a caching `SettingsService` which **merges the DB row over env
defaults**. Secret fields are **encrypted at rest** via a domain `ISecretCipher`
port implemented in adapters.

### 1. Storage — one JSON field

- New table `admin_settings` (prefix `admin_`): `id (uuid pk)`,
  `value (jsonb, not null)`, `created_at`, `updated_at`. Exactly **one row**
  (singleton); the service always reads/writes that row.
- `value` holds the entire configuration object, validated by a zod schema in
  `packages/shared/src/schemas/app-settings.ts`. Initial sections:
  - `auth`: `{ method, enableMagicLink, enableEntra, allowRegistrationWithoutApproval }`
  - `ai`: `{ provider, defaultModel, temperature?, secrets: { anthropic?, openai?, mistral? } }`
  - (room for `general`, `email`, `maintenance` later — additive, defaulted)
- The schema provides a `defaultAppSettings(env)` factory so a missing section
  or field resolves to a typed default rather than `undefined`.

### 2. Precedence — DB overrides env, env seeds

- On first boot, an **idempotent seed** writes the singleton row from current
  env values (so existing deployments are unchanged in behaviour).
- At runtime the effective value = `merge(defaultsFromEnv, dbRow)` with the **DB
  row winning** field-by-field. Env is the fallback when a field is unset.
- Rationale over the alternatives: "env overrides DB" makes the admin UI feel
  read-only whenever an env var is set; "DB only" is a breaking change for
  current env-only deploys. DB-over-env keeps both worlds working and makes the
  UI authoritative once an admin touches a value.
- The UI surfaces the effective **source** per field ("from environment" vs
  "set in database") to avoid silent-drift confusion.

### 3. Secrets — encrypted at rest, masked in UI

- API keys live inside `ai.secrets` in the JSON but are stored **AES-256-GCM
  encrypted**. Encryption is a domain port `ISecretCipher`
  (`encrypt(plaintext) -> Result<string>`, `decrypt(ciphertext) -> Result<string>`)
  implemented in `packages/adapters` using Node `crypto`, keyed from a new env
  var `APP_SETTINGS_ENCRYPTION_KEY` (32-byte, base64).
- The settings router **never returns plaintext secrets**; it returns a masked
  presence flag (`"set"` / `"unset"`). Saving a blank secret leaves the stored
  value unchanged; saving a new value re-encrypts.
- Rationale over alternatives: plaintext-in-DB is the weakest option and was
  rejected; keeping keys only in env contradicts the explicit requirement that
  "which keys" be configurable from the settings card.

### 4. Resolution & refresh

- A `SettingsService` (in `packages/application`) caches the merged value and
  exposes typed getters; `save(patch)` validates, persists the merged JSON, and
  **invalidates the cache**.
- **AI config is resolved per-request**: the LLM adapter is selected from the
  current settings at call time (cheap), so provider/key/model changes take
  effect with no redeploy.
- **Auth-method changes**: Better Auth is comparatively expensive to construct.
  The container builds it from the settings-resolved auth section; on an auth
  settings change the auth instance is **rebuilt lazily on next use** (keyed by a
  settings version/`updated_at`). If verification in `node_modules/better-auth`
  shows rebuild is unsafe/costly, fall back to a **documented restart** for
  auth-method changes only — Build records which path was taken.

## Consequences

**Positive**

- One admin surface configures auth and AI; "stored in a json field" satisfied
  literally by `admin_settings.value`.
- Existing env-only deployments keep working (env seeds + fallback).
- Secrets are encrypted at rest and never leave the server in plaintext.
- The schema lives in `@rbrasier/shared`, so web, application, and installers
  share one definition.

**Negative**

- New env var `APP_SETTINGS_ENCRYPTION_KEY`; losing it makes stored keys
  unrecoverable (rotation is future work).
- A singleton JSON row needs section-scoped patching + an optimistic
  `updated_at` check to avoid concurrent-save clobbering.
- Auth-instance refresh adds a small amount of container complexity; per-request
  AI resolution adds a settings read per AI call (served from cache).
- Two sources of truth (env + DB) require the UI to show effective source.

## Enforcement

- `packages/domain` gets only the **ports** (`ISettingsRepository`,
  `ISecretCipher`) — no zod, no crypto. Schema in `@rbrasier/shared`; cipher and
  Drizzle repo in `@rbrasier/adapters`; merge/cache service in
  `@rbrasier/application`. ESLint boundary rules already enforce this.
- Result pattern on `ISettingsRepository` and `ISecretCipher`; never throw across
  the boundary.
- Build must **verify in `node_modules`**: Better Auth `sendResetPassword` /
  `forgetPassword` / `resetPassword` shapes and the cost/safety of rebuilding the
  auth instance; Node `crypto` GCM usage. Do not code these from memory.
- `apps/web/src/lib/env.ts` validates `APP_SETTINGS_ENCRYPTION_KEY` (base64,
  decodes to 32 bytes) — required in production, optional/generated in dev.
- The settings router redacts secrets; a test asserts ciphertext-in-DB and that
  the API response never contains a plaintext key.
