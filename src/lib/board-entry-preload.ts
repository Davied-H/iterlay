import { isBoardImageNode, type BoardDetail, type BoardNodeSnapshot, type BoardViewport } from "@shared/types";

const DEFAULT_NODE_WIDTH = 264;
const MIN_NODE_WIDTH = 120;
const DEFAULT_FALLBACK_COUNT = 12;
const VIEWPORT_OVERSCAN = 160;

export const DEFAULT_BOARD_ENTRY_VISIBLE_PRELOAD_LIMIT = 8;

interface ViewportSize {
  width: number;
  height: number;
}

interface BoardEntryPreloadOptions {
  fallbackCount?: number;
  visibleCount?: number;
}

function renderedNodeHeight(node: BoardNodeSnapshot): number {
  const displayWidth = node.displayWidth && node.displayWidth >= MIN_NODE_WIDTH
    ? node.displayWidth
    : DEFAULT_NODE_WIDTH;
  if (!node.width || !node.height) return displayWidth;
  return displayWidth * node.height / node.width;
}

function intersectsViewport(
  node: BoardNodeSnapshot,
  viewport: BoardViewport,
  viewportSize: ViewportSize
): boolean {
  const left = node.x * viewport.zoom + viewport.x;
  const top = node.y * viewport.zoom + viewport.y;
  const displayWidth = node.displayWidth && node.displayWidth >= MIN_NODE_WIDTH
    ? node.displayWidth
    : DEFAULT_NODE_WIDTH;
  const right = left + displayWidth * viewport.zoom;
  const bottom = top + renderedNodeHeight(node) * viewport.zoom;
  return (
    right >= -VIEWPORT_OVERSCAN &&
    bottom >= -VIEWPORT_OVERSCAN &&
    left <= viewportSize.width + VIEWPORT_OVERSCAN &&
    top <= viewportSize.height + VIEWPORT_OVERSCAN
  );
}

function screenCenterDistanceSquared(
  node: BoardNodeSnapshot,
  viewport: BoardViewport,
  viewportSize: ViewportSize
): number {
  const displayWidth = node.displayWidth && node.displayWidth >= MIN_NODE_WIDTH
    ? node.displayWidth
    : DEFAULT_NODE_WIDTH;
  const centerX = (node.x + displayWidth / 2) * viewport.zoom + viewport.x;
  const centerY = (node.y + renderedNodeHeight(node) / 2) * viewport.zoom + viewport.y;
  const deltaX = centerX - viewportSize.width / 2;
  const deltaY = centerY - viewportSize.height / 2;
  return deltaX * deltaX + deltaY * deltaY;
}

/** Only block board entry on current-version images likely to be visible on the first frame. */
export function selectBoardEntryPreload(
  detail: Pick<BoardDetail, "nodes" | "images" | "viewport">,
  viewportSize: ViewportSize,
  options: number | BoardEntryPreloadOptions = {}
): Pick<BoardDetail, "nodes" | "images"> {
  const fallbackCount = typeof options === "number"
    ? options
    : options.fallbackCount ?? DEFAULT_FALLBACK_COUNT;
  const visibleCount = typeof options === "number"
    ? DEFAULT_BOARD_ENTRY_VISIBLE_PRELOAD_LIMIT
    : options.visibleCount ?? DEFAULT_BOARD_ENTRY_VISIBLE_PRELOAD_LIMIT;
  const imageNodes = detail.nodes.filter(isBoardImageNode);
  const visible = detail.viewport
    ? imageNodes
      .filter((node) => intersectsViewport(node, detail.viewport!, viewportSize))
      .map((node, order) => ({
        node,
        order,
        distance: screenCenterDistanceSquared(node, detail.viewport!, viewportSize)
      }))
      .sort((left, right) => left.distance - right.distance || left.order - right.order)
      .slice(0, Math.max(0, visibleCount))
      .map(({ node }) => node)
    : [];
  const selected = (visible.length > 0 ? visible : imageNodes.slice(0, Math.max(0, fallbackCount))).map((node) => ({
    ...node,
    versions: undefined
  }));
  return { nodes: selected, images: detail.images };
}
