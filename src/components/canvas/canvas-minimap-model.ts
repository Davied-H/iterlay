import type { BoardViewport } from "@shared/types";

export const MINIMAP_WIDTH = 240;
export const MINIMAP_HEIGHT = 160;
export const MINIMAP_MARGIN = 12;
export const MINIMAP_TOP_INSET = 60;
export const MINIMAP_NARROW_VIEWPORT_WIDTH = 1024;
export const MINIMAP_NARROW_BOTTOM_INSET = 140;
export const MINIMAP_KEYBOARD_PAN_STEP = 80;
export const MINIMAP_POSITION_STORAGE_KEY = "iterlay.canvasMinimapPosition";

const MIN_CANVAS_ZOOM = 0.05;
const MAX_CANVAS_ZOOM = 4;
const ZOOM_TOOLBAR_CLEARANCE = 56;

export interface MiniMapPosition {
  x: number;
  y: number;
}

interface Bounds {
  width: number;
  height: number;
}

export function clampMiniMapPosition(
  position: MiniMapPosition,
  bounds: Bounds
): MiniMapPosition {
  const bottomInset = bounds.width < MINIMAP_NARROW_VIEWPORT_WIDTH
    ? MINIMAP_NARROW_BOTTOM_INSET
    : MINIMAP_MARGIN;
  const maxX = Math.max(MINIMAP_MARGIN, bounds.width - MINIMAP_WIDTH - MINIMAP_MARGIN);
  const maxY = Math.max(MINIMAP_MARGIN, bounds.height - MINIMAP_HEIGHT - bottomInset);
  const minY = Math.min(MINIMAP_TOP_INSET, maxY);
  return {
    x: Math.min(maxX, Math.max(MINIMAP_MARGIN, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y))
  };
}

export function resolveMiniMapPosition(
  current: MiniMapPosition | null,
  bounds: Bounds,
  stored: MiniMapPosition | null = null
): MiniMapPosition {
  const positioned = { ...(current ?? stored ?? {
    x: MINIMAP_MARGIN,
    y: bounds.height - MINIMAP_HEIGHT - (
      bounds.width < MINIMAP_NARROW_VIEWPORT_WIDTH
        ? MINIMAP_NARROW_BOTTOM_INSET
        : ZOOM_TOOLBAR_CLEARANCE
    )
  }) };

  if (
    positioned.x < 360
    && positioned.y + MINIMAP_HEIGHT > bounds.height - ZOOM_TOOLBAR_CLEARANCE
  ) {
    positioned.y = bounds.height - MINIMAP_HEIGHT - ZOOM_TOOLBAR_CLEARANCE;
  }
  return clampMiniMapPosition(positioned, bounds);
}

export function resolveMiniMapDragViewport(
  viewport: BoardViewport,
  deltaPixels: { x: number; y: number },
  flowUnitsPerPixel: { x: number; y: number }
): BoardViewport {
  return {
    x: viewport.x - deltaPixels.x * flowUnitsPerPixel.x * viewport.zoom,
    y: viewport.y - deltaPixels.y * flowUnitsPerPixel.y * viewport.zoom,
    zoom: viewport.zoom
  };
}

export function resolveMiniMapWheelZoom(zoom: number, deltaY: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(
    MIN_CANVAS_ZOOM,
    zoom * Math.pow(2, -deltaY * 0.002)
  ));
}

export function resolveMiniMapKeyboardViewport(
  viewport: BoardViewport,
  key: string
): BoardViewport | null {
  const direction = {
    ArrowLeft: { x: MINIMAP_KEYBOARD_PAN_STEP, y: 0 },
    ArrowRight: { x: -MINIMAP_KEYBOARD_PAN_STEP, y: 0 },
    ArrowUp: { x: 0, y: MINIMAP_KEYBOARD_PAN_STEP },
    ArrowDown: { x: 0, y: -MINIMAP_KEYBOARD_PAN_STEP }
  }[key];
  return direction ? {
    x: viewport.x + direction.x,
    y: viewport.y + direction.y,
    zoom: viewport.zoom
  } : null;
}
