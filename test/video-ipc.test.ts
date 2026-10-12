import { beforeEach,describe,expect,it,vi } from "vitest";
import { registerVideoIpc } from "../electron/ipc.js";
import { PaidMediaQuoteService } from "../electron/paid-media-quote.js";
import type { VideoRemoteTask } from "../electron/providers/video-types.js";
import { VideoTaskServiceError } from "../electron/video-generation-service.js";
import type { VideoGenerationInput,VideoGenerationJob } from "../shared/types.js";

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showSaveDialog: vi.fn(),
  netFetch: vi.fn()
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp"), getVersion: vi.fn(() => "0.2.0") },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn(() => []) },
  clipboard: {},
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: electronMocks.showSaveDialog },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => electronMocks.handlers.set(channel, handler) },
  nativeImage: { createFromBuffer: vi.fn(), createFromPath: vi.fn() },
  nativeTheme: { shouldUseDarkColors: false },
  net: { fetch: electronMocks.netFetch },
  Notification: class {},
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() }
}));

const input: VideoGenerationInput = {
  prompt: "让海面动起来",
  model: "seedance-model",
  aspectRatio: "16:9",
  resolution: "720p",
  durationSeconds: 5,
  firstFramePath: "/managed/first.png",
  lastFramePath: "/managed/last.png",
  referenceImagePaths: ["/managed/reference.png"],
  providerId: "ark-provider",
  boardId: "board-1",
  generationNodeId: "video-generation-1"
};

function makeHarness(options: { wait?: (task: VideoRemoteTask, signal?: AbortSignal) => Promise<VideoRemoteTask>; provider?: "official" | "ark" | "fal" | "openrouter"; linkedFal?: boolean; modelCapability?: "supported" | "unsupported" | "unknown" } = {}) {
  const providerType = options.provider ?? "ark";
  const jobs = new Map<string, VideoGenerationJob>();
  const task: VideoRemoteTask = {
    provider: providerType,
    id: "remote-1",
    model: input.model,
    status: "queued",
    submittedAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z"
  };
  const service = {
    capability: vi.fn(() => ({ provider: "ark", supportsCancel: false })),
    modelOption: vi.fn(async () => options.modelCapability === "unknown" ? { id: input.model } : { id: input.model, supportedModes: options.modelCapability === "unsupported" ? ["image-to-video"] : ["first-last-frame"] }),
    submit: vi.fn(async (submittedInput: unknown, _config?: unknown) => {
      void submittedInput;
      void _config;
      return task;
    }),
    waitForCompletion: vi.fn(async (remote: VideoRemoteTask, _config: unknown, waitOptions: { signal?: AbortSignal }) => {
      if (options.wait) return options.wait(remote, waitOptions.signal);
      return {
        ...remote,
        status: "succeeded" as const,
        outputs: [{ kind: "video" as const, role: "result" as const, url: "https://media.test/result.mp4" }]
      };
    }),
    download: vi.fn(async () => ({ bytes: Buffer.from("video"), mimeType: "video/mp4", sourceUrl: "https://media.test/result.mp4" })),
    cancel: vi.fn()
  };
  const assets = {
    exportAsset: vi.fn(),
    readManagedBytes: vi.fn(async (value: string) => Buffer.from(value)),
    saveVideoOutput: vi.fn(async () => "/managed/video-outputs/job.mp4"),
    saveVideoUploadBytes: vi.fn(async () => "/managed/video-uploads/upload.mp4"),
    saveAudioUploadBytes: vi.fn(async () => "/managed/audio-uploads/upload.mp3"),
    saveImportedImage: vi.fn(),
    toAssetUrl: vi.fn((value: string) => `iterlay-asset://${value}`)
  };
  const boards = {
    getBoard: vi.fn(async () => ({ nodes: [
      { id: "video-generation-1", type: "video-generation" },
      { id: "target-video", type: "video", videoPath: "/managed/source.mp4", jobId: "source-job", source: "upload" }
    ] })),
    startVideoGenerationNode: vi.fn(async () => true),
    finishVideoGenerationNode: vi.fn(async () => true),
    finishVideoGenerationNodeVersion: vi.fn(async () => true)
  };
  const videoTasks = {
    addJob: vi.fn(async (job: VideoGenerationJob) => { jobs.set(job.id, structuredClone(job)); }),
    updateJob: vi.fn(async (job: VideoGenerationJob) => { jobs.set(job.id, structuredClone(job)); }),
    listJobs: vi.fn(async () => [...jobs.values()]),
    listRecoverableJobs: vi.fn(async () => [...jobs.values()].filter((job) => Boolean(job.remoteTaskId))),
    getJob: vi.fn(async (id: string) => jobs.get(id) ?? null)
  };
  const videoProvider = {
    id: "ark-provider",
    name: "Ark",
    type: providerType,
    ...(options.linkedFal ? { connectionProviderId: "fal-images" } : {}),
    baseUrl: providerType === "fal"
      ? "https://queue.fal.run"
      : providerType === "openrouter"
        ? "https://openrouter.ai/api"
        : "https://ark.test/api/v3",
    models: ["seedance-model", "bytedance/seedance-2.0/image-to-video"],
    model: "seedance-model"
  };
  const settings = {
    getSettings: vi.fn(() => ({
      activeVideoProviderId: "ark-provider",
      videoProviders: [videoProvider]
    })),
    getApiKey: vi.fn(() => "ark-key"),
    resolveVideoProviderConnection: vi.fn(() => options.linkedFal
      ? { baseUrl: "https://shared-fal.example", apiKey: "shared-fal-key", connectionProviderId: "fal-images" }
      : { baseUrl: videoProvider.baseUrl, apiKey: "ark-key", connectionProviderId: videoProvider.id })
  };
  return { jobs, service, videoService: service, assets, boards, videoTasks, settings, paidMediaQuotes: { consume: vi.fn(async (_metadata, _expected, action: () => Promise<unknown>) => action()) } };
}

