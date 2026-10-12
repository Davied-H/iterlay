import { Suspense, lazy, memo } from "react";
import { Position, getSmoothStepPath, useStore, type Edge, type EdgeProps, type EdgeTypes, type Node } from "@xyflow/react";
import type { BoardConnection, BoardConnectionKind, BoardConnectionStyle, ComicDramaVersionBinding } from "@shared/types";
import type {
  CanvasConnectionEdgeData,
  CanvasConnectionEdgeDraft,
  CanvasConnectionSelectionCommand
} from "./canvas-connection-edge-contract";
import {
  CONNECTION_ENDPOINT_GAP_PX,
  CONNECTION_TRIGGER_CENTER_OFFSET_PX,
  CONNECTION_TRIGGER_CLEARANCE_RADIUS_PX,
  normalizeConnectionRouting,
  offsetConnectionEndpoint,
  resolveConnectionPreviewTargetSide
} from "./connection-routing";
import type { ConnectionObstacle, ResolvedConnectionRoute } from "./connection-routing";
import { screenPxToFlow } from "./canvas-coordinates";
import {
  isVideoGenerationTargetHandle,
  nodeRenderedHeight,
  nodeRenderedWidth,
  videoGenerationTargetHandleAnchorRatio as handleAnchorRatio
} from "./canvas-node-layout";

const LazyCanvasConnectionEdge = lazy(() => import("./CanvasConnectionEdge").then((module) => ({
  default: module.CanvasConnectionEdge
})));

const CanvasConnectionEdgeLoader = memo(function CanvasConnectionEdgeLoader(props: EdgeProps): React.ReactElement {
  return <Suspense fallback={null}><LazyCanvasConnectionEdge {...props} /></Suspense>;
});

export const canvasConnectionEdgeTypes: EdgeTypes = {
  canvasConnection: CanvasConnectionEdgeLoader
};

export type ConnectionSide = "top" | "right" | "bottom" | "left";

export interface FreeConnectionDrag {
  nodeId: string;
  side: ConnectionSide;
  start: { x: number; y: number };
  startClient: { x: number; y: number };
  current: { x: number; y: number };
  moved: boolean;
  snapTarget?: { nodeId: string; side: ConnectionSide; ratio: number; endpointGapPx: number; targetHandle?: string };
}

export interface ConnectionRouteDescriptor {
  edge: Edge;
  data: PersistedCanvasConnectionEdgeData;
  source: { x: number; y: number; side: ConnectionSide };
  target: { x: number; y: number; side: ConnectionSide };
  obstacles: ConnectionObstacle[];
  endpointObstacles: ConnectionObstacle[];
  signature: string;
  route: ResolvedConnectionRoute;
}

export interface RefinedConnectionRoute {
  signature: string;
  route: ResolvedConnectionRoute;
}

export type PersistedCanvasConnectionEdgeData = CanvasConnectionEdgeData & {
  kind?: BoardConnectionKind;
  versionBinding?: ComicDramaVersionBinding;
  labelPosition?: { x: number; y: number };
};

export function videoGenerationTargetHandleAnchorRatio(
  handleId: string | null | undefined,
  node: Node | undefined
): number | undefined {
  return handleAnchorRatio(handleId, node ? nodeRenderedHeight(node) : undefined);
}

export function connectionSide(handleId: string | null | undefined, fallback: Position): Position {
  if (isVideoGenerationTargetHandle(handleId)) return Position.Left;
  if (handleId?.endsWith("-left")) return Position.Left;
  if (handleId?.endsWith("-right")) return Position.Right;
  if (handleId?.endsWith("-top")) return Position.Top;
  if (handleId?.endsWith("-bottom")) return Position.Bottom;
  return fallback;
}

export function clampAnchor(anchor: number): number {
  return Math.min(1, Math.max(0, anchor));
}

export function connectionAnchorRatio(value: CanvasConnectionEdgeData["sourceAnchor"]): number | undefined {
  if (typeof value === "number") return clampAnchor(value);
  return typeof value?.ratio === "number" ? clampAnchor(value.ratio) : undefined;
}

export function connectionAnchorMode(value: CanvasConnectionEdgeData["sourceAnchor"]): "auto" | "pinned" {
  if (typeof value === "number") return "pinned";
  return value?.mode === "pinned" ? "pinned" : "auto";
}

