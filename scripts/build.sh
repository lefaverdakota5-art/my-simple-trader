#!/usr/bin/env bash
# scripts/build.sh — Cross-platform build script for Masterpiece Swarm Trader
#
# Usage:
#   ./scripts/build.sh android   — Build Android APK
#   ./scripts/build.sh desktop   — Bundle Desktop Python package
#   ./scripts/build.sh all       — Build all platforms
#   ./scripts/build.sh test      — Run Python unit tests
#
set -euo pipefail

PLATFORM="${1:-all}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/dist-build"
RUN_NUMBER="${RUN_NUMBER:-local}"

echo "=================================================="
echo " Masterpiece Swarm Trader — Build Script"
echo " Platform : $PLATFORM"
echo " Run      : $RUN_NUMBER"
echo " Root     : $PROJECT_ROOT"
echo "=================================================="

# ── Helpers ───────────────────────────────────────────
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: '$1' is required but not found. $2"
    exit 1
  }
}

# ── Build web assets ──────────────────────────────────
build_web() {
  echo ""
  echo ">>> Building web assets..."
  require_cmd npm "Install Node.js from https://nodejs.org"
  cd "$PROJECT_ROOT"
  npm install
  npm run build
  echo ">>> Web build complete."
}

# ── Android APK ───────────────────────────────────────
build_android() {
  echo ""
  echo ">>> Building Android APK..."
  require_cmd java "Install JDK 17 — https://adoptium.net"

  build_web
  npm run apk:prepare
  npx cap sync android

  cd "$PROJECT_ROOT/android"
  chmod +x gradlew
  BUILD_NUMBER="${RUN_NUMBER}" VERSION_NAME="1.5.${RUN_NUMBER}" \
    ./gradlew assembleDebug

  mkdir -p "$BUILD_DIR"
  cp app/build/outputs/apk/debug/app-debug.apk \
     "$BUILD_DIR/masterpiece-swarm-trader-android-${RUN_NUMBER}.apk"

  echo ">>> Android APK: $BUILD_DIR/masterpiece-swarm-trader-android-${RUN_NUMBER}.apk"
}

# ── Desktop bundle ────────────────────────────────────
build_desktop() {
  echo ""
  echo ">>> Bundling Desktop (Python) package..."
  require_cmd python3 "Install Python 3.11+ from https://python.org"

  mkdir -p "$BUILD_DIR/desktop-bundle"
  cp "$PROJECT_ROOT/main.py"           "$BUILD_DIR/desktop-bundle/"
  cp "$PROJECT_ROOT/requirements.txt"  "$BUILD_DIR/desktop-bundle/"
  [ -f "$PROJECT_ROOT/schema.sql" ] && \
    cp "$PROJECT_ROOT/schema.sql"      "$BUILD_DIR/desktop-bundle/"
  [ -d "$PROJECT_ROOT/src" ] && \
    cp -r "$PROJECT_ROOT/src"          "$BUILD_DIR/desktop-bundle/"

  cd "$BUILD_DIR"
  zip -r "masterpiece-swarm-trader-desktop-${RUN_NUMBER}.zip" desktop-bundle/
  rm -rf desktop-bundle

  echo ">>> Desktop bundle: $BUILD_DIR/masterpiece-swarm-trader-desktop-${RUN_NUMBER}.zip"
}

# ── Python tests ──────────────────────────────────────
run_tests() {
  echo ""
  echo ">>> Running Python unit tests..."
  require_cmd python3 "Install Python 3.11+"
  cd "$PROJECT_ROOT"
  pip install python-dotenv fastapi --quiet || true
  python3 -m pytest test_main.py -v --tb=short 2>/dev/null || \
    python3 -m unittest test_main -v
  echo ">>> Tests complete."
}

# ── Main dispatcher ───────────────────────────────────
mkdir -p "$BUILD_DIR"

case "$PLATFORM" in
  android)  build_android ;;
  desktop)  build_desktop ;;
  test)     run_tests ;;
  all)
    run_tests
    build_android
    build_desktop
    ;;
  *)
    echo "Usage: $0 {android|desktop|test|all}"
    exit 1
    ;;
esac

echo ""
echo "Build artifacts in: $BUILD_DIR"
echo "Done."
