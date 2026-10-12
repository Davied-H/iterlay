import { Position, type Edge, type Node } from "@xyflow/react";
import {
  alignAutoConnectionEndpoints,
  migrateLegacyConnectionRouting,
  normalizeConnectionRouting,
  reanchorConnectionLabel,
  resolveConnectionRoute,
  resolveConnectionRoutePoints,
  type ConnectionObstacle
} from "./connection-routing";
import type { LibavoidBatchRouteResult } from "./connection-routing-libavoid";
import {
  connectionAnchorMode,
  connectionAnchorRatio,
  connectionSide,
  nodeAnchorAxisRange,
  pointOnNodeSideAtAnchor,
  videoGenerationTargetHandleAnchorRatio,
  type ConnectionRouteDescriptor,
  type ConnectionSide,
  type PersistedCanvasConnectionEdgeData,
  type RefinedConnectionRoute
} from "./ConnectionController";
import { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";
import { screenPxToFlow } from "./canvas-coordinates";

interface BuildConnectionRouteDescriptorsOptions {
  nodes: readonly Node[];
  edges: readonly Edge[];
  zoom: number;
  draggingNodeIds: ReadonlySet<string>;
  settledDescriptors: ReadonlyMap<string, ConnectionRouteDescriptor>;
}

export interface ConnectionMigrationResult {
  edges: Edge[];
  changed: boolean;
}

interface ProjectConnectionEdgesOptions {
  edges: readonly Edge[];
  descriptors: readonly ConnectionRouteDescriptor[];
  lineJumps: ReadonlyMap<string, PersistedCanvasConnectionEdgeData["lineJumps"]>;
  previousEdges?: readonly Edge[];
}

const AUTO_REFERENCE_FAN_OUT_STEP_PX = 18;
const AUTO_REFERENCE_FAN_OUT_MARGIN_PX = 16;
const EMPTY_CONNECTION_LINE_JUMPS: NonNullable<PersistedCanvasConnectionEdgeData["lineJumps"]> = [];

interface ConnectionEdgeProjectionMetadata {
  sourceEdge: Edge;
  sourceData: Edge["data"];
  labelAnchor: PersistedCanvasConnectionEdgeData["labelAnchor"];
  resolvedRoute: PersistedCanvasConnectionEdgeData["resolvedRoute"];
  obstacles: PersistedCanvasConnectionEdgeData["obstacles"];
  lineJumps: NonNullable<PersistedCanvasConnectionEdgeData["lineJumps"]>;
  toolbarOwner: boolean;
}

const connectionEdgeProjectionMetadata = new WeakMap<Edge, ConnectionEdgeProjectionMetadata>();

function autoReferenceTargetCoordinates(
  nodes: readonly Node[],
  edges: readonly Edge[],
  zoom: number
): Map<string, number> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, Array<{
    edge: Edge;
    center: number;
    min: number;
    max: number;
    movable: boolean;
  }>>();

  for (const edge of edges) {
    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    const targetNode = nodeById.get(edge.target);
    if (
      !targetNode
      || data.kind !== "reference"
    ) continue;

    const targetSide = connectionSide(edge.targetHandle, Position.Top).toLowerCase() as ConnectionSide;
    const range = nodeAnchorAxisRange(targetNode, targetSide);
    const ratio = connectionAnchorRatio(data.targetAnchor) ?? 0.5;
    const center = range.min + (range.max - range.min) * ratio;
    const key = `${edge.target}:${targetSide}`;
    const group = groups.get(key) ?? [];
    group.push({
      edge,
      center,
      min: range.min,
      max: range.max,
      movable: videoGenerationTargetHandleAnchorRatio(edge.targetHandle, targetNode) === undefined
        && connectionAnchorMode(data.targetAnchor) === "auto"
        && normalizeConnectionRouting(data.routing).mode === "auto"
    });
    groups.set(key, group);
  }

  const coordinates = new Map<string, number>();
  const desiredStep = screenPxToFlow(AUTO_REFERENCE_FAN_OUT_STEP_PX, zoom);
  const margin = screenPxToFlow(AUTO_REFERENCE_FAN_OUT_MARGIN_PX, zoom);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const movable = group.filter((item) => item.movable)
      .sort((left, right) => left.edge.id.localeCompare(right.edge.id));
    if (movable.length === 0) continue;
    const rangeMin = group[0].min;
    const rangeMax = group[0].max;
    const clampedMargin = Math.min(margin, Math.max(0, rangeMax - rangeMin) / 2);
    const min = rangeMin + clampedMargin;
    const max = rangeMax - clampedMargin;
    const usable = Math.max(0, max - min);
    const step = Math.min(desiredStep, usable / Math.max(1, group.length - 1));
    const center = Math.min(max, Math.max(
      min,
      movable.reduce((sum, item) => sum + item.center, 0) / movable.length
    ));
    const start = center - step * (movable.length - 1) / 2;
    const clampedStart = Math.min(max - step * (movable.length - 1), Math.max(min, start));
    const occupied = group.filter((item) => !item.movable).map((item) => item.center);

    movable.forEach((item, index) => {
      const preferred = clampedStart + step * index;
      const candidates = [preferred, min, max, ...occupied.flatMap((coordinate) => [
        coordinate - step,
        coordinate + step
      ])]
        .map((coordinate) => Math.min(max, Math.max(min, coordinate)))
        .filter((coordinate) => occupied.every((other) => Math.abs(coordinate - other) >= step - 1e-6))
        .sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred) || left - right);
      const coordinate = candidates[0] ?? preferred;
      coordinates.set(item.edge.id, coordinate);
      occupied.push(coordinate);
    });
  }
  return coordinates;
}

