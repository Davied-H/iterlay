// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node } from "@xyflow/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  CANVAS_CLIPBOARD_TYPE,
  serializeCanvasClipboardItems,
  type CanvasClipboardItem
} from "@/components/canvas/canvas-clipboard";
import {
  canvasPasteShortcutLabel,
  useCanvasClipboardController,
  type CanvasClipboardController,
  type CanvasClipboardDropPayload
} from "@/components/canvas/use-canvas-clipboard-controller";
import type { GeneratedImage } from "@/components/canvas/image-node-model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface ClipboardDataOptions {
  custom?: string;
  text?: string;
  files?: File[];
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasClipboardController | null = null;

function image(id = "image-1", overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id,
    jobId: `job-${id}`,
    path: `/tmp/${id}.png`,
    dataUrl: `data:image/png;base64,${id}`,
    width: 100,
    height: 100,
    ...overrides
  };
}

function imageNode(value = image(), overrides: Partial<Node> = {}): Node {
  return {
    id: value.id,
    type: "imageNode",
    position: { x: 20, y: 40 },
    selected: true,
    width: 320,
    data: { image: value },
    ...overrides
  };
}

function Harness(props: {
  enabled: boolean;
  getNodes: () => readonly Node[];
  getCanvasBounds: () => DOMRect | null;
  screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number };
  recordCanvasChange: () => void;
  onPasteImages: (items: CanvasClipboardItem[]) => void;
  onDropImages: (payload: CanvasClipboardDropPayload) => void;
  createText?: (position: { x: number; y: number }, text: string) => void;
  notifyCopied: (count: number, shortcut: string) => void;
  notify: (message: string) => void;
}): React.ReactElement {
  const controller = useCanvasClipboardController(props);
  latest = controller;
  return createElement("div", { "data-clipboard-root": "", ...controller.rootHandlers });
}

async function renderHarness(overrides: Partial<Parameters<typeof Harness>[0]> = {}) {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  const capabilities = {
    enabled: true,
    getNodes: vi.fn((): readonly Node[] => []),
    getCanvasBounds: vi.fn(() => ({
      x: 100, y: 50, top: 50, left: 100, right: 900, bottom: 650,
      width: 800, height: 600, toJSON: () => ({})
    })),
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    recordCanvasChange: vi.fn(),
    onPasteImages: vi.fn(),
    onDropImages: vi.fn(),
    createText: vi.fn(),
    notifyCopied: vi.fn(),
    notify: vi.fn(),
    ...overrides
  };
  await act(async () => root?.render(createElement(Harness, capabilities)));
  const clipboardRoot = host.querySelector<HTMLDivElement>("[data-clipboard-root]");
  if (!clipboardRoot) throw new Error("clipboard controller harness did not render");
  return { ...capabilities, clipboardRoot };
}

function clipboardData(options: ClipboardDataOptions = {}) {
  const values = new Map<string, string>();
  if (options.custom !== undefined) values.set(CANVAS_CLIPBOARD_TYPE, options.custom);
  if (options.text !== undefined) values.set("text/plain", options.text);
  const items = (options.files ?? []).map((file) => ({
    kind: "file",
    type: file.type,
    getAsFile: () => file
  }));
  return {
    items,
    getData: vi.fn((type: string) => values.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      values.set(type, value);
    })
  } as unknown as DataTransfer;
}

function dispatchClipboard(
  type: "copy" | "paste",
  data: DataTransfer,
  target: EventTarget = document.body
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: data });
  act(() => target.dispatchEvent(event));
  return event;
}

