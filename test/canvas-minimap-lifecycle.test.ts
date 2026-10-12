// @vitest-environment jsdom

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCanvasMiniMapController,
  type CanvasMiniMapViewProps
} from "@/components/canvas/use-canvas-minimap-controller";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasMiniMapViewProps | null = null;
let observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];

function Harness({ visible, setViewport }: {
  visible: boolean;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<boolean>;
}): React.ReactElement {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const controller = useCanvasMiniMapController({
    canvasContainerRef,
    visible,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport,
    zoomTo: async () => true,
    scheduleCanvasReport: vi.fn()
  });
  latest = controller.viewProps;
  return createElement("div", { ref: canvasContainerRef });
}

async function render(visible: boolean, setViewport = vi.fn(async () => true)): Promise<typeof setViewport> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root?.render(createElement(Harness, { visible, setViewport })));
  return setViewport;
}

function pointerEvent(currentTarget: object, overrides: Record<string, unknown> = {}): never {
  return {
    button: 0,
    pointerId: 7,
    clientX: 10,
    clientY: 20,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides
  } as never;
}

beforeEach(() => {
  latest = null;
  observers = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1200,
    bottom: 800,
    width: 1200,
    height: 800,
    toJSON: () => ({})
  });
  vi.stubGlobal("ResizeObserver", class {
    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();

    constructor() {
      observers.push(this);
    }
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canvas minimap controller lifecycle", () => {
  it("follows controlled visibility and disconnects its resize observer when hidden", async () => {
    await render(false);
    expect(latest?.position).toBeNull();
    expect(observers).toHaveLength(0);

    await render(true);
    expect(latest?.position).toEqual({ x: 12, y: 584 });
    expect(observers).toHaveLength(1);

    await render(false);
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("cancels pending viewport work and clears both drag states when hidden", async () => {
    const requestFrame = vi.fn(() => 42);
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const setViewport = await render(true);

    const svg = {
      getBoundingClientRect: () => ({ width: 240, height: 160 }),
      viewBox: { baseVal: { width: 480, height: 320 } }
    };
    const interactionTarget = {
      closest: () => ({ querySelector: () => svg }),
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn()
    };
    const positionTarget = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn()
    };

    await act(async () => {
      latest?.onPointerDown(pointerEvent(interactionTarget));
      latest?.onPointerMove(pointerEvent(interactionTarget, { clientX: 30, clientY: 40 }));
      latest?.onPositionPointerDown(pointerEvent(positionTarget));
    });
    expect(latest?.isDragging).toBe(true);
    expect(latest?.isPositionDragging).toBe(true);
    expect(requestFrame).toHaveBeenCalledOnce();

    await render(false, setViewport);
    expect(cancelFrame).toHaveBeenCalledWith(42);
    expect(latest?.isDragging).toBe(false);
    expect(latest?.isPositionDragging).toBe(false);
    expect(interactionTarget.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(positionTarget.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("falls back to the default position when persisted storage cannot be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    await expect(render(true)).resolves.toBeTypeOf("function");
    expect(latest?.position).toEqual({ x: 12, y: 584 });
  });
});
