import { describe, expect, it } from "vitest";
import {
  computeMasonryLayout,
  computeVisibleKeys,
  type MasonryItemInput
} from "../src/lib/masonry";

function items(ratios: number[]): MasonryItemInput[] {
  return ratios.map((ratio, index) => ({ key: `item-${index}`, ratio }));
}

describe("computeMasonryLayout", () => {
  it("derives column count from container width and clamps to min/max", () => {
    // 理想列宽 248 + gap 12：宽 508 ≈ 2 列，宽 1288 ≈ 5 列。
    expect(computeMasonryLayout(items([1]), 508).columnCount).toBe(2);
    expect(computeMasonryLayout(items([1]), 1288).columnCount).toBe(5);
    // 极窄不低于 2 列，极宽不超过 6 列。
    expect(computeMasonryLayout(items([1]), 100).columnCount).toBe(2);
    expect(computeMasonryLayout(items([1]), 10_000).columnCount).toBe(6);
  });

  it("computes exact column width including gaps", () => {
    const layout = computeMasonryLayout(items([1, 1, 1]), 520, { gap: 12 });
    expect(layout.columnCount).toBe(2);
    expect(layout.columnWidth).toBeCloseTo((520 - 12) / 2, 5);
    expect(layout.rects.get("item-1")!.x).toBeCloseTo(layout.columnWidth + 12, 5);
  });

  it("places each item into the currently shortest column, leftmost on ties", () => {
    // 两列等宽：第 0 项进列 0，第 1 项进列 1（同高取最左后列 0 已更高）。
    // 第 0 项很高（ratio 0.5 → h=2w），第 1 项方形，第 2 项应进更矮的列 1。
    const layout = computeMasonryLayout(items([0.5, 1, 1]), 512, { gap: 0 });
    const [a, b, c] = ["item-0", "item-1", "item-2"].map((key) => layout.rects.get(key)!);
    expect(a.x).toBe(0);
    expect(b.x).toBeGreaterThan(0);
    expect(c.x).toBe(b.x);
    expect(c.y).toBeCloseTo(b.height, 5);
  });

  it("reports totalHeight as the tallest column without trailing gap", () => {
    const layout = computeMasonryLayout(items([1, 1]), 512, { gap: 12 });
    // 两个方形各占一列，总高 = 单个卡片高。
    expect(layout.totalHeight).toBeCloseTo(layout.columnWidth, 5);
    const stacked = computeMasonryLayout(items([1, 1, 1]), 512, { gap: 12 });
    expect(stacked.totalHeight).toBeCloseTo(stacked.columnWidth * 2 + 12, 5);
  });

  it("falls back to a square ratio for invalid inputs", () => {
    const layout = computeMasonryLayout(items([Number.NaN, 0, -2]), 512, { gap: 0 });
    for (const rect of layout.rects.values()) {
      expect(rect.height).toBeCloseTo(rect.width, 5);
    }
  });

  it("handles empty lists and zero-width containers", () => {
    expect(computeMasonryLayout([], 800).totalHeight).toBe(0);
    const empty = computeMasonryLayout(items([1, 2]), 0);
    expect(empty.totalHeight).toBe(0);
    expect(empty.rects.size).toBe(0);
  });

  it("is deterministic for the same input", () => {
    const list = items(Array.from({ length: 50 }, (_, index) => 0.5 + (index % 7) * 0.25));
    const first = computeMasonryLayout(list, 1024);
    const second = computeMasonryLayout(list, 1024);
    expect([...first.rects.entries()]).toEqual([...second.rects.entries()]);
  });

  it("lays out 2000 items quickly", () => {
    const list = items(Array.from({ length: 2000 }, (_, index) => 0.6 + (index % 5) * 0.3));
    const start = performance.now();
    const layout = computeMasonryLayout(list, 1440);
    expect(performance.now() - start).toBeLessThan(50);
    expect(layout.rects.size).toBe(2000);
  });
});

describe("computeVisibleKeys", () => {
  const layout = computeMasonryLayout(items(Array.from({ length: 40 }, () => 1)), 512, { gap: 0 });
  // 两列方形卡片，每张高 256，每列 20 张，总高 5120。

  it("includes rects intersecting the viewport plus overscan", () => {
    const visible = computeVisibleKeys(layout, 1000, 800, 600);
    for (const key of visible) {
      const rect = layout.rects.get(key)!;
      expect(rect.y).toBeLessThan(1000 + 800 + 600);
      expect(rect.y + rect.height).toBeGreaterThan(1000 - 600);
    }
    expect(visible.size).toBeGreaterThan(0);
    expect(visible.size).toBeLessThan(40);
  });

  it("includes rects exactly touching the boundary edges", () => {
    // rect.y + height > top 是严格大于：正好压在上边界外沿的不可见。
    const single = computeMasonryLayout([{ key: "a", ratio: 1 }], 512, { gap: 0 });
    const height = single.rects.get("a")!.height;
    expect(computeVisibleKeys(single, height, 400, 0).has("a")).toBe(false);
    expect(computeVisibleKeys(single, height - 1, 400, 0).has("a")).toBe(true);
  });

  it("returns empty when scrolled past the content", () => {
    expect(computeVisibleKeys(layout, 100_000, 800, 600).size).toBe(0);
  });
});
