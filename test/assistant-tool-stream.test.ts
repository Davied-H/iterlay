import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollaborateSceneStreamEvent } from "../shared/types";
import { startSceneCollaborationStream } from "../src/lib/scene-collaboration-stream";

const mock = vi.hoisted(() => ({
  listener: null as null | ((event: CollaborateSceneStreamEvent) => void),
  requestId: "", unsubscribe: vi.fn(), cancel: vi.fn()
}));
vi.mock("../src/lib/image-workbench-api", () => ({
  getImageWorkbenchApi: () => ({
    onSceneCollaborationEvent: (listener: (event: CollaborateSceneStreamEvent) => void) => { mock.listener = listener; return mock.unsubscribe; },
    startSceneCollaboration: (id: string) => { mock.requestId = id; },
    cancelSceneCollaboration: mock.cancel
  })
}));
beforeEach(() => vi.clearAllMocks());
describe("tool stream dispatch", () => {
  it("keeps reasoning summaries out of answer deltas and ignores foreign or disposed summaries", () => {
    const onReasoningSummary = vi.fn(), onDelta = vi.fn();
    const handle = startSceneCollaborationStream(
      { instruction: "hello", workflowMode: "generate", currentFields: [], referenceImages: [] },
      { onReasoningSummary, onDelta, onResult: vi.fn(), onError: vi.fn() }
    );
    mock.listener?.({ requestId: "other", type: "reasoning-summary", delta: "ignored" });
    mock.listener?.({ requestId: mock.requestId, type: "reasoning-summary", delta: "summary" });
    expect(onReasoningSummary).toHaveBeenCalledTimes(1);
    expect(onReasoningSummary).toHaveBeenCalledWith("summary");
    expect(onDelta).not.toHaveBeenCalled();
    expect(mock.unsubscribe).not.toHaveBeenCalled();
    handle.dispose();
    mock.listener?.({ requestId: mock.requestId, type: "reasoning-summary", delta: "late" });
    expect(onReasoningSummary).toHaveBeenCalledTimes(1);
  });
  it("does not terminate on a tool update, and ignores foreign/late events", () => {
    const onTool = vi.fn(), onDelta = vi.fn(), onResult = vi.fn();
    const handle = startSceneCollaborationStream({ instruction: "hello", workflowMode: "generate", currentFields: [], referenceImages: [] }, { onTool, onDelta, onResult, onError: vi.fn() });
    const tool = { id: "t", name: "inspect", status: "running" as const };
    mock.listener?.({ requestId: "foreign", type: "tool", tool });
    expect(onTool).not.toHaveBeenCalled();
    mock.listener?.({ requestId: mock.requestId, type: "tool", tool });
    mock.listener?.({ requestId: mock.requestId, type: "delta", delta: "text" });
    expect(onTool).toHaveBeenCalledOnce();
    expect(onDelta).toHaveBeenCalledWith("text");
    expect(mock.unsubscribe).not.toHaveBeenCalled();
    handle.dispose();
    mock.listener?.({ requestId: mock.requestId, type: "tool", tool });
    expect(onTool).toHaveBeenCalledOnce();
    expect(mock.cancel).toHaveBeenCalledOnce();
  });
});
