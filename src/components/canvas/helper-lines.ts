export interface HelperLineItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HelperLineCandidate {
  line: number;
  offset: number;
  distance: number;
  order: number;
}

export interface HelperLineCandidateQuery {
  x: readonly HelperLineCandidate[];
  y: readonly HelperLineCandidate[];
}

interface HelperLineAnchor {
  item: HelperLineItem;
  line: number;
  order: number;
}

type HelperLineAxisIndex = readonly [
  readonly HelperLineAnchor[],
  readonly HelperLineAnchor[],
  readonly HelperLineAnchor[]
];

export interface HelperLineIndex {
  items: readonly HelperLineItem[];
  x: HelperLineAxisIndex;
  y: HelperLineAxisIndex;
}

export interface HelperLineSnapResult {
  horizontal: HelperLineGuide | null;
  vertical: HelperLineGuide | null;
  offset: { x: number; y: number };
}

export interface HelperLineGuide {
  position: number;
  start: number;
  end: number;
}

interface AxisSnap {
  line: number;
  offset: number;
  distance: number;
  order: number;
}

const ALIGNMENT_RATIOS = [0.5, 0, 1] as const;

function boundsOf(items: readonly HelperLineItem[]): Omit<HelperLineItem, "id"> {
  let x = Number.POSITIVE_INFINITY;
  let y = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    x = Math.min(x, item.x);
    y = Math.min(y, item.y);
    right = Math.max(right, item.x + item.width);
    bottom = Math.max(bottom, item.y + item.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}

function lowerBound(anchors: readonly HelperLineAnchor[], value: number): number {
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (anchors[middle].line < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function axisAnchors(
  items: readonly HelperLineItem[],
  axis: "x" | "y"
): HelperLineAxisIndex {
  return ALIGNMENT_RATIOS.map((ratio) => items
    .map((item, order): HelperLineAnchor => ({
      item,
      order,
      line: item[axis] + (axis === "x" ? item.width : item.height) * ratio
    }))
    .sort((left, right) => left.line - right.line || left.order - right.order)
  ) as unknown as HelperLineAxisIndex;
}

export function createHelperLineIndex(items: readonly HelperLineItem[]): HelperLineIndex {
  return { items, x: axisAnchors(items, "x"), y: axisAnchors(items, "y") };
}

function queryAxisCandidates(
  index: HelperLineAxisIndex,
  movingStart: number,
  movingSize: number,
  snapDistance: number
): HelperLineCandidate[] {
  const candidates: HelperLineCandidate[] = [];
  ALIGNMENT_RATIOS.forEach((ratio, ratioOrder) => {
    const movingAnchor = movingStart + movingSize * ratio;
    const anchors = index[ratioOrder];
    let cursor = lowerBound(anchors, movingAnchor - snapDistance);
    while (cursor < anchors.length && anchors[cursor].line <= movingAnchor + snapDistance) {
      const anchor = anchors[cursor];
      const offset = anchor.line - movingAnchor;
      candidates.push({
        line: anchor.line,
        offset,
        distance: Math.abs(offset),
        order: anchor.order * ALIGNMENT_RATIOS.length + ratioOrder
      });
      cursor += 1;
    }
  });
  return candidates;
}

export function queryHelperLineCandidates(
  index: HelperLineIndex,
  movingItems: readonly HelperLineItem[],
  snapDistance: number
): HelperLineCandidateQuery {
  if (movingItems.length === 0) return { x: [], y: [] };
  const movingBounds = boundsOf(movingItems);
  const threshold = Math.max(0, snapDistance);
  return {
    x: queryAxisCandidates(index.x, movingBounds.x, movingBounds.width, threshold),
    y: queryAxisCandidates(index.y, movingBounds.y, movingBounds.height, threshold)
  };
}

function findAxisSnap(candidates: readonly HelperLineCandidate[]): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const candidate of candidates) {
    if (
      best
      && (candidate.distance > best.distance
        || (candidate.distance === best.distance && candidate.order >= best.order))
    ) continue;
    best = candidate;
  }
  return best;
}

function alignedItems(
  index: HelperLineAxisIndex,
  line: number
): readonly HelperLineItem[] {
  const items = new Map<string, HelperLineItem>();
  for (const anchors of index) {
    let cursor = lowerBound(anchors, line - 0.01);
    while (cursor < anchors.length && anchors[cursor].line <= line + 0.01) {
      const anchor = anchors[cursor];
      if (Math.abs(anchor.line - line) < 0.01) items.set(anchor.item.id, anchor.item);
      cursor += 1;
    }
  }
  return [...items.values()];
}

function createGuide(
  snap: AxisSnap | null,
  movingBounds: Omit<HelperLineItem, "id">,
  targetIndex: HelperLineIndex,
  axis: "x" | "y",
  padding: number,
  crossOffset: number
): HelperLineGuide | null {
  if (!snap) return null;

  const crossStart = axis === "x" ? "y" : "x";
  const crossSize = axis === "x" ? "height" : "width";
  const movingCrossStart = movingBounds[crossStart] + crossOffset;
  const movingCrossEnd = movingCrossStart + movingBounds[crossSize];
  let start = movingCrossStart;
  let end = movingCrossEnd;
  for (const target of alignedItems(targetIndex[axis], snap.line)) {
    start = Math.min(start, target[crossStart]);
    end = Math.max(end, target[crossStart] + target[crossSize]);
  }

  return {
    position: snap.line,
    start: start - padding,
    end: end + padding
  };
}

/** Align a dragged node or selection bounds to nearby node edges and centers. */
export function calculateHelperLineSnap(
  movingItems: HelperLineItem[],
  targets: HelperLineItem[] | HelperLineIndex,
  snapDistance: number
): HelperLineSnapResult {
  const targetIndex = Array.isArray(targets) ? createHelperLineIndex(targets) : targets;
  if (movingItems.length === 0 || targetIndex.items.length === 0) {
    return { horizontal: null, vertical: null, offset: { x: 0, y: 0 } };
  }

  const movingBounds = boundsOf(movingItems);
  const threshold = Math.max(0, snapDistance);
  const candidates = queryHelperLineCandidates(targetIndex, movingItems, threshold);
  const xSnap = findAxisSnap(candidates.x);
  const ySnap = findAxisSnap(candidates.y);
  const guidePadding = threshold * 2;

  return {
    horizontal: createGuide(
      ySnap,
      movingBounds,
      targetIndex,
      "y",
      guidePadding,
      xSnap?.offset ?? 0
    ),
    vertical: createGuide(
      xSnap,
      movingBounds,
      targetIndex,
      "x",
      guidePadding,
      ySnap?.offset ?? 0
    ),
    offset: { x: xSnap?.offset ?? 0, y: ySnap?.offset ?? 0 }
  };
}
