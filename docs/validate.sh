#!/bin/bash

# Orchestra Validation Script
# Validates that all checks pass and architecture rules are enforced
#
# ADR coverage:
#   ADR-001 — Hexagonal Architecture (Ports & Adapters)
#   ADR-002 — Database Portability via Prisma + Adapters
#   ADR-003 — Monorepo Structure with pnpm Workspaces + Turborepo
#   ADR-004 — Desktop & Mobile Strategy — Tauri
#   ADR-005 — Real-Time Strategy — WebSockets over Polling
#   CLAUDE.md — File size limits and naming conventions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_CHECKS=10

# Helper functions
pass() {
  echo -e "${GREEN}✓ $1${NC}"
  ((PASS_COUNT++))
}

fail() {
  echo -e "${RED}✗ $1${NC}"
  ((FAIL_COUNT++))
}

print_header() {
  echo ""
  echo "=========================================="
  echo "$1"
  echo "=========================================="
}

# ──────────────────────────────────────────────────────────────
# Check 1: pnpm install
# ──────────────────────────────────────────────────────────────
print_header "Check 1 / 10: pnpm install"
if pnpm install > /dev/null 2>&1; then
  pass "pnpm install"
else
  fail "pnpm install"
fi

# ──────────────────────────────────────────────────────────────
# Check 2: pnpm build — no TypeScript errors
# ──────────────────────────────────────────────────────────────
print_header "Check 2 / 10: Build — no TypeScript errors"
BUILD_OUTPUT=$(pnpm build 2>&1)
BUILD_EXIT=$?
# Turbo may exit 0 but still contain TS errors — check both
if [ $BUILD_EXIT -eq 0 ] && ! echo "$BUILD_OUTPUT" | grep -qE "error TS[0-9]+|ERROR|Build failed"; then
  pass "pnpm build (0 TS errors)"
else
  fail "pnpm build"
  echo "$BUILD_OUTPUT" | grep -E "error TS[0-9]+|ERROR|Build failed|\.ts:[0-9]+" | tail -20
fi

# ──────────────────────────────────────────────────────────────
# Check 3: pnpm test — all tests pass
# ──────────────────────────────────────────────────────────────
print_header "Check 3 / 10: Tests"
TEST_OUTPUT=$(pnpm test 2>&1)
TEST_EXIT=$?
if [ $TEST_EXIT -eq 0 ]; then
  TEST_COUNT=$(echo "$TEST_OUTPUT" | grep "Tests.*passed" | awk '{sum+=$3} END {print sum}')
  pass "pnpm test ($TEST_COUNT tests passing)"
else
  fail "pnpm test"
  echo "$TEST_OUTPUT" | tail -20
fi

# ──────────────────────────────────────────────────────────────
# Check 4: pnpm lint — ESLint (includes core no-restricted-imports)
# ADR-001: ESLint rule in packages/core/.eslintrc.cjs blocks imports of
#          @orchestra/adapters, @orchestra/api, pg, better-sqlite3, bullmq,
#          socket.io, and @prisma/client from within packages/core.
# ──────────────────────────────────────────────────────────────
print_header "Check 4 / 10: Lint — ESLint (includes ADR-001 core boundary rules)"
if pnpm lint > /dev/null 2>&1; then
  pass "pnpm lint (0 violations, ADR-001 boundary enforced)"
else
  fail "pnpm lint"
  pnpm lint 2>&1 | tail -20
fi

# ──────────────────────────────────────────────────────────────
# Check 5: ADR-001 — Core isolation (grep belt-and-suspenders)
# Catches any import that slips past ESLint (e.g. disabled rules, new files
# with missing eslintrc, or imports inside dynamic require() calls).
# packages/core must have ZERO runtime imports from:
#   @orchestra/adapters, @orchestra/api, pg, better-sqlite3, bullmq,
#   socket.io, socket.io-client, @prisma/client, @tauri-apps/*
# ──────────────────────────────────────────────────────────────
print_header "Check 5 / 10: ADR-001 — Core package isolation (grep)"
CORE_LEAKS=$(grep -rn \
  --include="*.ts" \
  -E "from ['\"](@orchestra/adapters|@orchestra/api|pg|better-sqlite3|bullmq|socket\.io|socket\.io-client|@prisma/client|@tauri-apps)['\"]|require\(['\"](@orchestra/adapters|@orchestra/api|pg|better-sqlite3|bullmq|socket\.io|@prisma/client|@tauri-apps)" \
  packages/core/src \
  2>/dev/null \
  | grep -v "__tests__" \
  | grep -v "\.d\.ts" \
  | grep -v "^\s*//" \
  | grep -v "//.*from ['\"]")

