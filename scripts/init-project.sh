#!/usr/bin/env bash
# scripts/init-project.sh — bootstrap a new project from this template.
# Run once from the repo root after cloning. Renames app-level packages,
# wires @rbrasier/* as versioned npm deps, removes framework source,
# and resets git history.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── guard: already initialised ───────────────────────────────────────────────
if [ -f .framework-scope ]; then
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

FRAMEWORK_SCOPE="@rbrasier"
FRAMEWORK_VERSION=$(tr -d '[:space:]' < VERSION)
FRAMEWORK_PKGS=("domain" "shared" "application" "adapters")

# ── helpers ───────────────────────────────────────────────────────────────────

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

# ── collect inputs ────────────────────────────────────────────────────────────

# Project name
while true; do
  read_input PROJECT_NAME "Project name (lowercase, hyphens only)" ""
  if validate_project_name "$PROJECT_NAME"; then break; fi
done

# App package scope (only for apps/web and apps/api — framework stays @rbrasier)
DEFAULT_APP_SCOPE="@${PROJECT_NAME}"
read_input APP_SCOPE "Package scope for your app packages" "$DEFAULT_APP_SCOPE"

if [[ ! "$APP_SCOPE" =~ ^@ ]]; then
  APP_SCOPE="@${APP_SCOPE}"
  warning "Scope must start with @, using: $APP_SCOPE"
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

# Auth method
echo
echo "  Authentication method:"
echo "    1) email-password     (email + password — default)"
echo "    2) magic-link         (email magic link — no password)"
echo "    3) pki                (client certificate via reverse proxy)"
echo "    4) pki-and-magic-link (PKI primary, magic link fallback)"
echo "    5) google-oauth       (Google OAuth — requires additional setup)"
echo "    6) other              (configure manually)"
echo "    7) none               (no auth — all routes public, dev/internal only)"
prompt "Choice [1]: "
read -r AUTH_CHOICE
case "${AUTH_CHOICE:-1}" in
  2) AUTH_METHOD="magic-link" ;;
  3) AUTH_METHOD="pki" ;;
  4) AUTH_METHOD="pki-and-magic-link" ;;
  5) AUTH_METHOD="google-oauth" ;;
  6) AUTH_METHOD="other" ;;
  7) AUTH_METHOD="none" ;;
  *) AUTH_METHOD="email-password" ;;
esac

# Additive options when the base is email+password
AUTH_ENABLE_MAGIC_LINK="false"
AUTH_ENABLE_ENTRA="false"
ENTRA_TENANT_ID=""
ENTRA_CLIENT_ID=""
ENTRA_CLIENT_SECRET=""
if [ "$AUTH_METHOD" = "email-password" ]; then
  prompt "  Also enable magic-link sign-in? [y/N]: "
  read -r ENABLE_ML
  [ "$ENABLE_ML" = "y" ] || [ "$ENABLE_ML" = "Y" ] && AUTH_ENABLE_MAGIC_LINK="true"

  prompt "  Also enable Microsoft Entra (Azure AD) sign-in? [y/N]: "
  read -r ENABLE_ENTRA
  if [ "$ENABLE_ENTRA" = "y" ] || [ "$ENABLE_ENTRA" = "Y" ]; then
    AUTH_ENABLE_ENTRA="true"
    prompt "    Entra tenant ID: "
    read -r ENTRA_TENANT_ID
    prompt "    Entra client ID: "
    read -r ENTRA_CLIENT_ID
    prompt "    Entra client secret (leave blank to fill in later): "
    read -r ENTRA_CLIENT_SECRET
  fi
fi

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
echo "  Project name     : $PROJECT_NAME"
echo "  App scope        : $APP_SCOPE"
echo "  Framework scope  : $FRAMEWORK_SCOPE (published npm packages — unchanged)"
echo "  Framework ver    : $FRAMEWORK_VERSION"
echo "  AI provider      : $AI_PROVIDER"
echo "  Auth method      : $AUTH_METHOD"
echo "  Magic-link extra : $AUTH_ENABLE_MAGIC_LINK"
echo "  Entra extra      : $AUTH_ENABLE_ENTRA"
echo "  Langfuse         : $LANGFUSE_ENABLED"
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

# ── remove framework source packages (they become npm deps) ──────────────────

info "Removing framework source packages (packages/ → npm deps)…"
rm -rf packages/

# ── strip framework-internal CI artefacts and validate checks ─────────────────

info "Stripping framework CI/CD artefacts and publishing-pipeline validate checks…"

# release.yml is the framework's npm publishing pipeline — apps have no NPM_TOKEN
rm -f .github/workflows/release.yml

# Remove CI jobs that only make sense inside the template repo (coverage job
# hard-codes @template/* filter names that don't exist post-init; framework-updates
# runs a script that isn't present in a bootstrapped app)
python3 - << 'PYEOF'
import re, pathlib, sys

