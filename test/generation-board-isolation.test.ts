import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { generationHarness as harness } from "./helpers/generation-fixture";
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("generation board isolation", () => {
  it("rejects an explicit destination instead of silently replacing it with the current board", async () => {
    const h = harness();
    expect(await h.generate(undefined, { boardId: "b" })).toEqual([]);
    expect(h.paidGenerationMetadata).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
  });

  it.each(["different board", "switch away and back"])("does not submit after reference preparation on %s", async (scenario) => {
    const h = harness(false);
    const result = h.generate(undefined, { workflowMode: "edit" });
    await vi.waitFor(() => expect(h.readAssetDataUrl).toHaveBeenCalledOnce());
    h.boardOpenSequenceRef.current += 1;
    if (scenario === "different board") h.activeBoardRef.current = { id: "b", name: "B" };
    h.asset.resolve("data:image/png;base64,AA==");
    expect(await result).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
    expect(h.setImages).not.toHaveBeenCalled();
    expect(h.setInput).not.toHaveBeenCalled();
  });

  it("does not insert edit state into another board while reading the original image", async () => {
    const h = harness(false);
    const result = h.generate(undefined, { workflowMode: "edit" });
    expect(h.readAssetDataUrl).toHaveBeenCalledWith("original.png");
    h.activeBoardRef.current = { id: "b", name: "B" };
    h.asset.resolve("data:image/png;base64,AA==");
    expect(await result).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.generateImage).not.toHaveBeenCalled();
    expect(h.setImages).not.toHaveBeenCalled();
    expect(h.setInput).not.toHaveBeenCalled();
  });

  it("updates imperative board and image refs before publishing React state", () => {
    const open = app.slice(app.indexOf("  const openBoard ="), app.indexOf("  const notifyVideoJob ="));
    expect(open.indexOf("activeBoardRef.current = openedBoard;")).toBeGreaterThan(0);
    expect(open.indexOf("imagesRef.current = restored;")).toBeGreaterThan(0);
    expect(open.indexOf("activeBoardRef.current = openedBoard;")).toBeLessThan(open.indexOf("setActiveBoard(openedBoard)"));
    expect(open.indexOf("imagesRef.current = restored;")).toBeLessThan(open.indexOf("setImages(restored)"));
  });

  it("keeps an already submitted result on its original board after switching", async () => {
    const h = harness(false);
    const result = h.generate(undefined, { boardId: "a" });
    await vi.waitFor(() => expect(h.generateImage).toHaveBeenCalledOnce());
    expect(h.generateImage.mock.calls[0]?.[0]).toMatchObject({ boardId: "a" });
    h.activeBoardRef.current = { id: "b", name: "B" };
    h.setImages.mockClear();
    h.setInput.mockClear();
    h.completion.resolve({
      job: { id: "job-a" },
      images: [{ path: "generated-a.png", dataUrl: "data:image/png;base64,AA==" }]
    });
    expect(await result).toMatchObject([{ path: "generated-a.png", jobId: "job-a" }]);
    expect(h.appendBoardNodes).toHaveBeenCalledWith("a", [
      expect.objectContaining({ imagePath: "generated-a.png", jobId: "job-a" })
    ]);
    expect(h.setImages).not.toHaveBeenCalled();
    expect(h.setInput).not.toHaveBeenCalled();
  });

  it("passes the captured board from delayed generation entry points", () => {
    const chat = app.slice(app.indexOf("  async function createFromChat("), app.indexOf("  async function prepareCharacterGeneration("));
    const node = app.slice(app.indexOf("  async function runGenerationNode("), app.indexOf("  async function runVideoGenerationNode("));
    expect(chat).toContain("generate(undefined, {\n        boardId: target.id,");
    expect(node).toContain("generate(undefined, {\n        boardId: originBoardId,");
  });
});
