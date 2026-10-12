import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { resolveCanvasZoomTier } from "@/components/canvas/ImageNode";
import type { GeneratedImage } from "@/components/canvas/ImageNode";
import {
  canvasPlacementGapAfterAnchorType,
  shallowCanvasNodeDataEqual,
  canvasSelectionSnapshot,
  connectionSelectionCommandChanges,
  preventMiddleMouseAutoScroll,
  resolveNewPlacement,
  settleCompletedNodePosition
} from "@/components/canvas/CanvasBoard";
import { canvasNodeLayoutsChanged } from "@/components/canvas/canvas-history";
import { shouldAnimateVersionPreview } from "@/components/canvas/VersionSeparationCanvas";

function image(id: string, width: number, height: number): GeneratedImage {
  return { id, path: `${id}.png`, dataUrl: `data:${id}`, jobId: id, width, height };
}

function node(id: string, x: number, y: number, value: GeneratedImage): Node {
  return {
    id,
    type: "imageNode",
    position: { x, y },
    data: { image: value }
  };
}

describe("canvas render performance guards", () => {
  it("passes the minimap preference through a stable CanvasBoard callback", () => {
    const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(appSource).toContain(
      "const handleCanvasMinimapVisibleChange = useStableCallback(changeCanvasMinimapVisible);"
    );
    expect(appSource).toContain("onShowMinimapChange={handleCanvasMinimapVisibleChange}");
    expect(appSource).toContain("visibleCount: DEFAULT_BOARD_ENTRY_VISIBLE_PRELOAD_LIMIT");
    expect(appSource).toContain(
      "const handleCreateWorkflowNode = useStableCallback(createWorkflowNode);"
    );
  });

  it("reprojects externally mutated connections when their revision changes", () => {
    const boardSource = readFileSync(
      new URL("../src/components/canvas/CanvasBoard.tsx", import.meta.url),
      "utf8"
    );

    expect(boardSource).toContain(
      "initialConnectionsRevisionRef.current === connectionRevision"
    );
    expect(boardSource).toContain(
      "initialConnectionsRevisionRef.current = connectionRevision;"
    );
    expect(boardSource).toContain(
      "[connectionRevision, initialConnections, nodes.length, setEdges]"
    );
    expect(boardSource).not.toContain("void connectionRevision;");
  });

  it("gives generated artwork more breathing room than ordinary linked nodes", () => {
    expect(canvasPlacementGapAfterAnchorType("generationNode")).toBe(192);
    expect(canvasPlacementGapAfterAnchorType("imageNode")).toBe(40);
  });

  it("reuses workflow node data when values and callbacks are unchanged", () => {
    const onChange = vi.fn();
    const previous = { text: "内容", onChange };

    expect(shallowCanvasNodeDataEqual(previous, { text: "内容", onChange })).toBe(true);
    expect(shallowCanvasNodeDataEqual(previous, { text: "新内容", onChange })).toBe(false);
  });

  it("does not treat a click-only drag or unchanged resize as a layout change", () => {
    const unchanged = node("still", 10, 20, image("still", 100, 100));
    unchanged.width = 264;
    const snapshot = canvasSelectionSnapshot([unchanged]);

    expect(canvasNodeLayoutsChanged(snapshot, [unchanged], new Set(["still"]))).toBe(false);
    expect(canvasNodeLayoutsChanged(snapshot, [{ ...unchanged, position: { x: 11, y: 20 } }], new Set(["still"]))).toBe(true);
  });

  it("suppresses native middle-click autoscroll without affecting other buttons", () => {
    const preventDefault = vi.fn();

    preventMiddleMouseAutoScroll({ button: 1, preventDefault });
    preventMiddleMouseAutoScroll({ button: 0, preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("keeps image LOD stable around zoom thresholds", () => {
    expect(resolveCanvasZoomTier(0.5)).toBe("medium");
    expect(resolveCanvasZoomTier(0.49, "medium")).toBe("medium");
    expect(resolveCanvasZoomTier(0.44, "medium")).toBe("low");
    expect(resolveCanvasZoomTier(0.52, "low")).toBe("low");
    expect(resolveCanvasZoomTier(0.56, "low")).toBe("medium");
    expect(resolveCanvasZoomTier(0.98, "full")).toBe("full");
    expect(resolveCanvasZoomTier(0.91, "full")).toBe("medium");
    expect(resolveCanvasZoomTier(1.02, "medium")).toBe("medium");
    expect(resolveCanvasZoomTier(1.06, "medium")).toBe("full");
    expect(resolveCanvasZoomTier(1.2, "low")).toBe("full");
    expect(resolveCanvasZoomTier(0.2, "full")).toBe("low");
  });

  it("stops version preview frames after finite animations settle", () => {
    expect(shouldAnimateVersionPreview(200, 0, null, false)).toBe(true);
    expect(shouldAnimateVersionPreview(500, 0, null, false)).toBe(false);
    expect(shouldAnimateVersionPreview(700, 0, 500, false)).toBe(true);
    expect(shouldAnimateVersionPreview(1_000, 0, 500, false)).toBe(false);
    expect(shouldAnimateVersionPreview(1_000, 0, null, true)).toBe(true);
  });

  it("keeps a completed node at its placeholder position when its final size does not collide", () => {
    const position = { x: 0, y: 0 };
    const settled = settleCompletedNodePosition(
      position,
      image("completed", 1024, 2048),
      [node("other", 400, 0, image("other", 1024, 1024))]
    );

    expect(settled).toBe(position);
  });

  it("moves a taller completed node vertically when its new height overlaps another node", () => {
    const settled = settleCompletedNodePosition(
      { x: 0, y: 0 },
      image("completed", 1024, 2048),
      [node("other", 0, 300, image("other", 1024, 1024))]
    );

    expect(settled.x).toBe(0);
    expect(settled.y).not.toBe(0);
  });

  it("applies a new explicit placement to an existing separated version only once", () => {
    const previous = image("version-stack", 1024, 1024);
    const placed = { ...previous, placementPosition: { x: 120, y: 360 } };

    expect(resolveNewPlacement(previous, placed)).toEqual({ x: 120, y: 360 });
    expect(resolveNewPlacement(placed, { ...placed })).toBeNull();
  });

  it("captures resized widths in undo and persistence snapshots", () => {
    const resized = {
      ...node("resized", 12, 24, image("resized", 100, 50)),
      width: 480,
      height: 240,
      selected: true
    };

    expect(canvasSelectionSnapshot([resized])).toEqual({
      positions: { resized: { x: 12, y: 24, width: 480, height: 240 } },
      selectedIds: ["resized"]
    });
  });

  it("recovers an invalid measured width instead of persisting an invisible node", () => {
    const collapsed = {
      ...node("collapsed", 12, 24, image("collapsed", 100, 50)),
      width: 2,
      height: 1
    };

    expect(canvasSelectionSnapshot([collapsed]).positions.collapsed.width).toBe(264);
    expect(canvasSelectionSnapshot([collapsed]).positions.collapsed.height).toBe(1);
  });

  it("captures connection routing and selection in an isolated undo snapshot", () => {
    const routing = {
      mode: "manual" as const,
      kind: "orthogonal" as const,
      waypoints: [{ id: "waypoint-1", x: 120, y: 80 }]
    };
    const edge: Edge = {
      id: "edge-1",
      source: "source",
      target: "target",
      selected: true,
      data: {
        sourceAnchor: { side: "right", ratio: 0.25, mode: "pinned" },
        targetAnchor: 0.75,
        label: "依赖",
        labelAnchor: { segmentId: "segment-1", progress: 0.4 },
        routing,
        style: { color: "#2563eb", width: 3, endMarker: "arrow" }
      }
    };

    const snapshot = canvasSelectionSnapshot([], [edge]);
    routing.waypoints[0].x = 999;

    expect(snapshot.selectedConnectionIds).toEqual(["edge-1"]);
    expect(snapshot.connections).toEqual([expect.objectContaining({
      id: "edge-1",
      sourceAnchor: { side: "right", ratio: 0.25, mode: "pinned" },
      targetAnchor: 0.75,
      labelAnchor: { segmentId: "segment-1", progress: 0.4 },
      routing: expect.objectContaining({
        mode: "manual",
        waypoints: [{ id: "waypoint-1", x: 120, y: 80 }]
      })
    })]);
  });

  it("does not create connection history for no-op selection commands", () => {
    const manual = {
      routing: {
        mode: "manual" as const,
        kind: "orthogonal" as const,
        waypoints: [{ id: "bend", x: 80, y: 40 }]
      },
      style: { color: "#2563eb", width: 2.5 }
    };

    expect(connectionSelectionCommandChanges({}, { type: "set-routing-kind", kind: "orthogonal" })).toBe(false);
    expect(connectionSelectionCommandChanges(manual, { type: "set-routing-kind", kind: "orthogonal" })).toBe(false);
    expect(connectionSelectionCommandChanges(manual, { type: "set-style", style: { color: "#2563eb" } })).toBe(false);
    expect(connectionSelectionCommandChanges(manual, { type: "set-routing-kind", kind: "curved" })).toBe(true);
    expect(connectionSelectionCommandChanges(manual, { type: "reset-routing" })).toBe(true);
    expect(connectionSelectionCommandChanges({ routeCoordinate: 40 }, { type: "reset-routing" })).toBe(true);
  });
});
