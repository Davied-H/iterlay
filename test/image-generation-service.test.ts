import { describe, expect, it, vi } from "vitest";
import type { GenerateImageInput, GenerationResult, ProviderConfig } from "../shared/types";
vi.mock("../electron/system-notification.js", () => ({ showGenerationCompletedNotification: vi.fn() }));
import { createImageGenerationCommand, type ImageGenerationDependencies } from "../electron/application/image-generation";
function fixture() {
  const config: ProviderConfig = { id: "custom", type: "openai-compatible", name: "Fixture", baseUrl: "https://fixture.invalid", generationEndpoint: "/v1/images/generations", model: "gpt-image-1", supportsReferenceImages: true };
  let finish!: (value: GenerationResult) => void;
  const generate = vi.fn(() => new Promise<GenerationResult>((resolve) => { finish = resolve; }));
  const history = { findByIdempotencyKey: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null), addJob: vi.fn(async () => undefined), updateJob: vi.fn(async () => undefined) };
  const dependencies = {
    settings: { getSettings: () => ({ activeProviderId: "custom", providers: [config] }), getApiKey: () => "fixture-only" },
    history, assets: { saveReferenceImageBytes: async () => [], saveOutputs: async () => ["/managed/result.png"], toAssetUrl: () => "iterlay-asset://result" },
    getProviderAdapter: () => ({ generate }), recordMemory: vi.fn(), sceneMedia: {}, backfillThumbHashes: vi.fn(),
    createGeneratedBoardNodes: async () => [], boards: {}, analytics: { track: async () => undefined }
  };
  const command = createImageGenerationCommand(dependencies as unknown as ImageGenerationDependencies);
  const input: GenerateImageInput = { workflowMode: "generate", prompt: "Fixture", model: "gpt-image-1", size: "auto", n: 1, referenceImages: [], boardId: "board", idempotencyKey: "request-1" };
  return { command, input, config, generate, history, finish: () => finish({ images: [{ bytes: Buffer.from([1]), mimeType: "image/png" }] }) };
}
describe("shared UI and MCP image generation service", () => {
  it("coalesces concurrent identical submissions and reuses a committed result", async () => {
    const f = fixture();
    const first = f.command(f.input), second = f.command({ ...f.input });
    await vi.waitFor(() => expect(f.generate).toHaveBeenCalledOnce());
    f.finish();
    const [a, b] = await Promise.all([first, second]);
    expect(a.job.id).toBe(b.job.id);
    expect(f.history.addJob).toHaveBeenCalledOnce();
    f.history.findByIdempotencyKey.mockResolvedValue(a.job);
    expect((await f.command(f.input)).job.id).toBe(a.job.id);
    expect(f.generate).toHaveBeenCalledOnce();
  });
  it("rejects reusing a request identity on another board", async () => {
    const f = fixture();
    const first = f.command(f.input);
    await vi.waitFor(() => expect(f.generate).toHaveBeenCalledOnce());
    await expect(f.command({ ...f.input, boardId: "other" })).rejects.toThrow("其他生成参数");
    f.finish();
    await first;
  });
  it("validates request data and provider-specific limits before provider work", async () => {
    const f = fixture();
    await expect(f.command({ ...f.input, n: NaN })).rejects.toThrow("生成参数");
    f.config.type = "ark";
    await expect(f.command({ ...f.input, n: 5 })).rejects.toThrow("最多生成 4");
    expect(f.generate).not.toHaveBeenCalled();
  });
});
