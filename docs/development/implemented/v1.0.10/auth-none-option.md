# Auth Method: none

## Version Bump
PATCH — 1.0.9 → 1.0.10 (no DB schema changes)

## What & Why
Add `none` as a valid value for `AUTH_METHOD`. When selected, the middleware
skips all authentication checks and all `/admin/*` routes are publicly
accessible with no session required. Intended for local development, internal
tools, or deployments where the network perimeter provides access control.

## Affected Files

### `packages/adapters/src/auth/better-auth.ts`
- Extend `AuthMethod` union with `{ readonly type: "none" }`.
- `createAuth` treats `none` the same as `other`: no plugins, no error thrown.
  Better Auth is still initialised so the `/api/auth/*` routes remain mounted.

### `apps/web/src/lib/env.ts`
- Add `"none"` to the `AUTH_METHOD` z.enum values.

### `apps/web/src/lib/container.ts`
- Add `case "none": return { type: "none" as const }` to the `authMethod`
  factory switch.

### `apps/web/src/middleware.ts`
- When `AUTH_METHOD === "none"` return `NextResponse.next()` immediately,
  skipping all session and redirect logic for `/admin/*` routes.

### `scripts/init-project.sh`
- Add option `6) none (no authentication — all routes public)` to the auth
  method prompt.
- Map choice `6` → `AUTH_METHOD="none"`.
- When `AUTH_METHOD=none`, add a warning that all admin routes are unprotected.

### `packages/create/src/index.ts`
- Add `authMethod` prompt (select, after AI provider) to `collectInputs`.
- Add `authMethod` to `ScaffoldOptions` and the Summary display.
- Include `AUTH_METHOD` in `envReplacements` so `.env` is written correctly.
- Add `none` option to the choices list, labelled "None (all routes public)".

### `.env.example`
- Update the `AUTH_METHOD` comment line to include `none`:
  `# AUTH_METHOD options: magic-link | pki | pki-and-magic-link | google-oauth | other | none`

## Acceptance Criteria
1. `AUTH_METHOD=none` passes Zod validation in `env.ts`.
2. `AuthMethod` type includes `{ type: "none" }`.
3. Middleware with `AUTH_METHOD=none` returns `NextResponse.next()` for all
   `/admin/*` paths (no redirect, no session check).
4. `init-project.sh` offers option 6 and sets `AUTH_METHOD=none` in `.env.example`.
5. `packages/create` prompts for auth method including `none`, writes correct
   `.env`.
6. `validate.sh` passes on 1.0.10.
