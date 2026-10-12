import type {
  BoardConnectionLabelAnchor,
  BoardConnectionRouting,
  BoardConnectionRoutingKind,
  BoardConnectionWaypoint
} from "@shared/types";

export type ConnectionSide = "top" | "right" | "bottom" | "left";

export const CONNECTION_ENDPOINT_GAP_PX = 10;
export const CONNECTION_TRIGGER_CENTER_OFFSET_PX = 14;
export const CONNECTION_TRIGGER_CLEARANCE_RADIUS_PX = 14;

export function connectionEndpointGapPx(axisSize: number | undefined, ratio: number, zoom: number): number {
  if (!axisSize || !Number.isFinite(axisSize) || axisSize <= 0) return CONNECTION_ENDPOINT_GAP_PX;
  const boundedRatio = Math.min(1, Math.max(0, ratio));
  const axisDistancePx = Math.abs(boundedRatio - 0.5) * axisSize * Math.max(0.05, zoom);
  if (axisDistancePx >= CONNECTION_TRIGGER_CLEARANCE_RADIUS_PX) return CONNECTION_ENDPOINT_GAP_PX;
  const triggerInset = CONNECTION_TRIGGER_CENTER_OFFSET_PX + Math.sqrt(
    CONNECTION_TRIGGER_CLEARANCE_RADIUS_PX ** 2 - axisDistancePx ** 2
  );
  return Math.max(CONNECTION_ENDPOINT_GAP_PX, triggerInset);
}

export interface ConnectionPoint {
  x: number;
  y: number;
}

export interface ConnectionEndpoint extends ConnectionPoint {
  side?: ConnectionSide;
}

export type ConnectionAnchorMode = "auto" | "pinned";

export interface ConnectionAnchorAxisRange {
  min: number;
  max: number;
}

export interface AlignAutoConnectionEndpointsInput {
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  sourceAnchorMode: ConnectionAnchorMode;
  targetAnchorMode: ConnectionAnchorMode;
  sourceAnchorRange: ConnectionAnchorAxisRange;
  targetAnchorRange: ConnectionAnchorAxisRange;
  threshold?: number;
}

export interface AlignedConnectionEndpoints {
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  aligned: boolean;
}

export interface ConnectionObstacle {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConnectionRoutePoint extends ConnectionPoint {
  id: string;
  role: "source" | "target" | "waypoint" | "auto";
  waypointId?: string;
}

export type ConnectionSegmentAxis = "x" | "y" | null;

export interface ConnectionRouteSegment {
  id: string;
  index: number;
  start: ConnectionRoutePoint;
  end: ConnectionRoutePoint;
  axis: ConnectionSegmentAxis;
  length: number;
}

export interface ResolvedConnectionRoute {
  kind: BoardConnectionRoutingKind;
  mode: BoardConnectionRouting["mode"];
  points: ConnectionRoutePoint[];
  path: string;
  segments: ConnectionRouteSegment[];
  routing: BoardConnectionRouting;
}

export interface ResolveConnectionRouteInput {
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  routing?: unknown;
  routeCoordinate?: number;
  obstacles?: ConnectionObstacle[];
  obstaclePadding?: number;
  endpointClearance?: number;
}

export interface ResolvedConnectionLabel {
  point: ConnectionPoint;
  anchor: Required<BoardConnectionLabelAnchor>;
  pathProgress: number;
}

const EPSILON = 0.001;
const MAX_WAYPOINTS = 256;
const MAX_SYNC_OBSTACLES = 80;
const DEFAULT_ENDPOINT_CLEARANCE = 16;
const DEFAULT_OBSTACLE_PADDING = 12;
export const DEFAULT_AUTO_ANCHOR_ALIGNMENT_THRESHOLD = 8;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeFinite(value: unknown, fallback: number): number {
  return finite(value) ? Math.max(0, value) : fallback;
}

function clampProgress(value: unknown): number {
  return finite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function numberKey(value: number): string {
  if (Math.abs(value) < EPSILON) return "0";
  const scaled = value * 1000;
  return String(finite(scaled) ? Math.round(scaled) / 1000 : value);
}

function pointKey(point: ConnectionPoint): string {
  return `${numberKey(point.x)},${numberKey(point.y)}`;
}

function distance(a: ConnectionPoint, b: ConnectionPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (finite(dx) && finite(dy)) {
    const direct = Math.hypot(dx, dy);
    return finite(direct) ? direct : Number.MAX_VALUE;
  }
  const scaled = Math.hypot(b.x / 2 - a.x / 2, b.y / 2 - a.y / 2);
  const doubled = scaled * 2;
  return finite(doubled) ? doubled : Number.MAX_VALUE;
}

function saturatingAdd(a: number, b: number): number {
  const result = a + b;
  return finite(result) ? result : Number.MAX_VALUE;
}

function midpointCoordinate(a: number, b: number): number {
  return a / 2 + b / 2;
}

function projectionProgressOnSegment(
  start: ConnectionPoint,
  end: ConnectionPoint,
  point: ConnectionPoint
): number {
  const scale = Math.max(
    1,
    Math.abs(start.x),
    Math.abs(start.y),
    Math.abs(end.x),
    Math.abs(end.y),
    Math.abs(point.x),
    Math.abs(point.y)
  );
  const startX = start.x / scale;
  const startY = start.y / scale;
  const dx = end.x / scale - startX;
  const dy = end.y / scale - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.MIN_VALUE || !finite(lengthSquared)) return 0;
  return clampProgress(((point.x / scale - startX) * dx + (point.y / scale - startY) * dy) / lengthSquared);
}

function samePoint(a: ConnectionPoint, b: ConnectionPoint): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function isHorizontal(a: ConnectionPoint, b: ConnectionPoint): boolean {
  return Math.abs(a.y - b.y) <= EPSILON;
}

function isVertical(a: ConnectionPoint, b: ConnectionPoint): boolean {
  return Math.abs(a.x - b.x) <= EPSILON;
}

function between(value: number, start: number, end: number): boolean {
  return value >= Math.min(start, end) - EPSILON && value <= Math.max(start, end) + EPSILON;
}

function safeWaypointId(value: unknown, index: number, point: ConnectionPoint): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate || `waypoint-${index}-${pointKey(point).replace(",", "-")}`;
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const result = `${base}-${suffix}`;
  used.add(result);
  return result;
}

