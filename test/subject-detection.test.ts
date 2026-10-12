import { describe, expect, it } from "vitest";
import type { ImageCropRect } from "@shared/types";
import {
  calculateCenteredSubjectCrops,
  detectSliceSubjects,
  type RgbaPixelData
} from "@shared/subject-detection";

type MutableRgbaPixelData = RgbaPixelData & { data: Uint8ClampedArray };

function image(width: number, height: number, transparent = false): MutableRgbaPixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const shade = (x + y) % 2 === 0 ? 232 : 248;
      data[offset] = shade;
      data[offset + 1] = shade;
      data[offset + 2] = shade;
      data[offset + 3] = transparent ? 0 : 255;
    }
  }
  return { width, height, data };
}

function fillRect(
  target: MutableRgbaPixelData,
  rect: ImageCropRect,
  color: [number, number, number, number] = [240, 40, 50, 255]
): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * target.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) target.data[offset + channel] = color[channel];
    }
  }
}

describe("slice subject detection", () => {
  it("finds offset subjects on an opaque checkerboard background", () => {
    const target = image(80, 40);
    fillRect(target, { x: 8, y: 9, width: 18, height: 20 });
    fillRect(target, { x: 52, y: 5, width: 20, height: 24 }, [30, 90, 230, 255]);
    const crops = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 40, y: 0, width: 40, height: 40 }
    ];

    const detections = detectSliceSubjects(target, crops);

    expect(detections.map((item) => item.bounds)).toEqual([
      { x: 8, y: 9, width: 18, height: 20 },
      { x: 52, y: 5, width: 20, height: 24 }
    ]);
    expect(detections.every((item) => item.confidence >= 0.7)).toBe(true);
  });

  it("uses alpha for genuinely transparent slices", () => {
    const target = image(40, 40, true);
    fillRect(target, { x: 11, y: 7, width: 16, height: 22 });

    expect(detectSliceSubjects(target, [{ x: 0, y: 0, width: 40, height: 40 }])[0].bounds).toEqual({
      x: 11,
      y: 7,
      width: 16,
      height: 22
    });
  });

  it("normalizes subject scale or preserves relative scale while centering", () => {
    const cells = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 }
    ];
    const detections = [
      { index: 0, bounds: { x: 5, y: 8, width: 10, height: 10 }, confidence: 1 },
      { index: 1, bounds: { x: 64, y: 12, width: 20, height: 20 }, confidence: 1 }
    ];

    const normalized = calculateCenteredSubjectCrops(cells, detections, {
      paddingRatio: 0.1,
      normalizeScale: true
    });
    const preserved = calculateCenteredSubjectCrops(cells, detections, {
      paddingRatio: 0.1,
      normalizeScale: false
    });

    expect(normalized[0].width).toBeLessThan(normalized[1].width);
    expect(preserved[0].width).toBeLessThanOrEqual(preserved[1].width);
    expect(preserved[0].width).toBeGreaterThan(normalized[0].width);
    expect(Math.abs(normalized[0].x + normalized[0].width / 2 - 10)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(normalized[1].x + normalized[1].width / 2 - 74)).toBeLessThanOrEqual(0.5);
  });

  it("can include nearby decorations outside a grid cell without merging the neighboring subject", () => {
    const target = image(100, 50);
    fillRect(target, { x: 15, y: 12, width: 24, height: 25 });
    fillRect(target, { x: 42, y: 8, width: 5, height: 5 });
    fillRect(target, { x: 66, y: 10, width: 26, height: 28 }, [30, 90, 230, 255]);
    const cell = { x: 0, y: 0, width: 50, height: 50 };
    const search = { x: 0, y: 0, width: 65, height: 50 };

    const detection = detectSliceSubjects(target, [search], [cell])[0];
    expect(detection.bounds).toEqual({ x: 15, y: 8, width: 32, height: 29 });

    const [crop] = calculateCenteredSubjectCrops([cell], [detection], {
      paddingRatio: 0.2,
      normalizeScale: true,
      constrainToCell: false,
      imageWidth: 100,
      imageHeight: 50
    });
    expect(crop.width).toBeGreaterThan(50);
    expect(crop.x + crop.width).toBeLessThanOrEqual(100);
  });

  it("samples background from the focus cell when an expanded search cuts through a same-color neighbor", () => {
    const target = image(100, 50);
    fillRect(target, { x: 15, y: 12, width: 24, height: 25 });
    fillRect(target, { x: 42, y: 8, width: 5, height: 5 });
    fillRect(target, { x: 60, y: 9, width: 30, height: 30 });
    const focus = { x: 0, y: 0, width: 50, height: 50 };
    const search = { x: 0, y: 0, width: 75, height: 50 };

    expect(detectSliceSubjects(target, [search], [focus])[0].bounds).toEqual({
      x: 15,
      y: 8,
      width: 32,
      height: 29
    });
  });
});
