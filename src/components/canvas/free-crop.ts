import type { ImageCropRect } from "@shared/types";

export type FreeCropHandle = "nw" | "ne" | "sw" | "se";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createInitialFreeCrop(width: number, height: number): ImageCropRect {
  const cropWidth = Math.max(1, Math.round(width * 0.8));
  const cropHeight = Math.max(1, Math.round(height * 0.8));
  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight
  };
}

export function createFreeCropFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  minimumSize = 8
): ImageCropRect {
  const left = clamp(Math.min(start.x, end.x), 0, imageWidth - 1);
  const top = clamp(Math.min(start.y, end.y), 0, imageHeight - 1);
  const right = clamp(Math.max(start.x, end.x), left + 1, imageWidth);
  const bottom = clamp(Math.max(start.y, end.y), top + 1, imageHeight);
  const width = Math.max(Math.min(minimumSize, imageWidth - left), right - left);
  const height = Math.max(Math.min(minimumSize, imageHeight - top), bottom - top);
  return {
    x: Math.round(clamp(left, 0, imageWidth - width)),
    y: Math.round(clamp(top, 0, imageHeight - height)),
    width: Math.round(width),
    height: Math.round(height)
  };
}

export function moveFreeCrop(
  crop: ImageCropRect,
  deltaX: number,
  deltaY: number,
  imageWidth: number,
  imageHeight: number
): ImageCropRect {
  return {
    ...crop,
    x: Math.round(clamp(crop.x + deltaX, 0, imageWidth - crop.width)),
    y: Math.round(clamp(crop.y + deltaY, 0, imageHeight - crop.height))
  };
}

export function resizeFreeCrop(
  crop: ImageCropRect,
  handle: FreeCropHandle,
  deltaX: number,
  deltaY: number,
  imageWidth: number,
  imageHeight: number,
  minimumSize = 8
): ImageCropRect {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (handle.includes("w")) left = clamp(left + deltaX, 0, right - minimumSize);
  if (handle.includes("e")) right = clamp(right + deltaX, left + minimumSize, imageWidth);
  if (handle.includes("n")) top = clamp(top + deltaY, 0, bottom - minimumSize);
  if (handle.includes("s")) bottom = clamp(bottom + deltaY, top + minimumSize, imageHeight);
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}