ci = pathlib.Path('.github/workflows/ci.yml')
txt = ci.read_text()
# coverage block ends where the next job at the same indent level begins
txt = re.sub(r'\n  coverage:.*?(?=\n  \w)', '', txt, flags=re.DOTALL)
# framework-updates block runs to EOF
txt = re.sub(r'\n  framework-updates:.*', '', txt, flags=re.DOTALL)
ci.write_text(txt.rstrip() + '\n')
print('  ci.yml: removed coverage and framework-updates jobs')
PYEOF

# Remove the seven validate.sh sections that guard the publishing pipeline and
# renumber the remaining 14 checks sequentially.
python3 - << 'PYEOF'
import re, pathlib, sys

p = pathlib.Path('validate.sh')
content = p.read_text()

# Split at each numbered section boundary and the Summary block (lookahead keeps
# the delimiter at the start of each part rather than consuming it)
parts = re.split(r'(?=\n# ── (?:\d+\.|Summary))', content)

to_remove = {11, 12, 16, 17, 19, 20, 21}
kept = []
for part in parts:
    m = re.match(r'\n# ── (\d+)\.', part)
    if m and int(m.group(1)) in to_remove:
        continue
    kept.append(part)

result = ''.join(kept)

# Renumber survivors: 13→11, 14→12, 15→13, 18→14.
# Two-pass approach: first rename to high placeholders (1013, 1014, …) to avoid
# collision between old and new numbers, then replace placeholders with finals.
renumber = {13: 11, 14: 12, 15: 13, 18: 14}
for old in renumber:
    placeholder = 1000 + old
    result = result.replace(f'# ── {old}.', f'# ── {placeholder}.')
    result = result.replace(f'section "{old}.', f'section "{placeholder}.')
for old, new in renumber.items():
    placeholder = 1000 + old
    result = result.replace(f'# ── {placeholder}.', f'# ── {new}.')
    result = result.replace(f'section "{placeholder}.', f'section "{new}.')

p.write_text(result)

section_count = len(re.findall(r'^# ── \d+\.', result, re.MULTILINE))
if section_count != 14:
    print(f'ERROR: expected 14 sections in validate.sh, got {section_count}', file=sys.stderr)
    sys.exit(1)
print(f'  validate.sh: 7 sections removed, {section_count} remain (numbered 1–14)')
PYEOF

# ── update pnpm-workspace.yaml to only list apps/ ────────────────────────────

info "Updating pnpm-workspace.yaml…"
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
EOF

# ── rename app-level packages to user's scope ────────────────────────────────

info "Renaming @rbrasier/web and @rbrasier/api → ${APP_SCOPE}/…"
sed_inplace "s|\"@rbrasier/web\"|\"${APP_SCOPE}/web\"|g"  apps/web/package.json
sed_inplace "s|\"@rbrasier/api\"|\"${APP_SCOPE}/api\"|g"  apps/api/package.json

# ── swap workspace:* → versioned npm ranges in apps ──────────────────────────

info "Wiring framework packages as versioned npm dependencies…"
VERSION_RANGE="^${FRAMEWORK_VERSION}"
for pkg in "${FRAMEWORK_PKGS[@]}"; do
  for app_pkg in apps/web/package.json apps/api/package.json; do
    [ -f "$app_pkg" ] || continue
    sed_inplace "s|\"${FRAMEWORK_SCOPE}/${pkg}\": \"workspace:\*\"|\"${FRAMEWORK_SCOPE}/${pkg}\": \"${VERSION_RANGE}\"|g" "$app_pkg"
  done
done

# ── update root package.json name ────────────────────────────────────────────

info "Updating root package name…"
sed_inplace "s|\"name\": \"template\"|\"name\": \"${PROJECT_NAME}\"|g" package.json

# ── docker-compose and .env.example renames ──────────────────────────────────

info "Updating docker-compose and .env.example…"
if [ -f docker-compose.yml ]; then
  sed_inplace "s|POSTGRES_DB=template|POSTGRES_DB=${PROJECT_NAME}|g"   docker-compose.yml
  sed_inplace "s|^  template:|  ${PROJECT_NAME}:|g"                    docker-compose.yml
