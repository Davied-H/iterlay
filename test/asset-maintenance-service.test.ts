import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssetMaintenance } from "../electron/application/asset-maintenance";
import type { AppSettings, BoardData } from "../shared/types";

afterEach(() => vi.useRealTimers());

function fixture() {
  const board = {
    nodes: [
      { imagePath: "current.png", finalVersion: { imagePath: "final.png" }, derivation: { sourceImagePath: "source.png" }, versions: [{ imagePath: "old.png" }] },
      { type: "video", videoPath: "video.mp4", posterPath: "poster.png", versions: [{ videoPath: "old.mp4", posterPath: "old-poster.png" }] },
      { type: "video-generation", sourceVideoPath: "input.mp4", referenceVideoPaths: ["reference.mp4"], referenceAudioPaths: ["audio.wav"] }
    ],
    deliveryRecipes: [{ items: [{ sourceVersion: { imagePath: "delivery.png" } }] }]
  } as unknown as BoardData;
  const dependencies: Parameters<typeof createAssetMaintenance>[0] = {
    assets: { collectGarbage: vi.fn(async () => []), pruneThumbnailCache: vi.fn(async () => 0) },
    boards: { listAllBoards: vi.fn(async () => [board]), purgeExpiredTrashedBoards: vi.fn(async () => []) },
    history: { listJobs: vi.fn(async () => []), removeJobsByBoard: vi.fn(async () => undefined) },
    videoTasks: { listJobs: vi.fn(async () => []), removeJobsByBoard: vi.fn(async () => undefined) },
    sceneMedia: { list: vi.fn(async () => []) }, comments: { list: vi.fn(async () => []) },
    assetMeta: { list: vi.fn(async () => [{ imagePath: "favorite.png", favorite: true, tags: [] }, { imagePath: "untagged.png", favorite: false, tags: [] }]) },
    boardImageTrash: { referencedAssetPaths: vi.fn(async () => new Set([path.resolve("trash.png")])), purgeExpired: vi.fn(async () => []) },
    assistantConversations: { list: vi.fn(async () => [{ attachments: [{ path: "assistant.png" }] }] as never[]) },
    memories: { removeScope: vi.fn(async () => undefined) },
    settings: { getSettings: () => ({ boardTrashRetentionDays: 3 } as AppSettings) },
    modifications: { list: vi.fn(async () => [{ sourcePath: "modification.png", annotationPath: "annotation.png", maskPath: "mask.png", referencePaths: ["mod-reference.png"], resultPaths: ["mod-result.png"] }] as never[]) },
    onAssetsChanged: vi.fn()
  };
  return { dependencies, service: createAssetMaintenance(dependencies) };
}

describe("asset maintenance retention and lifecycle", () => {
  it("protects current, historical, final, derived, video, delivery, assistant, modification and trash references", async () => {
    vi.useFakeTimers();
    const { service, dependencies } = fixture();
    try {
      const referenced = await service.referencedAssetPaths();
      for (const file of ["current.png", "final.png", "source.png", "old.png", "video.mp4", "poster.png", "old.mp4", "old-poster.png", "input.mp4", "reference.mp4", "audio.wav", "delivery.png", "favorite.png", "trash.png", "assistant.png", "modification.png", "annotation.png", "mask.png", "mod-reference.png", "mod-result.png"]) {
        expect(referenced.has(path.resolve(file)), file).toBe(true);
      }
      expect(referenced.has(path.resolve("untagged.png"))).toBe(false);
      await service.collectAssetGarbage();
      expect(dependencies.assets.collectGarbage).toHaveBeenCalledWith(referenced);
      expect(dependencies.assets.pruneThumbnailCache).toHaveBeenCalledOnce();
    } finally { service.dispose(); }
  });

  it("cleans board associations and cancels scheduled garbage work on disposal", async () => {
    vi.useFakeTimers();
    const { service, dependencies } = fixture();
    await service.removeBoardAssociations(["removed-board"]);
    expect(dependencies.history.removeJobsByBoard).toHaveBeenCalledWith("removed-board");
    expect(dependencies.videoTasks.removeJobsByBoard).toHaveBeenCalledWith("removed-board");
    expect(dependencies.memories.removeScope).toHaveBeenCalledWith("board", "removed-board");
    expect(dependencies.onAssetsChanged).toHaveBeenCalledOnce();
    service.dispose();
    service.scheduleAssetGarbageCollection();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(dependencies.assets.collectGarbage).not.toHaveBeenCalled();
  });
});
