import { describe, expect, it, vi } from "vitest";
import { createVideoGenerationController } from "../src/features/generation/create-video-generation-controller";
import { createNode } from "../plugins/short-drama/src/model";
import type { CanvasPersistedNode } from "../src/features/boards/types";
import type { BoardVideoGenerationNode } from "../shared/types";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

function harness() {
  const node: BoardVideoGenerationNode = { id: "video", type: "video-generation", x: 100, y: 100, model: "video-model", prompt: "move", status: "draft" };
  const snapshot = { boardId: "a", revision: 1, nodes: [], connections: [], groups: [] };
  const character = { ...createNode("comic-character", snapshot), id: "character-a", activeVersionId: "character-version-a" };
  const segment = { ...createNode("comic-segment-script", snapshot), id: "segment-a", activeVersionId: "script-version-a" };
  const activeBoardRef = { current: { id: "a", name: "A" } };
  const workflowNodesRef = { current: [node, character, segment] as CanvasPersistedNode[] };
  const canvasStateRef = { current: { positions: {}, connections: [{ id: "ref", source: "character-a", target: "segment-a", kind: "reference" }] } };
  const job = { id: "job", status: "completed", input: { prompt: "move" } };
  const api = { startVideoGeneration: vi.fn(async () => job), getVideoJob: vi.fn(async () => job) };
  const confirm = vi.fn(async () => true), flush = vi.fn(async () => undefined), update = vi.fn(), save = vi.fn(), setNodes = vi.fn();
  const controller = createVideoGenerationController({ activeBoardRef, workflowNodesRef, canvasStateRef, getWorkbenchApi: () => api,
    videoProviders: [{ id: "provider", name: "Provider", model: "video-model", type: "openai-compatible" }], activeVideoProviderId: "provider",
    updateWorkflowNode: update, paidSubmissionInFlightRef: { current: new Set<string>() }, requestGenerationConfirmation: confirm,
    setWorkflowNodes: setNodes, setCanvasConnectionsVersion: vi.fn(), scheduleBoardSave: save, flushBoardSave: flush,
    videoPollingStoppedRef: { current: new Set<string>() }, refreshHistory: vi.fn(async () => undefined),
    boardDetailCacheRef: { current: { delete: vi.fn() } }, openBoard: vi.fn(async () => undefined), notifyVideoJob: vi.fn()
  } as unknown as Parameters<typeof createVideoGenerationController>[0]);
  const resolved = { prompt: "move", images: [], sourceNodeIds: ["segment-a"], referenceImages: [], referenceVideos: [], requiresFirstLastFrame: true,
    startFrame: { id: "first", jobId: "first-version", path: "first.png" }, endFrame: { id: "last", jobId: "last-version", path: "last.png" } } as unknown as Parameters<typeof controller.runVideoGenerationNode>[1];
  return { controller, node, resolved, activeBoardRef, workflowNodesRef, canvasStateRef, api, confirm, flush, update };
}

describe("video generation controller preserves trusted submission and board ownership", () => {
  it("does not submit if the user leaves the board during cost confirmation", async () => {
    const h = harness(); h.confirm.mockImplementationOnce(async () => { h.activeBoardRef.current = { id: "b", name: "B" }; return true; });
    await h.controller.runVideoGenerationNode(h.node, h.resolved);
    expect(h.api.startVideoGeneration).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });
  it("captures original comic versions before saving, never reads the next board's refs into a confirmed job", async () => {
    const h = harness(); h.flush.mockImplementationOnce(async () => { h.activeBoardRef.current = { id: "b", name: "B" }; h.workflowNodesRef.current = []; h.canvasStateRef.current.connections = []; h.update.mockClear(); });
    await h.controller.runVideoGenerationNode(h.node, h.resolved);
    expect(h.api.startVideoGeneration).toHaveBeenCalledWith(expect.objectContaining({ boardId: "a", comicDramaContextSnapshot: expect.objectContaining({ segmentNodeId: "segment-a", segmentScriptVersionId: "script-version-a", characterVersions: [{ nodeId: "character-a", versionId: "character-version-a" }] }) }));
    expect(h.update).not.toHaveBeenCalled();
  });
  it("does not submit when confirmation is cancelled", async () => {
    const h = harness(); h.confirm.mockResolvedValueOnce(false);
    await h.controller.runVideoGenerationNode(h.node, h.resolved);
    expect(h.api.startVideoGeneration).not.toHaveBeenCalled(); expect(h.flush).not.toHaveBeenCalled();
  });
});
