export interface BackgroundRemovalResult {
  pixels: Uint8Array;
  removedPixels: number;
  alreadyTransparent: boolean;
}

const CHANNELS_PER_PIXEL = 4;
const ALPHA_CHANNEL = 3;
const TRANSPARENT_ALPHA = 16;
const LOCAL_COLOR_DISTANCE = 34;

function colorDistanceSquared(pixels: Uint8Array, first: number, second: number): number {
  const firstOffset = first * CHANNELS_PER_PIXEL;
  const secondOffset = second * CHANNELS_PER_PIXEL;
  const channel0 = pixels[firstOffset] - pixels[secondOffset];
  const channel1 = pixels[firstOffset + 1] - pixels[secondOffset + 1];
  const channel2 = pixels[firstOffset + 2] - pixels[secondOffset + 2];
  return channel0 * channel0 + channel1 * channel1 + channel2 * channel2;
}

function alphaAt(pixels: Uint8Array, index: number): number {
  return pixels[index * CHANNELS_PER_PIXEL + ALPHA_CHANNEL];
}

function setAlpha(pixels: Uint8Array, index: number, alpha: number): void {
  const offset = index * CHANNELS_PER_PIXEL;
  pixels[offset + ALPHA_CHANNEL] = alpha;
}

function hasTransparentCorners(pixels: Uint8Array, width: number, height: number): boolean {
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  return corners.every((index) => alphaAt(pixels, index) <= TRANSPARENT_ALPHA);
}

function restoreEnclosedForeground(background: Uint8Array, width: number, height: number): void {
  const cellSize = Math.max(2, Math.ceil(Math.min(width, height) / 320));
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const foregroundCells = new Uint8Array(gridWidth * gridHeight);
  const rowMinimum = new Int32Array(gridHeight).fill(gridWidth);
  const rowMaximum = new Int32Array(gridHeight).fill(-1);
  const topMinimum = new Int32Array(gridHeight).fill(gridWidth);
  const topMaximum = new Int32Array(gridHeight).fill(-1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (background[y * width + x]) continue;
      foregroundCells[Math.floor(y / cellSize) * gridWidth + Math.floor(x / cellSize)] = 1;
    }
  }

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      if (!foregroundCells[y * gridWidth + x]) continue;
      rowMinimum[y] = Math.min(rowMinimum[y], x);
      rowMaximum[y] = Math.max(rowMaximum[y], x);
    }
  }

  const reliableSpan = Math.max(3, Math.round(gridWidth * 0.6));
  let firstReliable = -1;
  let lastReliable = -1;
  let firstForeground = -1;
  let lastForeground = -1;
  for (let y = 0; y < gridHeight; y += 1) {
    if (rowMaximum[y] >= 0) {
      if (firstForeground < 0) firstForeground = y;
      lastForeground = y;
    }
    const span = rowMaximum[y] - rowMinimum[y];
    const center = (rowMaximum[y] + rowMinimum[y]) / 2;
    if (span < reliableSpan || Math.abs(center - gridWidth / 2) > gridWidth * 0.12) continue;
    if (firstReliable < 0) firstReliable = y;
    lastReliable = y;
  }

  if (firstReliable >= 0) {
    for (let y = firstReliable; y <= lastReliable; y += 1) {
      const span = rowMaximum[y] - rowMinimum[y];
      const center = (rowMaximum[y] + rowMinimum[y]) / 2;
      if (span >= reliableSpan && Math.abs(center - gridWidth / 2) <= gridWidth * 0.12) continue;
      rowMinimum[y] = gridWidth;
      rowMaximum[y] = -1;
    }
    fillExtentGaps(rowMinimum, rowMaximum);

    const stableCenter = gridWidth / 2;
    let topSpan = rowMaximum[firstReliable] - rowMinimum[firstReliable];
    for (let y = firstReliable - 1; y >= firstForeground; y -= 1) {
      topSpan = Math.max(0, topSpan - 3);
      topMinimum[y] = Math.max(0, Math.round(stableCenter - topSpan / 2));
      topMaximum[y] = Math.min(gridWidth - 1, topMinimum[y] + topSpan);
    }

    let previousSpan = rowMaximum[lastReliable] - rowMinimum[lastReliable];
    for (let y = lastReliable + 1; y <= lastForeground; y += 1) {
      const rawSpan = rowMaximum[y] >= 0 ? rowMaximum[y] - rowMinimum[y] : 0;
      const span = Math.max(rawSpan, previousSpan - 2);
      rowMinimum[y] = Math.max(0, Math.round(stableCenter - span / 2));
      rowMaximum[y] = Math.min(gridWidth - 1, rowMinimum[y] + span);
      previousSpan = span;
    }

    const smoothedMinimum = new Int32Array(rowMinimum);
    const smoothedMaximum = new Int32Array(rowMaximum);
    const radius = 3;
    for (let y = firstReliable; y <= lastForeground; y += 1) {
      let minimum = gridWidth;
      let maximum = -1;
      for (let nearby = Math.max(firstReliable, y - radius); nearby <= Math.min(lastForeground, y + radius); nearby += 1) {
        if (rowMaximum[nearby] < 0) continue;
        minimum = Math.min(minimum, rowMinimum[nearby]);
        maximum = Math.max(maximum, rowMaximum[nearby]);
      }
      smoothedMinimum[y] = minimum;
      smoothedMaximum[y] = maximum;
    }
    rowMinimum.set(smoothedMinimum);
    rowMaximum.set(smoothedMaximum);
  } else {
    fillExtentGaps(rowMinimum, rowMaximum);
  }

  for (let y = 0; y < gridHeight; y += 1) {
    const restoreMinimum = firstReliable >= 0 && y < firstReliable
      ? Math.min(rowMinimum[y], topMinimum[y])
      : rowMinimum[y];
    const restoreMaximum = firstReliable >= 0 && y < firstReliable
      ? Math.max(rowMaximum[y], topMaximum[y])
      : rowMaximum[y];
    if (restoreMaximum < 0) continue;
    for (let x = Math.max(0, restoreMinimum); x <= Math.min(gridWidth - 1, restoreMaximum); x += 1) {
      if (
        firstReliable >= 0 &&
        y < firstReliable &&
        !foregroundCells[y * gridWidth + x] &&
        (topMaximum[y] < 0 || x < topMinimum[y] || x > topMaximum[y])
      ) continue;
      const startX = x * cellSize;
      const startY = y * cellSize;
      for (let pixelY = startY; pixelY < Math.min(height, startY + cellSize); pixelY += 1) {
        for (let pixelX = startX; pixelX < Math.min(width, startX + cellSize); pixelX += 1) {
          background[pixelY * width + pixelX] = 0;
        }
      }
    }
  }
}

