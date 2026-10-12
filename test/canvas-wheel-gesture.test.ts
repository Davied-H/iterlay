// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  CanvasWheelGestureLock,
  cloneWheelEvent,
  hasLocalWheelScroller,
  isBlockedCanvasWheelTarget
} from "@/components/canvas/canvas-wheel-gesture";

describe("canvas wheel gesture ownership", () => {
  it("keeps a canvas-started gesture on the canvas across nowheel content", () => {
    const lock = new CanvasWheelGestureLock(180);
    expect(lock.resolve({ blockedByCanvasBoundary: false, hasLocalScroller: false }, 0)).toBe("passthrough");
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: true }, 80)).toBe("redirect-to-canvas");
  });

  it("keeps a local-started gesture away from the canvas", () => {
    const lock = new CanvasWheelGestureLock(180);
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: true }, 0)).toBe("passthrough");
    expect(lock.resolve({ blockedByCanvasBoundary: false, hasLocalScroller: false }, 80)).toBe("block-canvas");
  });

  it("hands a local gesture to the canvas when the scroller reaches its boundary", () => {
    const lock = new CanvasWheelGestureLock(180);
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: true }, 0)).toBe("passthrough");
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: false }, 80)).toBe("redirect-to-canvas");
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: true }, 100)).toBe("redirect-to-canvas");
  });

  it("starts a new owner after the wheel stream becomes idle", () => {
    const lock = new CanvasWheelGestureLock(180);
    lock.resolve({ blockedByCanvasBoundary: false, hasLocalScroller: false }, 0);
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: true }, 181)).toBe("passthrough");
  });

  it("redirects a canvas gesture that starts on a non-scrollable boundary", () => {
    const lock = new CanvasWheelGestureLock(180);
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: false }, 0)).toBe("redirect-to-canvas");
    expect(lock.resolve({ blockedByCanvasBoundary: false, hasLocalScroller: false }, 80)).toBe("passthrough");
  });

  it("never locks pinch or modifier zoom gestures but redirects them across boundaries", () => {
    const lock = new CanvasWheelGestureLock(180);
    lock.resolve({ blockedByCanvasBoundary: false, hasLocalScroller: false }, 0);
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: false, bypassLock: true }, 20)).toBe("redirect-to-canvas");
    expect(lock.resolve({ blockedByCanvasBoundary: true, hasLocalScroller: true }, 30)).toBe("passthrough");
  });
});

describe("canvas wheel target classification", () => {
  function makeScrollable(element: HTMLElement): void {
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 240 }
    });
    element.style.overflowY = "auto";
  }

  function setScrollPosition(element: HTMLElement, scrollTop: number): void {
    Object.defineProperty(element, "scrollTop", { configurable: true, value: scrollTop });
  }

  it("only treats nowheel ancestors as wheel boundaries", () => {
    const boundary = document.createElement("div");
    boundary.className = "nowheel";
    const child = document.createElement("span");
    boundary.append(child);
    expect(isBlockedCanvasWheelTarget(child)).toBe(true);

    boundary.className = "nopan";
    expect(isBlockedCanvasWheelTarget(child)).toBe(false);
  });

  it("allows a focused, genuinely scrollable editor to own the gesture", () => {
    const root = document.createElement("div");
    const textarea = document.createElement("textarea");
    makeScrollable(textarea);
    root.append(textarea);
    document.body.append(root);
    textarea.focus();

    expect(hasLocalWheelScroller(textarea, document.activeElement, root, 0, 12)).toBe(true);
    root.remove();
  });

  it("does not treat an unfocused editor or non-overflowing region as a local scroller", () => {
    const root = document.createElement("div");
    const textarea = document.createElement("textarea");
    makeScrollable(textarea);
    root.append(textarea);
    document.body.append(root);

    expect(hasLocalWheelScroller(textarea, document.activeElement, root, 0, 12)).toBe(false);
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 100 });
    textarea.focus();
    expect(hasLocalWheelScroller(textarea, document.activeElement, root, 0, 12)).toBe(false);
    root.remove();
  });

  it("preserves scrolling in menus without requiring container focus", () => {
    const root = document.createElement("div");
    const menu = document.createElement("div");
    menu.className = "canvas-overlay-menu";
    makeScrollable(menu);
    root.append(menu);
    expect(hasLocalWheelScroller(menu, null, root, 0, 12)).toBe(true);
  });

  it("only keeps vertical wheel ownership while the requested direction can scroll", () => {
    const root = document.createElement("div");
    const menu = document.createElement("div");
    menu.className = "canvas-overlay-menu";
    makeScrollable(menu);
    root.append(menu);

    setScrollPosition(menu, 0);
    expect(hasLocalWheelScroller(menu, null, root, 0, -12)).toBe(false);
    expect(hasLocalWheelScroller(menu, null, root, 0, 12)).toBe(true);

    setScrollPosition(menu, 140);
    expect(hasLocalWheelScroller(menu, null, root, 0, -12)).toBe(true);
    expect(hasLocalWheelScroller(menu, null, root, 0, 12)).toBe(false);
  });

  it("checks horizontal wheel boundaries independently", () => {
    const root = document.createElement("div");
    const menu = document.createElement("div");
    menu.className = "canvas-overlay-menu";
    menu.style.overflowX = "auto";
    Object.defineProperties(menu, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 220 },
      scrollLeft: { configurable: true, value: 120 }
    });
    root.append(menu);

    expect(hasLocalWheelScroller(menu, null, root, 10, 0)).toBe(false);
    expect(hasLocalWheelScroller(menu, null, root, -10, 0)).toBe(true);
  });

  it("clones wheel deltas and modifier state for XYFlow", () => {
    const original = new WheelEvent("wheel", {
      deltaX: 7,
      deltaY: -13,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      shiftKey: true
    });
    const clone = cloneWheelEvent(original);
    expect(clone).not.toBe(original);
    expect({ deltaX: clone.deltaX, deltaY: clone.deltaY, deltaMode: clone.deltaMode, shiftKey: clone.shiftKey }).toEqual({
      deltaX: 7,
      deltaY: -13,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      shiftKey: true
    });
  });
});
