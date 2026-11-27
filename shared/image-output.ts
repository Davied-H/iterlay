import type { GenerateImageInput, ImageOutputFormat, ProviderConfig } from "./types.js";

export const IMAGE_OUTPUT_FORMATS = ["png", "jpeg", "webp", "svg", "gif"] as const;
export const IMAGE_OUTPUT_LABELS: Record<ImageOutputFormat, string> = {
  png: "PNG", jpeg: "JPEG", webp: "WebP", svg: "SVG 矢量图", gif: "GIF 动图"
};
export const DEFAULT_GIF_FRAME_COUNT = 9;
export const DEFAULT_GIF_FRAME_DURATION_MS = 200;

export function automaticImageControls(provider?: Pick<ProviderConfig, "type"> & Partial<Pick<ProviderConfig, "imageControlMode">>): boolean {
  if (provider?.imageControlMode) return provider.imageControlMode === "automatic";
  return provider?.type === "codex-oauth";
}

/** Extended formats require explicit configuration; model names are not evidence. */
export function imageOutputCapabilities(provider?: ProviderConfig, model = provider?.model ?? ""): { outputFormats: ImageOutputFormat[]; svgModel?: string; svgMode?: "native" | "author" } {
  const imagesApi = !automaticImageControls(provider) && provider?.type === "openai-compatible" && provider.apiMode !== "responses"
    && !/\/responses\/?$/u.test(provider.generationEndpoint);
  if (!imagesApi) return { outputFormats: ["png"] as ImageOutputFormat[], svgModel: undefined };
  const configured = provider.imageCapabilities && Object.hasOwn(provider.imageCapabilities, model) ? provider.imageCapabilities[model] : undefined;
  if (configured) {
    if (configured.svgMode !== undefined && !["native", "author"].includes(configured.svgMode)) throw new Error("SVG 生成方式配置无效。");
    if (!Array.isArray(configured.outputFormats) || !configured.outputFormats.length
      || configured.outputFormats.some((format) => !IMAGE_OUTPUT_FORMATS.includes(format))) throw new Error("模型输出格式配置无效。");
    return configured;
  }
  return {
    outputFormats: ["png", "jpeg", "webp"] as ImageOutputFormat[],
    svgModel: undefined
  };
}

export function imageOutputConfigurationKey(provider: ProviderConfig, model = provider.model): string {
  return JSON.stringify([provider.id, provider.type, provider.baseUrl.trim(), provider.apiMode ?? "images",
    provider.generationEndpoint, provider.referenceEndpoint ?? "", provider.imageControlMode ?? "native",
    provider.compatResponseFormat ?? "", provider.credentialRevision ?? "", model,
    imageOutputCapabilities(provider, model).svgModel ?? "", imageOutputCapabilities(provider, model).svgMode ?? "native"]);
}

export function imageOutputVerification(provider: ProviderConfig, format: ImageOutputFormat, model = provider.model) {
  const record = provider.imageOutputVerifications?.[model]?.[format];
  return record && record.configurationKey === imageOutputConfigurationKey(provider, model) ? record : undefined;
}

export function imageOutputCapabilityEvidence(provider: ProviderConfig, model = provider.model) {
  const formats = imageOutputCapabilities(provider, model).outputFormats;
  return {
    capabilitySource: "local-configuration" as const,
    verifiedOutputFormats: formats.filter((format) => imageOutputVerification(provider, format, model)?.status === "passed"),
    outputVerification: Object.fromEntries(formats.map((format) => [format, imageOutputVerification(provider, format, model) ?? { status: "not-tested" }]))
  };
}

export function normalizeImageOutput<T extends Pick<GenerateImageInput,
  "outputFormat" | "frameCount" | "frameDurationMs" | "size" | "background" | "workflowMode" | "referenceImages" | "model"
>>(input: T, provider: ProviderConfig): T {
  const outputFormat = input.outputFormat ?? "png";
  const capabilities = imageOutputCapabilities(provider, input.model || provider.model);
  if (!capabilities.outputFormats.includes(outputFormat) && !(automaticImageControls(provider) && ["png", "jpeg", "webp"].includes(outputFormat))) throw new Error("当前模型不支持该输出格式，请切换模型或输出格式。");
  if (["svg", "gif"].includes(outputFormat) && imageOutputVerification(provider, outputFormat, input.model || provider.model)?.status !== "passed") throw new Error("请先在模型设置中验证该输出格式；验证通过后才能生成。");
  if (input.background === "transparent" && !["png", "webp"].includes(outputFormat)) throw new Error("透明背景请使用 PNG 或 WebP 格式。");
  if (input.referenceImages.some((image) => image.mimeType === "image/svg+xml")) throw new Error("SVG 不能直接用作参考图，请先导出为 PNG。");
  if (outputFormat === "svg") {
    if (input.workflowMode === "edit" || input.referenceImages.length) throw new Error("SVG 当前仅支持新作品生成，不能使用参考图。");
    if (!capabilities.svgModel?.trim()) throw new Error("SVG 输出需要配置作者模型。");
  }
  if (outputFormat === "gif") {
    const frameCount = input.frameCount ?? DEFAULT_GIF_FRAME_COUNT;
    const frameDurationMs = input.frameDurationMs ?? DEFAULT_GIF_FRAME_DURATION_MS;
    if (!Number.isInteger(frameCount) || frameCount < 4 || frameCount > 16
      || !Number.isInteger(frameDurationMs) || frameDurationMs < 20 || frameDurationMs > 10000 || frameDurationMs % 10 !== 0) {
      throw new Error("GIF 支持 4–16 帧，每帧 20–10000 毫秒，且为 10 的倍数。");
    }
    const size = !input.size || input.size === "auto" ? "512x512" : input.size;
    if (size !== "512x512") throw new Error("GIF 请使用 512×512 尺寸。");
    return { ...input, outputFormat, size, frameCount, frameDurationMs };
  }
  if (input.frameCount !== undefined || input.frameDurationMs !== undefined) throw new Error("帧数和帧时长仅用于 GIF。");
  return { ...input, outputFormat };
}

/** Provider-specific extension fields go only to the compatible Images API. */
export function imageOutputRequestFields(input: { outputFormat?: ImageOutputFormat; frameCount?: number; frameDurationMs?: number; model: string }, provider: ProviderConfig) {
  return {
    output_format: input.outputFormat ?? "png",
    ...(input.outputFormat === "svg" ? { svg: { model: imageOutputCapabilities(provider, input.model || provider.model).svgModel } } : {}),
    ...(input.outputFormat === "gif" ? { frame_count: input.frameCount ?? DEFAULT_GIF_FRAME_COUNT, frame_duration_ms: input.frameDurationMs ?? DEFAULT_GIF_FRAME_DURATION_MS } : {})
  };
}

/** These artifacts must keep their original representation in the raster editor/thumbnail path. */
export function isOriginalFormatImage(imagePath: string): boolean {
  return /\.(?:svg|gif)$/iu.test(imagePath);
}
