import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTO_ANCHOR_ALIGNMENT_THRESHOLD,
  alignAutoConnectionEndpoints,
  collapseConnectionWaypoints,
  connectionEndpointGapPx,
  connectionEndpointLead,
  deleteConnectionWaypoint,
  insertConnectionWaypoint,
  migrateLegacyConnectionRouting,
  moveConnectionSegment,
  moveConnectionWaypoint,
  normalizeConnectionRouting,
  reanchorConnectionLabel,
  resolveConnectionLabelAnchor,
  resolveConnectionRoute,
  routeConnectionAvoidingObstacles,
  type ConnectionPoint
} from "@/components/canvas/connection-routing";

describe("connection endpoint trigger clearance", () => {
  it("shortens a centered endpoint around the connection trigger", () => {
    expect(connectionEndpointGapPx(160, 0.5, 1)).toBe(28);
    expect(connectionEndpointGapPx(160, 0.375, 1)).toBe(10);
  });

  it("uses screen-space distance at different zoom levels", () => {
    expect(connectionEndpointGapPx(160, 0.45, 1)).toBeGreaterThan(10);
    expect(connectionEndpointGapPx(160, 0.45, 2)).toBe(10);
  });
});

describe("automatic connection anchor alignment", () => {
  it("covers the observed six-pixel near-alignment case in flow coordinates", () => {
    expect(DEFAULT_AUTO_ANCHOR_ALIGNMENT_THRESHOLD).toBe(8);
    const nodeHeight = 1822 * 264 / 863;
    const sourceY = 384.6273746 + nodeHeight / 2;
    const targetY = 391.1842945 + nodeHeight / 2;
    const resolved = alignAutoConnectionEndpoints({
      source: { x: 264, y: sourceY, side: "right" },
      target: { x: 400, y: targetY, side: "left" },
      sourceAnchorMode: "auto",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 384.6273746, max: 384.6273746 + nodeHeight },
      targetAnchorRange: { min: 391.1842945, max: 391.1842945 + nodeHeight }
    });

    expect(targetY - sourceY).toBeCloseTo(6.5569199);
    expect(resolved.aligned).toBe(true);
    expect(resolved.source.y).toBe(resolved.target.y);
  });

  it("preserves the source anchor when it can align inside the target side", () => {
    const resolved = alignAutoConnectionEndpoints({
      source: { x: 100, y: 96, side: "right" },
      target: { x: 240, y: 102, side: "left" },
      sourceAnchorMode: "auto",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 40, max: 160 },
      targetAnchorRange: { min: 60, max: 180 }
    });

    expect(resolved).toEqual({
      source: { x: 100, y: 96, side: "right" },
      target: { x: 240, y: 96, side: "left" },
      aligned: true
    });
    expect(resolveConnectionRoute({ source: resolved.source, target: resolved.target }).path)
      .toBe("M 100 96 L 240 96");
  });

  it("moves only the auto anchor when the opposite anchor is pinned", () => {
    const target = { x: 240, y: 104, side: "left" as const };
    const resolved = alignAutoConnectionEndpoints({
      source: { x: 100, y: 98, side: "right" },
      target,
      sourceAnchorMode: "auto",
      targetAnchorMode: "pinned",
      sourceAnchorRange: { min: 40, max: 160 },
      targetAnchorRange: { min: 60, max: 180 }
    });

    expect(resolved.source).toEqual({ x: 100, y: 104, side: "right" });
    expect(resolved.target).toBe(target);
    expect(resolved.aligned).toBe(true);
  });

  it("keeps a pinned source fixed while aligning an auto target", () => {
    const source = { x: 100, y: 98, side: "right" as const };
    const resolved = alignAutoConnectionEndpoints({
      source,
      target: { x: 240, y: 104, side: "left" },
      sourceAnchorMode: "pinned",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 40, max: 160 },
      targetAnchorRange: { min: 60, max: 180 }
    });

    expect(resolved.source).toBe(source);
    expect(resolved.target).toEqual({ x: 240, y: 98, side: "left" });
    expect(resolved.aligned).toBe(true);
  });

  it("aligns distant auto anchors when their opposite node sides overlap", () => {
    const source = { x: 100, y: 90, side: "right" as const };
    const target = { x: 240, y: 150, side: "left" as const };
    const resolved = alignAutoConnectionEndpoints({
      source,
      target,
      sourceAnchorMode: "auto",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 40, max: 160 },
      targetAnchorRange: { min: 60, max: 180 }
    });

    expect(resolved).toEqual({
      source,
      target: { x: 240, y: 90, side: "left" },
      aligned: true
    });
  });

  it("uses the nearest shared boundary when neither auto center reaches the opposite side", () => {
    const resolved = alignAutoConnectionEndpoints({
      source: { x: 100, y: 220, side: "right" },
      target: { x: 240, y: 80, side: "left" },
      sourceAnchorMode: "auto",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 180, max: 260 },
      targetAnchorRange: { min: 40, max: 200 }
    });

    expect(resolved).toEqual({
      source: { x: 100, y: 180, side: "right" },
      target: { x: 240, y: 180, side: "left" },
      aligned: true
    });
  });

  it("keeps distant anchors unchanged when opposite side ranges do not overlap", () => {
    const source = { x: 100, y: 90, side: "right" as const };
    const target = { x: 240, y: 210, side: "left" as const };
    const resolved = alignAutoConnectionEndpoints({
      source,
      target,
      sourceAnchorMode: "auto",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 40, max: 140 },
      targetAnchorRange: { min: 180, max: 260 }
    });

    expect(resolved).toEqual({ source, target, aligned: false });
  });

  it("aligns opposite top and bottom auto anchors vertically", () => {
    const resolved = alignAutoConnectionEndpoints({
      source: { x: 196, y: 200, side: "bottom" },
      target: { x: 202, y: 340, side: "top" },
      sourceAnchorMode: "auto",
      targetAnchorMode: "auto",
      sourceAnchorRange: { min: 120, max: 280 },
      targetAnchorRange: { min: 140, max: 300 }
    });

    expect(resolved.source).toEqual({ x: 196, y: 200, side: "bottom" });
    expect(resolved.target).toEqual({ x: 196, y: 340, side: "top" });
    expect(resolveConnectionRoute({ source: resolved.source, target: resolved.target }).path)
      .toBe("M 196 200 L 196 340");
  });

  it("does not move two pinned anchors", () => {
    const source = { x: 100, y: 98, side: "right" as const };
    const target = { x: 240, y: 102, side: "left" as const };
    const resolved = alignAutoConnectionEndpoints({
      source,
      target,
      sourceAnchorMode: "pinned",
      targetAnchorMode: "pinned",
      sourceAnchorRange: { min: 40, max: 160 },
      targetAnchorRange: { min: 60, max: 180 }
    });

    expect(resolved).toEqual({ source, target, aligned: false });
  });
});

