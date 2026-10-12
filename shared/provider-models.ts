import type { ProviderConfig } from "./types.js";

export function getProviderModels(provider: Pick<ProviderConfig, "model" | "models">): string[] {
  const seen = new Set<string>();
  return [provider.model, ...(provider.models ?? [])].flatMap((value) => {
    const model = value?.trim();
    if (!model || seen.has(model)) return [];
    seen.add(model);
    return [model];
  });
}

export function selectProviderModel(provider: ProviderConfig, model: string): ProviderConfig {
  const selected = model.trim();
  if (!selected) return provider;
  return {
    ...provider,
    model: selected,
    models: getProviderModels({ model: selected, models: getProviderModels(provider) })
  };
}
