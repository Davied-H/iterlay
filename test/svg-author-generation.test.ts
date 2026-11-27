import { describe, expect, it, vi } from "vitest";
import { Sub2ApiImageProvider } from "../electron/providers/sub2api";
import { imageOutputConfigurationKey } from "../shared/image-output";
import type { ProviderConfig, ProviderGenerateInput } from "../shared/types";

const config = { id: "relay", name: "Relay", type: "openai-compatible", apiMode: "images", baseUrl: "https://fixture.invalid/v1", generationEndpoint: "/images/generations", model: "image-model", supportsReferenceImages: true,
  imageCapabilities: { "image-model": { outputFormats: ["png", "svg"], svgModel: "author-model", svgMode: "author" } } } as unknown as ProviderConfig;
const input: ProviderGenerateInput = { workflowMode: "generate", prompt: "A blue circle", model: config.model, outputFormat: "svg", size: "256x256", n: 1, referenceImages: [] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="50" fill="blue"/></svg>';
const reply = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { "content-type": "application/json" } });

describe("explicit SVG author generation", () => {
  it("calls the configured author on the same connection and produces real sanitized SVG", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply('```svg\n' + svg.replace('<circle', '<script>alert(1)</script><circle') + '\n```'));
    const result = await new Sub2ApiImageProvider(fetcher).generate(input, config, "fixture");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://fixture.invalid/v1/chat/completions");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ model: "author-model", stream: false });
    expect(JSON.stringify(body.messages)).toContain("256x256");
    expect(result.images[0]).toMatchObject({ mimeType: "image/svg+xml", width: 256, height: 256 });
    expect(result.images[0].bytes.toString()).toContain("<circle");
    expect(result.images[0].bytes.toString()).not.toContain("script");
    expect(result).toMatchObject({ execution: { mode: "svg-author", model: "author-model" } });
  });

  it("accepts text content parts and generates exactly the requested count", async () => {
    const fetcher = vi.fn(async () => reply([{ type: "text", text: svg }]));
    const result = await new Sub2ApiImageProvider(fetcher).generate({ ...input, n: 2 }, config, "fixture");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.images).toHaveLength(2);
  });

  it("rejects an embedded bitmap wrapper rather than treating it as vector generation", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply('<svg width="64" height="64"><image href="data:image/png;base64,AA=="/></svg>'));
    await expect(new Sub2ApiImageProvider(fetcher).generate(input, config, "fixture")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not silently fall back to another paid endpoint after an author error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "unsupported author" } }), { status: 400 }));
    await expect(new Sub2ApiImageProvider(fetcher).generate(input, config, "fixture")).rejects.toThrow("unsupported author");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("binds verification to the selected SVG route", () => {
    const native = { ...config, imageCapabilities: { "image-model": { outputFormats: ["svg"], svgModel: "author-model", svgMode: "native" } } } as unknown as ProviderConfig;
    expect(imageOutputConfigurationKey(config)).not.toBe(imageOutputConfigurationKey(native));
  });
});