describe("connection routing persistence", () => {
  it("sanitizes malformed values and deterministically repairs waypoint ids", () => {
    const malformed = {
      mode: "unexpected",
      kind: "orthogonal",
      waypoints: [
        { id: "corner", x: 10, y: 20 },
        { id: "corner", x: 30, y: 20 },
        { id: "invalid", x: Number.NaN, y: 5 },
        null
      ]
    };

    expect(normalizeConnectionRouting(malformed)).toEqual({
      mode: "auto",
      kind: "orthogonal",
      waypoints: [
        { id: "corner", x: 10, y: 20 },
        { id: "corner-2", x: 30, y: 20 }
      ]
    });
    expect(normalizeConnectionRouting(malformed)).toEqual(normalizeConnectionRouting(malformed));
  });

  it("migrates a legacy route coordinate without changing its visual route", () => {
    const routing = migrateLegacyConnectionRouting(
      undefined,
      60,
      { x: 20, y: 10, side: "bottom" },
      { x: 140, y: 120, side: "top" }
    );

    expect(routing).toEqual({
      mode: "manual",
      kind: "orthogonal",
      waypoints: [
        { id: "legacy-source-route", x: 20, y: 60 },
        { id: "legacy-target-route", x: 140, y: 60 }
      ]
    });
    expect(resolveConnectionRoute({
      source: { x: 20, y: 10, side: "bottom" },
      target: { x: 140, y: 120, side: "top" },
      routeCoordinate: 60
    }).path).toBe("M 20 10 L 20 60 L 140 60 L 140 120");
  });

  it.each([
    ["straight", "M 0 0 L 100 100"],
    ["curved", "M 0 0 Q 50 0 100 100"],
    ["orthogonal", "M 0 0 L 50 0 L 50 100 L 100 100"]
  ] as const)("resolves %s routes", (kind, expectedPath) => {
    const route = resolveConnectionRoute({
      source: { x: 0, y: 0, side: "right" },
      target: { x: 100, y: 100, side: "left" },
      routing: { mode: "manual", kind, waypoints: [{ id: "middle", x: 50, y: 0 }] }
    });

    expect(route.path).toBe(expectedPath);
  });

  it("keeps outward endpoint leads when aligned ports face incompatible directions", () => {
    const route = resolveConnectionRoute({
      source: { x: 0, y: 0, side: "right" },
      target: { x: 100, y: 0, side: "right" }
    });

    expect(connectionEndpointLead({ x: 100, y: 0, side: "right" }, 16)).toEqual({ x: 116, y: 0 });
    expect(route.points[1].x).toBeGreaterThan(0);
    expect(route.points.at(-2)?.x).toBeGreaterThan(100);
    expect(route.points.some((point) => point.y !== 0)).toBe(true);
  });

  it("enters a left target horizontally after automatic routing", () => {
    const route = resolveConnectionRoute({
      source: { x: 0, y: 0, side: "right" },
      target: { x: 160, y: 80, side: "left" }
    });
    const finalSegment = route.segments.at(-1);

    expect(finalSegment?.axis).toBe("x");
    expect(finalSegment?.start.y).toBe(80);
    expect(finalSegment?.start.x).toBeLessThan(160);
    expect(finalSegment?.end).toMatchObject({ x: 160, y: 80, role: "target" });
  });
});

