import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";

import {
  connectionRoutingWorkerCandidates,
  connectionWorkerObstacles,
  resolveConnectionWorkerRefinements
} from "@/components/canvas/CanvasBoard";
import type { ConnectionRouteDescriptor } from "@/components/canvas/ConnectionController";
import { resolveConnectionRoute } from "@/components/canvas/connection-routing";

function descriptor(
  id: string,
  mode: "auto" | "manual" = "auto",
  kind: "orthogonal" | "curved" = "orthogonal",
  obstacleCount = 1,
  signature = `${id}-signature`
): ConnectionRouteDescriptor {
  const source = { x: 0, y: 0, side: "right" as const };
  const target = { x: 100, y: 0, side: "left" as const };
  const routing = { mode, kind, waypoints: [] };
  const edge: Edge = { id, source: "source", target: "target" };
  return {
    edge,
    data: {},
    source,
    target,
    obstacles: [],
    endpointObstacles: [
      { id: "source", x: -20, y: -10, width: 20, height: 20 },
      ...Array.from({ length: obstacleCount }, (_, index) => ({
        id: `blocker-${index}`,
        x: 40 + index * 10,
        y: -10,
        width: 10,
        height: 20
      })),
      { id: "target", x: 100, y: -10, width: 20, height: 20 }
    ],
    signature,
    route: resolveConnectionRoute({ source, target, routing, obstacles: [] })
  };
}

describe("CanvasBoard connection worker coordination", () => {
  it("keeps endpoint nodes out of obstacle routing", () => {
    expect(connectionWorkerObstacles([
      { id: "source", x: 0, y: 0, width: 20, height: 20 },
      { id: "blocker", x: 40, y: 0, width: 20, height: 20 },
      { id: "target", x: 80, y: 0, width: 20, height: 20 }
    ], { source: "source", target: "target" }).map((obstacle) => obstacle.id)).toEqual(["blocker"]);
  });

  it("only schedules automatic orthogonal routes that have intermediate obstacles", () => {
    const automatic = descriptor("automatic");
    const noObstacles = descriptor("no-obstacles", "auto", "orthogonal", 0);
    const manual = descriptor("manual", "manual");
    const curved = descriptor("curved", "auto", "curved");

    expect(connectionRoutingWorkerCandidates([automatic, noObstacles, manual, curved]))
      .toEqual([automatic]);
  });

  it("adopts visibility fallback geometry instead of reverting to the baseline", () => {
    const candidate = descriptor("fallback");
    const refinements = resolveConnectionWorkerRefinements([candidate], [{
      id: candidate.edge.id,
      engine: "visibility-fallback",
      points: [
        { x: 16, y: 0 },
        { x: 16, y: 30 },
        { x: 84, y: 30 },
        { x: 84, y: 0 }
      ]
    }], new Map([[candidate.edge.id, candidate.signature]]));

    expect(refinements.get(candidate.edge.id)?.route.points).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 16, y: 0 }),
      expect.objectContaining({ x: 16, y: 30 }),
      expect.objectContaining({ x: 84, y: 30 }),
      expect.objectContaining({ x: 84, y: 0 }),
      expect.objectContaining({ x: 100, y: 0 })
    ]);
  });

  it("does not let a result for an old signature replace current geometry", () => {
    const stale = descriptor("edge", "auto", "orthogonal", 1, "old-signature");
    const refinements = resolveConnectionWorkerRefinements([stale], [{
      id: stale.edge.id,
      engine: "libavoid",
      points: [{ x: 16, y: 0 }, { x: 84, y: 0 }]
    }], new Map([[stale.edge.id, "new-signature"]]));

    expect(refinements.size).toBe(0);
  });
});
