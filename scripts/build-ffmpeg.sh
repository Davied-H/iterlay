#!/usr/bin/env bash
# Build the separately distributed media tools from pinned, redistributable sources.
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'macOS ARM64 required' >&2; exit 1; }
command -v pkg-config >/dev/null || { echo 'Install pkgconf (brew install pkgconf)' >&2; exit 1; }
OUTPUT_DIR="${1:-$ROOT_DIR/output/media-tools/ffmpeg6-r1-darwin-arm64/staging}"
mkdir -p "$OUTPUT_DIR/licenses"
OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FFMPEG_SOURCE=ffmpeg-6.0.tar.xz
X264_SOURCE=x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz
curl -fL --retry 2 https://ffmpeg.org/releases/ffmpeg-6.0.tar.xz -o "$WORK/$FFMPEG_SOURCE"
curl -fL --retry 2 https://github.com/mirror/x264/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz -o "$WORK/$X264_SOURCE"
printf '%s  %s\n' 57be87c22d9b49c112b6d24bc67d42508660e6b718b3db89c44e47e289137082 "$WORK/$FFMPEG_SOURCE" cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9 "$WORK/$X264_SOURCE" | shasum -a 256 -c -
tar -xf "$WORK/$FFMPEG_SOURCE" -C "$WORK"
tar -xf "$WORK/$X264_SOURCE" -C "$WORK"
cd "$WORK/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55"
CFLAGS=-mmacosx-version-min=14.0 LDFLAGS=-mmacosx-version-min=14.0 ./configure --prefix="$WORK/static" --enable-static --disable-cli --disable-opencl
make -j8
make install
cd "$WORK/ffmpeg-6.0"
PKG_CONFIG_PATH="$WORK/static/lib/pkgconfig" ./configure --disable-autodetect --disable-doc --disable-debug --disable-shared --enable-static --disable-programs --enable-ffmpeg --enable-ffprobe --enable-gpl --enable-libx264 --enable-videotoolbox --enable-audiotoolbox --pkg-config-flags=--static --extra-cflags=-mmacosx-version-min=14.0 --extra-ldflags="-L$WORK/static/lib -mmacosx-version-min=14.0" --cc=clang
make -j8
cp ffmpeg ffprobe "$OUTPUT_DIR/"
chmod 755 "$OUTPUT_DIR/ffmpeg" "$OUTPUT_DIR/ffprobe"
cp COPYING.GPLv2 "$OUTPUT_DIR/licenses/FFmpeg-GPL-2.0.txt"
cp LICENSE.md "$OUTPUT_DIR/licenses/FFmpeg-LICENSE.md"
cp README.md "$OUTPUT_DIR/licenses/FFmpeg-README.md"
cp "$WORK/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55/COPYING" "$OUTPUT_DIR/licenses/x264-COPYING"
cp "$WORK/$FFMPEG_SOURCE" "$WORK/$X264_SOURCE" "$OUTPUT_DIR/licenses/"
cp "$ROOT_DIR/scripts/build-ffmpeg.sh" "$OUTPUT_DIR/licenses/build-ffmpeg.sh"