describe("connection waypoint editing", () => {
  const route = resolveConnectionRoute({
    source: { x: 0, y: 0, side: "bottom" },
    target: { x: 100, y: 100, side: "top" },
    routing: {
      mode: "manual",
      kind: "orthogonal",
      waypoints: [
        { id: "a", x: 0, y: 40 },
        { id: "b", x: 100, y: 40 }
      ]
    }
  });

  it("inserts, moves and deletes stable waypoints", () => {
    const middle = route.segments[1];
    const inserted = insertConnectionWaypoint(route.routing, route, middle.id, { x: 60, y: 55 }, "new");
    expect(inserted.waypoints[1]).toEqual({ id: "new", x: 60, y: 40 });

    const moved = moveConnectionWaypoint(inserted, "new", { x: 65, y: 70 });
    expect(moved.waypoints[1]).toEqual({ id: "new", x: 65, y: 70 });
    expect(deleteConnectionWaypoint(moved, "new").waypoints.map((point) => point.id)).toEqual(["a", "b"]);
  });

  it("materializes a visible manual waypoint when directly dragging an automatic curve", () => {
    const curved = resolveConnectionRoute({
      source: { x: 150, y: 390, side: "bottom" },
      target: { x: 340, y: 540, side: "left" },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    });
    const inserted = insertConnectionWaypoint(
      curved.routing,
      curved,
      curved.segments[0].id,
      { x: 184, y: 430 },
      "dragged-curve"
    );
    const resolved = resolveConnectionRoute({
      source: { x: 150, y: 390, side: "bottom" },
      target: { x: 340, y: 540, side: "left" },
      routing: inserted
    });

    expect(inserted.mode).toBe("manual");
    expect(inserted.waypoints.some((waypoint) => waypoint.id === "dragged-curve")).toBe(true);
    expect(resolved.path).not.toBe(curved.path);
  });

  it("moves an inner segment on one axis", () => {
    const moved = moveConnectionSegment(route.routing, route, route.segments[1].id, 70);
    expect(moved.waypoints).toEqual([
      { id: "a", x: 0, y: 70 },
      { id: "b", x: 100, y: 70 }
    ]);
  });

  it("keeps materialized waypoint ids stable across repeated segment edits", () => {
    const automatic = resolveConnectionRoute({
      source: { x: 0, y: 0, side: "right" },
      target: { x: 100, y: 100, side: "left" }
    });
    const first = moveConnectionSegment(
      automatic.routing,
      automatic,
      automatic.segments[1].id,
      60
    );
    const resolved = resolveConnectionRoute({
      source: { x: 0, y: 0, side: "right" },
      target: { x: 100, y: 100, side: "left" },
      routing: first
    });
    const second = moveConnectionSegment(first, resolved, resolved.segments[1].id, 72);

    expect(second.waypoints.every((waypoint) => !waypoint.id.startsWith("waypoint:"))).toBe(true);
    expect(second.waypoints.some((waypoint) => first.waypoints.some((item) => item.id === waypoint.id))).toBe(true);
  });

  it("pins the node endpoint while moving a first or last segment", () => {
    const moved = moveConnectionSegment(route.routing, route, route.segments[0].id, 20);
    const resolved = resolveConnectionRoute({
      source: { x: 0, y: 0, side: "bottom" },
      target: { x: 100, y: 100, side: "top" },
      routing: moved
    });

    expect(resolved.points[0]).toMatchObject({ x: 0, y: 0, role: "source" });
    expect(resolved.points.slice(1, 3).map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 20, y: 0 },
      { x: 20, y: 40 }
    ]);
  });

  it("collapses duplicate and collinear routing points", () => {
    const collapsed = collapseConnectionWaypoints({
      mode: "manual",
      kind: "orthogonal",
      waypoints: [
        { id: "a", x: 0, y: 20 },
        { id: "b", x: 0, y: 40 },
        { id: "c", x: 40, y: 40 },
        { id: "d", x: 100, y: 40 }
      ]
    }, { x: 0, y: 0 }, { x: 100, y: 100 });

    expect(collapsed.waypoints.map((point) => point.id)).toEqual(["b", "d"]);
  });

  it("preserves collinear reversal points and their waypoint ids", () => {
    const collapsed = collapseConnectionWaypoints({
      mode: "manual",
      kind: "orthogonal",
      waypoints: [
        { id: "outward", x: 116, y: 0 },
        { id: "return", x: 100, y: 0 }
      ]
    }, { x: 0, y: 0 }, { x: 80, y: 0 });

    expect(collapsed.waypoints.map((point) => point.id)).toEqual(["outward"]);
  });

  it("keeps manual waypoints fixed when connected nodes move or resize", () => {
    const routing = {
      mode: "manual" as const,
      kind: "orthogonal" as const,
      waypoints: [
        { id: "fixed-a", x: 80, y: 40 },
        { id: "fixed-b", x: 220, y: 40 }
      ]
    };
    const moved = resolveConnectionRoute({
      source: { x: 20, y: 30, side: "right" },
      target: { x: 300, y: 180, side: "left" },
      routing
    });

    expect(moved.routing.waypoints).toEqual(routing.waypoints);
    expect(moved.points.filter((point) => point.role === "waypoint").map(({ waypointId, x, y }) => (
      { waypointId, x, y }
    ))).toEqual([
      { waypointId: "fixed-a", x: 80, y: 40 },
      { waypointId: "fixed-b", x: 220, y: 40 }
    ]);
  });
});

