import { describe, expect, it } from "vitest";

import {
  resolveMiniMapDragViewport,
  resolveMiniMapKeyboardViewport,
  resolveMiniMapPosition,
  resolveMiniMapWheelZoom
} from "@/components/canvas/canvas-minimap-model";

describe("canvas minimap controller", () => {
  it("places the minimap above the zoom toolbar on wide canvases", () => {
    expect(resolveMiniMapPosition(null, { width: 1200, height: 800 })).toEqual({
      x: 12,
      y: 584
    });
  });

  it("keeps the minimap above the narrow-screen dock", () => {
    expect(resolveMiniMapPosition(null, { width: 800, height: 600 })).toEqual({
      x: 12,
      y: 300
    });
  });

  it("preserves stored placement while keeping the left toolbar clear", () => {
    expect(resolveMiniMapPosition(null, { width: 1200, height: 800 }, { x: 20, y: 700 }))
      .toEqual({ x: 20, y: 584 });
    expect(resolveMiniMapPosition(null, { width: 1200, height: 800 }, { x: 900, y: 700 }))
      .toEqual({ x: 900, y: 628 });
  });

  it("keeps an in-bounds placement stable and pulls an overflowing one back", () => {
    expect(resolveMiniMapPosition({ x: 420, y: 300 }, { width: 1200, height: 800 }))
      .toEqual({ x: 420, y: 300 });
    expect(resolveMiniMapPosition({ x: 12, y: 700 }, { width: 1200, height: 800 }))
      .toEqual({ x: 12, y: 584 });
  });

  it("converts minimap drag pixels into zoomed viewport movement", () => {
    expect(resolveMiniMapDragViewport(
      { x: 100, y: 50, zoom: 2 },
      { x: 10, y: -5 },
      { x: 4, y: 3 }
    )).toEqual({ x: 20, y: 80, zoom: 2 });
  });

  it("clamps wheel zoom to the canvas limits", () => {
    expect(resolveMiniMapWheelZoom(1, -100_000)).toBe(4);
    expect(resolveMiniMapWheelZoom(1, 100_000)).toBe(0.05);
    expect(resolveMiniMapWheelZoom(2, 0)).toBe(2);
  });

  it("maps arrow keys to viewport pan and ignores other keys", () => {
    const viewport = { x: 10, y: 20, zoom: 1.5 };
    expect(resolveMiniMapKeyboardViewport(viewport, "ArrowLeft"))
      .toEqual({ x: 90, y: 20, zoom: 1.5 });
    expect(resolveMiniMapKeyboardViewport(viewport, "ArrowDown"))
      .toEqual({ x: 10, y: -60, zoom: 1.5 });
    expect(resolveMiniMapKeyboardViewport(viewport, "Enter")).toBeNull();
  });
});
