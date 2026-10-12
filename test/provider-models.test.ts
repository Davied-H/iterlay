import { describe, expect, it } from "vitest";
import { getProviderModels, selectProviderModel } from "../shared/provider-models";
import type { ProviderConfig } from "../shared/types";

const provider: ProviderConfig = {
  id: "provider-1",
  name: "Provider",
  type: "openai-compatible",
  apiMode: "responses",
  baseUrl: "https://example.com",
  generationEndpoint: "/v1/responses",
  model: "gpt-image-2",
  models: ["gpt-image-2", "ideogram/v4", "gpt-image-2"],
  supportsReferenceImages: true
};

describe("provider models", () => {
  it("returns the active model first and removes duplicates", () => {
    expect(getProviderModels(provider)).toEqual(["gpt-image-2", "ideogram/v4"]);
  });

  it("switches the default without losing sibling models", () => {
    expect(selectProviderModel(provider, "ideogram/v4")).toMatchObject({
      model: "ideogram/v4",
      models: ["ideogram/v4", "gpt-image-2"]
    });
  });

  it("adds a newly selected model to the provider", () => {
    expect(selectProviderModel(provider, "seedream-4.5")).toMatchObject({
      model: "seedream-4.5",
      models: ["seedream-4.5", "gpt-image-2", "ideogram/v4"]
    });
  });
});
