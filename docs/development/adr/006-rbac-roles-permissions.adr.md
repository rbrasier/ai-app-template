# ADR-006 — RBAC: Roles & Permissions with an Immutable Admin

- **Status**: Accepted
- **Date**: 2026-06-26

## Context

Authorization today is a single `core_users.is_admin` boolean, surfaced through
`resolveSession` and the tRPC `adminProcedure`. There is no way to grant a
non-admin user a subset of capabilities. The requirement is: two seeded roles
(`everyone`, `admin`), an admin UI to create custom roles with customizable
permissions, and an `admin` role that holds **all** permissions and **cannot be
changed**.

Two modelling questions drive this ADR: (1) what is a permission, and (2) where
does "admin has everything, immutably" live.

## Decision

Adopt **role-based access control with capability-flag permissions**, enforced in
the domain and the tRPC layer.

### Model

- **Permission** = a capability flag with a stable `key`, e.g. `users.write`,
  `roles.manage`, `flags.manage`, `errors.read`, `usage.read`,
  `settings.manage`. Permissions are a seeded catalog, not user-created.
- **Role** = a named set of permissions. `key` is unique; `is_system` marks the
  two seeded roles. Custom roles are created by admins.
- **Assignment**: users have zero or more roles (`core_user_roles`). Every user
  is implicitly a member of `everyone`; `everyone` is assigned by default and
  carries a minimal permission set.
- A user's effective permissions = the **union** of permissions across all
  assigned roles (plus `everyone`).

### Tables (all `core_` — identity/access is core)

- `core_roles` — `id, key, name, description, is_system, timestamps`
- `core_permissions` — `id, key, description, timestamps`
- `core_role_permissions` — `role_id, permission_id`
- `core_user_roles` — `user_id, role_id`

### Admin is an immutable wildcard

- `core_users.is_admin = true` **is** admin-role membership — the single source
  of truth. We do **not** store admin→permission rows.
- The domain policy short-circuits: an admin satisfies **every** permission
  check. The admin role is presented in the UI with all permissions checked and
  disabled.
- Editing or deleting the `admin` role, and deleting any `is_system` role, is
  rejected in the use case (not just the UI).

### Enforcement points

- `packages/domain/src/services/permissions.ts` — pure
  `hasPermission(isAdmin, grantedPermissionKeys, required)` with the admin
  wildcard. No I/O.
- tRPC: a `permissionProcedure(key)` middleware factory built on
  `publicProcedure`; the context resolves the caller's permission set (admin →
  wildcard). `adminProcedure` remains for admin-only surfaces.
- `resolveSession` / tRPC context is extended to carry the caller's effective
  permissions alongside `isAdmin`.

## Consequences

**Positive**

- Non-admin users can be granted precise capabilities without touching code.
- A single source of truth for "is admin" avoids drift between `is_admin` and a
  role row.
- Domain policy is pure and unit-testable with no database.

**Negative**

- Permission keys are coupled to features; adding a capability means adding a
  catalog entry and a check. Acceptable and explicit.
- Effective-permission resolution adds a query per request (mitigated by the
  existing per-request session lookup; can be joined/cached later).
- `apps/api` is not yet permission-aware (admin-gated only) — parity is future
  work, called out in the PRD.

## Enforcement

- Use cases reject mutating/deleting system roles and the admin role — covered
  by tests.
- `validate.sh` table-prefix and `id/created_at/updated_at` conventions apply to
  all four new tables.
- The Result pattern is preserved across all new ports and use cases; nothing
  throws across the domain boundary.
