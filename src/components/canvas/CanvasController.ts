import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport
} from "@xyflow/react";
import type { BoardConnection, BoardViewport } from "@shared/types";
import { boardConnectionFromEdge, canvasSelectionSnapshot, type CanvasNodeLayout, type CanvasSelectionSnapshot } from "./canvas-history";
import { edgeFromConnection } from "./ConnectionController";
import { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";

interface CanvasControllerOptions {
  nodesRef: MutableRefObject<Node[]>;
  edgesRef: MutableRefObject<Edge[]>;
  initialConnections: BoardConnection[];
  rightRailInset: number;
  getViewport: () => Viewport;
  onCanvasChange?: (
    positions: Record<string, CanvasNodeLayout>,
    viewport: BoardViewport,
    connections: BoardConnection[]
  ) => void;
  onBeforeCanvasChange?: (snapshot: CanvasSelectionSnapshot) => void;
}

export interface CanvasReportScheduler {
  schedule: () => void;
  cancel: () => void;
}

export function createCanvasReportScheduler(
  report: () => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame
): CanvasReportScheduler {
  let frame: number | null = null;
  return {
    schedule: () => {
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        report();
      });
    },
    cancel: () => {
      if (frame === null) return;
      cancelFrame(frame);
      frame = null;
    }
  };
}

export function useCanvasController({
  initialConnections,
  nodesRef,
  edgesRef,
  rightRailInset,
  getViewport,
  onCanvasChange,
  onBeforeCanvasChange
}: CanvasControllerOptions) {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>(
    initialConnections.map((connection) => edgeFromConnection(connection))
  );
  const rightRailInsetRef = useRef(rightRailInset);
  const getViewportRef = useRef(getViewport);
  const onCanvasChangeRef = useRef(onCanvasChange);
  const onBeforeCanvasChangeRef = useRef(onBeforeCanvasChange);

  nodesRef.current = nodes;
  edgesRef.current = edges;
  rightRailInsetRef.current = rightRailInset;
  getViewportRef.current = getViewport;
  onCanvasChangeRef.current = onCanvasChange;
  onBeforeCanvasChangeRef.current = onBeforeCanvasChange;

  const onNodesChange = useCallback<OnNodesChange<Node>>((changes): void => {
    const next = applyNodeChanges(changes, nodesRef.current);
    nodesRef.current = next;
    setNodes(next);
  }, [nodesRef, setNodes]);
  const onEdgesChange = useCallback<OnEdgesChange<Edge>>((changes): void => {
    const next = applyEdgeChanges(changes, edgesRef.current);
    edgesRef.current = next;
    setEdges(next);
  }, [edgesRef, setEdges]);

  const reportCanvasState = useCallback((): void => {
    const callback = onCanvasChangeRef.current;
    if (!callback) return;
    const positions = Object.fromEntries(
      nodesRef.current.map((node) => [node.id, {
        x: node.position.x,
        y: node.position.y,
        width: nodeRenderedWidth(node),
        height: nodeRenderedHeight(node)
      }])
    );
    const viewport = getViewportRef.current();
    callback(
      positions,
      { ...viewport, x: viewport.x + rightRailInsetRef.current },
      edgesRef.current.map(boardConnectionFromEdge)
    );
  }, [edgesRef, nodesRef]);
  const reportSchedulerRef = useRef<CanvasReportScheduler | null>(null);
  if (!reportSchedulerRef.current) {
    reportSchedulerRef.current = createCanvasReportScheduler(reportCanvasState);
  }
  const scheduleCanvasReport = useCallback((): void => {
    reportSchedulerRef.current?.schedule();
  }, []);

  useEffect(() => () => reportSchedulerRef.current?.cancel(), []);

  const recordCanvasChange = useCallback((): void => {
    onBeforeCanvasChangeRef.current?.(canvasSelectionSnapshot(nodesRef.current, edgesRef.current));
  }, [edgesRef, nodesRef]);

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    reportCanvasState,
    scheduleCanvasReport,
    recordCanvasChange
  };
}
