import { OFFICIAL_MAX_IMAGE_COUNT, type ProviderConfig } from "./types.js";

const CUSTOM_PROVIDER_MAX_IMAGE_COUNT = 99;

export function getProviderMaxImageCount(provider?: ProviderConfig): number {
  if (!provider) return CUSTOM_PROVIDER_MAX_IMAGE_COUNT;
  if (provider.type === "official" || provider.type === "fal") return OFFICIAL_MAX_IMAGE_COUNT;
  if (provider.type === "ark") return 4;
  if (provider.type !== "bailian") return CUSTOM_PROVIDER_MAX_IMAGE_COUNT;

  const model = provider.model.trim();
  if (model === "qwen-image-edit" || model === "qwen-image" || /^qwen-image-(?:plus|max)(?:-|$)/.test(model)) {
    return 1;
  }
  return model.startsWith("wan2.7-image") ? 4 : 6;
}

export interface ProviderImageSizeOption {
  value: string;
  ratio: string;
}

const STANDARD_IMAGE_SIZES: readonly ProviderImageSizeOption[] = [
  { value: "auto", ratio: "自动" },
  { value: "1024x1024", ratio: "1:1 · 方形" },
  { value: "1536x1024", ratio: "3:2 · 横图" },
  { value: "1024x1536", ratio: "2:3 · 竖图" }
];

const EXTENDED_IMAGE_SIZES: readonly ProviderImageSizeOption[] = [
  ...STANDARD_IMAGE_SIZES,
  { value: "2048x2048", ratio: "1:1 · 2K 方形" },
  { value: "2048x1152", ratio: "16:9 · 2K 横图" },
  { value: "3840x2160", ratio: "16:9 · 4K 横图" },
  { value: "2160x3840", ratio: "9:16 · 4K 竖图" }
];

/** 返回当前图片 Provider 可在生成界面直接选择的尺寸。 */
export function getProviderImageSizeOptions(
  provider?: Pick<ProviderConfig, "type">
): readonly ProviderImageSizeOption[] {
  return provider?.type === "official" ? STANDARD_IMAGE_SIZES : EXTENDED_IMAGE_SIZES;
}

export function providerSupportsCustomImageSize(
  provider?: Pick<ProviderConfig, "type">
): boolean {
  return provider?.type !== "official";
}

export function providerSupportsTransparentBackground(provider?: ProviderConfig): boolean {
  if (!provider) return false;
  // The legacy built-in official Provider has been removed; it is not the OpenAI API.
  if (provider.type === "official") return false;
  if (provider.type === "codex-oauth") return true;
  if (provider.type !== "openai-compatible") return false;
  return provider.apiMode === "responses"
    || /\/responses\/?$/u.test(provider.generationEndpoint)
    || /^gpt-image-/iu.test(provider.model.trim());
}

export function providerSupportsGenerateReferences(provider: ProviderConfig): boolean {
  // Images API routes reference-based creation through the configured edits endpoint.
  return provider.supportsReferenceImages && provider.type !== "poe";
}

export function imageProviderCapabilities(provider: ProviderConfig) {
  return {
    maxImageCount: getProviderMaxImageCount(provider),
    transparentBackground: providerSupportsTransparentBackground(provider),
    generationReferences: providerSupportsGenerateReferences(provider),
    editing: provider.supportsReferenceImages,
    sizes: getProviderImageSizeOptions(provider),
    customSize: providerSupportsCustomImageSize(provider)
  };
}