export function connectionWorkerObstacles(
  obstacles: readonly ConnectionObstacle[],
  edge: Pick<Edge, "source" | "target">
): ConnectionObstacle[] {
  return obstacles.filter((obstacle) => obstacle.id !== edge.source && obstacle.id !== edge.target);
}

export function connectionRoutingWorkerCandidates(
  descriptors: readonly ConnectionRouteDescriptor[]
): ConnectionRouteDescriptor[] {
  return descriptors.filter((descriptor) =>
    descriptor.route.routing.mode === "auto"
    && descriptor.route.routing.kind === "orthogonal"
    && connectionWorkerObstacles(descriptor.endpointObstacles, descriptor.edge).length > 0
  );
}

export function resolveConnectionWorkerRefinements(
  candidates: readonly ConnectionRouteDescriptor[],
  workerResults: readonly Pick<LibavoidBatchRouteResult, "id" | "points" | "engine">[],
  activeSignatures: ReadonlyMap<string, string>
): Map<string, RefinedConnectionRoute> {
  const descriptorById = new Map(candidates.map((descriptor) => [descriptor.edge.id, descriptor]));
  const refinements = new Map<string, RefinedConnectionRoute>();
  for (const result of workerResults) {
    const descriptor = descriptorById.get(result.id);
    if (!descriptor || activeSignatures.get(result.id) !== descriptor.signature) continue;
    if (result.points.length < 2 || result.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      continue;
    }
    refinements.set(result.id, {
      signature: descriptor.signature,
      route: resolveConnectionRoutePoints(
        [descriptor.source, ...result.points, descriptor.target],
        descriptor.route.routing
      )
    });
  }
  return refinements;
}