if [ -z "$CORE_LEAKS" ]; then
  pass "ADR-001: packages/core has no platform or adapter imports"
else
  fail "ADR-001: Illegal imports found in packages/core"
  echo "$CORE_LEAKS"
fi

# ──────────────────────────────────────────────────────────────
# Check 6: ADR-004 — No @tauri-apps/api in packages/core or packages/api
# All Tauri native capability calls must go through ILocalCapabilities,
# implemented in packages/adapters/src/capabilities/tauri.adapter.ts.
# ──────────────────────────────────────────────────────────────
print_header "Check 6 / 10: ADR-004 — No @tauri-apps/api outside packages/adapters"
TAURI_LEAKS=$(grep -rn \
  --include="*.ts" \
  "@tauri-apps/api" \
  packages/core/src \
  packages/api/src \
  2>/dev/null \
  | grep -v "__tests__")

if [ -z "$TAURI_LEAKS" ]; then
  pass "ADR-004: @tauri-apps/api is only used inside packages/adapters"
else
  fail "ADR-004: @tauri-apps/api found in core or api — use ILocalCapabilities port instead"
  echo "$TAURI_LEAKS"
fi

# ──────────────────────────────────────────────────────────────
# Check 7: ADR-005 — No setInterval polling loops in packages/core
# Real-time updates must use IRealtimeTransport (WebSocket events).
# BullMQ recurring jobs (not polling loops) are the correct pattern for
# scheduled work. setTimeout for delay utilities is acceptable.
# ──────────────────────────────────────────────────────────────
print_header "Check 7 / 10: ADR-005 — No setInterval polling in packages/core"
POLLING=$(grep -rn \
  --include="*.ts" \
  "setInterval" \
  packages/core/src \
  2>/dev/null \
  | grep -v "__tests__")

if [ -z "$POLLING" ]; then
  pass "ADR-005: No setInterval polling found in packages/core"
else
  fail "ADR-005: setInterval polling found in core — use IRealtimeTransport events or IJobQueue instead"
  echo "$POLLING"
fi

# ──────────────────────────────────────────────────────────────
# Check 8: ADR-002 — All Prisma models have @@map (explicit table names)
# Every model must use @@map("prefix_snake_case") so table groupings are
# obvious when browsing the database. Models without @@map use Prisma's
# default PascalCase table name, which violates the naming convention.
# ──────────────────────────────────────────────────────────────
print_header "Check 8 / 10: ADR-002 — Prisma models all have @@map table names"
SCHEMA_FILE="packages/adapters/src/database/schema.prisma"
MODELS_WITHOUT_MAP=()

