import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "@shared/types";
import { providerSupportsTransparentBackground } from "@/lib/provider-transparent-background";

function provider(patch: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "provider",
    name: "Provider",
    type: "openai-compatible",
    baseUrl: "https://api.example.com",
    generationEndpoint: "/v1/images/generations",
    model: "image-model",
    supportsReferenceImages: true,
    ...patch
  };
}

describe("transparent background provider capability", () => {
  it("supports Codex and compatible GPT Image routes", () => {
    expect(providerSupportsTransparentBackground(provider({ type: "official" }))).toBe(false);
    expect(providerSupportsTransparentBackground(provider({ type: "codex-oauth" }))).toBe(true);
    expect(providerSupportsTransparentBackground(provider({ model: "gpt-image-2" }))).toBe(true);
    expect(providerSupportsTransparentBackground(provider({ apiMode: "responses", model: "gpt-5.6" }))).toBe(true);
  });

  it("does not advertise transparency for unrelated image providers", () => {
    expect(providerSupportsTransparentBackground(provider({ type: "fal" }))).toBe(false);
    expect(providerSupportsTransparentBackground(provider({ type: "bailian" }))).toBe(false);
    expect(providerSupportsTransparentBackground(provider({}))).toBe(false);
  });
});
