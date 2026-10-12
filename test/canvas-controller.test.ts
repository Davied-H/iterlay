// @vitest-environment jsdom

import { act, createElement, type MutableRefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge, Node } from "@xyflow/react";
import type { EdgeChange, NodeChange, Viewport } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCanvasDeleteShortcut } from "@/components/canvas/CanvasBoard";
import {
  createCanvasReportScheduler,
  useCanvasController
} from "@/components/canvas/CanvasController";
import type { BoardConnection, BoardViewport } from "@shared/types";
import type { CanvasNodeLayout } from "@/components/canvas/canvas-history";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type CanvasController = ReturnType<typeof useCanvasController>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasController | null = null;

interface HarnessProps {
  nodesRef: MutableRefObject<Node[]>;
  edgesRef: MutableRefObject<Edge[]>;
  onCanvasChange: (
    positions: Record<string, CanvasNodeLayout>,
    viewport: BoardViewport,
    connections: BoardConnection[]
  ) => void;
}

function Harness({ nodesRef, edgesRef, onCanvasChange }: HarnessProps): null {
  latest = useCanvasController({
    nodesRef,
    edgesRef,
    initialConnections: [],
    rightRailInset: 0,
    getViewport: (): Viewport => ({ x: 0, y: 0, zoom: 1 }),
    onCanvasChange
  });
  return null;
}

async function renderHarness(props: HarnessProps): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(createElement(Harness, props)));
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  latest = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function node(id: string, selected = false): Node {
  return { id, position: { x: 0, y: 0 }, data: {}, selected };
}

function edge(id: string, selected = false): Edge {
  return { id, source: "a", target: "b", selected };
}

describe("canvas report scheduler", () => {
  it("coalesces reports into one animation frame and can schedule the next frame", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    });
    const report = vi.fn();
    const scheduler = createCanvasReportScheduler(report, requestFrame, vi.fn());

    scheduler.schedule();
    scheduler.schedule();
    expect(requestFrame).toHaveBeenCalledOnce();

    callbacks.get(1)?.(16);
    expect(report).toHaveBeenCalledOnce();

    scheduler.schedule();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending report during cleanup", () => {
    const cancelFrame = vi.fn();
    const scheduler = createCanvasReportScheduler(vi.fn(), () => 42, cancelFrame);

    scheduler.schedule();
    scheduler.cancel();

    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(42);
  });
});

describe("canvas state refs", () => {
  it("synchronizes React Flow changes before another callback reports in the same batch", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const nodesRef = { current: [] as Node[] };
    const edgesRef = { current: [] as Edge[] };
    const onCanvasChange = vi.fn();
    await renderHarness({ nodesRef, edgesRef, onCanvasChange });
    const addedNode = node("node-1");
    const addNodeChanges: NodeChange<Node>[] = [{ type: "add", item: addedNode }];
    const moveNodeChanges: NodeChange<Node>[] = [{
      type: "position",
      id: addedNode.id,
      position: { x: 80, y: 40 },
      dragging: false
    }];
    const edgeChanges: EdgeChange<Edge>[] = [{
      type: "add",
      item: edge("edge-1")
    }];

    act(() => {
      latest?.onNodesChange(addNodeChanges);
      latest?.onNodesChange(moveNodeChanges);
      latest?.onEdgesChange(edgeChanges);
      latest?.reportCanvasState();
    });

    expect(nodesRef.current[0]?.position).toEqual({ x: 80, y: 40 });
    expect(edgesRef.current.map((current) => current.id)).toEqual(["edge-1"]);
    expect(onCanvasChange).toHaveBeenCalledWith(
      { "node-1": expect.objectContaining({ x: 80, y: 40 }) },
      { x: 0, y: 0, zoom: 1 },
      [expect.objectContaining({ id: "edge-1" })]
    );
  });
});

describe("canvas delete shortcut", () => {
  const event = {
    key: "Delete",
    defaultPrevented: false,
    isComposing: false,
    repeat: false
  };

  it("returns selected nodes and connections as one deletion transaction", () => {
    expect(resolveCanvasDeleteShortcut(event, {
      enabled: true,
      commentMode: false,
      editableTarget: false,
      nodes: [node("a", true), node("b")],
      edges: [edge("ab", true), edge("other")]
    })).toEqual({
      nodes: [node("a", true)],
      connectionIds: ["ab"]
    });
  });

  it("supports connection-only deletion", () => {
    expect(resolveCanvasDeleteShortcut({ ...event, key: "Backspace" }, {
      enabled: true,
      commentMode: false,
      editableTarget: false,
      nodes: [node("a")],
      edges: [edge("ab", true)]
    })).toEqual({ nodes: [], connectionIds: ["ab"] });
  });

  it.each([
    { enabled: false, commentMode: false, editableTarget: false, label: "disabled canvas" },
    { enabled: true, commentMode: true, editableTarget: false, label: "comment mode" },
    { enabled: true, commentMode: false, editableTarget: true, label: "editable target" }
  ])("ignores deletion in $label", ({ enabled, commentMode, editableTarget }) => {
    expect(resolveCanvasDeleteShortcut(event, {
      enabled,
      commentMode,
      editableTarget,
      nodes: [node("a", true)],
      edges: [edge("ab", true)]
    })).toBeNull();
  });

  it("ignores an event already handled by another overlay", () => {
    expect(resolveCanvasDeleteShortcut({ ...event, defaultPrevented: true }, {
      enabled: true,
      commentMode: false,
      editableTarget: false,
      nodes: [node("a", true)],
      edges: [edge("ab", true)]
    })).toBeNull();
  });
});
