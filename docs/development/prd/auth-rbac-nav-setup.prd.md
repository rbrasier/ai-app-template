# PRD — Auth Methods, RBAC, and Navigation Progress Setup

- **Status**: Draft
- **Date**: 2026-06-26
- **Author**: richy.brasier
- **Target version**: 1.1.0 (bump: MINOR — new features + DB schema change; see `docs/guides/versioning.md`)

## 1. Problem

The template ships only magic-link and PKI authentication, with no
email+password and no enterprise IdP path — the two most common requests for a
new app. Authorization is a single `is_admin` boolean, so there is no way to
grant a subset of capabilities to a non-admin user. And tRPC/React Query
prefetch happens before the route actually changes, so a clicked link can look
"stuck" with no visible feedback. These three gaps all sit at the front door of
every app built from the template.

## 2. Users / Personas

- **App developer** (bootstraps a project) — needs a sensible default sign-in
  (email+password) and a one-flag path to add magic-link or Entra without
  rewriting auth wiring.
- **End user** — signs in with email+password, optionally a magic link, or
  their Microsoft/Entra work account; sees immediate feedback when navigating.
- **Administrator** — manages roles and per-role permissions from an admin
  page; is themselves immutable (admin always has every permission).

## 3. Goals

- A new project authenticates with **email+password by default**, with
  **magic-link** and **Entra (Azure AD OIDC)** available as additive options.
- Multiple methods can be enabled **simultaneously** (e.g. email+password and
  Entra) without code changes — configuration only.
- Two seeded roles exist on a fresh database: **`everyone`** (base role,
  assigned to every user) and **`admin`** (immutable, holds all permissions).
- An admin can **create custom roles** and toggle their permissions from a UI;
  the admin role is shown locked and cannot be edited or deleted.
- A **2px top progress bar** appears while a navigation is pending (prefetch →
  route change) and disappears on completion, preventing "sticky links".
- Existing magic-link, PKI, and `none` deployments continue to work unchanged.

## 4. Non-goals

- Password reset / email verification flows (email+password ships with a
  minimal sign-in/sign-up; recovery is future work).
- Fine-grained, per-resource (row-level) authorization — permissions are
  capability flags, not object ACLs.
- SAML federation for Entra (OIDC only, per decision in ADR-005).
- Multi-tenancy or role hierarchies/inheritance.
- Replacing PKI; it remains a separate, still-supported method.

## 5. Key entities

| Entity | Lives in | New / existing | Notes |
| ------ | -------- | -------------- | ----- |
| `Role` | `packages/domain/src/entities/role.ts` | new | `key`, `name`, `description`, `isSystem` |
| `Permission` | `packages/domain/src/entities/permission.ts` | new | `key`, `description`; seeded catalog |
| `IRoleRepository` | `packages/domain/src/ports/role-repository.ts` | new | Result-pattern CRUD + permission assignment |
| `IPermissionRepository` | `packages/domain/src/ports/permission-repository.ts` | new | list catalog |
| Permission policy | `packages/domain/src/services/permissions.ts` | new | pure `hasPermission` + admin-wildcard rule |
| `User` | `packages/domain/src/entities/user.ts` | existing | unchanged; `isAdmin` becomes the admin-role source of truth |
| Account (Better Auth) | `packages/adapters/src/db/schema/core.ts` | new table `core_accounts` | required for email+password and OAuth |

## 6. User stories

1. As a developer, I set `AUTH_METHOD=email-password` (the new default) and get
   a working email+password sign-in with no further wiring.
2. As a developer, I set `AUTH_ENABLE_ENTRA=true` plus the Entra OIDC env vars
   and an Entra sign-in button appears alongside email+password.
3. As an end user, I sign in with my Microsoft work account via Entra.
4. As an admin, I open `/admin/roles`, create a role "editor", and tick the
   `flags.manage` and `errors.read` permissions.
5. As an admin, I assign the "editor" role to a user; that user can now manage
   flags but not users.
6. As an admin, I see the `admin` role listed with all permissions checked and
   disabled — I cannot edit or delete it.
7. As any user, when I click a nav link a 2px bar animates at the top until the
   destination renders.

## 7. Pages / surfaces affected

- `/admin/login` — gains email+password fields and (when enabled) magic-link
  and Entra buttons.
- `/admin/roles` — **new** page: list roles, create/edit custom roles with
  permission checkboxes, delete non-system roles.
- `/admin/users` — gains role assignment per user.
- `apps/web/src/app/layout.tsx` — mounts the navigation progress bar.
- tRPC: **new** `role` router (`list`, `create`, `update`, `delete`,
  `listPermissions`, `assignToUser`); `user` router gains role data.
- tRPC context/`trpc.ts` — adds a `permissionProcedure(key)` middleware factory;
  context carries the caller's resolved permissions.
- `apps/api` — `/v1/*` unchanged in this phase (RBAC is enforced in the web/tRPC
  layer first; API parity is future work, see §11).
