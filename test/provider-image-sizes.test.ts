import { describe, expect, it } from "vitest";
import { getProviderImageSizeOptions, providerSupportsCustomImageSize } from "@/lib/provider-image-sizes";

describe("provider image sizes", () => {
  it("只向官方 Provider 展示其支持的标准尺寸", () => {
    const options = getProviderImageSizeOptions({ type: "official" });

    expect(options.map((option) => option.value)).toEqual([
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536"
    ]);
    expect(providerSupportsCustomImageSize({ type: "official" })).toBe(false);
  });

  it("向自定义 Provider 提供扩展尺寸和自定义尺寸能力", () => {
    const options = getProviderImageSizeOptions({ type: "openai-compatible" });

    expect(options.map((option) => option.value)).toContain("3840x2160");
    expect(providerSupportsCustomImageSize({ type: "openai-compatible" })).toBe(true);
  });
});
