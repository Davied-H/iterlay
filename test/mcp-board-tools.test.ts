import { describe, expect, it, vi } from "vitest";
import { buildRendererCall } from "../electron/mcp-bridge.js";
import { listMcpTools } from "../electron/mcp-stdio-core.js";

type WorkbenchMock = Record<string, ReturnType<typeof vi.fn>>;

function rendererHarness(imageWorkbench: WorkbenchMock) {
  const dispatchEvent = vi.fn((event: { init?: { detail?: Record<string, unknown> } }) => {
    const detail = event.init?.detail;
    if (detail?.type === "board-mutation-requested" && typeof detail.resolve === "function") detail.resolve();
    return true;
  });
  const window = { imageWorkbench, dispatchEvent, setTimeout, clearTimeout };
  class CustomEventMock {
    constructor(public type: string, public init: unknown) {}
  }
  return {
    dispatchEvent,
    run(method: string, args: Record<string, unknown>) {
      const execute = new Function("window", "CustomEvent", `return ${buildRendererCall(method, args)}`);
      return execute(window, CustomEventMock);
    }
  };
}

describe("MCP board tools", () => {
  it("publishes the complete image arrangement toolset", () => {
    const tools = new Map(listMcpTools().map((tool) => [tool.name, tool]));

    expect(tools.get("generate_image")?.inputSchema).toMatchObject({
      properties: { background: { enum: ["auto", "opaque", "transparent"] } }
    });

    expect(tools.get("open_board")?.inputSchema).toMatchObject({ required: ["boardId"] });
    expect(tools.get("focus_nodes")?.inputSchema).toMatchObject({ required: ["boardId", "nodeIds"] });
    expect(tools.get("move_image")?.inputSchema).toMatchObject({ required: ["boardId", "nodeId", "x", "y"] });
    expect(tools.get("resize_image")?.inputSchema).toMatchObject({
      required: ["boardId", "nodeId", "displayWidth"],
      properties: { displayWidth: { type: "number", minimum: 120, maximum: 600 } }
    });
    expect(tools.get("arrange_images")?.inputSchema).toMatchObject({
      required: ["boardId", "nodeIds", "mode"],
      properties: { mode: { enum: ["horizontal", "vertical", "grid"] } }
    });
    expect(tools.get("duplicate_images")?.inputSchema).toMatchObject({ required: ["boardId", "nodeIds"] });
    expect(tools.get("trash_images")?.inputSchema).toMatchObject({ required: ["boardId", "nodeIds"] });
    expect(tools.get("restore_image")?.inputSchema).toMatchObject({ required: ["trashId"] });
    expect(tools.get("set_image_version")?.inputSchema).toMatchObject({
      required: ["boardId", "nodeId", "versionIndex"],
      properties: { versionIndex: { type: "integer", minimum: 0 } }
    });
  });

  it("flushes the board before moving an image and publishes the update", async () => {
    const moveBoardImage = vi.fn().mockResolvedValue({
      boardId: "board-1",
      nodeId: "image-1",
      previous: { x: 10, y: 20 },
      position: { x: 320, y: -40 }
    });
    const harness = rendererHarness({ moveBoardImage });

    const result = await harness.run("move_image", { boardId: "board-1", nodeId: "image-1", x: 320, y: -40 });

    expect(moveBoardImage).toHaveBeenCalledWith("board-1", "image-1", 320, -40);
    expect(result).toMatchObject({ previous: { x: 10, y: 20 }, position: { x: 320, y: -40 } });
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.init?.detail?.type)).toEqual([
      "board-mutation-requested",
      "board-updated"
    ]);
  });

  it("maps resize, arrange, duplicate, trash, and version tools to board APIs", async () => {
    const imageWorkbench = {
      resizeBoardImage: vi.fn().mockResolvedValue({ displayWidth: 360 }),
      arrangeBoardImages: vi.fn().mockResolvedValue({ positions: [] }),
      duplicateBoardImages: vi.fn().mockResolvedValue({ copies: [] }),
      trashBoardImages: vi.fn().mockResolvedValue({ count: 2, items: [] }),
      setBoardImageVersion: vi.fn().mockResolvedValue({ versionIndex: 0 })
    };
    const harness = rendererHarness(imageWorkbench);

    await harness.run("resize_image", { boardId: "board", nodeId: "a", displayWidth: 360 });
    await harness.run("arrange_images", { boardId: "board", nodeIds: ["a", "b"], mode: "grid", gap: 32 });
    await harness.run("duplicate_images", { boardId: "board", nodeIds: ["a", "b"], offset: 18 });
    await harness.run("trash_images", { boardId: "board", nodeIds: ["a", "b"] });
    await harness.run("set_image_version", { boardId: "board", nodeId: "a", versionIndex: 0 });

    expect(imageWorkbench.resizeBoardImage).toHaveBeenCalledWith("board", "a", 360);
    expect(imageWorkbench.arrangeBoardImages).toHaveBeenCalledWith("board", ["a", "b"], "grid", 32);
    expect(imageWorkbench.duplicateBoardImages).toHaveBeenCalledWith("board", ["a", "b"], 18);
    expect(imageWorkbench.trashBoardImages).toHaveBeenCalledWith("board", ["a", "b"]);
    expect(imageWorkbench.setBoardImageVersion).toHaveBeenCalledWith("board", "a", 0);
  });

  it("resolves a trash record before restoring its image", async () => {
    const imageWorkbench = {
      listTrashedBoardImages: vi.fn().mockResolvedValue([{ id: "trash-1", boardId: "board-1" }]),
      restoreTrashedBoardImage: vi.fn().mockResolvedValue({ item: { id: "trash-1", boardId: "board-1" } })
    };
    const harness = rendererHarness(imageWorkbench);

    await harness.run("restore_image", { trashId: "trash-1" });

    expect(imageWorkbench.restoreTrashedBoardImage).toHaveBeenCalledWith("trash-1");
    expect(harness.dispatchEvent.mock.calls.at(-1)?.[0].init?.detail).toMatchObject({
      type: "board-updated",
      boardId: "board-1"
    });
  });

  it("opens a board and focuses only existing nodes", async () => {
    const getBoard = vi.fn().mockResolvedValue({ id: "board-1", nodes: [{ id: "a" }, { id: "b" }] });
    const harness = rendererHarness({ getBoard });

    await harness.run("open_board", { boardId: "board-1" });
    await harness.run("focus_nodes", { boardId: "board-1", nodeIds: ["a", "b"] });
    await expect(harness.run("focus_nodes", { boardId: "board-1", nodeIds: ["missing"] }))
      .rejects.toThrow("画板中不存在节点：missing");

    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.init?.detail?.type)).toContain("open-board");
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.init?.detail?.type)).toContain("focus-nodes");
  });
});
