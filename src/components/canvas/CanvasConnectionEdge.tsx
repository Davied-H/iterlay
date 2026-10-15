import { useUiText } from "@/i18n";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  useReactFlow,
  useStore,
  type EdgeProps,
  type ReactFlowState
} from "@xyflow/react";
import {
  ArrowLeft,
  ArrowRight,
  CornerDownRight,
  Ellipsis,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  Spline,
  Workflow
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardConnectionStyle } from "@shared/types";
import {
  clampConnectionProgress,
  connectionBridgeGapPath,
  connectionBridgePath,
  hasConnectionDragIntent,
  midpoint,
  resolveConnectionDirectDragMode,
  resolveConnectionGestureModifiers,
  resolveConnectionPointerSelection,
  resolveConnectionWaypointDragPosition,
  snapConnectionPoint,
  type ConnectionLabelAnchor,
  type ConnectionPoint,
  type ConnectionRouteKind,
  type ConnectionRoutingDraft,
  type ConnectionSide
} from "./connection-interaction";
import {
  connectionEndpointGapPx,
  deleteConnectionWaypoint as deleteResolvedConnectionWaypoint,
  insertConnectionWaypoint as insertResolvedConnectionWaypoint,
  migrateLegacyConnectionRouting,
  moveConnectionSegment as moveResolvedConnectionSegment,
  moveConnectionWaypoint as moveResolvedConnectionWaypoint,
  offsetConnectionEndpoint,
  insetConnectionRoute,
  resolveConnectionRoute,
  resolveConnectionLabelAnchor,
  reanchorConnectionLabel,
  type ResolvedConnectionRoute
} from "./connection-routing";
import { screenPxToFlow } from "./canvas-coordinates";
import { isVideoGenerationTargetHandle, videoGenerationTargetHandleAnchorRatio } from "./canvas-node-layout";
import { pointAtConnectionPathProgress, projectPointToConnectionPath, sampleConnectionPath } from "./connection-label";
import {
  CanvasConnectionEdgeActionsContext,
  type CanvasConnectionAnchor,
  type CanvasConnectionEdgeData,
  type CanvasConnectionEdgeDraft,
  type CanvasConnectionTransactionKind
} from "./canvas-connection-edge-contract";

type EdgeGestureSample = {
  client: ConnectionPoint;
  flow: ConnectionPoint;
  delta: ConnectionPoint;
  shiftKey: boolean;
  bypassSnap: boolean;
};

type EdgeGesture = {
  pointerId: number;
  active: boolean;
  initial: CanvasConnectionEdgeDraft;
  latest: CanvasConnectionEdgeDraft;
  latestSample: EdgeGestureSample | null;
  frame: number | null;
  cleanup: () => void;
  cancel: () => void;
};

const GRID_SIZE = 8;
const DRAG_THRESHOLD_PX = 4;
const DEFAULT_MARKER_SIZE = 10;
const ENDPOINT_CENTER_SNAP_DISTANCE_PX = 10;
const COMIC_NODE_TYPES = new Set(["comicSettingNode", "comicCharacterNode", "comicSegmentNode"]);

export type ConnectionEdgeViewportMode = "none" | "zoom" | "overlay";

type ConnectionEdgeStoreSlice = {
  sourceNode: ReactFlowState["nodeLookup"] extends Map<string, infer T> ? T | undefined : never;
  targetNode: ReactFlowState["nodeLookup"] extends Map<string, infer T> ? T | undefined : never;
  zoom: number;
  viewportX: number;
  viewportY: number;
  viewportWidth: number;
  viewportHeight: number;
};

export function connectionEdgeViewportMode(input: {
  selected: boolean;
  hasLabel: boolean;
  editingLabel: boolean;
  hasMarker: boolean;
}): ConnectionEdgeViewportMode {
  if (input.selected || input.hasLabel || input.editingLabel) return "overlay";
  return "zoom";
}

export function selectConnectionEdgeStore(
  state: ReactFlowState,
  source: string,
  target: string,
  viewportMode: ConnectionEdgeViewportMode
): ConnectionEdgeStoreSlice {
  const usesZoom = viewportMode !== "none";
  const usesOverlay = viewportMode === "overlay";
  return {
    sourceNode: state.nodeLookup.get(source),
    targetNode: state.nodeLookup.get(target),
    zoom: usesZoom ? state.transform[2] : 1,
    viewportX: usesOverlay ? state.transform[0] : 0,
    viewportY: usesOverlay ? state.transform[1] : 0,
    viewportWidth: usesOverlay ? state.width : 0,
    viewportHeight: usesOverlay ? state.height : 0
  };
}

export function connectionEdgeStoreSlicesEqual(
  left: ConnectionEdgeStoreSlice,
  right: ConnectionEdgeStoreSlice
): boolean {
  return left.sourceNode === right.sourceNode
    && left.targetNode === right.targetNode
    && left.zoom === right.zoom
    && left.viewportX === right.viewportX
    && left.viewportY === right.viewportY
    && left.viewportWidth === right.viewportWidth
    && left.viewportHeight === right.viewportHeight;
}

function positionToSide(position: Position): ConnectionSide {
  if (position === Position.Top) return "top";
  if (position === Position.Bottom) return "bottom";
  if (position === Position.Left) return "left";
  return "right";
}

function handleSide(handleId: string | null | undefined, fallback: Position): ConnectionSide {
  if (isVideoGenerationTargetHandle(handleId)) return "left";
  if (handleId?.endsWith("-top")) return "top";
  if (handleId?.endsWith("-bottom")) return "bottom";
  if (handleId?.endsWith("-left")) return "left";
  if (handleId?.endsWith("-right")) return "right";
  return positionToSide(fallback);
}

function normalizeAnchor(
  value: CanvasConnectionEdgeData["sourceAnchor"],
  fallbackSide: ConnectionSide
): CanvasConnectionAnchor {
  if (typeof value === "number") {
    return { side: fallbackSide, ratio: clampConnectionProgress(value), mode: "pinned" };
  }
  return {
    side: value?.side ?? fallbackSide,
    ratio: clampConnectionProgress(value?.ratio ?? 0.5),
    mode: value?.mode ?? "auto"
  };
}

