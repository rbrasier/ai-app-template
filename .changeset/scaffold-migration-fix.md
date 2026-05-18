---
"@rbrasier/adapters": patch
---

Fix scaffolded-project migrations and OTel startup crash.

- Export `runMigrations(databaseUrl)` from `@rbrasier/adapters/db` so
  `restart.sh` can apply migrations without `drizzle-kit` or a workspace
  package filter.
- Add `drizzle` to `files` so migration SQL files are included in the
  published package.
- Move `@opentelemetry/*` packages from `peerDependencies` to `dependencies`
  so they are installed automatically when `@rbrasier/adapters` is consumed
  as an npm package (fixes `ERR_MODULE_NOT_FOUND` on startup in scaffolded
  projects).
