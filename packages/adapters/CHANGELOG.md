# @rbrasier/adapters

## 1.0.3

### Patch Changes

- bd560c9: Deployment
- Updated dependencies [bd560c9]
  - @rbrasier/domain@1.0.3
  - @rbrasier/shared@1.0.3

## 1.0.2

### Patch Changes

- 4ce5d72: Fix scaffolded-project migrations and OTel startup crash.
  - Export `runMigrations(databaseUrl)` from `@rbrasier/adapters/db` so
    `restart.sh` can apply migrations without `drizzle-kit` or a workspace
    package filter.
  - Add `drizzle` to `files` so migration SQL files are included in the
    published package.
  - Move `@opentelemetry/*` packages from `peerDependencies` to `dependencies`
    so they are installed automatically when `@rbrasier/adapters` is consumed
    as an npm package (fixes `ERR_MODULE_NOT_FOUND` on startup in scaffolded
    projects).

## 1.0.0

### Minor Changes

- d122762: First publish

### Patch Changes

- Updated dependencies [d122762]
  - @rbrasier/domain@1.0.0
  - @rbrasier/shared@1.0.0
