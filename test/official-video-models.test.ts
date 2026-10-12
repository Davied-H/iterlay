import { describe, expect, it } from "vitest";
import { mergeOfficialVideoCatalog } from "../src/lib/official-video-models.js";
import type { VideoProviderConfig } from "../shared/types.js";

const providers: VideoProviderConfig[] = [
  { id: "official", name: "Iterlay 官方", type: "official", baseUrl: "", model: "官方视频模型" },
  { id: "ark", name: "Ark", type: "ark", baseUrl: "https://ark.test", model: "ark-model" }
];

describe("official video model catalog", () => {
  it("hydrates the official provider while leaving custom providers unchanged", () => {
    const result = mergeOfficialVideoCatalog(providers, {
      credits: {} as never,
      providerAvailable: true,
      videoAvailable: true,
      videoModel: "model-b",
      videoModels: ["model-a", "model-b", "model-a"]
    });

    expect(result[0]).toMatchObject({ model: "model-b", models: ["model-a", "model-b"] });
    expect(result[1]).toBe(providers[1]);
  });

  it("preserves a selected official model that remains available", () => {
    const result = mergeOfficialVideoCatalog([
      { ...providers[0], model: "model-a", models: ["model-a"] }
    ], {
      credits: {} as never,
      providerAvailable: true,
      videoModel: "model-b",
      videoModels: ["model-a", "model-b"]
    });

    expect(result[0].model).toBe("model-a");
  });
});
