import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OpaqueEdgeFractions {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface OpaqueBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthFraction: number;
  heightFraction: number;
}

export interface PhotoLayerFocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoLayerMaskPlacement {
  bgra: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoLayerProtectedEdges {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

const PHOTO_LAYER_COLOR_DISTANCE = 34;

function photoLayerColorDistanceSquared(pixels: Uint8Array, first: number, second: number): number {
  const firstOffset = first * 4;
  const secondOffset = second * 4;
  const blue = pixels[firstOffset] - pixels[secondOffset];
  const green = pixels[firstOffset + 1] - pixels[secondOffset + 1];
  const red = pixels[firstOffset + 2] - pixels[secondOffset + 2];
  return blue * blue + green * green + red * red;
}

export function extractConnectedPhotoSubject(
  sourceBgra: Uint8Array,
  width: number,
  height: number,
  protectedEdges: PhotoLayerProtectedEdges = {}
): Uint8Array {
  if (width < 1 || height < 1 || sourceBgra.byteLength !== width * height * 4) {
    throw new Error("照片主体像素数据无效。");
  }
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number): void => {
    if (background[index]) return;
    background[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  const edgeCandidates: number[] = [];
  const edgeCandidateSeen = new Uint8Array(pixelCount);
  const addEdgeCandidate = (index: number): void => {
    if (edgeCandidateSeen[index]) return;
    edgeCandidateSeen[index] = 1;
    edgeCandidates.push(index);
  };
  if (!protectedEdges.top) {
    for (let x = 0; x < width; x += 1) addEdgeCandidate(x);
  }
  if (!protectedEdges.bottom) {
    for (let x = 0; x < width; x += 1) addEdgeCandidate((height - 1) * width + x);
  }
  if (!protectedEdges.left) {
    for (let y = 0; y < height; y += 1) addEdgeCandidate(y * width);
  }
  if (!protectedEdges.right) {
    for (let y = 0; y < height; y += 1) addEdgeCandidate(y * width + width - 1);
  }
  if (edgeCandidates.length === 0) {
    addEdgeCandidate(0);
    addEdgeCandidate(width - 1);
    addEdgeCandidate((height - 1) * width);
    addEdgeCandidate(pixelCount - 1);
  }

  const colorBuckets = new Map<number, { count: number; blue: number; green: number; red: number }>();
  for (const index of edgeCandidates) {
    const offset = index * 4;
    const key = (
      (sourceBgra[offset] >> 5)
      | ((sourceBgra[offset + 1] >> 5) << 3)
      | ((sourceBgra[offset + 2] >> 5) << 6)
    );
    const bucket = colorBuckets.get(key) ?? { count: 0, blue: 0, green: 0, red: 0 };
    bucket.count += 1;
    bucket.blue += sourceBgra[offset];
    bucket.green += sourceBgra[offset + 1];
    bucket.red += sourceBgra[offset + 2];
    colorBuckets.set(key, bucket);
  }
  const dominant = [...colorBuckets.values()]
    .sort((left, right) => right.count - left.count)[0];
  if (!dominant) throw new Error("照片主体边缘像素无效。");
  const dominantBlue = dominant.blue / dominant.count;
  const dominantGreen = dominant.green / dominant.count;
  const dominantRed = dominant.red / dominant.count;
  const maximumSeedDistanceSquared = 72 * 72;
  for (const index of edgeCandidates) {
    const offset = index * 4;
    const blue = sourceBgra[offset] - dominantBlue;
    const green = sourceBgra[offset + 1] - dominantGreen;
    const red = sourceBgra[offset + 2] - dominantRed;
    if (blue * blue + green * green + red * red <= maximumSeedDistanceSquared) enqueue(index);
  }
  if (tail === 0) enqueue(edgeCandidates[0]);

  const maximumDistanceSquared = PHOTO_LAYER_COLOR_DISTANCE * PHOTO_LAYER_COLOR_DISTANCE;
  const dominantChannels = [dominantBlue, dominantGreen, dominantRed];
  const dominantMaximumChannel = dominantChannels.indexOf(Math.max(...dominantChannels));
  const dominantMinimumChannel = dominantChannels.indexOf(Math.min(...dominantChannels));
  const dominantChroma = dominantChannels[dominantMaximumChannel] - dominantChannels[dominantMinimumChannel];
  const maximumBackgroundDistanceSquared = 110 * 110;
  while (head < tail) {
    const current = queue[head];
    head += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (background[next]) continue;
        if (photoLayerColorDistanceSquared(sourceBgra, current, next) > maximumDistanceSquared) continue;
        const nextOffset = next * 4;
        const nextChannels = [
          sourceBgra[nextOffset],
          sourceBgra[nextOffset + 1],
          sourceBgra[nextOffset + 2]
        ];
        if (dominantChroma >= 40) {
          const directionalChroma = (
            nextChannels[dominantMaximumChannel] - nextChannels[dominantMinimumChannel]
          );
          const otherMaximum = Math.max(
            ...nextChannels.filter((_value, index) => index !== dominantMaximumChannel)
          );
          if (
            directionalChroma < Math.max(18, dominantChroma * 0.15)
            || nextChannels[dominantMaximumChannel] < otherMaximum - 10
          ) continue;
        } else {
          const blue = nextChannels[0] - dominantBlue;
          const green = nextChannels[1] - dominantGreen;
          const red = nextChannels[2] - dominantRed;
          if (blue * blue + green * green + red * red > maximumBackgroundDistanceSquared) continue;
        }
        background[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  const components = new Int32Array(pixelCount).fill(-1);
  const componentPixels: number[][] = [];
  const centerLeft = Math.floor(width * 0.3);
  const centerRight = Math.ceil(width * 0.7);
  const centerTop = Math.floor(height * 0.3);
  const centerBottom = Math.ceil(height * 0.7);
  const componentScores: Array<{ centerPixels: number; distance: number; area: number }> = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (background[start] || components[start] >= 0) continue;
    const component = componentPixels.length;
    const pixels: number[] = [];
    let componentHead = 0;
    let centerPixels = 0;
    let minimumDistance = Number.POSITIVE_INFINITY;
    components[start] = component;
    queue[0] = start;
    let componentTail = 1;
    while (componentHead < componentTail) {
      const current = queue[componentHead];
      componentHead += 1;
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      if (x >= centerLeft && x < centerRight && y >= centerTop && y < centerBottom) centerPixels += 1;
      const dx = x - width / 2;
      const dy = y - height / 2;
      minimumDistance = Math.min(minimumDistance, dx * dx + dy * dy);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (background[next] || components[next] >= 0) continue;
          components[next] = component;
          queue[componentTail] = next;
          componentTail += 1;
        }
      }
    }
    componentPixels.push(pixels);
    componentScores.push({ centerPixels, distance: minimumDistance, area: pixels.length });
  }
  if (componentPixels.length === 0) return new Uint8Array(sourceBgra.length);
  let best = 0;
  for (let index = 1; index < componentScores.length; index += 1) {
    const candidate = componentScores[index];
    const current = componentScores[best];
    const isBetter = candidate.centerPixels !== current.centerPixels
      ? candidate.centerPixels > current.centerPixels
      : candidate.distance !== current.distance
        ? candidate.distance < current.distance
        : candidate.area > current.area;
    if (isBetter) best = index;
  }
  const output = new Uint8Array(sourceBgra);
  for (let index = 0; index < pixelCount; index += 1) output[index * 4 + 3] = 0;
  for (const index of componentPixels[best]) output[index * 4 + 3] = sourceBgra[index * 4 + 3];
  return output;
}

export function extractChromaticPhotoSubject(
  sourceBgra: Uint8Array,
  width: number,
  height: number,
  protectedEdges: PhotoLayerProtectedEdges = {}
): Uint8Array {
  if (width < 1 || height < 1 || sourceBgra.byteLength !== width * height * 4) {
    throw new Error("照片主体像素数据无效。");
  }
  const edgeIndices: number[] = [];
  const seenEdges = new Uint8Array(width * height);
  const addEdge = (index: number): void => {
    if (seenEdges[index]) return;
    seenEdges[index] = 1;
    edgeIndices.push(index);
  };
  if (!protectedEdges.top) for (let x = 0; x < width; x += 1) addEdge(x);
  if (!protectedEdges.bottom) for (let x = 0; x < width; x += 1) addEdge((height - 1) * width + x);
  if (!protectedEdges.left) for (let y = 0; y < height; y += 1) addEdge(y * width);
  if (!protectedEdges.right) for (let y = 0; y < height; y += 1) addEdge(y * width + width - 1);
  if (edgeIndices.length === 0) {
    addEdge(0);
    addEdge(width - 1);
    addEdge((height - 1) * width);
    addEdge(width * height - 1);
  }

  const buckets = new Map<number, { count: number; channels: [number, number, number] }>();
  for (const index of edgeIndices) {
    const offset = index * 4;
    const key = (
      (sourceBgra[offset] >> 5)
      | ((sourceBgra[offset + 1] >> 5) << 3)
      | ((sourceBgra[offset + 2] >> 5) << 6)
    );
    const bucket = buckets.get(key) ?? { count: 0, channels: [0, 0, 0] };
    bucket.count += 1;
    bucket.channels[0] += sourceBgra[offset];
    bucket.channels[1] += sourceBgra[offset + 1];
    bucket.channels[2] += sourceBgra[offset + 2];
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  if (!dominant) return new Uint8Array(sourceBgra.length);
  const backgroundChannels = dominant.channels.map((value) => value / dominant.count);
  const backgroundMaximumChannel = backgroundChannels.indexOf(Math.max(...backgroundChannels));
  const backgroundMinimumChannel = backgroundChannels.indexOf(Math.min(...backgroundChannels));
  const backgroundChroma = (
    backgroundChannels[backgroundMaximumChannel] - backgroundChannels[backgroundMinimumChannel]
  );
  if (backgroundChroma < 40) return new Uint8Array(sourceBgra.length);

  const candidate = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const channels = [sourceBgra[offset], sourceBgra[offset + 1], sourceBgra[offset + 2]];
    const maximum = Math.max(...channels);
    const minimum = Math.min(...channels);
    const maximumChannel = channels.indexOf(maximum);
    const followsBackgroundDirection = (
      maximumChannel === backgroundMaximumChannel
      && channels[backgroundMaximumChannel] - channels[backgroundMinimumChannel] >= 18
    );
    if (!followsBackgroundDirection && maximum - minimum >= 35) candidate[index] = 1;
  }

  const queue = new Int32Array(width * height);
  const component = new Int32Array(width * height).fill(-1);
  const components: number[][] = [];
  const scores: Array<{ centerPixels: number; area: number }> = [];
  const centerLeft = Math.floor(width * 0.2);
  const centerRight = Math.ceil(width * 0.8);
  const centerTop = Math.floor(height * 0.2);
  const centerBottom = Math.ceil(height * 0.8);
  for (let start = 0; start < candidate.length; start += 1) {
    if (!candidate[start] || component[start] >= 0) continue;
    const componentIndex = components.length;
    const pixels: number[] = [];
    let head = 0;
    let tail = 1;
    let centerPixels = 0;
    queue[0] = start;
    component[start] = componentIndex;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      if (x >= centerLeft && x < centerRight && y >= centerTop && y < centerBottom) centerPixels += 1;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (!candidate[next] || component[next] >= 0) continue;
          component[next] = componentIndex;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
    components.push(pixels);
    scores.push({ centerPixels, area: pixels.length });
  }
  if (components.length === 0) return new Uint8Array(sourceBgra.length);
  let best = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (
      scores[index].centerPixels > scores[best].centerPixels
      || (
        scores[index].centerPixels === scores[best].centerPixels
        && scores[index].area > scores[best].area
      )
    ) best = index;
  }
  const output = new Uint8Array(sourceBgra);
  for (let index = 0; index < width * height; index += 1) output[index * 4 + 3] = 0;
  for (const index of components[best]) output[index * 4 + 3] = sourceBgra[index * 4 + 3];
  return output;
}

export function fillPhotoLayerInterior(
  sourceBgra: Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 32,
  protectedEdges: PhotoLayerProtectedEdges = {}
): Uint8Array {
  if (width < 1 || height < 1 || sourceBgra.byteLength !== width * height * 4) {
    throw new Error("照片主体像素数据无效。");
  }
  const output = new Uint8Array(sourceBgra);
  for (let y = 0; y < height; y += 1) {
    let left = width;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (output[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
    if (right < left) continue;
    if (protectedEdges.left) left = 0;
    if (protectedEdges.right) right = width - 1;
    for (let x = left; x <= right; x += 1) output[(y * width + x) * 4 + 3] = 255;
  }
  if (protectedEdges.top || protectedEdges.bottom) {
    for (let x = 0; x < width; x += 1) {
      let top = height;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
        if (output[(y * width + x) * 4 + 3] < alphaThreshold) continue;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      if (bottom < top) continue;
      if (protectedEdges.top) top = 0;
      if (protectedEdges.bottom) bottom = height - 1;
      for (let y = top; y <= bottom; y += 1) output[(y * width + x) * 4 + 3] = 255;
    }
  }
  return output;
}

export function subtractPhotoLayerMask(
  sourceBgra: Uint8Array,
  maskBgra: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (
    width < 1 || height < 1
    || sourceBgra.byteLength !== width * height * 4
    || maskBgra.byteLength !== sourceBgra.byteLength
  ) {
    throw new Error("照片图层蒙版像素数据无效。");
  }
  const output = new Uint8Array(sourceBgra);
  for (let offset = 3; offset < output.byteLength; offset += 4) {
    if (maskBgra[offset] >= 32) output[offset] = 0;
  }
  return output;
}

export function intersectPhotoLayerMask(
  sourceBgra: Uint8Array,
  maskBgra: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (
    width < 1 || height < 1
    || sourceBgra.byteLength !== width * height * 4
    || maskBgra.byteLength !== sourceBgra.byteLength
  ) {
    throw new Error("照片图层蒙版像素数据无效。");
  }
  const output = new Uint8Array(sourceBgra);
  for (let offset = 3; offset < output.byteLength; offset += 4) {
    if (maskBgra[offset] < 32) output[offset] = 0;
  }
  return output;
}

export function inpaintPhotoBackground(
  sourceBgra: Uint8Array,
  width: number,
  height: number,
  placements: readonly PhotoLayerMaskPlacement[],
  dilationRadius = 12,
  blurRadius = 16
): Uint8Array {
  if (width < 1 || height < 1 || sourceBgra.byteLength !== width * height * 4) {
    throw new Error("照片背景像素数据无效。");
  }
  const pixelCount = width * height;
  let mask = new Uint8Array(pixelCount);
  for (const placement of placements) {
    if (
      placement.width < 1 || placement.height < 1
      || placement.bgra.byteLength !== placement.width * placement.height * 4
      || placement.x < 0 || placement.y < 0
      || placement.x + placement.width > width
      || placement.y + placement.height > height
    ) {
      throw new Error("照片背景蒙版位置无效。");
    }
    for (let localY = 0; localY < placement.height; localY += 1) {
      for (let localX = 0; localX < placement.width; localX += 1) {
        const localIndex = localY * placement.width + localX;
        if (placement.bgra[localIndex * 4 + 3] < 32) continue;
        mask[(placement.y + localY) * width + placement.x + localX] = 1;
      }
    }
  }

  for (let iteration = 0; iteration < dilationRadius; iteration += 1) {
    const expanded = new Uint8Array(mask);
    for (let index = 0; index < pixelCount; index += 1) {
      if (!mask[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) expanded[index - 1] = 1;
      if (x + 1 < width) expanded[index + 1] = 1;
      if (y > 0) expanded[index - width] = 1;
      if (y + 1 < height) expanded[index + width] = 1;
    }
    mask = expanded;
  }

  const output = new Uint8Array(sourceBgra);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (mask[index]) continue;
    queue[tail] = index;
    tail += 1;
  }
  if (tail === 0) throw new Error("照片主体覆盖整张背景，无法生成完整背景层。");

  const pending = new Uint8Array(mask);
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || !pending[neighbor]) continue;
      const sourceOffset = index * 4;
      const targetOffset = neighbor * 4;
      output[targetOffset] = output[sourceOffset];
      output[targetOffset + 1] = output[sourceOffset + 1];
      output[targetOffset + 2] = output[sourceOffset + 2];
      output[targetOffset + 3] = 255;
      pending[neighbor] = 0;
      queue[tail] = neighbor;
      tail += 1;
    }
  }

