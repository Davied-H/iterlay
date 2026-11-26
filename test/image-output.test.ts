import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GIFEncoder } from "gifenc";
import { describe, expect, it, vi } from "vitest";
import { imageOutputCapabilities, normalizeImageOutput } from "../shared/image-output";
import { assertGenerateImageInput } from "../shared/input-validation";
import type { GenerateImageInput, GenerationJob, ProviderConfig } from "../shared/types";
import { Sub2ApiImageProvider } from "../electron/providers/sub2api";
import { inspectGif, normalizeGeneratedImage } from "../electron/media/image-artifact";
import { sanitizeSvg } from "../electron/media/svg-artifact";
import { readImageDimensions } from "../electron/media/image-metadata";
import { AssetStore } from "../electron/storage/asset-store";
import { createAssetResponse } from "../electron/asset-response";
import { restoreGenerationHistoryJob } from "../shared/generation-history";
vi.mock("../electron/system-notification.js", () => ({ showGenerationCompletedNotification: vi.fn() }));
import { createImageGenerationCommand, type ImageGenerationDependencies } from "../electron/application/image-generation";

const provider: ProviderConfig = { id: "formats", name: "Formats", type: "openai-compatible", apiMode: "images", baseUrl: "https://fixture.invalid", generationEndpoint: "/v1/images/generations", referenceEndpoint: "/v1/images/edits", model: "gpt-image-2.6-flare", supportsReferenceImages: true };
const input: GenerateImageInput = { workflowMode: "generate", prompt: "A moving blue dot", model: provider.model, size: "auto", n: 1, referenceImages: [], boardId: "board" };
const vector = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="paint"><stop offset="0" stop-color="blue"/></linearGradient></defs><circle cx="256" cy="256" r="80" fill="url(#paint)"/></svg>');
function animation(frames = 9, delay = 200) {
  const encoder = GIFEncoder();
  for (let i = 0; i < frames; i++) encoder.writeFrame(Uint8Array.from([i % 2, 1, 0, 1]), 2, 2, { palette: [[0, 0, 255], [255, 255, 255]], delay, repeat: 0 });
  encoder.finish();
  return Buffer.from(encoder.bytes());
}

