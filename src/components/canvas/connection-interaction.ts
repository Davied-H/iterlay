export type ConnectionRouteKind = "straight" | "orthogonal" | "curved";
export type ConnectionRouteMode = "auto" | "manual";
export type ConnectionSide = "top" | "right" | "bottom" | "left";

export interface ConnectionPoint {
  x: number;
  y: number;
}

export interface ConnectionWaypoint extends ConnectionPoint {
  id: string;
}

export interface ConnectionRoutingDraft {
  mode: ConnectionRouteMode;
  kind: ConnectionRouteKind;
  waypoints: ConnectionWaypoint[];
}

export interface ConnectionLabelAnchor {
  segmentId?: string;
  globalProgress?: number;
  progress: number;
}

export interface ConnectionSegment {
  id: string;
  index: number;
  start: ConnectionWaypoint;
  end: ConnectionWaypoint;
  orientation: "horizontal" | "vertical" | "diagonal";
}

export interface ConnectionGeometry {
  points: ConnectionWaypoint[];
  segments: ConnectionSegment[];
  path: string;
}

const EPSILON = 0.001;

export function clampConnectionProgress(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

export function connectionSegmentId(startId: string, endId: string): string {
  return `${startId}::${endId}`;
}

export function connectionSegmentOrientation(
  start: ConnectionPoint,
  end: ConnectionPoint
): ConnectionSegment["orientation"] {
  if (Math.abs(start.y - end.y) <= EPSILON) return "horizontal";
  if (Math.abs(start.x - end.x) <= EPSILON) return "vertical";
  return "diagonal";
}

function autoOrthogonalWaypoints(
  source: ConnectionPoint,
  target: ConnectionPoint,
  sourceSide: ConnectionSide,
  targetSide: ConnectionSide
): ConnectionWaypoint[] {
  const sourceHorizontal = sourceSide === "left" || sourceSide === "right";
  const targetHorizontal = targetSide === "left" || targetSide === "right";
  if (sourceHorizontal && targetHorizontal) {
    const x = (source.x + target.x) / 2;
    return [
      { id: "auto-source-bend", x, y: source.y },
      { id: "auto-target-bend", x, y: target.y }
    ];
  }
  if (!sourceHorizontal && !targetHorizontal) {
    const y = (source.y + target.y) / 2;
    return [
      { id: "auto-source-bend", x: source.x, y },
      { id: "auto-target-bend", x: target.x, y }
    ];
  }
  return sourceHorizontal
    ? [{ id: "auto-bend", x: target.x, y: source.y }]
    : [{ id: "auto-bend", x: source.x, y: target.y }];
}

export function collapseConnectionWaypoints(
  source: ConnectionPoint,
  waypoints: ConnectionWaypoint[],
  target: ConnectionPoint
): ConnectionWaypoint[] {
  const deduped: ConnectionWaypoint[] = [];
  for (const waypoint of waypoints) {
    const previous = deduped.at(-1) ?? source;
    if (Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y) <= EPSILON) continue;
    deduped.push({ ...waypoint });
  }
  if (deduped.length && Math.hypot(deduped.at(-1)!.x - target.x, deduped.at(-1)!.y - target.y) <= EPSILON) {
    deduped.pop();
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < deduped.length; index += 1) {
      const before = index === 0 ? source : deduped[index - 1];
      const current = deduped[index];
      const after = index === deduped.length - 1 ? target : deduped[index + 1];
      const horizontal = Math.abs(before.y - current.y) <= EPSILON
        && Math.abs(current.y - after.y) <= EPSILON
        && current.x >= Math.min(before.x, after.x) - EPSILON
        && current.x <= Math.max(before.x, after.x) + EPSILON;
      const vertical = Math.abs(before.x - current.x) <= EPSILON
        && Math.abs(current.x - after.x) <= EPSILON
        && current.y >= Math.min(before.y, after.y) - EPSILON
        && current.y <= Math.max(before.y, after.y) + EPSILON;
      if (!horizontal && !vertical) continue;
      deduped.splice(index, 1);
      changed = true;
      break;
    }
  }
  return deduped;
}