function copyDraft(draft: CanvasConnectionEdgeDraft): CanvasConnectionEdgeDraft {
  return {
    sourceAnchor: { ...draft.sourceAnchor },
    targetAnchor: { ...draft.targetAnchor },
    labelAnchor: { ...draft.labelAnchor },
    routing: { ...draft.routing, waypoints: draft.routing.waypoints.map((waypoint) => ({ ...waypoint })) }
  };
}

function endpointPosition(
  node: { internals: { positionAbsolute: ConnectionPoint }; measured: { width?: number; height?: number } } | undefined,
  anchor: CanvasConnectionAnchor,
  fallback: ConnectionPoint
): ConnectionPoint {
  const position = node?.internals.positionAbsolute;
  const width = node?.measured.width;
  const height = node?.measured.height;
  if (!position || !width || !height) return fallback;
  if (anchor.side === "left") return { x: position.x, y: position.y + height * anchor.ratio };
  if (anchor.side === "right") return { x: position.x + width, y: position.y + height * anchor.ratio };
  if (anchor.side === "top") return { x: position.x + width * anchor.ratio, y: position.y };
  return { x: position.x + width * anchor.ratio, y: position.y + height };
}

function endpointAxisSize(
  node: { measured: { width?: number; height?: number } } | undefined,
  anchor: CanvasConnectionAnchor
): number | undefined {
  return anchor.side === "left" || anchor.side === "right"
    ? node?.measured.height
    : node?.measured.width;
}

function overlayStyle(
  point: ConnectionPoint,
  zoom: number,
  align: { x?: -100 | -50 | 0; y?: -100 | -50 | 0 } = {}
): CSSProperties {
  return {
    transform: `translate(${align.x ?? -50}%, ${align.y ?? -50}%) translate(${point.x}px, ${point.y}px) scale(${1 / Math.max(0.05, zoom)})`
  };
}

function overlayAlignment(position: number, available: number, radius: number): -100 | -50 | 0 {
  if (position < radius + 8) return 0;
  if (position > available - radius - 8) return -100;
  return -50;
}

function routingEquals(a: ConnectionRoutingDraft, b: ConnectionRoutingDraft): boolean {
  return a.mode === b.mode
    && a.kind === b.kind
    && a.waypoints.length === b.waypoints.length
    && a.waypoints.every((waypoint, index) => {
      const other = b.waypoints[index];
      return waypoint.id === other?.id && waypoint.x === other.x && waypoint.y === other.y;
    });
}

export function connectionRouteMatchesAnchors(
  route: ResolvedConnectionRoute,
  source: ConnectionPoint,
  target: ConnectionPoint,
  sourceAnchor: CanvasConnectionAnchor,
  targetAnchor: CanvasConnectionAnchor
): boolean {
  const first = route.points[0];
  const last = route.points.at(-1);
  const endpointMatches = (
    point: ConnectionPoint,
    local: ConnectionPoint,
    anchor: CanvasConnectionAnchor
  ): boolean => {
    const xMatches = Math.abs(point.x - local.x) < 0.001;
    const yMatches = Math.abs(point.y - local.y) < 0.001;
    if (anchor.mode === "pinned") return xMatches && yMatches;
    return anchor.side === "left" || anchor.side === "right" ? xMatches : yMatches;
  };
  return Boolean(
    first
    && last
    && Number.isFinite(first.x)
    && Number.isFinite(first.y)
    && Number.isFinite(last.x)
    && Number.isFinite(last.y)
    && endpointMatches(first, source, sourceAnchor)
    && endpointMatches(last, target, targetAnchor)
  );
}

function segmentDirection(segment: ResolvedConnectionRoute["segments"][number]): string {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  if (segment.axis === "x") return `x:${dx < 0 ? "-" : "+"}`;
  if (segment.axis === "y") return `y:${dy < 0 ? "-" : "+"}`;
  return `d:${dx < 0 ? "-" : "+"}:${dy < 0 ? "-" : "+"}`;
}

/** Prevent a delayed refinement from switching to the other side of an obstacle. */
export function connectionRoutesShareTopology(
  current: ResolvedConnectionRoute,
  refinement: ResolvedConnectionRoute
): boolean {
  if (current.kind !== refinement.kind || current.mode !== refinement.mode) return false;
  if (current.segments.length !== refinement.segments.length) return false;
  return current.segments.every((segment, index) => (
    segmentDirection(segment) === segmentDirection(refinement.segments[index])
  ));
}

export function selectConnectionRouteRefinement(
  current: ResolvedConnectionRoute,
  refinement: ResolvedConnectionRoute | undefined
): ResolvedConnectionRoute {
  return refinement && connectionRoutesShareTopology(current, refinement)
    ? refinement
    : current;
}

export function connectionDashPattern(
  dash: BoardConnectionStyle["dash"],
  widthValue: number | undefined
): string {
  if (dash === "solid" || dash === undefined) return "none";
  const width = Math.min(8, Math.max(1, widthValue ?? 1.5));
  const gap = width + 3;
  return dash === "dotted" ? `0 ${gap}` : `5 ${gap}`;
}

export function isGenerationResultConnection(
  kind: CanvasConnectionEdgeData["kind"],
  label: CanvasConnectionEdgeData["label"],
  sourceType: string | undefined
): boolean {
  return sourceType === "generationNode" && kind !== "reference" && label === "生成结果";
}

export function connectionEndMarker(
  marker: BoardConnectionStyle["endMarker"],
  generationResult: boolean
): BoardConnectionStyle["endMarker"] {
  return generationResult ? "arrow" : marker;
}

export function connectionMarkerSize(value: number | undefined): number {
  return Math.min(20, Math.max(6, value ?? DEFAULT_MARKER_SIZE));
}

