import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Connection, Node } from "@xyflow/react";
import type { CanvasConnectionAnchor } from "./canvas-connection-edge-contract";
import {
  nodeAnchorAxisRange,
  pointOnNodeSide,
  pointOnNodeSideAtAnchor,
  resolveConnectionSnap,
  type ConnectionSide,
  type FreeConnectionDrag
} from "./ConnectionController";
import {
  canvasPortsCompatible,
  compatibleCanvasTargetHandles
} from "./NodeRegistry";
import type { ConnectionTargetPresentation } from "./connection-target-presentation";
import {
  VIDEO_GENERATION_TARGET_HANDLE_Y,
  videoGenerationTargetHandleAnchorRatio
} from "./canvas-node-layout";
import { connectionEndpointGapPx } from "./connection-routing";
import { screenPxToFlow } from "./canvas-coordinates";
import { createLatestFrameTask } from "./latest-frame-task";

const CONNECTION_SNAP_DISTANCE_PX = 36;
const CONNECTION_DRAG_THRESHOLD_PX = 5;
const EMPTY_CONNECTION_TARGET_PRESENTATION = new Map<string, ConnectionTargetPresentation>();

export function resolveVideoGenerationSemanticSnap(
  pointer: { x: number; y: number },
  sourceNode: Node,
  sourceSide: ConnectionSide,
  targetNode: Node,
  maxDistance: number
): { handleId: string; ratio: number; point: { x: number; y: number } } | undefined {
  if (targetNode.type !== "videoGenerationNode") return undefined;
  const compatible = Object.keys(VIDEO_GENERATION_TARGET_HANDLE_Y)
    .filter((handleId) => canvasPortsCompatible(
      sourceNode.type,
      `source-${sourceSide}`,
      targetNode.type,
      handleId
    ))
    .flatMap((handleId) => {
      const ratio = videoGenerationTargetHandleAnchorRatio(handleId, targetNode.height ?? targetNode.measured?.height);
      if (ratio === undefined) return [];
      const point = pointOnNodeSideAtAnchor(targetNode, "left", ratio);
      return [{ handleId, ratio, point, distance: Math.hypot(pointer.x - point.x, pointer.y - point.y) }];
    })
    .sort((left, right) => left.distance - right.distance);
  const nearest = compatible[0];
  return nearest && nearest.distance <= maxDistance
    ? { handleId: nearest.handleId, ratio: nearest.ratio, point: nearest.point }
    : undefined;
}

interface UseFreeConnectionGestureOptions {
  nodesRef: MutableRefObject<Node[]>;
  screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number };
  getZoom: () => number;
  connect: (
    connection: Connection,
    options?: { sourceAnchor?: CanvasConnectionAnchor; targetAnchor?: CanvasConnectionAnchor }
  ) => boolean;
  openNodeCreateMenu: (
    client: { x: number; y: number },
    position: { x: number; y: number },
    source: { nodeId: string; side: ConnectionSide }
  ) => void;
}

export interface FreeConnectionGestureController {
  drag: FreeConnectionDrag | null;
  presentation: ReadonlyMap<string, ConnectionTargetPresentation>;
  onHandlePointerDown: (
    nodeId: string,
    side: ConnectionSide,
    clientX: number,
    clientY: number,
    pointerId: number | null
  ) => void;
  cancel: () => void;
}