export function buildConnectionRouteDescriptors({
  nodes,
  edges,
  zoom,
  draggingNodeIds,
  settledDescriptors
}: BuildConnectionRouteDescriptorsOptions): ConnectionRouteDescriptor[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const fannedTargetCoordinates = autoReferenceTargetCoordinates(nodes, edges, zoom);
  const nodeObstacles = nodes.map((node): ConnectionObstacle => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: nodeRenderedWidth(node),
    height: nodeRenderedHeight(node)
  }));
  const obstacleTopologySignature = draggingNodeIds.size === 0
    ? nodeObstacles.map((obstacle) => `${obstacle.id}:${obstacle.x}:${obstacle.y}:${obstacle.width}:${obstacle.height}`).join("|")
    : "dragging";

  return edges.flatMap((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return [];

    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    const edgeMovesWithDrag = draggingNodeIds.has(edge.source) || draggingNodeIds.has(edge.target);
    if (draggingNodeIds.size > 0 && !edgeMovesWithDrag) {
      const settled = settledDescriptors.get(edge.id);
      if (settled) return [{ ...settled, edge, data }];
    }

    const sourceSide = connectionSide(edge.sourceHandle, Position.Bottom).toLowerCase() as ConnectionSide;
    const targetSide = connectionSide(edge.targetHandle, Position.Top).toLowerCase() as ConnectionSide;
    const sourcePoint = pointOnNodeSideAtAnchor(
      sourceNode,
      sourceSide,
      connectionAnchorRatio(data.sourceAnchor) ?? 0.5
    );
    const semanticTargetRatio = videoGenerationTargetHandleAnchorRatio(edge.targetHandle, targetNode);
    const targetPoint = pointOnNodeSideAtAnchor(
      targetNode,
      targetSide,
      semanticTargetRatio ?? connectionAnchorRatio(data.targetAnchor) ?? 0.5
    );
    const initialSource = { ...sourcePoint, side: sourceSide };
    const initialTarget = { ...targetPoint, side: targetSide };
    const routing = migrateLegacyConnectionRouting(data.routing, data.routeCoordinate, initialSource, initialTarget);
    const needsAvoidance = routing.mode === "auto" && routing.kind === "orthogonal";
    const alignedEndpoints = routing.mode === "auto"
      ? alignAutoConnectionEndpoints({
          source: initialSource,
          target: initialTarget,
          sourceAnchorMode: connectionAnchorMode(data.sourceAnchor),
          targetAnchorMode: semanticTargetRatio === undefined ? connectionAnchorMode(data.targetAnchor) : "pinned",
          sourceAnchorRange: nodeAnchorAxisRange(sourceNode, sourceSide),
          targetAnchorRange: nodeAnchorAxisRange(targetNode, targetSide)
        })
      : { source: initialSource, target: initialTarget };
    const source = { ...alignedEndpoints.source, side: sourceSide };
    const fannedTargetCoordinate = fannedTargetCoordinates.get(edge.id);
    const target = {
      ...alignedEndpoints.target,
      ...(fannedTargetCoordinate === undefined
        ? {}
        : targetSide === "left" || targetSide === "right"
          ? { y: fannedTargetCoordinate }
          : { x: fannedTargetCoordinate }),
      side: targetSide
    };
    const avoidanceObstacles = needsAvoidance
      ? connectionWorkerObstacles(nodeObstacles, edge)
      : [];
    const obstacles = needsAvoidance && draggingNodeIds.size === 0 && edge.selected
      ? avoidanceObstacles
      : [];
    const endpointObstacles = needsAvoidance ? nodeObstacles : [];
    const signature = JSON.stringify({
      source,
      target,
      routing,
      obstacleTopologySignature: needsAvoidance ? obstacleTopologySignature : undefined
    });

    return [{
      edge,
      data,
      source,
      target,
      obstacles,
      endpointObstacles,
      signature,
      route: resolveConnectionRoute({ source, target, routing, obstacles: [] })
    }];
  });
}

export function applyConnectionRouteRefinements(
  descriptors: readonly ConnectionRouteDescriptor[],
  refinements: ReadonlyMap<string, RefinedConnectionRoute>
): ConnectionRouteDescriptor[] {
  return descriptors.map((descriptor) => {
    const refined = refinements.get(descriptor.edge.id);
    return {
      ...descriptor,
      route: refined?.signature === descriptor.signature ? refined.route : descriptor.route
    };
  });
}

function pinAutoConnectionAnchor(
  value: PersistedCanvasConnectionEdgeData["sourceAnchor"],
  node: Node | undefined,
  endpoint: { x: number; y: number; side: ConnectionSide }
): PersistedCanvasConnectionEdgeData["sourceAnchor"] {
  if (!node || connectionAnchorMode(value) === "pinned") return value;
  const range = nodeAnchorAxisRange(node, endpoint.side);
  const coordinate = endpoint.side === "left" || endpoint.side === "right" ? endpoint.y : endpoint.x;
  const size = range.max - range.min;
  return {
    side: endpoint.side,
    ratio: size > 0 ? Math.min(1, Math.max(0, (coordinate - range.min) / size)) : 0.5,
    mode: "pinned"
  };
}

