#!/bin/bash
# Orchestra restart script
# Stops existing processes, runs migrations (when applicable), and restarts
#
# Usage:
#   ./restart.sh                     # Normal restart — API, web servers only
#   ./restart.sh --tauri             # Tauri dev mode — reuses existing debug bundle,
#                                    # installs to /Applications, then runs tauri dev.
#   ./restart.sh --tauri --rebuild   # Force a fresh debug bundle build (~2–5 min),
#                                    # then install and start. Required after Rust changes.
#
# Note: first-time setup or after a scheme conflict, run with --tauri --rebuild to
# build a fresh bundle and register the orchestra:// URL scheme correctly.

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT=${API_PORT:-3000}
WEB_PORT=${WEB_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3002}
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"

# ── Parse args ─────────────────────────────────────────────────────────────────
INCLUDE_TAURI=false
REBUILD_BUNDLE=false
for arg in "$@"; do
  case $arg in
    --tauri)   INCLUDE_TAURI=true ;;
    --rebuild) REBUILD_BUNDLE=true ;;
  esac
done

# ── Load Cargo (required for tauri dev) ────────────────────────────────────────
# shellcheck source=/dev/null
source "$HOME/.cargo/env" 2>/dev/null || true

echo "Restarting Orchestra..."

# ── Stop existing processes ───────────────────────────────────────────────────
echo "Stopping existing processes..."
pkill -f "orchestra-desktop" 2>/dev/null || true
pkill -f "Orchestra.app/Contents/MacOS" 2>/dev/null || true
for port in $API_PORT $WEB_PORT $FRONTEND_PORT; do
  lsof -ti:$port | xargs kill -9 2>/dev/null || true
done
sleep 1

# ── Install dependencies ──────────────────────────────────────────────────────
echo "Installing dependencies..."
pnpm install

# ── Sync database schema ──────────────────────────────────────────────────────
echo "Syncing database schema..."
if [ -f "apps/web-server/.env" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' apps/web-server/.env | cut -d'=' -f2-)
  DATABASE_URL="$DB_URL" pnpm --filter @orchestra/adapters exec prisma db push \
    --schema=src/database/schema.prisma --skip-generate --accept-data-loss
else
  echo "Warning: apps/web-server/.env not found, skipping schema sync"
fi

# ── Build packages ────────────────────────────────────────────────────────────
echo "Building packages..."
pnpm build

# ── Tauri dev mode (hot reload + URL scheme registration) ─────────────────────
if [ "$INCLUDE_TAURI" = true ]; then

  BUNDLE_PATH="$ROOT/apps/desktop/src-tauri/target/debug/bundle/macos/Orchestra.app"
  INSTALLED_BUNDLE="/Applications/Orchestra.app"

  # Build debug bundle if needed
  if [ "$REBUILD_BUNDLE" = true ] || [ ! -d "$BUNDLE_PATH" ]; then
    if [ "$REBUILD_BUNDLE" = true ]; then
      echo "Building fresh debug bundle (--rebuild requested)..."
    else
      echo "Debug bundle not found — building for the first time..."
    fi
    echo "  This takes 2–5 minutes. Subsequent runs (without --rebuild) reuse this bundle."
    (cd "$ROOT/apps/desktop" && pnpm exec tauri build --debug)
    echo "Debug bundle built."
  else
    echo "Reusing existing debug bundle (pass --rebuild to force a fresh build)."
  fi

  # Install bundle to /Applications (kills any running bundle first)
  echo "Installing debug bundle to $INSTALLED_BUNDLE..."
  pkill -f "Orchestra.app/Contents/MacOS" 2>/dev/null || true
  sleep 1
  rsync -a --delete "$BUNDLE_PATH/" "$INSTALLED_BUNDLE/"
  echo "Bundle installed."

  # Ensure orchestra:// routes to com.orchestra.app (survives macOS cache)
  echo "Registering orchestra:// URL scheme..."
  swift - <<'SWIFT'
import Foundation
import CoreServices
LSSetDefaultHandlerForURLScheme("orchestra" as NSString as CFString, "com.orchestra.app" as NSString as CFString)
SWIFT

  echo "Starting API server (port $API_PORT)..."
  pnpm --filter @orchestra/web-server dev &

  echo "Starting web dev server (port $WEB_PORT)..."
  pnpm --filter @orchestra/web dev &

  echo "Waiting for servers to be ready..."
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:$API_PORT/health" > /dev/null 2>&1 && \
       curl -sf "http://localhost:$WEB_PORT" > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo "Starting Tauri dev (hot reload active)..."
  echo "  Frontend changes → instant WebView reload"
  echo "  Rust changes     → auto-recompile (~30-60s)"
  echo "  Note: after Rust changes, run ./restart.sh --tauri --rebuild to sync /Applications"
  cd "$ROOT/apps/desktop"
  exec pnpm exec tauri dev

# ── Normal dev mode (all services via turbo) ──────────────────────────────────
else

  echo "Starting development servers (excluding desktop app)..."
  exec pnpm turbo dev --filter=!@orchestra/desktop

fi
