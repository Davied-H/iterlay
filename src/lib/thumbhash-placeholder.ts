import { thumbHashToApproximateAspectRatio, thumbHashToDataURL } from "thumbhash";

/**
 * ThumbHash（base64）→ 占位图 dataUrl / 近似宽高比。
 * 模块级缓存：hash 数量与素材同量级且每条极小，无需 LRU。
 * 解码失败（损坏 hash）缓存空值，返回 null，调用方降级为无占位。
 */

const dataUrlCache = new Map<string, string>();
const ratioCache = new Map<string, number>();

function bytesFromBase64(hash: string): Uint8Array {
  const binary = atob(hash);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function getThumbHashDataUrl(hash: string | undefined): string | null {
  if (!hash) return null;
  const cached = dataUrlCache.get(hash);
  if (cached !== undefined) return cached === "" ? null : cached;
  try {
    const dataUrl = thumbHashToDataURL(bytesFromBase64(hash));
    dataUrlCache.set(hash, dataUrl);
    return dataUrl;
  } catch {
    dataUrlCache.set(hash, "");
    return null;
  }
}

export function getThumbHashRatio(hash: string | undefined): number | null {
  if (!hash) return null;
  const cached = ratioCache.get(hash);
  if (cached !== undefined) return cached > 0 ? cached : null;
  try {
    const ratio = thumbHashToApproximateAspectRatio(bytesFromBase64(hash));
    ratioCache.set(hash, Number.isFinite(ratio) && ratio > 0 ? ratio : -1);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  } catch {
    ratioCache.set(hash, -1);
    return null;
  }
}
