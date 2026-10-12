// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  centerNodeAtDrop,
  extractDroppedImageUrls,
  isDragLeavingDropZone
} from "../src/components/canvas/canvas-drop";

function dropData(values: Record<string, string>): { getData(type: string): string } {
  return { getData: (type) => values[type] ?? "" };
}

describe("canvas image drops", () => {
  it("prioritizes an HTML image URL and de-duplicates transfer fallbacks", () => {
    const result = extractDroppedImageUrls(
      dropData({
        "text/html": '<a href="https://example.com/page"><img src="https://cdn.example.com/photo.webp"></a>',
        "text/uri-list": "https://cdn.example.com/photo.webp\nhttps://cdn.example.com/second.png",
        "text/plain": "https://cdn.example.com/photo.webp"
      })
    );

    expect(result).toEqual([
      "https://cdn.example.com/photo.webp",
      "https://cdn.example.com/second.png"
    ]);
  });

  it("ignores non-http links and URI-list comments", () => {
    expect(
      extractDroppedImageUrls(
        dropData({
          "text/uri-list": "# Source\nfile:///tmp/private.png\ndata:image/png;base64,AAAA\nhttps://example.com/ok.png"
        })
      )
    ).toEqual(["https://example.com/ok.png"]);
  });

  it("centers a proportional node at the canvas drop point", () => {
    expect(centerNodeAtDrop({ x: 500, y: 300 }, 264, 1200, 600)).toEqual({ x: 368, y: 234 });
  });

  it("ends the drop session only after the pointer leaves the canvas tree", () => {
    const dropZone = document.createElement("div");
    const child = document.createElement("div");
    const outside = document.createElement("div");
    dropZone.append(child);

    expect(isDragLeavingDropZone(dropZone, child)).toBe(false);
    expect(isDragLeavingDropZone(dropZone, outside)).toBe(true);
    expect(isDragLeavingDropZone(dropZone, null)).toBe(true);
  });
});
