# Implementation Summary — v1.0.10 Auth Method: none

**Version bump:** 1.0.9 → 1.0.10 (PATCH — no DB schema changes)

## What was built

Added `none` as a valid `AUTH_METHOD` option. When selected, the middleware
short-circuits all authentication checks and all routes (including `/admin/*`)
are publicly accessible with no session required. Intended for local
development, internal tools, or deployments where network perimeter controls
access.

## Files modified

| Path | Change |
|---|---|
| `packages/adapters/src/auth/better-auth.ts` | Added `{ readonly type: "none" }` to `AuthMethod` union |
| `apps/web/src/lib/env.ts` | Added `"none"` to `AUTH_METHOD` Zod enum |
| `apps/web/src/lib/container.ts` | Added `case "none"` to authMethod factory switch |
| `apps/web/src/middleware.ts` | Early `NextResponse.next()` return when `AUTH_METHOD === "none"` |
| `scripts/init-project.sh` | Added option 6 for `none`; warning when selected |
| `packages/create/src/index.ts` | Added `authMethod` select prompt; wired through `ScaffoldOptions` and `envReplacements` |
| `.env.example` | Updated `AUTH_METHOD` comment to include `none` |
| `VERSION` | 1.0.9 → 1.0.10 |
| `package.json` | 1.0.9 → 1.0.10 |