describe("Leru-compatible image output", () => {
  it("resolves dated model capabilities, explicit overrides, and excludes unsupported transports", () => {
    expect(imageOutputCapabilities(provider).outputFormats).toEqual(["png", "jpeg", "webp", "svg", "gif"]);
    expect(imageOutputCapabilities(provider, "gpt-image-2.6-sunburst-2026-11-01").svgModel).toBe("gpt-6.1-sol");
    expect(imageOutputCapabilities(provider, "gpt-image-2.5-flare").outputFormats).not.toContain("svg");
    expect(imageOutputCapabilities({ ...provider, apiMode: "responses" }).outputFormats).toEqual(["png"]);
    expect(imageOutputCapabilities({ ...provider, type: "codex-oauth" }).outputFormats).toEqual(["png"]);
    expect(imageOutputCapabilities({ ...provider, imageCapabilities: { [provider.model]: { outputFormats: ["png"] } } }).outputFormats).toEqual(["png"]);
  });
  it("validates output options before a request and preserves GIF defaults", () => {
    expect(normalizeImageOutput({ ...input, outputFormat: "gif" }, provider)).toMatchObject({ size: "512x512", frameCount: 9, frameDurationMs: 200 });
    for (const patch of [{ frameCount: 3 }, { frameDurationMs: 25 }, { frameDurationMs: 10010 }, { size: "1024x1024" }]) {
      expect(() => normalizeImageOutput({ ...input, outputFormat: "gif", ...patch }, provider)).toThrow();
    }
    expect(() => normalizeImageOutput({ ...input, outputFormat: "svg", workflowMode: "edit" }, provider)).toThrow("新作品");
    expect(() => normalizeImageOutput({ ...input, outputFormat: "svg", referenceImages: [{ id: "ref" }] } as GenerateImageInput, provider)).toThrow("参考图");
    expect(() => normalizeImageOutput({ ...input, outputFormat: "gif", background: "transparent" }, provider)).toThrow("PNG 或 WebP");
    expect(() => normalizeImageOutput({ ...input, outputFormat: "png", frameCount: 9 }, provider)).toThrow("仅用于 GIF");
    expect(() => normalizeImageOutput({ ...input, outputFormat: "png", referenceImages: [{ id: "vector", mimeType: "image/svg+xml" }] } as GenerateImageInput, provider)).toThrow("导出为 PNG");
    expect(() => assertGenerateImageInput({ ...input, outputFormat: "html" })).toThrow("输出格式");
  });
  it("forwards SVG author settings in JSON and detects actual Base64 output MIME", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: vector.toString("base64") }] }), { headers: { "content-type": "application/json" } }));
    const adapter = new Sub2ApiImageProvider(fetcher as typeof fetch);
    const result = await adapter.generate({ ...input, outputFormat: "svg", referenceImages: [] }, provider, "fixture");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ output_format: "svg", svg: { model: "gpt-6.1-sol" } });
    expect(result.images[0].mimeType).toBe("image/svg+xml");
  });
  it("forwards GIF timing and a real reference as multipart edits", async () => {
    const gif = animation();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: gif.toString("base64") }] }), { headers: { "content-type": "application/json" } }));
    const result = await new Sub2ApiImageProvider(fetcher as typeof fetch).generate({ ...input, size: "512x512", outputFormat: "gif", frameCount: 8, frameDurationMs: 150,
      referenceImages: [{ name: "source.png", mimeType: "image/png", bytes: Buffer.from([1]) }] }, provider, "fixture");
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const form = request.body as FormData;
    expect(url).toContain("/images/edits");
    expect([form.get("output_format"), form.get("frame_count"), form.get("frame_duration_ms"), form.get("size")]).toEqual(["gif", "8", "150", "512x512"]);
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(result.images[0].mimeType).toBe("image/gif");
  });
  it("sanitizes SVG while retaining text, gradients and local references", () => {
    const unsafe = Buffer.from(vector.toString().replace('<circle', '<script>alert(1)</script><foreignObject><div>unsafe</div></foreignObject><image href="https://evil.invalid/x"/><circle onload="alert(1)"').replace('fill="url(#paint)"', 'style="fill:url(#paint);stroke:blue"'));
    const safe = sanitizeSvg(unsafe).bytes.toString();
    expect(safe).not.toMatch(/script|foreignObject|onload|evil\.invalid|<image/u);
    expect(safe).toContain('linearGradient id="paint"');
    expect(safe).toContain('fill="url(#paint)"');
    expect(safe).toContain('stroke="blue"');
    expect(sanitizeSvg(Buffer.from(safe)).bytes.toString()).toBe(safe);
    for (const source of ['<!DOCTYPE svg><svg width="1" height="1"/>', '<html><svg width="1" height="1"/></html>', '<svg width="1" height="1"/><svg width="1" height="1"/>', '<svg width="999999" height="1"/>']) {
      expect(() => sanitizeSvg(Buffer.from(source))).toThrow();
    }
  });
  it("bounds GIF frames and preserves exact animation bytes and actual timing", () => {
    const gif = animation();
    const result = normalizeGeneratedImage({ bytes: gif, mimeType: "image/png" }, "gif");
    expect(result.bytes).toBe(gif);
    expect(result).toMatchObject({ mimeType: "image/gif", frameCount: 9, frameDurationMs: 200, animationDurationMs: 1800 });
    expect(() => inspectGif(gif.subarray(0, gif.length - 1))).toThrow();
    expect(() => inspectGif(animation(257))).toThrow();
    expect(() => normalizeGeneratedImage({ bytes: animation(1), mimeType: "image/gif" }, "gif")).toThrow("静态");
    expect(() => normalizeGeneratedImage({ bytes: gif, mimeType: "image/png" }, "svg")).toThrow("不一致");
  });

  it.each(["svg", "gif"] as const)("round-trips %s through generation, history, managed preview and original download", async (format) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-formats-"));
    try {
      const raw = format === "svg" ? vector : animation();
      const assets = new AssetStore(directory);
      const jobs: GenerationJob[] = [];
      const adapter = new Sub2ApiImageProvider(async () => new Response(JSON.stringify({ data: [{ b64_json: raw.toString("base64") }] }), { headers: { "content-type": "application/json" } }));
      const dependencies = {
        settings: { getSettings: () => ({ activeProviderId: provider.id, providers: [provider] }), getApiKey: () => "fixture" },
        history: { addJob: async (job: GenerationJob) => { jobs.push(job); }, updateJob: async (job: GenerationJob) => { jobs.push(job); } }, assets,
        getProviderAdapter: () => adapter, recordMemory: vi.fn(), sceneMedia: {}, backfillThumbHashes: vi.fn(),
        createGeneratedBoardNodes: async () => [], boards: {}, analytics: { track: async () => undefined }
      };
      const command = createImageGenerationCommand(dependencies as unknown as ImageGenerationDependencies);
      const result = await command({ ...input, outputFormat: format });
      expect(result.images[0].path).toMatch(new RegExp(`\\.${format}$`));
      expect(jobs.at(-1)?.status).toBe("succeeded");
      const restored = await restoreGenerationHistoryJob(result.job, (file) => assets.readManagedDataUrl(file), [provider]);
      expect(restored.input.outputFormat).toBe(format);
      if (format === "gif") expect(restored.input).toMatchObject({ size: "512x512", frameCount: 9, frameDurationMs: 200 });
      const mime = format === "svg" ? "image/svg+xml" : "image/gif";
      const response = await createAssetResponse(new Request(result.images[0].dataUrl), (url) => assets.resolveAssetUrl(url));
      expect(response.headers.get("content-type")).toBe(mime);
      if (format === "svg") expect(response.headers.get("content-security-policy")).toContain("sandbox");
      const preview = Buffer.from(await response.arrayBuffer());
      expect(preview).toEqual(await readFile(result.images[0].path));
      if (format === "gif") expect(preview).toEqual(raw);
      const target = path.join(directory, `export.${format}`);
      await assets.exportAsset(result.images[0].path, target);
      expect(await readFile(target)).toEqual(preview);
      expect(await readImageDimensions(target, async () => null)).toEqual(format === "svg" ? { width: 512, height: 512 } : { width: 2, height: 2 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