- **Installers** — both `scripts/init-project.sh` and `packages/create`
  (`create-ai-app-template`) gain prompts for the new auth options
  (email+password default; magic-link/Entra toggles; Entra OIDC fields) and
  write the corresponding env vars.

## 8. Database changes

| Table | Change | Prefix valid? |
| ----- | ------ | ------------- |
| `core_accounts` | NEW — Better Auth account model (password hash, OAuth tokens) | yes (core_) |
| `core_roles` | NEW — `id, key (unique), name, description, is_system, timestamps` | yes (core_) |
| `core_permissions` | NEW — `id, key (unique), description, timestamps` | yes (core_) |
| `core_role_permissions` | NEW — join `role_id, permission_id` | yes (core_) |
| `core_user_roles` | NEW — join `user_id, role_id` | yes (core_) |
| `core_users` | unchanged columns; `is_admin = true` is treated as admin-role membership | n/a |

All new tables carry `id` (uuid), `created_at`, `updated_at` per the database
conventions. A Drizzle migration accompanies the schema change. A seeding step
(idempotent) inserts the `everyone` and `admin` roles and the permission
catalog.

## 9. Architectural decisions

- **ADR-005 — Composable auth methods**: replace the single-method
  discriminated union with a composable config so email+password can run
  alongside magic-link and/or Entra; Entra via Better Auth `genericOAuth`
  (OIDC, not SAML). PKI/`none` retained.
- **ADR-006 — RBAC roles & permissions**: roles → permissions (capability
  flags); `everyone` base role; `admin` as an immutable wildcard sourced from
  `core_users.is_admin`; permission checks union the user's roles.
- Navigation progress bar: no ADR — uses Next's native `useLinkStatus`, no new
  dependency, no boundary impact.

## 10. Acceptance criteria

- [ ] With `AUTH_METHOD=email-password` (default), a user can sign up and sign in
      with email+password; the credential is stored in `core_accounts`.
- [ ] With `AUTH_ENABLE_MAGIC_LINK=true`, the magic-link option appears and works
      alongside email+password.
- [ ] With `AUTH_ENABLE_ENTRA=true` and Entra env vars set, an Entra button
      starts the OIDC flow and a returning user lands authenticated; their
      account row is stored in `core_accounts` with `provider_id = "entra"`.
- [ ] Existing `AUTH_METHOD=magic-link`, `pki`, `pki-and-magic-link`, and `none`
      behaviour is unchanged.
- [ ] A fresh database seeds exactly two roles: `everyone` (is_system) and
      `admin` (is_system); seeding is idempotent on re-run.
- [ ] An admin can create a custom role with a chosen permission set via
      `/admin/roles`, and it persists.
- [ ] The `admin` role renders with all permissions checked and disabled;
      attempts to edit or delete it (UI and tRPC) are rejected.
- [ ] System roles (`everyone`, `admin`) cannot be deleted.
- [ ] A non-admin user holding a role with `flags.manage` can call
      `flag.*` mutations but a user without it receives `FORBIDDEN`.
- [ ] An admin (`is_admin = true`) passes every `permissionProcedure` check
      regardless of role assignments.
- [ ] Clicking a nav link shows a 2px top bar within ~100ms of the pending
      state and removes it once the destination renders.
- [ ] `./validate.sh` passes with zero errors; `VERSION` and root
      `package.json` both read `1.1.0`.

## 11. Out of scope / future work

- Password reset, email verification, and account-linking flows.
- Enforcing the same permission checks in `apps/api` (`/v1/*`) — currently
  admin-gated only; full RBAC parity is a follow-up.
- Role inheritance / hierarchies and per-object (row-level) permissions.
- An allowlist restricting which Entra tenants/users may provision (JIT today).
- Audit-logging role/permission changes (hook into existing `core_audit_log`).

## 12. Risks / open questions

- **Account table back-fill**: existing magic-link/PKI users have no
  `core_accounts` row. Email+password is additive, so this is fine, but a user
  who only ever used magic-link cannot "also" use a password until they set one.
  Acceptable for a template; documented.
- **`is_admin` vs admin role duplication**: kept as a single source of truth
  (`is_admin`) to avoid drift; the admin role is virtual/immutable. Confirm this
  over introducing a real editable admin-role row (ADR-006 picks the former).
- **Entra env naming**: `ENTRA_TENANT_ID` + derived discovery URL vs. an
  explicit `ENTRA_DISCOVERY_URL`. ADR-005 supports both; tenant-id is the
  documented default.
- **Nav bar scope**: `useLinkStatus` is per-`<Link>`. A shared top bar needs a
  small `ProgressLink` wrapper + context. If app-wide adoption is undesirable, a
  library (`@bprogress/next`) is the fallback — flagged in the phase doc.
- Build must verify exact Better Auth (`emailAndPassword`, `genericOAuth`,
  account model field mapping) and Next (`useLinkStatus`) APIs in
  `node_modules` before coding — do not rely on training data.
