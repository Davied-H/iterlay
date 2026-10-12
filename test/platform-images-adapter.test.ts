import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig, ProviderGenerateInput } from "../shared/types.js";
import { Sub2ApiImageProvider } from "../electron/providers/sub2api.js";

const input: ProviderGenerateInput = {
  workflowMode: "generate",
  prompt: "一张产品海报",
  model: "bytedance-seed/seedream-4.5",
  size: "1536x1024",
  n: 1,
  quality: "high",
  referenceImages: []
};

describe("hosted Images API providers", () => {
  it("sends OpenRouter reference images through input_references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("openrouter-image").toString("base64") }] }), {
        headers: { "content-type": "application/json" }
      })
    );
    const provider = new Sub2ApiImageProvider(fetchMock as typeof fetch);
    const config: ProviderConfig = {
      id: "openrouter",
      name: "OpenRouter",
      type: "openrouter",
      apiMode: "images",
      baseUrl: "https://openrouter.ai/api",
      generationEndpoint: "/v1/images",
      model: input.model,
      supportsReferenceImages: true
    };

    const result = await provider.generate(
      {
        ...input,
        referenceImages: [{ name: "ref.png", mimeType: "image/png", bytes: Buffer.from("reference") }]
      },
      config,
      "sk-or-v1-test"
    );

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/images");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: input.model,
      prompt: input.prompt,
      size: input.size,
      quality: "high",
      output_format: "png"
    });
    expect(body.input_references).toEqual([
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${Buffer.from("reference").toString("base64")}` }
      }
    ]);
    expect(result.images[0].bytes.toString()).toBe("openrouter-image");
  });

  it.each([
    ["openrouter", "https://openrouter.ai/api", "https://openrouter.ai/api/v1/key"],
    ["poe", "https://api.poe.com", "https://api.poe.com/usage/current_balance"]
  ] as const)("tests %s credentials without submitting an image", async (type, baseUrl, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    const provider = new Sub2ApiImageProvider(fetchMock as typeof fetch);

    await provider.testConnection(
      {
        id: type,
        name: type,
        type,
        apiMode: "images",
        baseUrl,
        generationEndpoint: "/v1/images",
        model: type === "poe" ? "nano-banana-2" : input.model,
        supportsReferenceImages: type === "openrouter"
      },
      "test-key"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(expectedUrl);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("generates Poe images through its dedicated endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: "data:image/png;base64,cG9lLWltYWdl" }] }), {
        headers: { "content-type": "application/json" }
      })
    );
    const provider = new Sub2ApiImageProvider(fetchMock as typeof fetch);

    const result = await provider.generate(
      { ...input, model: "nano-banana-2" },
      {
        id: "poe",
        name: "Poe",
        type: "poe",
        apiMode: "images",
        baseUrl: "https://api.poe.com",
        generationEndpoint: "/v1/images",
        model: "nano-banana-2",
        supportsReferenceImages: false
      },
      "poe-key"
    );

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.poe.com/v1/images");
    expect(result.images[0].bytes.toString()).toBe("poe-image");
  });
});
