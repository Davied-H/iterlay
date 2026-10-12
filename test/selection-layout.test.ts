import { describe, expect, it } from "vitest";
import { arrangeSelection, type SelectionLayoutItem } from "@/components/canvas/selection-layout";

const items: SelectionLayoutItem[] = [
  { id: "a", x: 0, y: 0, width: 100, height: 100 },
  { id: "b", x: 300, y: 150, width: 100, height: 200 },
  { id: "c", x: 150, y: 400, width: 50, height: 100 }
];

describe("canvas selection layout", () => {
  it("arranges images horizontally in their visual order around the original center", () => {
    const positions = arrangeSelection(items, "horizontal", 40);

    expect(Object.fromEntries(positions)).toEqual({
      a: { x: 35, y: 200 },
      c: { x: 175, y: 200 },
      b: { x: 265, y: 150 }
    });
  });

  it("arranges images vertically in their visual order around the original center", () => {
    const positions = arrangeSelection(items, "vertical", 40);

    expect(Object.fromEntries(positions)).toEqual({
      a: { x: 150, y: 10 },
      b: { x: 150, y: 150 },
      c: { x: 175, y: 390 }
    });
  });

  it("arranges images in a centered grid without overlapping mixed sizes", () => {
    const positions = arrangeSelection(items, "grid", 40);

    expect(Object.fromEntries(positions)).toEqual({
      a: { x: 80, y: 130 },
      b: { x: 220, y: 80 },
      c: { x: 105, y: 320 }
    });
  });

  it("does not produce a layout for fewer than two images", () => {
    expect(arrangeSelection(items.slice(0, 1), "horizontal", 40).size).toBe(0);
  });
});
