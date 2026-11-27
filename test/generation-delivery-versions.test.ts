import { describe, expect, it, vi } from "vitest";
import { generationHarness } from "./helpers/generation-fixture";

describe("delivery versions in the renderer", () => {
  it("keeps native and delivered edit versions while reporting only one generated output", async () => {
    const h = generationHarness(false);
    const pending = h.generate(undefined, { workflowMode: "edit", delivery: { format: "jpeg" } });
    await vi.waitFor(() => expect(h.readAssetDataUrl).toHaveBeenCalledOnce());
    h.asset.resolve("data:image/png;base64,AA==");
    await vi.waitFor(() => expect(h.generateImage).toHaveBeenCalledOnce());
    h.completion.resolve({ job: { id: "edit-job" }, images: [{ path: "delivery.jpg", dataUrl: "data:image/jpeg;base64,AA==", original: { path: "model-original.png", dataUrl: "data:image/png;base64,AA==", width: 512, height: 512 } }] });
    const result = await pending;
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("delivery.jpg");
    expect(h.appendBoardNodeVersions).toHaveBeenCalledWith("a", "edit", [expect.objectContaining({ imagePath: "model-original.png" }), expect.objectContaining({ imagePath: "delivery.jpg" })]);
    expect(h.resultToast).toHaveBeenCalledWith(expect.objectContaining({ count: 1, previews: ["data:image/jpeg;base64,AA=="] }));
    expect(h.generateImage).toHaveBeenCalledOnce();
  });
});