function polylinePath(points: ConnectionPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function curvedPath(points: ConnectionPoint[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    const [start, end] = points;
    const controlX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${controlX} ${start.y} ${controlX} ${end.y} ${end.x} ${end.y}`;
  }
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const control1 = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const control2 = { x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6 };
    path += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${next.x} ${next.y}`;
  }
  return path;
}

export function createConnectionGeometry(input: {
  source: ConnectionPoint;
  target: ConnectionPoint;
  sourceSide?: ConnectionSide;
  targetSide?: ConnectionSide;
  routing: ConnectionRoutingDraft;
}): ConnectionGeometry {
  const source = { id: "source", ...input.source };
  const target = { id: "target", ...input.target };
  const generatedWaypoints = input.routing.kind === "orthogonal" && input.routing.waypoints.length === 0
    ? autoOrthogonalWaypoints(
        source,
        target,
        input.sourceSide ?? "right",
        input.targetSide ?? "left"
      )
    : input.routing.waypoints;
  const waypoints = input.routing.kind === "straight" ? [] : generatedWaypoints;
  const points = [source, ...waypoints.map((point) => ({ ...point })), target];
  const segments = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    return {
      id: connectionSegmentId(start.id, end.id),
      index,
      start,
      end,
      orientation: connectionSegmentOrientation(start, end)
    };
  });
  return {
    points,
    segments,
    path: input.routing.kind === "curved" ? curvedPath(points) : polylinePath(points)
  };
}

export function midpoint(start: ConnectionPoint, end: ConnectionPoint): ConnectionPoint {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

export function addConnectionWaypoint(
  geometry: ConnectionGeometry,
  segmentIndex: number,
  point: ConnectionPoint,
  id: string
): ConnectionWaypoint[] {
  const waypoints = geometry.points.slice(1, -1).map((item) => ({ ...item }));
  waypoints.splice(Math.max(0, Math.min(segmentIndex, waypoints.length)), 0, { id, ...point });
  return waypoints;
}

export function removeConnectionWaypoint(waypoints: ConnectionWaypoint[], id: string): ConnectionWaypoint[] {
  return waypoints.filter((waypoint) => waypoint.id !== id);
}

export function moveConnectionWaypoint(
  waypoints: ConnectionWaypoint[],
  id: string,
  delta: ConnectionPoint,
  lockAxis: boolean
): ConnectionWaypoint[] {
  const locked = lockConnectionDelta(delta, lockAxis);
  return waypoints.map((waypoint) => waypoint.id === id
    ? { ...waypoint, x: waypoint.x + locked.x, y: waypoint.y + locked.y }
    : { ...waypoint });
}

export function lockConnectionDelta(delta: ConnectionPoint, lockAxis: boolean): ConnectionPoint {
  if (!lockAxis) return delta;
  return Math.abs(delta.x) >= Math.abs(delta.y)
    ? { x: delta.x, y: 0 }
    : { x: 0, y: delta.y };
}

export interface ConnectionGestureModifierInput {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface ConnectionGestureModifiers {
  additiveSelection: boolean;
  bypassSnap: boolean;
  lockAxis: boolean;
}

export function resolveConnectionGestureModifiers(
  input: ConnectionGestureModifierInput
): ConnectionGestureModifiers {
  return {
    additiveSelection: input.shiftKey || input.metaKey || input.ctrlKey,
    bypassSnap: input.metaKey || input.ctrlKey,
    lockAxis: input.shiftKey
  };
}

export function resolveConnectionPointerSelection(
  selected: boolean,
  input: ConnectionGestureModifierInput
): { additive: boolean; shouldSelect: boolean } {
  const additive = resolveConnectionGestureModifiers(input).additiveSelection;
  return {
    additive,
    shouldSelect: !additive || !selected
  };
}

export function resolveConnectionEscapeAction(input: {
  gestureActive: boolean;
  hasSelection: boolean;
}): "defer-to-gesture" | "clear-selection" | "exit-canvas" {
  if (input.gestureActive) return "defer-to-gesture";
  return input.hasSelection ? "clear-selection" : "exit-canvas";
}

export function resolveConnectionDirectDragMode(
  kind: ConnectionRouteKind,
  orientation: ConnectionSegment["orientation"]
): "move-segment" | "insert-waypoint" {
  return kind === "orthogonal" && orientation !== "diagonal"
    ? "move-segment"
    : "insert-waypoint";
}

export function resolveConnectionWaypointDragPosition(input: {
  origin: ConnectionPoint;
  delta: ConnectionPoint;
  gridSize: number;
  lockAxis: boolean;
  bypassSnap: boolean;
}): ConnectionPoint {
  const delta = lockConnectionDelta(input.delta, input.lockAxis);
  const point = {
    x: input.origin.x + delta.x,
    y: input.origin.y + delta.y
  };
  if (input.bypassSnap || input.gridSize <= 0) return point;
  if (!input.lockAxis) return snapConnectionPoint(point, input.gridSize, false);
  return delta.y === 0
    ? { x: Math.round(point.x / input.gridSize) * input.gridSize, y: input.origin.y }
    : { x: input.origin.x, y: Math.round(point.y / input.gridSize) * input.gridSize };
}

export function snapConnectionPoint(point: ConnectionPoint, gridSize: number, bypassSnap: boolean): ConnectionPoint {
  if (bypassSnap || gridSize <= 0) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  };
}

/** Moves a segment perpendicular to itself while keeping both bound endpoints pinned. */
export function moveOrthogonalConnectionSegment(
  geometry: ConnectionGeometry,
  segmentIndex: number,
  delta: ConnectionPoint,
  makeId: (role: "source" | "target") => string
): ConnectionWaypoint[] {
  const segment = geometry.segments[segmentIndex];
  if (!segment || segment.orientation === "diagonal") return geometry.points.slice(1, -1).map((point) => ({ ...point }));
  const points = geometry.points.map((point) => ({ ...point }));
  const perpendicular = segment.orientation === "horizontal" ? delta.y : delta.x;
  const apply = (point: ConnectionWaypoint): void => {
    if (segment.orientation === "horizontal") point.y += perpendicular;
    else point.x += perpendicular;
  };
  if (segmentIndex === 0) {
    const lead = { ...points[0], id: makeId("source") };
    apply(lead);
    points.splice(1, 0, lead);
    apply(points[2]);
  } else {
    apply(points[segmentIndex]);
  }
  const movedEndIndex = segmentIndex === 0 ? 2 : segmentIndex + 1;
  const targetIndex = points.length - 1;
  if (movedEndIndex === targetIndex) {
    const lead = { ...points[targetIndex], id: makeId("target") };
    apply(lead);
    points.splice(targetIndex, 0, lead);
  } else if (segmentIndex !== 0) {
    apply(points[movedEndIndex]);
  }
  return collapseConnectionWaypoints(points[0], points.slice(1, -1), points.at(-1)!);
}

export function projectConnectionLabel(
  segments: ConnectionSegment[],
  target: ConnectionPoint
): ConnectionLabelAnchor {
  let best: { distance: number; segmentId: string; progress: number } | null = null;
  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared <= EPSILON
      ? 0
      : clampConnectionProgress(((target.x - segment.start.x) * dx + (target.y - segment.start.y) * dy) / lengthSquared);
    const point = { x: segment.start.x + dx * progress, y: segment.start.y + dy * progress };
    const distance = Math.hypot(target.x - point.x, target.y - point.y);
    if (!best || distance < best.distance) best = { distance, segmentId: segment.id, progress };
  }
  return best ? { segmentId: best.segmentId, progress: best.progress } : { progress: 0.5 };
}

