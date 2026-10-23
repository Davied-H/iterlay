// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Connection, Edge, Node } from "@xyflow/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  useCanvasMenuController,
  type CanvasMenuController
} from "@/components/canvas/use-canvas-menu-controller";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasMenuController | null = null;

function node(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function Harness(props: {
  commentMode: boolean;
  allowedCreateTypes?: readonly string[];
  getNodes: () => readonly Node[];
  getCanvasBounds: () => DOMRect | null;
  screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number };
  recordCanvasChange: () => void;
  createWorkflowNode?: (
    type: "canvas" | "text" | "generation" | "video-generation" | "comic-setting" | "comic-character" | "comic-segment-script",
    position: { x: number; y: number }
  ) => string | void;
  connect: (connection: Connection, options: { recordHistory: false; targetNodeType: string }) => boolean;
  duplicate: (nodes: Node[]) => void;
  deleteTargets: (nodes: Node[], connectionIds: string[]) => void | Promise<void>;
  notify: (level: "info" | "error", message: string) => void;
}): null {
  latest = useCanvasMenuController(props);
  return null;
}

async function renderHarness(overrides: Partial<Parameters<typeof Harness>[0]> = {}) {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  const capabilities = {
    commentMode: false,
    getNodes: vi.fn((): readonly Node[] => []),
    getCanvasBounds: vi.fn(() => ({
      x: 100, y: 50, top: 50, left: 100, right: 900, bottom: 650,
      width: 800, height: 600, toJSON: () => ({})
    })),
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    recordCanvasChange: vi.fn(),
    createWorkflowNode: vi.fn(() => "created-1"),
    connect: vi.fn(() => true),
    duplicate: vi.fn(),
    deleteTargets: vi.fn(),
    notify: vi.fn(),
    ...overrides
  };
  await act(async () => root?.render(createElement(Harness, capabilities)));
  return capabilities;
}

function contextEvent(x = 320, y = 180): {
  clientX: number;
  clientY: number;
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return { clientX: x, clientY: y, preventDefault: vi.fn() };
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  latest = null;
  vi.restoreAllMocks();
});

