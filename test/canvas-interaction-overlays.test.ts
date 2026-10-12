// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasEmptyState, CanvasEmptyStateLoadingFallback } from "../src/components/canvas/CanvasOverlays";
import {
  CanvasContextMenu,
  CanvasNodeCreateMenu,
  CanvasZoomToolbar,
  registeredCanvasCreateItems
} from "../src/components/canvas/CanvasInteractionOverlays";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mount(element: React.ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return container;
}

async function waitForAssertion(assertion: () => void, timeout = 1000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 25)));
    }
  }
  assertion();
}

describe("canvas interaction overlays", () => {
  it("builds the create menu from the active node renderer registry", () => {
    expect(registeredCanvasCreateItems().map((item) => item.type)).toEqual([
      "imageNode",
      "textNode",
      "generationNode",
      "videoNode",
      "videoGenerationNode",
      "comicSettingNode",
      "comicCharacterNode",
      "comicSegmentNode"
    ]);
    expect(registeredCanvasCreateItems(["textNode", "missingNode"]).map((item) => item.type)).toEqual(["textNode"]);
  });

  it("anchors the create menu, supports keyboard navigation, and closes after creation", async () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const host = mount(createElement(CanvasNodeCreateMenu, {
      anchor: { x: 120, y: 84 },
      types: ["textNode", "generationNode"],
      onCreate,
      onClose
    }));
    const menu = host.querySelector<HTMLElement>('[role="menu"]');
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];

    expect(menu?.style.left).toBe("120px");
    expect(menu?.style.top).toBe("84px");
    expect(buttons).toHaveLength(2);
    expect(document.activeElement).toBe(buttons[0]);

    await act(async () => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement).toBe(buttons[1]);
    await act(async () => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(onClose).toHaveBeenCalledOnce();
    onClose.mockClear();
    await act(async () => buttons[1]?.click());

    expect(onCreate).toHaveBeenCalledWith("generationNode");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dismisses anchored menus with Escape and outside pointer input", async () => {
    const onClose = vi.fn();
    mount(createElement(CanvasNodeCreateMenu, {
      anchor: { x: 0, y: 0 },
      onCreate: vi.fn(),
      onClose
    }));

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("emits zoom and navigation commands while enforcing zoom limits", async () => {
    const onZoomChange = vi.fn();
    const onFitAll = vi.fn();
    const onFitSelection = vi.fn();
    const onToggleMiniMap = vi.fn();
    const host = mount(createElement(CanvasZoomToolbar, {
      zoom: 4,
      onZoomChange,
      onFitAll,
      onFitSelection,
      onToggleMiniMap,
      hasSelection: false,
      miniMapOpen: true
    }));

    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="放大"]')?.click());
    expect(onZoomChange).toHaveBeenLastCalledWith(4);
    const slider = host.querySelector<HTMLInputElement>('[aria-label="画布缩放"]');
    expect(slider?.getAttribute("aria-valuetext")).toBe("400%");
    if (slider) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "2");
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(onZoomChange).toHaveBeenLastCalledWith(2, true);
    }
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="当前缩放 400%"]')?.click());
    expect(onZoomChange).toHaveBeenLastCalledWith(1);

    expect(host.querySelector<HTMLButtonElement>('[aria-label="适配所选"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="关闭小地图"]')?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="适配全部"]')?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="关闭小地图"]')?.click());
    expect(onFitAll).toHaveBeenCalledOnce();
    expect(onFitSelection).not.toHaveBeenCalled();
    expect(onToggleMiniMap).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="查看快捷键"]')).toBeNull();

    const collapseButton = host.querySelector<HTMLButtonElement>('[aria-label="收起缩放工具栏"]');
    await act(async () => collapseButton?.click());
    expect(host.querySelector('[data-canvas-zoom-toolbar]')?.getAttribute("data-collapsed")).toBe("true");
    await waitForAssertion(() => expect(host.querySelector('[aria-label="画布缩放"]')).toBeNull());
    const expandButton = host.querySelector<HTMLButtonElement>('[aria-label="展开缩放工具栏"]');
    expect(expandButton).toBe(collapseButton);
    await act(async () => expandButton?.click());
    await waitForAssertion(() => expect(host.querySelector('[aria-label="画布缩放"]')).not.toBeNull());
  });

  it("exposes optional copy and required delete context actions", async () => {
    const onCopy = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const host = mount(createElement(CanvasContextMenu, {
      anchor: { x: 32, y: 48 },
      target: "node",
      onCopy,
      onDelete,
      onClose
    }));

    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')][0]?.click());
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps context actions in the viewport and supports arrow navigation", async () => {
    const host = mount(createElement(CanvasContextMenu, {
      anchor: { x: window.innerWidth, y: window.innerHeight },
      target: "node",
      onCopy: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn()
    }));
    const menu = host.querySelector<HTMLElement>('[role="menu"]');
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];

    expect(Number.parseFloat(menu?.style.left ?? "0")).toBeLessThan(window.innerWidth);
    expect(Number.parseFloat(menu?.style.top ?? "0")).toBeLessThan(window.innerHeight);
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("restores focus to the invoking control after a menu closes", async () => {
    const invoker = document.createElement("button");
    document.body.append(invoker);
    invoker.focus();
    mount(createElement(CanvasNodeCreateMenu, {
      anchor: { x: 20, y: 20 },
      types: ["textNode"],
      onCreate: vi.fn(),
      onClose: vi.fn()
    }));

    expect(document.activeElement).not.toBe(invoker);
    await act(async () => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(invoker);
    invoker.remove();
  });
});

describe("canvas empty state", () => {
  it("uses a stable loading fallback while the start experience loads", () => {
    const host = mount(createElement(CanvasEmptyStateLoadingFallback));

    expect(host.querySelector("[data-canvas-empty-loading]")?.getAttribute("role")).toBe("status");
    expect(host.textContent).toContain("正在加载画板起始选项");
  });

  it("loads the full empty-canvas controls and preserves their actions", async () => {
    const onPaste = vi.fn(async () => undefined);
    const host = mount(createElement(CanvasEmptyState, {
      visible: true,
      reduceMotion: true,
      suggestedMode: "compass",
      promptFocused: false,
      pasteShortcut: "Ctrl+V",
      showDemoStart: false,
      onChooseFiles: vi.fn(),
      onPaste,
      onStartPrompt: vi.fn(),
      onAddRecentAssets: vi.fn(),
      onOpenAssetLibrary: vi.fn(),
      onOpenDemoStart: vi.fn()
    }));

    expect(host.querySelector("[data-canvas-empty-loading]")).not.toBeNull();
    await act(async () => {
      await import("../src/components/canvas/EmptyCanvasStart");
    });

    expect(host.querySelector("[aria-label=\"新画板\"]")).not.toBeNull();
    const pasteButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("粘贴图片"));
    await act(async () => pasteButton?.click());
    expect(onPaste).toHaveBeenCalledOnce();
  });
});
