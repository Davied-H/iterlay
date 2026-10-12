#!/usr/bin/env bash
# Build redistributable static tools without nonfree components.
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'macOS ARM64 required' >&2; exit 1; }
command -v pkg-config >/dev/null || { echo 'Install pkgconf (brew install pkgconf)' >&2; exit 1; }
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
curl -fL --retry 2 https://ffmpeg.org/releases/ffmpeg-6.0.tar.xz -o "$WORK/ffmpeg.tar.xz"
curl -fL --retry 2 https://github.com/mirror/x264/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz -o "$WORK/x264.tar.gz"
printf '%s  %s\n' 57be87c22d9b49c112b6d24bc67d42508660e6b718b3db89c44e47e289137082 "$WORK/ffmpeg.tar.xz" cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9 "$WORK/x264.tar.gz" | shasum -a 256 -c -
tar -xf "$WORK/ffmpeg.tar.xz" -C "$WORK"
tar -xf "$WORK/x264.tar.gz" -C "$WORK"
cd "$WORK/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55"
CFLAGS=-mmacosx-version-min=14.0 LDFLAGS=-mmacosx-version-min=14.0 ./configure --prefix="$WORK/static" --enable-static --disable-cli --disable-opencl
make -j8
make install
cd "$WORK/ffmpeg-6.0"
PKG_CONFIG_PATH="$WORK/static/lib/pkgconfig" ./configure --disable-autodetect --disable-doc --disable-debug --disable-shared --enable-static --disable-programs --enable-ffmpeg --enable-ffprobe --enable-gpl --enable-libx264 --enable-videotoolbox --enable-audiotoolbox --pkg-config-flags=--static --extra-cflags=-mmacosx-version-min=14.0 --extra-ldflags="-L$WORK/static/lib -mmacosx-version-min=14.0" --cc=clang
make -j8
mkdir -p "$ROOT_DIR/resources/ffmpeg" "$ROOT_DIR/resources/licenses"
cp ffmpeg ffprobe "$ROOT_DIR/resources/ffmpeg/"
cp COPYING.GPLv2 "$ROOT_DIR/resources/licenses/FFmpeg-GPL-2.0.txt"
cp LICENSE.md "$ROOT_DIR/resources/licenses/FFmpeg-LICENSE.md"
cp README.md "$ROOT_DIR/resources/licenses/FFmpeg-README.md"
cp "$WORK/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55/COPYING" "$ROOT_DIR/resources/licenses/x264-COPYING"
