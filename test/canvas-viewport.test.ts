import { describe, expect, it } from "vitest";
import {
  CANVAS_FIT_VIEW_OPTIONS,
  DEFAULT_CANVAS_CONTENT_ZOOM,
  resolveCanvasSelectionFitPadding,
  resolveCanvasWheelInteraction,
  resolveCanvasFocusZoom
} from "@/components/canvas/canvas-viewport";

describe("canvas viewport defaults", () => {
  it("lets fit view enlarge sparse canvas content", () => {
    expect(CANVAS_FIT_VIEW_OPTIONS).toEqual({
      padding: 0.3,
      maxZoom: 1.25
    });
  });

  it("zooms directly with a Windows mouse wheel", () => {
    expect(resolveCanvasWheelInteraction("Win32")).toEqual({
      panOnScroll: false,
      zoomOnScroll: true
    });
  });

  it("keeps macOS trackpad scrolling for panning", () => {
    expect(resolveCanvasWheelInteraction("MacIntel")).toEqual({
      panOnScroll: true,
      panOnScrollSpeed: 1,
      zoomOnScroll: false
    });
  });

  it("raises a focused image to the default content zoom", () => {
    expect(resolveCanvasFocusZoom(0.7)).toBe(DEFAULT_CANVAS_CONTENT_ZOOM);
  });

  it("does not shrink a viewport that is already closer", () => {
    expect(resolveCanvasFocusZoom(1.8)).toBe(1.8);
  });

  it("keeps the original selection padding when the prompt dock is absent", () => {
    expect(resolveCanvasSelectionFitPadding(0)).toBe(0.25);
  });

  it("reserves the measured prompt dock height below a focused selection", () => {
    expect(resolveCanvasSelectionFitPadding(184)).toEqual({
      top: "8%",
      right: "8%",
      bottom: "200px",
      left: "8%"
    });
  });
});
