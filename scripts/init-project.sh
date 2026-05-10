#!/usr/bin/env bash
# scripts/init-project.sh — bootstrap a new project from this template.
# Run once from the repo root after cloning. Renames all @template/ references,
# resets git history, and installs dependencies.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── guard: already initialised ───────────────────────────────────────────────
if ! grep -q '@template/' packages/domain/package.json 2>/dev/null; then
  echo "Already initialised — nothing to do."
  exit 0
fi

# ── colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}✓${NC}  $1"; }
prompt()  { echo -e "${YELLOW}?${NC}  $1"; }
warning() { echo -e "${YELLOW}!${NC}  $1"; }
error()   { echo -e "${RED}✗${NC}  $1" >&2; }

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ai-app-template — Project Initialisation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# ── helpers ───────────────────────────────────────────────────────────────────

# Portable sed -i (GNU uses -i'' with no space; BSD needs -i '')
sed_inplace() {
  local pattern="$1"
  local file="$2"
  if sed --version 2>/dev/null | grep -q GNU; then
    sed -i'' "$pattern" "$file"
  else
    sed -i '.bak' "$pattern" "$file"
    rm -f "${file}.bak"
  fi
}

# Apply a sed pattern to every file matching given extensions that contains
# the search string (avoids touching binary files or unrelated files).
replace_in_files() {
  local search="$1"
  local replacement="$2"
  shift 2
  local extensions=("$@")

  local include_args=()
  for ext in "${extensions[@]}"; do
    include_args+=(--include="$ext")
  done

  local files
  files=$(grep -rl "$search" . "${include_args[@]}" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=.next \
    --exclude-dir=.turbo \
    2>/dev/null || true)

  if [ -z "$files" ]; then return; fi

  while IFS= read -r file; do
    sed_inplace "s|${search}|${replacement}|g" "$file"
  done <<< "$files"
}

# ── collect inputs ────────────────────────────────────────────────────────────

read_input() {
  local var_name="$1"
  local question="$2"
  local default_val="${3:-}"
  local value=""

  while [ -z "$value" ]; do
    if [ -n "$default_val" ]; then
      prompt "$question [$default_val]: "
    else
      prompt "$question: "
    fi
    read -r value
    value="${value:-$default_val}"
    if [ -z "$value" ]; then
      warning "Value required. Please try again."
    fi
  done

  printf -v "$var_name" '%s' "$value"
}

validate_project_name() {
  local name="$1"
  if [[ ! "$name" =~ ^[a-z][a-z0-9-]*$ ]]; then
    error "Project name must be lowercase letters, numbers, and hyphens only (e.g. my-saas-app)"
    return 1
  fi
  return 0
}

# Project name
while true; do
  read_input PROJECT_NAME "Project name (lowercase, hyphens only)" ""
  if validate_project_name "$PROJECT_NAME"; then break; fi
done

# Package scope
DEFAULT_SCOPE="@${PROJECT_NAME}"
read_input PKG_SCOPE "Package scope" "$DEFAULT_SCOPE"

# Validate scope starts with @
if [[ ! "$PKG_SCOPE" =~ ^@ ]]; then
  PKG_SCOPE="@${PKG_SCOPE}"
  warning "Scope must start with @, using: $PKG_SCOPE"
fi

# AI provider
echo
echo "  Default AI provider:"
echo "    1) anthropic (Claude)"
echo "    2) openai    (GPT-4o)"
echo "    3) mistral   (Mistral Large)"
prompt "Choice [1]: "
read -r AI_CHOICE
case "${AI_CHOICE:-1}" in
  2) AI_PROVIDER="openai" ;;
  3) AI_PROVIDER="mistral" ;;
  *) AI_PROVIDER="anthropic" ;;
esac

# Langfuse
echo
prompt "Enable Langfuse observability? [y/N]: "
read -r LANGFUSE_ANSWER
case "${LANGFUSE_ANSWER:-n}" in
  [Yy]*) LANGFUSE_ENABLED="y" ;;
  *)     LANGFUSE_ENABLED="n" ;;
