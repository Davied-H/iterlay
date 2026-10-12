export const DEFAULT_CANVAS_CONTENT_ZOOM = 1.25;

export const CANVAS_FIT_VIEW_OPTIONS = {
  padding: 0.3,
  maxZoom: DEFAULT_CANVAS_CONTENT_ZOOM
} as const;

export function resolveCanvasSelectionFitPadding(bottomInset: number): number | {
  top: "8%";
  right: "8%";
  bottom: `${number}px`;
  left: "8%";
} {
  if (!Number.isFinite(bottomInset) || bottomInset <= 0) return 0.25;
  return {
    top: "8%",
    right: "8%",
    bottom: `${Math.ceil(bottomInset + 16)}px` as const,
    left: "8%"
  };
}

export type CanvasWheelInteraction = {
  panOnScroll: boolean;
  panOnScrollSpeed?: number;
  zoomOnScroll: boolean;
};

export function resolveCanvasWheelInteraction(platform = typeof navigator === "undefined" ? "" : navigator.platform): CanvasWheelInteraction {
  // macOS trackpads use a two-finger wheel gesture for canvas navigation;
  // native pinch remains enabled separately through React Flow's zoomOnPinch.
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) {
    return { panOnScroll: true, panOnScrollSpeed: 1, zoomOnScroll: false };
  }

  return { panOnScroll: false, zoomOnScroll: true };
}

export function resolveCanvasFocusZoom(currentZoom: number): number {
  return Math.max(currentZoom, DEFAULT_CANVAS_CONTENT_ZOOM);
}
