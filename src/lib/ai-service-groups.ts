import type { ProviderConfig, TextProviderConfig } from "@shared/types";

export interface AiServiceGroup {
  id: string;
  name: string;
  imageProvider?: ProviderConfig;
  textProvider?: TextProviderConfig;
}

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLocaleLowerCase();
}

function canShareConnection(
  imageProvider: ProviderConfig,
  textProvider: TextProviderConfig,
  imageCountAtBaseUrl: number,
  textCountAtBaseUrl: number
): boolean {
  if (imageProvider.type === "official" && textProvider.type === "official") return true;
  if (imageProvider.type === "codex-oauth" && textProvider.type === "codex-oauth") {
    return (textProvider.authProviderId || textProvider.id) === imageProvider.id;
  }
  if (imageProvider.type !== "openai-compatible" || textProvider.type !== "openai-compatible") return false;
  const imageBaseUrl = normalizedBaseUrl(imageProvider.baseUrl);
  if (!imageBaseUrl || imageBaseUrl !== normalizedBaseUrl(textProvider.baseUrl)) return false;
  const sameName = imageProvider.name.trim().toLocaleLowerCase() === textProvider.name.trim().toLocaleLowerCase();
  return sameName || (imageCountAtBaseUrl === 1 && textCountAtBaseUrl === 1);
}

/**
 * 将底层独立保存的图片/文本 Provider 投影成用户看到的 AI 服务。
 * 这里只做无歧义合并，不改变原配置结构和凭据归属。
 */
export function groupAiServices(
  imageProviders: ProviderConfig[],
  textProviders: TextProviderConfig[]
): AiServiceGroup[] {
  const openAiImageCountByBaseUrl = new Map<string, number>();
  const openAiTextCountByBaseUrl = new Map<string, number>();
  for (const provider of imageProviders) {
    if (provider.type !== "openai-compatible") continue;
    const baseUrl = normalizedBaseUrl(provider.baseUrl);
    if (baseUrl) openAiImageCountByBaseUrl.set(baseUrl, (openAiImageCountByBaseUrl.get(baseUrl) ?? 0) + 1);
  }
  for (const provider of textProviders) {
    if (provider.type !== "openai-compatible") continue;
    const baseUrl = normalizedBaseUrl(provider.baseUrl);
    if (baseUrl) openAiTextCountByBaseUrl.set(baseUrl, (openAiTextCountByBaseUrl.get(baseUrl) ?? 0) + 1);
  }

  const groups: AiServiceGroup[] = imageProviders.map((imageProvider) => ({
    id: `image:${imageProvider.id}`,
    name: imageProvider.name,
    imageProvider
  }));

  for (const textProvider of textProviders) {
    const group = groups.find((candidate) =>
      !candidate.textProvider &&
      candidate.imageProvider &&
      canShareConnection(
        candidate.imageProvider,
        textProvider,
        openAiImageCountByBaseUrl.get(normalizedBaseUrl(candidate.imageProvider.baseUrl)) ?? 0,
        openAiTextCountByBaseUrl.get(normalizedBaseUrl(textProvider.baseUrl)) ?? 0
      )
    );
    if (group) {
      group.textProvider = textProvider;
      continue;
    }
    groups.push({
      id: `text:${textProvider.id}`,
      name: textProvider.name,
      textProvider
    });
  }

  return groups;
}
