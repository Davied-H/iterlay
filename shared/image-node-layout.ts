export type ImageNodeLayoutMode = "horizontal" | "vertical" | "grid";

export interface ImageNodeLayoutItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Arrange items around their existing center so the viewport does not jump. */
export function arrangeImageNodes(
  items: ImageNodeLayoutItem[],
  mode: ImageNodeLayoutMode,
  gap: number
): Map<string, { x: number; y: number }> {
  if (items.length < 2) return new Map();

  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const sorted = [...items].sort((a, b) =>
    mode === "horizontal" ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x
  );
  const positions = new Map<string, { x: number; y: number }>();

  if (mode === "horizontal") {
    const totalWidth = sorted.reduce((sum, item) => sum + item.width, 0) + gap * (sorted.length - 1);
    let cursorX = centerX - totalWidth / 2;
    sorted.forEach((item) => {
      positions.set(item.id, { x: cursorX, y: centerY - item.height / 2 });
      cursorX += item.width + gap;
    });
    return positions;
  }

  if (mode === "vertical") {
    const totalHeight = sorted.reduce((sum, item) => sum + item.height, 0) + gap * (sorted.length - 1);
    let cursorY = centerY - totalHeight / 2;
    sorted.forEach((item) => {
      positions.set(item.id, { x: centerX - item.width / 2, y: cursorY });
      cursorY += item.height + gap;
    });
    return positions;
  }

  const columnCount = Math.ceil(Math.sqrt(sorted.length));
  const rowCount = Math.ceil(sorted.length / columnCount);
  const columnWidths = Array.from({ length: columnCount }, () => 0);
  const rowHeights = Array.from({ length: rowCount }, () => 0);
  sorted.forEach((item, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    columnWidths[column] = Math.max(columnWidths[column], item.width);
    rowHeights[row] = Math.max(rowHeights[row], item.height);
  });

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gap * (columnCount - 1);
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rowCount - 1);
  const columnOffsets: number[] = [];
  const rowOffsets: number[] = [];
  columnWidths.reduce((offset, width, index) => {
    columnOffsets[index] = offset;
    return offset + width + gap;
  }, centerX - totalWidth / 2);
  rowHeights.reduce((offset, height, index) => {
    rowOffsets[index] = offset;
    return offset + height + gap;
  }, centerY - totalHeight / 2);

  sorted.forEach((item, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    positions.set(item.id, {
      x: columnOffsets[column] + (columnWidths[column] - item.width) / 2,
      y: rowOffsets[row] + (rowHeights[row] - item.height) / 2
    });
  });
  return positions;
}
