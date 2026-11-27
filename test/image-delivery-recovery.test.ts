import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createImageGenerationCommand, type ImageGenerationDependencies } from "../electron/application/image-generation";
import { AssetStore } from "../electron/storage/asset-store";
import { HistoryStore } from "../electron/storage/history-store";
import type { GenerateImageInput, GenerationResult, ProviderConfig, ProviderGenerateInput } from "../shared/types";
import { encodeNodeImageDelivery } from "../cli/src/image-output-encoder";
import { restoreGenerationHistoryJob } from "../shared/generation-history";
import { encodeDeliveryImage } from "../electron/image-delivery";

const sharp = createRequire(new URL("../cli/package.json", import.meta.url))("sharp");
const provider: ProviderConfig = { id: "relay", name: "Relay", type: "openai-compatible", baseUrl: "https://fixture.invalid", generationEndpoint: "/v1/images/generations", model: "gpt-image-2.5-sunburst", supportsReferenceImages: true };
const input: GenerateImageInput = { workflowMode: "generate", prompt: "A portrait", model: provider.model, size: "auto", n: 1, referenceImages: [] };

async function fixture(width = 12, height = 20) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-delivery-"));
  const raw = await sharp({ create: { width, height, channels: 4, background: "#ddab77" } }).png().toBuffer();
  const generate = vi.fn<(input: ProviderGenerateInput) => Promise<GenerationResult>>(async () => ({ images: [{ bytes: raw, mimeType: "image/png" }] }));
  const encode = vi.fn(encodeNodeImageDelivery);
  const assets = new AssetStore(directory), history = new HistoryStore(directory);
  const config = { ...provider };
  const command = createImageGenerationCommand({
    settings: { getSettings: () => ({ activeProviderId: config.id, providers: [config] }), getApiKey: () => "fixture" },
    assets, history, encodeImageDelivery: encode, getProviderAdapter: () => ({ generate }),
    sceneMedia: {}, boards: {}, recordMemory: vi.fn(), backfillThumbHashes: vi.fn(),
    createGeneratedBoardNodes: async () => [], analytics: { track: async () => undefined }
  } as unknown as ImageGenerationDependencies);
  return { directory, raw, generate, encode, assets, history, config, command,
    dispose: async () => { await history.flush(); await rm(directory, { recursive: true, force: true }); } };
}

