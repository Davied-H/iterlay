import type { ImageCropRect, SliceSubjectDetection } from "./types.js";

export interface RgbaPixelData {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface SubjectCropAdjustment {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface SubjectCropOptions {
  paddingRatio: number;
  normalizeScale: boolean;
  adjustments?: Record<number, SubjectCropAdjustment>;
  constrainToCell?: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

interface PaletteColor {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface Component {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesEdge: boolean;
}

const DEFAULT_ADJUSTMENT: SubjectCropAdjustment = { offsetX: 0, offsetY: 0, zoom: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pixelOffset(imageWidth: number, x: number, y: number): number {
  return (y * imageWidth + x) * 4;
}

function isInsideImage(crop: ImageCropRect, image: RgbaPixelData): boolean {
  return crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
    crop.x + crop.width <= image.width && crop.y + crop.height <= image.height;
}

function collectBorderPalette(image: RgbaPixelData, crop: ImageCropRect): {
  palette: PaletteColor[];
  transparentShare: number;
} {
  const band = Math.max(1, Math.round(Math.min(crop.width, crop.height) * 0.045));
  const buckets = new Map<number, PaletteColor>();
  let samples = 0;
  let transparent = 0;

  for (let localY = 0; localY < crop.height; localY += 1) {
    for (let localX = 0; localX < crop.width; localX += 1) {
      if (
        localX >= band && localX < crop.width - band &&
        localY >= band && localY < crop.height - band
      ) continue;
      const offset = pixelOffset(image.width, crop.x + localX, crop.y + localY);
      const alpha = image.data[offset + 3] ?? 255;
      samples += 1;
      if (alpha < 32) {
        transparent += 1;
        continue;
      }
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count += 1;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }
  }

  const palette = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((color) => ({
      r: color.r / color.count,
      g: color.g / color.count,
      b: color.b / color.count,
      count: color.count
    }));
  return { palette, transparentShare: samples > 0 ? transparent / samples : 0 };
}

function colorDistanceSquared(r: number, g: number, b: number, color: PaletteColor): number {
  const red = r - color.r;
  const green = g - color.g;
  const blue = b - color.b;
  return red * red + green * green + blue * blue;
}

function buildForegroundMask(
  image: RgbaPixelData,
  crop: ImageCropRect,
  palette: PaletteColor[],
  useAlpha: boolean
): { mask: Uint8Array; foregroundCount: number; borderBackgroundShare: number } {
  const mask = new Uint8Array(crop.width * crop.height);
  const distanceThreshold = 30 * 30;
  let foregroundCount = 0;
  let borderSamples = 0;
  let borderBackground = 0;
  const borderBand = Math.max(1, Math.round(Math.min(crop.width, crop.height) * 0.045));

  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const offset = pixelOffset(image.width, crop.x + x, crop.y + y);
      const alpha = image.data[offset + 3] ?? 255;
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      const minDistance = palette.length > 0
        ? Math.min(...palette.map((color) => colorDistanceSquared(r, g, b, color)))
        : Number.POSITIVE_INFINITY;
      const foreground = useAlpha ? alpha >= 32 : alpha >= 32 && minDistance > distanceThreshold;
      const index = y * crop.width + x;
      if (foreground) {
        mask[index] = 1;
        foregroundCount += 1;
      }

      if (x < borderBand || x >= crop.width - borderBand || y < borderBand || y >= crop.height - borderBand) {
        borderSamples += 1;
        if (!foreground) borderBackground += 1;
      }
    }
  }

  return {
    mask,
    foregroundCount,
    borderBackgroundShare: borderSamples > 0 ? borderBackground / borderSamples : 0
  };
}

function findComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const queue = new Int32Array(mask.length);
  const components: Component[] = [];
  const neighbors = [-1, 0, 1];

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    mask[start] = 2;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let touchesEdge = false;

    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

      for (const dy of neighbors) {
        for (const dx of neighbors) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (mask[next] !== 1) continue;
          mask[next] = 2;
          queue[tail++] = next;
        }
      }
    }

    components.push({ area, minX, minY, maxX, maxY, touchesEdge });
  }

  return components;
}

function componentOverlap(component: Component, focus: ImageCropRect, crop: ImageCropRect): number {
  const left = Math.max(component.minX, focus.x - crop.x);
  const top = Math.max(component.minY, focus.y - crop.y);
  const right = Math.min(component.maxX + 1, focus.x + focus.width - crop.x);
  const bottom = Math.min(component.maxY + 1, focus.y + focus.height - crop.y);
  if (right <= left || bottom <= top) return 0;
  return ((right - left) * (bottom - top)) / component.area;
}

function componentDistance(first: Component, second: Component): number {
  const dx = Math.max(0, first.minX - second.maxX - 1, second.minX - first.maxX - 1);
  const dy = Math.max(0, first.minY - second.maxY - 1, second.minY - first.maxY - 1);
  return Math.hypot(dx, dy);
}

