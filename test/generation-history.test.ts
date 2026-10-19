import { describe, expect, it, vi } from "vitest";
import { createGenerationInputSnapshot, remapGenerationHistorySnapshot, restoreGenerationHistoryJob, reuseGenerationHistoryPrompt } from "../shared/generation-history.js";
import type { GenerateImageInput, GenerationJob, StoredReferenceImage } from "../shared/types.js";

const imageDataUrl = "data:image/png;base64,aW1hZ2U=";
const input: GenerateImageInput = {
  workflowMode: "edit", creationMode: "ui-design", prompt: "只改背景", model: "old-model", size: "1536x1024", n: 2,
  quality: "high", style: "natural", background: "opaque", outputFormat: "png", providerId: "provider",
  boardId: "original-board", generationNodeId: "old-generation-node", quoteId: "spent-quote", idempotencyKey: "spent-key",
  editSource: { nodeId: "source-node", boardId: "original-board", imagePath: "/source-v1.png", jobId: "v1" },
  promptSpec: { primaryRequest: "只改背景", constraints: "保留产品" },
  referenceImages: [
    { id: "source", name: "原始产品", mimeType: "image/png", dataBase64: "aW1hZ2U=", role: "edit-target", sourceNodeId: "source-node" },
    { id: "style", name: "摄影风格", mimeType: "image/png", dataBase64: "aW1hZ2U=", role: "style-reference", semanticRole: "visual" }
  ]
};
const references: StoredReferenceImage[] = input.referenceImages.map((reference, index) => ({
  id: reference.id, name: reference.name, mimeType: reference.mimeType, role: reference.role,
  semanticRole: reference.semanticRole, sourceNodeId: reference.sourceNodeId,
  path: index === 0 ? "/managed-source.png" : "/managed-style.png"
}));
function makeJob(): GenerationJob {
  const { referenceImages: _references, ...parameters } = input;
  void _references;
  return { id: "job", status: "succeeded", createdAt: "2026-10-19", prompt: input.prompt, input: parameters,
    providerId: "provider", referenceImagePaths: references.map((reference) => reference.path), outputImagePaths: ["/output.png"],
    inputSnapshot: createGenerationInputSnapshot(input, references) };
}

describe("generation history restore", () => {
  it("restores an edit with named semantic references and the fixed source, without replaying a paid identity", async () => {
    const job = makeJob();
    const readAsset = vi.fn(async () => imageDataUrl);
    const result = await restoreGenerationHistoryJob(job, readAsset, [{ id: "provider", model: "new-default-model" }]);
    expect(result.input).toMatchObject({ workflowMode: "edit", creationMode: "ui-design", providerId: "provider", model: "old-model",
      n: 2, quality: "high", size: "1536x1024", historySourceJobId: "job",
      editSource: { nodeId: "source-node", jobId: "v1", imagePath: "/managed-source.png" } });
    expect(result.input.referenceImages.map(({ name, role, semanticRole }) => ({ name, role, semanticRole }))).toEqual([
      { name: "原始产品", role: "edit-target", semanticRole: undefined },
      { name: "摄影风格", role: "style-reference", semanticRole: "visual" }
    ]);
    expect(result.input).not.toHaveProperty("idempotencyKey");
    expect(result.input).not.toHaveProperty("quoteId");
    expect(result.input).not.toHaveProperty("generationNodeId");
    expect(result.input).not.toHaveProperty("boardId");
    expect(readAsset.mock.calls).toHaveLength(2);
    result.input.promptSpec!.constraints = "新约束";
    expect(job.inputSnapshot?.input.promptSpec?.constraints).toBe("保留产品");
  });

  it("does not produce a partial restored task when any reference is missing", async () => {
    const read = vi.fn(async (path: string) => {
      if (path.includes("style")) throw new Error("ENOENT");
      return imageDataUrl;
    });
    await expect(restoreGenerationHistoryJob(makeJob(), read, [{ id: "provider", model: "x" }])).rejects.toThrow("摄影风格");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("refuses to turn an old edit without its source into a generation", async () => {
    const job = makeJob();
    delete job.inputSnapshot;
    job.referenceImagePaths = [];
    await expect(restoreGenerationHistoryJob(job, async () => imageDataUrl, [{ id: "provider", model: "x" }])).rejects.toThrow("缺少明确的编辑源图");
  });

  it("keeps the original edit mode for old records and discloses inferred reference metadata", async () => {
    const job = makeJob();
    delete job.inputSnapshot;
    const restored = await restoreGenerationHistoryJob(job, async () => imageDataUrl, [{ id: "provider", model: "x" }]);
    expect(restored.input.workflowMode).toBe("edit");
    expect(restored.input.referenceImages[0].role).toBe("edit-target");
    expect(restored.warnings[0]).toContain("旧记录");
  });

  it("never silently substitutes the current provider for a deleted original provider", async () => {
    await expect(restoreGenerationHistoryJob(makeJob(), async () => imageDataUrl, [{ id: "other", model: "old-model" }])).rejects.toThrow("Provider 已删除");
  });

  it("copies only text when the user chooses prompt reuse", () => {
    const current = { ...input, workflowMode: "generate" as const, model: "current-model", prompt: "current", referenceImages: [] };
    const reused = reuseGenerationHistoryPrompt(current, makeJob());
    expect(reused).toMatchObject({ workflowMode: "generate", model: "current-model", referenceImages: [], prompt: "只改背景" });
    expect(reused.editSource).toEqual(current.editSource);
  });

  it("does not copy unknown runtime secrets into the snapshot", () => {
    const snapshot = createGenerationInputSnapshot({ ...input, apiKey: "secret" } as GenerateImageInput, references);
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(snapshot.input).not.toHaveProperty("quoteId");
  });

  it("remaps snapshot paths and source identities for portable board archives", () => {
    const remapped = remapGenerationHistorySnapshot(makeJob().inputSnapshot, (value) => `imported:${value}`, {
      boardId: "new-board", nodeIds: new Map([["source-node", "new-source"]]), jobIds: new Map([["v1", "new-v1"]])
    });
    expect(remapped?.input.editSource).toMatchObject({ nodeId: "new-source", boardId: "new-board", jobId: "new-v1", imagePath: "imported:/source-v1.png" });
    expect(remapped?.references[0]).toMatchObject({ sourceNodeId: "new-source", path: "imported:/managed-source.png" });
  });
});
