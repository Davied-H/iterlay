// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLegacyCharacterGeneration } from "../src/features/plugins/legacy-character-generation";
import { createNode } from "../plugins/short-drama/src/model";
import type { ComicCharacterNode, ProviderConfig } from "../shared/types";
import type { ActiveBoard, CanvasPersistedNode } from "../src/features/boards/types";
const request = vi.hoisted(() => vi.fn(async (_pluginId: string, _capability: string, _input: unknown, _options: { signal: AbortSignal }) => { void _pluginId; void _capability; void _input; void _options; return { prompt: "plugin art direction", size: "1024x1792", creationMode: "general", useCase: "illustration-story" }; }));
vi.mock("../src/features/plugins/request-plugin-capability", () => ({ requestPluginCapability: request }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
let root: Root, container: HTMLDivElement;
let controller: ReturnType<typeof useLegacyCharacterGeneration>;
let character: ComicCharacterNode;
let boardRef: { current: ActiveBoard | null };
let nodesRef: { current: CanvasPersistedNode[] };
let generate: ReturnType<typeof vi.fn>, confirm: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>;
const inFlight = { current: new Set<string>() };
function Harness() {
  controller = useLegacyCharacterGeneration({ boardId: boardRef.current?.id, activeBoardRef: boardRef, workflowNodesRef: nodesRef,
    activeProvider: { id: "provider", name: "Provider", model: "image" } as ProviderConfig,
    canvasStateRef: { current: { positions: {}, connections: [] } }, paidSubmissionInFlightRef: inFlight,
    generate: generate as never, requestGenerationConfirmation: confirm as never, updateWorkflowNode: update });
  return null;
}
beforeEach(async () => {
  vi.clearAllMocks(); inFlight.current.clear();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  character = createNode("comic-character", { boardId: "board", revision: 0, nodes: [], connections: [], groups: [] }) as ComicCharacterNode;
  boardRef = { current: { id: "board", name: "Board" } }; nodesRef = { current: [character] };
  generate = vi.fn(async () => [{ id: "output" }]); confirm = vi.fn(async () => true); update = vi.fn();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe("legacy canvas character generation delegates plugin policy", () => {
  it("preserves paid confirmation and success state while using plugin-supplied parameters", async () => {
    await act(async () => controller.retryComicCharacterGeneration(character));
    expect(confirm).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(undefined, expect.objectContaining({ prompt: "plugin art direction", size: "1024x1792", boardId: "board", providerId: "provider" }), expect.objectContaining({ preservePrompt: true, placementAnchorId: character.id }));
    expect(update).toHaveBeenNthCalledWith(1, character.id, { status: "generating", generationError: undefined });
    expect(update).toHaveBeenLastCalledWith(character.id, { status: "review", generationError: undefined });
    expect(request.mock.calls[0][3].signal.aborted).toBe(false);
    expect(inFlight.current.size).toBe(0);
  });
  it("does not submit when paid confirmation is cancelled", async () => {
    confirm.mockResolvedValueOnce(false);
    await act(async () => controller.retryComicCharacterGeneration(character));
    expect(generate).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(inFlight.current.size).toBe(0);
  });
  it("does not generate or mark a different character version when the user changes it during confirmation", async () => {
    confirm.mockImplementationOnce(async () => { nodesRef.current = [{ ...character, activeVersionId: "new-version" }]; return true; });
    await act(async () => controller.retryComicCharacterGeneration(character));
    expect(generate).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it("aborts the capability owner when leaving the board", async () => {
    await act(async () => controller.retryComicCharacterGeneration(character));
    const signal = request.mock.calls[0][3].signal;
    boardRef.current = { id: "next-board", name: "Next" };
    await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
    expect(signal.aborted).toBe(true);
  });
});
