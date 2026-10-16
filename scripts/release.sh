#!/usr/bin/env bash
# Build unsigned desktop installers locally or in CI. No upload or credentials.
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"
PLATFORM=mac
ARCH=arm64
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="${2:?Missing platform: mac or win}"; shift 2 ;;
    --arch) ARCH="${2:?Missing architecture: arm64, x64 or all}"; shift 2 ;;
    *) echo "Usage: pnpm release [--platform mac|win] [--arch arm64|x64|all]" >&2; exit 1 ;;
  esac
done
case "$PLATFORM" in
  mac) [[ "$(uname -s)" == "Darwin" ]] || { echo "Build macOS installers on macOS." >&2; exit 1; } ;;
  win) case "$(uname -s)" in MINGW*|MSYS*) ;; *) echo "Build Windows installers with Git Bash on Windows." >&2; exit 1 ;; esac ;;
  *) echo "Unsupported platform: $PLATFORM" >&2; exit 1 ;;
esac
case "$ARCH" in
  arm64|x64) ARCHITECTURES=("$ARCH") ;;
  all) ARCHITECTURES=(arm64 x64) ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac
export CSC_IDENTITY_AUTO_DISCOVERY=false
export ELECTRON_BUILDER_COMPRESSION_LEVEL=9
pnpm build
for TARGET_ARCH in "${ARCHITECTURES[@]}"; do
  if [[ "$PLATFORM" == "mac" ]]; then
    pnpm exec electron-builder --mac dmg "--$TARGET_ARCH" --publish never
    APP_PATH="release/mac-arm64/Iterlay.app"
    [[ "$TARGET_ARCH" != "x64" ]] || APP_PATH="release/mac/Iterlay.app"
  else
    pnpm exec electron-builder --win nsis "--$TARGET_ARCH" --publish never
    APP_PATH="release/win-unpacked"
    [[ "$TARGET_ARCH" != "arm64" ]] || APP_PATH="release/win-arm64-unpacked"
  fi
  node scripts/verify-package-size.mjs --app-path "$APP_PATH" --report "output/package-size/$PLATFORM-$TARGET_ARCH.json"
done
