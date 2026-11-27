import type { GenerateResponse, GenerationJob, ImageDeliveryOptions, ProviderImageResult } from "../../shared/types.js";
import { deliveryDimensions, normalizeImageDelivery, RASTER_OUTPUT_FORMATS } from "../../shared/image-output-delivery.js";
import { normalizeGeneratedImage } from "../media/image-artifact.js";
import { imageDimensionsFromHeader } from "../media/image-metadata.js";

export type ImageDeliveryEncoder = (bytes: Buffer, options: ImageDeliveryOptions & { format: "png" | "jpeg" | "webp" }) => Promise<ProviderImageResult>;

export function generationImageOutputs(job: GenerationJob, url: (file: string) => string): GenerateResponse["images"] {
  return job.outputImagePaths.map((file, index) => {
    const original = job.originalImagePaths?.[index];
    return { path: file, dataUrl: url(file), original: original && original !== file
      ? { path: original, dataUrl: url(original), width: job.originalOutputMetadata?.[index]?.width, height: job.originalOutputMetadata?.[index]?.height }
      : undefined };
  });
}

export function originalImageMetadata(image: ProviderImageResult): Omit<ProviderImageResult, "bytes"> {
  return { mimeType: image.mimeType, width: image.width, height: image.height,
    frameCount: image.frameCount, frameDurationMs: image.frameDurationMs, animationDurationMs: image.animationDurationMs,
    ...imageDimensionsFromHeader(image.bytes) };
}

export function requestedImageDelivery(job: GenerationJob): ImageDeliveryOptions | undefined {
  const explicit = normalizeImageDelivery(job.input.delivery);
  const format = job.input.outputFormat;
  const raster = RASTER_OUTPUT_FORMATS.find((candidate) => candidate === format);
  return explicit || raster ? { ...explicit, format: explicit?.format ?? raster } : undefined;
}

/** Local-only stage. An encoding/validation failure never discards paid-for originals. */
export async function deliverImageJob(
  job: GenerationJob,
  originals: ProviderImageResult[],
  options: ImageDeliveryOptions | undefined,
  encode: ImageDeliveryEncoder | undefined,
  save: (images: ProviderImageResult[]) => Promise<string[]>
): Promise<GenerationJob> {
  const warnings = [...(job.generationWarnings ?? job.warnings ?? [])];
  const originalImagePaths = job.originalImagePaths ?? job.outputImagePaths;
  const fallback = { ...job, outputImagePaths: originalImagePaths, outputMetadata: originals.map(originalImageMetadata) };
  try {
    // Vector and animation requests still enforce their own format/frame contracts.
    if (job.input.outputFormat === "svg" || job.input.outputFormat === "gif") {
      originals.forEach((image) => normalizeGeneratedImage(image, job.input.outputFormat));
    }
    const target = deliveryDimensions(options?.size);
    const outputs: ProviderImageResult[] = [];
    let changed = false;
    for (const image of originals) {
      const metadata = originalImageMetadata(image);
      const nativeSize = deliveryDimensions(/^\d+x\d+$/u.test(job.input.size) ? job.input.size : undefined);
      if (nativeSize && metadata.width && metadata.height && (metadata.width !== nativeSize.width || metadata.height !== nativeSize.height)) {
        warnings.push(`上游原图为 ${metadata.width}×${metadata.height}，与尺寸请求 ${nativeSize.width}×${nativeSize.height} 不同；原图已保留。`);
      }
      const format = options?.format ?? RASTER_OUTPUT_FORMATS.find((value) => image.mimeType === `image/${value}`);
      const expectedMime = format === "jpeg" ? "image/jpeg" : format ? `image/${format}` : image.mimeType;
      const conversion = expectedMime !== image.mimeType || Boolean(target && (target.width !== metadata.width || target.height !== metadata.height)) || options?.quality !== undefined;
      if (!conversion) { outputs.push(image); continue; }
      if (!format || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)) throw new Error("本地交付仅处理静态 PNG、JPEG、WebP；原始格式已保留。");
      if (!encode) throw new Error("本地图片编码器不可用，原图已保留，请重试本地交付。");
      const encoded = normalizeGeneratedImage(await encode(image.bytes, { ...options, format }), format);
      const actual = imageDimensionsFromHeader(encoded.bytes);
      if (!actual || target && (actual.width !== target.width || actual.height !== target.height)) throw new Error("本地交付的实际像素未通过验收，原图已保留。");
      outputs.push({ ...encoded, ...actual });
      if (expectedMime !== image.mimeType) warnings.push(`原图格式为 ${image.mimeType}，已在本地转换为 ${format.toUpperCase()}；原图已保留。`);
      changed = true;
    }
    const paths = changed ? await save(outputs) : originalImagePaths;
    return { ...job, outputImagePaths: paths, outputMetadata: outputs.map(originalImageMetadata), warnings,
      delivery: options || changed ? { status: "succeeded", options: options ?? {}, completedAt: new Date().toISOString() } : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fallback, warnings: [...warnings, `图片已生成，原图已保留；本地交付未完成：${message}`],
      delivery: { status: "failed", options: options ?? {}, error: message, completedAt: new Date().toISOString() } };
  }
}
