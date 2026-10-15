import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoSequenceStore, freezeSequenceImage } from "../electron/storage/video-sequence-store.js";
import { VideoSequenceScheduler } from "../electron/video/video-sequence-scheduler.js";
import type { VideoSequenceTask } from "../electron/video-sequence-types.js";

type Handler = (...args: unknown[]) => unknown;
const handlers = vi.hoisted(() => new Map<string, Handler>());
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showSaveDialog: vi.fn() },
  ipcMain: { handle: (name: string, fn: Handler) => handlers.set(name, fn), removeHandler: (name: string) => handlers.delete(name) }
}));

const missing = () => new Error("MEDIA_TOOLS_REQUIRED: 请安装视频组件。");
const media = { mimeType: "video/mp4", width: 1280, height: 720, durationMs: 1_000 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("video component submission and recovery guards", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-tools-guards-")); handlers.clear(); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  async function fixture(status: VideoSequenceTask["status"] = "pending") {
    const store = new VideoSequenceStore(directory);
    const frames = await Promise.all(["a", "b", "c"].map(async (name) => {
      const imagePath = path.join(directory, `${name}.png`);
      await writeFile(imagePath, name);
      return freezeSequenceImage({ imagePath, sha256: "" });
    }));
    const sequence = await store.createSequence({ boardId: "board", sources: frames });
    const segment = sequence.segments[0];
    const now = new Date().toISOString();
    const task: VideoSequenceTask = {
      schemaVersion: 1, id: "task", clientRequestId: "request", boardId: "board", sequenceId: sequence.id,
      segmentId: segment.id, segmentRevision: segment.desiredRevision, inputFingerprint: segment.inputFingerprint,
      attempt: 1, status, createdAt: now, updatedAt: now,
      input: { prompt: "move", model: "model", aspectRatio: "16:9", resolution: "720p", durationSeconds: 1,
        referenceImagePaths: [], firstFramePath: frames[0].imagePath, lastFramePath: frames[1].imagePath, providerId: "provider" },
      inputSnapshot: { firstFrame: frames[0], lastFrame: frames[1], config: {
        prompt: "move", providerId: "provider", model: "model", durationSeconds: 1, aspectRatio: "16:9",
        resolution: "720p", generateAudio: false, watermark: false
      } }
    };
    return { store, sequence, task, now };
  }

  it.each(["run", "retry", "resume"])("blocks %s before quotes, task writes, or enqueue when components are absent", async (operation) => {
    const { registerVideoSequenceIpc } = await import("../electron/video/video-sequence-ipc.js");
    const { store, sequence } = await fixture();
    const enqueue = vi.fn();
    const consume = vi.fn();
    const registration = registerVideoSequenceIpc({
      store, templates: {}, scheduler: { enqueue }, ffmpeg: { ensureReady: vi.fn().mockRejectedValue(missing()) },
      boards: {}, assets: {}, settings: { getSettings: () => ({ videoProviders: [] }) }, paidMediaQuotes: { consume }
    } as never);
    await expect(handlers.get(`videoSequence:${operation}`)!({}, {
      boardId: "board", sequenceId: sequence.id, expectedRevision: sequence.revision, scope: "all",
      segmentIds: sequence.segments.map((segment) => segment.id)
    })).rejects.toThrow("MEDIA_TOOLS_REQUIRED");
    expect(consume).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(await store.listTasks()).toEqual([]);
    expect(await store.isPaused(sequence.id)).toBe(false);
    registration.dispose();
  });

  it("waits before a fresh Provider submission and resumes exactly once after installation", async () => {
    const { store, task, now } = await fixture();
    await store.createTasks([task]);
    let ready = false;
    const ensureReady = vi.fn(async () => { if (!ready) throw missing(); return {}; });
    const videoService = {
      submit: vi.fn(async () => ({ provider: "ark", id: "remote", model: "model", status: "queued", submittedAt: now, updatedAt: now })),
      waitForCompletion: vi.fn(async () => ({ provider: "ark", id: "remote", model: "model", status: "succeeded", submittedAt: now, updatedAt: now,
        outputs: [{ kind: "video", role: "result", url: "https://example.test/video.mp4" }] })),
      download: vi.fn(async () => ({ bytes: Buffer.from("video"), mimeType: "video/mp4" }))
    };
    const scheduler = new VideoSequenceScheduler({
      store, assets: { readManagedBytes: async () => Buffer.from("image"), saveVideoOutput: async () => path.join(directory, "output.mp4") },
      videoService, ffmpeg: { ensureReady, probe: vi.fn(async () => media) },
      resolveProvider: () => ({ config: { provider: "ark", model: "model", apiKey: "key" }, providerName: "Ark" })
    } as never);
    try {
      scheduler.enqueue([task.id]);
      await vi.waitFor(async () => expect((await store.getTask(task.id))?.error).toContain("MEDIA_TOOLS_REQUIRED"));
      expect(videoService.submit).not.toHaveBeenCalled();
      expect((await store.getTask(task.id))?.status).toBe("pending");
      ready = true;
      scheduler.resumeWaitingForTools();
      scheduler.resumeWaitingForTools();
      await vi.waitFor(async () => expect((await store.getTask(task.id))?.status).toBe("completed"));
      expect(videoService.submit).toHaveBeenCalledOnce();
      expect((await store.getTask(task.id))?.error).toBeUndefined();
    } finally { scheduler.dispose(); }
  });

  it("retains a recovered downloaded result and validates it without regenerating or redownloading", async () => {
    const { store, task } = await fixture("validating");
    const outputVideoPath = path.join(directory, "already-paid.mp4");
    await writeFile(outputVideoPath, "video");
    await store.createTasks([{ ...task, remoteTaskId: "already-paid", remoteProviderType: "ark", processingCheckpoint: "downloaded",
      remoteOutputs: [{ kind: "video", role: "result", url: "https://example.test/paid.mp4" }], outputVideoPath }]);
    let ready = false;
    const ensureReady = vi.fn(async () => { if (!ready) throw missing(); return {}; });
    const probe = vi.fn(async () => { await ensureReady(); return media; });
    const videoService = { submit: vi.fn(), waitForCompletion: vi.fn(), download: vi.fn() };
    const scheduler = new VideoSequenceScheduler({
      store, assets: { readManagedBytes: vi.fn(), saveVideoOutput: vi.fn() }, videoService,
      ffmpeg: { ensureReady, probe },
      resolveProvider: () => ({ config: { provider: "ark", model: "model", apiKey: "key" }, providerName: "Ark" })
    } as never);
    try {
      await scheduler.recover();
      await vi.waitFor(async () => expect((await store.getTask(task.id))?.error).toContain("MEDIA_TOOLS_REQUIRED"));
      expect(await store.getTask(task.id)).toMatchObject({ status: "validating", processingCheckpoint: "downloaded", outputVideoPath });
      ready = true;
      scheduler.resumeWaitingForTools();
      await vi.waitFor(async () => expect((await store.getTask(task.id))?.status).toBe("completed"));
      expect(videoService.submit).not.toHaveBeenCalled();
      expect(videoService.waitForCompletion).not.toHaveBeenCalled();
      expect(videoService.download).not.toHaveBeenCalled();
      expect(probe).toHaveBeenLastCalledWith(outputVideoPath);
    } finally { scheduler.dispose(); }
  });

  it("does not submit a cancelled task selected while automatically resuming after installation", async () => {
    const { store, task } = await fixture();
    await store.createTasks([task]);
    let ready = false;
    const ensureReady = vi.fn(async () => { if (!ready) throw missing(); return {}; });
    const videoService = { submit: vi.fn(async () => { throw new Error("Cancelled tasks must not submit"); }) };
    const scheduler = new VideoSequenceScheduler({
      store, assets: { readManagedBytes: async () => Buffer.from("image") }, videoService,
      ffmpeg: { ensureReady },
      resolveProvider: () => ({ config: { provider: "ark", model: "model", apiKey: "key" }, providerName: "Ark" })
    } as never);
    try {
      scheduler.enqueue([task.id]);
      await vi.waitFor(async () => expect((await store.getTask(task.id))?.error).toContain("MEDIA_TOOLS_REQUIRED"));
      // Keep subsequent writes in memory so all work after releasing the paused
      // selection is deterministic microtask work rather than filesystem timing.
      let current = (await store.getTask(task.id))!;
      vi.spyOn(store, "getTask").mockImplementation(async () => structuredClone(current));
      vi.spyOn(store, "updateTask").mockImplementation(async (_id, patch) => {
        current = { ...current, ...structuredClone(patch) };
        return structuredClone(current);
      });
      const selected = deferred<void>();
      const releaseSelection = deferred<boolean>();
      vi.spyOn(store, "isPaused").mockImplementationOnce(async () => {
        selected.resolve();
        return releaseSelection.promise;
      });
      ready = true;
      scheduler.resumeWaitingForTools();
      await selected.promise;
      expect(await scheduler.cancel(task.id)).toMatchObject({ cancelled: true });
      expect(current.status).toBe("cancelled");
      releaseSelection.resolve(false);
      await new Promise<void>((resolve) => setImmediate(resolve));
      scheduler.resumeWaitingForTools();
      scheduler.enqueue([task.id]);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(videoService.submit).not.toHaveBeenCalled();
      expect(current.status).toBe("cancelled");
    } finally { scheduler.dispose(); }
  });

  it("does not publish a downloaded result when cancelled during component probing", async () => {
    const { store, task } = await fixture("validating");
    await store.createTasks([{ ...task, remoteTaskId: "already-paid", remoteProviderType: "ark", processingCheckpoint: "downloaded",
      remoteOutputs: [{ kind: "video", role: "result", url: "https://example.test/paid.mp4" }], outputVideoPath: path.join(directory, "paid.mp4") }]);
    const probing = deferred<void>();
    const releaseProbe = deferred<typeof media>();
    const afterCancellation = deferred<VideoSequenceTask["status"]>();
    let cancelled = false;
    const updateTask = store.updateTask.bind(store);
    vi.spyOn(store, "updateTask").mockImplementation(async (id, patch) => {
      const result = await updateTask(id, patch);
      if (cancelled && patch.status) afterCancellation.resolve(patch.status);
      return result;
    });
    const attach = vi.spyOn(store, "attachSegmentVersion");
    const scheduler = new VideoSequenceScheduler({
      store, assets: {}, videoService: {},
      ffmpeg: { probe: async () => { probing.resolve(); return releaseProbe.promise; } },
      resolveProvider: () => ({ config: { provider: "ark", model: "model", apiKey: "key" }, providerName: "Ark" })
    } as never);
    try {
      await scheduler.recover();
      await probing.promise;
      await scheduler.cancel(task.id);
      cancelled = true;
      releaseProbe.resolve(media);
      expect(await afterCancellation.promise).toBe("remote_unknown");
      expect(attach).not.toHaveBeenCalled();
      expect((await store.getTask(task.id))?.status).toBe("remote_unknown");
    } finally { scheduler.dispose(); }
  });

  it("rechecks work enqueued while an older empty task snapshot is still resolving", async () => {
    const { store, task, now } = await fixture();
    await store.createTasks([task]);
    const selecting = deferred<void>();
    const releaseSnapshot = deferred<VideoSequenceTask | null>();
    const getTask = store.getTask.bind(store);
    vi.spyOn(store, "getTask").mockImplementation(async (id) => {
      if (id === "deleted-task") {
        selecting.resolve();
        return releaseSnapshot.promise;
      }
      return getTask(id);
    });
    const videoService = {
      submit: vi.fn(async () => ({ provider: "ark", id: "remote", model: "model", status: "queued", submittedAt: now, updatedAt: now })),
      waitForCompletion: vi.fn(async () => ({ provider: "ark", id: "remote", model: "model", status: "succeeded", submittedAt: now, updatedAt: now,
        outputs: [{ kind: "video", role: "result", url: "https://example.test/video.mp4" }] })),
      download: vi.fn(async () => ({ bytes: Buffer.from("video"), mimeType: "video/mp4" }))
    };
    const scheduler = new VideoSequenceScheduler({
      store, assets: { readManagedBytes: async () => Buffer.from("image"), saveVideoOutput: async () => path.join(directory, "output.mp4") },
      videoService, ffmpeg: { ensureReady: async () => ({}), probe: async () => media },
      resolveProvider: () => ({ config: { provider: "ark", model: "model", apiKey: "key" }, providerName: "Ark" })
    } as never);
    try {
      scheduler.enqueue(["deleted-task"]);
      await selecting.promise;
      scheduler.enqueue([task.id]);
      releaseSnapshot.resolve(null);
      await vi.waitFor(async () => expect((await getTask(task.id))?.status).toBe("completed"));
      expect(videoService.submit).toHaveBeenCalledOnce();
    } finally { scheduler.dispose(); }
  });

  it("exposes an explicit install IPC without downloading during status queries", async () => {
    const { registerMediaToolsIpc } = await import("../electron/media/media-tools-ipc.js");
    const manager = { getState: vi.fn().mockResolvedValue({ status: "missing" }), install: vi.fn().mockResolvedValue({ status: "ready" }), cancel: vi.fn() };
    const frame = { url: "file:///app/dist/index.html" };
    const event = { senderFrame: frame, sender: { mainFrame: frame } };
    const dispose = registerMediaToolsIpc(manager as never, { appFile: "/app/dist/index.html" });
    await handlers.get("mediaTools:getState")!(event);
    expect(manager.install).not.toHaveBeenCalled();
    await handlers.get("mediaTools:install")!(event);
    expect(manager.install).toHaveBeenCalledOnce();
    handlers.get("mediaTools:cancel")!(event);
    expect(manager.cancel).toHaveBeenCalledOnce();
    dispose();
    expect(handlers.has("mediaTools:install")).toBe(false);
  });

  it.each([
    { url: "https://example.test/", childFrame: false },
    { url: "file:///app/dist/index.html", childFrame: true },
    { url: "file:///app/dist/index.html.evil", childFrame: false },
    { url: "http://127.0.0.1:5180/untrusted", childFrame: false },
    { url: "http://127.0.0.1:5181/", childFrame: false }
  ])("rejects media tool access from untrusted frame $url (child=$childFrame)", async ({ url, childFrame }) => {
    const { registerMediaToolsIpc } = await import("../electron/media/media-tools-ipc.js");
    const manager = { getState: vi.fn(), install: vi.fn(), cancel: vi.fn() };
    const frame = { url };
    const event = { senderFrame: frame, sender: { mainFrame: childFrame ? { url: frame.url } : frame } };
    const dispose = registerMediaToolsIpc(manager, { appFile: "/app/dist/index.html", developmentUrl: "http://127.0.0.1:5180/" });
    try {
      for (const channel of ["mediaTools:getState", "mediaTools:install", "mediaTools:cancel"]) {
        expect(() => handlers.get(channel)!(event)).toThrow("不允许");
      }
      expect(manager.getState).not.toHaveBeenCalled();
      expect(manager.install).not.toHaveBeenCalled();
      expect(manager.cancel).not.toHaveBeenCalled();
    } finally { dispose(); }
  });

  it("accepts the configured development main frame and rejects it without development configuration", async () => {
    const { registerMediaToolsIpc } = await import("../electron/media/media-tools-ipc.js");
    const manager = { getState: vi.fn(), install: vi.fn().mockResolvedValue({ status: "ready" }), cancel: vi.fn() };
    const frame = { url: "http://127.0.0.1:5180/" };
    const event = { senderFrame: frame, sender: { mainFrame: frame } };
    const dispose = registerMediaToolsIpc(manager, { appFile: "/app/dist/index.html", developmentUrl: frame.url });
    await handlers.get("mediaTools:install")!(event);
    expect(manager.install).toHaveBeenCalledOnce();
    dispose();
    const disposeProduction = registerMediaToolsIpc(manager, { appFile: "/app/dist/index.html" });
    try {
      expect(() => handlers.get("mediaTools:install")!(event)).toThrow("不允许");
      expect(manager.install).toHaveBeenCalledOnce();
    } finally { disposeProduction(); }
  });
});