if [ -f "$SCHEMA_FILE" ]; then
  while IFS= read -r model_name; do
    if ! awk "/^model ${model_name} \{/,/^\}/" "$SCHEMA_FILE" | grep -q "@@map"; then
      MODELS_WITHOUT_MAP+=("$model_name")
    fi
  done < <(grep "^model " "$SCHEMA_FILE" | awk '{print $2}')

  if [ ${#MODELS_WITHOUT_MAP[@]} -eq 0 ]; then
    MODEL_COUNT=$(grep -c "^model " "$SCHEMA_FILE")
    pass "ADR-002: All $MODEL_COUNT Prisma models have @@map directives"
  else
    fail "ADR-002: Models missing @@map (table name) directives:"
    for m in "${MODELS_WITHOUT_MAP[@]}"; do
      echo "  - $m"
    done
  fi
else
  fail "ADR-002: schema.prisma not found at $SCHEMA_FILE"
fi

# ──────────────────────────────────────────────────────────────
# Check 9: ADR-001 / ADR-003 / ADR-005 — Required ports and adapters exist
# These files are structural anchors. If they disappear, the hexagonal
# architecture is broken regardless of what the code compiles to.
# ──────────────────────────────────────────────────────────────
print_header "Check 9 / 10: ADR-001/003/005 — Required port interfaces and adapters exist"
MISSING_FILES=()

REQUIRED_PORTS=(
  "packages/core/src/ports/IDatabase.ts"
  "packages/core/src/ports/IRealtimeTransport.ts"
  "packages/core/src/ports/ILocalCapabilities.ts"
  "packages/core/src/ports/IJobQueue.ts"
  "packages/core/src/ports/IEmailProvider.ts"
  "packages/core/src/ports/IAIProvider.ts"
  "packages/core/src/ports/ILogger.ts"
)

REQUIRED_ADAPTERS=(
  "packages/adapters/src/realtime/socketio.adapter.ts"
  "packages/adapters/src/realtime/in-memory.adapter.ts"
  "packages/adapters/src/realtime/tauri-ipc.adapter.ts"
  "packages/adapters/src/database/postgres.adapter.ts"
  "packages/adapters/src/database/sqlite.adapter.ts"
  "packages/adapters/src/database/in-memory.adapter.ts"
  "packages/adapters/src/database/schema.prisma"
)

for f in "${REQUIRED_PORTS[@]}" "${REQUIRED_ADAPTERS[@]}"; do
  if [ ! -f "$f" ]; then
    MISSING_FILES+=("$f")
  fi
done

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
  TOTAL_FILES=$(( ${#REQUIRED_PORTS[@]} + ${#REQUIRED_ADAPTERS[@]} ))
  pass "ADR-001/003/005: All $TOTAL_FILES required ports and adapters present"
else
  fail "ADR-001/003/005: Missing required files:"
  for f in "${MISSING_FILES[@]}"; do
    echo "  - $f"
  done
fi

# ──────────────────────────────────────────────────────────────
# Check 10: CLAUDE.md — File size limits
# Enforces the non-negotiable size caps from CLAUDE.md:
#   Controller files:    ≤ 150 lines
#   Route files:         ≤  80 lines
#   Core service files:  ≤ 300 lines  (ports/, types/, config/, prompts/ excluded)
#   Web component files: ≤ 200 lines
# ──────────────────────────────────────────────────────────────
print_header "Check 10 / 10: CLAUDE.md — File size limits"
SIZE_VIOLATIONS=()

# Controllers: ≤ 150 lines
while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 150 ]; then
    SIZE_VIOLATIONS+=("Controller ($lines/150): $file")
  fi
done < <(find packages/api/src/controllers -name "*.ts" 2>/dev/null)

# Routes: ≤ 80 lines
while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 80 ]; then
    SIZE_VIOLATIONS+=("Route ($lines/80): $file")
  fi
done < <(find packages/api/src/routes -name "*.ts" 2>/dev/null)

# Web components: ≤ 200 lines
while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 200 ]; then
    SIZE_VIOLATIONS+=("Component ($lines/200): $file")
  fi
done < <(find packages/web/src/components -name "*.tsx" -o -name "*.ts" 2>/dev/null)

# Core services: ≤ 300 lines (exclude ports/, types/, config/, prompts/, index files, tests)
while IFS= read -r file; do
  case "$file" in
    */ports/*|*/types/*|*/config/*|*/prompts/*|*/index.ts|*/__tests__/*) continue ;;
  esac
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 300 ]; then
    SIZE_VIOLATIONS+=("Service ($lines/300): $file")
  fi
done < <(find packages/core/src -name "*.ts" 2>/dev/null)

if [ ${#SIZE_VIOLATIONS[@]} -eq 0 ]; then
  pass "CLAUDE.md: All files within size limits"
else
  fail "CLAUDE.md: File size limit violations (${#SIZE_VIOLATIONS[@]} file(s)):"
  for v in "${SIZE_VIOLATIONS[@]}"; do
    echo "  ✗ $v"
  done
  echo ""
  echo "  Split large controllers into sub-controllers, large services into"
  echo "  focused sub-services, and large components into sub-components."
fi

# ──────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────
print_header "Validation Summary"
echo "Passed: $PASS_COUNT / $TOTAL_CHECKS"
echo "Failed: $FAIL_COUNT / $TOTAL_CHECKS"

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "\n${GREEN}✓ All validations passed!${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some validations failed. See details above.${NC}"
  exit 1
fi