describe("connection label segment anchors", () => {
  it("keeps a label on its segment when a node moves and falls back if the segment disappears", () => {
    const routing = {
      mode: "manual" as const,
      kind: "orthogonal" as const,
      waypoints: [
        { id: "a", x: 0, y: 50 },
        { id: "b", x: 100, y: 50 }
      ]
    };
    const original = resolveConnectionRoute({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 100 },
      routing
    });
    const anchor = reanchorConnectionLabel(original, { x: 70, y: 55 }).anchor;
    const moved = resolveConnectionRoute({
      source: { x: 0, y: 10 },
      target: { x: 140, y: 120 },
      routing
    });
    const resolved = resolveConnectionLabelAnchor(moved, anchor);

    expect(resolved.anchor.segmentId).toBe(anchor.segmentId);
    expect(resolved.point).toEqual({ x: 70, y: 50 });

    const fallback = resolveConnectionLabelAnchor(
      resolveConnectionRoute({ source: { x: 0, y: 0 }, target: { x: 100, y: 0 } }),
      { segmentId: "deleted", progress: 0.8, globalProgress: 0.25 }
    );
    expect(fallback.point).toEqual({ x: 25, y: 0 });
  });

  it("keeps labels finite for extreme coordinates and overlapping endpoints", () => {
    const extreme = resolveConnectionRoute({
      source: { x: -1e308, y: 0 },
      target: { x: 1e308, y: 0 },
      routing: { mode: "auto", kind: "straight", waypoints: [] }
    });
    const midpoint = resolveConnectionLabelAnchor(extreme, { progress: 0.5 });
    const overlapping = resolveConnectionLabelAnchor(
      resolveConnectionRoute({ source: { x: 42, y: 24 }, target: { x: 42, y: 24 } }),
      { progress: 0.75 }
    );

    expect(extreme.segments[0].length).toBeLessThanOrEqual(Number.MAX_VALUE);
    expect(Number.isFinite(midpoint.point.x)).toBe(true);
    expect(midpoint.point).toEqual({ x: 0, y: 0 });
    expect(overlapping.point).toMatchObject({ x: 42, y: 24 });
  });
});

