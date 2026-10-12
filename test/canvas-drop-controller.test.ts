// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCanvasDropController,
  type CanvasDropController,
  type CanvasDropPayload
} from "@/components/canvas/use-canvas-drop-controller";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface TransferData {
  types: string[];
  files?: File[];
  values?: Record<string, string>;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasDropController | null = null;
let frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function Harness({
  getViewport,
  screenToFlowPosition,
  recordCanvasChange,
  onDropImages
}: {
  getViewport: () => { x: number; y: number; zoom: number };
  screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number };
  recordCanvasChange: () => void;
  onDropImages: (payload: CanvasDropPayload) => void;
}): React.ReactElement {
  const controller = useCanvasDropController({
    getViewport,
    screenToFlowPosition,
    recordCanvasChange,
    onDropImages
  });
  latest = controller;
  return createElement("div", { "data-drop-root": "", ...controller.rootHandlers },
    createElement("span", { "data-drop-child": "" })
  );
}

async function renderHarness(overrides: Partial<Parameters<typeof Harness>[0]> = {}): Promise<{
  dropRoot: HTMLDivElement;
  child: HTMLSpanElement;
  recordCanvasChange: ReturnType<typeof vi.fn>;
  onDropImages: ReturnType<typeof vi.fn>;
  screenToFlowPosition: ReturnType<typeof vi.fn>;
}> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const recordCanvasChange = vi.fn();
  const onDropImages = vi.fn();
  const screenToFlowPosition = vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 }));
  await act(async () => root?.render(createElement(Harness, {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition,
    recordCanvasChange,
    onDropImages,
    ...overrides
  })));
  const dropRoot = host.querySelector<HTMLDivElement>("[data-drop-root]");
  const child = host.querySelector<HTMLSpanElement>("[data-drop-child]");
  if (!dropRoot || !child) throw new Error("drop controller harness did not render");
  vi.spyOn(dropRoot, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: 50,
    top: 50,
    left: 100,
    right: 900,
    bottom: 650,
    width: 800,
    height: 600,
    toJSON: () => ({})
  });
  return { dropRoot, child, recordCanvasChange, onDropImages, screenToFlowPosition };
}

function dispatchDrag(
  target: Element,
  type: string,
  transfer: TransferData,
  options: { clientX?: number; clientY?: number; relatedTarget?: EventTarget | null } = {}
): { event: MouseEvent; dataTransfer: DataTransfer } {
  const values = transfer.values ?? {};
  const dataTransfer = {
    types: transfer.types,
    files: transfer.files ?? [],
    dropEffect: "none",
    getData(dataType: string) {
      return values[dataType] ?? "";
    }
  } as unknown as DataTransfer;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 340,
    clientY: options.clientY ?? 230,
    relatedTarget: options.relatedTarget ?? null
  });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  act(() => target.dispatchEvent(event));
  return { event, dataTransfer };
}

function flushFrame(id = Math.min(...frameCallbacks.keys())): void {
  const callback = frameCallbacks.get(id);
  if (!callback) throw new Error(`missing animation frame ${id}`);
  frameCallbacks.delete(id);
  act(() => callback(performance.now()));
}

beforeEach(() => {
  latest = null;
  frameCallbacks = new Map();
  nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frameCallbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
    frameCallbacks.delete(id);
  }));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canvas drop controller", () => {
  it("coalesces preview updates into the latest animation frame value", async () => {
    const { dropRoot } = await renderHarness({
      getViewport: () => ({ x: 0, y: 0, zoom: 0.25 })
    });

    const first = dispatchDrag(dropRoot, "dragenter", { types: ["Files"] }, { clientX: 220, clientY: 170 });
    const second = dispatchDrag(dropRoot, "dragover", { types: ["text/uri-list"] }, { clientX: 420, clientY: 310 });

    expect(first.event.defaultPrevented).toBe(true);
    expect(second.event.defaultPrevented).toBe(true);
    expect(second.dataTransfer.dropEffect).toBe("copy");
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(latest?.preview).toBeNull();

    flushFrame();
    expect(latest?.preview).toEqual({ x: 320, y: 260, width: 120, kind: "link" });
  });

  it("keeps the preview while moving into a child and clears it after leaving the root", async () => {
    const { dropRoot, child } = await renderHarness();
    dispatchDrag(dropRoot, "dragenter", { types: ["Files"] });
    flushFrame();

    dispatchDrag(dropRoot, "dragleave", { types: ["Files"] }, { relatedTarget: child });
    expect(latest?.preview).not.toBeNull();

    dispatchDrag(dropRoot, "dragleave", { types: ["Files"] }, { relatedTarget: document.body });
    expect(latest?.preview).toBeNull();
  });

  it("records one change and emits files, URLs, and flow coordinates for a supported drop", async () => {
    const { dropRoot, recordCanvasChange, onDropImages, screenToFlowPosition } = await renderHarness();
    const file = new File(["image"], "sample.png", { type: "image/png" });

    const { event } = dispatchDrag(dropRoot, "drop", {
      types: ["Files", "text/html", "text/uri-list"],
      files: [file],
      values: {
        "text/html": '<img src="https://cdn.example.com/first.png">',
        "text/uri-list": "https://cdn.example.com/second.webp"
      }
    }, { clientX: 500, clientY: 300 });

    expect(event.defaultPrevented).toBe(true);
    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 500, y: 300 });
    expect(onDropImages).toHaveBeenCalledWith({
      files: [file],
      imageUrls: [
        "https://cdn.example.com/first.png",
        "https://cdn.example.com/second.webp"
      ],
      position: { x: 250, y: 150 }
    });
    expect(recordCanvasChange.mock.invocationCallOrder[0]).toBeLessThan(
      onDropImages.mock.invocationCallOrder[0]
    );
    expect(latest?.preview).toBeNull();
  });

  it("ignores unsupported data without claiming or recording the drop", async () => {
    const { dropRoot, recordCanvasChange, onDropImages } = await renderHarness();

    const { event } = dispatchDrag(dropRoot, "drop", { types: ["application/json"] });

    expect(event.defaultPrevented).toBe(false);
    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(onDropImages).not.toHaveBeenCalled();
  });

  it("cancels pending preview work on global termination and unmount", async () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { dropRoot } = await renderHarness();
    dispatchDrag(dropRoot, "dragenter", { types: ["Files"] });
    expect(frameCallbacks.size).toBe(1);

    act(() => window.dispatchEvent(new Event("blur")));
    expect(frameCallbacks.size).toBe(0);
    expect(latest?.preview).toBeNull();

    dispatchDrag(dropRoot, "dragenter", { types: ["Files"] });
    expect(frameCallbacks.size).toBe(1);
    await act(async () => root?.unmount());
    root = null;

    expect(frameCallbacks.size).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("drop", expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith("dragend", expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith("blur", expect.any(Function));
  });
});