export function detectSliceSubjects(
  image: RgbaPixelData,
  crops: ImageCropRect[],
  focusCrops: ImageCropRect[] = crops
): SliceSubjectDetection[] {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) {
    throw new Error("主体识别的图片尺寸无效。");
  }
  if (image.data.length < image.width * image.height * 4) throw new Error("主体识别的像素数据不完整。");

  return crops.flatMap((crop, index) => {
    if (!isInsideImage(crop, image)) return [];
    // Expanded searches can cut through neighboring subjects. Sample the original
    // focus cell's border so those neighboring colors are not learned as background.
    const paletteCrop = isInsideImage(focusCrops[index] ?? crop, image)
      ? (focusCrops[index] ?? crop)
      : crop;
    const { palette, transparentShare } = collectBorderPalette(image, paletteCrop);
    const useAlpha = transparentShare >= 0.05;
    const { mask, foregroundCount, borderBackgroundShare } = buildForegroundMask(
      image,
      crop,
      palette,
      useAlpha
    );
    const components = findComponents(mask, crop.width, crop.height).sort((a, b) => b.area - a.area);
    const focus = focusCrops[index] ?? crop;
    const primary = components.filter((component) => {
      const centerX = crop.x + (component.minX + component.maxX + 1) / 2;
      const centerY = crop.y + (component.minY + component.maxY + 1) / 2;
      const centerInside = centerX >= focus.x && centerX <= focus.x + focus.width &&
        centerY >= focus.y && centerY <= focus.y + focus.height;
      return centerInside || componentOverlap(component, focus, crop) >= 0.35;
    });
    const mainComponent = primary[0];
    const largestArea = mainComponent?.area ?? 0;
    if (largestArea === 0) return [];
    const minimumArea = Math.max(4, Math.round(largestArea * 0.003));
    const decorationDistance = Math.max(focus.width, focus.height) * 0.18;
    const kept = components.filter((component) => {
      if (component.area < minimumArea || component.touchesEdge && component.area < largestArea * 0.08) return false;
      if (primary.includes(component)) return true;
      return component.area <= largestArea * 0.25 && componentDistance(component, mainComponent) <= decorationDistance;
    });
    if (kept.length === 0) return [];

    const localMinX = Math.min(...kept.map((component) => component.minX));
    const localMinY = Math.min(...kept.map((component) => component.minY));
    const localMaxX = Math.max(...kept.map((component) => component.maxX));
    const localMaxY = Math.max(...kept.map((component) => component.maxY));
    const keptArea = kept.reduce((sum, component) => sum + component.area, 0);
    const subjectShare = keptArea / (crop.width * crop.height);
    const touchesEdge = kept.some((component) => component.touchesEdge);
    const usableShare = foregroundCount / (crop.width * crop.height);
    const occupancyScore = subjectShare >= 0.005 && usableShare <= 0.82 ? 1 : 0.35;
    const confidence = clamp(
      0.2 + borderBackgroundShare * 0.5 + occupancyScore * 0.3 - (touchesEdge ? 0.2 : 0),
      0,
      1
    );

    return [{
      index,
      bounds: {
        x: crop.x + localMinX,
        y: crop.y + localMinY,
        width: localMaxX - localMinX + 1,
        height: localMaxY - localMinY + 1
      },
      confidence
    }];
  });
}

function requiredCropRatio(
  cell: ImageCropRect,
  bounds: ImageCropRect,
  paddingRatio: number,
  constrainToCell: boolean
): number {
  const contentRatio = Math.max(
    bounds.width / cell.width,
    bounds.height / cell.height
  );
  return clamp(contentRatio / Math.max(0.1, 1 - paddingRatio * 2), 0.05, constrainToCell ? 1 : 2);
}

export function calculateCenteredSubjectCrops(
  cells: ImageCropRect[],
  detections: SliceSubjectDetection[],
  options: SubjectCropOptions
): ImageCropRect[] {
  const paddingRatio = clamp(options.paddingRatio, 0, 0.4);
  const constrainToCell = options.constrainToCell ?? true;
  const imageWidth = options.imageWidth ?? Math.max(...cells.map((cell) => cell.x + cell.width), 1);
  const imageHeight = options.imageHeight ?? Math.max(...cells.map((cell) => cell.y + cell.height), 1);
  const detectionByIndex = new Map(detections.map((detection) => [detection.index, detection]));
  const ratios = cells.map((cell, index) => {
    const detection = detectionByIndex.get(index);
    return detection ? requiredCropRatio(cell, detection.bounds, paddingRatio, constrainToCell) : 1;
  });
  const detectedRatios = ratios
    .filter((_, index) => detectionByIndex.has(index))
    .sort((a, b) => a - b);
  const commonRatio = detectedRatios.length > 0
    ? detectedRatios[Math.floor(detectedRatios.length / 2)]
    : 1;

  return cells.map((cell, index) => {
    const detection = detectionByIndex.get(index);
    if (!detection) return cell;
    const adjustment = options.adjustments?.[index] ?? DEFAULT_ADJUSTMENT;
    const zoom = clamp(adjustment.zoom || 1, 0.5, 2);
    const ratio = (options.normalizeScale ? ratios[index] : Math.max(ratios[index], commonRatio)) / zoom;
    const width = clamp(Math.round(cell.width * ratio), 1, constrainToCell ? cell.width : imageWidth);
    const height = clamp(Math.round(cell.height * ratio), 1, constrainToCell ? cell.height : imageHeight);
    const centerX = detection.bounds.x + detection.bounds.width / 2 + adjustment.offsetX;
    const centerY = detection.bounds.y + detection.bounds.height / 2 + adjustment.offsetY;
    const x = clamp(
      Math.round(centerX - width / 2),
      constrainToCell ? cell.x : 0,
      constrainToCell ? cell.x + cell.width - width : imageWidth - width
    );
    const y = clamp(
      Math.round(centerY - height / 2),
      constrainToCell ? cell.y : 0,
      constrainToCell ? cell.y + cell.height - height : imageHeight - height
    );
    return { x, y, width, height };
  });
}
