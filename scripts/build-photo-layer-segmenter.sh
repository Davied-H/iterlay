#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT_DIR="$ROOT_DIR/resources/native"
SOURCE="$ROOT_DIR/native/photo-layer-segmenter.swift"
mkdir -p "$OUTPUT_DIR"

for ARCH in arm64 x86_64; do
  xcrun --sdk macosx swiftc \
    -O \
    -whole-module-optimization \
    -target "${ARCH}-apple-macosx14.0" \
    "$SOURCE" \
    -o "$OUTPUT_DIR/photo-layer-segmenter-$ARCH"
done

chmod +x "$OUTPUT_DIR"/photo-layer-segmenter-*