describe("video IPC", () => {
  beforeEach(() => {
    electronMocks.handlers.clear();
    electronMocks.showSaveDialog.mockReset();
    electronMocks.netFetch.mockReset();
  });

  it("imports video bytes and exposes Ark capabilities with a controlled asset URL", async () => {
    const harness = makeHarness();
    const registration = registerVideoIpc(harness as never);
    const importVideo = electronMocks.handlers.get("video:import");
    const importAudio = electronMocks.handlers.get("audio:import");
    const capabilities = electronMocks.handlers.get("video:capabilities");
    if (!importVideo || !importAudio || !capabilities) throw new Error("video asset handlers were not registered");
    const bytes = Uint8Array.from([1, 2, 3]).buffer;

    await expect(importVideo({}, bytes, "video/mp4")).resolves.toEqual({
      path: "/managed/video-uploads/upload.mp4",
      mimeType: "video/mp4",
      videoUrl: "iterlay-asset:///managed/video-uploads/upload.mp4"
    });
    expect(harness.assets.saveVideoUploadBytes).toHaveBeenCalledWith(Buffer.from(bytes), "video/mp4");
    await expect(importAudio({}, bytes, "audio/mpeg")).resolves.toEqual({
      path: "/managed/audio-uploads/upload.mp3",
      mimeType: "audio/mpeg",
      audioUrl: "iterlay-asset:///managed/audio-uploads/upload.mp3"
    });
    expect(harness.assets.saveAudioUploadBytes).toHaveBeenCalledWith(Buffer.from(bytes), "audio/mpeg");
    expect(capabilities({})).toMatchObject({ provider: "ark", supportsCancel: false });
    registration.dispose();
  });

  it("maps first/last/reference images and persists output before finishing the board node", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness();
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    const queued = await start({}, input) as VideoGenerationJob;

    expect(queued, queued.error).toMatchObject({ status: "queued", remoteTaskId: "remote-1" });
    expect(harness.boards.startVideoGenerationNode).toHaveBeenCalledWith(
      "board-1",
      "video-generation-1",
      expect.objectContaining({ jobId: queued.id, status: "submitting" })
    );
    expect(harness.service.submit.mock.calls[0][0]).toMatchObject({
      inputs: [
        expect.objectContaining({ role: "first-frame", name: "first.png" }),
        expect.objectContaining({ role: "last-frame", name: "last.png" }),
        expect.objectContaining({ role: "reference-image", name: "reference.png" })
      ]
    });
    await vi.waitFor(() => expect(harness.boards.finishVideoGenerationNode).toHaveBeenCalledOnce());
    expect(harness.assets.saveVideoOutput.mock.invocationCallOrder[0])
      .toBeLessThan(harness.boards.finishVideoGenerationNode.mock.invocationCallOrder[0]);
    expect([...harness.jobs.values()][0]).toMatchObject({
      status: "completed",
      outputVideoPath: "/managed/video-outputs/job.mp4"
    });
    registration.dispose();
  });

  it("deduplicates replayed paid submissions by immutable preflight metadata", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness();
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");
    const paidInput = { ...input, inputFingerprint: "fingerprint", generationAttemptId: "attempt", quoteId: "estimate:fingerprint", idempotencyKey: "attempt:fingerprint:estimate:fingerprint", priceSnapshot: { stage: "video" as const, amount: 5, currency: "gold-bean", authoritative: false } };
    const first = await start({}, paidInput) as VideoGenerationJob;
    const replay = await start({}, structuredClone(paidInput)) as VideoGenerationJob;
    expect(replay.id).toBe(first.id);
    expect(harness.videoTasks.addJob).toHaveBeenCalledOnce();
    expect(harness.service.submit).toHaveBeenCalledOnce();
    expect(harness.service.submit).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: paidInput.generationAttemptId }), expect.anything());
    expect(first.input).toMatchObject({ inputFingerprint: "fingerprint", quoteId: "estimate:fingerprint", priceSnapshot: { amount: 5 } });
    registration.dispose();
  });

  it("atomically returns one job for concurrent same-key external video IPC submissions", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "ark" });
    const quotes = new PaidMediaQuoteService();
    harness.paidMediaQuotes = quotes as never;
    const generationAttemptId = crypto.randomUUID();
    const inputFingerprint = "official-video-fingerprint";
    const quote = await quotes.issue({
      clientRequestId: generationAttemptId,
      inputFingerprint,
      providerKey: "ark-provider",
      stage: "video",
      amount: 5,
      currency: "gold-bean",
      balance: 10,
      pricingKey: JSON.stringify([{ providerId: "ark-provider", model: input.model, durationSeconds: input.durationSeconds, resolution: input.resolution, generateAudio: false }]),
      boardId: input.boardId!,
      requestScope: input.generationNodeId!,
      purpose: "video",
      operation: "video:start"
    });
    const paidInput = {
      ...input,
      generationAttemptId,
      inputFingerprint,
      quoteId: quote.quoteId,
      quoteExpiresAt: quote.expiresAt,
      idempotencyKey: [generationAttemptId, inputFingerprint, quote.quoteId].join(":"),
      priceSnapshot: quote.priceSnapshot,
      quoteBoardId: input.boardId,
      quoteRequestScope: input.generationNodeId,
      quotePurpose: "video",
      quoteOperation: "video:start"
    };
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    const [first, retry] = await Promise.all([
      start({}, structuredClone(paidInput)),
      start({}, structuredClone(paidInput))
    ]) as VideoGenerationJob[];

    expect(retry.id).toBe(first.id);
    expect(harness.videoTasks.addJob).toHaveBeenCalledOnce();
    expect(harness.service.submit).toHaveBeenCalledOnce();
    registration.dispose();
  });

  it("passes a selected fal.ai provider config to the video service", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "fal" });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    await start({}, input);

    expect(harness.service.submit.mock.calls[0][1]).toMatchObject({
      provider: "fal",
      baseUrl: "https://queue.fal.run",
      apiKey: "ark-key",
      model: "seedance-model"
    });
    registration.dispose();
  });

  it("persists and submits a default prompt for an image-only Seedance 2.0 request", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "fal" });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    const queued = await start({}, {
      ...input,
      prompt: "",
      model: "bytedance/seedance-2.0/image-to-video",
      referenceImagePaths: []
    }) as VideoGenerationJob;

    expect(queued.input.prompt).toBe("在首尾画面之间自然过渡，保持主体与场景一致。");
    expect(harness.service.submit).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "在首尾画面之间自然过渡，保持主体与场景一致。" }),
      expect.anything()
    );
    registration.dispose();
  });

  it("keeps a failed submit in video history and marks its persistent placeholder failed", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "fal" });
    harness.service.submit.mockRejectedValueOnce(Object.assign(new Error("fal.ai 请求失败（HTTP 405）。"), { code: "FAL_API_ERROR", status: 405 }));
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    const failed = await start({}, input) as VideoGenerationJob;

    expect(failed).toMatchObject({ status: "failed", error: "fal.ai 请求失败（HTTP 405）。" });
    expect(harness.jobs.get(failed.id)).toMatchObject({ status: "failed" });
    expect(harness.boards.finishVideoGenerationNode).toHaveBeenCalledWith(
      "board-1",
      "video-generation-1",
      { jobId: failed.id, error: "fal.ai 请求失败（HTTP 405）。" }
    );
    registration.dispose();
  });

  it("uses a linked fal.ai image connection while keeping the video model", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "fal", linkedFal: true });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    await start({}, input);

    expect(harness.settings.resolveVideoProviderConnection).toHaveBeenCalledWith(expect.objectContaining({
      id: "ark-provider",
      connectionProviderId: "fal-images"
    }));
    expect(harness.service.submit.mock.calls[0][1]).toMatchObject({
      provider: "fal",
      baseUrl: "https://shared-fal.example",
      apiKey: "shared-fal-key",
      model: "seedance-model"
    });
    registration.dispose();
  });

  it("blocks a comic first-last submission when model capability is unknown", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ modelCapability: "unknown" });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start")!;
    await expect(start({}, {
      ...input,
      requireFirstLastFrameCapability: true,
      firstFramePath: "/managed/first.png",
      lastFramePath: "/managed/last.png"
    })).rejects.toThrow("能力未知");
    expect(harness.service.submit).not.toHaveBeenCalled();
    expect(harness.videoTasks.addJob).not.toHaveBeenCalled();
    registration.dispose();
  });

  it("passes OpenRouter credentials and a saved model to the video service", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "openrouter" });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    await start({}, input);

    expect(harness.service.submit).toHaveBeenCalledWith(
      expect.objectContaining({ model: "seedance-model" }),
      expect.objectContaining({
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api",
        apiKey: "ark-key",
        model: "seedance-model"
      })
    );
    registration.dispose();
  });

  it("rejects legacy official providers before any remote submission", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "official" });
    const registration = registerVideoIpc(harness as never);
    await expect(electronMocks.handlers.get("video:start")!({}, input)).rejects.toThrow("官方 Provider 已移除");
    expect(harness.service.submit).not.toHaveBeenCalled();
    registration.dispose();
  });


  it("supplies the image-to-video default prompt for a fal Seedance request", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({ provider: "fal" });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    const queued = await start({}, {
      ...input,
      prompt: "",
      model: "bytedance/seedance-2.0/image-to-video",
      firstFramePath: "/managed/first.png"
    }) as VideoGenerationJob;

    expect(queued.input.prompt).toBe("在首尾画面之间自然过渡，保持主体与场景一致。");
    expect(harness.service.submit).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "在首尾画面之间自然过渡，保持主体与场景一致。" }),
      expect.anything()
    );
    registration.dispose();
  });

  it("stops only local polling and never calls provider cancellation or writes cancelled", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness({
      wait: (task, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new VideoTaskServiceError(
          "POLLING_STOPPED",
          "stopped",
          { ...task, status: "running" },
          true
        )), { once: true });
      })
    });
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    const stop = electronMocks.handlers.get("video:stopPolling");
    if (!start || !stop) throw new Error("video task handlers were not registered");
    const queued = await start({}, input) as VideoGenerationJob;

    await expect(stop({}, queued.id)).resolves.toMatchObject({ stopped: true });
    await vi.waitFor(() => expect(harness.videoTasks.updateJob).toHaveBeenCalled());

    expect(harness.service.cancel).not.toHaveBeenCalled();
    expect(harness.jobs.get(queued.id)?.status).not.toBe("cancelled");
    registration.dispose();
  });

  it("maps remix video/audio inputs and atomically appends the completed target version", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness();
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");
    const remixInput: VideoGenerationInput = {
      ...input,
      mode: "remix",
      sourceVideoPath: "/managed/source.mp4",
      referenceVideoPaths: ["/managed/reference.mp4"],
      referenceAudioPaths: ["/managed/reference.mp3"],
      targetVideoNodeId: "target-video"
    };

    await start({}, remixInput);
    await vi.waitFor(() => expect(harness.boards.finishVideoGenerationNodeVersion).toHaveBeenCalledOnce());

    expect(harness.service.submit.mock.calls[0][0]).toMatchObject({
      mode: "remix",
      inputs: expect.arrayContaining([
        expect.objectContaining({ kind: "video", role: "reference-video", name: "source.mp4" }),
        expect.objectContaining({ kind: "video", role: "reference-video", name: "reference.mp4" }),
        expect.objectContaining({ kind: "audio", role: "reference-audio", name: "reference.mp3" })
      ])
    });
    expect(harness.boards.finishVideoGenerationNodeVersion).toHaveBeenCalledWith(
      "board-1",
      "video-generation-1",
      "target-video",
      expect.objectContaining({
        version: expect.objectContaining({ videoPath: "/managed/video-outputs/job.mp4", jobId: expect.any(String) })
      })
    );
    expect(harness.boards.finishVideoGenerationNode).not.toHaveBeenCalled();
    registration.dispose();
  });

  it("always creates a derived video for extend even if a target node id is supplied", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness();
    const registration = registerVideoIpc(harness as never);
    const start = electronMocks.handlers.get("video:start");
    if (!start) throw new Error("video:start was not registered");

    await start({}, {
      ...input,
      mode: "extend",
      sourceVideoPath: "/managed/source.mp4",
      targetVideoNodeId: "target-video"
    });
    await vi.waitFor(() => expect(harness.boards.finishVideoGenerationNode).toHaveBeenCalledOnce());

    expect(harness.boards.finishVideoGenerationNodeVersion).not.toHaveBeenCalled();
    expect(harness.boards.finishVideoGenerationNode).toHaveBeenCalledWith(
      "board-1",
      "video-generation-1",
      expect.objectContaining({ node: expect.objectContaining({ type: "video" }) })
    );
    registration.dispose();
  });

  it("recovers persisted remote jobs without submitting a duplicate task", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness();
    const stored: VideoGenerationJob = {
      id: "video-job-recover",
      status: "generating",
      createdAt: "2026-08-11T00:00:00.000Z",
      input,
      providerId: "ark-provider",
      providerName: "Ark",
      model: input.model,
      remoteTaskId: "remote-recover"
    };
    harness.jobs.set(stored.id, stored);
    const registration = registerVideoIpc(harness as never);
    const recover = electronMocks.handlers.get("video:recover");
    if (!recover) throw new Error("video:recover was not registered");

    await expect(recover({})).resolves.toMatchObject([{ id: stored.id, status: "recovering" }]);
    await vi.waitFor(() => expect(harness.jobs.get(stored.id)?.status).toBe("completed"));

    expect(harness.service.submit).not.toHaveBeenCalled();
    expect(harness.boards.startVideoGenerationNode).toHaveBeenCalledWith(
      "board-1",
      "video-generation-1",
      { jobId: stored.id, status: "generating" }
    );
    expect(harness.service.waitForCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ id: "remote-recover", status: "running" }),
      expect.anything(),
      expect.anything()
    );
    registration.dispose();
  });

  it("returns an already-running recovery without starting a duplicate background run", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    let release: ((task: VideoRemoteTask) => void) | undefined;
    const harness = makeHarness({
      wait: (task) => new Promise((resolve) => {
        release = () => resolve({
          ...task,
          status: "succeeded",
          outputs: [{ kind: "video", role: "result", url: "https://media.test/result.mp4" }]
        });
      })
    });
    const stored: VideoGenerationJob = {
      id: "video-job-active-recovery",
      status: "generating",
      createdAt: "2026-08-11T00:00:00.000Z",
      input,
      providerId: "ark-provider",
      providerName: "Ark",
      model: input.model,
      remoteTaskId: "remote-active"
    };
    harness.jobs.set(stored.id, stored);
    const registration = registerVideoIpc(harness as never);
    const recover = electronMocks.handlers.get("video:recover");
    if (!recover) throw new Error("video:recover was not registered");

    await expect(recover({})).resolves.toMatchObject([{ id: stored.id, status: "recovering" }]);
    await expect(recover({})).resolves.toMatchObject([{ id: stored.id }]);

    expect(harness.service.waitForCompletion).toHaveBeenCalledOnce();
    expect(harness.service.submit).not.toHaveBeenCalled();
    expect(harness.boards.startVideoGenerationNode).toHaveBeenCalledTimes(2);
    release?.({} as VideoRemoteTask);
    registration.dispose();
  });

  it("repairs a completed history job whose canvas result was not finalized before exit", async () => {
    const { registerVideoIpc } = await import("../electron/ipc.js");
    const harness = makeHarness();
    const completed: VideoGenerationJob = {
      id: "video-job-completed-before-board",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      completedAt: "2026-08-11T00:01:00.000Z",
      input,
      providerId: "ark-provider",
      providerName: "Ark",
      model: input.model,
      remoteTaskId: "remote-completed",
      outputVideoPath: "/managed/video-outputs/completed.mp4",
      mimeType: "video/mp4"
    };
    harness.jobs.set(completed.id, completed);
    harness.boards.getBoard.mockResolvedValueOnce({ nodes: [{
      id: "video-generation-1",
      type: "video-generation",
      lastGenerationId: completed.id,
      status: "post_processing"
    }] } as never);
    const registration = registerVideoIpc(harness as never);
    const recover = electronMocks.handlers.get("video:recover");
    if (!recover) throw new Error("video:recover was not registered");

    await expect(recover({})).resolves.toMatchObject([{ id: completed.id, status: "completed" }]);
    expect(harness.boards.finishVideoGenerationNode).toHaveBeenCalledWith(
      "board-1",
      "video-generation-1",
      expect.objectContaining({
        jobId: completed.id,
        node: expect.objectContaining({
          id: `video-output-${completed.id}`,
          videoPath: "/managed/video-outputs/completed.mp4"
        })
      })
    );
    expect(harness.service.submit).not.toHaveBeenCalled();
    expect(harness.service.waitForCompletion).not.toHaveBeenCalled();
    registration.dispose();
  });
});
