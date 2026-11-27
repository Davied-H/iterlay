import type { GenerationJob, ImageDeliveryOptions } from "./contracts/generation.js";
import type { BoardNodeVersion } from "./contracts/board.js";

export const RASTER_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
export const MAX_DELIVERY_PIXELS = 32_000_000;
export const MAX_DELIVERY_SIDE = 16384;

export function deliveryBoardVersions(job: GenerationJob, index: number): BoardNodeVersion[] | undefined {
  const original = job.originalImagePaths?.[index];
  if (!original) return undefined;
  const output = job.outputImagePaths[index];
  if (!output || original === output) return undefined;
  return [
    { imagePath: original, jobId: job.id, width: job.originalOutputMetadata?.[index]?.width, height: job.originalOutputMetadata?.[index]?.height },
    { imagePath: output, jobId: job.id, width: job.outputMetadata?.[index]?.width, height: job.outputMetadata?.[index]?.height }
  ];
}

export function deliveryNodeIndex(job: GenerationJob, node: { imagePath: string; versions?: BoardNodeVersion[] }): number {
  const current = job.outputImagePaths.indexOf(node.imagePath);
  if (current >= 0) return current;
  const native = job.originalImagePaths?.findIndex((file) => file === node.imagePath || node.versions?.some((version) => version.imagePath === file && version.jobId === job.id)) ?? -1;
  return native >= 0 ? native : job.outputImagePaths.length === 1 ? 0 : -1;
}

export function deliveryDimensions(size?: string): { width: number; height: number } | undefined {
  if (size === undefined || size === "auto" || size === "") return undefined;
  const match = /^(\d+)x(\d+)$/u.exec(size);
  const width = Number(match?.[1]), height = Number(match?.[2]);
  if (!match || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > MAX_DELIVERY_SIDE || height > MAX_DELIVERY_SIDE || width * height > MAX_DELIVERY_PIXELS) {
    throw new Error("交付尺寸须为 1–16384 的宽×高，且不能超过 3200 万像素。");
  }
  return { width, height };
}

export function normalizeImageDelivery(value: unknown): ImageDeliveryOptions | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("本地交付参数无效。");
  const item = value as ImageDeliveryOptions;
  if (item.format !== undefined && !RASTER_OUTPUT_FORMATS.includes(item.format)
    || item.size !== undefined && typeof item.size !== "string"
    || item.fit !== undefined && !["scale", "cover", "contain"].includes(item.fit)
    || item.quality !== undefined && (!Number.isInteger(item.quality) || item.quality < 1 || item.quality > 100)) throw new Error("本地交付格式、适配方式或质量无效。");
  const dimensions = deliveryDimensions(item.size);
  return { format: item.format, size: dimensions ? `${dimensions.width}x${dimensions.height}` : undefined, fit: item.fit ?? "scale", quality: item.quality };
}

/** Both runtime encoders use this geometry; a sizeable aspect change is always explicit. */
export function deliveryGeometry(source: { width: number; height: number }, target: { width: number; height: number }, fit: ImageDeliveryOptions["fit"] = "scale") {
  const { width, height } = target;
  if (source.width < 1 || source.height < 1 || source.width > MAX_DELIVERY_SIDE || source.height > MAX_DELIVERY_SIDE || source.width * source.height > MAX_DELIVERY_PIXELS) throw new Error("原图超出本地处理的尺寸限制。");
  deliveryDimensions(`${width}x${height}`);
  const delta = Math.abs(source.width / source.height - width / height) / (width / height);
  if (fit === "scale" && delta > 0.05) throw new Error("原图比例与交付比例相差超过 5%，原图已保留。请选择裁切填满或完整留白后重试本地交付。");
  let crop = { x: 0, y: 0, width: source.width, height: source.height };
  let resizeWidth = width, resizeHeight = height;
  if (fit === "cover") {
    if (source.width / source.height > width / height) crop = { ...crop, width: Math.max(1, Math.round(source.height * width / height)) };
    else crop = { ...crop, height: Math.max(1, Math.round(source.width * height / width)) };
    crop.x = Math.floor((source.width - crop.width) / 2);
    crop.y = Math.floor((source.height - crop.height) / 2);
  } else if (fit === "contain") {
    const factor = Math.min(width / source.width, height / source.height);
    resizeWidth = Math.max(1, Math.round(source.width * factor));
    resizeHeight = Math.max(1, Math.round(source.height * factor));
  }
  return { width, height, crop, resizeWidth, resizeHeight, offsetX: Math.floor((width - resizeWidth) / 2), offsetY: Math.floor((height - resizeHeight) / 2) };
}

export function deliveryAspectPrompt(prompt: string, size?: string): string {
  const target = deliveryDimensions(size);
  if (!target) return prompt;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(target.width, target.height);
  return `${prompt}\n\nCompose for a ${target.width / divisor}:${target.height / divisor} aspect ratio. The final pixel dimensions will be prepared locally; preserve the intended composition.`;
}
