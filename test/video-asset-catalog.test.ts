import { describe, expect, it, vi } from "vitest";
import type { AssetLibraryItem, BoardVideoNode, VideoGenerationJob } from "../shared/types.js";

const electronMocks = vi.hoisted(() => ({ handlers: new Map<string, unknown>() }));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp"), getVersion: vi.fn(() => "0.2.0") },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn(() => []) },
  clipboard: {},
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: { handle: (channel: string, handler: unknown) => electronMocks.handlers.set(channel, handler) },
  nativeImage: { createFromBuffer: vi.fn(), createFromPath: vi.fn() },
  nativeTheme: { shouldUseDarkColors: false },
  net: { fetch: vi.fn() },
  Notification: class {},
  safeStorage: { isEncryptionAvailable: vi.fn(() => false), encryptString: vi.fn(), decryptString: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() }
}));

describe("video asset catalog", () => {
  it("maps a board video node to the backward-compatible asset shape", async () => {
    const { createVideoAssetLibraryItem } = await import("../electron/ipc.js");
    const node: BoardVideoNode = {
      id: "video-node",
      type: "video",
      videoPath: "/managed/result.mp4",
      posterPath: "/managed/poster.jpg",
      jobId: "video-job",
      source: "generated",
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      durationMs: 5_000
    };
    const job: VideoGenerationJob = {
      id: "video-job",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      model: "seedance",
      input: {
        prompt: "海面日出",
        model: "seedance",
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 5,
        referenceImagePaths: []
      }
    };

    const item = createVideoAssetLibraryItem(
      node,
      { id: "board-1", name: "视频画板", updatedAt: "2026-08-11T00:01:00.000Z" },
      job,
      { favorite: true, tags: ["成片"] },
      (value) => `asset:${value}`
    );

    expect(item).toMatchObject({
      mediaType: "video",
      imagePath: node.videoPath,
      dataUrl: "asset:/managed/result.mp4",
      thumbnailUrl: "asset:/managed/poster.jpg",
      posterUrl: "asset:/managed/poster.jpg",
      prompt: "海面日出",
      size: "1280x720",
      durationMs: 5_000,
      source: "generated",
      favorite: true,
      tags: ["成片"]
    });
  });

  it("does not invoke image thumbnail or ThumbHash work for videos", async () => {
    const { decorateAssetLibraryItem } = await import("../electron/ipc.js");
    const item = {
      mediaType: "video",
      imagePath: "/managed/result.mp4",
      dataUrl: "asset:video",
      thumbnailUrl: "asset:poster",
      boardId: "board-1",
      boardName: "Board",
      nodeId: "video-node",
      jobId: "video-job",
      prompt: "",
      createdAt: "2026-08-11T00:00:00.000Z",
      source: "generated",
      favorite: false,
      tags: []
    } satisfies AssetLibraryItem;
    const thumbnail = vi.fn();
    const thumbHash = vi.fn();

    await expect(decorateAssetLibraryItem(item, thumbnail, thumbHash)).resolves.toEqual({ item });
    expect(thumbnail).not.toHaveBeenCalled();
    expect(thumbHash).not.toHaveBeenCalled();
  });

  it("preserves thumbnail and ThumbHash decoration for image assets", async () => {
    const { decorateAssetLibraryItem } = await import("../electron/ipc.js");
    const item = {
      imagePath: "/managed/image.png",
      dataUrl: "asset:image",
      thumbnailUrl: "asset:image",
      boardId: "board-1",
      boardName: "Board",
      nodeId: "image-node",
      jobId: "image-job",
      prompt: "",
      createdAt: "2026-08-11T00:00:00.000Z",
      source: "generated",
      favorite: false,
      tags: []
    } satisfies AssetLibraryItem;
    const thumbnail = vi.fn(async () => "asset:thumbnail");
    const thumbHash = vi.fn(async () => ({
      imagePath: item.imagePath,
      hash: "thumb-hash",
      width: 640,
      height: 480,
      hasAlpha: false,
      updatedAt: "2026-08-11T00:00:00.000Z"
    }));

    await expect(decorateAssetLibraryItem(item, thumbnail, thumbHash)).resolves.toMatchObject({
      item: { thumbnailUrl: "asset:thumbnail", thumbHash: "thumb-hash", width: 640, height: 480 }
    });
    expect(thumbnail).toHaveBeenCalledWith(item.imagePath);
    expect(thumbHash).toHaveBeenCalledWith(item.imagePath);
  });
});
