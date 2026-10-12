import type { Edge, Node } from "@xyflow/react";
import type {
  BoardConnection,
  BoardConnectionAnchor,
  BoardConnectionKind,
  ComicDramaVersionBinding,
  BoardConnectionLabelAnchor,
  BoardConnectionRouting,
  BoardConnectionStyle
} from "@shared/types";
import type { CanvasDropPoint } from "./canvas-drop";
import { normalizeConnectionRouting } from "./connection-routing";
import { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";

export interface CanvasNodeLayout extends CanvasDropPoint {
  width?: number;
  height?: number;
}

export interface CanvasSelectionSnapshot {
  positions: Record<string, CanvasNodeLayout>;
  selectedIds: string[];
  /** 仅在需要记录完整画布历史时提供，保持旧调用方的轻量快照兼容。 */
  connections?: BoardConnection[];
  selectedConnectionIds?: string[];
}

export interface CanvasRestoreSnapshot extends CanvasSelectionSnapshot {
  nonce: number;
}

interface PersistedConnectionData extends Record<string, unknown> {
  kind?: BoardConnectionKind;
  versionBinding?: ComicDramaVersionBinding;
  sourceAnchor?: number | Partial<BoardConnectionAnchor>;
  targetAnchor?: number | Partial<BoardConnectionAnchor>;
  label?: string;
  labelProgress?: number;
  labelAnchor?: BoardConnectionLabelAnchor;
  labelPosition?: { x: number; y: number };
  routeCoordinate?: number;
  routing?: BoardConnectionRouting;
  style?: BoardConnectionStyle;
}

function clampAnchor(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneConnectionAnchor(
  value: PersistedConnectionData["sourceAnchor"]
): number | BoardConnectionAnchor | undefined {
  if (finite(value)) return clampAnchor(value);
  if (
    !finite(value?.ratio)
    || !value.side
    || !["top", "right", "bottom", "left"].includes(value.side)
  ) return undefined;
  return {
    side: value.side,
    ratio: clampAnchor(value.ratio),
    mode: value.mode === "pinned" ? "pinned" : "auto"
  };
}

function cloneRouting(routing: unknown): BoardConnectionRouting | undefined {
  return routing && typeof routing === "object" ? normalizeConnectionRouting(routing) : undefined;
}

function cloneLabelAnchor(value: BoardConnectionLabelAnchor | undefined): BoardConnectionLabelAnchor | undefined {
  if (!value || !finite(value.progress)) return undefined;
  return {
    ...(typeof value.segmentId === "string" && value.segmentId ? { segmentId: value.segmentId } : {}),
    ...(finite(value.globalProgress) ? { globalProgress: clampAnchor(value.globalProgress) } : {}),
    progress: clampAnchor(value.progress)
  };
}

function clonePoint(value: { x: number; y: number } | undefined): { x: number; y: number } | undefined {
  return value && finite(value.x) && finite(value.y) ? { x: value.x, y: value.y } : undefined;
}

function cloneStyle(value: BoardConnectionStyle | undefined): BoardConnectionStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const style: BoardConnectionStyle = {};
  if (typeof value.color === "string" && value.color.trim()) style.color = value.color;
  if (finite(value.width)) style.width = Math.min(8, Math.max(1, value.width));
  if (value.dash === "solid" || value.dash === "dashed" || value.dash === "dotted") style.dash = value.dash;
  if (value.startMarker === "none" || value.startMarker === "arrow") style.startMarker = value.startMarker;
  if (value.endMarker === "none" || value.endMarker === "arrow") style.endMarker = value.endMarker;
  if (finite(value.markerSize)) style.markerSize = Math.min(20, Math.max(6, value.markerSize));
  if (typeof value.lineJumps === "boolean") style.lineJumps = value.lineJumps;
  return Object.keys(style).length ? style : undefined;
}

export function boardConnectionFromEdge(edge: Edge): BoardConnection {
  const data = (edge.data ?? {}) as PersistedConnectionData;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    kind: data.kind === "reference" ? "reference" : "visual",
    versionBinding: data.kind === "reference" ? data.versionBinding : undefined,
    ...(edge.deletable === false ? { locked: true } : {}),
    sourceAnchor: cloneConnectionAnchor(data.sourceAnchor),
    targetAnchor: cloneConnectionAnchor(data.targetAnchor),
    label: data.label,
    labelProgress: finite(data.labelProgress) ? clampAnchor(data.labelProgress) : undefined,
    labelAnchor: cloneLabelAnchor(data.labelAnchor),
    labelPosition: clonePoint(data.labelPosition),
    routeCoordinate: finite(data.routeCoordinate) ? data.routeCoordinate : undefined,
    routing: cloneRouting(data.routing),
    style: cloneStyle(data.style)
  };
}

/** 由 React Flow 节点和连接线生成撤销/重做快照。 */
export function canvasSelectionSnapshot(nodes: Node[], edges?: Edge[]): CanvasSelectionSnapshot {
  const snapshot: CanvasSelectionSnapshot = {
    positions: Object.fromEntries(
      nodes.map((node) => [node.id, {
        x: node.position.x,
        y: node.position.y,
        width: nodeRenderedWidth(node),
        height: nodeRenderedHeight(node)
      }])
    ),
    selectedIds: nodes.filter((node) => node.selected).map((node) => node.id)
  };
  if (!edges) return snapshot;
  snapshot.connections = edges.map(boardConnectionFromEdge);
  snapshot.selectedConnectionIds = edges.filter((edge) => edge.selected).map((edge) => edge.id);
  return snapshot;
}

/** 判断指定节点相对交互开始快照是否真的发生了布局变化。 */
export function canvasNodeLayoutsChanged(
  snapshot: CanvasSelectionSnapshot,
  nodes: Node[],
  nodeIds?: ReadonlySet<string>
): boolean {
  for (const node of nodes) {
    if (nodeIds && !nodeIds.has(node.id)) continue;
    const before = snapshot.positions[node.id];
    if (!before) return true;
    if (
      before.x !== node.position.x ||
      before.y !== node.position.y ||
      before.width !== nodeRenderedWidth(node) ||
      before.height !== nodeRenderedHeight(node)
    ) return true;
  }
  return false;
}
