import { describe, expect, it } from "vitest";
import type { AssetLibraryItem, GenerationJob, ImageSource } from "../shared/types";
import {
  buildBoardGalleryItems,
  countBoardGallerySources,
  filterBoardGalleryItems
} from "../src/lib/board-gallery";

function job(id: string, createdAt: string): GenerationJob {
  return {
    id,
    boardId: "board-a",
    status: "succeeded",
    createdAt,
    prompt: `prompt-${id}`,
    input: {
      workflowMode: "generate",
      prompt: `prompt-${id}`,
      model: "test",
      size: "auto",
      n: 2,
      quality: "high",
      style: "natural"
    },
    referenceImagePaths: [],
    outputImagePaths: [`${id}-1.png`, `${id}-2.png`]
  };
}

function asset(
  nodeId: string,
  imagePath: string,
  source: ImageSource,
  options: { boardId?: string; jobId?: string; createdAt?: string } = {}
): AssetLibraryItem {
  return {
    imagePath,
    dataUrl: imagePath,
    thumbnailUrl: imagePath,
    boardId: options.boardId ?? "board-a",
    boardName: "画板 A",
    nodeId,
    jobId: options.jobId ?? "job-a",
    prompt: "",
    createdAt: options.createdAt ?? "2026-07-20T10:00:00+08:00",
    source,
    favorite: false,
    tags: []
  };
}

describe("board gallery items", () => {
  it("keeps every current-board image as its own gallery item", () => {
    const history = [job("job-a", "2026-07-21T12:00:00+08:00")];
    const items = buildBoardGalleryItems("board-a", history, [
      asset("node-1", "job-a-1.png", "generated"),
      asset("node-2", "job-a-2.png", "generated"),
      asset("node-3", "upload.png", "upload", { jobId: "upload-job" }),
      asset("node-4", "slice.png", "slice", { jobId: "slice-job" }),
      asset("node-5", "other-board.png", "generated", { boardId: "board-b" })
    ]);

    expect(items.map((item) => item.imagePath)).toEqual([
      "job-a-1.png",
      "job-a-2.png",
      "upload.png",
      "slice.png"
    ]);
    expect(items[0]?.prompt).toBe("prompt-job-a");
    expect(new Set(items.map((item) => item.id)).size).toBe(4);
  });

  it("filters by source and reports counts", () => {
    const items = buildBoardGalleryItems("board-a", [], [
      asset("generated", "generated.png", "generated"),
      asset("upload-1", "upload-1.png", "upload"),
      asset("upload-2", "upload-2.png", "upload"),
      asset("slice", "slice.png", "slice")
    ]);

    expect(filterBoardGalleryItems(items, "upload").map((item) => item.imagePath)).toEqual([
      "upload-1.png",
      "upload-2.png"
    ]);
    expect(countBoardGallerySources(items)).toEqual({ all: 4, generated: 1, upload: 2, slice: 1 });
  });
});
