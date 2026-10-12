import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import type { FitViewOptions, Node, Viewport } from "@xyflow/react";
import {
  CANVAS_FIT_VIEW_OPTIONS,
  DEFAULT_CANVAS_CONTENT_ZOOM,
  resolveCanvasFocusZoom,
  resolveCanvasSelectionFitPadding
} from "./canvas-viewport";
import { nodeRenderedHeight, nodeRenderedWidth } from "./canvas-node-layout";

interface UseCanvasViewportControllerOptions {
  containerRef: MutableRefObject<HTMLElement | null>;
  imageNodeIds: readonly string[];
  contentNodeIds: readonly string[];
  preserveViewportNodeIds: ReadonlySet<string>;
  initialViewport?: Viewport;
  rightRailInset: number;
  focusKey?: string | null;
  focusNonce?: number;
  selectionTargetIds?: readonly string[];
  selectionTargetNonce?: number;
  getNodes: () => readonly Node[];
  updateNodes: (updater: (current: readonly Node[]) => Node[]) => void;
  getViewport: () => Viewport;
  setViewport: (viewport: Viewport, options?: { duration?: number }) => Promise<boolean> | void;
  setCenter: (
    x: number,
    y: number,
    options?: { zoom?: number; duration?: number }
  ) => Promise<boolean> | void;
  fitView: (options?: FitViewOptions) => Promise<boolean> | void;
  zoomTo: (zoom: number, options?: { duration?: number }) => Promise<boolean> | void;
  reportCanvasState: () => void;
  getSelectionBottomInset?: () => number;
}

export interface CanvasViewportController {
  zoom: number;
  shouldFitInitialView: boolean;
  fitAll: () => void;
  fitSelection: (nodes?: readonly Node[]) => boolean;
  onZoomChange: (zoom: number, immediate?: boolean) => void;
  onMoveEnd: (viewport: Viewport) => void;
}

function defaultSelectionBottomInset(container: HTMLElement | null): number {
  const containerRect = container?.getBoundingClientRect();
  const dockRect = document.querySelector<HTMLElement>("[data-edit-dock]")?.getBoundingClientRect();
  return containerRect && dockRect
    ? Math.max(0, containerRect.bottom - dockRect.top)
    : 0;
}

