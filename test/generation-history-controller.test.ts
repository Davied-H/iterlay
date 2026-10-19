import { describe, expect, it, vi } from "vitest";
import { generationHarness } from "./helpers/generation-fixture";

describe("restored edit submission", () => {
  it("submits the saved source and historical model, without rereading the active image or duplicating its reference", async () => {
    const h = generationHarness(false);
    const source = { id: "frozen", name: "源图v1", mimeType: "image/png", dataBase64: "RlJPWkVO", role: "edit-target" as const };
    const style = { id: "style", name: "风格", mimeType: "image/png", dataBase64: "U1RZTEU=", role: "style-reference" as const };
    const result = h.generate(undefined, {
      workflowMode: "edit", model: "historical-model", providerId: "provider", historySourceJobId: "original-job",
      editSource: { nodeId: "edit", boardId: "a", imagePath: "frozen.png", jobId: "v1" },
      referenceImages: [source, style]
    });
    await vi.waitFor(() => expect(h.generateImage).toHaveBeenCalledOnce());
    expect(h.readAssetDataUrl).not.toHaveBeenCalled();
    expect(h.generateImage.mock.calls[0][0]).toMatchObject({
      workflowMode: "edit", model: "historical-model", referenceImages: [source, style],
      editSource: { imagePath: "frozen.png", jobId: "v1" }
    });
    h.completion.resolve({ job: { id: "new-job" }, images: [] });
    await result;
  });

  it("restores an edit whose original node is absent without using the unrelated current edit session", async () => {
    const h = generationHarness(false);
    const source = { id: "frozen", name: "源图v1", mimeType: "image/png", dataBase64: "RlJPWkVO", role: "edit-target" as const };
    const result = h.generate(undefined, {
      workflowMode: "edit", editSource: { nodeId: "deleted", imagePath: "frozen.png" }, referenceImages: [source]
    });
    await vi.waitFor(() => expect(h.generateImage).toHaveBeenCalledOnce());
    expect(h.readAssetDataUrl).not.toHaveBeenCalled();
    expect(h.generateImage.mock.calls[0][0].workflowMode).toBe("edit");
    expect(h.generateImage.mock.calls[0][0].referenceImages).toEqual([source]);
    h.completion.resolve({ job: { id: "new-job" }, images: [{ path: "restored.png", dataUrl: "data:image/png;base64,AA==" }] });
    expect(await result).toMatchObject([{ path: "restored.png" }]);
  });
});
