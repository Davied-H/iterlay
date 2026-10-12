import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from "react";
import { Position, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react";
import { resolveCanvasRelationshipHighlight } from "./canvas-relationship-highlight";
import {
  connectionAnchorRatio,
  connectionSide,
  pointOnNodeSideAtAnchor,
  type ConnectionSide,
  type PersistedCanvasConnectionEdgeData
} from "./ConnectionController";

type EdgeUpdater = (current: readonly Edge[]) => Edge[];

interface UseCanvasRelationshipControllerOptions {
  containerRef: MutableRefObject<HTMLElement | null>;
  getNodes: () => readonly Node[];
  getEdges: () => readonly Edge[];
  updateEdges: (updater: EdgeUpdater) => void;
  screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number };
  commentMode: boolean;
  hoverHighlightEnabled: boolean;
}

export interface CanvasRelationshipController {
  selectedRelationshipNodeId: string | null;
  onNodeMouseEnter: NodeMouseHandler<Node>;
  onNodeMouseLeave: NodeMouseHandler<Node>;
  onCanvasPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface BoundsPoint {
  x: number;
  y: number;
}

export function connectionIdsInBounds(
  nodes: readonly Node[],
  edges: readonly Edge[],
  start: BoundsPoint,
  end: BoundsPoint
): ReadonlySet<string> {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return new Set(edges.flatMap((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return [];
    const data = (edge.data ?? {}) as PersistedCanvasConnectionEdgeData;
    const sourceSide = connectionSide(edge.sourceHandle, Position.Bottom).toLowerCase() as ConnectionSide;
    const targetSide = connectionSide(edge.targetHandle, Position.Top).toLowerCase() as ConnectionSide;
    const sourcePoint = pointOnNodeSideAtAnchor(source, sourceSide, connectionAnchorRatio(data.sourceAnchor) ?? 0.5);
    const targetPoint = pointOnNodeSideAtAnchor(target, targetSide, connectionAnchorRatio(data.targetAnchor) ?? 0.5);
    const edgeLeft = Math.min(sourcePoint.x, targetPoint.x);
    const edgeRight = Math.max(sourcePoint.x, targetPoint.x);
    const edgeTop = Math.min(sourcePoint.y, targetPoint.y);
    const edgeBottom = Math.max(sourcePoint.y, targetPoint.y);
    return edgeRight >= left && edgeLeft <= right && edgeBottom >= top && edgeTop <= bottom
      ? [edge.id]
      : [];
  }));
}

function selectedRelationshipNode(nodes: readonly Node[]): string | null {
  const selected = nodes.filter((node) => node.selected);
  return selected.length === 1 ? selected[0].id : null;
}

export function useCanvasRelationshipController({
  containerRef,
  getNodes,
  getEdges,
  updateEdges,
  screenToFlowPosition,
  commentMode,
  hoverHighlightEnabled
}: UseCanvasRelationshipControllerOptions): CanvasRelationshipController {
  const currentNodes = getNodes();
  const currentEdges = getEdges();
  const selectedRelationshipNodeId = selectedRelationshipNode(currentNodes);
  const selectedRelationshipNodeIdRef = useRef<string | null>(selectedRelationshipNodeId);
  const previousSelectedRelationshipNodeIdRef = useRef<string | null>(selectedRelationshipNodeId);
  const hoveredRelationshipNodeIdRef = useRef<string | null>(null);
  const highlightedElementsRef = useRef<Element[]>([]);
  const highlightedContainerRef = useRef<HTMLElement | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  selectedRelationshipNodeIdRef.current = selectedRelationshipNodeId;
  const relationshipTopology = currentEdges
    .map((edge) => `${edge.id}:${edge.source}:${edge.target}`)
    .join("|");
  const nodeTopology = currentNodes.map((node) => node.id).join("|");

  const clearRelationshipHighlight = useCallback((): void => {
    for (const element of highlightedElementsRef.current) {
      element.classList.remove("canvas-relationship-highlighted");
    }
    highlightedElementsRef.current = [];
    highlightedContainerRef.current?.classList.remove("canvas-relationship-active");
    if (containerRef.current !== highlightedContainerRef.current) {
      containerRef.current?.classList.remove("canvas-relationship-active");
    }
    highlightedContainerRef.current = null;
  }, [containerRef]);

  const applyRelationshipHighlight = useCallback((activeNodeId: string | null): void => {
    clearRelationshipHighlight();
    const container = containerRef.current;
    if (!container) return;
    const highlight = resolveCanvasRelationshipHighlight(activeNodeId, getNodes(), getEdges());
    if (highlight.nodeIds.size === 0) return;
    highlightedContainerRef.current = container;
    container.classList.add("canvas-relationship-active");
    const escape = (value: string): string => CSS.escape(value);
    for (const id of highlight.nodeIds) {
      const element = container.querySelector(`.react-flow__node[data-id="${escape(id)}"]`);
      if (element) highlightedElementsRef.current.push(element);
    }
    for (const id of highlight.edgeIds) {
      const element = container.querySelector(`.react-flow__edge[data-id="${escape(id)}"]`);
      if (element) highlightedElementsRef.current.push(element);
    }
    for (const element of highlightedElementsRef.current) {
      element.classList.add("canvas-relationship-highlighted");
    }
  }, [clearRelationshipHighlight, containerRef, getEdges, getNodes]);

  useLayoutEffect(() => {
    const selectionChanged = previousSelectedRelationshipNodeIdRef.current !== selectedRelationshipNodeId;
    previousSelectedRelationshipNodeIdRef.current = selectedRelationshipNodeId;
    if (selectionChanged) hoveredRelationshipNodeIdRef.current = null;
    if (!hoverHighlightEnabled) hoveredRelationshipNodeIdRef.current = null;
    const hoveredNodeId = hoverHighlightEnabled ? hoveredRelationshipNodeIdRef.current : null;
    const activeNodeId = hoveredNodeId && getNodes().some((node) => node.id === hoveredNodeId)
      ? hoveredNodeId
      : selectedRelationshipNodeId;
    if (hoveredNodeId && activeNodeId !== hoveredNodeId) hoveredRelationshipNodeIdRef.current = null;
    applyRelationshipHighlight(activeNodeId);
  }, [applyRelationshipHighlight, getNodes, hoverHighlightEnabled, nodeTopology, relationshipTopology, selectedRelationshipNodeId]);

  useEffect(() => {
    if (commentMode) pointerCleanupRef.current?.();
  }, [commentMode]);

  useEffect(() => () => {
    pointerCleanupRef.current?.();
    clearRelationshipHighlight();
  }, [clearRelationshipHighlight]);

  const onNodeMouseEnter = useCallback<NodeMouseHandler<Node>>((_event, node): void => {
    if (!hoverHighlightEnabled) return;
    hoveredRelationshipNodeIdRef.current = node.id;
    applyRelationshipHighlight(node.id);
  }, [applyRelationshipHighlight, hoverHighlightEnabled]);
  const onNodeMouseLeave = useCallback<NodeMouseHandler<Node>>((_event, node): void => {
    if (!hoverHighlightEnabled) return;
    if (hoveredRelationshipNodeIdRef.current !== node.id) return;
    hoveredRelationshipNodeIdRef.current = null;
    applyRelationshipHighlight(selectedRelationshipNodeIdRef.current);
  }, [applyRelationshipHighlight, hoverHighlightEnabled]);

  const onCanvasPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button === 1) event.preventDefault();
    if (commentMode || event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    if (event.target !== event.currentTarget.querySelector(".react-flow__pane")) return;
    pointerCleanupRef.current?.();
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const startClient = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let moved = false;
    const cleanup = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };
    const move = (moveEvent: globalThis.PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) return;
      moved ||= Math.hypot(
        moveEvent.clientX - startClient.x,
        moveEvent.clientY - startClient.y
      ) > 4;
    };
    const finish = (upEvent: globalThis.PointerEvent): void => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      if (!moved) return;
      const end = screenToFlowPosition({ x: upEvent.clientX, y: upEvent.clientY });
      const selectedIds = connectionIdsInBounds(getNodes(), getEdges(), start, end);
      updateEdges((current) => current.map((edge) => {
        const selected = selectedIds.has(edge.id);
        return edge.selected === selected ? edge : { ...edge, selected };
      }));
    };
    const cancel = (cancelEvent: globalThis.PointerEvent): void => {
      if (cancelEvent.pointerId !== pointerId) return;
      cleanup();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    pointerCleanupRef.current = cleanup;
  }, [commentMode, getEdges, getNodes, screenToFlowPosition, updateEdges]);

  return {
    selectedRelationshipNodeId,
    onNodeMouseEnter,
    onNodeMouseLeave,
    onCanvasPointerDownCapture
  };
}
