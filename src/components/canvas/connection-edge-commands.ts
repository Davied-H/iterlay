import { Position, reconnectEdge, type Connection, type Edge, type Node } from "@xyflow/react";
import {
  connectionDataWithDraft,
  connectionSelectionCommandChanges,
  connectionSide,
  edgeFromConnection,
  videoGenerationTargetHandleAnchorRatio,
  type ConnectionSide,
  type PersistedCanvasConnectionEdgeData
} from "./ConnectionController";
import type {
  CanvasConnectionAnchor,
  CanvasConnectionEdgeDraft,
  CanvasConnectionSelectionCommand,
  CanvasConnectionTransaction
} from "./canvas-connection-edge-contract";
import { normalizeConnectionRouting } from "./connection-routing";
import { canvasPortsCompatible } from "./NodeRegistry";

export type ConnectionBuildFailure = "incomplete" | "self" | "missing-node" | "incompatible";

export type ConnectionBuildResult =
  | { ok: true; edge: Edge }
  | { ok: false; reason: ConnectionBuildFailure };

interface BuildConnectionEdgeOptions {
  id?: string;
  targetNodeType?: string;
  sourceAnchor?: CanvasConnectionAnchor;
  targetAnchor?: CanvasConnectionAnchor;
}

export interface ConnectionCommandResult {
  edges: Edge[];
  changed: boolean;
}

export interface ConnectionSelectionResult extends ConnectionCommandResult {
  newlySelected: boolean;
}

function sideFromHandle(handleId: string | null | undefined, fallback: Position): ConnectionSide {
  return connectionSide(handleId, fallback).toLowerCase() as ConnectionSide;
}

function connectionKind(targetNodeType: string | undefined): "reference" | "visual" {
  return targetNodeType === "generationNode" || targetNodeType === "videoGenerationNode" || targetNodeType === "comicSettingNode" || targetNodeType === "comicCharacterNode" || targetNodeType === "comicSegmentNode"
    ? "reference" : "visual";
}

function semanticReferenceLabel(targetHandle: string | null | undefined): string | undefined {
  if (targetHandle === "target-start-frame") return "首帧";
  if (targetHandle === "target-end-frame") return "尾帧";
  if (targetHandle === "target-video-reference") return "参考视频";
  if (targetHandle === "target-reference") return "参考";
  return undefined;
}

