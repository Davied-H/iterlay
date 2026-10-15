import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type RefObject,
  type WheelEventHandler
} from "react";
import type { BoardViewport } from "@shared/types";
import {
  MINIMAP_POSITION_STORAGE_KEY,
  clampMiniMapPosition,
  resolveMiniMapDragViewport,
  resolveMiniMapKeyboardViewport,
  resolveMiniMapPosition,
  resolveMiniMapWheelZoom,
  type MiniMapPosition
} from "./canvas-minimap-model";

export interface CanvasMiniMapViewProps {
  position: MiniMapPosition | null;
  isDragging: boolean;
  isPositionDragging: boolean;
  onPositionPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPositionPointerMove: PointerEventHandler<HTMLButtonElement>;
  onPositionPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPositionPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onPositionLostCapture: PointerEventHandler<HTMLButtonElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onLostCapture: PointerEventHandler<HTMLDivElement>;
  onWheel: WheelEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

interface UseCanvasMiniMapControllerOptions {
  canvasContainerRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
  getViewport: () => BoardViewport;
  setViewport: (viewport: BoardViewport) => Promise<boolean>;
  zoomTo: (zoom: number, options: { duration: number }) => Promise<boolean>;
  scheduleCanvasReport: () => void;
}

export function useCanvasMiniMapController({
  canvasContainerRef,
  visible,
  getViewport,
  setViewport,
  zoomTo,
  scheduleCanvasReport
}: UseCanvasMiniMapControllerOptions): {
  viewProps: CanvasMiniMapViewProps;
} {
  const [position, setPosition] = useState<MiniMapPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPositionDragging, setIsPositionDragging] = useState(false);
  const positionRef = useRef<MiniMapPosition | null>(position);
  const viewportDragRef = useRef<{
    pointerId: number;
    target: HTMLDivElement;
    startClientX: number;
    startClientY: number;
    flowUnitsPerPixelX: number;
    flowUnitsPerPixelY: number;
    viewport: BoardViewport;
  } | null>(null);
  const positionDragRef = useRef<{
    pointerId: number;
    target: HTMLButtonElement;
    startClientX: number;
    startClientY: number;
    position: MiniMapPosition;
  } | null>(null);
  const pendingViewportRef = useRef<BoardViewport | null>(null);
  const viewportFrameRef = useRef<number | null>(null);
  positionRef.current = position;

