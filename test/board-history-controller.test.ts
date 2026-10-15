// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ImageWorkbenchApi } from "../shared/workbench-client";
import type { GenerationJob } from "../shared/types";
import { useBoardHistory } from "../src/features/boards/use-board-history";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const job = (id: string): GenerationJob => ({ id, boardId: "board", prompt: id, status: "succeeded", createdAt: id === "new" ? "2026-10-15T00:00:02Z" : "2026-10-15T00:00:01Z",
 input: { workflowMode: "generate", prompt: id, model: "fixture", size: "auto", n: 1 }, referenceImagePaths: [], outputImagePaths: [] });
describe("history surface query lifecycle", () => {
  it("loads scoped pages and preserves explicitly expanded records on refresh", async () => {
    const page = vi.fn().mockResolvedValueOnce({ items: [job("new")], total: 2, nextCursor: "new" }).mockResolvedValueOnce({ items: [job("old")], total: 2 })
      .mockResolvedValue({ items: [{ ...job("new"), prompt: "updated" }], total: 2, nextCursor: "new" });
    const api = { listHistoryPage: page, listVideoJobs: vi.fn(async () => []) } as unknown as ImageWorkbenchApi;
    const activeBoard = { current: { id: "board" } };
    let state!: ReturnType<typeof useBoardHistory>;
    function Harness() { state = useBoardHistory({ boardId: "board", activeBoard, libraryOpen: false, galleryOpen: false, getApi: () => api, onVideos: vi.fn(), onError: vi.fn() }); return null; }
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => { root.render(createElement(Harness)); });
      expect(state.historyHasMore).toBe(true);
      await act(async () => state.loadMoreHistory());
      expect(page).toHaveBeenLastCalledWith("board", "new", 100);
      expect(state.history.map((j) => j.id)).toEqual(["new", "old"]);
      await act(async () => state.refreshHistory());
      expect(state.history).toHaveLength(2);
      expect(state.history[0].prompt).toBe("updated");
    } finally { await act(async () => root.unmount()); }
  });
  it("ignores a delayed history response after switching boards", async () => {
    let complete!: (value: unknown) => void;
    const old = new Promise((resolve) => { complete = resolve; });
    const api = { listHistoryPage: vi.fn((id: string) => id === "a" ? old : Promise.resolve({ items: [{ ...job("b"), boardId: "b" }], total: 1 })), listVideoJobs: vi.fn(async () => []) } as unknown as ImageWorkbenchApi;
    const activeBoard = { current: { id: "a" } };
    let state!: ReturnType<typeof useBoardHistory>;
    function Harness({ id }: { id: string }) { state = useBoardHistory({ boardId: id, activeBoard, libraryOpen: false, galleryOpen: false, getApi: () => api, onVideos: vi.fn(), onError: vi.fn() }); return null; }
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Harness, { id: "a" })));
      activeBoard.current = { id: "b" };
      await act(async () => root.render(createElement(Harness, { id: "b" })));
      await act(async () => { complete({ items: [job("old-a")], total: 1 }); });
      expect(state.history.map((j) => j.boardId)).toEqual(["b"]);
    } finally { await act(async () => root.unmount()); }
  });
});