  if (blurRadius > 0) {
    const radius = Math.max(1, Math.floor(blurRadius));
    const horizontal = new Uint8Array(output.byteLength);
    const blurred = new Uint8Array(output.byteLength);
    for (let y = 0; y < height; y += 1) {
      const sums = [0, 0, 0];
      let start = 0;
      let end = Math.min(width - 1, radius);
      for (let x = start; x <= end; x += 1) {
        const offset = (y * width + x) * 4;
        sums[0] += output[offset];
        sums[1] += output[offset + 1];
        sums[2] += output[offset + 2];
      }
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const count = end - start + 1;
        horizontal[offset] = Math.round(sums[0] / count);
        horizontal[offset + 1] = Math.round(sums[1] / count);
        horizontal[offset + 2] = Math.round(sums[2] / count);
        horizontal[offset + 3] = 255;
        const nextStart = Math.max(0, x - radius + 1);
        const nextEnd = Math.min(width - 1, x + radius + 1);
        if (nextStart > start) {
          const removeOffset = (y * width + start) * 4;
          sums[0] -= output[removeOffset];
          sums[1] -= output[removeOffset + 1];
          sums[2] -= output[removeOffset + 2];
          start = nextStart;
        }
        if (nextEnd > end) {
          const addOffset = (y * width + nextEnd) * 4;
          sums[0] += output[addOffset];
          sums[1] += output[addOffset + 1];
          sums[2] += output[addOffset + 2];
          end = nextEnd;
        }
      }
    }
    for (let x = 0; x < width; x += 1) {
      const sums = [0, 0, 0];
      let start = 0;
      let end = Math.min(height - 1, radius);
      for (let y = start; y <= end; y += 1) {
        const offset = (y * width + x) * 4;
        sums[0] += horizontal[offset];
        sums[1] += horizontal[offset + 1];
        sums[2] += horizontal[offset + 2];
      }
      for (let y = 0; y < height; y += 1) {
        const offset = (y * width + x) * 4;
        const count = end - start + 1;
        blurred[offset] = Math.round(sums[0] / count);
        blurred[offset + 1] = Math.round(sums[1] / count);
        blurred[offset + 2] = Math.round(sums[2] / count);
        blurred[offset + 3] = 255;
        const nextStart = Math.max(0, y - radius + 1);
        const nextEnd = Math.min(height - 1, y + radius + 1);
        if (nextStart > start) {
          const removeOffset = (start * width + x) * 4;
          sums[0] -= horizontal[removeOffset];
          sums[1] -= horizontal[removeOffset + 1];
          sums[2] -= horizontal[removeOffset + 2];
          start = nextStart;
        }
        if (nextEnd > end) {
          const addOffset = (nextEnd * width + x) * 4;
          sums[0] += horizontal[addOffset];
          sums[1] += horizontal[addOffset + 1];
          sums[2] += horizontal[addOffset + 2];
          end = nextEnd;
        }
      }
    }
    for (let index = 0; index < pixelCount; index += 1) {
      if (!mask[index]) continue;
      const offset = index * 4;
      output[offset] = blurred[offset];
      output[offset + 1] = blurred[offset + 1];
      output[offset + 2] = blurred[offset + 2];
      output[offset + 3] = 255;
    }
  }
  return output;
}