  useEffect(() => {
    if (!visible) return;
    const container = canvasContainerRef.current;
    if (!container) return;
    const syncPosition = (): void => {
      const bounds = container.getBoundingClientRect();
      setPosition((current) => {
        // Keep a user-placed minimap stable when there is still room for it.
        // If the canvas shrinks, resolveMiniMapPosition only corrects the
        // coordinate when it would leave the canvas or overlap the zoom dock.
        if (current) return resolveMiniMapPosition(current, bounds);
        let stored: MiniMapPosition | null = null;
        try {
          const parsed = JSON.parse(localStorage.getItem(MINIMAP_POSITION_STORAGE_KEY) ?? "null") as Partial<MiniMapPosition> | null;
          if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            stored = { x: parsed.x as number, y: parsed.y as number };
          }
        } catch {
          // 本地偏好不可读时使用默认位置。
        }
        return resolveMiniMapPosition(current, bounds, stored);
      });
    };
    syncPosition();
    const observer = new ResizeObserver(syncPosition);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasContainerRef, visible]);

  const clearPendingInteractions = useCallback((updateState: boolean): void => {
    if (viewportFrameRef.current !== null) {
      cancelAnimationFrame(viewportFrameRef.current);
      viewportFrameRef.current = null;
    }
    pendingViewportRef.current = null;
    const viewportDrag = viewportDragRef.current;
    if (viewportDrag?.target.hasPointerCapture(viewportDrag.pointerId)) {
      viewportDrag.target.releasePointerCapture(viewportDrag.pointerId);
    }
    const positionDrag = positionDragRef.current;
    if (positionDrag?.target.hasPointerCapture(positionDrag.pointerId)) {
      positionDrag.target.releasePointerCapture(positionDrag.pointerId);
    }
    viewportDragRef.current = null;
    positionDragRef.current = null;
    if (updateState) {
      setIsDragging(false);
      setIsPositionDragging(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) clearPendingInteractions(true);
  }, [clearPendingInteractions, visible]);

  useEffect(() => () => clearPendingInteractions(false), [clearPendingInteractions]);

  const beginPositionDrag: PointerEventHandler<HTMLButtonElement> = useCallback((event) => {
    const current = positionRef.current;
    if (!visible || event.button !== 0 || !current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    positionDragRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startClientX: event.clientX,
      startClientY: event.clientY,
      position: current
    };
    setIsPositionDragging(true);
  }, [visible]);

  const movePositionDrag: PointerEventHandler<HTMLButtonElement> = useCallback((event) => {
    const drag = positionDragRef.current;
    const container = canvasContainerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !container) return;
    event.preventDefault();
    event.stopPropagation();
    const next = clampMiniMapPosition({
      x: drag.position.x + event.clientX - drag.startClientX,
      y: drag.position.y + event.clientY - drag.startClientY
    }, container.getBoundingClientRect());
    positionRef.current = next;
    setPosition(next);
  }, [canvasContainerRef]);

  const endPositionDrag: PointerEventHandler<HTMLButtonElement> = useCallback((event) => {
    const drag = positionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    positionDragRef.current = null;
    setIsPositionDragging(false);
    if (!positionRef.current) return;
    try {
      localStorage.setItem(MINIMAP_POSITION_STORAGE_KEY, JSON.stringify(positionRef.current));
    } catch {
      // 本地存储不可用时仍保留当前会话中的位置。
    }
  }, []);

  const beginViewportDrag: PointerEventHandler<HTMLDivElement> = useCallback((event) => {
    if (!visible || event.button !== 0) return;
    // The minimap lives in a ReactFlow panel, but in the comic-drama workspace
    // the canvas can be wrapped/reparented while it is entering the child board.
    // Looking up from the interaction layer is occasionally too narrow during
    // that transition, which leaves us with no viewBox and silently disables
    // dragging. Prefer the canvas container, then fall back to the ancestor.
    const svg = canvasContainerRef.current?.querySelector<SVGSVGElement>(".react-flow__minimap-svg")
      ?? event.currentTarget.closest(".react-flow")?.querySelector<SVGSVGElement>(".react-flow__minimap-svg");
    const bounds = svg?.getBoundingClientRect();
    const viewBox = svg?.viewBox.baseVal;
    if (!svg || !bounds || !viewBox || bounds.width === 0 || bounds.height === 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    viewportDragRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startClientX: event.clientX,
      startClientY: event.clientY,
      flowUnitsPerPixelX: viewBox.width / bounds.width,
      flowUnitsPerPixelY: viewBox.height / bounds.height,
      viewport: getViewport()
    };
    setIsDragging(true);
  }, [canvasContainerRef, getViewport, visible]);

  const moveViewportDrag: PointerEventHandler<HTMLDivElement> = useCallback((event) => {
    const drag = viewportDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    pendingViewportRef.current = resolveMiniMapDragViewport(
      drag.viewport,
      { x: event.clientX - drag.startClientX, y: event.clientY - drag.startClientY },
      { x: drag.flowUnitsPerPixelX, y: drag.flowUnitsPerPixelY }
    );
    if (viewportFrameRef.current !== null) return;
    viewportFrameRef.current = requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      const viewport = pendingViewportRef.current;
      pendingViewportRef.current = null;
      if (viewport) void setViewport(viewport);
    });
  }, [setViewport]);

  const endViewportDrag: PointerEventHandler<HTMLDivElement> = useCallback((event) => {
    const drag = viewportDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    viewportDragRef.current = null;
    if (viewportFrameRef.current !== null) {
      cancelAnimationFrame(viewportFrameRef.current);
      viewportFrameRef.current = null;
    }
    const viewport = pendingViewportRef.current;
    pendingViewportRef.current = null;
    if (viewport) void setViewport(viewport);
    setIsDragging(false);
    scheduleCanvasReport();
  }, [scheduleCanvasReport, setViewport]);

  const handleWheel: WheelEventHandler<HTMLDivElement> = useCallback((event) => {
    if (!visible) return;
    event.preventDefault();
    event.stopPropagation();
    void zoomTo(resolveMiniMapWheelZoom(getViewport().zoom, event.deltaY), { duration: 100 });
  }, [getViewport, visible, zoomTo]);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = useCallback((event) => {
    if (!visible) return;
    const viewport = resolveMiniMapKeyboardViewport(getViewport(), event.key);
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    void setViewport(viewport);
    scheduleCanvasReport();
  }, [getViewport, scheduleCanvasReport, setViewport, visible]);

  return {
    viewProps: {
      position,
      isDragging,
      isPositionDragging,
      onPositionPointerDown: beginPositionDrag,
      onPositionPointerMove: movePositionDrag,
      onPositionPointerUp: endPositionDrag,
      onPositionPointerCancel: endPositionDrag,
      onPositionLostCapture: endPositionDrag,
      onPointerDown: beginViewportDrag,
      onPointerMove: moveViewportDrag,
      onPointerUp: endViewportDrag,
      onPointerCancel: endViewportDrag,
      onLostCapture: endViewportDrag,
      onWheel: handleWheel,
      onKeyDown: handleKeyDown
    }
  };
}
