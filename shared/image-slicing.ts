import type { ImageCropRect } from "./types.js";

export const MAX_SLICE_GRID_SIZE = 8;
export const MAX_SLICE_COUNT = MAX_SLICE_GRID_SIZE * MAX_SLICE_GRID_SIZE;

export interface SliceGridInput {
  width: number;
  height: number;
  rows: number;
  columns: number;
  margin?: number;
  gap?: number;
}

export interface SliceGridDividers {
  x: number[];
  y: number[];
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}必须是正整数。`);
}

function axisSegments(size: number, count: number, margin: number, gap: number): Array<{ start: number; size: number }> {
  const available = size - margin * 2 - gap * (count - 1);
  if (available < count) throw new Error("边距或间距过大，切片没有足够的像素。");

  return Array.from({ length: count }, (_, index) => {
    const start = margin + Math.round((index * available) / count) + index * gap;
    const end = margin + Math.round(((index + 1) * available) / count) + index * gap;
    return { start, size: end - start };
  });
}

function validateGridInput(input: SliceGridInput): Required<SliceGridInput> {
  const { width, height, rows, columns, margin = 0, gap = 0 } = input;
  assertPositiveInteger(width, "图片宽度");
  assertPositiveInteger(height, "图片高度");
  assertPositiveInteger(rows, "行数");
  assertPositiveInteger(columns, "列数");
  if (rows > MAX_SLICE_GRID_SIZE || columns > MAX_SLICE_GRID_SIZE) {
    throw new Error(`行列数不能超过 ${MAX_SLICE_GRID_SIZE}。`);
  }
  if (!Number.isSafeInteger(margin) || margin < 0) throw new Error("边距必须是非负整数。");
  if (!Number.isSafeInteger(gap) || gap < 0) throw new Error("间距必须是非负整数。");
  return { width, height, rows, columns, margin, gap };
}

function axisSegmentsFromDividers(
  size: number,
  count: number,
  margin: number,
  gap: number,
  dividers: number[]
): Array<{ start: number; size: number }> {
  if (dividers.length !== count - 1) throw new Error("切分线数量与宫格不匹配。");
  const segments: Array<{ start: number; size: number }> = [];
  let start = margin;

  for (let index = 0; index < count; index += 1) {
    const end = index < dividers.length ? dividers[index] : size - margin;
    if (!Number.isSafeInteger(end)) throw new Error("切分线坐标必须是整数。");
    if (end <= start) throw new Error("切分线距离过近，切片没有足够的像素。");
    segments.push({ start, size: end - start });
    start = end + gap;
  }
  return segments;
}

/** 计算等分宫格的原图像素坐标，保证奇数尺寸也不会重叠或漏掉有效区域。 */
export function calculateSliceGrid(input: SliceGridInput): ImageCropRect[] {
  const { width, height, rows, columns, margin, gap } = validateGridInput(input);

  const xs = axisSegments(width, columns, margin, gap);
  const ys = axisSegments(height, rows, margin, gap);
  return ys.flatMap((vertical) =>
    xs.map((horizontal) => ({
      x: horizontal.start,
      y: vertical.start,
      width: horizontal.size,
      height: vertical.size
    }))
  );
}

export function calculateSliceGridDividers(input: SliceGridInput): SliceGridDividers {
  const { rows, columns } = validateGridInput(input);
  const crops = calculateSliceGrid(input);
  return {
    x: crops.slice(0, Math.max(0, columns - 1)).map((crop) => crop.x + crop.width),
    y: Array.from({ length: Math.max(0, rows - 1) }, (_, row) => {
      const crop = crops[row * columns];
      return crop.y + crop.height;
    })
  };
}

export function calculateSliceGridFromDividers(
  input: SliceGridInput,
  dividers: SliceGridDividers
): ImageCropRect[] {
  const { width, height, rows, columns, margin, gap } = validateGridInput(input);
  const xs = axisSegmentsFromDividers(width, columns, margin, gap, dividers.x);
  const ys = axisSegmentsFromDividers(height, rows, margin, gap, dividers.y);
  return ys.flatMap((vertical) =>
    xs.map((horizontal) => ({
      x: horizontal.start,
      y: vertical.start,
      width: horizontal.size,
      height: vertical.size
    }))
  );
}

export function validateCropRect(crop: ImageCropRect, imageWidth: number, imageHeight: number): void {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (values.some((value) => !Number.isSafeInteger(value))) throw new Error("切图坐标必须是整数。");
  if (crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0) throw new Error("切图区域无效。");
  if (crop.x + crop.width > imageWidth || crop.y + crop.height > imageHeight) {
    throw new Error("切图区域超出图片范围。");
  }
}
