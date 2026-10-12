import { OFFICIAL_MAX_IMAGE_COUNT, type ProviderConfig } from "@shared/types";

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
