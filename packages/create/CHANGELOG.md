# create-ai-app-template

## 0.5.0

### Minor Changes

- 96885c0: Auth front-door pages and a runtime admin settings store.
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

- 88cbb79: Auth methods, RBAC, and navigation progress.
  - Auth: email+password is the new default, with magic-link and Microsoft Entra
    (Azure AD OIDC) as additive options that can run alongside it. Adds the
    Better Auth `core_accounts` table and snake_case field mapping.
  - RBAC: roles and capability-flag permissions. Seeds `everyone` and `admin`
    (admin is an immutable wildcard sourced from `is_admin`). Admin UI at
    `/admin/roles` to create custom roles; tRPC `permissionProcedure` gating.
  - Navigation: a 2px top progress bar shown during prefetch-before-navigation.
  - Both installers (`init-project.sh` and `create-ai-app-template`) prompt for
    the new auth options.

## 0.4.3

### Patch Changes

- bd560c9: Deployment

## 0.4.2

### Patch Changes

- a67c8a1: Fix for empty folder check

## 0.4.1

### Patch Changes

- 7a85d30: Make template command public

## 0.4.0

### Minor Changes

- d122762: First publish