describe("canvas menu controller", () => {
  it("keeps a preview connected to the clamped menu until dismissal", async () => {
    const source = { ...node("image-1", "imageNode"), width: 200, height: 300 };
    const { recordCanvasChange, connect } = await renderHarness({ getNodes: () => [source] });

    act(() => latest?.openNodeCreateMenu(
      { x: 1200, y: 900 },
      { x: 600, y: 450 },
      { nodeId: source.id, side: "right" }
    ));

    expect(latest?.connectionPreview).toMatchObject({
      nodeId: source.id,
      side: "right",
      start: { x: 200, y: 150 },
      current: { x: 318, y: 278 },
      moved: true
    });
    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    act(() => latest?.nodeCreateMenu?.onClose());
    expect(latest?.connectionPreview).toBeNull();
  });

  it("clamps create-menu anchors and derives a default flow position", async () => {
    const { screenToFlowPosition } = await renderHarness();

    act(() => latest?.openNodeCreateMenu({ x: 1200, y: 900 }));

    expect(latest?.nodeCreateMenu).toMatchObject({
      anchor: { x: 536, y: 450 },
      types: ["codeCanvasNode", "textNode", "generationNode", "videoGenerationNode", "comicSettingNode", "comicCharacterNode", "comicSegmentNode"],
      title: "创建节点"
    });
    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 1200, y: 900 });
    expect(latest?.connectionPreview).toBeNull();
  });

  it("keeps comic-only node types out of a standard board create menu", async () => {
    await renderHarness({
      allowedCreateTypes: ["textNode", "generationNode", "videoGenerationNode"]
    });
    act(() => latest?.openNodeCreateMenu({ x: 300, y: 200 }));
    expect(latest?.nodeCreateMenu?.types).toEqual([
      "textNode",
      "generationNode",
      "videoGenerationNode"
    ]);
  });

  it("filters compatible targets for create-and-connect and rejects dead-end sources", async () => {
    const text = node("text-1", "textNode");
    const generation = node("generation-1", "generationNode");
    const { notify } = await renderHarness({ getNodes: () => [text, generation] });

    act(() => latest?.openNodeCreateMenu(
      { x: 300, y: 200 },
      { x: 50, y: 60 },
      { nodeId: text.id, side: "right" }
    ));
    expect(latest?.nodeCreateMenu).toMatchObject({
      types: ["textNode", "generationNode", "videoGenerationNode", "comicSettingNode", "comicCharacterNode", "comicSegmentNode"],
      title: "创建并连接节点"
    });

    act(() => latest?.openNodeCreateMenu(
      { x: 300, y: 200 },
      { x: 50, y: 60 },
      { nodeId: generation.id, side: "right" }
    ));
    expect(notify).toHaveBeenCalledWith("info", "当前节点没有可继续连接的节点类型。");
  });

  it("records, creates, and connects exactly once in transaction order", async () => {
    const source = node("text-1", "textNode");
    const { recordCanvasChange, createWorkflowNode, connect } = await renderHarness({
      getNodes: () => [source]
    });
    act(() => latest?.openNodeCreateMenu(
      { x: 300, y: 200 },
      { x: 75, y: 90 },
      { nodeId: source.id, side: "right" }
    ));

    act(() => latest?.nodeCreateMenu?.onCreate("generationNode"));

    expect(recordCanvasChange).toHaveBeenCalledOnce();
    expect(createWorkflowNode).toHaveBeenCalledWith("generation", { x: 75, y: 90 });
    expect(connect).toHaveBeenCalledWith({
      source: "text-1",
      target: "created-1",
      sourceHandle: "source-right",
      targetHandle: "target-left"
    }, { recordHistory: false, targetNodeType: "generationNode" });
    expect((recordCanvasChange as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (createWorkflowNode as Mock).mock.invocationCallOrder[0]
    );
    expect((createWorkflowNode as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (connect as Mock).mock.invocationCallOrder[0]
    );
  });

  it("connects a video source to the semantic reference-video input", async () => {
    const source = node("video-1", "videoNode");
    const { connect } = await renderHarness({ getNodes: () => [source] });
    act(() => latest?.openNodeCreateMenu(
      { x: 300, y: 200 },
      { x: 75, y: 90 },
      { nodeId: source.id, side: "right" }
    ));

    act(() => latest?.nodeCreateMenu?.onCreate("videoGenerationNode"));

    expect(connect).toHaveBeenCalledWith({
      source: "video-1",
      target: "created-1",
      sourceHandle: "source-right",
      targetHandle: "target-video-reference"
    }, { recordHistory: false, targetNodeType: "videoGenerationNode" });
  });

  it("revalidates the source before creation and reports an incompatible target", async () => {
    let nodes = [node("text-1", "textNode")];
    const { recordCanvasChange, createWorkflowNode, connect, notify } = await renderHarness({ getNodes: () => nodes });
    act(() => latest?.openNodeCreateMenu(
      { x: 300, y: 200 },
      { x: 75, y: 90 },
      { nodeId: "text-1", side: "right" }
    ));
    nodes = [];

    act(() => latest?.nodeCreateMenu?.onCreate("generationNode"));

    expect(notify).toHaveBeenCalledWith("error", "这个节点不能接收当前连接。");
    expect(recordCanvasChange).not.toHaveBeenCalled();
    expect(createWorkflowNode).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("opens node context actions and delegates copy and deletion", async () => {
    const target = node("image-1", "imageNode");
    const { duplicate, deleteTargets } = await renderHarness({ getNodes: () => [target] });
    const event = contextEvent();

    act(() => latest?.flowHandlers.onNodeContextMenu(event as never, target));
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(latest?.contextMenu).toMatchObject({
      anchor: { x: 320, y: 180 },
      target: "node"
    });
    act(() => latest?.contextMenu?.onCopy?.());
    act(() => latest?.contextMenu?.onDelete());
    expect(duplicate).toHaveBeenCalledWith([target]);
    expect(deleteTargets).toHaveBeenCalledWith([target], []);
  });

  it("opens connection context actions without exposing copy", async () => {
    const edge = { id: "edge-1", source: "a", target: "b" } as Edge;
    const { deleteTargets } = await renderHarness();
    const event = contextEvent(400, 260);

    act(() => latest?.flowHandlers.onEdgeContextMenu(event as never, edge));
    expect(latest?.contextMenu).toMatchObject({
      anchor: { x: 400, y: 260 },
      target: "connection",
      onCopy: undefined
    });
    act(() => latest?.contextMenu?.onDelete());
    expect(deleteTargets).toHaveBeenCalledWith([], ["edge-1"]);
  });

  it("does not open deletion actions for locked semantic connections", async () => {
    const edge = {
      id: "locked-edge",
      source: "setting",
      target: "character",
      deletable: false,
      data: { locked: true }
    } as Edge;
    const { deleteTargets, notify } = await renderHarness();
    const event = contextEvent();

    act(() => latest?.flowHandlers.onEdgeContextMenu(event as never, edge));

    expect(latest?.contextMenu).toBeNull();
    expect(deleteTargets).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("info", "这是漫剧的系统依赖连接，不能单独删除。");
  });

  it("opens only from pane double-clicks and blocks pane menus in comment mode", async () => {
    await renderHarness();
    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    const child = document.createElement("div");
    const doubleClick = (target: Element) => ({ target, clientX: 300, clientY: 200 }) as never;

    act(() => latest?.rootHandlers.onDoubleClick(doubleClick(child)));
    expect(latest?.nodeCreateMenu).toBeNull();
    act(() => latest?.rootHandlers.onDoubleClick(doubleClick(pane)));
    expect(latest?.nodeCreateMenu).not.toBeNull();

    act(() => latest?.nodeCreateMenu?.onClose());
    await renderHarness({ commentMode: true });
    const paneEvent = contextEvent();
    act(() => latest?.flowHandlers.onPaneContextMenu(paneEvent as never));
    expect(paneEvent.preventDefault).toHaveBeenCalledOnce();
    expect(latest?.nodeCreateMenu).toBeNull();
  });

  it("does not open creation UI when creation is unavailable", async () => {
    const { screenToFlowPosition } = await renderHarness({ createWorkflowNode: undefined });

    act(() => latest?.openNodeCreateMenu({ x: 300, y: 200 }));

    expect(latest?.nodeCreateMenu).toBeNull();
    expect(screenToFlowPosition).not.toHaveBeenCalled();
  });
});
