import { describe, expect, it } from "vitest";
import { formatModelPricing, normalizeModelPricing, parseOpenRouterVideoPricing } from "../shared/model-pricing.js";
import { normalizeVideoProviderModelOption } from "../shared/video-provider-models.js";

describe("OpenRouter video pricing", () => {
  it("converts cents to USD without mixing reference or minimum charges into output rates", () => {
    expect(parseOpenRouterVideoPricing({
      cents_per_image_input: "1", cents_per_video_output_second_480p: "2",
      cents_per_video_output_second_1080p: "14", minimum_cents_per_generation: "56"
    })).toEqual([{ unit: "second", minUsd: 0.02, maxUsd: 0.14 }]);
    expect(parseOpenRouterVideoPricing({
      duration_seconds_480p: "0.02", duration_seconds_768p: "0.036", reference_duration_seconds_2k: "0.18"
    })).toEqual([{ unit: "second", minUsd: 0.02, maxUsd: 0.036 }]);
  });

  it("retains video-token and megapixel-second units rather than inventing a per-second cost", () => {
    expect(parseOpenRouterVideoPricing({ video_tokens: "0.000007", video_tokens_with_video_input: "0.0000043" }))
      .toEqual([{ unit: "million-video-tokens", minUsd: expect.closeTo(4.3), maxUsd: 7 }]);
    expect(parseOpenRouterVideoPricing({ cents_per_megapixel_second_precise: "3.5", cents_per_megapixel_second_creative: "5" }))
      .toEqual([{ unit: "megapixel-second", minUsd: 0.035, maxUsd: 0.05 }]);
  });

  it("supports the documented SKU form and rejects invalid, input-only and unknown pricing", () => {
    expect(parseOpenRouterVideoPricing({ "per-video-second": "0.50" })).toEqual([{ unit: "second", minUsd: 0.5, maxUsd: 0.5 }]);
    for (const value of [undefined, [], {}, { duration_seconds: "" }, { duration_seconds: -1 },
      { duration_seconds: Infinity }, { duration_seconds: null }, { cents_per_image_input: "1" }, { new_unit: "1" }]) {
      expect(parseOpenRouterVideoPricing(value)).toBeUndefined();
    }
    expect(parseOpenRouterVideoPricing({ duration_seconds: "0" })).toEqual([{ unit: "second", minUsd: 0, maxUsd: 0 }]);
  });

  it("shows dollars in English and adds CNY at exactly seven in Chinese", () => {
    const pricing = parseOpenRouterVideoPricing({ duration_seconds_480p: "0.068", duration_seconds_1080p: "0.28" });
    expect(formatModelPricing(pricing, "en-US")).toEqual({ usd: "US$0.068–0.28 / s", cny: undefined });
    expect(formatModelPricing(pricing, "zh-CN")).toEqual({ usd: "US$0.068–0.28 / 秒", cny: "≈¥0.476–1.96 / 秒" });
    expect(formatModelPricing(parseOpenRouterVideoPricing({ video_tokens: "0.0000035" }), "zh-CN"))
      .toEqual({ usd: "US$3.5 / 百万视频 Token", cny: "≈¥24.5 / 百万视频 Token" });
    expect(formatModelPricing(undefined, "zh-CN")).toBeUndefined();
  });

  it("preserves valid rates through persisted model option normalization", () => {
    const pricing = [{ unit: "second", minUsd: 0.02, maxUsd: 0.14 }];
    expect(normalizeVideoProviderModelOption({ id: "model", pricing })?.pricing).toEqual(pricing);
    expect(normalizeModelPricing([{ unit: "second", minUsd: 0.14, maxUsd: 0.02 }, { unit: "unknown", minUsd: 0, maxUsd: 1 }]))
      .toBeUndefined();
  });
});
