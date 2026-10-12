import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Node, OnNodeDrag } from "@xyflow/react";
import {
  canvasNodeLayoutsChanged,
  canvasSelectionSnapshot,
  type CanvasSelectionSnapshot
} from "./canvas-history";
import { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";
import {
  calculateHelperLineSnap,
  createHelperLineIndex,
  type HelperLineGuide,
  type HelperLineIndex,
  type HelperLineItem
} from "./helper-lines";

const DEFAULT_SNAP_DISTANCE_PX = 6;
const EMPTY_HELPER_LINES = { horizontal: null, vertical: null };

export interface CanvasHelperLines {
  horizontal: HelperLineGuide | null;
  vertical: HelperLineGuide | null;
}

export interface CanvasNodeLayoutInteractionsOptions {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  updateNodes: (updater: (current: readonly Node[]) => Node[]) => void;
  getZoom: () => number;
  onBeforeCanvasChange?: (snapshot: CanvasSelectionSnapshot) => void;
  reportCanvasState: () => void;
  scheduleCanvasReport: () => void;
  snapDistancePx?: number;
}

export interface CanvasNodeLayoutInteractions {
  onNodeDragStart: OnNodeDrag<Node>;
  onNodeDrag: OnNodeDrag<Node>;
  onNodeDragStop: OnNodeDrag<Node>;
  onNodeResizeStart: (nodeId: string) => void;
  onNodeResizeEnd: (nodeId: string, width: number, height: number) => void;
  helperLines: CanvasHelperLines;
  draggingNodeIds: ReadonlySet<string>;
  userPositionedNodeIds: ReadonlySet<string>;
}

export function useCanvasNodeLayoutInteractions({
  getNodes,
  getEdges,
  updateNodes,
  getZoom,
  onBeforeCanvasChange,
  reportCanvasState,
  scheduleCanvasReport,
  snapDistancePx = DEFAULT_SNAP_DISTANCE_PX
}: CanvasNodeLayoutInteractionsOptions): CanvasNodeLayoutInteractions {
  const [draggingNodeIds, setDraggingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [helperLines, setHelperLines] = useState<CanvasHelperLines>(EMPTY_HELPER_LINES);
  const userPositionedNodeIdsRef = useRef(new Set<string>());
  const dragSnapTargetsRef = useRef<HelperLineIndex | null>(null);
  const dragHistoryRef = useRef<{
    snapshot: CanvasSelectionSnapshot;
    nodeIds: ReadonlySet<string>;
  } | null>(null);
  const resizeHistoryRef = useRef<{
    snapshot: CanvasSelectionSnapshot;
    nodeId: string;
  } | null>(null);

  const clearHelperLines = useCallback((): void => {
    setHelperLines((current) => current.horizontal === null && current.vertical === null
      ? current
      : EMPTY_HELPER_LINES);
  }, []);

  const onNodeDragStart = useCallback<OnNodeDrag<Node>>((_event, node, draggedNodes): void => {
    clearHelperLines();
    const nodes = getNodes();
    const movingNodes = draggedNodes.length > 0 ? draggedNodes : [node];
    for (const movingNode of movingNodes) userPositionedNodeIdsRef.current.add(movingNode.id);
    const movingIds = new Set(movingNodes.map((movingNode) => movingNode.id));
    dragHistoryRef.current = {
      snapshot: canvasSelectionSnapshot(nodes, getEdges()),
      nodeIds: movingIds
    };
    setDraggingNodeIds(movingIds);
    dragSnapTargetsRef.current = createHelperLineIndex(nodes
      .filter((currentNode) => !movingIds.has(currentNode.id))
      .map(helperLineItem));
  }, [clearHelperLines, getEdges, getNodes]);

  const onNodeDrag = useCallback<OnNodeDrag<Node>>((event, node, draggedNodes): void => {
    if (event.altKey) {
      clearHelperLines();
      return;
    }
    const movingNodes = draggedNodes.length > 0 ? draggedNodes : [node];
    const targetIndex = dragSnapTargetsRef.current;
    if (!targetIndex) return;
    const snap = calculateHelperLineSnap(
      movingNodes.map(helperLineItem),
      targetIndex,
      snapDistancePx / getZoom()
    );
    setHelperLines((current) => sameHelperLine(current.horizontal, snap.horizontal) &&
      sameHelperLine(current.vertical, snap.vertical)
      ? current
      : { horizontal: snap.horizontal, vertical: snap.vertical });
    if (snap.offset.x === 0 && snap.offset.y === 0) return;
    const movingById = new Map(movingNodes.map((movingNode) => [movingNode.id, movingNode]));
    updateNodes((current) => current.map((currentNode) => {
      const movingNode = movingById.get(currentNode.id);
      if (!movingNode) return currentNode;
      return {
        ...currentNode,
        position: {
          x: movingNode.position.x + snap.offset.x,
          y: movingNode.position.y + snap.offset.y
        }
      };
    }));
  }, [clearHelperLines, getZoom, snapDistancePx, updateNodes]);

  const onNodeDragStop = useCallback<OnNodeDrag<Node>>((): void => {
    const history = dragHistoryRef.current;
    dragHistoryRef.current = null;
    if (history && canvasNodeLayoutsChanged(history.snapshot, getNodes(), history.nodeIds)) {
      onBeforeCanvasChange?.(history.snapshot);
    }
    setDraggingNodeIds(new Set());
    dragSnapTargetsRef.current = null;
    clearHelperLines();
    reportCanvasState();
  }, [clearHelperLines, getNodes, onBeforeCanvasChange, reportCanvasState]);

  const onNodeResizeStart = useCallback((nodeId: string): void => {
    clearHelperLines();
    const nodes = getNodes();
    const resizingNode = nodes.find((node) => node.id === nodeId);
    resizeHistoryRef.current = resizingNode ? {
      snapshot: canvasSelectionSnapshot(nodes, getEdges()),
      nodeId
    } : null;
  }, [clearHelperLines, getEdges, getNodes]);

  const onNodeResizeEnd = useCallback((nodeId: string, width: number, height: number): void => {
    const history = resizeHistoryRef.current;
    resizeHistoryRef.current = null;
    const before = history?.snapshot.positions[nodeId];
    if (history?.nodeId === nodeId && before && before.width !== width) {
      onBeforeCanvasChange?.(history.snapshot);
    }
    updateNodes((current) => current.map((node) => node.id === nodeId
      ? { ...node, width, height, measured: { width, height }, resizing: false }
      : node));
    scheduleCanvasReport();
  }, [onBeforeCanvasChange, scheduleCanvasReport, updateNodes]);

  useEffect(() => () => {
    dragHistoryRef.current = null;
    resizeHistoryRef.current = null;
    dragSnapTargetsRef.current = null;
  }, []);

  return {
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onNodeResizeStart,
    onNodeResizeEnd,
    helperLines,
    draggingNodeIds,
    userPositionedNodeIds: userPositionedNodeIdsRef.current
  };
}

function helperLineItem(node: Node): HelperLineItem {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: nodeRenderedWidth(node),
    height: nodeRenderedHeight(node)
  };
}

function sameHelperLine(a: HelperLineGuide | null, b: HelperLineGuide | null): boolean {
  return a === b || Boolean(
    a && b && a.position === b.position && a.start === b.start && a.end === b.end
  );
}
