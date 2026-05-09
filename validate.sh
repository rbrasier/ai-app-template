#!/usr/bin/env bash
# validate.sh — runs every check that must pass before any change can ship.
#
# Exits non-zero on any failure. Each check prints PASS / FAIL.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}PASS${NC} — $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}FAIL${NC} — $1"; FAIL=$((FAIL + 1)); }
section() { echo; echo -e "${YELLOW}── $1 ──${NC}"; }

# ── 1. typecheck ──────────────────────────────────────────────────────────────
section "1. pnpm typecheck"
if pnpm -s typecheck; then pass "typecheck"; else fail "typecheck"; fi

# ── 2. lint ───────────────────────────────────────────────────────────────────
section "2. pnpm lint"
if pnpm -s lint; then pass "lint"; else fail "lint"; fi

# ── 3. tests ──────────────────────────────────────────────────────────────────
section "3. pnpm test"
if pnpm -s test; then pass "tests"; else fail "tests"; fi

# ── 4. drizzle schema check ───────────────────────────────────────────────────
section "4. drizzle-kit check"
if pnpm --filter @template/adapters -s db:check; then
  pass "drizzle schema"
else
  fail "drizzle schema"
fi

# ── 5. domain purity ──────────────────────────────────────────────────────────
section "5. packages/domain has no external imports"
DOMAIN_LEAKS=$(grep -rnE "from ['\"][^.]" packages/domain/src \
    --include="*.ts" --exclude="*.test.ts" 2>/dev/null \
  | grep -vE "from ['\"]\\." \
  | grep -vE "^[^:]+:[0-9]+:\s*//")
if [ -z "$DOMAIN_LEAKS" ]; then
  pass "domain purity"
else
  fail "domain purity — non-relative imports found:"
  echo "$DOMAIN_LEAKS"
fi

# ── 6. table naming convention ────────────────────────────────────────────────
section "6. all Drizzle tables match ^(core|ai|kb|admin|app|job)_[a-z_]+\$"
SCHEMA_DIR="packages/adapters/src/db/schema"
BAD_TABLES=$(grep -rhE "pgTable\(\"[^\"]+\"" "$SCHEMA_DIR" 2>/dev/null \
  | sed -E 's/.*pgTable\("([^"]+)".*/\1/' \
  | grep -vE "^(core|ai|kb|admin|app|job)_[a-z_]+$" || true)
if [ -z "$BAD_TABLES" ]; then
  pass "table names"
else
  fail "table names — these violate the prefix rule:"
  echo "$BAD_TABLES"
fi

# ── 7. version sync ───────────────────────────────────────────────────────────
section "7. VERSION matches root package.json version"
VERSION_FILE=$(tr -d '[:space:]' < VERSION)
PKG_VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
if [ "$VERSION_FILE" = "$PKG_VERSION" ]; then
  pass "version sync ($VERSION_FILE)"
else
  fail "version mismatch — VERSION='$VERSION_FILE' package.json='$PKG_VERSION'"
fi

# ── 8. doc lifecycle ──────────────────────────────────────────────────────────
# For each file in to-be-implemented/, fail if any implementation summary
# in implemented/ references it as completed (means it should have been moved).
section "8. doc lifecycle — to-be-implemented/* not referenced as done in implemented/"
DOC_VIOLATIONS=""
if [ -d docs/development/to-be-implemented ] && [ -d docs/development/implemented ]; then
  while IFS= read -r doc; do
    base=$(basename "$doc")
    # Skip README and any "_*.md" meta files — only phase docs are tracked.
    case "$base" in
      README.md|_*) continue ;;
    esac
    if grep -rl --include="*.md" "$base" docs/development/implemented/ > /dev/null 2>&1; then
      DOC_VIOLATIONS+="$doc referenced in implemented/\n"
    fi
  done < <(find docs/development/to-be-implemented -type f -name "*.md" 2>/dev/null)
fi
if [ -z "$DOC_VIOLATIONS" ]; then
  pass "doc lifecycle"
else
  fail "doc lifecycle:"
  printf '%b' "$DOC_VIOLATIONS"
fi

# ── 9. health checker wiring ──────────────────────────────────────────────────
# Verify every required health-checker adapter class exists in the codebase
# so no derived app ships without them wired.
section "9. health checker adapters exist in codebase"
HEALTH_FILES=(
  "packages/adapters/src/health/db-health-checker.ts"
  "packages/adapters/src/health/redis-health-checker.ts"
  "packages/adapters/src/health/ai-health-checker.ts"
  "packages/adapters/src/health/composite-health-checker.ts"
)
MISSING_HEALTH=""
for f in "${HEALTH_FILES[@]}"; do
  [ -f "$f" ] || MISSING_HEALTH+="  missing: $f\n"
done
if [ -z "$MISSING_HEALTH" ]; then
  pass "health checker adapters present"
else
  fail "health checker adapters missing:"
  printf '%b' "$MISSING_HEALTH"
fi

# Verify CompositeHealthChecker is wired into the API container
if grep -q "CompositeHealthChecker" apps/api/src/container.ts 2>/dev/null; then
  pass "CompositeHealthChecker wired in API container"
else
  fail "CompositeHealthChecker not found in apps/api/src/container.ts"
fi

# ── 10. external service connectivity (WARN only — never blocks CI) ───────────
section "10. external service connectivity (informational)"
warn() { echo -e "${YELLOW}WARN${NC} — $1"; }

# Postgres
if command -v pg_isready &>/dev/null && [ -n "${DATABASE_URL:-}" ]; then
  # Extract host and port from DATABASE_URL
  PG_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
  PG_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
  PG_PORT="${PG_PORT:-5432}"
  if pg_isready -h "$PG_HOST" -p "$PG_PORT" -q 2>/dev/null; then
    pass "postgres reachable ($PG_HOST:$PG_PORT)"
  else
    warn "postgres not reachable at $PG_HOST:$PG_PORT (expected in CI — ignore if no DB)"
  fi
else
  warn "postgres connectivity skipped (pg_isready not found or DATABASE_URL not set)"
fi

# Redis
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
REDIS_HOST=$(echo "$REDIS_URL" | sed -E 's|redis://([^:/]+).*|\1|')
REDIS_PORT=$(echo "$REDIS_URL" | sed -E 's|redis://[^:]+:([0-9]+).*|\1|')
REDIS_PORT="${REDIS_PORT:-6379}"
if command -v redis-cli &>/dev/null; then
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG; then
    pass "redis reachable ($REDIS_HOST:$REDIS_PORT)"
  else
    warn "redis not reachable at $REDIS_HOST:$REDIS_PORT (expected in CI — ignore if no Redis)"
  fi
else
  warn "redis connectivity skipped (redis-cli not found)"
fi

# AI provider key
AI_PROVIDER="${AI_DEFAULT_PROVIDER:-anthropic}"
case "$AI_PROVIDER" in
  anthropic)  KEY_VAR="ANTHROPIC_API_KEY" ;;
  openai)     KEY_VAR="OPENAI_API_KEY" ;;
  mistral)    KEY_VAR="MISTRAL_API_KEY" ;;
  *)          KEY_VAR="" ;;
esac
if [ -n "${KEY_VAR:-}" ] && [ -n "${!KEY_VAR:-}" ]; then
  pass "AI provider key set ($AI_PROVIDER)"
else
  warn "AI provider key not set for '$AI_PROVIDER' (set ${KEY_VAR:-ANTHROPIC_API_KEY} to suppress)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}All validations passed.${NC}"
  exit 0
fi
echo -e "${RED}Validation failed.${NC}"
exit 1
