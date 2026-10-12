// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge, Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasClipboardItem } from "@/components/canvas/canvas-clipboard";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import {
  useCanvasSelectionActions,
  type CanvasSelectionActionsController,
  type CanvasSelectionImageActions,
  type CanvasSelectionWorkflowActions
} from "@/components/canvas/use-canvas-selection-actions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasSelectionActionsController | null = null;
let nodes: Node[] = [];
let edges: Edge[] = [];
let imageActions: CanvasSelectionImageActions;
let workflowActions: CanvasSelectionWorkflowActions;
let recordCanvasChange = vi.fn();
let reportCanvasChange = vi.fn();
let updateNodes = vi.fn((updater: (current: readonly Node[]) => Node[]) => {
  nodes = updater(nodes);
});
let updateEdges = vi.fn((updater: (current: readonly Edge[]) => Edge[]) => {
  edges = updater(edges);
});

function Harness(): React.ReactElement | null {
  latest = useCanvasSelectionActions({
    nodes,
    referencedNodeIds: new Set(["referenced"]),
    getNodes: () => nodes,
    getEdges: () => edges,
    updateNodes,
    updateEdges,
    recordCanvasChange,
    reportCanvasChange,
    imageActions,
    workflowActions,
    createEdgeId: () => "duplicated-edge"
  });
  return null;
}

async function render(): Promise<void> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root?.render(createElement(Harness)));
}

function image(id: string, overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id,
    path: `${id}.png`,
    dataUrl: `data:${id}`,
    jobId: id,
    width: 100,
    height: 100,
    ...overrides
  };
}

function imageNode(value: GeneratedImage, x = 0, selected = true): Node {
  return {
    id: value.id,
    type: "imageNode",
    position: { x, y: 0 },
    width: 264,
    height: 264,
    selected,
    data: { image: value }
  };
}

function textNode(id: string, x = 0, selected = true): Node {
  return {
    id,
    type: "textNode",
    position: { x, y: 0 },
    width: 320,
    height: 272,
    selected,
    data: { text: id }
  };
}

function generationNode(id: string, x = 0, selected = true): Node {
  return {
    id,
    type: "generationNode",
    position: { x, y: 0 },
    width: 340,
    height: 320,
    selected,
    data: { prompt: id, model: "model", size: "1024x1024", count: 1 }
  };
}