describe("recoverable generated image delivery", () => {
  it("rejects a retry while the initial delivery is still encoding", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.encode.mockImplementationOnce(async (bytes, options) => { await gate; return encodeNodeImageDelivery(bytes, options); });
    const initial = f.command({ ...input, delivery: { format: "jpeg" } });
    try {
      await vi.waitFor(() => expect(f.encode).toHaveBeenCalledOnce());
      const [job] = await f.history.listJobs();
      expect(job.delivery?.status).toBe("processing");
      await expect(f.command.retryDelivery({ jobId: job.id, delivery: { format: "webp" } })).rejects.toThrow("处理中");
      release();
      expect((await initial).job.delivery?.status).toBe("succeeded");
      expect(f.encode).toHaveBeenCalledOnce();
    } finally { release(); await initial; await f.dispose(); }
  });
  it("checks decoded pixel budget before asking the desktop decoder to allocate an image", async () => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.write("IHDR", 12); bytes.writeUInt32BE(16000, 16); bytes.writeUInt32BE(16000, 20);
    const createImage = vi.fn(() => { throw new Error("decoder must not run"); });
    await expect(encodeDeliveryImage(bytes, { id: "limit", nodeId: "node", sourceVersion: { imagePath: "original.png", jobId: "job" }, purpose: "limit", relativePath: "out.jpg", format: "jpeg" }, {
      createImage, createBitmap: createImage, webp: async () => Buffer.alloc(0)
    })).rejects.toThrow("处理限制");
    expect(createImage).not.toHaveBeenCalled();
    bytes.writeUInt32BE(12, 16); bytes.writeUInt32BE(20, 20);
    await expect(encodeDeliveryImage(bytes, { id: "small", nodeId: "node", sourceVersion: { imagePath: "original.png", jobId: "job" }, purpose: "small", relativePath: "out.jpg", format: "jpeg" }, {
      createImage, createBitmap: createImage, webp: async () => Buffer.alloc(0)
    })).rejects.toThrow("decoder must not run");
    expect(createImage).toHaveBeenCalledOnce();
  });
  it("keeps a real PNG returned for JPEG and delivers an actual JPEG without another provider call", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-delivery-recovery-"));
    try {
      const raw = await sharp({ create: { width: 12, height: 20, channels: 4, background: "#ddab77" } }).png().toBuffer();
      const generate = vi.fn(async () => ({ images: [{ bytes: raw, mimeType: "image/png" }] }));
      const encodeImageDelivery = vi.fn(async (bytes: Buffer) => ({ bytes: await sharp(bytes).jpeg().toBuffer(), mimeType: "image/jpeg", width: 12, height: 20 }));
      const assets = new AssetStore(directory);
      const history = new HistoryStore(directory);
      const command = createImageGenerationCommand({
        settings: { getSettings: () => ({ activeProviderId: provider.id, providers: [provider] }), getApiKey: () => "fixture" },
        assets, history, encodeImageDelivery, getProviderAdapter: () => ({ generate }),
        sceneMedia: {}, boards: {}, recordMemory: vi.fn(), backfillThumbHashes: vi.fn(),
        createGeneratedBoardNodes: async () => [], analytics: { track: async () => undefined }
      } as unknown as ImageGenerationDependencies);
      const result = await command({ ...input, outputFormat: "jpeg" });
      expect(result.job.status).toBe("succeeded");
      expect(result.job).toMatchObject({ delivery: { status: "succeeded" } });
      const originals = (result.job as typeof result.job & { originalImagePaths: string[] }).originalImagePaths;
      expect(await readFile(originals[0])).toEqual(raw);
      expect(result.images[0].original?.path).toBe(originals[0]);
      expect(result.images[0].path).toMatch(/\.jpg$/u);
      expect((await readFile(result.images[0].path)).subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
      expect(generate).toHaveBeenCalledOnce();
      expect(encodeImageDelivery).toHaveBeenCalledOnce();
      await history.flush();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects automatic stretching but retains the original and retries a padded JPEG locally", async () => {
    const f = await fixture(897, 1752);
    try {
      const result = await f.command({ ...input, size: "1200x2000", delivery: { format: "jpeg", size: "120x200" } });
      expect(result.job).toMatchObject({ status: "succeeded", delivery: { status: "failed" }, originalOutputMetadata: [{ width: 897, height: 1752 }] });
      expect(result.images[0].path).toMatch(/\.png$/u);
      expect(await readFile(result.images[0].path)).toEqual(f.raw);
      const retried = await f.command.retryDelivery({ jobId: result.job.id, delivery: { format: "jpeg", size: "120x200", fit: "contain" } });
      const image = await sharp(await readFile(retried.images[0].path)).metadata();
      expect(image).toMatchObject({ format: "jpeg", width: 120, height: 200 });
      expect(retried.job).toMatchObject({ delivery: { status: "succeeded" }, outputMetadata: [{ width: 120, height: 200, mimeType: "image/jpeg" }] });
      expect(await readFile(retried.job.originalImagePaths![0])).toEqual(f.raw);
      expect(f.generate).toHaveBeenCalledOnce();
      expect((await new HistoryStore(f.directory).getJob(result.job.id))?.delivery?.status).toBe("succeeded");
    } finally { await f.dispose(); }
  });

  it.each(["jpeg", "webp", "png"] as const)("encodes %s with exact crop dimensions and preserves original bytes", async (format) => {
    const f = await fixture(89, 175);
    try {
      const result = await f.command({ ...input, delivery: { format, size: "120x200", fit: "cover" } });
      expect(result.job.delivery?.status).toBe("succeeded");
      expect(await sharp(await readFile(result.images[0].path)).metadata()).toMatchObject({ format, width: 120, height: 200 });
      expect(await readFile(result.job.originalImagePaths![0])).toEqual(f.raw);
      expect(f.generate).toHaveBeenCalledOnce();
    } finally { await f.dispose(); }
  });

  it("commits originals before encoding and survives an unavailable encoder", async () => {
    const f = await fixture();
    try {
      f.encode.mockImplementationOnce(async () => {
        const [saved] = await f.history.listJobs();
        expect(saved).toMatchObject({ status: "succeeded", delivery: { status: "processing" } });
        expect(await readFile(saved.originalImagePaths![0])).toEqual(f.raw);
        throw new Error("encoder unavailable");
      });
      const result = await f.command({ ...input, delivery: { format: "jpeg", size: "120x200" } });
      expect(result.job.delivery?.status).toBe("failed");
      expect(result.job.status).toBe("succeeded");
      const retry = await f.command.retryDelivery({ jobId: result.job.id });
      expect(retry.job.delivery?.status).toBe("succeeded");
      expect(f.generate).toHaveBeenCalledOnce();
      expect(f.encode).toHaveBeenCalledTimes(2);
    } finally { await f.dispose(); }
  });

  it("records an actual native size mismatch without silently resizing the original", async () => {
    const f = await fixture(971, 1619);
    try {
      const result = await f.command({ ...input, size: "1200x2000" });
      expect(result.job.warnings?.join(" ")).toContain("971×1619");
      expect(result.images[0].path).toBe(result.job.originalImagePaths![0]);
      expect(f.encode).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });

  it("uses automatic native controls on an explicitly declared OAuth relay and restores delivery intent", async () => {
    const f = await fixture();
    try {
      f.config.imageControlMode = "automatic";
      const delivery = { format: "jpeg" as const, size: "120x200", fit: "scale" as const };
      const result = await f.command({ ...input, size: "1200x2000", quality: "high", outputFormat: "jpeg", delivery });
      expect(f.generate.mock.calls[0]?.[0]).toMatchObject({ size: "auto", quality: "auto", outputFormat: "png" });
      expect(JSON.stringify(f.generate.mock.calls[0])).toContain("3:5 aspect ratio");
      expect(result.job.input).toMatchObject({ size: "1200x2000", quality: "high", outputFormat: "jpeg", delivery });
      expect((await restoreGenerationHistoryJob(result.job, (file) => f.assets.readManagedDataUrl(file), [f.config])).input.delivery).toEqual(delivery);
    } finally { await f.dispose(); }
  });

  it("validates delivery before spending a provider request", async () => {
    const f = await fixture();
    try {
      await expect(f.command({ ...input, delivery: { size: "16384x16384" } })).rejects.toThrow("3200");
      expect(f.generate).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });

  it("recovers a local-stage interruption as retryable delivery, not an unknown paid request", async () => {
    const f = await fixture();
    try {
      const original = await f.command(input);
      await f.history.updateJob({ ...original.job, delivery: { status: "processing", options: { format: "jpeg", size: "120x200" } } });
      expect(await f.history.failInterruptedJobs()).toBe(1);
      expect(await f.history.getJob(original.job.id)).toMatchObject({ status: "succeeded", delivery: { status: "failed" } });
      const retry = await f.command.retryDelivery({ jobId: original.job.id });
      expect(retry.job.delivery?.status).toBe("succeeded");
      expect(f.generate).toHaveBeenCalledOnce();
    } finally { await f.dispose(); }
  });
});