export function snapConnectionEndpointCoordinate(
  coordinate: number,
  oppositeCoordinate: number,
  threshold: number
): number {
  return Math.abs(coordinate - oppositeCoordinate) <= nonNegativeFinite(threshold, 0)
    ? oppositeCoordinate
    : coordinate;
}

/** Uses the snapped node side, or lets a free endpoint face back toward its source. */
export function resolveConnectionPreviewTargetSide(
  sourceSide: ConnectionSide,
  snappedTargetSide?: ConnectionSide
): ConnectionSide {
  if (snappedTargetSide) return snappedTargetSide;
  if (sourceSide === "left") return "right";
  if (sourceSide === "right") return "left";
  if (sourceSide === "top") return "bottom";
  return "top";
}

function normalizedAxisRange(range: ConnectionAnchorAxisRange): ConnectionAnchorAxisRange | null {
  if (!finite(range.min) || !finite(range.max)) return null;
  return { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
}

function oppositeConnectionAxis(
  sourceSide: ConnectionSide | undefined,
  targetSide: ConnectionSide | undefined
): "x" | "y" | null {
  if ((sourceSide === "left" && targetSide === "right")
    || (sourceSide === "right" && targetSide === "left")) return "y";
  if ((sourceSide === "top" && targetSide === "bottom")
    || (sourceSide === "bottom" && targetSide === "top")) return "x";
  return null;
}

/**
 * Resolves transient auto-anchor positions for overlapping opposite node sides.
 * Persisted ratios remain untouched; callers use the returned endpoints only for routing/rendering.
 */
export function alignAutoConnectionEndpoints(
  input: AlignAutoConnectionEndpointsInput
): AlignedConnectionEndpoints {
  const axis = oppositeConnectionAxis(input.source.side, input.target.side);
  const sourceRange = normalizedAxisRange(input.sourceAnchorRange);
  const targetRange = normalizedAxisRange(input.targetAnchorRange);
  const threshold = nonNegativeFinite(input.threshold, DEFAULT_AUTO_ANCHOR_ALIGNMENT_THRESHOLD);
  if (!axis || !sourceRange || !targetRange) {
    return { source: input.source, target: input.target, aligned: false };
  }

  const sourceCoordinate = input.source[axis];
  const targetCoordinate = input.target[axis];
  if (!finite(sourceCoordinate)
    || !finite(targetCoordinate)
    || (input.sourceAnchorMode === "pinned" && input.targetAnchorMode === "pinned")) {
    return { source: input.source, target: input.target, aligned: false };
  }

  const bothAuto = input.sourceAnchorMode === "auto" && input.targetAnchorMode === "auto";
  if (!bothAuto && Math.abs(sourceCoordinate - targetCoordinate) > threshold) {
    return { source: input.source, target: input.target, aligned: false };
  }

  let coordinate: number;
  if (input.sourceAnchorMode === "pinned") {
    if (!between(sourceCoordinate, targetRange.min, targetRange.max)) {
      return { source: input.source, target: input.target, aligned: false };
    }
    coordinate = sourceCoordinate;
  } else if (input.targetAnchorMode === "pinned") {
    if (!between(targetCoordinate, sourceRange.min, sourceRange.max)) {
      return { source: input.source, target: input.target, aligned: false };
    }
    coordinate = targetCoordinate;
  } else {
    const overlapMin = Math.max(sourceRange.min, targetRange.min);
    const overlapMax = Math.min(sourceRange.max, targetRange.max);
    if (overlapMin > overlapMax + EPSILON) {
      return { source: input.source, target: input.target, aligned: false };
    }
    // Auto anchors may slide along overlapping opposite sides. Preserve the
    // source position when possible so a readable straight route wins over a
    // center-to-center route with two unnecessary bends.
    coordinate = between(sourceCoordinate, targetRange.min, targetRange.max)
      ? sourceCoordinate
      : between(targetCoordinate, sourceRange.min, sourceRange.max)
        ? targetCoordinate
        : Math.min(overlapMax, Math.max(overlapMin, midpointCoordinate(sourceCoordinate, targetCoordinate)));
  }

  const source = input.sourceAnchorMode === "auto"
    ? { ...input.source, [axis]: coordinate }
    : input.source;
  const target = input.targetAnchorMode === "auto"
    ? { ...input.target, [axis]: coordinate }
    : input.target;
  return { source, target, aligned: true };
}

/** Sanitizes persisted or externally supplied routing without mutating the input. */
export function normalizeConnectionRouting(
  value: unknown,
  fallbackKind: BoardConnectionRoutingKind = "orthogonal"
): BoardConnectionRouting {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mode = record.mode === "manual" ? "manual" : "auto";
  const kind = record.kind === "straight" || record.kind === "curved" || record.kind === "orthogonal"
    ? record.kind
    : fallbackKind;
  const candidates = Array.isArray(record.waypoints) ? record.waypoints.slice(0, MAX_WAYPOINTS) : [];
  const usedIds = new Set<string>();
  const waypoints: BoardConnectionWaypoint[] = [];

  for (const [index, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== "object") continue;
    const waypoint = candidate as Record<string, unknown>;
    if (!finite(waypoint.x) || !finite(waypoint.y)) continue;
    const point = { x: waypoint.x, y: waypoint.y };
    if (waypoints.length && samePoint(waypoints[waypoints.length - 1], point)) continue;
    waypoints.push({
      id: uniqueId(safeWaypointId(waypoint.id, index, point), usedIds),
      ...point
    });
  }

  return {
    mode,
    kind,
    waypoints: kind === "straight" ? [] : waypoints
  };
}

function sideIsVertical(side: ConnectionSide | undefined): boolean | null {
  if (side === "top" || side === "bottom") return true;
  if (side === "left" || side === "right") return false;
  return null;
}

/** Converts the legacy single-axis route into two stable manual waypoints. */
export function migrateLegacyConnectionRouting(
  routing: unknown,
  routeCoordinate: unknown,
  source: ConnectionEndpoint,
  target: ConnectionEndpoint
): BoardConnectionRouting {
  if (routing && typeof routing === "object") return normalizeConnectionRouting(routing);
  if (!finite(routeCoordinate)) return normalizeConnectionRouting(undefined);
  const sourceVertical = sideIsVertical(source.side);
  const targetVertical = sideIsVertical(target.side);
  if (sourceVertical === null || sourceVertical !== targetVertical) return normalizeConnectionRouting(undefined);

  const waypoints = sourceVertical
    ? [
        { id: "legacy-source-route", x: source.x, y: routeCoordinate },
        { id: "legacy-target-route", x: target.x, y: routeCoordinate }
      ]
    : [
        { id: "legacy-source-route", x: routeCoordinate, y: source.y },
        { id: "legacy-target-route", x: routeCoordinate, y: target.y }
      ];

  return normalizeConnectionRouting({ mode: "manual", kind: "orthogonal", waypoints });
}

function routePoint(
  id: string,
  point: ConnectionPoint,
  role: ConnectionRoutePoint["role"],
  waypointId?: string
): ConnectionRoutePoint {
  return { id, x: point.x, y: point.y, role, ...(waypointId ? { waypointId } : {}) };
}

export function connectionEndpointLead(endpoint: ConnectionEndpoint, clearance: number): ConnectionPoint {
  const safeClearance = nonNegativeFinite(clearance, DEFAULT_ENDPOINT_CLEARANCE);
  const offset = (coordinate: number, delta: number): number => {
    const result = coordinate + delta;
    return finite(result) ? result : coordinate;
  };
  if (endpoint.side === "left") return { x: offset(endpoint.x, -safeClearance), y: endpoint.y };
  if (endpoint.side === "right") return { x: offset(endpoint.x, safeClearance), y: endpoint.y };
  if (endpoint.side === "top") return { x: endpoint.x, y: offset(endpoint.y, -safeClearance) };
  if (endpoint.side === "bottom") return { x: endpoint.x, y: offset(endpoint.y, safeClearance) };
  return endpoint;
}

function endpointFaces(endpoint: ConnectionEndpoint, other: ConnectionEndpoint): boolean {
  if (!endpoint.side) return true;
  const dx = other.x - endpoint.x;
  const dy = other.y - endpoint.y;
  if (endpoint.side === "left") return dx <= 0;
  if (endpoint.side === "right") return dx >= 0;
  if (endpoint.side === "top") return dy <= 0;
  return dy >= 0;
}

function autoOrthogonalPoints(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  clearance: number
): ConnectionPoint[] {
  const aligned = isHorizontal(source, target) || isVertical(source, target);
  if (aligned && endpointFaces(source, target) && endpointFaces(target, source)) return [source, target];
  const sourceLead = connectionEndpointLead(source, clearance);
  const targetLead = connectionEndpointLead(target, clearance);
  const sourceVertical = sideIsVertical(source.side);
  const targetVertical = sideIsVertical(target.side);
  const middle: ConnectionPoint[] = [];

  if (isHorizontal(sourceLead, targetLead) || isVertical(sourceLead, targetLead)) {
    const sameSide = source.side !== undefined && source.side === target.side;
    if (sameSide && isHorizontal(sourceLead, targetLead)) {
      const y = sourceLead.y + clearance;
      middle.push(sourceLead, { x: sourceLead.x, y }, { x: targetLead.x, y }, targetLead);
    } else if (sameSide && isVertical(sourceLead, targetLead)) {
      const x = sourceLead.x + clearance;
      middle.push(sourceLead, { x, y: sourceLead.y }, { x, y: targetLead.y }, targetLead);
    } else {
      middle.push(sourceLead, targetLead);
    }
  } else if (sourceVertical === true && targetVertical === true) {
    const y = midpointCoordinate(sourceLead.y, targetLead.y);
    middle.push(sourceLead, { x: sourceLead.x, y }, { x: targetLead.x, y }, targetLead);
  } else if (sourceVertical === false && targetVertical === false) {
    const x = midpointCoordinate(sourceLead.x, targetLead.x);
    middle.push(sourceLead, { x, y: sourceLead.y }, { x, y: targetLead.y }, targetLead);
  } else if (sourceVertical === true) {
    middle.push(sourceLead, { x: sourceLead.x, y: targetLead.y }, targetLead);
  } else {
    middle.push(sourceLead, { x: targetLead.x, y: sourceLead.y }, targetLead);
  }

  return [source, ...middle, target];
}

function orthogonalizePoints(points: ConnectionRoutePoint[], sourceSide?: ConnectionSide): ConnectionRoutePoint[] {
  if (points.length < 2) return points;
  const result: ConnectionRoutePoint[] = [points[0]];
  let preferHorizontal = sideIsVertical(sourceSide) === false;
  for (let index = 1; index < points.length; index += 1) {
    const previous = result[result.length - 1];
    const current = points[index];
    if (!isHorizontal(previous, current) && !isVertical(previous, current)) {
      const bend = preferHorizontal
        ? { x: current.x, y: previous.y }
        : { x: previous.x, y: current.y };
      result.push(routePoint(`bend:${previous.id}:${current.id}`, bend, "auto"));
      preferHorizontal = !preferHorizontal;
    } else if (!samePoint(previous, current)) {
      preferHorizontal = isVertical(previous, current);
    }
    result.push(current);
  }
  return result;
}

function collapseRoutePoints(points: ConnectionRoutePoint[]): ConnectionRoutePoint[] {
  const deduplicated = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  if (deduplicated.length <= 2) return deduplicated;
  const result: ConnectionRoutePoint[] = [deduplicated[0]];
  for (let index = 1; index < deduplicated.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduplicated[index];
    const next = deduplicated[index + 1];
    const removableHorizontal = isHorizontal(previous, current)
      && isHorizontal(current, next)
      && between(current.x, previous.x, next.x);
    const removableVertical = isVertical(previous, current)
      && isVertical(current, next)
      && between(current.y, previous.y, next.y);
    if (removableHorizontal || removableVertical) continue;
    result.push(current);
  }
  result.push(deduplicated[deduplicated.length - 1]);
  return result;
}

function svgNumber(value: number): string {
  return numberKey(value);
}

function linearPath(points: ConnectionPoint[]): string {
  if (!points.length) return "";
  return points.map((point, index) => `${index ? "L" : "M"} ${svgNumber(point.x)} ${svgNumber(point.y)}`).join(" ");
}

function curvedPath(points: ConnectionPoint[]): string {
  if (points.length < 3) return linearPath(points);
  const commands = [`M ${svgNumber(points[0].x)} ${svgNumber(points[0].y)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const control = points[index];
    const next = points[index + 1];
    const end = index === points.length - 2
      ? next
      : { x: midpointCoordinate(control.x, next.x), y: midpointCoordinate(control.y, next.y) };
    commands.push(`Q ${svgNumber(control.x)} ${svgNumber(control.y)} ${svgNumber(end.x)} ${svgNumber(end.y)}`);
  }
  return commands.join(" ");
}

function segmentId(start: ConnectionRoutePoint, end: ConnectionRoutePoint): string {
  return `segment:${start.id}->${end.id}`;
}

function buildSegments(points: ConnectionRoutePoint[]): ConnectionRouteSegment[] {
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    return {
      id: segmentId(start, end),
      index,
      start,
      end,
      axis: isHorizontal(start, end) ? "x" : isVertical(start, end) ? "y" : null,
      length: distance(start, end)
    };
  });
}

function pointsFromRouting(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  routing: BoardConnectionRouting,
  endpointClearance: number,
  obstacles: ConnectionObstacle[],
  obstaclePadding: number
): ConnectionRoutePoint[] {
  if (routing.kind === "straight") {
    return [routePoint("source", source, "source"), routePoint("target", target, "target")];
  }

  if (routing.mode === "manual") {
    const points = [
      routePoint("source", source, "source"),
      ...routing.waypoints.map((waypoint) => routePoint(`waypoint:${waypoint.id}`, waypoint, "waypoint", waypoint.id)),
      routePoint("target", target, "target")
    ];
    return routing.kind === "orthogonal" ? orthogonalizePoints(points, source.side) : points;
  }

  let autoPoints: ConnectionPoint[];
  if (routing.kind === "orthogonal" && obstacles.length) {
    const sourceLead = connectionEndpointLead(source, endpointClearance);
    const targetLead = connectionEndpointLead(target, endpointClearance);
    const avoided = routeConnectionAvoidingObstacles(sourceLead, targetLead, obstacles, {
      padding: obstaclePadding
    });
    autoPoints = [source, sourceLead, ...avoided, targetLead, target];
  } else {
    autoPoints = autoOrthogonalPoints(source, target, endpointClearance);
  }

  return autoPoints.map((point, index) => {
    if (index === 0) return routePoint("source", point, "source");
    if (index === autoPoints.length - 1) return routePoint("target", point, "target");
    return routePoint(`auto-${index - 1}`, point, "auto");
  });
}

/** Resolves persisted intent into deterministic render geometry and stable segment IDs. */
export function resolveConnectionRoute(input: ResolveConnectionRouteInput): ResolvedConnectionRoute {
  const source = finite(input.source.x) && finite(input.source.y) ? input.source : { x: 0, y: 0 };
  const target = finite(input.target.x) && finite(input.target.y) ? input.target : { x: 0, y: 0 };
  const routing = migrateLegacyConnectionRouting(input.routing, input.routeCoordinate, source, target);
  const points = collapseRoutePoints(pointsFromRouting(
    source,
    target,
    routing,
    nonNegativeFinite(input.endpointClearance, DEFAULT_ENDPOINT_CLEARANCE),
    input.obstacles ?? [],
    nonNegativeFinite(input.obstaclePadding, DEFAULT_OBSTACLE_PADDING)
  ));
  const path = routing.kind === "curved" ? curvedPath(points) : linearPath(points);
  return {
    kind: routing.kind,
    mode: routing.mode,
    points,
    path,
    segments: buildSegments(points),
    routing
  };
}

/** Wraps a router/refinement point sequence in the same render contract as the sync resolver. */
export function resolveConnectionRoutePoints(
  values: ConnectionPoint[],
  routingValue: unknown = { mode: "auto", kind: "orthogonal", waypoints: [] }
): ResolvedConnectionRoute {
  const routing = normalizeConnectionRouting(routingValue);
  const finitePoints = values.filter((point) => finite(point.x) && finite(point.y));
  const points = collapseRoutePoints(finitePoints.map((point, index) => {
    if (index === 0) return routePoint("source", point, "source");
    if (index === finitePoints.length - 1) return routePoint("target", point, "target");
    return routePoint(`auto-${index - 1}`, point, "auto");
  }));
  return {
    kind: routing.kind,
    mode: routing.mode,
    points,
    path: routing.kind === "curved" ? curvedPath(points) : linearPath(points),
    segments: buildSegments(points),
    routing
  };
}

/** Keeps rendered line ends clear of node cards without moving their persisted anchors. */
export function insetConnectionRoute(
  route: ResolvedConnectionRoute,
  sourceInset: number,
  targetInset: number
): ResolvedConnectionRoute {
  if (route.points.length < 2 || route.segments.length < 1) return route;
  const totalLength = route.segments.reduce((sum, segment) => saturatingAdd(sum, segment.length), 0);
  if (!finite(totalLength) || totalLength <= EPSILON) return route;

  const requestedSource = nonNegativeFinite(sourceInset, 0);
  const requestedTarget = nonNegativeFinite(targetInset, 0);
  const requestedTotal = requestedSource + requestedTarget;
  const scale = requestedTotal > totalLength * 0.8 ? totalLength * 0.8 / requestedTotal : 1;
  const sourceDistance = requestedSource * scale;
  const targetDistance = totalLength - requestedTarget * scale;

  const pointAtDistance = (distanceValue: number): ConnectionPoint => {
    const targetDistanceValue = Math.min(totalLength, Math.max(0, distanceValue));
    let elapsed = 0;
    for (const segment of route.segments) {
      const segmentEnd = saturatingAdd(elapsed, segment.length);
      if (segmentEnd + EPSILON >= targetDistanceValue) {
        const progress = segment.length <= EPSILON ? 0 : (targetDistanceValue - elapsed) / segment.length;
        return pointOnSegment(segment, progress);
      }
      elapsed = segmentEnd;
    }
    return route.points.at(-1)!;
  };

  const values: ConnectionPoint[] = [pointAtDistance(sourceDistance)];
  let elapsed = 0;
  for (let index = 1; index < route.points.length - 1; index += 1) {
    elapsed = saturatingAdd(elapsed, route.segments[index - 1]?.length ?? 0);
    if (elapsed > sourceDistance + EPSILON && elapsed < targetDistance - EPSILON) {
      values.push(route.points[index]);
    }
  }
  values.push(pointAtDistance(targetDistance));
  return resolveConnectionRoutePoints(values, route.routing);
}

/** Moves an endpoint away from its node without changing the persisted anchor. */
export function offsetConnectionEndpoint(
  point: ConnectionPoint,
  side: ConnectionSide,
  distanceValue: number
): ConnectionPoint {
  const distance = nonNegativeFinite(distanceValue, 0);
  if (side === "left") return { x: point.x - distance, y: point.y };
  if (side === "right") return { x: point.x + distance, y: point.y };
  if (side === "top") return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

function manualRoutingFromRoute(
  route: ResolvedConnectionRoute,
  waypoints: BoardConnectionWaypoint[] = route.points.slice(1, -1).map((point, index) => ({
    id: point.waypointId ?? `route-${index}-${point.id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`,
    x: point.x,
    y: point.y
  }))
): BoardConnectionRouting {
  return normalizeConnectionRouting({ mode: "manual", kind: route.kind, waypoints });
}

export function insertConnectionWaypoint(
  routing: unknown,
  route: ResolvedConnectionRoute,
  targetSegmentId: string,
  point: ConnectionPoint,
  waypointId?: string
): BoardConnectionRouting {
  const segment = route.segments.find((candidate) => candidate.id === targetSegmentId);
  if (!segment || !finite(point.x) || !finite(point.y) || route.kind === "straight") {
    return normalizeConnectionRouting(routing, route.kind);
  }
  const base = manualRoutingFromRoute(route);
  const used = new Set(base.waypoints.map((waypoint) => waypoint.id));
  const id = uniqueId(waypointId?.trim() || `insert-${segment.start.id}-${segment.end.id}`, used);
  const projected = route.kind === "orthogonal"
    ? segment.axis === "x"
      ? { x: point.x, y: segment.start.y }
      : segment.axis === "y"
        ? { x: segment.start.x, y: point.y }
        : point
    : point;
  base.waypoints.splice(segment.index, 0, { id, ...projected });
  return base;
}

export function deleteConnectionWaypoint(routing: unknown, waypointId: string): BoardConnectionRouting {
  const normalized = normalizeConnectionRouting(routing);
  return {
    ...normalized,
    mode: "manual",
    waypoints: normalized.waypoints.filter((waypoint) => waypoint.id !== waypointId)
  };
}

export function moveConnectionWaypoint(
  routing: unknown,
  waypointId: string,
  point: ConnectionPoint
): BoardConnectionRouting {
  const normalized = normalizeConnectionRouting(routing);
  if (!finite(point.x) || !finite(point.y)) return normalized;
  return {
    ...normalized,
    mode: "manual",
    waypoints: normalized.waypoints.map((waypoint) => waypoint.id === waypointId
      ? { ...waypoint, x: point.x, y: point.y }
      : waypoint)
  };
}

/** Moves an orthogonal segment to an absolute perpendicular coordinate, pinning both endpoints. */
export function moveConnectionSegment(
  routing: unknown,
  route: ResolvedConnectionRoute,
  targetSegmentId: string,
  coordinate: number
): BoardConnectionRouting {
  const segment = route.segments.find((candidate) => candidate.id === targetSegmentId);
  if (!segment || !segment.axis || !finite(coordinate) || route.kind !== "orthogonal") {
    return normalizeConnectionRouting(routing, route.kind);
  }
  const pointCopies = route.points.map((point) => ({ ...point }));
  const movedStart = pointCopies[segment.index];
  const movedEnd = pointCopies[segment.index + 1];
  if (segment.axis === "x") {
    movedStart.y = coordinate;
    movedEnd.y = coordinate;
  } else {
    movedStart.x = coordinate;
    movedEnd.x = coordinate;
  }

  const interiors = pointCopies.slice(1, -1).map((point, index) => ({
    id: point.waypointId ?? `route-${index}-${point.id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`,
    x: point.x,
    y: point.y
  }));
  if (segment.index === 0) {
    interiors.unshift({ id: `segment-start-${segment.start.id}-${segment.end.id}`, x: movedStart.x, y: movedStart.y });
  }
  if (segment.index + 1 === route.points.length - 1) {
    interiors.push({ id: `segment-end-${segment.start.id}-${segment.end.id}`, x: movedEnd.x, y: movedEnd.y });
  }
  return normalizeConnectionRouting({ mode: "manual", kind: route.kind, waypoints: interiors });
}

/** Removes duplicate and collinear manual points while preserving remaining waypoint IDs. */
export function collapseConnectionWaypoints(
  routing: unknown,
  source: ConnectionPoint,
  target: ConnectionPoint
): BoardConnectionRouting {
  const normalized = normalizeConnectionRouting(routing);
  if (normalized.kind !== "orthogonal" || normalized.waypoints.length < 2) return normalized;
  const all = [source, ...normalized.waypoints, target];
  const kept: BoardConnectionWaypoint[] = [];
  for (let index = 1; index < all.length - 1; index += 1) {
    const previous = kept.at(-1) ?? source;
    const current = all[index] as BoardConnectionWaypoint;
    const next = all[index + 1];
    if (samePoint(previous, current)) continue;
    const removableHorizontal = isHorizontal(previous, current)
      && isHorizontal(current, next)
      && between(current.x, previous.x, next.x);
    const removableVertical = isVertical(previous, current)
      && isVertical(current, next)
      && between(current.y, previous.y, next.y);
    if (removableHorizontal || removableVertical) continue;
    kept.push(current);
  }
  return { ...normalized, waypoints: kept };
}

function routeLength(route: ResolvedConnectionRoute): number {
  return route.segments.reduce((total, segment) => saturatingAdd(total, segment.length), 0);
}

function pointOnSegment(segment: ConnectionRouteSegment, progress: number): ConnectionPoint {
  const normalized = clampProgress(progress);
  return {
    x: segment.start.x * (1 - normalized) + segment.end.x * normalized,
    y: segment.start.y * (1 - normalized) + segment.end.y * normalized
  };
}

function labelAtGlobalProgress(route: ResolvedConnectionRoute, progress: number): ResolvedConnectionLabel {
  const total = routeLength(route);
  if (!route.segments.length || total <= EPSILON) {
    const point = route.points[0] ?? { x: 0, y: 0 };
    return { point, anchor: { segmentId: "", progress: 0, globalProgress: 0 }, pathProgress: 0 };
  }
  const targetLength = total * clampProgress(progress);
  let elapsed = 0;
  for (const segment of route.segments) {
    const segmentEnd = saturatingAdd(elapsed, segment.length);
    if (segmentEnd + EPSILON < targetLength) {
      elapsed = segmentEnd;
      continue;
    }
    const localProgress = segment.length <= EPSILON ? 0 : (targetLength - elapsed) / segment.length;
    const pathProgress = total <= EPSILON
      ? 0
      : elapsed / total + (segment.length / total) * clampProgress(localProgress);
    return {
      point: pointOnSegment(segment, clampProgress(localProgress)),
      anchor: {
        segmentId: segment.id,
        progress: clampProgress(localProgress),
        globalProgress: pathProgress
      },
      pathProgress
    };
  }
  const segment = route.segments[route.segments.length - 1];
  return {
    point: segment.end,
    anchor: { segmentId: segment.id, progress: 1, globalProgress: 1 },
    pathProgress: 1
  };
}

/** Resolves a stable segment anchor and falls back to whole-path progress if that segment disappeared. */
export function resolveConnectionLabelAnchor(
  route: ResolvedConnectionRoute,
  anchor?: BoardConnectionLabelAnchor,
  legacyProgress = 0.5
): ResolvedConnectionLabel {
  if (anchor?.segmentId) {
    const segment = route.segments.find((candidate) => candidate.id === anchor.segmentId);
    if (segment) {
      const localProgress = clampProgress(anchor.progress);
      const total = routeLength(route);
      const elapsed = route.segments.slice(0, segment.index)
        .reduce((sum, item) => saturatingAdd(sum, item.length), 0);
      const pathProgress = total <= EPSILON
        ? 0
        : clampProgress(elapsed / total + (segment.length / total) * localProgress);
      return {
        point: pointOnSegment(segment, localProgress),
        anchor: { segmentId: segment.id, progress: localProgress, globalProgress: pathProgress },
        pathProgress
      };
    }
  }
  return labelAtGlobalProgress(route, anchor?.globalProgress ?? anchor?.progress ?? legacyProgress);
}

/** Projects a dragged label to the route and returns a segment-local stable anchor. */
export function reanchorConnectionLabel(
  route: ResolvedConnectionRoute,
  target: ConnectionPoint
): ResolvedConnectionLabel {
  if (!route.segments.length || !finite(target.x) || !finite(target.y)) {
    return labelAtGlobalProgress(route, 0.5);
  }
  let best: { segment: ConnectionRouteSegment; progress: number; point: ConnectionPoint; distanceSquared: number } | undefined;
  for (const segment of route.segments) {
    const progress = projectionProgressOnSegment(segment.start, segment.end, target);
    const point = pointOnSegment(segment, progress);
    const distanceSquared = (target.x - point.x) ** 2 + (target.y - point.y) ** 2;
    if (!best || distanceSquared < best.distanceSquared - EPSILON
      || (Math.abs(distanceSquared - best.distanceSquared) <= EPSILON && segment.index < best.segment.index)) {
      best = { segment, progress, point, distanceSquared };
    }
  }
  if (!best) return labelAtGlobalProgress(route, 0.5);
  const total = routeLength(route);
  const elapsed = route.segments.slice(0, best.segment.index)
    .reduce((sum, segment) => saturatingAdd(sum, segment.length), 0);
  const pathProgress = total <= EPSILON
    ? 0
    : clampProgress(elapsed / total + (best.segment.length / total) * best.progress);
  return {
    point: best.point,
    anchor: { segmentId: best.segment.id, progress: best.progress, globalProgress: pathProgress },
    pathProgress
  };
}

interface NormalizedRect {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function containsPoint(rect: NormalizedRect, point: ConnectionPoint, inclusive = false): boolean {
  return inclusive
    ? point.x >= rect.left - EPSILON && point.x <= rect.right + EPSILON
      && point.y >= rect.top - EPSILON && point.y <= rect.bottom + EPSILON
    : point.x > rect.left + EPSILON && point.x < rect.right - EPSILON
      && point.y > rect.top + EPSILON && point.y < rect.bottom - EPSILON;
}

function normalizedObstacles(
  obstacles: ConnectionObstacle[],
  source: ConnectionPoint,
  target: ConnectionPoint,
  padding: number
): NormalizedRect[] {
  return obstacles
    .map((obstacle, index): NormalizedRect | null => {
      if (!finite(obstacle.x) || !finite(obstacle.y) || !finite(obstacle.width) || !finite(obstacle.height)) return null;
      const left = Math.min(obstacle.x, obstacle.x + obstacle.width);
      const right = Math.max(obstacle.x, obstacle.x + obstacle.width);
      const top = Math.min(obstacle.y, obstacle.y + obstacle.height);
      const bottom = Math.max(obstacle.y, obstacle.y + obstacle.height);
      if (![left, right, top, bottom].every(finite)) return null;
      const raw = { id: obstacle.id ?? `obstacle-${index}`, left, right, top, bottom };
      if (containsPoint(raw, source, true) || containsPoint(raw, target, true)) return null;
      const expanded = {
        id: raw.id,
        left: left - padding,
        right: right + padding,
        top: top - padding,
        bottom: bottom + padding
      };
      return [expanded.left, expanded.right, expanded.top, expanded.bottom].every(finite) ? expanded : null;
    })
    .filter((rect): rect is NormalizedRect => Boolean(rect))
    .sort((a, b) => {
      const relevance = (rect: NormalizedRect): number => {
        const center = { x: rect.left / 2 + rect.right / 2, y: rect.top / 2 + rect.bottom / 2 };
        const progress = projectionProgressOnSegment(source, target, center);
        const nearest = {
          x: source.x * (1 - progress) + target.x * progress,
          y: source.y * (1 - progress) + target.y * progress
        };
        const closestInRect = {
          x: Math.min(rect.right, Math.max(rect.left, nearest.x)),
          y: Math.min(rect.bottom, Math.max(rect.top, nearest.y))
        };
        return distance(nearest, closestInRect);
      };
      return relevance(a) - relevance(b)
        || a.id.localeCompare(b.id)
        || a.left - b.left
        || a.top - b.top;
    })
    .slice(0, MAX_SYNC_OBSTACLES);
}

function segmentBlocked(a: ConnectionPoint, b: ConnectionPoint, rects: NormalizedRect[]): boolean {
  if (isHorizontal(a, b)) {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    return rects.some((rect) => a.y > rect.top + EPSILON && a.y < rect.bottom - EPSILON
      && right > rect.left + EPSILON && left < rect.right - EPSILON);
  }
  if (isVertical(a, b)) {
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    return rects.some((rect) => a.x > rect.left + EPSILON && a.x < rect.right - EPSILON
      && bottom > rect.top + EPSILON && top < rect.bottom - EPSILON);
  }
  return true;
}

interface GraphEdge {
  node: number;
  axis: "x" | "y";
  length: number;
}

interface HeapItem {
  key: string;
  bends: number;
  length: number;
  node: number;
  axis: "none" | "x" | "y";
}

interface RouteScore {
  bends: number;
  length: number;
}

function compareRouteScore(a: RouteScore, b: RouteScore): number {
  return a.bends - b.bends || a.length - b.length;
}

class MinHeap {
  private readonly values: HeapItem[] = [];

  push(value: HeapItem): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): HeapItem | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || !this.values.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.compare(this.values[right], this.values[left]) < 0 ? right : left;
      if (this.compare(last, this.values[child]) <= 0) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }

  private compare(a: HeapItem, b: HeapItem): number {
    return compareRouteScore(a, b) || a.key.localeCompare(b.key);
  }
}

function connectVisibleNeighbors(
  groups: Map<number, number[]>,
  points: ConnectionPoint[],
  graph: GraphEdge[][],
  axis: "x" | "y",
  rects: NormalizedRect[]
): void {
  for (const indexes of groups.values()) {
    indexes.sort((a, b) => axis === "x" ? points[a].x - points[b].x : points[a].y - points[b].y);
    for (let index = 1; index < indexes.length; index += 1) {
      const from = indexes[index - 1];
      const to = indexes[index];
      if (segmentBlocked(points[from], points[to], rects)) continue;
      const length = distance(points[from], points[to]);
      graph[from].push({ node: to, axis, length });
      graph[to].push({ node: from, axis, length });
    }
  }
}

export interface AvoidObstaclesOptions {
  padding?: number;
  /** @deprecated Automatic routing now compares bend count before distance. */
  bendPenalty?: number;
}

/** Deterministic synchronous rectilinear visibility-graph fallback for drag-time routing. */
export function routeConnectionAvoidingObstacles(
  source: ConnectionPoint,
  target: ConnectionPoint,
  obstacles: ConnectionObstacle[],
  options: AvoidObstaclesOptions = {}
): ConnectionPoint[] {
  if (!finite(source.x) || !finite(source.y) || !finite(target.x) || !finite(target.y)) return [];
  const rects = normalizedObstacles(
    obstacles,
    source,
    target,
    nonNegativeFinite(options.padding, DEFAULT_OBSTACLE_PADDING)
  );
  const xValues = [...new Set([source.x, target.x, ...rects.flatMap((rect) => [rect.left, rect.right])])].sort((a, b) => a - b);
  const yValues = [...new Set([source.y, target.y, ...rects.flatMap((rect) => [rect.top, rect.bottom])])].sort((a, b) => a - b);
  const points: ConnectionPoint[] = [];
  const pointIndexes = new Map<string, number>();
  for (const y of yValues) {
    for (const x of xValues) {
      const point = { x, y };
      if (rects.some((rect) => containsPoint(rect, point))) continue;
      pointIndexes.set(pointKey(point), points.length);
      points.push(point);
    }
  }
  const sourceIndex = pointIndexes.get(pointKey(source));
  const targetIndex = pointIndexes.get(pointKey(target));
  if (sourceIndex === undefined || targetIndex === undefined) return [source, target];

  const graph = points.map((): GraphEdge[] => []);
  const rows = new Map<number, number[]>();
  const columns = new Map<number, number[]>();
  points.forEach((point, index) => {
    rows.set(point.y, [...(rows.get(point.y) ?? []), index]);
    columns.set(point.x, [...(columns.get(point.x) ?? []), index]);
  });
  connectVisibleNeighbors(rows, points, graph, "x", rects);
  connectVisibleNeighbors(columns, points, graph, "y", rects);

  const heap = new MinHeap();
  const costs = new Map<string, RouteScore>();
  const previous = new Map<string, string>();
  const states = new Map<string, HeapItem>();
  const startKey = `${sourceIndex}:none`;
  const start = { key: startKey, bends: 0, length: 0, node: sourceIndex, axis: "none" as const };
  heap.push(start);
  costs.set(startKey, start);
  states.set(startKey, start);
  let finalKey: string | undefined;

  while (true) {
    const current = heap.pop();
    if (!current) break;
    const best = costs.get(current.key);
    if (!best || compareRouteScore(current, best) > 0) continue;
    if (current.node === targetIndex) {
      finalKey = current.key;
      break;
    }
    const edges = [...graph[current.node]].sort((a, b) => a.node - b.node || a.axis.localeCompare(b.axis));
    for (const edge of edges) {
      const bends = current.bends + (current.axis !== "none" && current.axis !== edge.axis ? 1 : 0);
      const length = saturatingAdd(current.length, edge.length);
      const key = `${edge.node}:${edge.axis}`;
      const score = { bends, length };
      const oldScore = costs.get(key);
      if (oldScore && compareRouteScore(score, oldScore) >= 0) continue;
      const state = { key, ...score, node: edge.node, axis: edge.axis };
      costs.set(key, score);
      previous.set(key, current.key);
      states.set(key, state);
      heap.push(state);
    }
  }

  if (!finalKey) return autoOrthogonalPoints(source, target, 0);
  const reversed: ConnectionPoint[] = [];
  let cursor: string | undefined = finalKey;
  while (cursor) {
    const state = states.get(cursor);
    if (!state) break;
    reversed.push(points[state.node]);
    cursor = previous.get(cursor);
  }
  const result = collapseRoutePoints(reversed.reverse().map((point, index) => routePoint(`fallback-${index}`, point, "auto")));
  return result.map(({ x, y }) => ({ x, y }));
}
