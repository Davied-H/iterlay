import type { ProviderConfig } from "@shared/types";

export function providerSupportsTransparentBackground(provider?: ProviderConfig): boolean {
  if (!provider) return false;
  // The official backend currently rejects transparent output requests.
  if (provider.type === "official") return false;
  if (provider.type === "codex-oauth") return true;
  if (provider.type !== "openai-compatible") return false;
  return provider.apiMode === "responses"
    || /\/responses\/?$/u.test(provider.generationEndpoint)
    || /^gpt-image-/iu.test(provider.model.trim());
}