interface ConnectionEndpoints {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

function sameConnectionEndpoints(left: ConnectionEndpoints, right: ConnectionEndpoints): boolean {
  return left.source === right.source
    && left.target === right.target
    && (left.sourceHandle ?? null) === (right.sourceHandle ?? null)
    && (left.targetHandle ?? null) === (right.targetHandle ?? null);
}

function visualStyleAfterReference(
  style: PersistedCanvasConnectionEdgeData["style"]
): PersistedCanvasConnectionEdgeData["style"] {
  if (!style) return undefined;
  const next = { ...style };
  delete next.dash;
  delete next.endMarker;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildConnectionEdge(
  nodes: readonly Node[],
  connection: Connection,
  options: BuildConnectionEdgeOptions = {}
): ConnectionBuildResult {
  if (!connection.source || !connection.target) return { ok: false, reason: "incomplete" };
  if (connection.source === connection.target) return { ok: false, reason: "self" };
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  const targetNodeType = targetNode?.type ?? options.targetNodeType;
  if (!sourceNode || !targetNodeType) return { ok: false, reason: "missing-node" };
  if (!canvasPortsCompatible(
    sourceNode.type,
    connection.sourceHandle,
    targetNodeType,
    connection.targetHandle
  )) {
    return { ok: false, reason: "incompatible" };
  }

  const kind = connectionKind(targetNodeType);
  const semanticTargetRatio = videoGenerationTargetHandleAnchorRatio(connection.targetHandle, targetNode);
  return {
    ok: true,
    edge: edgeFromConnection({
      id: options.id ?? crypto.randomUUID(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      kind,
      label: kind === "reference" ? semanticReferenceLabel(connection.targetHandle) : undefined,
      style: kind === "reference" ? { dash: "dashed", endMarker: "arrow" } : undefined,
      versionBinding: kind === "reference" ? { mode: "follow-active" } : undefined,
      sourceAnchor: options.sourceAnchor ?? {
        side: sideFromHandle(connection.sourceHandle, Position.Bottom),
        ratio: 0.5,
        mode: "auto"
      },
      targetAnchor: options.targetAnchor ?? {
        side: sideFromHandle(connection.targetHandle, Position.Top),
        ratio: semanticTargetRatio ?? 0.5,
        mode: semanticTargetRatio === undefined ? "auto" : "pinned"
      },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    })
  };
}

export function appendConnectionEdge(edges: readonly Edge[], edge: Edge): ConnectionCommandResult {
  const duplicate = edges.some((existing) =>
    existing.id === edge.id || sameConnectionEndpoints(existing, edge)
  );
  return duplicate
    ? { edges: edges as Edge[], changed: false }
    : { edges: [...edges, edge], changed: true };
}

export function reconnectConnectionEdge(
  nodes: readonly Node[],
  edges: readonly Edge[],
  oldEdge: Edge,
  connection: Connection
): ConnectionCommandResult {
  if (!edges.some((edge) => edge.id === oldEdge.id)) {
    return { edges: edges as Edge[], changed: false };
  }
  if (sameConnectionEndpoints(oldEdge, connection)) {
    return { edges: edges as Edge[], changed: false };
  }
  const duplicate = edges.some((edge) =>
    edge.id !== oldEdge.id && sameConnectionEndpoints(edge, connection)
  );
  if (duplicate) return { edges: edges as Edge[], changed: false };
  const built = buildConnectionEdge(nodes, connection, { id: oldEdge.id });
  if (!built.ok) return { edges: edges as Edge[], changed: false };
  const sourceChanged = oldEdge.source !== connection.source
    || (oldEdge.sourceHandle ?? null) !== (connection.sourceHandle ?? null);
  const targetChanged = oldEdge.target !== connection.target
    || (oldEdge.targetHandle ?? null) !== (connection.targetHandle ?? null);
  const reconnected = reconnectEdge(oldEdge, connection, edges as Edge[], { shouldReplaceId: false });
  const next = reconnected.map((edge) => {
    if (edge.id !== oldEdge.id) return edge;
    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    const builtData = (built.edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    return {
      ...edge,
      data: {
        ...data,
        kind: builtData.kind,
        versionBinding: builtData.kind === "reference" ? builtData.versionBinding : undefined,
        style: builtData.kind === "reference"
          ? { ...data.style, dash: "dashed", endMarker: "arrow" }
          : data.kind === "reference" ? visualStyleAfterReference(data.style) : data.style,
        sourceAnchor: sourceChanged ? builtData.sourceAnchor : data.sourceAnchor,
        targetAnchor: targetChanged ? builtData.targetAnchor : data.targetAnchor
      }
    };
  });
  return { edges: next, changed: true };
}

export function selectConnectionEdges(
  edges: readonly Edge[],
  id: string,
  additive: boolean
): ConnectionSelectionResult {
  const selected = edges.some((edge) => edge.id === id && edge.selected);
  let changed = false;
  const next = edges.map((edge) => {
    if (edge.id !== id) {
      if (additive || !edge.selected) return edge;
      changed = true;
      return { ...edge, selected: false };
    }
    const nextSelected = additive ? !selected : true;
    if (edge.selected === nextSelected) return edge;
    changed = true;
    return { ...edge, selected: nextSelected };
  });
  return { edges: changed ? next : edges as Edge[], changed, newlySelected: !selected };
}

export function applyConnectionDraft(
  edges: readonly Edge[],
  transaction: CanvasConnectionTransaction,
  draft: CanvasConnectionEdgeDraft
): ConnectionCommandResult {
  let changed = false;
  const next = edges.map((edge) => {
    if (edge.id !== transaction.edgeId) return edge;
    changed = true;
    return {
      ...edge,
      data: connectionDataWithDraft(
        (edge.data ?? {}) as PersistedCanvasConnectionEdgeData,
        draft
      )
    };
  });
  return { edges: changed ? next : edges as Edge[], changed };
}

export function applyConnectionSelectionCommand(
  edges: readonly Edge[],
  originEdgeId: string,
  command: CanvasConnectionSelectionCommand
): ConnectionCommandResult {
  const originSelected = edges.some((edge) => edge.id === originEdgeId && edge.selected);
  const targetIds = new Set(
    originSelected
      ? edges.filter((edge) => edge.selected).map((edge) => edge.id)
      : [originEdgeId]
  );
  let changed = false;
  const next = edges.map((edge) => {
    if (!targetIds.has(edge.id)) return edge;
    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    if (!connectionSelectionCommandChanges(data, command)) return edge;
    changed = true;
    if (command.type === "set-style") {
      return { ...edge, data: { ...data, style: { ...data.style, ...command.style } } };
    }
    const routing = normalizeConnectionRouting(data.routing);
    if (command.type === "reset-routing") {
      return {
        ...edge,
        data: {
          ...data,
          routeCoordinate: undefined,
          routing: { ...routing, mode: "auto" as const, waypoints: [] }
        }
      };
    }
    const waypoints = command.kind === "straight" ? [] : routing.waypoints;
    return {
      ...edge,
      data: {
        ...data,
        routeCoordinate: undefined,
        routing: {
          mode: waypoints.length ? "manual" as const : "auto" as const,
          kind: command.kind,
          waypoints
        }
      }
    };
  });
  return { edges: changed ? next : edges as Edge[], changed };
}
