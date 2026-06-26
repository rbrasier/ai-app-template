# Phase v1.1.0 — Auth Methods, RBAC, and Navigation Progress

## Summary

Three cohesive front-door capabilities for the template:

1. **Auth** — make **email+password** the default method, with **magic-link** and
   **Entra (Azure AD OIDC)** as additive, independently-toggled options. Add the
   missing Better Auth `core_accounts` table. PKI/`none` retained.
2. **RBAC** — roles and capability-flag permissions. Seed `everyone` and `admin`;
   `admin` is an immutable wildcard sourced from `is_admin`. Admin UI at
   `/admin/roles` to create custom roles and toggle permissions.
3. **Navigation progress** — a 2px top bar shown while a route navigation is
   pending (prefetch → change), removing the "sticky link" feel.

See `docs/development/prd/auth-rbac-nav-setup.prd.md`, ADR-005, and ADR-006.

## Why

Email+password and an enterprise IdP are the two most-requested sign-in paths; a
single `is_admin` flag can't express "this user manages flags but not users"; and
prefetch-before-navigation gives no feedback. All three are at the entry point of
every app built from the template.

## Version Bump

`1.0.10` → `1.1.0` (MINOR — new features + DB schema change)

---

## Scope

### In scope

- `core_accounts` table (Better Auth `account` model) + migration.
- Composable `createAuth` per ADR-005: email+password base, optional magic-link,
  optional Entra `genericOAuth`; container maps legacy `AuthMethod` (pki/none).
- New env vars + validation: `AUTH_METHOD` default `email-password`,
  `AUTH_ENABLE_MAGIC_LINK`, `AUTH_ENABLE_ENTRA`, `ENTRA_CLIENT_ID`,
  `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID` (or `ENTRA_DISCOVERY_URL`).
- `/admin/login` gains email+password fields and conditional magic-link / Entra
  buttons; `auth-client.ts` gains the matching client plugins.
- RBAC domain (entities, ports, pure permission policy), application use cases,
  Drizzle repositories, idempotent seeding of roles + permission catalog.
- tRPC `role` router + `permissionProcedure(key)` factory; context carries
  effective permissions; `user` router exposes role assignment.
- `/admin/roles` page (list/create/edit/delete custom roles, locked admin row)
  and role assignment on `/admin/users`.
- Navigation progress bar mounted in the root layout via native `useLinkStatus`.
- Tests for every new adapter, use case, policy, and route; `.env.example`,
  **both installers** (`scripts/init-project.sh` and `packages/create`), and
  `VERSION`/`package.json` updated.

### Installer coverage (both bootstrappers)

The new configuration options must be selectable at project creation, in **both**
installers, which each carry their own auth prompt:

- `scripts/init-project.sh` — in-place bash initializer.
- `packages/create/src/index.ts` — the published `create-ai-app-template` npx
  bootstrapper (with `helpers.ts` / `helpers.test.ts`).

Both must:
1. Offer **email+password** as the default/first auth choice (replacing
   magic-link as the default), keeping `pki`, `pki-and-magic-link`, `none`,
   `other`, and the `google-oauth` stub.
2. When a credential base is chosen, prompt for additive options
   **magic-link** (y/N) and **Entra** (y/N), writing `AUTH_ENABLE_MAGIC_LINK`
   and `AUTH_ENABLE_ENTRA` to the generated `.env`/`.env.example`.