esac

# ── confirm ───────────────────────────────────────────────────────────────────

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project name   : $PROJECT_NAME"
echo "  Package scope  : $PKG_SCOPE"
echo "  AI provider    : $AI_PROVIDER"
echo "  Langfuse       : $LANGFUSE_ENABLED"
echo
prompt "Proceed? [y/N]: "
read -r CONFIRM
case "${CONFIRM:-n}" in
  [Yy]*) ;;
  *)
    echo "Aborted — no changes made."
    exit 0
    ;;
esac

echo

# ── find-and-replace ──────────────────────────────────────────────────────────

info "Renaming @template/ → ${PKG_SCOPE}/ across all source files…"
replace_in_files '@template/' "${PKG_SCOPE}/" \
  "*.json" "*.ts" "*.tsx" "*.md" "*.sh" "*.yml" "*.yaml"

info "Renaming root package name…"
sed_inplace "s|\"name\": \"template\"|\"name\": \"${PROJECT_NAME}\"|g" package.json

info "Updating docker-compose service names and database…"
replace_in_files 'POSTGRES_DB=template' "POSTGRES_DB=${PROJECT_NAME}" "*.yml" "*.yaml" "*.example"
replace_in_files 'APP_NAME=template' "APP_NAME=${PROJECT_NAME}" "*.example"
replace_in_files '/template' "/${PROJECT_NAME}" ".env.example"

# docker-compose service name (top-level service keys)
if [ -f docker-compose.yml ]; then
  sed_inplace "s|^  template:|  ${PROJECT_NAME}:|g" docker-compose.yml
fi

info "Setting default AI provider to ${AI_PROVIDER}…"
replace_in_files 'AI_DEFAULT_PROVIDER=anthropic' "AI_DEFAULT_PROVIDER=${AI_PROVIDER}" \
  "*.example" "*.env"

# Langfuse: comment out keys if disabled (they're present as no-ops by default)
if [ "$LANGFUSE_ENABLED" = "n" ]; then
  info "Langfuse disabled — keys will be commented in .env.example…"
  if [ -f .env.example ]; then
    sed_inplace "s|^LANGFUSE_|# LANGFUSE_|g" .env.example
  fi
  warning "The Langfuse adapter is present but will no-op without keys set."
fi

# ── reset git history ─────────────────────────────────────────────────────────

info "Resetting git history…"
rm -rf .git
git init -q
git add .
git commit -q -m "chore: initial commit from ai-app-template"

# ── copy env file ─────────────────────────────────────────────────────────────

if [ -f .env.example ] && [ ! -f .env ]; then
  info "Copying .env.example → .env…"
  cp .env.example .env
else
  info ".env already exists — skipping copy."
fi

# ── write version tracking files ─────────────────────────────────────────────

info "Writing .template-version…"
tr -d '[:space:]' < VERSION > .template-version

info "Writing .framework-scope…"
echo "${PKG_SCOPE}" > .framework-scope

git add .template-version .framework-scope
git commit -q -m "chore: add template version tracking files"

# ── install dependencies ──────────────────────────────────────────────────────

info "Installing dependencies (pnpm install)…"
pnpm install

# ── done ──────────────────────────────────────────────────────────────────────

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}✓ Project \"${PROJECT_NAME}\" is ready.${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "  Next steps:"
echo "    1. Fill in secrets in .env (DATABASE_URL, BETTER_AUTH_SECRET, AI keys)"
echo "    2. Start infrastructure:   docker compose up -d"
echo "    3. Start the app:          ./restart.sh"
echo "    4. Open the app:           http://localhost:3000"
echo "    5. Push to GitHub:         git remote add origin <url> && git push -u origin main"
echo
echo "  Admin login is seeded from ADMIN_SEED_EMAIL in .env."
echo
