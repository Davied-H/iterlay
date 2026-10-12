import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Connection, Edge, Node, OnConnect, OnReconnect } from "@xyflow/react";
import {
  appendConnectionEdge,
  buildConnectionEdge,
  reconnectConnectionEdge,
  type ConnectionBuildFailure
} from "./connection-edge-commands";
import type { CanvasConnectionAnchor } from "./canvas-connection-edge-contract";

interface UseCanvasConnectionMutationsOptions {
  nodesRef: MutableRefObject<Node[]>;
  edgesRef: MutableRefObject<Edge[]>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  recordCanvasChange: () => void;
  scheduleCanvasReport: () => void;
  onInvalidConnection: (reason: ConnectionBuildFailure) => void;
}

interface ConnectOptions {
  recordHistory?: boolean;
  targetNodeType?: string;
  sourceAnchor?: CanvasConnectionAnchor;
  targetAnchor?: CanvasConnectionAnchor;
}

export interface CanvasConnectionMutations {
  connect: (connection: Connection, options?: ConnectOptions) => boolean;
  onConnect: OnConnect;
  onReconnect: OnReconnect<Edge>;
}

export function useCanvasConnectionMutations({
  nodesRef,
  edgesRef,
  setEdges,
  recordCanvasChange,
  scheduleCanvasReport,
  onInvalidConnection
}: UseCanvasConnectionMutationsOptions): CanvasConnectionMutations {
  const connect = useCallback((connection: Connection, options: ConnectOptions = {}): boolean => {
    const built = buildConnectionEdge(nodesRef.current, connection, {
      targetNodeType: options.targetNodeType,
      sourceAnchor: options.sourceAnchor,
      targetAnchor: options.targetAnchor
    });
    if (!built.ok) {
      if (built.reason !== "incomplete" && built.reason !== "self") onInvalidConnection(built.reason);
      return false;
    }
    const preview = appendConnectionEdge(edgesRef.current, built.edge);
    if (!preview.changed) return false;
    if (options.recordHistory !== false) recordCanvasChange();
    setEdges((current) => {
      const result = appendConnectionEdge(current, built.edge);
      if (!result.changed) return current;
      edgesRef.current = result.edges;
      scheduleCanvasReport();
      return result.edges;
    });
    return true;
  }, [edgesRef, nodesRef, onInvalidConnection, recordCanvasChange, scheduleCanvasReport, setEdges]);

  const onConnect = useCallback<OnConnect>((connection): void => {
    connect(connection);
  }, [connect]);

  const onReconnect = useCallback<OnReconnect<Edge>>((oldEdge, connection): void => {
    const validation = buildConnectionEdge(nodesRef.current, connection, { id: oldEdge.id });
    if (!validation.ok) {
      if (validation.reason !== "incomplete" && validation.reason !== "self") {
        onInvalidConnection(validation.reason);
      }
      return;
    }
    const preview = reconnectConnectionEdge(nodesRef.current, edgesRef.current, oldEdge, connection);
    if (!preview.changed) return;
    recordCanvasChange();
    setEdges((current) => {
      const result = reconnectConnectionEdge(nodesRef.current, current, oldEdge, connection);
      if (!result.changed) return current;
      edgesRef.current = result.edges;
      scheduleCanvasReport();
      return result.edges;
    });
  }, [edgesRef, nodesRef, onInvalidConnection, recordCanvasChange, scheduleCanvasReport, setEdges]);

  return { connect, onConnect, onReconnect };
}
