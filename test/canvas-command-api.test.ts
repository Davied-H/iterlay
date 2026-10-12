// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge, Node } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasSelectionSnapshot } from "@/components/canvas/canvas-history";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import type { CanvasShortcutSnapshot } from "@/components/canvas/canvas-shortcut-plan";
import {
  useCanvasCommandApi,
  type CanvasCommandApiOptions
} from "@/components/canvas/use-canvas-command-api";
import type { CanvasCommandApi } from "@/components/canvas/use-canvas-shortcut-controller";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasCommandApi | null = null;

function node(id: string, selected = false): Node {
  return { id, type: "imageNode", position: { x: 0, y: 0 }, selected, data: {} };
}

function edge(id: string, selected = false): Edge {
  return { id, source: "source", target: "target", selected };
}

function image(): GeneratedImage {
  return {
    id: "image-1",
    jobId: "job-1",
    path: "/tmp/image.png",
    dataUrl: "data:image/png;base64,AAAA",
    width: 100,
    height: 100
  };
}

function snapshot(nodes: Node[] = [], edges: Edge[] = []): CanvasShortcutSnapshot {
  return {
    enabled: true,
    commentMode: false,
    gestureActive: false,
    canAddReferences: true,
    availableAssetActions: new Set([
      "edit",
      "slice",
      "view-details",
      "save-as-template",
      "export-wechat",
      "quick-share",
      "remove-background",
      "switch-version"
    ]),
    nodes,
    edges
  };
}

function capabilities(): CanvasCommandApiOptions {
  return {
    selection: {
      updateNodes: vi.fn(),
      updateEdges: vi.fn(),
      deleteTargets: vi.fn(),
      duplicateNodes: vi.fn(),
      useSelectedReferences: vi.fn(),
      exportWechatSelectedImages: vi.fn()
    },
    history: {
      undo: vi.fn(),
      redo: vi.fn()
    },
    viewport: {
      fitCanvas: vi.fn(),
      fitSelection: vi.fn()
    },
    assets: {
      copyImage: vi.fn(() => Promise.resolve()),
      copyImageFormat: "png",
      notifyImageCopied: vi.fn(),
      notifyImageCopyFailed: vi.fn(),
      editImage: vi.fn(),
      sliceImage: vi.fn(),
      viewImageDetails: vi.fn(),
      saveAsTemplate: vi.fn(),
      quickShareImage: vi.fn(),
      downloadOriginal: vi.fn(),
      removeBackground: vi.fn(),
      switchVersion: vi.fn()
    },
    shell: {
      reject: vi.fn(),
      exitCanvas: vi.fn(),
      openShortcutHelp: vi.fn(),
      focusPrompt: vi.fn()
    }
  };
}

function Harness({ options }: { options: CanvasCommandApiOptions }): null {
  latest = useCanvasCommandApi(options);
  return null;
}

async function renderHarness(options: CanvasCommandApiOptions): Promise<void> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root?.render(createElement(Harness, { options })));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  latest = null;
  vi.restoreAllMocks();
});

