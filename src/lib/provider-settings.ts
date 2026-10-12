import type { ProviderConfig } from "@shared/types";

export interface AddCodexProviderResult {
  providers: ProviderConfig[];
  provider: ProviderConfig;
  activeProviderId: string;
}

export function createCodexProvider(
  id = `codex-oauth-${crypto.randomUUID().slice(0, 8)}`
): ProviderConfig {
  return {
    id,
    name: "Codex / ChatGPT",
    type: "codex-oauth",
    apiMode: "responses",
    baseUrl: "",
    generationEndpoint: "",
    referenceEndpoint: "",
    model: "gpt-image-2",
    supportsReferenceImages: true
  };
}

/** Codex 账号始终作为独立 Provider 添加，避免覆盖当前 API Provider 的连接参数。 */
export function addCodexProvider(
  providers: ProviderConfig[],
  activeProviderId: string,
  selectedProviderId: string,
  id?: string
): AddCodexProviderResult {
  const provider = createCodexProvider(id);
  return {
    providers: [...providers, provider],
    provider,
    activeProviderId: activeProviderId === selectedProviderId ? provider.id : activeProviderId
  };
}
