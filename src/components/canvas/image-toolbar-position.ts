export type ImageToolbarSide = "top" | "bottom";

/**
 * React Flow reports node positions relative to its pane, so this clearance only
 * needs to reserve room for the toolbar row, offset, and shadow (the app top bar is
 * already outside it).
 */
export const IMAGE_TOOLBAR_TOP_CLEARANCE = 64;

export function resolveImageToolbarSide(screenTopInPane: number): ImageToolbarSide {
  return screenTopInPane < IMAGE_TOOLBAR_TOP_CLEARANCE ? "bottom" : "top";
}