describe("canvas command api", () => {
  it("delegates selection commands without repeating planner qualification", async () => {
    const options = capabilities();
    const target = node("selected");
    await renderHarness(options);

    act(() => {
      latest?.execute({ type: "delete", nodes: [target], connectionIds: ["edge-1"] }, snapshot());
      latest?.execute({ type: "duplicate", nodes: [target] }, snapshot());
      latest?.execute({ type: "reference" }, snapshot());
      latest?.execute({ type: "export-wechat", image: image() }, snapshot());
    });

    expect(options.selection.deleteTargets).toHaveBeenCalledWith([target], ["edge-1"]);
    expect(options.selection.duplicateNodes).toHaveBeenCalledWith([target]);
    expect(options.selection.useSelectedReferences).toHaveBeenCalledOnce();
    expect(options.selection.exportWechatSelectedImages).toHaveBeenCalledOnce();
  });

  it("clears and selects with immutable node and edge writes", async () => {
    const options = capabilities();
    const selectedNode = node("selected", true);
    const idleNode = node("idle");
    const selectedEdge = edge("selected-edge", true);
    const idleEdge = edge("idle-edge");
    let currentNodes = [selectedNode, idleNode];
    let currentEdges = [selectedEdge, idleEdge];
    options.selection.updateNodes = vi.fn((updater) => { currentNodes = updater(currentNodes); });
    options.selection.updateEdges = vi.fn((updater) => { currentEdges = updater(currentEdges); });
    await renderHarness(options);

    act(() => latest?.execute({ type: "clear-selection" }, snapshot()));
    expect(currentNodes).toEqual([
      expect.objectContaining({ id: "selected", selected: false }),
      idleNode
    ]);
    expect(currentNodes[0]).not.toBe(selectedNode);
    expect(currentNodes[1]).toBe(idleNode);
    expect(currentEdges[0]).not.toBe(selectedEdge);
    expect(currentEdges[1]).toBe(idleEdge);

    act(() => latest?.execute({ type: "select-all" }, snapshot()));
    expect(currentNodes.every((candidate) => candidate.selected)).toBe(true);
    expect(options.selection.updateEdges).toHaveBeenCalledOnce();
  });

  it("captures an undo or redo snapshot without mutating planner state", async () => {
    const options = capabilities();
    const nodes = [node("node-1", true)];
    const edges = [edge("edge-1", true)];
    const state = snapshot(nodes, edges);
    const expected = canvasSelectionSnapshot([...nodes], [...edges]);
    await renderHarness(options);

    act(() => {
      latest?.execute({ type: "undo" }, state);
      latest?.execute({ type: "redo" }, state);
    });

    expect(options.history.undo).toHaveBeenCalledWith(expected);
    expect(options.history.redo).toHaveBeenCalledWith(expected);
    expect(state.nodes).toBe(nodes);
    expect(state.edges).toBe(edges);
  });

  it("delegates viewport and shell commands", async () => {
    const options = capabilities();
    const target = node("target");
    await renderHarness(options);

    act(() => {
      latest?.execute({ type: "fit-canvas" }, snapshot());
      latest?.execute({ type: "fit-selection", nodes: [target] }, snapshot());
      latest?.execute({ type: "show-shortcuts" }, snapshot());
      latest?.execute({ type: "focus-prompt" }, snapshot());
      latest?.execute({ type: "exit-canvas" }, snapshot());
      latest?.reject("拒绝原因");
    });

    expect(options.viewport.fitCanvas).toHaveBeenCalledOnce();
    expect(options.viewport.fitSelection).toHaveBeenCalledWith([target]);
    expect(options.shell.openShortcutHelp).toHaveBeenCalledOnce();
    expect(options.shell.focusPrompt).toHaveBeenCalledOnce();
    expect(options.shell.exitCanvas).toHaveBeenCalledOnce();
    expect(options.shell.reject).toHaveBeenCalledWith("拒绝原因");
  });

  it("delegates every direct image action", async () => {
    const options = capabilities();
    const target = image();
    await renderHarness(options);

    act(() => {
      latest?.execute({ type: "edit", image: target }, snapshot());
      latest?.execute({ type: "slice", image: target }, snapshot());
      latest?.execute({ type: "view-details", image: target }, snapshot());
      latest?.execute({ type: "save-as-template", image: target }, snapshot());
      latest?.execute({ type: "quick-share", image: target }, snapshot());
      latest?.execute({ type: "download-original", image: target }, snapshot());
      latest?.execute({ type: "remove-background", image: target }, snapshot());
      latest?.execute({ type: "switch-version", imageId: target.id, index: 2 }, snapshot());
    });

    expect(options.assets.editImage).toHaveBeenCalledWith(target);
    expect(options.assets.sliceImage).toHaveBeenCalledWith(target);
    expect(options.assets.viewImageDetails).toHaveBeenCalledWith(target);
    expect(options.assets.saveAsTemplate).toHaveBeenCalledWith(target);
    expect(options.assets.quickShareImage).toHaveBeenCalledWith([target]);
    expect(options.assets.downloadOriginal).toHaveBeenCalledWith(target.path);
    expect(options.assets.removeBackground).toHaveBeenCalledWith(target);
    expect(options.assets.switchVersion).toHaveBeenCalledWith(target.id, 2);
  });

  it("keeps copy-original success and failure notifications asynchronous", async () => {
    const success = capabilities();
    const target = image();
    await renderHarness(success);

    act(() => latest?.execute({ type: "copy-original", image: target }, snapshot()));
    expect(success.assets.notifyImageCopied).not.toHaveBeenCalled();
    await act(async () => Promise.resolve());
    expect(success.assets.copyImage).toHaveBeenCalledWith(target.dataUrl, "png");
    expect(success.assets.notifyImageCopied).toHaveBeenCalledOnce();

    const failure = capabilities();
    failure.assets.copyImage = vi.fn(() => Promise.reject(new Error("clipboard failed")));
    await renderHarness(failure);
    act(() => latest?.execute({ type: "copy-original", image: target }, snapshot()));
    await act(async () => Promise.resolve());
    expect(failure.assets.notifyImageCopyFailed).toHaveBeenCalledOnce();
  });

  it("returns a stable API that reads the latest capability set", async () => {
    const first = capabilities();
    const second = capabilities();
    await renderHarness(first);
    const initialApi = latest;
    await renderHarness(second);

    act(() => latest?.execute({ type: "focus-prompt" }, snapshot()));
    expect(latest).toBe(initialApi);
    expect(first.shell.focusPrompt).not.toHaveBeenCalled();
    expect(second.shell.focusPrompt).toHaveBeenCalledOnce();
  });
});
