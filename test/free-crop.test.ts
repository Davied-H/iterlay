import { describe, expect, it } from "vitest";
import {
  createFreeCropFromPoints,
  createInitialFreeCrop,
  moveFreeCrop,
  resizeFreeCrop
} from "@/components/canvas/free-crop";

describe("free crop geometry", () => {
  it("creates a centered default crop", () => {
    expect(createInitialFreeCrop(100, 50)).toEqual({ x: 10, y: 5, width: 80, height: 40 });
  });

  it("creates a rectangle regardless of drag direction", () => {
    expect(createFreeCropFromPoints({ x: 80, y: 40 }, { x: 20, y: 10 }, 100, 50)).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 30
    });
  });

  it("keeps moved and resized crops inside the source image", () => {
    const crop = { x: 10, y: 10, width: 40, height: 30 };
    expect(moveFreeCrop(crop, 100, 100, 80, 60)).toEqual({ x: 40, y: 30, width: 40, height: 30 });
    expect(resizeFreeCrop(crop, "nw", -30, -30, 80, 60)).toEqual({ x: 0, y: 0, width: 50, height: 40 });
    expect(resizeFreeCrop(crop, "se", 100, 100, 80, 60)).toEqual({ x: 10, y: 10, width: 70, height: 50 });
  });
});
