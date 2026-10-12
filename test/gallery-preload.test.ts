import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "../shared/types";
import { collectGalleryPreloadPaths, loadGalleryThumbnail } from "../src/lib/gallery-preload";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "imageWorkbench");
});

function job(id: string, createdAt: string, paths: string[], status: GenerationJob["status"] = "succeeded"): GenerationJob {
  return {
    id,
    boardId: "board-a",
    status,
    createdAt,
    prompt: id,
    input: {
      workflowMode: "generate",
      prompt: id,
      model: "test",
      size: "auto",
      n: paths.length,
      quality: "high",
      style: "natural"
    },
    referenceImagePaths: [],
    outputImagePaths: paths
  };
}

describe("gallery thumbnail preload selection", () => {
  it("prioritizes the newest day covers and all candidates from its newest job", () => {
    const paths = collectGalleryPreloadPaths([
      job("older", "2026-07-18T10:00:00+08:00", ["older-1"]),
      job("newer-second", "2026-07-19T11:00:00+08:00", ["second-1", "second-2"]),
      job("newest", "2026-07-19T12:00:00+08:00", ["newest-1", "newest-2", "newest-3"]),
      job("failed", "2026-07-19T13:00:00+08:00", ["failed-1"], "failed")
    ]);

    expect(paths).toEqual(["newest-1", "second-1", "newest-2", "newest-3"]);
  });

  it("retries a thumbnail after a failed request instead of caching the failure", async () => {
    const getAssetThumbnail = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce("data:image/png;base64,recovered");
    Object.defineProperty(globalThis, "imageWorkbench", {
      configurable: true,
      value: { getAssetThumbnail }
    });

    await expect(loadGalleryThumbnail("retry-thumbnail.png")).resolves.toBeUndefined();
    await expect(loadGalleryThumbnail("retry-thumbnail.png")).resolves.toBe(
      "data:image/png;base64,recovered"
    );
    expect(getAssetThumbnail).toHaveBeenCalledTimes(2);
  });
});
