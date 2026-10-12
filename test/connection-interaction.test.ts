import { describe, expect, it } from "vitest";
import {
  addConnectionWaypoint,
  connectionBridgeGapPath,
  connectionBridgePath,
  createConnectionGeometry,
  hasConnectionDragIntent,
  lockConnectionDelta,
  midpoint,
  moveConnectionWaypoint,
  moveOrthogonalConnectionSegment,
  pointAtConnectionLabel,
  projectConnectionLabel,
  removeConnectionWaypoint,
  resolveConnectionDirectDragMode,
  resolveConnectionEscapeAction,
  resolveConnectionGestureModifiers,
  resolveConnectionPointerSelection,
  resolveConnectionWaypointDragPosition,
  snapConnectionPoint
} from "@/components/canvas/connection-interaction";

const source = { x: 0, y: 0 };
const target = { x: 100, y: 100 };

describe("connection interaction geometry", () => {
  it("creates editable orthogonal segments for an automatic route", () => {
    const geometry = createConnectionGeometry({
      source,
      target,
      sourceSide: "right",
      targetSide: "left",
      routing: { mode: "auto", kind: "orthogonal", waypoints: [] }
    });
    expect(geometry.points).toHaveLength(4);
    expect(geometry.segments.map((segment) => segment.orientation)).toEqual([
      "horizontal",
      "vertical",
      "horizontal"
    ]);
  });

  it("moves a middle segment only on its perpendicular axis", () => {
    const geometry = createConnectionGeometry({
      source,
      target,
      routing: {
        mode: "manual",
        kind: "orthogonal",
        waypoints: [
          { id: "a", x: 50, y: 0 },
          { id: "b", x: 50, y: 100 }
        ]
      }
    });
    const moved = moveOrthogonalConnectionSegment(geometry, 1, { x: 20, y: 80 }, (role) => `new-${role}`);
    expect(moved).toEqual([
      { id: "a", x: 70, y: 0 },
      { id: "b", x: 70, y: 100 }
    ]);
  });

  it("inserts a dogleg when moving a segment attached to a bound endpoint", () => {
    const geometry = createConnectionGeometry({
      source,
      target,
      routing: {
        mode: "manual",
        kind: "orthogonal",
        waypoints: [
          { id: "a", x: 50, y: 0 },
          { id: "b", x: 50, y: 100 }
        ]
      }
    });
    const moved = moveOrthogonalConnectionSegment(geometry, 0, { x: 60, y: 20 }, (role) => `new-${role}`);
    expect(moved[0]).toEqual({ id: "new-source", x: 0, y: 20 });
    expect(moved[1]).toEqual({ id: "a", x: 50, y: 20 });
    expect(source).toEqual({ x: 0, y: 0 });
  });

  it("adds, moves, axis-locks, snaps, and removes waypoints", () => {
    const geometry = createConnectionGeometry({
      source,
      target,
      routing: { mode: "manual", kind: "orthogonal", waypoints: [] }
    });
    const center = midpoint(geometry.segments[0].start, geometry.segments[0].end);
    const added = addConnectionWaypoint(geometry, 0, center, "manual-1");
    expect(added[0]).toMatchObject({ id: "manual-1", ...center });
    expect(moveConnectionWaypoint(added, "manual-1", { x: 7, y: 2 }, true)[0]).toMatchObject({
      x: center.x + 7,
      y: center.y
    });
    expect(lockConnectionDelta({ x: 2, y: -8 }, true)).toEqual({ x: 0, y: -8 });
    expect(snapConnectionPoint({ x: 14, y: 19 }, 8, false)).toEqual({ x: 16, y: 16 });
    expect(snapConnectionPoint({ x: 14, y: 19 }, 8, true)).toEqual({ x: 14, y: 19 });
    expect(removeConnectionWaypoint(added, "manual-1")).toEqual(added.filter((item) => item.id !== "manual-1"));
  });

  it("anchors labels to a stable segment and local progress", () => {
    const geometry = createConnectionGeometry({
      source,
      target,
      routing: {
        mode: "manual",
        kind: "orthogonal",
        waypoints: [
          { id: "a", x: 60, y: 0 },
          { id: "b", x: 60, y: 100 }
        ]
      }
    });
    const anchor = projectConnectionLabel(geometry.segments, { x: 62, y: 75 });
    expect(anchor.segmentId).toBe("a::b");
    expect(anchor.progress).toBeCloseTo(0.75);
    expect(pointAtConnectionLabel(geometry.segments, anchor)).toEqual({ x: 60, y: 75 });
  });

  it("uses a four-pixel drag threshold and emits bridge geometry", () => {
    expect(hasConnectionDragIntent({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(false);
    expect(hasConnectionDragIntent({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(connectionBridgePath({ point: { x: 10, y: 20 }, orientation: "horizontal", radius: 4 }))
      .toBe("M 6 20 Q 10 14.6 14 20");
    expect(connectionBridgeGapPath({ point: { x: 10, y: 20 }, orientation: "horizontal", radius: 4 }))
      .toBe("M 6 20 L 14 20");
  });

  it("lets every route kind start a direct drag from its visible line", () => {
    expect(resolveConnectionDirectDragMode("orthogonal", "horizontal")).toBe("move-segment");
    expect(resolveConnectionDirectDragMode("orthogonal", "vertical")).toBe("move-segment");
    expect(resolveConnectionDirectDragMode("orthogonal", "diagonal")).toBe("insert-waypoint");
    expect(resolveConnectionDirectDragMode("straight", "horizontal")).toBe("insert-waypoint");
    expect(resolveConnectionDirectDragMode("straight", "vertical")).toBe("insert-waypoint");
    expect(resolveConnectionDirectDragMode("straight", "diagonal")).toBe("insert-waypoint");
    expect(resolveConnectionDirectDragMode("curved", "diagonal")).toBe("insert-waypoint");
  });

  it("keeps Shift axis locking separate from Cmd/Ctrl snap bypass and additive selection", () => {
    expect(resolveConnectionGestureModifiers({ shiftKey: true, metaKey: false, ctrlKey: false })).toEqual({
      additiveSelection: true,
      bypassSnap: false,
      lockAxis: true
    });
    expect(resolveConnectionGestureModifiers({ shiftKey: false, metaKey: true, ctrlKey: false })).toEqual({
      additiveSelection: true,
      bypassSnap: true,
      lockAxis: false
    });
    expect(resolveConnectionGestureModifiers({ shiftKey: false, metaKey: false, ctrlKey: true })).toEqual({
      additiveSelection: true,
      bypassSnap: true,
      lockAxis: false
    });
    expect(resolveConnectionGestureModifiers({ shiftKey: false, metaKey: false, ctrlKey: false })).toEqual({
      additiveSelection: false,
      bypassSnap: false,
      lockAxis: false
    });
  });

  it("does not snap the stationary axis while Shift-locking a waypoint drag", () => {
    expect(resolveConnectionWaypointDragPosition({
      origin: { x: 10, y: 11 },
      delta: { x: 13, y: 4 },
      gridSize: 8,
      lockAxis: true,
      bypassSnap: false
    })).toEqual({ x: 24, y: 11 });
    expect(resolveConnectionWaypointDragPosition({
      origin: { x: 10, y: 11 },
      delta: { x: 13, y: 4 },
      gridSize: 8,
      lockAxis: false,
      bypassSnap: true
    })).toEqual({ x: 23, y: 15 });
  });

  it("adds an unselected edge without toggling an already-selected edge out of a multi-selection", () => {
    const additive = { shiftKey: true, metaKey: false, ctrlKey: false };
    expect(resolveConnectionPointerSelection(false, additive)).toEqual({ additive: true, shouldSelect: true });
    expect(resolveConnectionPointerSelection(true, additive)).toEqual({ additive: true, shouldSelect: false });
    expect(resolveConnectionPointerSelection(true, {
      shiftKey: false,
      metaKey: false,
      ctrlKey: false
    })).toEqual({ additive: false, shouldSelect: true });
  });

  it("defers Escape to an active connection gesture before clearing selection", () => {
    expect(resolveConnectionEscapeAction({ gestureActive: true, hasSelection: true }))
      .toBe("defer-to-gesture");
    expect(resolveConnectionEscapeAction({ gestureActive: false, hasSelection: true }))
      .toBe("clear-selection");
    expect(resolveConnectionEscapeAction({ gestureActive: false, hasSelection: false }))
      .toBe("exit-canvas");
  });
});