3. When Entra is enabled, prompt for `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and
   `ENTRA_CLIENT_SECRET` (secret may be left blank to fill in later) and write
   them, plus a warning to complete the Azure app registration and redirect URI.
4. Echo the resolved auth configuration in the pre-flight summary both
   installers already print.

`packages/create`'s `AuthMethod` type and the bash `case` mapping must both gain
`email-password`. `helpers.test.ts` is updated to cover the new env writes.

### Out of scope

- Password reset / email verification / account linking.
- `apps/api` (`/v1/*`) permission enforcement (stays admin-gated).
- Role hierarchies, row-level permissions, Entra tenant allowlist.
- `google-oauth` (remains a throwing stub).

---

## Architecture

### Auth config (ADR-005)

`createAuth` consumes a structured config:

```typescript
interface AuthMethodsConfig {
  readonly emailPassword: boolean;
  readonly magicLink?: { sendMagicLink: (p: { email: string; url: string }) => Promise<void> };
  readonly entra?: { clientId: string; clientSecret: string; discoveryUrl: string };
  readonly pki?: PkiConfig;
}
```

- `emailAndPassword: { enabled: true }` is set when `emailPassword` is true.
- `magicLink(...)` plugin added when `magicLink` present.
- `genericOAuth({ config: [{ providerId: "entra", ...discovery }] })` added when
  `entra` present. Discovery URL =
  `https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration`
  unless `ENTRA_DISCOVERY_URL` is set.
- The container builds `AuthMethodsConfig` from env, mapping legacy
  `AUTH_METHOD=pki|pki-and-magic-link|none` onto it so those paths are unchanged.

> **Build must verify in `node_modules/better-auth`**: the exact
> `emailAndPassword` option shape, `genericOAuth` plugin signature, the client
> plugins (`emailAndPasswordClient`/built-in, `genericOAuthClient`), and the
> Drizzle adapter's account-model field mapping. Do not code from memory.

### Account table (Better Auth `account` model)

`core_accounts`: `id (uuid pk)`, `user_id (fk core_users, cascade)`,
`account_id (text)`, `provider_id (text)`, `password (text, null)`,
`access_token (text, null)`, `refresh_token (text, null)`, `id_token (text, null)`,
`access_token_expires_at (timestamptz, null)`,
`refresh_token_expires_at (timestamptz, null)`, `scope (text, null)`,
`created_at`, `updated_at`. Map model→table/columns via the drizzle adapter's
schema mapping (verify the mapping mechanism in node_modules).

### RBAC (ADR-006)

- Domain entities: `Role { id, key, name, description, isSystem, ... }`,
  `Permission { id, key, description, ... }`; ports `IRoleRepository`,
  `IPermissionRepository`.
- Pure policy `services/permissions.ts`:
  `hasPermission(isAdmin, grantedKeys, required) => isAdmin || grantedKeys.includes(required)`.
- Effective permissions = union over the user's roles (+ `everyone`); admin =
  wildcard. Resolved in tRPC context.
- Seeding (`packages/adapters/src/auth/seed-rbac.ts`, idempotent): insert
  `everyone` (is_system, minimal perms) and `admin` (is_system, no stored perms —
  wildcard in code), and the permission catalog. Call from the container after
  migrations, next to `seedAdmin`.

**Permission catalog (initial):** `users.read`, `users.write`, `users.delete`,
`roles.read`, `roles.manage`, `flags.read`, `flags.manage`, `errors.read`,
`errors.manage`, `usage.read`, `settings.manage`.

### Navigation progress bar

- A `NavigationProgress` client component renders a fixed, top, `h-[2px]` bar.
- A `ProgressLink` wrapper around `next/link` uses **`useLinkStatus()`** (Next
  15.3+) to detect a link's pending state and drives the shared bar through
  context; the bar animates in on pending and out on completion.
- Mounted once in `apps/web/src/app/layout.tsx`. Admin/user nav links switch to
  `ProgressLink`.
- **Fallback** (only if `useLinkStatus` proves insufficient for a single global
  bar): the `@bprogress/next` library — note it in the implementation summary if
  used. Prefer the dependency-free native path.

---

## Sub-components (build order)

### 1. DB schema + migration
- Add `core_accounts`, `core_roles`, `core_permissions`, `core_role_permissions`,
  `core_user_roles` to `packages/adapters/src/db/schema/core.ts`.
- Generate + run the Drizzle migration. Export new tables from `schema/index.ts`.

### 2. RBAC domain (write tests first)
- `entities/role.ts`, `entities/permission.ts`; `ports/role-repository.ts`,
  `ports/permission-repository.ts`; `services/permissions.ts` (pure, unit-tested).
- Export from `packages/domain` index.

### 3. RBAC application use cases (tests first)
- `ListRoles`, `CreateRole`, `UpdateRole` (name/description/permission set),
  `DeleteRole` (reject `is_system`), `AssignRoleToUser`, `RemoveRoleFromUser`,
  `ListPermissions`, `GetUserPermissions`. Reject edits/deletes of the admin role.

### 4. RBAC adapters (tests first)
- `DrizzleRoleRepository`, `DrizzlePermissionRepository`, `seed-rbac.ts`.
- Export from `packages/adapters` index; wire into both app containers.

### 5. Auth refactor (tests first)
- Extend `core.ts` already done in step 1; update `better-auth.ts` to
  `AuthMethodsConfig`; add Entra/email+password/magic-link wiring.
- `env.ts`: new vars + zod refinement (Entra vars required iff enabled).
- `container.ts`: build `AuthMethodsConfig`; keep PKI/none mapping.
- `auth-client.ts`: add email+password and `genericOAuth` client plugins.

### 6. tRPC authorization
- `permissionProcedure(key)` factory in `server/trpc.ts`; extend context to
  resolve effective permissions; keep `adminProcedure`.
- New `server/routers/role.ts`; register in `server/router.ts`.
- Apply `permissionProcedure` to existing admin routers where a finer
  permission is appropriate (e.g. `flag.*` → `flags.manage`).

### 7. Web UI
- `/admin/login`: email+password form; conditional magic-link + Entra buttons
  (driven by a small `/api/auth/methods` or env-exposed flags).
- `/admin/roles/page.tsx`: list, create dialog with permission checkboxes, edit,
  delete; admin row locked (all checked, disabled).
- `/admin/users`: role assignment control. Add `Roles` link to admin nav.

### 8. Navigation progress bar
- `components/navigation-progress.tsx` + `components/progress-link.tsx`; mount in
  root layout; switch nav links to `ProgressLink`.

### 9. Config, installers, seeding wiring, docs, version
- `.env.example` new vars + comments.
- **`scripts/init-project.sh`**: email+password default; additive magic-link /
  Entra prompts; Entra OIDC fields; write the new env vars + summary line.
- **`packages/create/src/index.ts`** (+ `helpers.ts`/`helpers.test.ts`): same
  prompts; extend the `AuthMethod` type with `email-password`; write env
  replacements for the new vars; update the pre-flight summary.
- Call `seedRbac` in containers after migrations.
- Bump `VERSION` + root `package.json` to `1.1.0`; changeset entry.
- Move this phase doc to `docs/development/implemented/v1.1.0/` with an
  implementation summary when done.

---

## New Env Vars

| Var | Required when | Default | Notes |
|---|---|---|---|
| `AUTH_METHOD` | always | `email-password` | adds `email-password`; legacy values retained |
| `AUTH_ENABLE_MAGIC_LINK` | optional | `false` | additive to email+password |
| `AUTH_ENABLE_ENTRA` | optional | `false` | additive; enables OIDC button |
| `ENTRA_CLIENT_ID` | `AUTH_ENABLE_ENTRA=true` | — | Azure app registration client id |
| `ENTRA_CLIENT_SECRET` | `AUTH_ENABLE_ENTRA=true` | — | client secret |
| `ENTRA_TENANT_ID` | `AUTH_ENABLE_ENTRA=true` (unless discovery url set) | — | builds discovery URL |
| `ENTRA_DISCOVERY_URL` | optional override | derived | full OIDC discovery URL |

---

## Acceptance Criteria

- [ ] `AUTH_METHOD=email-password` (default): sign-up + sign-in with
      email+password works; credential row in `core_accounts`.
- [ ] `AUTH_ENABLE_MAGIC_LINK=true`: magic-link option works alongside password.
- [ ] `AUTH_ENABLE_ENTRA=true` + Entra vars: Entra OIDC flow authenticates a user;
      account row stored with `provider_id = "entra"`.
- [ ] `AUTH_METHOD=magic-link|pki|pki-and-magic-link|none` behaviour unchanged.
- [ ] Env validation fails fast if `AUTH_ENABLE_ENTRA=true` without Entra vars.
- [ ] Fresh DB seeds `everyone` + `admin` (both is_system); re-running seed is a
      no-op.
- [ ] Admin creates a custom role with chosen permissions via `/admin/roles`.
- [ ] `admin` role renders all-checked + disabled; edit/delete rejected in UI and
      use case; `is_system` roles cannot be deleted.
- [ ] User with `flags.manage` passes `flag.*`; user without it gets `FORBIDDEN`;
      admin passes every `permissionProcedure`.
- [ ] Clicking a nav link shows a 2px top bar while pending; it clears on render.
- [ ] All new domain/application/adapter code has tests written before
      implementation.
- [ ] `./validate.sh` passes; `VERSION` and `package.json` both `1.1.0`.

---

## Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Better Auth account-model field mapping differs from assumption | Medium | High | Verify the drizzle adapter mapping in `node_modules` before writing schema; add an integration test that signs up + reads `core_accounts` |
| Entra discovery/redirect URI misconfig | Medium | Medium | Document redirect URI (`/api/auth/oauth2/callback/entra` or the verified path); derive discovery URL from tenant; fail-fast env validation |
| `genericOAuth` API shape assumed wrong | Medium | High | Confirm plugin + client signatures in node_modules; do not code from training data |
| Global 2px bar from per-link `useLinkStatus` is awkward | Medium | Low | `ProgressLink` + context; documented `@bprogress/next` fallback |
| `is_admin`/admin-role drift | Low | Medium | Single source of truth (`is_admin`); admin role is virtual + immutable (ADR-006) |
| Existing users lack `core_accounts` rows | High | Low | Email+password is additive; documented; no back-fill needed |
| Permission checks add a per-request query | Medium | Low | Reuse the existing session lookup; join roles in one query; cache later if needed |

---

## Tests (representative)

| File | Covers |
|---|---|
| `packages/domain/src/services/permissions.test.ts` | admin wildcard, union, deny |
| `packages/application/src/use-cases/create-role.test.ts` etc. | CRUD, reject system/admin edits |
| `packages/adapters/src/auth/__tests__/seed-rbac.test.ts` | idempotent seed of roles + catalog |
| `packages/adapters/src/repositories/__tests__/drizzle-role-repository.test.ts` | persistence, joins |
| `packages/adapters/src/auth/__tests__/better-auth-methods.test.ts` | correct plugins per config |
| `apps/web/src/server/routers/__tests__/role.test.ts` | role router authz, permissionProcedure |
| `apps/web` login/route tests | email+password sign-in, Entra start, account row |

---

## Files Changed (indicative)

| File | Change |
|---|---|
| `packages/adapters/src/db/schema/core.ts` | 5 new tables |
| `packages/adapters/src/db/schema/index.ts` | export new tables |
| `packages/adapters/src/db/migrations/<ts>.sql` | migration |
| `packages/adapters/src/auth/better-auth.ts` | `AuthMethodsConfig`, email+password/magic-link/Entra |
| `packages/adapters/src/auth/seed-rbac.ts` | New |
| `packages/adapters/src/repositories/drizzle-role-repository.ts` | New |
| `packages/adapters/src/repositories/drizzle-permission-repository.ts` | New |
| `packages/adapters/src/index.ts` | exports |
| `packages/domain/src/entities/{role,permission}.ts` | New |
| `packages/domain/src/ports/{role,permission}-repository.ts` | New |
| `packages/domain/src/services/permissions.ts` | New |
| `packages/domain/src/index.ts` | exports |
| `packages/application/src/use-cases/*role*.ts` + index | New use cases |
| `apps/web/src/lib/env.ts` | new auth env + refinement |
| `apps/web/src/lib/container.ts` | `AuthMethodsConfig`, seedRbac, role use cases |
| `apps/web/src/lib/auth-client.ts` | client plugins |
| `apps/web/src/server/trpc.ts` | `permissionProcedure`, permissions in context |
| `apps/web/src/server/routers/role.ts` + `router.ts` | New router |
| `apps/web/src/app/(admin)/admin/login/page.tsx` | email+password + buttons |
| `apps/web/src/app/(admin)/admin/roles/page.tsx` | New page |
| `apps/web/src/app/(admin)/admin/users/page.tsx` | role assignment |
| `apps/web/src/app/(admin)/admin/layout.tsx` | Roles nav link |
| `apps/web/src/app/layout.tsx` | mount nav progress |
| `apps/web/src/components/{navigation-progress,progress-link}.tsx` | New |
| `apps/api/src/container.ts` | seedRbac + role repos |
| `.env.example` | new vars |
| `scripts/init-project.sh` | email+password default; magic-link/Entra prompts; Entra fields; env writes |
| `packages/create/src/index.ts` | `AuthMethod` += `email-password`; new prompts + env replacements |
| `packages/create/src/helpers.ts` (+ `.test.ts`) | env-write helpers for new auth vars |
| `VERSION`, `package.json`, `.changeset/*` | `1.1.0` + changeset |
