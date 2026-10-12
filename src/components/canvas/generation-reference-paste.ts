import { IMAGE_NODE_WIDTH, imageNodeHeight, type GeneratedImage } from "./image-node-model";

const REFERENCE_HORIZONTAL_GAP = 96;
const REFERENCE_VERTICAL_GAP = 32;

export interface GenerationReferencePlacementTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function placeGenerationReferenceImages(
  images: GeneratedImage[],
  target: GenerationReferencePlacementTarget
): GeneratedImage[] {
  const heights = images.map(imageNodeHeight);
  const totalHeight = heights.reduce((total, height) => total + height, 0)
    + Math.max(0, images.length - 1) * REFERENCE_VERTICAL_GAP;
  const x = target.x - IMAGE_NODE_WIDTH - REFERENCE_HORIZONTAL_GAP;
  let y = target.y + (target.height - totalHeight) / 2;
  return images.map((image, index) => {
    const placed = {
      ...image,
      placementPosition: { x, y },
      preserveViewportOnCreate: true
    };
    y += heights[index] + REFERENCE_VERTICAL_GAP;
    return placed;
  });
}
