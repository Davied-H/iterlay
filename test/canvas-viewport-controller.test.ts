// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";

import {
  useCanvasViewportController,
  type CanvasViewportController
} from "@/components/canvas/use-canvas-viewport-controller";

type ViewportOptions = Parameters<typeof useCanvasViewportController>[0];

let resizeCallback: ResizeObserverCallback | null = null;
let observerDisconnected = false;
let nextFrameId = 0;
let frames = new Map<number, FrameRequestCallback>();

class MockResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    observerDisconnected = true;
  }
}

function node(id: string, x: number, selected = false): Node {
  return {
    id,
    type: "imageNode",
    position: { x, y: 20 },
    width: 264,
    height: 160,
    selected,
    data: {}
  };
}

function flushFrames(): void {
  const pending = [...frames.values()];
  frames = new Map();
  for (const callback of pending) callback(0);
}

function createHarness(overrides: Partial<ViewportOptions> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => undefined
    })
  });
  document.body.append(container);
  let nodes = [node("old", 0), node("new", 400), node("other", 800)];
  const fitView = vi.fn();
  const setViewport = vi.fn();
  const setCenter = vi.fn();
  const zoomTo = vi.fn();
  const reportCanvasState = vi.fn();
  let options: ViewportOptions = {
    containerRef: { current: container },
    imageNodeIds: ["old"],
    contentNodeIds: ["old"],
    preserveViewportNodeIds: new Set(),
    rightRailInset: 0,
    getNodes: () => nodes,
    updateNodes: (updater) => {
      nodes = updater(nodes);
    },
    getViewport: () => ({ x: 10, y: 20, zoom: 1 }),
    setViewport,
    setCenter,
    fitView,
    zoomTo,
    reportCanvasState,
    ...overrides
  };
  let controller: CanvasViewportController | null = null;
  function Harness(): null {
    controller = useCanvasViewportController(options);
    return null;
  }
  const root = createRoot(container);
  act(() => root.render(createElement(Harness)));
  return {
    root,
    get controller() { return controller!; },
    get nodes() { return nodes; },
    fitView,
    setViewport,
    setCenter,
    zoomTo,
    reportCanvasState,
    rerender(patch: Partial<ViewportOptions>) {
      options = { ...options, ...patch };
      act(() => root.render(createElement(Harness)));
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  frames = new Map();
  nextFrameId = 0;
  resizeCallback = null;
  observerDisconnected = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("canvas viewport controller", () => {
  it("fits workflow-only content initially unless a viewport was restored", () => {
    const workflowOnly = createHarness({
      imageNodeIds: [],
      contentNodeIds: ["workflow"]
    });
    expect(workflowOnly.controller.shouldFitInitialView).toBe(true);
    act(() => workflowOnly.root.unmount());

    const restored = createHarness({
      imageNodeIds: [],
      contentNodeIds: ["workflow"],
      initialViewport: { x: 10, y: 20, zoom: 0.8 }
    });
    expect(restored.controller.shouldFitInitialView).toBe(false);
    act(() => restored.root.unmount());
  });

  it("compensates container resize and right rail changes", () => {
    const harness = createHarness();
    act(() => resizeCallback?.([{
      contentRect: { width: 1000, height: 500 }
    } as ResizeObserverEntry], {} as ResizeObserver));

    expect(harness.setViewport).toHaveBeenCalledWith(
      { x: 110, y: -30, zoom: 1 },
      { duration: 0 }
    );
    harness.rerender({ rightRailInset: 200 });
    expect(harness.setViewport).toHaveBeenLastCalledWith(
      { x: -90, y: 20, zoom: 1 },
      { duration: 0 }
    );

    act(() => harness.root.unmount());
    expect(observerDisconnected).toBe(true);
  });

  it("gives explicit focus and preserve-on-create priority over delayed fitting", () => {
    const harness = createHarness();
    harness.rerender({ imageNodeIds: ["old", "new"], focusKey: "new", focusNonce: 1 });
    act(() => {
      vi.advanceTimersByTime(60);
      flushFrames();
    });

    expect(harness.fitView).not.toHaveBeenCalled();
    expect(harness.setCenter).toHaveBeenCalledWith(532, 100, { zoom: 1.25, duration: 500 });
    expect(harness.nodes.map((item) => Boolean(item.selected))).toEqual([false, true, false]);

    harness.rerender({
      imageNodeIds: ["old", "new", "preserved"],
      preserveViewportNodeIds: new Set(["preserved"]),
      focusKey: null,
      focusNonce: 0
    });
    act(() => vi.advanceTimersByTime(60));
    expect(harness.fitView).not.toHaveBeenCalled();

    harness.rerender({
      imageNodeIds: ["old", "new", "preserved", "other"],
      preserveViewportNodeIds: new Set(["preserved"])
    });
    harness.rerender({
      imageNodeIds: ["old", "new", "preserved", "other"],
      preserveViewportNodeIds: new Set(["preserved"])
    });
    act(() => vi.advanceTimersByTime(59));
    expect(harness.fitView).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(harness.fitView).toHaveBeenCalledWith({
      nodes: [expect.objectContaining({ id: "other" })],
      padding: 0.18,
      duration: 400,
      maxZoom: 1.25
    });
    act(() => harness.root.unmount());
  });

  it("selects and frames requested groups and exposes toolbar actions", () => {
    const harness = createHarness({
      selectionTargetIds: ["old", "other"],
      selectionTargetNonce: 1,
      getSelectionBottomInset: () => 100
    });
    act(() => flushFrames());

    expect(harness.nodes.map((item) => Boolean(item.selected))).toEqual([true, false, true]);
    expect(harness.fitView).toHaveBeenCalledWith({
      nodes: [expect.objectContaining({ id: "old" }), expect.objectContaining({ id: "other" })],
      padding: 0.18,
      duration: 500,
      maxZoom: 1.25
    });

    expect(harness.controller.fitSelection()).toBe(true);
    expect(harness.fitView).toHaveBeenLastCalledWith({
      nodes: [expect.objectContaining({ id: "old" }), expect.objectContaining({ id: "other" })],
      padding: { top: "8%", right: "8%", bottom: "116px", left: "8%" },
      duration: 300,
      maxZoom: 2
    });
    harness.controller.fitAll();
    expect(harness.fitView).toHaveBeenLastCalledWith({ padding: 0.3, maxZoom: 1.25, duration: 300 });
    harness.controller.onZoomChange(1.6, true);
    expect(harness.zoomTo).toHaveBeenCalledWith(1.6, { duration: 0 });
    act(() => harness.controller.onMoveEnd({ x: 0, y: 0, zoom: 1.6 }));
    expect(harness.controller.zoom).toBe(1.6);
    expect(harness.reportCanvasState).toHaveBeenCalledOnce();
    act(() => harness.root.unmount());
  });

  it("frames a video generation node above the prompt dock when focused", () => {
    const videoNode: Node = {
      id: "video-generator",
      type: "videoGenerationNode",
      position: { x: 300, y: 200 },
      width: 340,
      height: 636,
      data: {}
    };
    const harness = createHarness({
      focusKey: "video-generator",
      focusNonce: 1,
      getNodes: () => [videoNode],
      getSelectionBottomInset: () => 240
    });
    act(() => flushFrames());

    expect(harness.setCenter).not.toHaveBeenCalled();
    expect(harness.fitView).toHaveBeenCalledWith({
      nodes: [videoNode],
      padding: { top: "8%", right: "8%", bottom: "256px", left: "8%" },
      duration: 500,
      maxZoom: 1.25
    });
    act(() => harness.root.unmount());
  });

  it("cancels pending timers and animation frames on unmount", () => {
    const harness = createHarness();
    harness.rerender({
      imageNodeIds: ["old", "new"],
      focusKey: "other",
      focusNonce: 1,
      selectionTargetIds: ["old"],
      selectionTargetNonce: 1
    });
    act(() => harness.root.unmount());
    act(() => {
      vi.advanceTimersByTime(60);
      flushFrames();
    });

    expect(harness.fitView).not.toHaveBeenCalled();
    expect(harness.setCenter).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