export function migrateLegacyConnectionEdges(
  edges: Edge[],
  descriptors: readonly ConnectionRouteDescriptor[],
  nodes?: readonly Node[]
): ConnectionMigrationResult {
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.edge.id, descriptor]));
  const nodeById = new Map((nodes ?? []).map((node) => [node.id, node]));
  let changed = false;
  const migratedEdges = edges.map((edge) => {
    const descriptor = descriptorById.get(edge.id);
    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    if (!descriptor) return edge;
    const routing = !data.routing && Number.isFinite(data.routeCoordinate)
      ? descriptor.route.routing
      : data.routing;
    const labelAnchor = !data.labelAnchor && data.labelProgress === undefined && data.labelPosition
      ? reanchorConnectionLabel(descriptor.route, data.labelPosition).anchor
      : data.labelAnchor;
    const sourceAnchor = pinAutoConnectionAnchor(data.sourceAnchor, nodeById.get(edge.source), descriptor.source);
    const targetAnchor = pinAutoConnectionAnchor(data.targetAnchor, nodeById.get(edge.target), descriptor.target);
    if (
      routing === data.routing
      && labelAnchor === data.labelAnchor
      && sourceAnchor === data.sourceAnchor
      && targetAnchor === data.targetAnchor
    ) return edge;
    changed = true;
    return {
      ...edge,
      data: {
        ...data,
        sourceAnchor,
        targetAnchor,
        routing,
        routeCoordinate: routing !== data.routing ? undefined : data.routeCoordinate,
        labelAnchor,
        labelPosition: labelAnchor !== data.labelAnchor ? undefined : data.labelPosition
      }
    };
  });
  return { edges: changed ? migratedEdges : edges, changed };
}

function sameConnectionLabelAnchor(
  previous: PersistedCanvasConnectionEdgeData["labelAnchor"],
  next: PersistedCanvasConnectionEdgeData["labelAnchor"]
): boolean {
  return previous === next || Boolean(
    previous
    && next
    && previous.segmentId === next.segmentId
    && previous.globalProgress === next.globalProgress
    && previous.progress === next.progress
  );
}

function sameConnectionObstacles(
  previous: PersistedCanvasConnectionEdgeData["obstacles"],
  next: PersistedCanvasConnectionEdgeData["obstacles"]
): boolean {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((item, index) => {
    const candidate = next[index];
    return item.id === candidate.id
      && item.x === candidate.x
      && item.y === candidate.y
      && item.width === candidate.width
      && item.height === candidate.height;
  });
}

function sameConnectionLineJumps(
  previous: NonNullable<PersistedCanvasConnectionEdgeData["lineJumps"]>,
  next: NonNullable<PersistedCanvasConnectionEdgeData["lineJumps"]>
): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every((item, index) => {
    const candidate = next[index];
    return item.id === candidate.id
      && item.orientation === candidate.orientation
      && item.radius === candidate.radius
      && item.point.x === candidate.point.x
      && item.point.y === candidate.point.y;
  });
}

export function projectConnectionEdges({
  edges,
  descriptors,
  lineJumps,
  previousEdges = []
}: ProjectConnectionEdgesOptions): Edge[] {
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.edge.id, descriptor]));
  const previousById = new Map(previousEdges.map((edge) => [edge.id, edge]));
  const toolbarOwnerId = edges.find((edge) => edge.selected)?.id;
  return edges.map((edge) => {
    const descriptor = descriptorById.get(edge.id);
    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    const migratedLabelAnchor = !data.labelAnchor && data.labelProgress === undefined && data.labelPosition && descriptor
      ? reanchorConnectionLabel(descriptor.route, data.labelPosition).anchor
      : undefined;
    const labelAnchor = data.labelAnchor ?? migratedLabelAnchor;
    const resolvedRoute = descriptor?.route;
    const obstacles = descriptor?.obstacles;
    const edgeLineJumps = lineJumps.get(edge.id) ?? EMPTY_CONNECTION_LINE_JUMPS;
    const toolbarOwner = edge.id === toolbarOwnerId;
    const previous = previousById.get(edge.id);
    const previousMetadata = previous && connectionEdgeProjectionMetadata.get(previous);
    if (
      previous
      && previousMetadata?.sourceEdge === edge
      && previousMetadata.sourceData === edge.data
      && sameConnectionLabelAnchor(previousMetadata.labelAnchor, labelAnchor)
      && previousMetadata.resolvedRoute === resolvedRoute
      && sameConnectionObstacles(previousMetadata.obstacles, obstacles)
      && sameConnectionLineJumps(previousMetadata.lineJumps, edgeLineJumps)
      && previousMetadata.toolbarOwner === toolbarOwner
    ) return previous;

    const projected: Edge = {
      ...edge,
      className: edge.className,
      data: {
        ...data,
        labelAnchor,
        resolvedRoute,
        obstacles,
        lineJumps: edgeLineJumps,
        toolbarOwner
      }
    };
    connectionEdgeProjectionMetadata.set(projected, {
      sourceEdge: edge,
      sourceData: edge.data,
      labelAnchor,
      resolvedRoute,
      obstacles,
      lineJumps: edgeLineJumps,
      toolbarOwner
    });
    return projected;
  });
}
