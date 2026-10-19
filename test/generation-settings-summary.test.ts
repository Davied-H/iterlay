import { describe, expect, it } from "vitest";
import { generationSettingsSummary, providerUsesImageQuality } from "../src/lib/generation-settings-summary";
import type { ProviderConfig } from "../shared/types";

const provider: ProviderConfig = { id: "custom", name: "自定义", type: "openai-compatible", baseUrl: "", generationEndpoint: "", model: "gpt-image-1", supportsReferenceImages: true };

describe("generation settings summary", () => {
  it("summarizes the actual task model, requested pixels, quality and count", () => {
    expect(generationSettingsSummary({ model: "saved-task-model", size: "1536x1024", quality: "high", n: 2, workflowMode: "generate" }, provider)).toEqual({
      model: "saved-task-model", size: "1536×1024", quality: "高质量", count: 2
    });
  });

  it("shows fal's actual reference model for edits and avoids claiming an ignored quality setting", () => {
    const fal = { ...provider, type: "fal" as const, referenceModel: "fal-ai/flux/edit", model: "fal-ai/flux" };
    expect(generationSettingsSummary({ model: fal.model, size: "auto", quality: "high", n: 1, workflowMode: "edit" }, fal)).toEqual({
      model: fal.referenceModel, size: "自动尺寸", quality: "服务商默认质量", count: 1
    });
    expect(providerUsesImageQuality(fal)).toBe(false);
    expect(providerUsesImageQuality({ ...provider, type: "codex-oauth" })).toBe(true);
  });
});