function movePointer(target: Element, x: number, y: number): void {
  act(() => target.dispatchEvent(new MouseEvent("pointermove", {
    bubbles: true,
    clientX: x,
    clientY: y
  })));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  latest = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canvas clipboard controller", () => {
  it("serializes selected ready images and reports the native paste shortcut", async () => {
    const ready = imageNode();
    const pending = imageNode(image("pending", { pending: true }));
    const { notifyCopied } = await renderHarness({ getNodes: () => [ready, pending] });
    const data = clipboardData();

    const event = dispatchClipboard("copy", data);

    expect(event.defaultPrevented).toBe(true);
    expect(data.setData).toHaveBeenCalledWith(CANVAS_CLIPBOARD_TYPE, expect.any(String));
    expect(JSON.parse((data.setData as Mock).mock.calls[0][1] as string)).toMatchObject({
      version: 1,
      items: [{ image: { id: "image-1" }, position: { x: 20, y: 40 }, width: 320 }]
    });
    expect(notifyCopied).toHaveBeenCalledWith(1, canvasPasteShortcutLabel());
  });

  it("places custom canvas items at the pointer before falling back to the canvas center", async () => {
    const copied = [{ image: image("copied"), position: { x: 0, y: 0 } }];
    const { clipboardRoot, onPasteImages, recordCanvasChange, screenToFlowPosition } = await renderHarness();
    movePointer(clipboardRoot, 300, 180);

    dispatchClipboard("paste", clipboardData({ custom: serializeCanvasClipboardItems(copied) }));

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 300, y: 180 });
    expect(onPasteImages).toHaveBeenCalledOnce();
    expect((recordCanvasChange as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (onPasteImages as Mock).mock.invocationCallOrder[0]
    );

    act(() => clipboardRoot.dispatchEvent(new MouseEvent("pointerout", {
      bubbles: true,
      relatedTarget: document.body
    })));
    dispatchClipboard("paste", clipboardData({ custom: serializeCanvasClipboardItems(copied) }));
    expect(screenToFlowPosition).toHaveBeenLastCalledWith({ x: 500, y: 350 });
  });

  it("pastes image files at the pointer but preserves automatic placement without one", async () => {
    const file = new File(["image"], "pasted.png", { type: "image/png" });
    const { clipboardRoot, onDropImages, recordCanvasChange } = await renderHarness();
    movePointer(clipboardRoot, 240, 120);

    dispatchClipboard("paste", clipboardData({ files: [file] }));
    expect(onDropImages).toHaveBeenLastCalledWith({
      files: [file],
      imageUrls: [],
      position: { x: 120, y: 60 }
    });

    act(() => clipboardRoot.dispatchEvent(new MouseEvent("pointerout", {
      bubbles: true,
      relatedTarget: document.body
    })));
    dispatchClipboard("paste", clipboardData({ files: [file] }));
    expect(onDropImages).toHaveBeenLastCalledWith({ files: [file], imageUrls: [], position: undefined });
    expect(recordCanvasChange).toHaveBeenCalledTimes(2);
  });

  it("creates a text node for plain text and URL fallback at pointer or center", async () => {
    const { clipboardRoot, createText, recordCanvasChange } = await renderHarness();
    movePointer(clipboardRoot, 200, 100);

    dispatchClipboard("paste", clipboardData({ text: "  https://example.com/image.png  " }));
    expect(createText).toHaveBeenCalledWith({ x: 100, y: 50 }, "https://example.com/image.png");

    act(() => clipboardRoot.dispatchEvent(new MouseEvent("pointerout", {
      bubbles: true,
      relatedTarget: document.body
    })));
    dispatchClipboard("paste", clipboardData({ text: "caption" }));
    expect(createText).toHaveBeenLastCalledWith({ x: 250, y: 175 }, "caption");
    expect(recordCanvasChange).toHaveBeenCalledTimes(2);
  });

  it("leaves disabled and editable copy/paste events to their native owners", async () => {
    const getNodes = vi.fn(() => [imageNode()]);
    const { onPasteImages } = await renderHarness({ enabled: false, getNodes });
    const input = document.createElement("input");
    document.body.append(input);

    expect(dispatchClipboard("copy", clipboardData()).defaultPrevented).toBe(false);
    expect(dispatchClipboard("paste", clipboardData({ text: "ignored" })).defaultPrevented).toBe(false);
    await renderHarness({ enabled: true, getNodes });
    expect(dispatchClipboard("copy", clipboardData(), input).defaultPrevented).toBe(false);
    expect(dispatchClipboard("paste", clipboardData({ text: "ignored" }), input).defaultPrevented).toBe(false);
    expect(onPasteImages).not.toHaveBeenCalled();
    input.remove();
  });

  it("reads images for the empty-state paste action and records before import", async () => {
    const read = vi.fn(async () => [{
      types: ["image/jpeg", "text/plain"],
      getType: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" }))
    }]);
    vi.stubGlobal("navigator", { platform: "MacIntel", clipboard: { read } });
    const { recordCanvasChange, onDropImages } = await renderHarness();

    await act(async () => latest?.pasteFromSystemClipboard());

    expect(onDropImages).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "clipboard-1.jpg", type: "image/jpeg" })],
      imageUrls: []
    });
    expect((recordCanvasChange as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (onDropImages as Mock).mock.invocationCallOrder[0]
    );
  });

  it("uses the latest import capabilities after an asynchronous clipboard read", async () => {
    const deferred: { resolve?: (items: ClipboardItems) => void } = {};
    const read = vi.fn(() => new Promise<ClipboardItems>((resolve) => {
      deferred.resolve = resolve;
    }));
    vi.stubGlobal("navigator", { platform: "MacIntel", clipboard: { read } });
    const firstDrop = vi.fn();
    const nextDrop = vi.fn();
    await renderHarness({ onDropImages: firstDrop });
    const pendingPaste = latest?.pasteFromSystemClipboard();
    await renderHarness({ onDropImages: nextDrop });

    deferred.resolve?.([{
      types: ["image/png"],
      getType: async () => new Blob(["png"], { type: "image/png" })
    } as unknown as ClipboardItem]);
    await act(async () => pendingPaste);

    expect(firstDrop).not.toHaveBeenCalled();
    expect(nextDrop).toHaveBeenCalledOnce();
  });

  it("reports unavailable, empty, and rejected system clipboard reads", async () => {
    const { notify } = await renderHarness();
    vi.stubGlobal("navigator", { platform: "Win32" });
    await act(async () => latest?.pasteFromSystemClipboard());
    expect(notify).toHaveBeenLastCalledWith("请按 Ctrl+V 粘贴图片");

    vi.stubGlobal("navigator", { platform: "Win32", clipboard: { read: async () => [] } });
    await act(async () => latest?.pasteFromSystemClipboard());
    expect(notify).toHaveBeenLastCalledWith("剪贴板中没有可用的图片");

    vi.stubGlobal("navigator", { platform: "Win32", clipboard: { read: async () => { throw new Error("denied"); } } });
    await act(async () => latest?.pasteFromSystemClipboard());
    expect(notify).toHaveBeenLastCalledWith("无法直接读取剪贴板，请按 Ctrl+V 粘贴图片");
  });

  it("removes document listeners on unmount", async () => {
    const removeListener = vi.spyOn(document, "removeEventListener");
    await renderHarness();

    await act(async () => root?.unmount());
    root = null;

    expect(removeListener).toHaveBeenCalledWith("copy", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("paste", expect.any(Function));
  });
});