export function resolveDraggedEndpointCoordinate(input: {
  raw: number;
  base: number;
  size: number;
  gridSize: number;
  centerSnapDistance: number;
  bypassSnap: boolean;
}): number {
  if (input.bypassSnap) return input.raw;
  const center = input.base + input.size / 2;
  if (Math.abs(input.raw - center) <= input.centerSnapDistance) return center;
  return Math.round(input.raw / input.gridSize) * input.gridSize;
}

export function CanvasConnectionEdge({
  id,
  selected,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data
}: EdgeProps): React.ReactElement {
  const uiText = useUiText();

  const actions = useContext(CanvasConnectionEdgeActionsContext);
  const { screenToFlowPosition } = useReactFlow();
  const edgeData = (data ?? {}) as CanvasConnectionEdgeData;
  const connectionStyle = edgeData.style ?? {};
  const generationResultCandidate = edgeData.kind !== "reference" && edgeData.label === "生成结果";
  const editingLabel = actions.editingEdgeId === id;
  const viewportMode = connectionEdgeViewportMode({
    selected: Boolean(selected),
    hasLabel: Boolean(edgeData.label),
    editingLabel,
    hasMarker: connectionStyle.startMarker === "arrow"
      || connectionStyle.endMarker === "arrow"
      || generationResultCandidate
  });
  const {
    sourceNode,
    targetNode,
    zoom,
    viewportX,
    viewportY,
    viewportWidth,
    viewportHeight
  } = useStore(
    (state) => selectConnectionEdgeStore(state, source, target, viewportMode),
    connectionEdgeStoreSlicesEqual
  );
  const sourceSide = handleSide(sourceHandleId, sourcePosition);
  const targetSide = handleSide(targetHandleId, targetPosition);
  const inputDraft = useMemo<CanvasConnectionEdgeDraft>(() => {
    const sourceAnchor = normalizeAnchor(edgeData.sourceAnchor, sourceSide);
    const normalizedTargetAnchor = normalizeAnchor(edgeData.targetAnchor, targetSide);
    const semanticTargetRatio = videoGenerationTargetHandleAnchorRatio(
      targetHandleId,
      targetNode?.measured.height
    );
    const targetAnchor: CanvasConnectionAnchor = semanticTargetRatio === undefined
      ? normalizedTargetAnchor
      : { side: "left", ratio: semanticTargetRatio, mode: "pinned" };
    const inputSourcePoint = endpointPosition(sourceNode, sourceAnchor, { x: sourceX, y: sourceY });
    const inputTargetPoint = endpointPosition(targetNode, targetAnchor, { x: targetX, y: targetY });
    return {
      sourceAnchor,
      targetAnchor,
      labelAnchor: edgeData.labelAnchor
        ? {
            ...edgeData.labelAnchor,
            progress: clampConnectionProgress(edgeData.labelAnchor.progress),
            globalProgress: edgeData.labelAnchor.globalProgress === undefined
              ? undefined
              : clampConnectionProgress(edgeData.labelAnchor.globalProgress)
          }
        : { progress: clampConnectionProgress(edgeData.labelProgress ?? 0.5) },
      routing: migrateLegacyConnectionRouting(
        edgeData.routing,
        edgeData.routeCoordinate,
        { ...inputSourcePoint, side: sourceAnchor.side },
        { ...inputTargetPoint, side: targetAnchor.side }
      )
    };
  }, [
    edgeData.labelAnchor,
    edgeData.labelProgress,
    edgeData.routeCoordinate,
    edgeData.routing,
    edgeData.sourceAnchor,
    edgeData.targetAnchor,
    sourceNode,
    sourceX,
    sourceY,
    sourceSide,
    targetNode,
    targetX,
    targetY,
    targetSide,
    targetHandleId
  ]);
  const [draft, setDraft] = useState<CanvasConnectionEdgeDraft>(inputDraft);
  const [draggingEndpoint, setDraggingEndpoint] = useState<"source" | "target" | null>(null);
  const draftRef = useRef(draft);
  const gestureRef = useRef<EdgeGesture | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(0);
  const markerUid = useId().replace(/[^a-zA-Z0-9_-]/g, "-");

  useEffect(() => {
    if (gestureRef.current) return;
    const next = copyDraft(inputDraft);
    draftRef.current = next;
    setDraft(next);
  }, [inputDraft]);

  useEffect(() => () => gestureRef.current?.cancel(), []);

  const localSourcePoint = endpointPosition(sourceNode, draft.sourceAnchor, { x: sourceX, y: sourceY });
  const localTargetPoint = endpointPosition(targetNode, draft.targetAnchor, { x: targetX, y: targetY });
  const providedRoute = edgeData.resolvedRoute;
  const matchedProvidedRoute = providedRoute
    && routingEquals(providedRoute.routing, draft.routing)
    && connectionRouteMatchesAnchors(
      providedRoute,
      localSourcePoint,
      localTargetPoint,
      draft.sourceAnchor,
      draft.targetAnchor
    )
    ? providedRoute : undefined;
  const sourcePoint = matchedProvidedRoute && draft.sourceAnchor.mode === "auto"
    ? matchedProvidedRoute.points[0]
    : localSourcePoint;
  const targetPoint = matchedProvidedRoute && draft.targetAnchor.mode === "auto"
    ? matchedProvidedRoute.points.at(-1)!
    : localTargetPoint;
  const localResolvedRoute = resolveConnectionRoute({
    source: { ...sourcePoint, side: draft.sourceAnchor.side },
    target: { ...targetPoint, side: draft.targetAnchor.side },
    routing: draft.routing,
    routeCoordinate: edgeData.routeCoordinate,
    obstacles: edgeData.obstacles
  });
  const resolvedRoute = selectConnectionRouteRefinement(localResolvedRoute, matchedProvidedRoute);
  const sourceEndpointGap = screenPxToFlow(connectionEndpointGapPx(
    endpointAxisSize(sourceNode, draft.sourceAnchor),
    draft.sourceAnchor.ratio,
    zoom
  ), zoom);
  const targetEndpointGap = screenPxToFlow(connectionEndpointGapPx(
    endpointAxisSize(targetNode, draft.targetAnchor),
    draft.targetAnchor.ratio,
    zoom
  ), zoom);
  const insetRoute = insetConnectionRoute(
    resolvedRoute,
    sourceEndpointGap,
    targetEndpointGap
  );
  const visibleRoute = isVideoGenerationTargetHandle(targetHandleId)
    ? resolveConnectionRoute({
        source: { ...insetRoute.points[0], side: draft.sourceAnchor.side },
        target: {
          ...offsetConnectionEndpoint(targetPoint, draft.targetAnchor.side, targetEndpointGap),
          side: draft.targetAnchor.side
        },
        routing: draft.routing,
        routeCoordinate: edgeData.routeCoordinate,
        obstacles: edgeData.obstacles
      })
    : insetRoute;
  const geometry = {
    points: resolvedRoute.points,
    segments: resolvedRoute.segments.map((segment) => ({
      id: segment.id,
      index: segment.index,
      start: segment.start,
      end: segment.end,
      orientation: segment.axis === "x" ? "horizontal" as const
        : segment.axis === "y" ? "vertical" as const : "diagonal" as const
    })),
    path: resolvedRoute.path
  };
  const sampledPath = useMemo(() => sampleConnectionPath(geometry.path), [geometry.path]);
  const resolvedLabel = resolveConnectionLabelAnchor(resolvedRoute, draft.labelAnchor, edgeData.labelProgress);
  const labelPoint = resolvedRoute.kind === "curved"
    ? pointAtConnectionPathProgress(sampledPath, resolvedLabel.pathProgress)
    : resolvedLabel.point;
  const toolbarPoint = pointAtConnectionPathProgress(sampledPath, 0.5);
  const toolbarScreen = {
    x: toolbarPoint.x * zoom + viewportX,
    y: toolbarPoint.y * zoom + viewportY
  };
  const floatingToolbarPoint = {
    x: toolbarPoint.x,
    y: toolbarPoint.y + (toolbarScreen.y < 52 ? 34 : -34) / Math.max(zoom, 0.05)
  };
  const toolbarAlignment = {
    x: overlayAlignment(toolbarScreen.x, viewportWidth, 164),
    y: -50 as const
  };
  const labelScreen = {
    x: labelPoint.x * zoom + viewportX,
    y: labelPoint.y * zoom + viewportY
  };
  const labelAlignment = {
    x: overlayAlignment(labelScreen.x, viewportWidth, 176),
    y: overlayAlignment(labelScreen.y, viewportHeight, 22)
  };
  const publish = useCallback((
    phase: "begin" | "change" | "commit" | "cancel",
    kind: CanvasConnectionTransactionKind,
    targetId: string | undefined,
    before: CanvasConnectionEdgeDraft,
    after: CanvasConnectionEdgeDraft
  ): void => {
    actions[phase]({ edgeId: id, kind, targetId, before: copyDraft(before), after: copyDraft(after) });
  }, [actions, id]);

  const setPreview = useCallback((next: CanvasConnectionEdgeDraft): void => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const beginGesture = useCallback((
    event: ReactPointerEvent<HTMLElement | SVGPathElement>,
    kind: CanvasConnectionTransactionKind,
    targetId: string | undefined,
    calculate: (sample: EdgeGestureSample, initial: CanvasConnectionEdgeDraft) => CanvasConnectionEdgeDraft,
    onFinish?: () => void
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (gestureRef.current) gestureRef.current.cancel();
    const pointerSelection = resolveConnectionPointerSelection(Boolean(selected), event);
    if (pointerSelection.shouldSelect) {
      actions.select(id, pointerSelection.additive);
    }
    const pointerId = event.pointerId;
    const startClient = { x: event.clientX, y: event.clientY };
    const startFlow = screenToFlowPosition(startClient);
    const initial = copyDraft(draftRef.current);
    const captureTarget = event.currentTarget.closest(".react-flow") ?? event.currentTarget;
    let finished = false;

    const applyLatest = (): void => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== pointerId || !gesture.latestSample) return;
      gesture.frame = null;
      const next = calculate(gesture.latestSample, initial);
      gesture.latest = next;
      setPreview(next);
      publish("change", kind, targetId, initial, next);
    };

    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      const gesture = gestureRef.current;
      if (gesture?.frame != null) cancelAnimationFrame(gesture.frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      captureTarget.removeEventListener("lostpointercapture", onLostPointerCapture);
      try {
        if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
      } catch {
        // Chromium may release capture before pointerup/cancel cleanup runs.
      }
      if (gestureRef.current?.pointerId === pointerId) gestureRef.current = null;
      onFinish?.();
    };

    const updateSample = (pointerEvent: globalThis.PointerEvent): boolean => {
      if (pointerEvent.pointerId !== pointerId) return false;
      const gesture = gestureRef.current;
      if (!gesture) return false;
      const client = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      if (!gesture.active && !hasConnectionDragIntent(startClient, client, DRAG_THRESHOLD_PX)) return false;
      if (!gesture.active) {
        gesture.active = true;
        publish("begin", kind, targetId, initial, initial);
      }
      const flow = screenToFlowPosition(client);
      const modifiers = resolveConnectionGestureModifiers(pointerEvent);
      gesture.latestSample = {
        client,
        flow,
        delta: { x: flow.x - startFlow.x, y: flow.y - startFlow.y },
        shiftKey: modifiers.lockAxis,
        bypassSnap: modifiers.bypassSnap
      };
      return true;
    };

    function onPointerMove(pointerEvent: globalThis.PointerEvent): void {
      if (!updateSample(pointerEvent)) return;
      const gesture = gestureRef.current;
      if (gesture && gesture.frame === null) gesture.frame = requestAnimationFrame(applyLatest);
    }

    function onPointerUp(pointerEvent: globalThis.PointerEvent): void {
      updateSample(pointerEvent);
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== pointerId) return;
      if (gesture.frame !== null) {
        cancelAnimationFrame(gesture.frame);
        gesture.frame = null;
        applyLatest();
      }
      const latest = copyDraft(gesture.latest);
      const active = gesture.active;
      cleanup();
      if (active) publish("commit", kind, targetId, initial, latest);
    }

    function cancel(): void {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== pointerId) return;
      const active = gesture.active;
      cleanup();
      if (!active) return;
      setPreview(initial);
      publish("cancel", kind, targetId, initial, initial);
    }

    function onPointerCancel(pointerEvent: globalThis.PointerEvent): void {
      if (pointerEvent.pointerId === pointerId) cancel();
    }

    function onKeyDown(keyEvent: globalThis.KeyboardEvent): void {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      cancel();
    }

    function onBlur(): void {
      cancel();
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") cancel();
    }

    function onLostPointerCapture(lostEvent: Event): void {
      if ((lostEvent as globalThis.PointerEvent).pointerId === pointerId) cancel();
    }

    const gesture: EdgeGesture = {
      pointerId,
      active: false,
      initial,
      latest: initial,
      latestSample: null,
      frame: null,
      cleanup,
      cancel
    };
    gestureRef.current = gesture;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    captureTarget.addEventListener("lostpointercapture", onLostPointerCapture);
    try {
      captureTarget.setPointerCapture(pointerId);
    } catch {
      // Capture is an enhancement; window listeners still complete the transaction.
    }
  }, [actions, id, publish, screenToFlowPosition, selected, setPreview]);

  const commitImmediate = useCallback((
    kind: CanvasConnectionTransactionKind,
    targetId: string | undefined,
    transform: (before: CanvasConnectionEdgeDraft) => CanvasConnectionEdgeDraft
  ): void => {
    actions.select(id);
    const before = copyDraft(draftRef.current);
    const after = transform(copyDraft(before));
    publish("begin", kind, targetId, before, before);
    setPreview(after);
    publish("change", kind, targetId, before, after);
    publish("commit", kind, targetId, before, after);
  }, [actions, id, publish, setPreview]);

  const startSegmentDrag = (
    segmentIndex: number,
    event: ReactPointerEvent<SVGPathElement | HTMLButtonElement>
  ): void => {
    const startGeometry = geometry;
    const segment = startGeometry.segments[segmentIndex];
    if (!segment) return;
    if (resolveConnectionDirectDragMode(resolvedRoute.kind, segment.orientation) === "insert-waypoint") {
      const projection = projectPointToConnectionPath(sampledPath, screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      }));
      startMidpointDrag(segmentIndex, event, projection.point);
      return;
    }
    beginGesture(event, "segment", segment.id, (sample, initial) => {
      const coordinate = segment.orientation === "horizontal"
        ? snapConnectionPoint(
            { x: 0, y: segment.start.y + sample.delta.y },
            GRID_SIZE,
            sample.bypassSnap
          ).y
        : snapConnectionPoint(
            { x: segment.start.x + sample.delta.x, y: 0 },
            GRID_SIZE,
            sample.bypassSnap
          ).x;
      return {
        ...initial,
        routing: moveResolvedConnectionSegment(initial.routing, resolvedRoute, segment.id, coordinate)
      };
    });
  };

  const startWaypointDrag = (
    waypointId: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ): void => {
    beginGesture(event, "waypoint", waypointId, (sample, initial) => {
      const original = initial.routing.waypoints.find((waypoint) => waypoint.id === waypointId);
      if (!original) return initial;
      const point = resolveConnectionWaypointDragPosition({
        origin: original,
        delta: sample.delta,
        gridSize: GRID_SIZE,
        lockAxis: sample.shiftKey,
        bypassSnap: sample.bypassSnap
      });
      return {
        ...initial,
        routing: moveResolvedConnectionWaypoint(initial.routing, waypointId, point)
      };
    });
  };

  const startMidpointDrag = (
    segmentIndex: number,
    event: ReactPointerEvent<HTMLButtonElement | SVGPathElement>,
    initialPoint?: ConnectionPoint
  ): void => {
    const startGeometry = geometry;
    const segment = startGeometry.segments[segmentIndex];
    if (!segment) return;
    const waypointId = `${id}:waypoint:${++sequenceRef.current}`;
    const center = initialPoint ?? midpoint(segment.start, segment.end);
    beginGesture(event, "waypoint", waypointId, (sample, initial) => {
      const point = resolveConnectionWaypointDragPosition({
        origin: center,
        delta: sample.delta,
        gridSize: GRID_SIZE,
        lockAxis: sample.shiftKey,
        bypassSnap: sample.bypassSnap
      });
      return {
        ...initial,
        routing: resolvedRoute.kind === "straight"
          ? { mode: "manual", kind: "curved", waypoints: [{ id: waypointId, ...point }] }
          : insertResolvedConnectionWaypoint(
              initial.routing,
              resolvedRoute,
              segment.id,
              point,
              waypointId
            )
      };
    });
  };

  const startEndpointDrag = (
    endpoint: "source" | "target",
    event: ReactPointerEvent<HTMLButtonElement>
  ): void => {
    const node = endpoint === "source" ? sourceNode : targetNode;
    const anchor = endpoint === "source" ? draft.sourceAnchor : draft.targetAnchor;
    const position = node?.internals.positionAbsolute;
    const size = anchor.side === "left" || anchor.side === "right" ? node?.measured.height : node?.measured.width;
    if (!position || !size) return;
    setDraggingEndpoint(endpoint);
    beginGesture(event, "endpoint", endpoint, (sample, initial) => {
      const base = anchor.side === "left" || anchor.side === "right" ? position.y : position.x;
      const raw = anchor.side === "left" || anchor.side === "right" ? sample.flow.y : sample.flow.x;
      const snapped = resolveDraggedEndpointCoordinate({
        raw,
        base,
        size,
        gridSize: GRID_SIZE,
        centerSnapDistance: screenPxToFlow(ENDPOINT_CENTER_SNAP_DISTANCE_PX, zoom),
        bypassSnap: sample.bypassSnap
      });
      const nextAnchor = { ...anchor, ratio: clampConnectionProgress((snapped - base) / size), mode: "pinned" as const };
      return endpoint === "source"
        ? { ...initial, sourceAnchor: nextAnchor }
        : { ...initial, targetAnchor: nextAnchor };
    }, () => setDraggingEndpoint(null));
  };

  const startLabelDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    beginGesture(event, "label", undefined, (sample, initial) => ({
      ...initial,
      labelAnchor: resolvedRoute.kind === "curved"
        ? (() => {
            const progress = projectPointToConnectionPath(sampledPath, sample.flow).progress;
            return { progress, globalProgress: progress };
          })()
        : reanchorConnectionLabel(resolvedRoute, sample.flow).anchor
    }));
  };

  const labelAnchorAtPoint = (point: ConnectionPoint): ConnectionLabelAnchor => (
    resolvedRoute.kind === "curved"
      ? (() => {
          const progress = projectPointToConnectionPath(sampledPath, point).progress;
          return { progress, globalProgress: progress };
        })()
      : reanchorConnectionLabel(resolvedRoute, point).anchor
  );

  const keyboardWaypoint = (
    waypointId: string,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void => {
    const delta = event.key === "ArrowLeft" ? { x: -1, y: 0 }
      : event.key === "ArrowRight" ? { x: 1, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -1 }
          : event.key === "ArrowDown" ? { x: 0, y: 1 }
            : null;
    if (!delta) return;
    event.preventDefault();
    const multiplier = (event.shiftKey ? 10 : 1) / Math.max(zoom, 0.05);
    commitImmediate("waypoint", waypointId, (before) => ({
      ...before,
      routing: (() => {
        const original = before.routing.waypoints.find((waypoint) => waypoint.id === waypointId);
        if (!original) return before.routing;
        return moveResolvedConnectionWaypoint(before.routing, waypointId, {
          x: original.x + delta.x * multiplier,
          y: original.y + delta.y * multiplier
        });
      })()
    }));
  };

  const keyboardEndpoint = (
    endpoint: "source" | "target",
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void => {
    const anchor = endpoint === "source" ? draft.sourceAnchor : draft.targetAnchor;
    const verticalSide = anchor.side === "left" || anchor.side === "right";
    const direction = verticalSide
      ? event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0
      : event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    commitImmediate("endpoint", endpoint, (before) => {
      const current = endpoint === "source" ? before.sourceAnchor : before.targetAnchor;
      const next = { ...current, ratio: clampConnectionProgress(current.ratio + direction * step), mode: "pinned" as const };
      return endpoint === "source" ? { ...before, sourceAnchor: next } : { ...before, targetAnchor: next };
    });
  };

  const keyboardLabel = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.startLabelEdit?.(id, draft.labelAnchor);
      return;
    }
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    commitImmediate("label", undefined, (before) => {
      const resolved = resolveConnectionLabelAnchor(resolvedRoute, {
        ...before.labelAnchor,
        progress: clampConnectionProgress(before.labelAnchor.progress + direction * step)
      });
      return { ...before, labelAnchor: resolved.anchor };
    });
  };

  const setRoutingKind = (kind: ConnectionRouteKind): void => {
    if (actions.applyToSelection) {
      actions.applyToSelection(id, { type: "set-routing-kind", kind });
      return;
    }
    commitImmediate("routing-kind", kind, (before) => ({
      ...before,
      routing: { ...before.routing, kind, mode: before.routing.waypoints.length ? "manual" : "auto" }
    }));
  };

  const applyStyle = (style: Partial<BoardConnectionStyle>): void => {
    actions.applyToSelection?.(id, { type: "set-style", style });
  };

  const generationResult = isGenerationResultConnection(edgeData.kind, edgeData.label, sourceNode?.type);
  const comicDependency = COMIC_NODE_TYPES.has(sourceNode?.type ?? "")
    && COMIC_NODE_TYPES.has(targetNode?.type ?? "");
  const endMarker = connectionEndMarker(connectionStyle.endMarker, generationResult);
  const markerSize = connectionMarkerSize(connectionStyle.markerSize);
  const connectionWidth = Math.min(8, Math.max(1, connectionStyle.width ?? 1.5));
  const edgeStyle = {
    "--canvas-connection-color": connectionStyle.color ?? (
      comicDependency
        ? "hsl(var(--muted-foreground))"
        : edgeData.kind === "reference" || generationResult ? "hsl(var(--canvas-ai-accent))" : undefined
    ),
    "--canvas-connection-width": `${connectionWidth}px`,
    "--canvas-connection-dash": connectionDashPattern(connectionStyle.dash, connectionWidth)
  } as CSSProperties;
  const markerPrefix = `canvas-connection-marker-${markerUid}`;
  const markerUrl = (position: "source" | "target", marker: "none" | "arrow" | undefined): string | undefined => (
    marker && marker !== "none" ? `url(#${markerPrefix}-${position}-${marker})` : undefined
  );
  const editableWaypoints = draft.routing.mode === "manual"
    ? draft.routing.waypoints
    : [];

  return (
    <>
      <defs style={edgeStyle}>
        <marker
          id={`${markerPrefix}-source-arrow`}
          viewBox="0 0 8 8"
          markerUnits="userSpaceOnUse"
          markerWidth={markerSize / Math.max(zoom, 0.05)}
          markerHeight={markerSize / Math.max(zoom, 0.05)}
          refX="0"
          refY="4"
          orient="auto-start-reverse"
          overflow="visible"
        >
          <path d="M 8 0 L 0 4 L 8 8 Z" className="canvas-connection-marker-fill" />
        </marker>
        <marker
          id={`${markerPrefix}-target-arrow`}
          viewBox="0 0 8 8"
          markerUnits="userSpaceOnUse"
          markerWidth={markerSize / Math.max(zoom, 0.05)}
          markerHeight={markerSize / Math.max(zoom, 0.05)}
          refX="8"
          refY="4"
          orient="auto"
          overflow="visible"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" className="canvas-connection-marker-fill" />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={visibleRoute.path}
        interactionWidth={1}
        className={cn(
          "canvas-connection-edge",
          generationResult && "is-generation-result",
          selected && "is-selected"
        )}
        style={edgeStyle}
        markerStart={markerUrl("source", connectionStyle.startMarker)}
        markerEnd={markerUrl("target", endMarker)}
      />
      {generationResult ? (
        <path
          d={visibleRoute.path}
          className="canvas-connection-result-flow"
          style={edgeStyle}
          aria-hidden="true"
        />
      ) : null}
      {connectionStyle.lineJumps ? edgeData.lineJumps?.map((bridge) => (
        <g key={bridge.id} className="canvas-connection-bridge" style={edgeStyle} aria-hidden="true">
          <path className="canvas-connection-bridge-gap" d={connectionBridgeGapPath(bridge)} />
          <path className="canvas-connection-bridge-stroke" d={connectionBridgePath(bridge)} />
        </g>
      )) : null}
      {resolvedRoute.kind === "curved" ? (
        <path
          d={geometry.path}
          className="canvas-connection-segment-hit"
          onClick={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => {
            const projection = projectPointToConnectionPath(sampledPath, screenToFlowPosition({
              x: event.clientX,
              y: event.clientY
            }));
            const segmentIndex = Math.min(
              geometry.segments.length - 1,
              Math.max(0, Math.floor(projection.progress * geometry.segments.length))
            );
            startMidpointDrag(segmentIndex, event, projection.point);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            actions.startLabelEdit?.(id, labelAnchorAtPoint(screenToFlowPosition({
              x: event.clientX,
              y: event.clientY
            })));
          }}
        />
      ) : geometry.segments.map((segment) => (
        <path
          key={segment.id}
          d={`M ${segment.start.x} ${segment.start.y} L ${segment.end.x} ${segment.end.y}`}
          className="canvas-connection-segment-hit"
          onClick={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => startSegmentDrag(segment.index, event)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            actions.startLabelEdit?.(id, labelAnchorAtPoint(screenToFlowPosition({
              x: event.clientX,
              y: event.clientY
            })));
          }}
        />
      ))}
      <EdgeLabelRenderer>
        {selected ? (
          <>
            {draggingEndpoint ? (
              <span
                aria-hidden
                data-snapped={Math.abs((draggingEndpoint === "source" ? draft.sourceAnchor : draft.targetAnchor).ratio - 0.5) < 0.0001 ? "true" : undefined}
                className="canvas-connection-center-anchor"
                style={overlayStyle(
                  endpointPosition(
                    draggingEndpoint === "source" ? sourceNode : targetNode,
                    {
                      ...(draggingEndpoint === "source" ? draft.sourceAnchor : draft.targetAnchor),
                      ratio: 0.5,
                      mode: "pinned"
                    },
                    draggingEndpoint === "source" ? sourcePoint : targetPoint
                  ),
                  zoom
                )}
              />
            ) : null}
            <button
              type="button"
              aria-label={uiText("拖动连接起点")}
              title={uiText("拖动连接起点")}
              className="nodrag nopan canvas-connection-endpoint"
              style={overlayStyle(sourcePoint, zoom)}
              onPointerDown={(event) => startEndpointDrag("source", event)}
              onKeyDown={(event) => keyboardEndpoint("source", event)}
            />
            <button
              type="button"
              aria-label={uiText("拖动连接终点")}
              title={uiText("拖动连接终点")}
              className="nodrag nopan canvas-connection-endpoint"
              style={overlayStyle(targetPoint, zoom)}
              onPointerDown={(event) => startEndpointDrag("target", event)}
              onKeyDown={(event) => keyboardEndpoint("target", event)}
            />
            {editableWaypoints.map((waypoint) => (
              <button
                key={waypoint.id}
                type="button"
                aria-label={uiText("拖动拐点，双击删除")}
                title={uiText("拖动拐点，双击删除")}
                className="nodrag nopan canvas-connection-waypoint"
                style={overlayStyle(waypoint, zoom)}
                onPointerDown={(event) => startWaypointDrag(waypoint.id, event)}
                onKeyDown={(event) => keyboardWaypoint(waypoint.id, event)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  commitImmediate("waypoint", waypoint.id, (before) => ({
                    ...before,
                    routing: deleteResolvedConnectionWaypoint(before.routing, waypoint.id)
                  }));
                }}
              />
            ))}
            {geometry.segments.map((segment) => {
              const center = resolvedRoute.kind === "curved"
                ? pointAtConnectionPathProgress(
                    sampledPath,
                    (segment.index + 0.5) / Math.max(1, geometry.segments.length)
                  )
                : midpoint(segment.start, segment.end);
              return (
                <button
                  key={`midpoint:${segment.id}`}
                  type="button"
                  aria-label={uiText("拖动以新增拐点")}
                  title={uiText("拖动以新增拐点")}
                  className="nodrag nopan canvas-connection-midpoint"
                  style={overlayStyle(center, zoom)}
                  onPointerDown={(event) => startMidpointDrag(segment.index, event, center)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    const waypointId = `${id}:waypoint:${++sequenceRef.current}`;
                    commitImmediate("waypoint", waypointId, (before) => ({
                      ...before,
                      routing: resolvedRoute.kind === "straight"
                        ? { mode: "manual", kind: "curved", waypoints: [{ id: waypointId, ...center }] }
                        : insertResolvedConnectionWaypoint(
                            before.routing,
                            resolvedRoute,
                            segment.id,
                            center,
                            waypointId
                          )
                    }));
                  }}
                />
              );
            })}
            {(edgeData.toolbarOwner ?? true) ? <div
              role="toolbar"
              aria-label={uiText("连接线路由")}
              className="nodrag nopan canvas-connection-toolbar"
              style={overlayStyle(floatingToolbarPoint, zoom, toolbarAlignment)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={uiText("直线")}
                title={uiText("直线")}
                aria-pressed={draft.routing.kind === "straight"}
                onClick={() => setRoutingKind("straight")}
              ><Minus aria-hidden="true" /></button>
              <button
                type="button"
                aria-label={uiText("正交线")}
                title={uiText("正交线")}
                aria-pressed={draft.routing.kind === "orthogonal"}
                onClick={() => setRoutingKind("orthogonal")}
              ><CornerDownRight aria-hidden="true" /></button>
              <button
                type="button"
                aria-label={uiText("曲线")}
                title={uiText("曲线")}
                aria-pressed={draft.routing.kind === "curved"}
                onClick={() => setRoutingKind("curved")}
              ><Spline aria-hidden="true" /></button>
              <span aria-hidden="true" />
              <label className="canvas-connection-color" title={uiText("连接线颜色")}>
                <span className="sr-only">{uiText("连接线颜色")}</span>
                <input
                  type="color"
                  aria-label={uiText("连接线颜色")}
                  value={/^#[0-9a-f]{6}$/iu.test(connectionStyle.color ?? "") ? connectionStyle.color : "#52525b"}
                  disabled={!actions.applyToSelection}
                  onChange={(event) => applyStyle({ color: event.currentTarget.value })}
                />
              </label>
              <button
                type="button"
                aria-label={uiText("切换连接线宽度")}
                title={uiText("线宽 {{ui:0}}px", [connectionStyle.width ?? 1.5])}
                disabled={!actions.applyToSelection}
                onClick={() => {
                  const widths = [1.5, 2.5, 4];
                  const current = widths.indexOf(connectionStyle.width ?? 1.5);
                  applyStyle({ width: widths[(current + 1) % widths.length] });
                }}
              ><SlidersHorizontal aria-hidden="true" /></button>
              <button
                type="button"
                aria-label={uiText("切换实线或虚线")}
                title={uiText("线型 {{ui:0}}", [connectionStyle.dash ?? "solid"])}
                disabled={!actions.applyToSelection}
                onClick={() => {
                  const dashes = ["solid", "dashed", "dotted"] as const;
                  const current = dashes.indexOf(connectionStyle.dash ?? "solid");
                  applyStyle({ dash: dashes[(current + 1) % dashes.length] });
                }}
              ><Ellipsis aria-hidden="true" /></button>
              <button
                type="button"
                aria-label={uiText("切换起点箭头")}
                title={uiText("起点箭头")}
                aria-pressed={connectionStyle.startMarker === "arrow"}
                disabled={!actions.applyToSelection}
                onClick={() => applyStyle({
                  startMarker: connectionStyle.startMarker === "arrow" ? "none" : "arrow"
                })}
              ><ArrowLeft aria-hidden="true" /></button>
              <button
                type="button"
                aria-label={uiText("切换终点箭头")}
                title={uiText("终点箭头")}
                aria-pressed={connectionStyle.endMarker === "arrow"}
                disabled={!actions.applyToSelection}
                onClick={() => applyStyle({
                  endMarker: connectionStyle.endMarker === "arrow" ? "none" : "arrow"
                })}
              ><ArrowRight aria-hidden="true" /></button>
              {(connectionStyle.startMarker === "arrow" || endMarker === "arrow") ? (
                <label className="canvas-connection-marker-size" title={uiText("箭头大小 {{ui:0}}px", [markerSize])}>
                  <span className="sr-only">{uiText("箭头大小")}</span>
                  <input
                    type="range"
                    min="6"
                    max="20"
                    step="2"
                    aria-label={uiText("箭头大小")}
                    value={markerSize}
                    disabled={!actions.applyToSelection}
                    onChange={(event) => applyStyle({ markerSize: Number(event.currentTarget.value) })}
                  />
                </label>
              ) : null}
              <button
                type="button"
                aria-label={uiText("切换跨线桥")}
                title={uiText("跨线桥")}
                aria-pressed={connectionStyle.lineJumps === true}
                disabled={!actions.applyToSelection}
                onClick={() => applyStyle({ lineJumps: !connectionStyle.lineJumps })}
              ><Workflow aria-hidden="true" /></button>
              <span aria-hidden="true" />
              <button
                type="button"
                aria-label={uiText("重置为自动路径")}
                title={uiText("重置为自动路径")}
                disabled={draft.routing.mode === "auto" && draft.routing.waypoints.length === 0}
                onClick={() => {
                  if (actions.applyToSelection) {
                    actions.applyToSelection(id, { type: "reset-routing" });
                    return;
                  }
                  commitImmediate("reset-route", undefined, (before) => ({
                    ...before,
                    routing: { ...before.routing, mode: "auto", waypoints: [] }
                  }));
                }}
              ><RotateCcw aria-hidden="true" /></button>
            </div> : null}
          </>
        ) : null}
        {(edgeData.label || editingLabel) ? (
          <div
            ref={labelRef}
            className="nodrag nopan canvas-connection-label"
            style={overlayStyle(labelPoint, zoom, labelAlignment)}
            role={editingLabel ? undefined : "button"}
            tabIndex={editingLabel ? undefined : 0}
            aria-label={editingLabel ? undefined : uiText("拖动连接线文字")}
            onPointerDown={editingLabel ? undefined : startLabelDrag}
            onKeyDown={editingLabel ? undefined : keyboardLabel}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              actions.startLabelEdit?.(id, draft.labelAnchor);
            }}
          >
            {editingLabel ? (
              <input
                autoFocus
                defaultValue={edgeData.label ?? ""}
                aria-label={uiText("连接线文字")}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={(event) => actions.updateLabel?.(id, event.currentTarget.value.trim())}
                onKeyDown={(event) => {
                  const restoreKeyboardFocus = (): void => {
                    requestAnimationFrame(() => labelRef.current?.focus({ preventScroll: true }));
                  };
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    restoreKeyboardFocus();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.value = edgeData.label ?? "";
                    actions.updateLabel?.(id, edgeData.label ?? "");
                    restoreKeyboardFocus();
                  }
                }}
              />
            ) : edgeData.label}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

export const canvasConnectionEdgeTypes = { canvasConnection: CanvasConnectionEdge } as const;
