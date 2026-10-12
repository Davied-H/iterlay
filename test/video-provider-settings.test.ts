import { describe, expect, it } from "vitest";
import { normalizeVideoProvider } from "../electron/storage/settings-store.js";
import {
  addVideoProviderModel,
  makeVideoProviderModelDefault,
  removeVideoProviderModel
} from "../src/components/workbench/ProviderSettingsDialog.js";

describe("normalizeVideoProvider", () => {
  it("migrates a legacy single model into the ordered model list", () => {
    const provider = normalizeVideoProvider({
      id: "legacy-fal",
      name: "fal.ai",
      type: "fal",
      baseUrl: "https://queue.fal.run/",
      model: "fal-ai/kling-video/v2.1/standard/text-to-video"
    });

    expect(provider.models).toEqual([provider.model]);
    expect(provider.baseUrl).toBe("https://queue.fal.run");
  });

  it("keeps the selected model first and deduplicates models without injecting a fallback", () => {
    const provider = normalizeVideoProvider({
      id: "openrouter-video",
      name: "OpenRouter 视频",
      type: "openrouter",
      connectionProviderId: "openrouter-image",
      baseUrl: "https://openrouter.ai/api",
      model: "vendor/custom-video",
      models: ["vendor/secondary-video", "vendor/custom-video", " vendor/secondary-video "]
    });

    expect(provider.connectionProviderId).toBe("openrouter-image");
    expect(provider.models).toEqual(["vendor/custom-video", "vendor/secondary-video"]);
    expect(provider.models).not.toContain("google/veo-3.1-fast");
  });

  it("uses the platform fallback only when no model is configured", () => {
    const provider = normalizeVideoProvider({ type: "openrouter", model: "", models: [] });

    expect(provider.model).toBe("google/veo-3.1-fast");
    expect(provider.models).toEqual(["google/veo-3.1-fast"]);
  });

  it("drops a connection reference for providers that cannot reuse image credentials", () => {
    const provider = normalizeVideoProvider({
      type: "ark",
      connectionProviderId: "unrelated-image",
      model: "ark-endpoint"
    });

    expect(provider.connectionProviderId).toBeUndefined();
  });

  it("adds, removes, and reorders configured video models", () => {
    const provider = { model: "vendor/default", models: ["vendor/default", "vendor/secondary"] };

    expect(addVideoProviderModel(provider, " vendor/third ")).toEqual({
      model: "vendor/default",
      models: ["vendor/default", "vendor/secondary", "vendor/third"]
    });
    expect(makeVideoProviderModelDefault(provider, "vendor/secondary")).toEqual({
      model: "vendor/secondary",
      models: ["vendor/secondary", "vendor/default"]
    });
    expect(removeVideoProviderModel(provider, "vendor/default")).toEqual({
      model: "vendor/secondary",
      models: ["vendor/secondary"]
    });
    expect(removeVideoProviderModel({ model: "only", models: ["only"] }, "only")).toEqual({
      model: "only",
      models: ["only"]
    });
  });
});
