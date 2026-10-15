// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardLibrary } from "../src/components/workbench/BoardLibrary";
import type { BoardSummary } from "../shared/types";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("large board library interaction", () => {
  it("keeps a thousand boards reachable while rendering only the viewport", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, width: 800, height: 64, top: 0, left: 0, right: 800, bottom: 64, toJSON: () => ({}) });
    const boards: BoardSummary[] = Array.from({ length: 1000 }, (_, index) => ({
      id: "board-" + index, name: "Board " + String(index).padStart(4, "0"),
      createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", imageCount: 0
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(BoardLibrary, {
        boards, onOpenBoard: vi.fn(), onPrefetchBoard: vi.fn(), onCreateBoard: vi.fn(),
        onRenameBoard: vi.fn(), onDuplicateBoard: vi.fn(), onDeleteBoard: vi.fn(async () => undefined),
        onExportBoard: vi.fn(), onImportBoard: vi.fn(async () => undefined),
        onImportBoardFiles: vi.fn(async () => undefined), onClose: vi.fn()
      })));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(container.querySelectorAll("[data-board-card-item]").length).toBeLessThan(100);
      const scroll = container.querySelector<HTMLElement>("[data-board-scroll]")!;
      await act(async () => {
        scroll.scrollTop = 1_000_000;
        scroll.dispatchEvent(new Event("scroll"));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(container.querySelector('button[aria-label="打开画板 Board 0999"]')).not.toBeNull();
      expect(container.querySelectorAll("[data-board-card-item]").length).toBeLessThan(100);
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
