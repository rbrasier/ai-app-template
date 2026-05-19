# Patch: Fix init-project.sh cleanup of CI, validate.sh, and ESLint scope

**Version bump**: 1.0.8 → 1.0.9 (PATCH — bug fixes, no schema changes)

## Problem

Five categories of breakage affect every project bootstrapped via `npx create-ai-app-template` or `pnpm run init`:

1. **`release.yml` ships into the generated app.** It publishes packages to npm via Changesets and requires an `NPM_TOKEN` secret. Neither applies to a user's app — it is the framework's publishing pipeline. Every push to `main` in a fresh project fails because `NPM_TOKEN` doesn't exist.

2. **The `framework-updates` CI job is meaningless post-init.** It runs `./scripts/update-framework.sh --dry-run`, which only makes sense inside the template repo. In a bootstrapped app this script doesn't exist.

3. **The `coverage` CI job references hardcoded packages that don't exist post-init.** `pnpm --filter "@template/domain"` and `pnpm --filter "@template/application"` match nothing after `packages/` is removed, so the job silently passes without measuring any coverage.

4. **`validate.sh` includes seven checks that guard the template's publishing pipeline.** They reference `packages/adapters/package.json` or `restart.sh` internals that are either absent or irrelevant after init. They will either spuriously fail or produce misleading output in a bootstrapped app.

5. **The `no-restricted-imports` ESLint rule uses `@template/adapters` as the restricted scope.** The actual framework scope everywhere is `@rbrasier`, so the rule never fires — the application-layer architectural boundary silently disappears.

## Changes

### `scripts/init-project.sh` — new cleanup section

Add a dedicated "post-packages-removal cleanup" block immediately after `rm -rf packages/` that:

- Deletes `.github/workflows/release.yml`
- Strips the `coverage` and `framework-updates` jobs from `.github/workflows/ci.yml` using a Python one-liner (avoids brittle multiline sed)
- Removes seven sections from `validate.sh` and renumbers the remaining checks sequentially:
  - Remove: 11 (publishable packages), 12 (adapters peer dep semver), 16 (restart.sh adapters resolution guard), 17 (@opentelemetry/* placement), 19 (drizzle migrations in files), 20 (restart.sh runs migration from apps/api), 21 (restart.sh sets PGPASSWORD)
  - Renumber survivors: checks 1–10 stay the same; 13→11, 14→12, 15→13, 18→14

### `.eslintrc.cjs` — direct template fix

Replace `@template/adapters` with `@rbrasier/adapters` (and update the error message to match). This is a template-level bug — the framework scope has always been `@rbrasier` — so it should be fixed in the file directly rather than patched at init time. No init-script change needed for this file.

## Entities / use cases affected

- `scripts/init-project.sh` — bootstrap script only
- `.github/workflows/ci.yml` — modified at init time (coverage + framework-updates jobs removed)
- `.github/workflows/release.yml` — deleted at init time
- `validate.sh` — modified at init time (7 checks removed, remaining renumbered)
- `.eslintrc.cjs` — direct template fix (wrong scope corrected)

## DB changes

None.

## Tests

This change is to shell scripts and config — no unit-testable logic is introduced. Correctness is verified by:
1. Running `./validate.sh` on the template itself (must still pass all 21 checks)
2. Manually tracing the new init-script block to confirm it produces the correct output files

## Out of scope

Checks 5 (domain purity grep), 6 (table naming), 9 (health checker adapters), 14 (test files exist), and 15 (coverage thresholds) in `validate.sh` also reference `packages/` paths that won't exist post-init. Those silently pass (5, 6) or would fail (9, 14, 15) — addressing them is a separate concern not raised in this feedback and is deferred.

## Implementation Summary

**`scripts/init-project.sh`** — New "strip framework-internal CI artefacts and validate checks" block added immediately after `rm -rf packages/`. It:
- Deletes `.github/workflows/release.yml`
- Strips the `coverage` and `framework-updates` jobs from `.github/workflows/ci.yml` via Python regex (two-step: remove `coverage` block up to next job, then remove `framework-updates` block to EOF)
- Removes seven `validate.sh` sections ({11, 12, 16, 17, 19, 20, 21}) by splitting on section boundary markers, filtering, and rejoining; renumbers survivors (13→11, 14→12, 15→13, 18→14) using a two-pass placeholder strategy to avoid collision; asserts exactly 14 sections remain

**`.eslintrc.cjs`** — Direct template fix: `@template/adapters` → `@rbrasier/adapters` and error message updated to match. No init-script change needed since `@rbrasier` is the permanent framework scope.
