---
"@rbrasier/domain": minor
"@rbrasier/shared": minor
"@rbrasier/application": minor
"@rbrasier/adapters": minor
"@rbrasier/web": minor
"create-ai-app-template": minor
---

Auth front-door pages and a runtime admin settings store.

- Auth pages: standalone `/login`, `/register`, `/reset-password` (+
  `/reset-password/[token]`) on a shared email+password form; `/admin/login`
  redirects to `/login?next=/admin`. Adds the Better Auth password-reset flow
  (logging mailer stub) and a registration-approval gate via
  `core_users.status` (`active` / `pending` / `rejected`). New sign-ups land
  `pending` unless approval is disabled; session creation is blocked for
  non-active accounts. `/admin/users` gains a pending-approval queue and a
  status column.
- Settings store: `admin_settings` table with grouped jsonb columns
  (`login_settings`, `ai_configuration`, `extended_settings`). `/admin/settings`
  edits Login Methods and AI Configuration; DB overrides env and env is the
  fallback (seeded on first boot). AI provider/keys switch with no redeploy.
- Secrets: AES-256-GCM `AesSecretCipher` keyed by `APP_SETTINGS_ENCRYPTION_KEY`;
  the settings API returns `set`/`unset`, never plaintext.
- Both installers write `APP_SETTINGS_ENCRYPTION_KEY` and note that runtime
  config now lives at `/admin/settings`.