export function useFreeConnectionGesture({
  nodesRef,
  screenToFlowPosition,
  getZoom,
  connect,
  openNodeCreateMenu
}: UseFreeConnectionGestureOptions): FreeConnectionGestureController {
  const [drag, setDrag] = useState<FreeConnectionDrag | null>(null);
  const [presentation, setPresentation] = useState<ReadonlyMap<string, ConnectionTargetPresentation>>(
    EMPTY_CONNECTION_TARGET_PRESENTATION
  );
  const dragRef = useRef<FreeConnectionDrag | null>(null);
  const presentationRef = useRef<ReadonlyMap<string, ConnectionTargetPresentation>>(EMPTY_CONNECTION_TARGET_PRESENTATION);
  const presentationSnapKeyRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clearDrag = useCallback((): void => {
    dragRef.current = null;
    setDrag(null);
    presentationSnapKeyRef.current = null;
    if (presentationRef.current === EMPTY_CONNECTION_TARGET_PRESENTATION) return;
    presentationRef.current = EMPTY_CONNECTION_TARGET_PRESENTATION;
    setPresentation(EMPTY_CONNECTION_TARGET_PRESENTATION);
  }, []);
  const cancel = useCallback((): void => {
    cleanupRef.current?.();
    clearDrag();
  }, [clearDrag]);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onHandlePointerDown = useCallback((
    nodeId: string,
    side: ConnectionSide,
    clientX: number,
    clientY: number,
    pointerId: number | null
  ): void => {
    cancel();
    const source = nodesRef.current.find((node) => node.id === nodeId);
    if (!source) return;
    const sourceHandle = `source-${side}`;
    const targetCandidates = nodesRef.current.flatMap((target) => {
      if (target.id === source.id) return [];
      const compatibleConnectionHandles = compatibleCanvasTargetHandles(
        source.type,
        sourceHandle,
        target.type
      );
      return compatibleConnectionHandles.length > 0
        ? [{ target, compatibleConnectionHandles }]
        : [];
    });
    const basePresentation = new Map<string, ConnectionTargetPresentation>(
      targetCandidates.map(({ target, compatibleConnectionHandles }) => [target.id, {
        connectionTargetActive: true,
        compatibleConnectionHandles
      }])
    );
    const semanticTargets = targetCandidates
      .filter(({ target }) => target.type === "videoGenerationNode")
      .flatMap(({ target, compatibleConnectionHandles }) => compatibleConnectionHandles.flatMap((handleId) => {
        const ratio = videoGenerationTargetHandleAnchorRatio(handleId, target.height ?? target.measured?.height);
        if (ratio === undefined) return [];
        return [{
          handleId,
          nodeId: target.id,
          ratio,
          point: pointOnNodeSideAtAnchor(target, "left", ratio)
        }];
      }));
    const updatePresentation = (
      moved: boolean,
      snapTarget: FreeConnectionDrag["snapTarget"]
    ): void => {
      if (!moved) return;
      const presentedSnapTarget = snapTarget && basePresentation.has(snapTarget.nodeId) ? snapTarget : undefined;
      const snapHandle = presentedSnapTarget?.targetHandle
        ?? (presentedSnapTarget ? "target-" + presentedSnapTarget.side : undefined);
      const snapKey = presentedSnapTarget && snapHandle ? presentedSnapTarget.nodeId + ":" + snapHandle : "";
      if (presentationSnapKeyRef.current === snapKey) return;
      presentationSnapKeyRef.current = snapKey;
      const next = new Map(basePresentation);
      if (presentedSnapTarget && snapHandle) {
        const targetPresentation = next.get(presentedSnapTarget.nodeId);
        if (targetPresentation) {
          next.set(presentedSnapTarget.nodeId, {
            ...targetPresentation,
            connectionSnapTargetHandle: snapHandle
          });
        }
      }
      presentationRef.current = next;
      setPresentation(next);
    };
    const start = pointOnNodeSide(source, side);
    dragRef.current = {
      nodeId,
      side,
      start,
      startClient: { x: clientX, y: clientY },
      current: start,
      moved: false
    };

    const isActivePointer = (event: globalThis.PointerEvent): boolean =>
      pointerId === null || event.pointerId === pointerId;

    const applyMove = (position: { clientX: number; clientY: number }): void => {
      const current = dragRef.current;
      if (!current) return;
      const moved = current.moved || Math.hypot(
        position.clientX - current.startClient.x,
        position.clientY - current.startClient.y
      ) > CONNECTION_DRAG_THRESHOLD_PX;
      const pointer = screenToFlowPosition({ x: position.clientX, y: position.clientY });
      const snapDistance = screenPxToFlow(CONNECTION_SNAP_DISTANCE_PX, getZoom());
      const snap = resolveConnectionSnap(
        pointer,
        nodeId,
        nodesRef.current,
        snapDistance
      );
      const semanticSnap = semanticTargets
        .map((candidate) => ({
          ...candidate,
          distance: Math.hypot(pointer.x - candidate.point.x, pointer.y - candidate.point.y)
        }))
        .filter((candidate) => candidate.distance <= snapDistance)
        .sort((left, right) => left.distance - right.distance)[0];
      const resolvedSnap = semanticSnap
        ? {
            nodeId: semanticSnap.nodeId,
            side: "left" as const,
            ratio: semanticSnap.ratio,
            point: semanticSnap.point
          }
        : snap;
      const targetNode = resolvedSnap
        ? nodesRef.current.find((node) => node.id === resolvedSnap.nodeId)
        : undefined;
      const endpointGapPx = resolvedSnap
        ? connectionEndpointGapPx(
            targetNode
              ? nodeAnchorAxisRange(targetNode, resolvedSnap.side).max - nodeAnchorAxisRange(targetNode, resolvedSnap.side).min
              : undefined,
            resolvedSnap.ratio,
            getZoom()
          )
        : undefined;
      const previewEndpoints = resolvedSnap
        ? { source: pointOnNodeSide(source, side), target: resolvedSnap.point }
        : { source: pointOnNodeSide(source, side), target: pointer };
      const next = {
        ...current,
        moved,
        start: previewEndpoints.source,
        current: previewEndpoints.target,
        snapTarget: resolvedSnap && endpointGapPx !== undefined
          ? {
              nodeId: resolvedSnap.nodeId,
              side: resolvedSnap.side,
              ratio: resolvedSnap.ratio,
              endpointGapPx,
              ...(semanticSnap ? { targetHandle: semanticSnap.handleId } : {})
            }
          : undefined
      };
      dragRef.current = next;
      if (moved) {
        updatePresentation(moved, next.snapTarget);
        setDrag(next);
      }
    };
    const moveFrame = createLatestFrameTask(applyMove);
    const move = (event: globalThis.PointerEvent): void => {
      if (!isActivePointer(event)) return;
      moveFrame.schedule({ clientX: event.clientX, clientY: event.clientY });
    };
    const cleanup = (): void => {
      moveFrame.cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancelPointerGesture);
      window.removeEventListener("blur", cancelGesture);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
    const cancelGesture = (): void => {
      cleanup();
      clearDrag();
    };
    const cancelPointerGesture = (event: globalThis.PointerEvent): void => {
      if (!isActivePointer(event)) return;
      cancelGesture();
    };
    const cancelWhenHidden = (): void => {
      if (document.visibilityState === "hidden") cancelGesture();
    };
    const finish = (event: globalThis.PointerEvent): void => {
      if (!isActivePointer(event)) return;
      moveFrame.flush({ clientX: event.clientX, clientY: event.clientY });
      const current = dragRef.current;
      cleanup();
      clearDrag();
      if (!current?.moved) return;
      if (!current.snapTarget) {
        const client = { x: event.clientX, y: event.clientY };
        openNodeCreateMenu(client, screenToFlowPosition(client), { nodeId, side });
        return;
      }
      const targetNode = nodesRef.current.find((node) => node.id === current.snapTarget?.nodeId);
      connect(
        {
          source: nodeId,
          target: current.snapTarget.nodeId,
          sourceHandle: `source-${side}`,
          targetHandle: current.snapTarget.targetHandle ?? `target-${current.snapTarget.side}`
        },
        {
          sourceAnchor: { side, ratio: 0.5, mode: "pinned" },
          targetAnchor: {
            side: current.snapTarget.side,
            ratio: current.snapTarget.ratio,
            mode: current.snapTarget.targetHandle
              ? "pinned"
              : targetNode?.type === "generationNode" || targetNode?.type === "videoGenerationNode" ? "auto" : "pinned"
          }
        }
      );
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancelPointerGesture);
    window.addEventListener("blur", cancelGesture);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    cleanupRef.current = cleanup;
  }, [cancel, clearDrag, connect, getZoom, nodesRef, openNodeCreateMenu, screenToFlowPosition]);

  return { drag, presentation, onHandlePointerDown, cancel };
}
