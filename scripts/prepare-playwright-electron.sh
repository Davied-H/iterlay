#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ELECTRON_EXECUTABLE=$(node -e 'process.stdout.write(require("electron"))')

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' "$ELECTRON_EXECUTABLE"
  exit 0
fi

ELECTRON_VERSION=$(node -p 'require("electron/package.json").version')
SOURCE_APP=${ELECTRON_EXECUTABLE%/Contents/MacOS/Electron}
TARGET_APP="$ROOT_DIR/tmp/playwright-electron-$ELECTRON_VERSION/Iterlay.app"

if [[ ! -x "$TARGET_APP/Contents/MacOS/Electron" ]]; then
  mkdir -p "$(dirname "$TARGET_APP")"
  cp -cR "$SOURCE_APP" "$TARGET_APP"
  /usr/libexec/PlistBuddy -c 'Set :CFBundleName Iterlay' "$TARGET_APP/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Iterlay' "$TARGET_APP/Contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c 'Add :CFBundleDisplayName string Iterlay' "$TARGET_APP/Contents/Info.plist"
fi

printf '%s\n' "$TARGET_APP/Contents/MacOS/Electron"
