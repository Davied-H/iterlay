import { GPT_IMAGE_MAX_PIXELS } from "./workflow.js";

export const OFFICIAL_REFERENCE_MAX_PIXELS = GPT_IMAGE_MAX_PIXELS;
export const OFFICIAL_REFERENCE_MAX_EDGE = 4096;
export const ASSISTANT_REFERENCE_MAX_BYTES = 8 * 1024 * 1024;
export const ASSISTANT_REFERENCES_MAX_TOTAL_BYTES = 12 * 1024 * 1024;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ReferenceImageLimitViolation {
  exceedsPixels: boolean;
  exceedsEdge: boolean;
}

export function getAssistantReferenceByteBudget(referenceCount: number): number {
  const count = Number.isInteger(referenceCount) && referenceCount > 0 ? referenceCount : 1;
  return Math.min(
    ASSISTANT_REFERENCE_MAX_BYTES,
    Math.floor(ASSISTANT_REFERENCES_MAX_TOTAL_BYTES / count)
  );
}

export function getReferenceImageLimitViolation(
  width: number,
  height: number
): ReferenceImageLimitViolation | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const exceedsPixels = width * height > OFFICIAL_REFERENCE_MAX_PIXELS;
  const exceedsEdge = Math.max(width, height) > OFFICIAL_REFERENCE_MAX_EDGE;
  return exceedsPixels || exceedsEdge ? { exceedsPixels, exceedsEdge } : null;
}

export function constrainReferenceImageDimensions(width: number, height: number): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const edgeScale = OFFICIAL_REFERENCE_MAX_EDGE / Math.max(width, height);
  const pixelScale = Math.sqrt(OFFICIAL_REFERENCE_MAX_PIXELS / (width * height));
  const scale = Math.min(1, edgeScale, pixelScale);
  const constrained = {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
  while (constrained.width * constrained.height > OFFICIAL_REFERENCE_MAX_PIXELS) {
    if (constrained.width >= constrained.height) constrained.width -= 1;
    else constrained.height -= 1;
  }
  return constrained;
}

export function formatReferenceImageLimitMessage(
  width: number,
  height: number,
  index?: number
): string {
  const prefix = index === undefined ? "参考图" : `第 ${index + 1} 张参考图`;
  const maxPixels = (OFFICIAL_REFERENCE_MAX_PIXELS / 10_000).toFixed(1);
  return `${prefix}分辨率/总像素过大（${width}x${height}），官方 Provider 最多支持长边 ${OFFICIAL_REFERENCE_MAX_EDGE} 像素、总计 ${maxPixels} 万像素。请缩小尺寸或切分图片后重试。`;
}
