import type { ResolvedConnectionRoute } from "./connection-routing";

export interface ConnectionLineJump {
  id: string;
  point: { x: number; y: number };
  orientation: "horizontal" | "vertical";
  radius: number;
}

export interface ConnectionRouteForJumps {
  id: string;
  route: ResolvedConnectionRoute;
  enabled?: boolean;
}

const DEFAULT_RADIUS = 5;
const ENDPOINT_CLEARANCE = 9;
const EPSILON = 0.001;

function compareStableId(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function betweenInterior(value: number, start: number, end: number): boolean {
  const minimum = Math.min(start, end) + ENDPOINT_CLEARANCE;
  const maximum = Math.max(start, end) - ENDPOINT_CLEARANCE;
  return value > minimum + EPSILON && value < maximum - EPSILON;
}

/**
 * The route with the lexicographically greater edge ID is visually above the other route
 * and receives the jump. This keeps bridge ownership stable when the edge array is reordered.
 * Intersections close to an endpoint are ignored to keep node attachments visually clean.
 */
export function calculateConnectionLineJumps(
  routes: ConnectionRouteForJumps[]
): Map<string, ConnectionLineJump[]> {
  const result = new Map<string, ConnectionLineJump[]>();
  const eligibleRoutes = routes
    .filter(({ enabled, route }) => enabled !== false && route.kind === "orthogonal")
    .sort((left, right) => compareStableId(left.id, right.id));

  for (let routeIndex = 0; routeIndex < eligibleRoutes.length; routeIndex += 1) {
    const current = eligibleRoutes[routeIndex];
    const jumps: ConnectionLineJump[] = [];

    for (let lowerIndex = 0; lowerIndex < routeIndex; lowerIndex += 1) {
      const lower = eligibleRoutes[lowerIndex];
      for (const currentSegment of current.route.segments) {
        if (!currentSegment.axis) continue;
        for (const lowerSegment of lower.route.segments) {
          if (!lowerSegment.axis || currentSegment.axis === lowerSegment.axis) continue;
          const horizontal = currentSegment.axis === "x" ? currentSegment : lowerSegment;
          const vertical = currentSegment.axis === "y" ? currentSegment : lowerSegment;
          const point = { x: vertical.start.x, y: horizontal.start.y };
          if (
            !betweenInterior(point.x, horizontal.start.x, horizontal.end.x) ||
            !betweenInterior(point.y, vertical.start.y, vertical.end.y)
          ) continue;
          if (jumps.some((jump) => Math.hypot(jump.point.x - point.x, jump.point.y - point.y) < 1)) continue;
          jumps.push({
            id: `${current.id}:${currentSegment.id}:${lower.id}:${lowerSegment.id}`,
            point,
            orientation: currentSegment.axis === "x" ? "horizontal" : "vertical",
            radius: DEFAULT_RADIUS
          });
        }
      }
    }

    if (jumps.length) result.set(current.id, jumps);
  }
  return result;
}
