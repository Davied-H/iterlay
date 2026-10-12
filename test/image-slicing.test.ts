import { describe, expect, it } from "vitest";
import {
  calculateSliceGrid,
  calculateSliceGridDividers,
  calculateSliceGridFromDividers,
  validateCropRect
} from "../shared/image-slicing";

describe("image slicing grid", () => {
  it("covers odd image dimensions without overlap or missing pixels", () => {
    const crops = calculateSliceGrid({ width: 101, height: 99, rows: 2, columns: 3 });

    expect(crops).toEqual([
      { x: 0, y: 0, width: 34, height: 50 },
      { x: 34, y: 0, width: 33, height: 50 },
      { x: 67, y: 0, width: 34, height: 50 },
      { x: 0, y: 50, width: 34, height: 49 },
      { x: 34, y: 50, width: 33, height: 49 },
      { x: 67, y: 50, width: 34, height: 49 }
    ]);
  });

  it("excludes the configured outer margin and gaps", () => {
    const crops = calculateSliceGrid({ width: 110, height: 110, rows: 2, columns: 2, margin: 5, gap: 10 });

    expect(crops).toEqual([
      { x: 5, y: 5, width: 45, height: 45 },
      { x: 60, y: 5, width: 45, height: 45 },
      { x: 5, y: 60, width: 45, height: 45 },
      { x: 60, y: 60, width: 45, height: 45 }
    ]);
  });

  it("rejects oversized grids and out-of-bounds crops", () => {
    expect(() => calculateSliceGrid({ width: 100, height: 100, rows: 9, columns: 1 })).toThrow(/不能超过 8/);
    expect(() => validateCropRect({ x: 90, y: 0, width: 11, height: 10 }, 100, 100)).toThrow(/超出/);
  });

  it("uses draggable divider positions as the final crop boundaries", () => {
    const input = { width: 100, height: 80, rows: 2, columns: 3, margin: 2, gap: 4 };
    const defaults = calculateSliceGridDividers(input);
    const crops = calculateSliceGridFromDividers(input, { x: [24, 72], y: [30] });

    expect(defaults).toEqual({ x: [31, 65], y: [38] });
    expect(crops).toEqual([
      { x: 2, y: 2, width: 22, height: 28 },
      { x: 28, y: 2, width: 44, height: 28 },
      { x: 76, y: 2, width: 22, height: 28 },
      { x: 2, y: 34, width: 22, height: 44 },
      { x: 28, y: 34, width: 44, height: 44 },
      { x: 76, y: 34, width: 22, height: 44 }
    ]);
  });
});
