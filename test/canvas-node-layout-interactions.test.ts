// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge, Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCanvasNodeLayoutInteractions,
  type CanvasNodeLayoutInteractions
} from "@/components/canvas/use-canvas-node-layout-interactions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasNodeLayoutInteractions | null = null;
let nodes: Node[] = [];
let edges: Edge[] = [];
let onBeforeCanvasChange = vi.fn();
let reportCanvasState = vi.fn();
let scheduleCanvasReport = vi.fn();
let updateNodes = vi.fn((updater: (current: readonly Node[]) => Node[]) => {
  nodes = updater(nodes);
});

function Harness({ zoom = 1 }: { zoom?: number }): React.ReactElement | null {
  latest = useCanvasNodeLayoutInteractions({
    getNodes: () => nodes,
    getEdges: () => edges,
    updateNodes,
    getZoom: () => zoom,
    onBeforeCanvasChange,
    reportCanvasState,
    scheduleCanvasReport
  });
  return null;
}

async function render(zoom = 1): Promise<void> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root?.render(createElement(Harness, { zoom })));
}

function node(id: string, x: number, y: number, selected = false): Node {
  return {
    id,
    type: "imageNode",
    position: { x, y },
    width: 120,
    height: 100,
    data: {},
    selected
  };
}

function dragEvent(altKey = false): never {
  return { altKey } as never;
}

beforeEach(() => {
  latest = null;
  nodes = [];
  edges = [];
  onBeforeCanvasChange = vi.fn();
  reportCanvasState = vi.fn();
  scheduleCanvasReport = vi.fn();
  updateNodes = vi.fn((updater: (current: readonly Node[]) => Node[]) => {
    nodes = updater(nodes);
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("canvas node layout interactions", () => {
  it("snaps a dragged node, records one history transaction, and clears transient state", async () => {
    const moving = node("moving", 10, 200, true);
    const target = node("target", 0, 0);
    nodes = [moving, target];
    await render();

    await act(async () => latest?.onNodeDragStart(dragEvent(), moving, [moving]));
    expect(latest?.draggingNodeIds).toEqual(new Set([moving.id]));
    expect(latest?.userPositionedNodeIds.has(moving.id)).toBe(true);

    const dragged = { ...moving, position: { x: 4, y: 200 } };
    await act(async () => latest?.onNodeDrag(dragEvent(), dragged, [dragged]));
    expect(nodes[0].position).toEqual({ x: 0, y: 200 });
    expect(latest?.helperLines.vertical).toEqual({ position: 60, start: -12, end: 312 });

    await act(async () => latest?.onNodeDragStop(dragEvent(), dragged, [dragged]));
    expect(onBeforeCanvasChange).toHaveBeenCalledOnce();
    expect(reportCanvasState).toHaveBeenCalledOnce();
    expect(latest?.draggingNodeIds.size).toBe(0);
    expect(latest?.helperLines).toEqual({ horizontal: null, vertical: null });
  });

  it("applies one snap offset to every moving node", async () => {
    const first = node("first", 10, 200, true);
    const second = node("second", 130, 200, true);
    nodes = [first, second, node("target", 0, 0)];
    await render();

    await act(async () => latest?.onNodeDragStart(dragEvent(), first, [first, second]));
    const dragged = [
      { ...first, position: { x: 4, y: 200 } },
      { ...second, position: { x: 124, y: 200 } }
    ];
    await act(async () => latest?.onNodeDrag(dragEvent(), dragged[0], dragged));

    expect(nodes.slice(0, 2).map((item) => item.position)).toEqual([
      { x: 0, y: 200 },
      { x: 120, y: 200 }
    ]);
  });

  it("clears guides and skips snapping while Alt is held", async () => {
    const moving = node("moving", 10, 200, true);
    nodes = [moving, node("target", 0, 0)];
    await render();
    await act(async () => latest?.onNodeDragStart(dragEvent(), moving, [moving]));
    const dragged = { ...moving, position: { x: 4, y: 200 } };
    await act(async () => latest?.onNodeDrag(dragEvent(), dragged, [dragged]));
    expect(latest?.helperLines.vertical).not.toBeNull();

    updateNodes.mockClear();
    await act(async () => latest?.onNodeDrag(dragEvent(true), dragged, [dragged]));

    expect(updateNodes).not.toHaveBeenCalled();
    expect(latest?.helperLines).toEqual({ horizontal: null, vertical: null });
  });

  it("converts the screen-space snap threshold using the current zoom", async () => {
    const moving = node("moving", 10, 200, true);
    nodes = [moving, node("target", 0, 0)];
    await render(2);
    await act(async () => latest?.onNodeDragStart(dragEvent(), moving, [moving]));

    const dragged = { ...moving, position: { x: 4, y: 200 } };
    await act(async () => latest?.onNodeDrag(dragEvent(), dragged, [dragged]));

    expect(updateNodes).not.toHaveBeenCalled();
    expect(latest?.helperLines.vertical).toBeNull();
  });

  it("does not create history for a click-only drag", async () => {
    const still = node("still", 10, 20, true);
    nodes = [still];
    await render();

    await act(async () => latest?.onNodeDragStart(dragEvent(), still, [still]));
    await act(async () => latest?.onNodeDragStop(dragEvent(), still, [still]));

    expect(onBeforeCanvasChange).not.toHaveBeenCalled();
    expect(reportCanvasState).toHaveBeenCalledOnce();
  });

  it("uses the explicit resize id instead of guessing from selection state", async () => {
    const selected = node("selected", 0, 0, true);
    const resized = { ...node("resized", 200, 0), resizing: false };
    nodes = [selected, resized];
    await render();

    await act(async () => latest?.onNodeResizeStart(resized.id));
    await act(async () => latest?.onNodeResizeEnd(resized.id, 180, 140));

    expect(onBeforeCanvasChange).toHaveBeenCalledOnce();
    expect(nodes[0]).toBe(selected);
    expect(nodes[1]).toMatchObject({
      id: resized.id,
      width: 180,
      height: 140,
      measured: { width: 180, height: 140 },
      resizing: false
    });
    expect(scheduleCanvasReport).toHaveBeenCalledOnce();
  });

  it("does not create resize history when the width is unchanged", async () => {
    const resized = node("resized", 0, 0);
    nodes = [resized];
    await render();

    await act(async () => latest?.onNodeResizeStart(resized.id));
    await act(async () => latest?.onNodeResizeEnd(resized.id, 120, 100));

    expect(onBeforeCanvasChange).not.toHaveBeenCalled();
    expect(scheduleCanvasReport).toHaveBeenCalledOnce();
  });

  it("starts with clean transient state after unmounting an active drag", async () => {
    const moving = node("moving", 10, 200, true);
    nodes = [moving, node("target", 0, 0)];
    await render();
    await act(async () => latest?.onNodeDragStart(dragEvent(), moving, [moving]));
    expect(latest?.draggingNodeIds.size).toBe(1);

    await act(async () => root?.unmount());
    root = createRoot(host!);
    await render();

    expect(latest?.draggingNodeIds.size).toBe(0);
    expect(latest?.helperLines).toEqual({ horizontal: null, vertical: null });
  });
});
