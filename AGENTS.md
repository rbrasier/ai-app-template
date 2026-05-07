# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

This is a pnpm-workspaces + Turborepo monorepo. See `README.md` for stack details and repo layout.

### Services

| Service | Port | How to start |
|---------|------|-------------|
| PostgreSQL (pgvector) | 5432 | `docker compose up -d postgres` |
| Next.js web app | 3000 | `pnpm turbo dev` (starts both) |
| Express API | 3001 | `pnpm turbo dev` (starts both) |

### Running dev servers

**Important:** Turbo v2 uses strict env mode by default and does not pass shell environment variables to child processes. You must use `--env-mode=loose` when running `pnpm turbo dev`:

```bash
set -a && source .env && set +a
pnpm turbo dev --env-mode=loose
```

Alternatively, the `restart.sh` script handles env loading, migrations, and startup — but also strips env vars via turbo unless patched. The same `--env-mode=loose` workaround applies.

### Database setup

1. Start Postgres: `docker compose up -d postgres`
2. The Drizzle migration journal ships empty. On first setup, push schema directly:
   ```bash
   pnpm build  # builds all packages first (needed for drizzle-kit to resolve .js imports)
   cd packages/adapters && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/template \
     npx drizzle-kit push --schema=./dist/db/schema/index.js --dialect=postgresql \
     --url=postgresql://postgres:postgres@localhost:5432/template
   ```
3. After initial push, `pnpm db:migrate` works for subsequent migrations.

### Lint / typecheck / test

```bash
pnpm lint       # ESLint across all packages
pnpm typecheck  # TypeScript noEmit check
pnpm test       # Vitest across all packages
./validate.sh   # all checks + architecture validation
```

### Environment variables

Copy `.env.example` to `.env` and fill in `BETTER_AUTH_SECRET` (32-byte hex string). `DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:5432/template`. An `ANTHROPIC_API_KEY` (or another AI provider key) is needed for the `/sample` AI streaming demo but not for core app functionality.

### Docker in Cloud Agent VMs

Docker requires special configuration in Cloud Agent VMs (fuse-overlayfs storage driver, iptables-legacy). The dockerd must be started with `sudo dockerd &` and the socket needs `sudo chmod 666 /var/run/docker.sock` for non-root access.