function comicDramaEntryNode(id: string, selected = true): Node {
  return {
    id,
    type: "comicDramaEntryNode",
    position: { x: 0, y: 0 },
    width: 420,
    height: 304,
    selected,
    data: {
      node: {
        id,
        type: "comic-drama-entry",
        x: 0,
        y: 0,
        name: "未命名漫剧",
        childBoardId: `${id}-child`
      }
    }
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  latest = null;
  nodes = [];
  edges = [];
  imageActions = {
    duplicateImages: vi.fn(),
    requestDeleteImages: vi.fn(async () => true),
    useReferences: vi.fn(),
    downloadImages: vi.fn(),
    exportWechatImages: vi.fn(),
    canAddReferences: true
  };
  workflowActions = {
    createNode: vi.fn(),
    deleteNodes: vi.fn()
  };
  recordCanvasChange = vi.fn();
  reportCanvasChange = vi.fn();
  updateNodes = vi.fn((updater: (current: readonly Node[]) => Node[]) => {
    nodes = updater(nodes);
  });
  updateEdges = vi.fn((updater: (current: readonly Edge[]) => Edge[]) => {
    edges = updater(edges);
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("canvas selection actions", () => {
  it("duplicates supported nodes and only recreates workflow edges with both endpoints duplicated", async () => {
    const artwork = imageNode(image("image"), 10);
    const pending = imageNode(image("pending", { pending: true }), 20);
    const text = textNode("text", 100);
    const generation = generationNode("generation", 500);
    nodes = [artwork, pending, text, generation];
    edges = [
      { id: "internal", source: text.id, target: generation.id, selected: true },
      { id: "mixed", source: text.id, target: artwork.id }
    ];
    vi.mocked(workflowActions.createNode!).mockReturnValueOnce("text-copy").mockReturnValueOnce("generation-copy");
    await render();

    await act(async () => latest?.duplicateNodes(nodes));

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(imageActions.duplicateImages).toHaveBeenCalledWith([
      expect.objectContaining<Partial<CanvasClipboardItem>>({
        image: expect.objectContaining({ id: artwork.id }),
        width: 264,
        position: { x: 34, y: 24 }
      })
    ], "duplicate");
    expect(workflowActions.createNode).toHaveBeenNthCalledWith(1, "text", { x: 124, y: 24 }, { text: "text" });
    expect(workflowActions.createNode).toHaveBeenNthCalledWith(
      2,
      "generation",
      { x: 524, y: 24 },
      expect.objectContaining({ prompt: "generation" })
    );
    expect(edges).toEqual([
      expect.objectContaining({ id: "internal" }),
      expect.objectContaining({ id: "mixed" }),
      expect.objectContaining({
        id: "duplicated-edge",
        source: "text-copy",
        target: "generation-copy",
        selected: false
      })
    ]);
    expect(reportCanvasChange).toHaveBeenCalledOnce();
  });

  it("arranges selected images without moving selected workflow nodes", async () => {
    const first = imageNode(image("first"), 0);
    const second = imageNode(image("second"), 500);
    const workflow = textNode("text", 250);
    nodes = [first, second, workflow];
    await render();

    await act(async () => latest?.arrangeSelectedNodes("horizontal"));

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(nodes[0].position.x).toBeLessThan(nodes[1].position.x);
    expect(nodes[2]).toBe(workflow);
    expect(reportCanvasChange).toHaveBeenCalledOnce();
  });

  it("does nothing when asynchronous image deletion is cancelled", async () => {
    const artwork = imageNode(image("image"));
    const workflow = textNode("text");
    nodes = [artwork, workflow];
    edges = [{ id: "edge", source: workflow.id, target: artwork.id }];
    vi.mocked(imageActions.requestDeleteImages!).mockResolvedValue(false);
    await render();

    await expect(latest!.deleteNodes(nodes, ["edge"])).resolves.toBe(false);

    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(workflowActions.deleteNodes).not.toHaveBeenCalled();
    expect(updateEdges).not.toHaveBeenCalled();
    expect(edges).toHaveLength(1);
    expect(reportCanvasChange).not.toHaveBeenCalled();
  });

  it("records workflow and connection deletion exactly once", async () => {
    const workflow = textNode("text");
    nodes = [workflow];
    edges = [
      { id: "incident", source: workflow.id, target: "other" },
      { id: "selected", source: "other", target: "another" },
      { id: "kept", source: "other", target: "kept" }
    ];
    await render();

    await expect(latest!.deleteNodes([workflow], ["selected"])).resolves.toBe(true);

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(workflowActions.deleteNodes).toHaveBeenCalledWith([workflow.id]);
    expect(edges).toEqual([{ id: "kept", source: "other", target: "kept" }]);
    expect(reportCanvasChange).toHaveBeenCalledOnce();
  });

  it("deletes a confirmed comic drama entry and records it for undo and redo", async () => {
    const entry = comicDramaEntryNode("comic-entry");
    nodes = [entry];
    edges = [{ id: "incident", source: entry.id, target: "other" }];
    workflowActions.requestDeleteNodes = vi.fn(async () => true);
    await render();

    await expect(latest!.deleteNodes([entry])).resolves.toBe(true);

    expect(workflowActions.requestDeleteNodes).toHaveBeenCalledWith([entry.id]);
    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(workflowActions.deleteNodes).toHaveBeenCalledWith([entry.id]);
    expect(edges).toEqual([]);
    expect(reportCanvasChange).toHaveBeenCalledOnce();
  });

  it("keeps a comic drama entry when deletion confirmation is cancelled", async () => {
    const entry = comicDramaEntryNode("comic-entry");
    nodes = [entry];
    edges = [{ id: "incident", source: entry.id, target: "other" }];
    workflowActions.requestDeleteNodes = vi.fn(async () => false);
    await render();

    await expect(latest!.deleteNodes([entry])).resolves.toBe(false);

    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(workflowActions.deleteNodes).not.toHaveBeenCalled();
    expect(edges).toHaveLength(1);
    expect(reportCanvasChange).not.toHaveBeenCalled();
  });

  it("leaves image deletion history to the confirmed image capability", async () => {
    const artwork = imageNode(image("image"));
    nodes = [artwork];
    edges = [{ id: "incident", source: artwork.id, target: "other" }];
    await render();

    await expect(latest!.deleteNodes([artwork])).resolves.toBe(true);

    expect(imageActions.requestDeleteImages).toHaveBeenCalledWith([artwork.id]);
    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(edges).toEqual([]);
  });

  it("gates concurrent reference and download requests while exposing pending state", async () => {
    const ready = imageNode(image("ready"));
    const withoutPath = imageNode(image("without-path", { path: "" }));
    const pending = imageNode(image("pending", { pending: true }));
    nodes = [ready, withoutPath, pending];
    const referenceRequest = deferred();
    const downloadRequest = deferred();
    vi.mocked(imageActions.useReferences).mockReturnValue(referenceRequest.promise);
    vi.mocked(imageActions.downloadImages).mockReturnValue(downloadRequest.promise);
    await render();

    let referenceResult!: Promise<boolean>;
    await act(async () => {
      referenceResult = latest!.useSelectedReferences();
      expect(await latest!.useSelectedReferences()).toBe(false);
    });
    expect(latest?.isAddingReferences).toBe(true);
    expect(imageActions.useReferences).toHaveBeenCalledOnce();
    expect(imageActions.useReferences).toHaveBeenCalledWith([ready.data.image, withoutPath.data.image]);

    await act(async () => {
      referenceRequest.resolve();
      await referenceResult;
    });
    expect(latest?.isAddingReferences).toBe(false);

    let downloadResult!: Promise<boolean>;
    await act(async () => {
      downloadResult = latest!.downloadSelectedImages();
      expect(await latest!.downloadSelectedImages()).toBe(false);
    });
    expect(latest?.isDownloading).toBe(true);
    expect(imageActions.downloadImages).toHaveBeenCalledWith([ready.data.image]);
    await act(async () => {
      downloadRequest.resolve();
      await downloadResult;
    });
    expect(latest?.isDownloading).toBe(false);
  });

  it("exports only ready persisted images and exposes the shared selection model", async () => {
    const ready = imageNode(image("ready"));
    const referenced = imageNode(image("referenced"));
    const withoutPath = imageNode(image("without-path", { path: "" }));
    const pending = imageNode(image("pending", { pending: true }));
    nodes = [ready, referenced, withoutPath, pending];
    await render();

    expect(latest?.selection.selectedReadyCount).toBe(3);
    expect(latest?.selection.selectedReferenceCandidateCount).toBe(2);
    expect(latest?.exportWechatSelectedImages()).toBe(true);
    expect(imageActions.exportWechatImages).toHaveBeenCalledWith([ready.data.image, referenced.data.image]);
  });
});
