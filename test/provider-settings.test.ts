import { describe, expect, it } from "vitest";
import { addCodexProvider } from "../src/lib/provider-settings";
import type { ProviderConfig } from "../shared/types";

describe("provider settings", () => {
  it("adds Codex as a separate provider without replacing the selected API provider", () => {
    const sub2api: ProviderConfig = {
      id: "sub2api",
      name: "Sub2API",
      type: "openai-compatible",
      apiMode: "responses",
      baseUrl: "https://sub2api.example.com",
      generationEndpoint: "/v1/responses",
      referenceEndpoint: "",
      model: "gpt-5.5",
      supportsReferenceImages: true
    };

    const result = addCodexProvider([sub2api], sub2api.id, sub2api.id, "codex-personal");

    expect(result.providers).toHaveLength(2);
    expect(result.providers[0]).toBe(sub2api);
    expect(result.providers[0]).toEqual({
      ...sub2api,
      baseUrl: "https://sub2api.example.com",
      generationEndpoint: "/v1/responses",
      model: "gpt-5.5"
    });
    expect(result.provider).toMatchObject({
      id: "codex-personal",
      name: "Codex / ChatGPT",
      type: "codex-oauth",
      model: "gpt-image-2"
    });
    expect(result.activeProviderId).toBe("codex-personal");
  });

  it("keeps the current default when adding Codex from a non-default provider", () => {
    const providers = [
      {
        id: "official",
        name: "Official",
        type: "official" as const,
        baseUrl: "",
        generationEndpoint: "",
        model: "official",
        supportsReferenceImages: true
      },
      {
        id: "sub2api",
        name: "Sub2API",
        type: "openai-compatible" as const,
        baseUrl: "https://sub2api.example.com",
        generationEndpoint: "/v1/responses",
        model: "gpt-5.5",
        supportsReferenceImages: true
      }
    ];

    const result = addCodexProvider(providers, "official", "sub2api", "codex-personal");

    expect(result.activeProviderId).toBe("official");
  });
});