function fillExtentGaps(minimum: Int32Array, maximum: Int32Array): void {
  let previous = -1;
  for (let index = 0; index < maximum.length; index += 1) {
    if (maximum[index] < 0) continue;
    if (previous >= 0 && index - previous > 1) {
      const span = index - previous;
      for (let gap = previous + 1; gap < index; gap += 1) {
        const progress = (gap - previous) / span;
        minimum[gap] = Math.round(minimum[previous] + (minimum[index] - minimum[previous]) * progress);
        maximum[gap] = Math.round(maximum[previous] + (maximum[index] - maximum[previous]) * progress);
      }
    }
    previous = index;
  }
}

/**
 * Removes a locally continuous background grown inward from the four corners.
 * The routine is deliberately model-free and works best for a centered subject
 * separated from its background by a visible edge.
 */
export function removeConnectedBackground(
  sourcePixels: Uint8Array,
  width: number,
  height: number
): BackgroundRemovalResult {
  const pixelCount = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("图片尺寸无效。");
  }
  if (sourcePixels.length !== pixelCount * CHANNELS_PER_PIXEL) {
    throw new Error("图片像素数据长度无效。");
  }

  const pixels = new Uint8Array(sourcePixels);
  if (hasTransparentCorners(pixels, width, height)) {
    let removedPixels = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      if (alphaAt(pixels, index) <= TRANSPARENT_ALPHA) removedPixels += 1;
    }
    return {
      pixels,
      removedPixels,
      alreadyTransparent: true
    };
  }

  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const seedSize = Math.max(2, Math.min(24, Math.round(Math.min(width, height) * 0.012)));

  const enqueue = (x: number, y: number): void => {
    const index = y * width + x;
    if (background[index]) return;
    background[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  for (let offsetY = 0; offsetY < seedSize; offsetY += 1) {
    for (let offsetX = 0; offsetX < seedSize; offsetX += 1) {
      enqueue(offsetX, offsetY);
      enqueue(width - 1 - offsetX, offsetY);
      enqueue(offsetX, height - 1 - offsetY);
      enqueue(width - 1 - offsetX, height - 1 - offsetY);
    }
  }

  const maximumDistanceSquared = LOCAL_COLOR_DISTANCE * LOCAL_COLOR_DISTANCE;
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],   [1, 1]
  ] as const;

  while (queueStart < queueEnd) {
    const current = queue[queueStart];
    queueStart += 1;
    const x = current % width;
    const y = Math.floor(current / width);

    for (const [offsetX, offsetY] of neighborOffsets) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (background[next]) continue;
      if (
        alphaAt(pixels, next) <= TRANSPARENT_ALPHA ||
        colorDistanceSquared(pixels, current, next) <= maximumDistanceSquared
      ) {
        background[next] = 1;
        queue[queueEnd] = next;
        queueEnd += 1;
      }
    }
  }

  if (queueEnd > pixelCount * 0.75) restoreEnclosedForeground(background, width, height);

  let removedPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (!background[index]) continue;
    setAlpha(pixels, index, 0);
    removedPixels += 1;
  }

  return { pixels, removedPixels, alreadyTransparent: false };
}
