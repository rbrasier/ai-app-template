# v1.1.0 — Implementation Summary

Implements `auth-rbac-nav-setup.phase.md` (PRD `auth-rbac-nav-setup.prd.md`,
ADR-005, ADR-006). Version bump: **MINOR** (`1.0.10` → `1.1.0`) — new features +
DB schema change.

## What was built

### 1. Composable authentication
- `AUTH_METHOD` default flipped `magic-link` → `email-password`; enum gained
  `email-password`. Legacy `magic-link`, `pki`, `pki-and-magic-link`, `none`,
  `other`, `google-oauth` retained.
- `createAuth` now takes `AuthMethodsConfig` (`emailPassword` base + optional
  `magicLink` and `entra`). Entra uses Better Auth's `microsoftEntraId`
  (`genericOAuth`, providerId `microsoft-entra-id`).
- New `core_accounts` table (Better Auth `account` model). Added
  `email_verified`/`image` to `core_users` and `ip_address`/`user_agent` to
  `core_sessions`. Better Auth wired to the prefixed snake_case schema via a
  drizzle `schema` map + per-model `fields` mapping.
- Env: `AUTH_ENABLE_MAGIC_LINK`, `AUTH_ENABLE_ENTRA`, `ENTRA_TENANT_ID`,
  `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (required-when-enabled refinement).
- Login page is now a server component resolving enabled methods → a client
  form with password (sign-in/sign-up), magic-link, and Microsoft buttons.

### 2. Roles & permissions (RBAC)
- Domain: `Role`/`Permission` entities, `IRoleRepository`/`IPermissionRepository`
  ports, pure `hasPermission` policy + `PERMISSION_CATALOG`.
- Application: `ListRoles`, `CreateRole`, `UpdateRole`, `DeleteRole`,
  `AssignRoleToUser`, `RemoveRoleFromUser`, `GetUserPermissions`,
  `ListPermissions`. Admin role rejects edits; system roles reject deletes;
  unknown permission keys rejected.
- Adapters: `DrizzleRoleRepository`, `DrizzlePermissionRepository`, idempotent
  `seedRbac` (everyone + admin + catalog), run at startup via
  `instrumentation.ts`.
- tRPC: `permissionProcedure(key)` middleware; context resolves effective
  permissions (admin = wildcard); `role` router; `/admin/roles` admin UI with
  the admin role rendered locked.
- Tables: `core_roles`, `core_permissions`, `core_role_permissions`,
  `core_user_roles`.

### 3. Navigation progress bar
- `NavigationProgressProvider` renders one fixed 2px top bar; `ProgressLink`
  wraps `next/link` and reports `useLinkStatus` to a shared context. Mounted in
  the root layout; admin nav switched to `ProgressLink`. No new dependency.

### 4. Dependency remediation (pre-existing audit failures)
- `validate.sh` section 13 (`pnpm audit --audit-level=high`) failed on the base
  branch. Pinned via `pnpm.overrides`: vitest/coverage-v8 → v4, vite → ^6.4.3,
  better-auth → >=1.6.11, @grpc/grpc-js → >=1.14.4, protobufjs → >=7.6.1. All
  suites pass under vitest 4.

## Migrations
- `0004_lame_dexter_bennett.sql` — RBAC tables.
- `0005_green_ender_wiggin.sql` — `core_accounts` + auth columns.

## Files
See the phase doc's "Files Changed" table; all sub-components landed.

## Known limitations
- Runtime auth flows (email+password sign-in, Entra OIDC round-trip) and DB
  seeding were verified by typecheck/unit tests and Better Auth API inspection
  in `node_modules`, not against a live Postgres + running app in this session.
- `apps/api` (`/v1/*`) remains admin-gated; full RBAC parity there is future work.
- Password reset / email verification / account linking are out of scope.
- The 2px bar is wired to admin nav links via `ProgressLink`; other links can
  opt in by swapping `next/link` for `ProgressLink`.
