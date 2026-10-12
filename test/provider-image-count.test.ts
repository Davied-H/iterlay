import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../shared/types";
import { getProviderMaxImageCount } from "../src/lib/provider-image-count";

function provider(type: ProviderConfig["type"], model = "model"): ProviderConfig {
  return {
    id: `${type}-${model}`,
    name: type,
    type,
    baseUrl: "",
    generationEndpoint: "",
    model,
    supportsReferenceImages: true
  };
}

describe("provider image count", () => {
  it("uses the official and fal four-image limit", () => {
    expect(getProviderMaxImageCount(provider("official"))).toBe(4);
    expect(getProviderMaxImageCount(provider("fal"))).toBe(4);
  });

  it("respects Bailian model-specific limits", () => {
    expect(getProviderMaxImageCount(provider("bailian", "qwen-image"))).toBe(1);
    expect(getProviderMaxImageCount(provider("bailian", "qwen-image-3.0-pro"))).toBe(6);
    expect(getProviderMaxImageCount(provider("bailian", "wan2.7-image-pro"))).toBe(4);
    expect(getProviderMaxImageCount(provider("bailian", "other-model"))).toBe(6);
  });

  it("clamps Ark Seedream to four parallel requests", () => {
    expect(getProviderMaxImageCount(provider("ark", "doubao-seedream-5-0-pro-260628"))).toBe(4);
    expect(getProviderMaxImageCount(provider("ark", "doubao-seedream-4-0-250828"))).toBe(4);
  });

  it("keeps generic compatible providers effectively unrestricted", () => {
    expect(getProviderMaxImageCount(provider("openai-compatible"))).toBe(99);
  });
});
