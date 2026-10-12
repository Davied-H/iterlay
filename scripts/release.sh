#!/usr/bin/env bash
# Build an unsigned Apple Silicon DMG locally. No upload or credentials.
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "This script currently supports macOS Apple Silicon only." >&2
  exit 1
fi
export CSC_IDENTITY_AUTO_DISCOVERY=false
pnpm build
node scripts/prepare-ffmpeg.mjs
pnpm exec electron-builder --mac dmg --arm64 --publish never
node scripts/verify-packaged-ffmpeg.mjs