describe("deterministic obstacle routing", () => {
  const obstacle = { id: "center", x: 40, y: -20, width: 20, height: 40 };

  function crossesObstacle(points: ConnectionPoint[]): boolean {
    return points.slice(0, -1).some((start, index) => {
      const end = points[index + 1];
      if (start.y === end.y) {
        return start.y > -28 && start.y < 28 && Math.max(start.x, end.x) > 32 && Math.min(start.x, end.x) < 68;
      }
      return start.x > 32 && start.x < 68 && Math.max(start.y, end.y) > -28 && Math.min(start.y, end.y) < 28;
    });
  }

  it("routes around nodes with stable output", () => {
    const first = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
      { padding: 8 }
    );
    const second = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
      { padding: 8 }
    );

    expect(first).toEqual(second);
    expect(first[0]).toEqual({ x: 0, y: 0 });
    expect(first.at(-1)).toEqual({ x: 100, y: 0 });
    expect(crossesObstacle(first)).toBe(false);
    expect(first).toHaveLength(4);
    expect(first.slice(1, -1).every((point, index) => {
      const previous = first[index];
      const next = first[index + 2];
      return !(previous.x === point.x && point.x === next.x)
        && !(previous.y === point.y && point.y === next.y);
    })).toBe(true);
  });

  it("keeps bend-first routing independent from legacy pixel penalty tuning", () => {
    const withoutLegacyPenalty = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
      { padding: 8, bendPenalty: 0 }
    );
    const withHugeLegacyPenalty = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
      { padding: 8, bendPenalty: Number.MAX_VALUE }
    );

    expect(withoutLegacyPenalty).toEqual(withHugeLegacyPenalty);
    expect(withoutLegacyPenalty).toHaveLength(4);
  });

  it("recomputes after an obstacle node moves", () => {
    const original = routeConnectionAvoidingObstacles({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle]);
    const moved = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ ...obstacle, x: 150 }]
    );

    expect(original.length).toBeGreaterThan(2);
    expect(moved).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it("prioritizes a real blocker when the obstacle safety cap is exceeded", () => {
    const irrelevant = Array.from({ length: 80 }, (_, index) => ({
      id: `a-far-${String(index).padStart(2, "0")}`,
      x: 1_000,
      y: 1_000,
      width: 20,
      height: 20
    }));
    const points = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [...irrelevant, obstacle],
      { padding: 8 }
    );

    expect(points.length).toBeGreaterThan(2);
    expect(crossesObstacle(points)).toBe(false);
  });

  it("uses safe defaults when routing options are non-finite", () => {
    const points = routeConnectionAvoidingObstacles(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [obstacle],
      { padding: Number.NaN, bendPenalty: Number.POSITIVE_INFINITY }
    );

    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(points.length).toBeGreaterThan(2);
    expect(crossesObstacle(points)).toBe(false);
  });

  it("does not merge distinct large-coordinate endpoints in the routing graph", () => {
    const points = routeConnectionAvoidingObstacles(
      { x: 1e306, y: 0 },
      { x: 2e306, y: 0 },
      []
    );

    expect(points).toEqual([
      { x: 1e306, y: 0 },
      { x: 2e306, y: 0 }
    ]);
  });

  it("keeps automatic bends finite when same-side endpoint midpoints are huge", () => {
    const route = resolveConnectionRoute({
      source: { x: 1e308, y: 0, side: "right" },
      target: { x: 1.5e308, y: 100, side: "right" }
    });

    expect(route.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(route.points[0]).toMatchObject({ x: 1e308, y: 0 });
    expect(route.points.at(-1)).toMatchObject({ x: 1.5e308, y: 100 });
  });

  it("keeps obstacle relevance stable for very large coordinates", () => {
    const source = { x: 1e306, y: 0 };
    const target = { x: 2e306, y: 0 };
    const largeBlocker = { id: "z-large-blocker", x: 1.49e306, y: -20, width: 2e304, height: 40 };
    const decoys = Array.from({ length: 80 }, (_, index) => ({
      id: `a-near-source-${String(index).padStart(2, "0")}`,
      x: 1e306,
      y: 1_000,
      width: 1e304,
      height: 20
    }));
    const points = routeConnectionAvoidingObstacles(source, target, [...decoys, largeBlocker], { padding: 8 });

    expect(points.length).toBeGreaterThan(2);
    expect(points[0]).toEqual(source);
    expect(points.at(-1)).toEqual(target);
  });
});
