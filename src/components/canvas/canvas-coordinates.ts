export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasClientBounds {
  left: number;
  top: number;
}

export interface CanvasViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

/** Converts a screen-space distance to flow-space while preserving its visual size. */
export function screenPxToFlow(pixels: number, zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? pixels / zoom : pixels;
}

/** Converts a browser client coordinate into the React Flow world coordinate system. */
export function clientToFlow(
  client: CanvasPoint,
  bounds: CanvasClientBounds,
  viewport: CanvasViewportTransform
): CanvasPoint {
  return {
    x: screenPxToFlow(client.x - bounds.left - viewport.x, viewport.zoom),
    y: screenPxToFlow(client.y - bounds.top - viewport.y, viewport.zoom)
  };
}
