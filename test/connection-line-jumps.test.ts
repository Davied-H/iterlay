import { describe, expect, it } from "vitest";
import { calculateConnectionLineJumps } from "@/components/canvas/connection-line-jumps";
import { resolveConnectionRoute } from "@/components/canvas/connection-routing";

function route(source: { x: number; y: number }, target: { x: number; y: number }) {
  return resolveConnectionRoute({
    source,
    target,
    routing: { mode: "manual", kind: "orthogonal", waypoints: [] }
  });
}

function curvedRoute(source: { x: number; y: number }, target: { x: number; y: number }) {
  return resolveConnectionRoute({
    source,
    target,
    routing: { mode: "manual", kind: "curved", waypoints: [] }
  });
}

describe("connection line jumps", () => {
  it("assigns a bridge to the stable, visually upper edge regardless of input order", () => {
    const routes = [
      { id: "horizontal", route: route({ x: 0, y: 50 }, { x: 100, y: 50 }) },
      { id: "vertical", route: route({ x: 50, y: 0 }, { x: 50, y: 100 }) }
    ];
    const jumps = calculateConnectionLineJumps(routes);

    expect(jumps.has("horizontal")).toBe(false);
    expect(jumps.get("vertical")).toMatchObject([{
      point: { x: 50, y: 50 },
      orientation: "vertical",
      radius: 5
    }]);
    expect(calculateConnectionLineJumps([...routes].reverse())).toEqual(jumps);
  });

  it("returns multiple crossings in a stable order", () => {
    const routes = [
      { id: "z-horizontal", route: route({ x: 0, y: 50 }, { x: 120, y: 50 }) },
      { id: "a-vertical", route: route({ x: 20, y: 0 }, { x: 20, y: 100 }) },
      { id: "b-vertical", route: route({ x: 100, y: 0 }, { x: 100, y: 100 }) }
    ];
    const jumps = calculateConnectionLineJumps(routes);

    expect(jumps.get("z-horizontal")?.map((jump) => jump.point)).toEqual([
      { x: 20, y: 50 },
      { x: 100, y: 50 }
    ]);
    expect(calculateConnectionLineJumps([...routes].reverse())).toEqual(jumps);
  });

  it("deduplicates coincident crossings deterministically", () => {
    const routes = [
      { id: "z-horizontal", route: route({ x: 0, y: 50 }, { x: 100, y: 50 }) },
      { id: "b-vertical", route: route({ x: 50, y: 0 }, { x: 50, y: 100 }) },
      { id: "a-vertical", route: route({ x: 50, y: 0 }, { x: 50, y: 100 }) }
    ];
    const jumps = calculateConnectionLineJumps(routes);

    expect(jumps.get("z-horizontal")).toHaveLength(1);
    expect(jumps.get("z-horizontal")?.[0]).toMatchObject({
      id: expect.stringContaining(":a-vertical:"),
      point: { x: 50, y: 50 }
    });
    expect(calculateConnectionLineJumps([...routes].reverse())).toEqual(jumps);
  });

  it("ignores shared endpoints, disabled connections, and non-orthogonal routes", () => {
    expect(calculateConnectionLineJumps([
      { id: "first", route: route({ x: 0, y: 0 }, { x: 100, y: 0 }) },
      { id: "shared", route: route({ x: 100, y: 0 }, { x: 100, y: 100 }) }
    ]).size).toBe(0);

    expect(calculateConnectionLineJumps([
      { id: "horizontal", route: route({ x: 0, y: 50 }, { x: 100, y: 50 }) },
      { id: "vertical", route: route({ x: 8, y: 0 }, { x: 8, y: 100 }) }
    ]).size).toBe(0);

    expect(calculateConnectionLineJumps([
      { id: "horizontal", route: route({ x: 0, y: 50 }, { x: 100, y: 50 }) },
      { id: "vertical", route: route({ x: 50, y: 0 }, { x: 50, y: 100 }), enabled: false }
    ]).size).toBe(0);

    expect(calculateConnectionLineJumps([
      { id: "horizontal", route: route({ x: 0, y: 50 }, { x: 100, y: 50 }), enabled: false },
      { id: "vertical", route: route({ x: 50, y: 0 }, { x: 50, y: 100 }) }
    ]).size).toBe(0);

    expect(calculateConnectionLineJumps([
      { id: "curved", route: curvedRoute({ x: 0, y: 50 }, { x: 100, y: 50 }) },
      { id: "vertical", route: route({ x: 50, y: 0 }, { x: 50, y: 100 }) }
    ]).size).toBe(0);
  });
});
