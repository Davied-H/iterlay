// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@xyflow/react", () => ({
  useStore: (selector: (state: { transform: number[]; nodes: never[] }) => unknown) => selector({
    transform: [0, 0, 1],
    nodes: []
  }),
  useReactFlow: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomTo: vi.fn(),
    fitView: vi.fn(),
    getNodes: () => [],
    getEdges: () => []
  })
}));

import { TopBar } from "../src/components/workbench/TopBar";

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  document.querySelectorAll("[data-radix-popper-content-wrapper]").forEach((element) => element.remove());
  container = undefined;
  root = undefined;
});

describe("workspace top bar library tooltip", () => {
  it("closes and releases focus before opening the board library", async () => {
    const onOpenLibrary = vi.fn();
    const props = {
      historyOpen: false,
      commentOpen: false,
      boardName: "测试画板",
      boards: [],
      onOpenLibrary,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onCreateBoard: vi.fn(),
      onRenameBoard: vi.fn(),
      canBatchDownload: false,
      onBatchDownload: vi.fn(),
      onExportBoard: vi.fn(),
      canUndo: false,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onToggleHistory: vi.fn(),
      galleryAvailable: false,
      galleryShortcutEnabled: false,
      onOpenGallery: vi.fn(),
      onToggleComment: vi.fn(),
      onOpenImageTrash: vi.fn(),
      onOpenShortcutHelp: vi.fn(),
      onReplayTour: vi.fn()
    } satisfies ComponentProps<typeof TopBar>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(TopBar, props)));

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="打开画板库"]');
    await act(async () => trigger?.focus());
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    await act(async () => trigger?.click());
    expect(onOpenLibrary).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(trigger);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
