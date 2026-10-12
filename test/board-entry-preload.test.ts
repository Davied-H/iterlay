import { describe, expect, it } from "vitest";
import { isBoardImageNode, type BoardDetail } from "../shared/types";
import { selectBoardEntryPreload } from "../src/lib/board-entry-preload";

function boardDetail(): BoardDetail {
  return {
    id: "board-1",
    name: "Board",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    viewport: { x: 20, y: 10, zoom: 1 },
    nodes: [
      { id: "text", type: "text", text: "首屏文本", x: 0, y: 0 },
      {
        id: "visible",
        imagePath: "visible-current",
        jobId: "job-visible",
        source: "generated",
        x: 40,
        y: 40,
        versions: [{ imagePath: "visible-old", jobId: "job-old" }]
      },
      {
        id: "outside",
        imagePath: "outside-current",
        jobId: "job-outside",
        source: "generated",
        x: 3000,
        y: 3000
      }
    ],
    images: {
      "visible-current": "asset://visible-current",
      "visible-old": "asset://visible-old",
      "outside-current": "asset://outside-current"
    }
  };
}

describe("board entry preload selection", () => {
  it("selects visible current versions without blocking on version history", () => {
    const selected = selectBoardEntryPreload(boardDetail(), { width: 1200, height: 800 });
    expect(selected.nodes.map((node) => node.id)).toEqual(["visible"]);
    expect(selected.nodes[0] && isBoardImageNode(selected.nodes[0]) && selected.nodes[0].versions).toBeUndefined();
  });

  it("falls back to a bounded board-order prefix when no viewport is stored", () => {
    const detail = boardDetail();
    detail.viewport = undefined;
    expect(selectBoardEntryPreload(detail, { width: 1200, height: 800 }, 1).nodes.map((node) => node.id))
      .toEqual(["visible"]);
  });

  it("uses a saved display width when deciding whether a resized node is visible", () => {
    const detail = boardDetail();
    const imageIndex = detail.nodes.findIndex(isBoardImageNode);
    const imageNode = detail.nodes[imageIndex];
    if (!imageNode || !isBoardImageNode(imageNode)) throw new Error("fixture image node is missing");
    detail.nodes[imageIndex] = {
      ...imageNode,
      x: -600,
      displayWidth: 520,
      width: 200,
      height: 100
    };

    expect(selectBoardEntryPreload(detail, { width: 1200, height: 800 }).nodes.map((node) => node.id))
      .toContain("visible");
  });

  it("treats a legacy collapsed display width as the default size", () => {
    const detail = boardDetail();
    const imageIndex = detail.nodes.findIndex(isBoardImageNode);
    const imageNode = detail.nodes[imageIndex];
    if (!imageNode || !isBoardImageNode(imageNode)) throw new Error("fixture image node is missing");
    detail.nodes[imageIndex] = { ...imageNode, x: -400, displayWidth: 2 };

    expect(selectBoardEntryPreload(detail, { width: 1200, height: 800 }).nodes.map((node) => node.id))
      .toContain("visible");
  });

  it("limits visible preload to the nearest screen-center nodes", () => {
    const detail = boardDetail();
    detail.nodes = Array.from({ length: 16 }, (_, index) => ({
      id: "visible-" + index,
      imagePath: "visible-" + index + ".png",
      jobId: "job-" + index,
      source: "generated" as const,
      x: 468 + (15 - index) * 10,
      y: 268
    }));

    expect(selectBoardEntryPreload(detail, { width: 1200, height: 800 }).nodes.map((node) => node.id))
      .toEqual([
        "visible-15",
        "visible-14",
        "visible-13",
        "visible-12",
        "visible-11",
        "visible-10",
        "visible-9",
        "visible-8"
      ]);
  });
  it.each([100, 500, 1_000])("caps first-frame preload across %i visible nodes", (count) => {
    const detail = boardDetail();
    detail.nodes = Array.from({ length: count }, (_, index) => ({
      id: "visible-" + index,
      imagePath: "visible-" + index + ".png",
      jobId: "job-" + index,
      source: "generated" as const,
      x: 468,
      y: 268
    }));

    const selected = selectBoardEntryPreload(detail, { width: 1200, height: 800 });

    expect(selected.nodes).toHaveLength(8);
    expect(selected.nodes.map((node) => node.id)).toEqual(
      Array.from({ length: 8 }, (_, index) => "visible-" + index)
    );
  });
});