export function measureOpaqueFraction(
  bgra: Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 32
): number {
  if (width < 1 || height < 1 || bgra.byteLength !== width * height * 4) {
    throw new Error("照片分层像素数据无效。");
  }
  let opaque = 0;
  for (let offset = 3; offset < bgra.byteLength; offset += 4) {
    if (bgra[offset] >= alphaThreshold) opaque += 1;
  }
  return opaque / (width * height);
}

export function measureOpaqueBounds(
  bgra: Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 32
): OpaqueBounds | null {
  if (width < 1 || height < 1 || bgra.byteLength !== width * height * 4) {
    throw new Error("照片分层像素数据无效。");
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bgra[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    widthFraction: (maxX - minX + 1) / width,
    heightFraction: (maxY - minY + 1) / height
  };
}

export function measureOpaqueEdgeFractions(
  bgra: Uint8Array,
  width: number,
  height: number,
  thickness = 2
): OpaqueEdgeFractions {
  if (width < 1 || height < 1 || bgra.byteLength !== width * height * 4) {
    throw new Error("照片分层像素数据无效。");
  }
  const edgeThickness = Math.max(1, Math.min(thickness, width, height));
  const countOpaque = (offsets: number[]): number => (
    offsets.reduce((count, offset) => count + (bgra[offset + 3] >= 32 ? 1 : 0), 0) / offsets.length
  );
  const horizontalOffsets = (startY: number): number[] => Array.from(
    { length: width * edgeThickness },
    (_, index) => ((startY + Math.floor(index / width)) * width + (index % width)) * 4
  );
  const verticalOffsets = (startX: number): number[] => Array.from(
    { length: height * edgeThickness },
    (_, index) => ((Math.floor(index / edgeThickness) * width) + startX + (index % edgeThickness)) * 4
  );
  return {
    top: countOpaque(horizontalOffsets(0)),
    right: countOpaque(verticalOffsets(width - edgeThickness)),
    bottom: countOpaque(horizontalOffsets(height - edgeThickness)),
    left: countOpaque(verticalOffsets(0))
  };
}

export function hasLostProtectedOpaqueEdge(
  local: OpaqueEdgeFractions,
  generated: OpaqueEdgeFractions,
  protectedEdges: PhotoLayerProtectedEdges,
  minimumLocalFraction = 0.02,
  minimumRetention = 0.5
): boolean {
  return (Object.keys(protectedEdges) as Array<keyof PhotoLayerProtectedEdges>).some((edge) => (
    protectedEdges[edge]
    && local[edge] > minimumLocalFraction
    && generated[edge] < local[edge] * minimumRetention
  ));
}

export async function segmentPhotoLayer(
  input: Buffer,
  executablePath: string,
  target: "foreground" | "person" = "foreground",
  focus?: PhotoLayerFocusRect
): Promise<Buffer> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "iterlay-photo-layer-"));
  const inputPath = path.join(temporaryDirectory, "input.png");
  const outputPath = path.join(temporaryDirectory, "output.png");
  try {
    await writeFile(inputPath, input);
    const args = [inputPath, outputPath, target];
    if (focus) {
      args.push(
        String(focus.x),
        String(focus.y),
        String(focus.width),
        String(focus.height)
      );
    }
    await execFileAsync(executablePath, args, {
      timeout: 60_000,
      maxBuffer: 1024 * 1024
    });
    const output = await readFile(outputPath);
    if (output.byteLength === 0) throw new Error("照片主体分割结果为空。");
    return output;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