export function connectionData(connection: BoardConnection): PersistedCanvasConnectionEdgeData {
  const kind = connection.kind ?? "visual";
  return {
    kind,
    versionBinding: connection.versionBinding,
    sourceAnchor: connection.sourceAnchor,
    targetAnchor: connection.targetAnchor,
    label: connection.label ?? (kind === "reference" ? "参考" : undefined),
    labelProgress: connection.labelProgress,
    labelAnchor: connection.labelAnchor,
    labelPosition: connection.labelPosition,
    routeCoordinate: connection.routeCoordinate,
    routing: connection.routing,
    style: connection.style
  };
}

export function edgeFromConnection(connection: BoardConnection, selected = false): Edge {
  const data = connectionData(connection);
  const locked = connection.locked === true
    || (connection.label === "由此设定派生" && connection.versionBinding?.mode === "pinned");
  return {
    ...connection,
    type: "canvasConnection",
    animated: false,
    selected: locked ? false : selected,
    selectable: !locked,
    deletable: !locked,
    reconnectable: !locked,
    data
  };
}

export function connectionDataWithDraft(
  data: PersistedCanvasConnectionEdgeData,
  draft: CanvasConnectionEdgeDraft
): PersistedCanvasConnectionEdgeData {
  return {
    ...data,
    sourceAnchor: { ...draft.sourceAnchor, ratio: clampAnchor(draft.sourceAnchor.ratio) },
    targetAnchor: { ...draft.targetAnchor, ratio: clampAnchor(draft.targetAnchor.ratio) },
    labelAnchor: { ...draft.labelAnchor },
    labelProgress: undefined,
    labelPosition: undefined,
    routeCoordinate: undefined,
    routing: normalizeConnectionRouting(draft.routing)
  };
}

export function connectionDraftsEqual(left: CanvasConnectionEdgeDraft, right: CanvasConnectionEdgeDraft): boolean {
  const anchorsEqual = (
    a: CanvasConnectionEdgeDraft["sourceAnchor"],
    b: CanvasConnectionEdgeDraft["sourceAnchor"]
  ): boolean => a.side === b.side && a.ratio === b.ratio && a.mode === b.mode;
  const labelsEqual = left.labelAnchor.segmentId === right.labelAnchor.segmentId
    && left.labelAnchor.progress === right.labelAnchor.progress
    && left.labelAnchor.globalProgress === right.labelAnchor.globalProgress;
  const routingEqual = left.routing.mode === right.routing.mode
    && left.routing.kind === right.routing.kind
    && left.routing.waypoints.length === right.routing.waypoints.length
    && left.routing.waypoints.every((waypoint, index) => {
      const other = right.routing.waypoints[index];
      return waypoint.id === other?.id && waypoint.x === other.x && waypoint.y === other.y;
    });
  return anchorsEqual(left.sourceAnchor, right.sourceAnchor)
    && anchorsEqual(left.targetAnchor, right.targetAnchor)
    && labelsEqual
    && routingEqual;
}

export function connectionSelectionCommandChanges(
  data: CanvasConnectionEdgeData,
  command: CanvasConnectionSelectionCommand
): boolean {
  if (command.type === "set-style") {
    return Object.entries(command.style).some(([key, value]) =>
      data.style?.[key as keyof BoardConnectionStyle] !== value
    );
  }
  const routing = normalizeConnectionRouting(data.routing);
  if (command.type === "reset-routing") {
    return data.routeCoordinate !== undefined || routing.mode !== "auto" || routing.waypoints.length > 0;
  }
  const waypoints = command.kind === "straight" ? [] : routing.waypoints;
  const mode = waypoints.length ? "manual" : "auto";
  return data.routeCoordinate !== undefined
    || routing.kind !== command.kind
    || routing.mode !== mode
    || routing.waypoints.length !== waypoints.length;
}

