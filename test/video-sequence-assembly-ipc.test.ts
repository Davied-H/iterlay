import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoSequenceStore } from "../electron/storage/video-sequence-store.js";
import type { VideoSequence } from "../shared/types.js";

type IpcHandler = (...args: unknown[]) => unknown;
const electronMocks = vi.hoisted(() => ({ handlers: new Map<string, IpcHandler>(), showSaveDialog: vi.fn() }));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showSaveDialog: electronMocks.showSaveDialog },
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => electronMocks.handlers.set(channel, handler),
    removeHandler: (channel: string) => electronMocks.handlers.delete(channel)
  }
}));

describe("video assembly IPC", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-video-assembly-")); electronMocks.handlers.clear(); electronMocks.showSaveDialog.mockReset(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("freezes completed videos in selection order, creates an entry, and starts no Provider task", async () => {
    const { registerVideoSequenceIpc } = await import("../electron/video/video-sequence-ipc.js");
    const store = new VideoSequenceStore(dir);
    const saveBoard = vi.fn().mockResolvedValue({});
    const scheduler = { enqueue: vi.fn() };
    const board = {
      id: "board", name: "board", createdAt: "now", updatedAt: "now", connections: [],
      nodes: ["b", "a"].map((id, index) => ({
        id: `video-${id}`, type: "video", x: index * 300, y: 0,
        videoPath: `/managed/${id}.mp4`, posterPath: `/managed/${id}.jpg`, jobId: `job-${id}`,
        source: "generated", width: 1280, height: 720, durationMs: 2_000 + index * 1_000, mimeType: "video/mp4", status: "completed"
      }))
    };
    const registration = registerVideoSequenceIpc({
      store,
      templates: { list: vi.fn().mockResolvedValue([]) },
      scheduler,
      ffmpeg: {},
      boards: { getBoard: vi.fn().mockResolvedValue(board), saveBoard },
      assets: {
        readManagedBytes: vi.fn(async (value: string) => Buffer.from(value)),
        toAssetUrl: (value: string) => `asset:${value}`,
        exportAsset: vi.fn()
      },
      settings: { getSettings: () => ({ videoProviders: [] }) }
    } as never);

    const create = electronMocks.handlers.get("videoSequence:createFromVideos")!;
    const sequence = await create({}, { boardId: "board", videoNodeIds: ["video-a", "video-b"] }) as VideoSequence;

    expect(sequence.kind).toBe("video-assembly");
    expect(sequence.segments.map((segment) => segment.sourceVideo?.nodeId)).toEqual(["video-a", "video-b"]);
    expect(sequence.segments.every((segment) => segment.activeVersionId)).toBe(true);
    expect(scheduler.enqueue).not.toHaveBeenCalled();
    expect(await store.listTasks(sequence.id)).toEqual([]);
    expect(saveBoard).toHaveBeenCalledWith(expect.objectContaining({
      nodes: expect.arrayContaining([expect.objectContaining({ type: "video-sequence-entry", sequenceId: sequence.id })])
    }));
    registration.dispose();
  });

  it("rejects unfinished media before writing a sequence or entry", async () => {
    const { registerVideoSequenceIpc } = await import("../electron/video/video-sequence-ipc.js");
    const store = new VideoSequenceStore(dir);
    const saveBoard = vi.fn();
    const registration = registerVideoSequenceIpc({
      store, templates: { list: vi.fn().mockResolvedValue([]) }, scheduler: {}, ffmpeg: {},
      boards: { getBoard: vi.fn().mockResolvedValue({ id: "board", nodes: [{ id: "video-a", type: "video", videoPath: "", jobId: "job", source: "generated", status: "generating", x: 0, y: 0 }] }), saveBoard },
      assets: { readManagedBytes: vi.fn(), toAssetUrl: vi.fn(), exportAsset: vi.fn() }, settings: { getSettings: () => ({ videoProviders: [] }) }
    } as never);
    await expect(electronMocks.handlers.get("videoSequence:createFromVideos")!({}, { boardId: "board", videoNodeIds: ["video-a", "video-b"] })).rejects.toThrow();
    expect(await store.listSequences("board")).toEqual([]);
    expect(saveBoard).not.toHaveBeenCalled();
    registration.dispose();
  });
  it("uses the current fileName on an export cache hit and for the save default", async () => {
    const { registerVideoSequenceIpc } = await import("../electron/video/video-sequence-ipc.js");
    const store = new VideoSequenceStore(dir);
    const outputPath = path.join(dir, "cached.mp4");
    await writeFile(outputPath, "video");
    const exportSequence = vi.fn().mockResolvedValue({
      path: outputPath,
      media: { mimeType: "video/mp4", width: 1280, height: 720, durationMs: 4_000, fps: 30 }
    });
    const board = {
      id: "board", name: "board", createdAt: "now", updatedAt: "now", connections: [],
      nodes: ["a", "b"].map((id) => ({
        id: `video-${id}`, type: "video", x: 0, y: 0, videoPath: `/managed/${id}.mp4`,
        jobId: `job-${id}`, source: "generated", width: 1280, height: 720,
        durationMs: 2_000, mimeType: "video/mp4", status: "completed"
      }))
    };
    const registration = registerVideoSequenceIpc({
      store, templates: { list: vi.fn().mockResolvedValue([]) }, scheduler: { enqueue: vi.fn() },
      ffmpeg: { ensureReady: vi.fn().mockResolvedValue({}), exportSequence }, boards: { getBoard: vi.fn().mockResolvedValue(board), saveBoard: vi.fn() },
      assets: { readManagedBytes: vi.fn(async (value: string) => Buffer.from(value)), toAssetUrl: (value: string) => `asset:${value}`, exportAsset: vi.fn() },
      settings: { getSettings: () => ({ videoProviders: [] }) }, paidMediaQuotes: {}
    } as never);
    const sequence = await electronMocks.handlers.get("videoSequence:createFromVideos")!({}, { boardId: "board", videoNodeIds: ["video-a", "video-b"] }) as VideoSequence;
    const startExport = electronMocks.handlers.get("videoSequence:export")!;
    const first = await startExport({}, { boardId: "board", sequenceId: sequence.id, expectedRevision: sequence.revision, fileName: "旧名称" }) as { id: string };
    const getExport = electronMocks.handlers.get("videoSequence:getExport")!;
    await vi.waitFor(async () => expect(await getExport({}, { exportJobId: first.id })).toMatchObject({ status: "completed" }));
    const afterFirst = await store.getSequence("board", sequence.id);
    const cached = await startExport({}, { boardId: "board", sequenceId: sequence.id, expectedRevision: afterFirst!.revision, fileName: "本次名称" }) as { exportVersionId: string; fileName: string };
    expect(cached.fileName).toBe("本次名称");
    expect(exportSequence).toHaveBeenCalledOnce();
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true });
    await electronMocks.handlers.get("videoSequence:saveExport")!({}, { boardId: "board", sequenceId: sequence.id, exportVersionId: cached.exportVersionId });
    expect(electronMocks.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "本次名称.mp4" }));
    registration.dispose();
  });

});
