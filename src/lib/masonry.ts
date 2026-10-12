/**
 * 素材库瀑布流布局：最短列优先的纯函数实现。
 * 所有素材宽高比在渲染前已知（width/height → thumbhash 比例 → 1:1 兜底），
 * 故布局无需 DOM 测量，可整体 memo 且可单测。
 */

export interface MasonryItemInput {
  key: string;
  /** 宽高比 w/h；非法值（NaN/≤0）按 1 处理。 */
  ratio: number;
}

export interface MasonryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MasonryLayoutOptions {
  /** 列间与行间距，默认 12。 */
  gap?: number;
  /** 理想列宽，用于推导列数，默认 248。 */
  targetColumnWidth?: number;
  minColumns?: number;
  maxColumns?: number;
}

export interface MasonryLayout {
  rects: Map<string, MasonryRect>;
  totalHeight: number;
  columnCount: number;
  columnWidth: number;
}

const EMPTY_LAYOUT: MasonryLayout = {
  rects: new Map(),
  totalHeight: 0,
  columnCount: 0,
  columnWidth: 0
};

export function computeMasonryLayout(
  items: MasonryItemInput[],
  containerWidth: number,
  options?: MasonryLayoutOptions
): MasonryLayout {
  const gap = options?.gap ?? 12;
  const targetColumnWidth = options?.targetColumnWidth ?? 248;
  const minColumns = options?.minColumns ?? 2;
  const maxColumns = options?.maxColumns ?? 6;

  const width = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  if (width <= 0) return EMPTY_LAYOUT;

  const idealCount = Math.round((width + gap) / (targetColumnWidth + gap));
  const columnCount = Math.min(maxColumns, Math.max(minColumns, idealCount));
  const columnWidth = Math.max(0, (width - gap * (columnCount - 1)) / columnCount);

  const columnHeights = new Array<number>(columnCount).fill(0);
  const rects = new Map<string, MasonryRect>();

  for (const item of items) {
    const ratio = Number.isFinite(item.ratio) && item.ratio > 0 ? item.ratio : 1;
    const height = columnWidth / ratio;
    // 最短列优先；严格小于保证同高时取最左列，布局确定性。
    let column = 0;
    for (let index = 1; index < columnCount; index += 1) {
      if (columnHeights[index] < columnHeights[column]) column = index;
    }
    rects.set(item.key, {
      x: column * (columnWidth + gap),
      y: columnHeights[column],
      width: columnWidth,
      height
    });
    columnHeights[column] += height + gap;
  }

  const tallest = Math.max(...columnHeights);
  return {
    rects,
    totalHeight: items.length > 0 ? Math.max(0, tallest - gap) : 0,
    columnCount,
    columnWidth
  };
}

/** 返回窗口化后应渲染的 key 集合：与 [scrollTop-overscan, scrollTop+viewport+overscan] 相交的矩形。 */
export function computeVisibleKeys(
  layout: MasonryLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 600
): Set<string> {
  const top = scrollTop - overscan;
  const bottom = scrollTop + viewportHeight + overscan;
  const visible = new Set<string>();
  for (const [key, rect] of layout.rects) {
    if (rect.y < bottom && rect.y + rect.height > top) visible.add(key);
  }
  return visible;
}
