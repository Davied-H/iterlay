import { describe, expect, it } from "vitest";
import { mcpFixture } from "./helpers/mcp-fixture";
describe("typed MCP board commands", () => {
  it("flushes before mutation and emits the resulting update", async () => {
    const f = mcpFixture();
    f.flush.mockImplementation(async () => { expect(f.mocks.moveBoardImage).not.toHaveBeenCalled(); });
    await f.commands.call("move_image", { boardId: "board", nodeId: "image", x: 10, y: 20 });
    expect(f.flush).toHaveBeenCalledOnce();
    expect(f.mocks.moveBoardImage).toHaveBeenCalledWith("board", "image", 10, 20);
    expect(f.emit).toHaveBeenCalledWith({ type: "board-updated", boardId: "board", movedNodeId: "image", x: 10, y: 20 });
  });
  it("does not mutate when saving fails", async () => {
    const f = mcpFixture();
    f.flush.mockRejectedValue(new Error("disk full"));
    await expect(f.commands.call("move_image", { boardId: "board", nodeId: "image", x: 10, y: 20 })).rejects.toThrow("disk full");
    expect(f.mocks.moveBoardImage).not.toHaveBeenCalled();
  });
  it("validates nodes before focusing the UI", async () => {
    const f = mcpFixture();
    await expect(f.commands.call("focus_nodes", { boardId: "board", nodeIds: ["missing"] })).rejects.toThrow("不存在");
    expect(f.emit).not.toHaveBeenCalled();
    await f.commands.call("focus_nodes", { boardId: "board", nodeIds: ["image", "image"] });
    expect(f.emit).toHaveBeenCalledWith({ type: "focus-nodes", boardId: "board", nodeIds: ["image"] });
  });
  it("rejects invalid coordinates and unknown tools", async () => {
    const f = mcpFixture();
    await expect(f.commands.call("move_image", { boardId: "board", nodeId: "image", x: Infinity, y: 1 })).rejects.toThrow("有限数字");
    await expect(f.commands.call("__proto__", {})).rejects.toThrow("未知");
    expect(f.mocks.moveBoardImage).not.toHaveBeenCalled();
  });
  it("reads active board through application services without evaluating JavaScript", async () => {
    const f = mcpFixture();
    await f.commands.call("get_active_board", {});
    expect(f.mocks.getBoard).toHaveBeenCalledWith("board");
  });
});
