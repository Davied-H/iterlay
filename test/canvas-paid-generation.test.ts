import { describe, expect, it, vi } from "vitest";
import { generationHarness } from "./helpers/generation-fixture";
describe("community generation submission", () => {
  it("submits the captured board without requesting retired quotes or balances", async () => {
    const h = generationHarness();
    const request = h.generate(undefined, { boardId: "a" });
    await vi.waitFor(() => expect(h.generateImage).toHaveBeenCalledOnce());
    expect(h.generateImage.mock.calls[0][0]).toMatchObject({ boardId: "a" });
    expect(h.generateImage.mock.calls[0][0]).not.toHaveProperty("quoteId");
    expect(h.paidGenerationMetadata).not.toHaveBeenCalled();
    h.activeBoardRef.current = { id: "other", name: "Other" };
    h.completion.resolve({ job: { id: "job" }, images: [] });
    await request;
  });
});
