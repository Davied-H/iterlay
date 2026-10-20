// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoSequenceController } from "../src/features/video-sequence/use-video-sequence-controller";
import type { VideoSequence } from "../shared/types";
import type { ActiveBoard } from "../src/features/boards/types";

const api = vi.hoisted(() => ({ getVideoSequence: vi.fn(), mutateVideoSequence: vi.fn(), createVideoSequence: vi.fn(), listVideoSequenceTemplates: vi.fn(async () => []), instantiateVideoSequenceTemplate: vi.fn(), onVideoSequenceEvent: vi.fn(() => () => undefined) }));
vi.mock("../src/lib/image-workbench-api", () => ({ getImageWorkbenchApi: () => api, hasImageWorkbenchApi: () => true, getWorkbenchErrorMessage: (error: Error) => error.message }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const sequence = (id: string) => ({ id, boardId: "board-a", revision: 1, keyframes: [], segments: [], defaults: {}, mediaUrls: {} }) as unknown as VideoSequence & { mediaUrls: Record<string, string> };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let root: Root;
let container: HTMLDivElement;
let controller: ReturnType<typeof useVideoSequenceController>;
const openBoard = vi.fn(async () => undefined);
let boardRef: { current: ActiveBoard | null };
function Harness() {
  controller = useVideoSequenceController({ activeBoard: boardRef.current, activeBoardRef: boardRef, activeVideoProviderId: "provider", videoProviders: [], openBoard, ensureMediaToolsReady: async () => true, requestGenerationConfirmation: async () => true });
  return null;
}
beforeEach(async () => {
  vi.clearAllMocks();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  boardRef = { current: { id: "board-a", name: "A" } };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("video sequence async document ownership", () => {
  it("does not reopen a sequence closed while refreshing", async () => {
    await act(async () => controller.setActiveVideoSequence(sequence("one")));
    const response = deferred<ReturnType<typeof sequence>>(); api.getVideoSequence.mockReturnValueOnce(response.promise);
    let pending!: Promise<void>; await act(async () => { pending = controller.refreshActiveVideoSequence(); });
    await act(async () => controller.setActiveVideoSequence(null));
    await act(async () => { response.resolve(sequence("one")); await pending; });
    expect(controller.activeVideoSequence).toBeNull();
  });
  it("keeps the most recently requested sequence when open responses arrive backwards", async () => {
    const first = deferred<ReturnType<typeof sequence>>(); const second = deferred<ReturnType<typeof sequence>>();
    api.getVideoSequence.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let openingA!: Promise<void>, openingB!: Promise<void>;
    await act(async () => { openingA = controller.openPersistedVideoSequence("one"); openingB = controller.openPersistedVideoSequence("two"); });
    await act(async () => { second.resolve(sequence("two")); await openingB; });
    await act(async () => { first.resolve(sequence("one")); await openingA; });
    expect(controller.activeVideoSequence?.id).toBe("two");
  });
  it("does not open a response belonging to a board the user has left", async () => {
    const response = deferred<ReturnType<typeof sequence>>(); api.getVideoSequence.mockReturnValueOnce(response.promise);
    let pending!: Promise<void>; await act(async () => { pending = controller.openPersistedVideoSequence("one"); });
    boardRef.current = { id: "board-b", name: "B" };
    await act(async () => root.render(createElement(Harness)));
    await act(async () => { response.resolve(sequence("one")); await pending; });
    expect(controller.activeVideoSequence).toBeNull();
  });
  it("does not replace the newly selected sequence with a late save response", async () => {
    await act(async () => controller.setActiveVideoSequence(sequence("one")));
    const response = deferred<ReturnType<typeof sequence>>(); api.mutateVideoSequence.mockReturnValueOnce(response.promise);
    let pending!: Promise<void>; await act(async () => { pending = controller.mutateActiveVideoSequence("updateSegment", { segmentId: "segment", configPatch: { prompt: "new" } }); });
    await act(async () => controller.setActiveVideoSequence(sequence("two")));
    await act(async () => { response.resolve({ ...sequence("one"), revision: 2 }); await pending; });
    expect(controller.activeVideoSequence?.id).toBe("two");
    expect(controller.videoSequenceSaving).toBe(false);
  });
});

it("does not pull the user back to the original board after background sequence creation", async () => {
  const response = deferred<ReturnType<typeof sequence>>(); api.createVideoSequence.mockReturnValueOnce(response.promise);
  let pending!: Promise<void>; await act(async () => { pending = controller.createVideoSequenceFromImages([{ id: "a" }, { id: "b" }] as never); });
  boardRef.current = { id: "board-b", name: "B" }; await act(async () => root.render(createElement(Harness)));
  await act(async () => { response.resolve(sequence("created-in-a")); await pending; });
  expect(openBoard).not.toHaveBeenCalled(); expect(controller.activeVideoSequence).toBeNull();
});
it("does not reopen a sequence closed while a template is instantiated", async () => {
  await act(async () => controller.setActiveVideoSequence(sequence("one")));
  const response = deferred<ReturnType<typeof sequence>>(); api.instantiateVideoSequenceTemplate.mockReturnValueOnce(response.promise);
  api.getVideoSequence.mockResolvedValueOnce(sequence("from-template"));
  let pending!: Promise<void>; await act(async () => { pending = controller.applyActiveVideoSequenceTemplate("template"); });
  await act(async () => controller.setActiveVideoSequence(null));
  await act(async () => { response.resolve(sequence("from-template")); await pending; });
  expect(controller.activeVideoSequence).toBeNull();
});