fi
if [ -f .env.example ]; then
  sed_inplace "s|APP_NAME=template|APP_NAME=${PROJECT_NAME}|g"                         .env.example
  sed_inplace "s|/template|/${PROJECT_NAME}|g"                                          .env.example
  sed_inplace "s|AI_DEFAULT_PROVIDER=anthropic|AI_DEFAULT_PROVIDER=${AI_PROVIDER}|g"   .env.example
  sed_inplace "s|AUTH_METHOD=email-password|AUTH_METHOD=${AUTH_METHOD}|g"              .env.example
  sed_inplace "s|AUTH_ENABLE_MAGIC_LINK=false|AUTH_ENABLE_MAGIC_LINK=${AUTH_ENABLE_MAGIC_LINK}|g" .env.example
  sed_inplace "s|AUTH_ENABLE_ENTRA=false|AUTH_ENABLE_ENTRA=${AUTH_ENABLE_ENTRA}|g"     .env.example
  sed_inplace "s|ENTRA_TENANT_ID=|ENTRA_TENANT_ID=${ENTRA_TENANT_ID}|g"                .env.example
  sed_inplace "s|ENTRA_CLIENT_ID=|ENTRA_CLIENT_ID=${ENTRA_CLIENT_ID}|g"                .env.example
  sed_inplace "s|ENTRA_CLIENT_SECRET=|ENTRA_CLIENT_SECRET=${ENTRA_CLIENT_SECRET}|g"    .env.example

  if [ "$AUTH_ENABLE_ENTRA" = "true" ]; then
    warning "Entra enabled — register the redirect URI <BETTER_AUTH_URL>/api/auth/oauth2/callback/microsoft-entra-id in Azure."
  fi

  # PKI: comment out PKI vars when not using PKI
  if [[ "$AUTH_METHOD" != "pki" && "$AUTH_METHOD" != "pki-and-magic-link" ]]; then
    sed_inplace "s|^PKI_|# PKI_|g" .env.example
  else
    warning "PKI auth selected — set PKI_TRUSTED_PROXY_IPS in .env to your reverse proxy's IP(s)."
  fi

  if [ "$AUTH_METHOD" = "google-oauth" ]; then
    warning "google-oauth requires additional setup. See docs/guides/google-oauth.md."
  fi

  if [ "$AUTH_METHOD" = "none" ]; then
    warning "none auth selected — all /admin/* routes are publicly accessible. Do not use in production."
  fi

  if [ "$LANGFUSE_ENABLED" = "n" ]; then
    info "Langfuse disabled — commenting keys in .env.example…"
    sed_inplace "s|^LANGFUSE_|# LANGFUSE_|g" .env.example
  fi
fi

# ── reset git history ─────────────────────────────────────────────────────────

info "Resetting git history…"
rm -rf .git
git init -q

info "Installing pre-commit hook (validate.sh)…"
mkdir -p .git/hooks
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/sh
./validate.sh
HOOK
chmod +x .git/hooks/pre-commit

git add .
git commit -q -m "chore: initial commit from ai-app-template v${FRAMEWORK_VERSION}"

# ── copy env file ─────────────────────────────────────────────────────────────

if [ -f .env.example ] && [ ! -f .env ]; then
  info "Copying .env.example → .env…"
  cp .env.example .env

  # Generate the settings-secret encryption key (base64, 32 bytes). Without it,
  # the app falls back to an ephemeral dev key and is invalid in production.
  if command -v openssl >/dev/null 2>&1; then
    ENCRYPTION_KEY="$(openssl rand -base64 32)"
    sed_inplace "s|APP_SETTINGS_ENCRYPTION_KEY=|APP_SETTINGS_ENCRYPTION_KEY=${ENCRYPTION_KEY}|g" .env
    info "Generated APP_SETTINGS_ENCRYPTION_KEY in .env."
  else
    warning "openssl not found — set APP_SETTINGS_ENCRYPTION_KEY in .env (openssl rand -base64 32)."
  fi
fi

# ── write version tracking files ─────────────────────────────────────────────

info "Writing .framework-scope and .template-version…"
echo "${FRAMEWORK_SCOPE}" > .framework-scope
echo "${FRAMEWORK_VERSION}" > .template-version

git add .framework-scope .template-version
git commit -q -m "chore: add template version tracking files"

# ── install dependencies ──────────────────────────────────────────────────────

info "Installing dependencies (pnpm install)…"
pnpm install

# ── typecheck (light validation — no DB required) ────────────────────────────

info "Running typecheck…"
if pnpm typecheck 2>&1; then
  info "Typecheck passed."
else
  echo
  warning "TypeScript errors detected. Review above, then run './validate.sh' once"
  warning "infrastructure is running (docker compose up -d)."
fi

# ── done ──────────────────────────────────────────────────────────────────────

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}✓ Project \"${PROJECT_NAME}\" is ready.${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "  Next steps:"
echo "    1. Fill in secrets in .env (DATABASE_URL, BETTER_AUTH_SECRET, AI keys)"
if [[ "$AUTH_METHOD" == "pki" || "$AUTH_METHOD" == "pki-and-magic-link" ]]; then
echo "    ★  Set PKI_TRUSTED_PROXY_IPS in .env to your reverse proxy's IP(s)"
fi
echo "    3. Start infrastructure:   docker compose up -d"
echo "    4. pnpm run db:migrate"
echo "    5. Start the app:          ./restart.sh"
echo "    6. Open the app:           http://localhost:3000"
echo "    7. Push to GitHub:         git remote add origin <url> && git push -u origin main"
echo
echo "  Once infrastructure is up, run ./validate.sh to confirm everything passes."
echo "  Admin login is seeded from ADMIN_SEED_EMAIL in .env."
echo "  Runtime config (login methods, AI provider/keys) is managed at /admin/settings."
echo
