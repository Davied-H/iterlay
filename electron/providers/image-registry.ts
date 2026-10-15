import type { GenerationResult, ProviderConfig, ProviderGenerateInput, ProviderType } from "../../shared/types.js";
export interface ImageProviderAdapter {
  generate(input: ProviderGenerateInput, config: ProviderConfig, apiKey: string): Promise<GenerationResult>;
  testConnection(config: ProviderConfig, apiKey: string): Promise<void>;
}
export class ImageProviderRegistry {
  constructor(private readonly adapters: Partial<Record<Exclude<ProviderType, "official">, ImageProviderAdapter>>) {}
  get(config: ProviderConfig): ImageProviderAdapter {
    if (config.type === "official") throw new Error("官方 Provider 已移除，请配置自有服务商。");
    const adapter = this.adapters[config.type];
    if (!adapter) throw new Error(`未注册的图片 Provider：${config.type}`);
    return adapter;
  }
}
