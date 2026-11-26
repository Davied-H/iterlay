import type { ImageOutputFormat, ProviderImageResult } from "../../shared/types.js";
import { detectRemoteImageMime } from "../remote-image.js";
import { sanitizeSvg } from "./svg-artifact.js";

export function detectGeneratedImageMime(bytes: Buffer): string | null {
  return detectRemoteImageMime(bytes) ?? (/<svg(?:\s|>)/u.test(bytes.toString("utf8", 0, 4096)) ? "image/svg+xml" : null);
}

/** Bound all GIF frame allocations before any native/browser decoder sees the bytes. */
export function inspectGif(bytes: Buffer) {
  const invalid = () => new Error("GIF 动画无效、数据不完整或帧像素量超出限制。");
  if (bytes.length < 14 || !/^GIF8[79]a$/u.test(bytes.toString("ascii", 0, 6))) throw invalid();
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
  if (!width || !height || width > 16384 || height > 16384) throw invalid();
  let position = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
  let frameCount = 0, pixels = 0, animationDurationMs = 0, delay = 0;
  const delays: number[] = [];
  const skipBlocks = () => {
    while (position < bytes.length) {
      const length = bytes[position++];
      if (length === 0) return;
      position += length;
    }
    throw invalid();
  };
  while (position < bytes.length) {
    const type = bytes[position++];
    if (type === 0x3b) {
      if (!frameCount) throw invalid();
      return { width, height, frameCount, animationDurationMs, frameDurationMs: delays.every((value) => value === delays[0]) ? delays[0] : undefined };
    }
    if (type === 0x21) {
      if (position >= bytes.length) throw invalid();
      const label = bytes[position++];
      if (label === 0xf9) {
        if (position + 6 > bytes.length || bytes[position] !== 4 || bytes[position + 5] !== 0) throw invalid();
        delay = bytes.readUInt16LE(position + 2) * 10;
      }
      skipBlocks();
    } else if (type === 0x2c) {
      if (position + 9 > bytes.length) throw invalid();
      const x = bytes.readUInt16LE(position), y = bytes.readUInt16LE(position + 2);
      const w = bytes.readUInt16LE(position + 4), h = bytes.readUInt16LE(position + 6);
      if (!w || !h || x + w > width || y + h > height) throw invalid();
      pixels += width * height;
      if (++frameCount > 256 || pixels > 32 * 1024 * 1024) throw invalid();
      const packed = bytes[position + 8];
      position += 9 + (packed & 128 ? 3 * (1 << ((packed & 7) + 1)) : 0);
      if (position >= bytes.length || bytes[position] < 2 || bytes[position] > 8) throw invalid();
      position++;
      skipBlocks();
      animationDurationMs += delay;
      delays.push(delay);
      delay = 0;
    } else throw invalid();
  }
  throw invalid();
}

export function normalizeGeneratedImage(image: ProviderImageResult, requested?: ImageOutputFormat): ProviderImageResult {
  if (!image.bytes.length || image.bytes.length > 25 * 1024 * 1024) throw new Error("生成图片为空或超过 25 MB。");
  const actualMime = detectGeneratedImageMime(image.bytes);
  const expected = requested ? { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" }[requested] : undefined;
  if (expected && (actualMime ?? image.mimeType.split(";")[0]) !== expected) throw new Error(`上游返回的图片格式与请求的 ${requested?.toUpperCase()} 不一致。`);
  if (actualMime === "image/svg+xml" || image.mimeType === "image/svg+xml") {
    const { bytes, width, height } = sanitizeSvg(image.bytes);
    return { ...image, bytes, mimeType: "image/svg+xml", width, height };
  }
  if (actualMime === "image/gif" || image.mimeType === "image/gif") {
    const metadata = inspectGif(image.bytes);
    if (requested === "gif" && metadata.frameCount < 2) throw new Error("上游返回了静态 GIF，未生成多帧动画。");
    return { ...image, mimeType: "image/gif", ...metadata };
  }
  return { ...image, mimeType: actualMime ?? image.mimeType };
}
