#!/usr/bin/env bash
# restart.sh — kill dev ports, run pending migrations, start all services via Turbo.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

WEB_PORT=${WEB_PORT:-3000}
API_PORT=${API_PORT:-3001}

echo "→ killing anything on ports $WEB_PORT and $API_PORT"
for port in "$WEB_PORT" "$API_PORT"; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  stopping $pids on :$port"
    kill -9 $pids 2>/dev/null || true
  fi
done

echo "→ installing dependencies"
pnpm install

echo "→ running pending migrations"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
pnpm --filter @template/adapters db:migrate || {
  echo "  migration failed — fix DATABASE_URL or run 'docker compose up -d postgres' first"
  exit 1
}

echo "→ starting dev servers (Ctrl-C to stop)"
exec pnpm turbo dev
