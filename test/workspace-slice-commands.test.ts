import { describe, expect, it } from "vitest";
import { workspaceFixture } from "./helpers/workspace-fixture";
function fixture() {
  const f = workspaceFixture();
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.write("IHDR", 12); header.writeUInt32BE(1254, 16); header.writeUInt32BE(1255, 20);
  f.mocks.readAssetDataUrl.mockResolvedValue(`data:image/png;base64,${header.toString("base64")}`);
  f.mocks.sliceImage.mockImplementation(async (request) => (request as { crops: Array<{ width: number; height: number }> }).crops.map((crop, i) => ({ path: `/managed/slice-${i}.png`, ...crop })));
  return f;
}
describe("workspace image slicing", () => {
  it("uses the existing local slicer and preserves source lineage for all 12 results", async () => {
    const f = fixture();
    const result = await f.commands.call("slice_image", { boardId: "board", nodeId: "image", rows: 3, columns: 4 }) as { images: unknown[] };
    expect(result.images).toHaveLength(12);
    const request = f.mocks.sliceImage.mock.calls[0][0] as { crops: Array<{ x: number; y: number; width: number; height: number }> };
    const last = request.crops.at(-1)!;
    expect(last.x + last.width).toBe(1254); expect(last.y + last.height).toBe(1255);
    expect(f.mocks.appendBoardNodes).toHaveBeenCalledWith("board", expect.arrayContaining([expect.objectContaining({ source: "slice", derivation: { sourceNodeId: "image", sourceImagePath: "/managed/source.png", crop: request.crops[0] } })]));
    expect(f.mocks.generateImage).not.toHaveBeenCalled();
    expect(f.emit).toHaveBeenCalledWith({ type: "board-updated", boardId: "board" });
  });
  it("accepts explicit regions and rejects invalid regions before writing assets", async () => {
    const f = fixture();
    const crops = [{ x: 10, y: 20, width: 40, height: 50 }];
    await f.commands.call("slice_image", { boardId: "board", nodeId: "image", crops });
    expect(f.mocks.sliceImage).toHaveBeenCalledWith({ sourcePath: "/managed/source.png", crops });
    f.mocks.sliceImage.mockClear();
    for (const args of [{ crops: [{ x: 1250, y: 0, width: 10, height: 10 }] }, { rows: 9, columns: 4 }, { crops, rows: 1 }]) {
      await expect(f.commands.call("slice_image", { boardId: "board", nodeId: "image", ...args })).rejects.toThrow();
    }
    expect(f.mocks.sliceImage).not.toHaveBeenCalled();
  });
  it("does not slice if flush fails or a node/path is mismatched", async () => {
    const f = fixture();
    await expect(f.commands.call("slice_image", { boardId: "board", nodeId: "image", sourcePath: "/other.png", rows: 1, columns: 1 })).rejects.toThrow("不一致");
    f.flush.mockRejectedValue(new Error("save failed"));
    await expect(f.commands.call("slice_image", { boardId: "board", nodeId: "image", rows: 1, columns: 1 })).rejects.toThrow("save failed");
    expect(f.mocks.sliceImage).not.toHaveBeenCalled();
  });
});
