import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../electron/providers/errors.js";
import type {
  ArkVideoProviderConfig,
  DownloadedVideo,
  VideoCancelResult,
  VideoProvider,
  VideoRemoteOutput,
  VideoRemoteTask
} from "../electron/providers/video-types.js";
import { ARK_VIDEO_CAPABILITY } from "../electron/providers/video-ark.js";
import { VideoGenerationService, VideoTaskServiceError } from "../electron/video-generation-service.js";

const config: ArkVideoProviderConfig = {
  provider: "ark",
  apiKey: "ark-key",
  model: "doubao-seedance-1-5-pro"
};

const queuedTask: VideoRemoteTask = {
  provider: "ark",
  id: "task-1",
  model: config.model,
  status: "queued",
  submittedAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z"
};

class FakeVideoProvider implements VideoProvider {
  readonly capability = ARK_VIDEO_CAPABILITY;
  readonly submit = vi.fn(async () => queuedTask);
  readonly poll = vi.fn(async (task: VideoRemoteTask) => task);
  readonly cancel = vi.fn(async (task: VideoRemoteTask): Promise<VideoCancelResult> => ({ supported: false, cancelled: false, task }));
  readonly download = vi.fn(async (output: VideoRemoteOutput): Promise<DownloadedVideo> => ({
    bytes: Buffer.from("video"),
    mimeType: "video/mp4",
    sourceUrl: output.url
  }));
}

describe("VideoGenerationService", () => {
  it("exposes capabilities and delegates submit", async () => {
    const provider = new FakeVideoProvider();
    const service = new VideoGenerationService([provider]);

    expect(service.capability()).toBe(ARK_VIDEO_CAPABILITY);
    await expect(service.submit({ prompt: "海面日出" }, config)).resolves.toBe(queuedTask);
    expect(provider.submit).toHaveBeenCalledWith({ prompt: "海面日出" }, config, { signal: undefined });
  });

  it("normalizes submit inputs before delegating to a provider", async () => {
    const provider = new FakeVideoProvider();
    const normalize = vi.fn(async (input: { prompt: string }) => ({ ...input, prompt: `${input.prompt}（已规范化）` }));
    const service = new VideoGenerationService([provider], normalize);

    await service.submit({ prompt: "海面日出" }, config);

    expect(normalize).toHaveBeenCalledWith({ prompt: "海面日出" }, config);
    expect(provider.submit).toHaveBeenCalledWith({ prompt: "海面日出（已规范化）" }, config, { signal: undefined });
  });

  it("polls queued -> running -> succeeded and reports each snapshot", async () => {
    const provider = new FakeVideoProvider();
    const runningTask = { ...queuedTask, status: "running" as const, updatedAt: "2026-08-11T00:00:01.000Z" };
    const succeededTask = {
      ...runningTask,
      status: "succeeded" as const,
      updatedAt: "2026-08-11T00:00:02.000Z",
      outputs: [{ kind: "video" as const, role: "result" as const, url: "https://media.test/result.mp4" }]
    };
    provider.poll.mockResolvedValueOnce(runningTask).mockResolvedValueOnce(succeededTask);
    const service = new VideoGenerationService([provider]);
    const updates: VideoRemoteTask[] = [];

    const result = await service.waitForCompletion(queuedTask, config, { pollIntervalMs: 0, onUpdate: (task) => updates.push(task) });

    expect(result).toBe(succeededTask);
    expect(updates).toEqual([runningTask, succeededTask]);
    expect(provider.poll).toHaveBeenCalledTimes(2);
  });

  it("stops local waiting with the latest recoverable snapshot and never calls cancel", async () => {
    const provider = new FakeVideoProvider();
    const runningTask = { ...queuedTask, status: "running" as const, updatedAt: "2026-08-11T00:00:01.000Z" };
    provider.poll.mockResolvedValueOnce(runningTask);
    const service = new VideoGenerationService([provider]);
    const controller = new AbortController();

    const waiting = service.waitForCompletion(queuedTask, config, {
      signal: controller.signal,
      pollIntervalMs: 60_000,
      onUpdate: () => controller.abort()
    });

    await expect(waiting).rejects.toMatchObject({
      name: "VideoTaskServiceError",
      code: "POLLING_STOPPED",
      recoverable: true,
      task: runningTask
    });
    expect(provider.cancel).not.toHaveBeenCalled();
  });

  it("preserves the task and marks poll network failures as recoverable", async () => {
    const provider = new FakeVideoProvider();
    provider.poll.mockRejectedValueOnce(new ProviderError("NETWORK_ERROR", "offline"));
    const service = new VideoGenerationService([provider]);

    const error = await service.poll(queuedTask, config).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(VideoTaskServiceError);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", recoverable: true, task: queuedTask });
  });

  it("preserves the task and marks download failures as recoverable", async () => {
    const provider = new FakeVideoProvider();
    provider.download.mockRejectedValueOnce(new ProviderError("DOWNLOAD_FAILED", "temporary failure"));
    const service = new VideoGenerationService([provider]);
    const output: VideoRemoteOutput = { kind: "video", role: "result", url: "https://media.test/result.mp4" };

    await expect(service.download(queuedTask, output, config)).rejects.toMatchObject({
      code: "DOWNLOAD_FAILED",
      recoverable: true,
      task: queuedTask
    });
  });

  it("returns Ark's unsupported cancellation result without changing task state", async () => {
    const provider = new FakeVideoProvider();
    const service = new VideoGenerationService([provider]);

    const result = await service.cancel(queuedTask, config);

    expect(result).toMatchObject({ supported: false, cancelled: false, task: queuedTask });
    expect(result.task.status).toBe("queued");
    expect(provider.cancel).toHaveBeenCalledOnce();
  });
});