export function FreeConnectionPreviewPath({ drag }: { drag: FreeConnectionDrag }): React.ReactElement {
  const zoom = useStore((state) => state.transform[2]);
  const sourceEndpointGap = screenPxToFlow(
    CONNECTION_TRIGGER_CENTER_OFFSET_PX + CONNECTION_TRIGGER_CLEARANCE_RADIUS_PX,
    zoom
  );
  const targetEndpointGap = screenPxToFlow(
    drag.snapTarget?.endpointGapPx ?? CONNECTION_ENDPOINT_GAP_PX,
    zoom
  );
  const targetSide = resolveConnectionPreviewTargetSide(drag.side, drag.snapTarget?.side);
  const visibleSource = offsetConnectionEndpoint(drag.start, drag.side, sourceEndpointGap);
  const visibleTarget = drag.snapTarget
    ? offsetConnectionEndpoint(drag.current, targetSide, targetEndpointGap)
    : drag.current;
  const [path] = getSmoothStepPath({
    sourceX: visibleSource.x,
    sourceY: visibleSource.y,
    sourcePosition: drag.side as Position,
    targetX: visibleTarget.x,
    targetY: visibleTarget.y,
    targetPosition: targetSide as Position,
    borderRadius: 12
  });
  return <path d={path} />;
}

export function pointOnNodeSide(node: Node, side: ConnectionSide): { x: number; y: number } {
  const width = nodeRenderedWidth(node);
  const height = nodeRenderedHeight(node);
  if (side === "left") return { x: node.position.x, y: node.position.y + height / 2 };
  if (side === "right") return { x: node.position.x + width, y: node.position.y + height / 2 };
  if (side === "top") return { x: node.position.x + width / 2, y: node.position.y };
  return { x: node.position.x + width / 2, y: node.position.y + height };
}

export function pointOnNodeSideAtAnchor(node: Node, side: ConnectionSide, anchor: number): { x: number; y: number } {
  const width = nodeRenderedWidth(node);
  const height = nodeRenderedHeight(node);
  if (side === "left") return { x: node.position.x, y: node.position.y + height * anchor };
  if (side === "right") return { x: node.position.x + width, y: node.position.y + height * anchor };
  if (side === "top") return { x: node.position.x + width * anchor, y: node.position.y };
  return { x: node.position.x + width * anchor, y: node.position.y + height };
}

export function nodeAnchorAxisRange(node: Node, side: ConnectionSide): { min: number; max: number } {
  if (side === "left" || side === "right") {
    return { min: node.position.y, max: node.position.y + nodeRenderedHeight(node) };
  }
  return { min: node.position.x, max: node.position.x + nodeRenderedWidth(node) };
}

export function connectionAnchorAtPoint(
  node: Node,
  side: ConnectionSide,
  point: { x: number; y: number }
): { ratio: number; point: { x: number; y: number } } {
  const width = nodeRenderedWidth(node);
  const height = nodeRenderedHeight(node);
  const ratio = clampAnchor(
    side === "left" || side === "right"
      ? (point.y - node.position.y) / height
      : (point.x - node.position.x) / width
  );
  return { ratio, point: pointOnNodeSideAtAnchor(node, side, ratio) };
}

function pointAtConnectionHandle(node: Node, side: ConnectionSide): { x: number; y: number } {
  const edgePoint = pointOnNodeSide(node, side);
  const offset = 14;
  if (side === "left") return { x: edgePoint.x - offset, y: edgePoint.y };
  if (side === "right") return { x: edgePoint.x + offset, y: edgePoint.y };
  if (side === "top") return { x: edgePoint.x, y: edgePoint.y - offset };
  return { x: edgePoint.x, y: edgePoint.y + offset };
}

export function resolveConnectionSnap(
  point: { x: number; y: number },
  sourceNodeId: string,
  nodes: Node[],
  snapDistance: number
): { nodeId: string; side: ConnectionSide; ratio: number; point: { x: number; y: number } } | null {
  let closest: {
    nodeId: string;
    side: ConnectionSide;
    ratio: number;
    point: { x: number; y: number };
    distance: number;
  } | null = null;
  for (const node of nodes) {
    if (node.id === sourceNodeId) continue;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const handlePoint = pointAtConnectionHandle(node, side);
      const distance = Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y);
      if (distance <= snapDistance && (!closest || distance < closest.distance)) {
        const anchor = connectionAnchorAtPoint(node, side, point);
        closest = { nodeId: node.id, side, ...anchor, distance };
      }
    }
  }
  return closest;
}
