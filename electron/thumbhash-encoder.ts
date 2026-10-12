import { rgbaToThumbHash } from "thumbhash";
import type { NativeImage } from "electron";

/** ThumbHash 编码产物：hash 为 base64，width/height 为源图原始尺寸（供列表回填缺失宽高）。 */
export interface ThumbHashResult {
  hash: string;
  hasAlpha: boolean;
  width: number;
  height: number;
}

/** thumbhash 算法要求输入图最长边不超过 100px。 */
const MAX_THUMBHASH_INPUT = 100;

/**
 * Electron `toBitmap()` 返回的是 premultiplied BGRA；thumbhash 需要 straight RGBA，
 * 否则半透明贴纸边缘会发暗。alpha 为 0 时通道值也为 0，无需除零保护之外的处理。
 */
export function bgraToRgba(buffer: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 4) {
    const b = buffer[i];
    const g = buffer[i + 1];
    const r = buffer[i + 2];
    const a = buffer[i + 3];
    if (a === 0 || a === 255) {
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
    } else {
      rgba[i] = Math.min(255, Math.round((r * 255) / a));
      rgba[i + 1] = Math.min(255, Math.round((g * 255) / a));
      rgba[i + 2] = Math.min(255, Math.round((b * 255) / a));
    }
    rgba[i + 3] = a;
  }
  return rgba;
}

/** 判断是否存在透明像素（阈值 250：容忍解码取整误差，不把不透明图误判为贴纸）。 */
export function detectAlpha(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 250) return true;
  }
  return false;
}

/** 对 straight RGBA 像素编码 ThumbHash（输入需已缩至 ≤100px）。 */
export function encodeThumbHashEntry(
  rgba: Uint8Array,
  width: number,
  height: number
): { hash: string; hasAlpha: boolean } {
  const hash = rgbaToThumbHash(width, height, rgba);
  return { hash: Buffer.from(hash).toString("base64"), hasAlpha: detectAlpha(rgba) };
}

/**
 * 从 NativeImage 实例编码 ThumbHash。仅使用实例方法，不 import electron 运行时，
 * 保证本模块的纯函数可在 node 环境单测。
 * 失败返回 null（缺 thumbhash 只是没有占位图，调用方静默降级）。
 */
export function createThumbHashForImage(image: NativeImage): ThumbHashResult | null {
  try {
    if (image.isEmpty()) return null;
    const size = image.getSize();
    if (size.width <= 0 || size.height <= 0) return null;
    const scale = Math.min(1, MAX_THUMBHASH_INPUT / Math.max(size.width, size.height));
    const small = scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: "good"
        })
      : image;
    const smallSize = small.getSize();
    const bitmap = small.toBitmap({ scaleFactor: 1 });
    // Retina 下 scaleFactor 表示可能与逻辑尺寸不符；长度对不上时放弃而非产出错误 hash。
    if (bitmap.length !== smallSize.width * smallSize.height * 4) return null;
    const rgba = bgraToRgba(bitmap);
    const { hash, hasAlpha } = encodeThumbHashEntry(rgba, smallSize.width, smallSize.height);
    return { hash, hasAlpha, width: size.width, height: size.height };
  } catch {
    return null;
  }
}
