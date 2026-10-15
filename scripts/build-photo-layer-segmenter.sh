#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then exit 0; fi
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT_DIR="$ROOT_DIR/resources/native"
SOURCE="$ROOT_DIR/native/photo-layer-segmenter.swift"
STAMP="$OUTPUT_DIR/.build-stamp"
mkdir -p "$OUTPUT_DIR"
BUILD_KEY=$({ cat "$SOURCE"; xcrun swiftc --version; xcrun --sdk macosx --show-sdk-version; printf '%s\n' 'O whole-module-optimization arm64 x86_64 macosx14.0'; } | shasum -a 256 | awk '{print $1}')
if [[ -f "$STAMP" && "$(cat "$STAMP")" == "$BUILD_KEY" && -x "$OUTPUT_DIR/photo-layer-segmenter-arm64" && -x "$OUTPUT_DIR/photo-layer-segmenter-x86_64" ]]; then
  echo "Native image services are up to date."
  exit 0
fi
trap 'rm -f "$OUTPUT_DIR"/photo-layer-segmenter-*.$$.tmp "$STAMP.$$.tmp"' EXIT
for ARCH in arm64 x86_64; do
  TEMPORARY="$OUTPUT_DIR/photo-layer-segmenter-$ARCH.$$.tmp"
  xcrun --sdk macosx swiftc -O -whole-module-optimization -target "${ARCH}-apple-macosx14.0" "$SOURCE" -o "$TEMPORARY"
  chmod +x "$TEMPORARY"
  mv "$TEMPORARY" "$OUTPUT_DIR/photo-layer-segmenter-$ARCH"
done
printf '%s\n' "$BUILD_KEY" > "$STAMP.$$.tmp"
mv "$STAMP.$$.tmp" "$STAMP"