export function pointAtConnectionLabel(
  segments: ConnectionSegment[],
  anchor: ConnectionLabelAnchor
): ConnectionPoint {
  if (!segments.length) return { x: 0, y: 0 };
  const anchored = segments.find((segment) => segment.id === anchor.segmentId);
  if (anchored) {
    const progress = clampConnectionProgress(anchor.progress);
    return {
      x: anchored.start.x + (anchored.end.x - anchored.start.x) * progress,
      y: anchored.start.y + (anchored.end.y - anchored.start.y) * progress
    };
  }
  const lengths = segments.map((segment) => Math.hypot(
    segment.end.x - segment.start.x,
    segment.end.y - segment.start.y
  ));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * clampConnectionProgress(anchor.progress);
  let selected = segments.at(-1)!;
  let progress = 1;
  for (let index = 0; index < segments.length; index += 1) {
    if (remaining > lengths[index]) {
      remaining -= lengths[index];
      continue;
    }
    selected = segments[index];
    progress = lengths[index] <= EPSILON ? 0 : remaining / lengths[index];
    break;
  }
  return {
    x: selected.start.x + (selected.end.x - selected.start.x) * progress,
    y: selected.start.y + (selected.end.y - selected.start.y) * progress
  };
}

export function hasConnectionDragIntent(
  start: ConnectionPoint,
  current: ConnectionPoint,
  threshold = 4
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function connectionBridgePath(input: {
  point: ConnectionPoint;
  orientation: "horizontal" | "vertical";
  radius?: number;
}): string {
  const radius = Math.max(2, input.radius ?? 5);
  const { x, y } = input.point;
  return input.orientation === "horizontal"
    ? `M ${x - radius} ${y} Q ${x} ${y - radius * 1.35} ${x + radius} ${y}`
    : `M ${x} ${y - radius} Q ${x + radius * 1.35} ${y} ${x} ${y + radius}`;
}

export function connectionBridgeGapPath(input: {
  point: ConnectionPoint;
  orientation: "horizontal" | "vertical";
  radius?: number;
}): string {
  const radius = Math.max(2, input.radius ?? 5);
  const { x, y } = input.point;
  return input.orientation === "horizontal"
    ? `M ${x - radius} ${y} L ${x + radius} ${y}`
    : `M ${x} ${y - radius} L ${x} ${y + radius}`;
}
