import { describe, expect, it, vi } from "vitest";
import { createIterlayAgentTools } from "../electron/pi-agent-tools.js";

describe("Iterlay Pi Agent tools", () => {
  it("exposes the complete Iterlay workspace tool catalog", () => {
    const tools = createIterlayAgentTools("/tmp/iterlay", {}, vi.fn());
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_active_board",
      "get_board",
      "arrange_images",
      "trash_images",
      "generate_image",
      "edit_image",
      "generate_video",
      "get_video_generation_status",
      "export_assets"
    ]));
    expect(tools.map((tool) => tool.name)).toContain("list_providers");
  });

  it("routes tool calls through the local workspace service", async () => {
    const callBridge = vi.fn(async () => ({ boardId: "board-1", nodeCount: 2 }));
    const tool = createIterlayAgentTools("/tmp/iterlay", { boardId: "board-1" }, callBridge)
      .find((candidate) => candidate.name === "get_board");
    expect(tool).toBeDefined();

    const result = await tool!.execute("call-1", { boardId: "board-1" });

    expect(callBridge).toHaveBeenCalledWith("/tmp/iterlay", "get_board", { boardId: "board-1" });
    expect(result.content).toEqual([{
      type: "text",
      text: JSON.stringify({ boardId: "board-1", nodeCount: 2 })
    }]);
  });

  it("blocks board mutations outside the active board", async () => {
    const callBridge = vi.fn();
    const tool = createIterlayAgentTools("/tmp/iterlay", { boardId: "board-1" }, callBridge)
      .find((candidate) => candidate.name === "trash_images");

    await expect(tool!.execute("call-2", {
      boardId: "board-2",
      nodeIds: ["node-1"]
    })).rejects.toThrow("只能操作当前画板 board-1");
    expect(callBridge).not.toHaveBeenCalled();
  });
});
