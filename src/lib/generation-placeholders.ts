import {
  imageNodeHeight,
  IMAGE_NODE_WIDTH,
  type GeneratedImage
} from "@/components/canvas/image-node-model";
import {
  layoutGenerationOutputColumn
} from "@shared/generation-output-layout";

const GENERATION_NODE_DEFAULT_WIDTH = 340;
const GENERATION_NODE_DEFAULT_HEIGHT = 320;

interface GenerationOutputAnchor {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export function stackGenerationOutputs(
  images: readonly GeneratedImage[],
  anchorId: string,
  anchor?: GenerationOutputAnchor
): GeneratedImage[] {
  const anchored = images.map((image) => ({ ...image, placementAnchorId: anchorId }));
  return anchor ? centerGenerationOutputs(anchored, anchorId, anchor) : anchored;
}

export function centerGenerationOutputs(
  images: readonly GeneratedImage[],
  anchorId: string,
  anchor: GenerationOutputAnchor,
  layouts: Readonly<Record<string, { width?: number; height?: number }>> = {}
): GeneratedImage[] {
  const outputs = images.filter((image) => image.placementAnchorId === anchorId);
  const positions = layoutGenerationOutputColumn(
    {
      x: anchor.x,
      y: anchor.y,
      width: anchor.width ?? GENERATION_NODE_DEFAULT_WIDTH,
      height: anchor.height ?? GENERATION_NODE_DEFAULT_HEIGHT
    },
    outputs.map((image) => {
      const width = layouts[image.id]?.width ?? image.placementWidth ?? IMAGE_NODE_WIDTH;
      const height = layouts[image.id]?.height ?? imageNodeHeight(image) * width / IMAGE_NODE_WIDTH;
      return { id: image.id, height };
    })
  );
  return images.map((image) => {
    const placementPosition = positions.get(image.id);
    return placementPosition ? { ...image, placementPosition } : image;
  });
}

export function settleGeneratedPlaceholders(
  current: GeneratedImage[],
  placeholderIds: readonly string[],
  completed: GeneratedImage[]
): GeneratedImage[] {
  const placeholderIdSet = new Set(placeholderIds);
  let resultIndex = 0;
  const replaced = current.flatMap((image) => {
    if (!placeholderIdSet.has(image.id)) return [image];
    const output = completed[resultIndex];
    resultIndex += 1;
    if (!output) return [];
    return [{
      ...image,
      generationStatus: undefined,
      pendingStartedAt: undefined,
      pendingPrompt: undefined,
      pendingReferenceImages: undefined,
      ...output
    }];
  });
  return [...completed.slice(resultIndex), ...replaced];
}

export function removeGeneratedPlaceholders(
  current: GeneratedImage[],
  placeholderIds: readonly string[]
): GeneratedImage[] {
  const placeholderIdSet = new Set(placeholderIds);
  return current.filter((image) => !placeholderIdSet.has(image.id));
}
