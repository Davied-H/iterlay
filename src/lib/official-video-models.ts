import type { CreditStatus, VideoProviderConfig, VideoProviderModelOption } from "@shared/types";

export function mergeOfficialVideoCatalog(
  providers: VideoProviderConfig[],
  status: CreditStatus | null
): VideoProviderConfig[] {
  const models = Array.from(new Set((status?.videoModels ?? []).map((model) => model.trim()).filter(Boolean)));
  if (models.length === 0) return providers;
  const fallback = status?.videoModel && models.includes(status.videoModel) ? status.videoModel : models[0];
  return providers.map((provider) => provider.type === "official"
    ? {
        ...provider,
        model: models.includes(provider.model) ? provider.model : fallback,
        models
      }
    : provider);
}


export function mergeVideoProviderModelCatalogs(
  providers: VideoProviderConfig[],
  catalogs: ReadonlyMap<string, readonly VideoProviderModelOption[]>
): VideoProviderConfig[] {
  return providers.map((provider) => {
    const catalog = catalogs.get(provider.id);
    return catalog ? { ...provider, modelOptions: catalog.map((option) => ({
      ...option,
      supportedModes: option.supportedModes ? [...option.supportedModes] : undefined,
      capability: option.capability ? {
        ...option.capability,
        modes: [...option.capability.modes],
        maxInputs: { ...option.capability.maxInputs },
        ratios: [...option.capability.ratios],
        resolutions: [...option.capability.resolutions],
        durationSeconds: { ...option.capability.durationSeconds }
      } : undefined
    })) } : provider;
  });
}
