import { describe, expect, it } from "vitest";

import {
  orthogonalRouteTopologiesMatch,
  routeConnectionsWithLibavoid,
  routeConnectionWithLibavoid
} from "@/components/canvas/connection-routing-libavoid";

describe("libavoid refinement presentation", () => {
  it("accepts coordinate refinement but rejects bend-count and obstacle-side changes", () => {
    const current = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: -30 },
      { x: 80, y: -30 },
      { x: 80, y: 0 },
      { x: 100, y: 0 }
    ];

    expect(orthogonalRouteTopologiesMatch(current, [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: -40 },
      { x: 84, y: -40 },
      { x: 84, y: 0 },
      { x: 100, y: 0 }
    ])).toBe(true);
    expect(orthogonalRouteTopologiesMatch(current, [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 40 },
      { x: 84, y: 40 },
      { x: 84, y: 0 },
      { x: 100, y: 0 }
    ])).toBe(false);
    expect(orthogonalRouteTopologiesMatch(current, [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: -30 },
      { x: 100, y: -30 },
      { x: 100, y: 0 }
    ])).toBe(false);
  });
});

describe("libavoid routing adapter", () => {
  it("routes a canvas batch in one shared transaction contract", async () => {
    const results = await routeConnectionsWithLibavoid([
      {
        id: "first",
        request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [], strict: true }
      },
      {
        id: "second",
        request: { source: { x: 0, y: 20 }, target: { x: 100, y: 20 }, obstacles: [], strict: true }
      }
    ]);

    expect(results.map((result) => [result.id, result.engine])).toEqual([
      ["first", "libavoid"],
      ["second", "libavoid"]
    ]);
  });

  it("keeps duplicate ids associated with their original requests", async () => {
    const results = await routeConnectionsWithLibavoid([
      {
        id: "duplicate",
        request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [], strict: true }
      },
      {
        id: "duplicate",
        request: { source: { x: 0, y: 20 }, target: { x: 100, y: 20 }, obstacles: [], strict: true }
      }
    ]);

    expect(results.map(({ id, points }) => ({ id, start: points[0], end: points.at(-1) }))).toEqual([
      { id: "duplicate", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: "duplicate", start: { x: 0, y: 20 }, end: { x: 100, y: 20 } }
    ]);
  });

  it("uses the WASM router when its topology is compatible", async () => {
    const result = await routeConnectionWithLibavoid({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      obstacles: [],
      strict: true
    });

    expect(result.engine).toBe("libavoid");
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]);
  });

  it("keeps the synchronous obstacle route when WASM would change topology", async () => {
    const result = await routeConnectionWithLibavoid({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      obstacles: [{ id: "blocker", x: 40, y: -20, width: 20, height: 40 }],
      padding: 8,
      strict: true
    });

    expect(result.engine).toBe("visibility-fallback");
    expect(result.fallbackReason).toBe("libavoid refinement changed route topology");
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.points.at(-1)).toEqual({ x: 100, y: 0 });
    expect(result.points.some((point) => Math.abs(point.y) >= 28)).toBe(true);
    expect(result.route.path).toContain("M 0 0");
    expect(result.route.segments).toHaveLength(result.points.length - 1);
  });
});
