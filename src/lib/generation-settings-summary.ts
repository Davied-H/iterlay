import type { GenerateImageInput, ProviderConfig } from "@shared/types";

export const IMAGE_QUALITY_LABELS = {
  auto: "自动质量",
  low: "低质量",
  medium: "标准质量",
  high: "高质量"
} as const;

/** These are the adapters that actually forward the saved quality field. */
export function providerUsesImageQuality(provider?: Pick<ProviderConfig, "type">): boolean {
  return provider?.type === "openai-compatible" || provider?.type === "codex-oauth";
}

export function generationSettingsSummary(
  input: Pick<GenerateImageInput, "model" | "size" | "quality" | "n" | "workflowMode">,
  provider?: ProviderConfig
): { model: string; size: string; quality: string; count: number } {
  return {
    model: input.workflowMode === "edit" && provider?.type === "fal"
      ? provider.referenceModel?.trim() || input.model || provider.model
      : input.model || provider?.model || "未选择模型",
    size: input.size === "auto" ? "自动尺寸" : input.size.replace(/x/gu, "×"),
    quality: providerUsesImageQuality(provider) ? IMAGE_QUALITY_LABELS[input.quality ?? "auto"] : "服务商默认质量",
    count: Math.max(1, Math.trunc(input.n) || 1)
  };
}