export function useCanvasViewportController({
  containerRef,
  imageNodeIds,
  contentNodeIds,
  preserveViewportNodeIds,
  initialViewport,
  rightRailInset,
  focusKey,
  focusNonce,
  selectionTargetIds,
  selectionTargetNonce,
  getNodes,
  updateNodes,
  getViewport,
  setViewport,
  setCenter,
  fitView,
  zoomTo,
  reportCanvasState,
  getSelectionBottomInset
}: UseCanvasViewportControllerOptions): CanvasViewportController {
  const [zoom, setZoom] = useState(initialViewport?.zoom ?? 1);
  const shouldFitInitialView = useRef(!initialViewport && contentNodeIds.length > 0).current;
  const knownImageNodeIdsRef = useRef(new Set(imageNodeIds));
  const imageNodeIdsRef = useRef(imageNodeIds);
  const preserveViewportNodeIdsRef = useRef(preserveViewportNodeIds);
  const selectionTargetIdsRef = useRef(selectionTargetIds);
  const previousRightRailInsetRef = useRef(rightRailInset);
  const focusFrameRef = useRef<number | null>(null);
  const selectionFrameRef = useRef<number | null>(null);
  imageNodeIdsRef.current = imageNodeIds;
  preserveViewportNodeIdsRef.current = preserveViewportNodeIds;
  selectionTargetIdsRef.current = selectionTargetIds;
  const imageNodeSignature = imageNodeIds.join("\u0000");
  const preservedNodeSignature = imageNodeIds
    .filter((id) => preserveViewportNodeIds.has(id))
    .join("\u0000");
  const selectionTargetSignature = selectionTargetIds?.join("\u0000") ?? "";

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const initial = container.getBoundingClientRect();
    let previous = { width: initial.width, height: initial.height };
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      const deltaX = next.width - previous.width;
      const deltaY = next.height - previous.height;
      previous = next;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      const viewport = getViewport();
      void setViewport({
        x: viewport.x + deltaX / 2,
        y: viewport.y + deltaY / 2,
        zoom: viewport.zoom
      }, { duration: 0 });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, getViewport, setViewport]);

  useEffect(() => {
    const previousInset = previousRightRailInsetRef.current;
    previousRightRailInsetRef.current = rightRailInset;
    const deltaInset = rightRailInset - previousInset;
    if (Math.abs(deltaInset) < 0.5) return;
    const viewport = getViewport();
    void setViewport({
      x: viewport.x - deltaInset / 2,
      y: viewport.y,
      zoom: viewport.zoom
    }, { duration: 0 });
  }, [getViewport, rightRailInset, setViewport]);

  useEffect(() => {
    const currentImageNodeIds = imageNodeIdsRef.current;
    const currentPreservedNodeIds = preserveViewportNodeIdsRef.current;
    const newIds = currentImageNodeIds.filter((id) => !knownImageNodeIdsRef.current.has(id));
    knownImageNodeIdsRef.current = new Set(currentImageNodeIds);
    const focusesNewNode = Boolean(focusKey && newIds.includes(focusKey));
    const preservesViewport = newIds.some((id) => currentPreservedNodeIds.has(id));
    if (newIds.length === 0 || currentImageNodeIds.length === 0 || focusesNewNode || preservesViewport) return;
    const timer = window.setTimeout(() => {
      const newIdSet = new Set(newIds);
      const newNodes = getNodes().filter((node) => newIdSet.has(node.id));
      void fitView({
        nodes: [...newNodes],
        padding: 0.18,
        duration: 400,
        maxZoom: DEFAULT_CANVAS_CONTENT_ZOOM
      });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [fitView, focusKey, getNodes, imageNodeSignature, preservedNodeSignature]);

  useEffect(() => {
    if (!focusKey || !focusNonce) return;
    updateNodes((current) => current.map((node) => ({ ...node, selected: node.id === focusKey })));
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      const target = getNodes().find((node) => node.id === focusKey);
      if (!target) return;
      if (target.type === "videoGenerationNode") {
        const bottomInset = getSelectionBottomInset
          ? getSelectionBottomInset()
          : defaultSelectionBottomInset(containerRef.current);
        void fitView({
          nodes: [target],
          padding: resolveCanvasSelectionFitPadding(bottomInset),
          duration: 500,
          maxZoom: DEFAULT_CANVAS_CONTENT_ZOOM
        });
        return;
      }
      const targetZoom = resolveCanvasFocusZoom(getViewport().zoom);
      const centerX = target.position.x + nodeRenderedWidth(target) / 2;
      const centerY = target.position.y + nodeRenderedHeight(target) / 2;
      void setCenter(centerX, centerY, { zoom: targetZoom, duration: 500 });
    });
    return () => {
      if (focusFrameRef.current === null) return;
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    };
  }, [containerRef, fitView, focusKey, focusNonce, getNodes, getSelectionBottomInset, getViewport, setCenter, updateNodes]);

  useEffect(() => {
    const currentSelectionTargetIds = selectionTargetIdsRef.current;
    if (!currentSelectionTargetIds?.length || !selectionTargetNonce) return;
    const targetIdSet = new Set(currentSelectionTargetIds);
    const targets = getNodes().filter((node) => targetIdSet.has(node.id));
    updateNodes((current) => current.map((node) => ({ ...node, selected: targetIdSet.has(node.id) })));
    if (targets.length === 0) return;
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
    selectionFrameRef.current = requestAnimationFrame(() => {
      selectionFrameRef.current = null;
      void fitView({
        nodes: [...targets],
        padding: 0.18,
        duration: 500,
        maxZoom: DEFAULT_CANVAS_CONTENT_ZOOM
      });
    });
    return () => {
      if (selectionFrameRef.current === null) return;
      cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = null;
    };
  }, [fitView, getNodes, selectionTargetNonce, selectionTargetSignature, updateNodes]);

  useEffect(() => () => {
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
  }, []);

  const fitAll = useCallback((): void => {
    void fitView({ ...CANVAS_FIT_VIEW_OPTIONS, duration: 300 });
  }, [fitView]);
  const fitSelection = useCallback((targetNodes?: readonly Node[]): boolean => {
    const nodes = targetNodes ?? getNodes().filter((node) => node.selected);
    if (nodes.length === 0) return false;
    const bottomInset = getSelectionBottomInset
      ? getSelectionBottomInset()
      : defaultSelectionBottomInset(containerRef.current);
    void fitView({
      nodes: [...nodes],
      padding: resolveCanvasSelectionFitPadding(bottomInset),
      duration: 300,
      maxZoom: 2
    });
    return true;
  }, [containerRef, fitView, getNodes, getSelectionBottomInset]);
  const onZoomChange = useCallback((nextZoom: number, immediate = false): void => {
    void zoomTo(nextZoom, { duration: immediate ? 0 : 120 });
  }, [zoomTo]);
  const onMoveEnd = useCallback((viewport: Viewport): void => {
    setZoom((current) => current === viewport.zoom ? current : viewport.zoom);
    reportCanvasState();
  }, [reportCanvasState]);

  return { zoom, shouldFitInitialView, fitAll, fitSelection, onZoomChange, onMoveEnd };
}
