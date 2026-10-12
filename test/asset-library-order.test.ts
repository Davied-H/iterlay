import { describe, expect, it } from "vitest";
import type { AssetLibraryItem } from "../shared/types.js";
import {
  resolveAssetFileCreatedAt,
  sortAssetsNewestFirst
} from "../electron/asset-library-order.js";

function asset(imagePath: string, source: AssetLibraryItem["source"], createdAt: string): AssetLibraryItem {
  return {
    imagePath,
    dataUrl: imagePath,
    thumbnailUrl: imagePath,
    boardId: "board",
    boardName: "Board",
    nodeId: imagePath,
    jobId: "",
    prompt: "",
    createdAt,
    source,
    favorite: false,
    tags: []
  };
}

describe("asset library ordering", () => {
  it("sorts mixed asset sources only by creation time, newest first", () => {
    const items = [
      asset("slice.png", "slice", "2026-07-18T09:00:00.000Z"),
      asset("upload.png", "upload", "2026-07-18T11:00:00.000Z"),
      asset("generated.png", "generated", "2026-07-18T10:00:00.000Z")
    ];

    expect(sortAssetsNewestFirst(items).map((item) => item.imagePath)).toEqual([
      "upload.png",
      "generated.png",
      "slice.png"
    ]);
  });

  it("uses the file birth time instead of a board update fallback", () => {
    expect(resolveAssetFileCreatedAt(
      { birthtimeMs: Date.parse("2026-07-17T08:00:00.000Z"), mtimeMs: 0 },
      "2026-07-18T12:00:00.000Z"
    )).toBe("2026-07-17T08:00:00.000Z");
  });
});
