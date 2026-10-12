import type { GeneratedImage } from "./image-node-model";

export interface VideoGenerationImageInputs {
  referenceImagePaths: string[];
  firstFramePath?: string;
  lastFramePath?: string;
}

export interface VideoGenerationAspectRatioSuggestion {
  aspectRatio: "16:9" | "9:16" | "1:1";
  sourceKey: string;
}

const VIDEO_ASPECT_RATIOS = [
  { value: "16:9", ratio: 16 / 9 },
  { value: "9:16", ratio: 9 / 16 },
  { value: "1:1", ratio: 1 }
] as const;

export function resolveVideoGenerationAspectRatio(
  startFrame: GeneratedImage | undefined,
  endFrame: GeneratedImage | undefined,
  referenceImages: GeneratedImage[]
): VideoGenerationAspectRatioSuggestion | undefined {
  const source = [startFrame, endFrame, ...referenceImages].find(hasUsableDimensions);
  if (!source) return undefined;

  const sourceRatio = source.width / source.height;
  const aspectRatio = VIDEO_ASPECT_RATIOS.reduce((closest, candidate) => (
    Math.abs(Math.log(sourceRatio / candidate.ratio))
      < Math.abs(Math.log(sourceRatio / closest.ratio))
      ? candidate
      : closest
  )).value;

  return {
    aspectRatio,
    sourceKey: `${source.id}:${source.width}x${source.height}`
  };
}

export function resolveVideoGenerationImageInputs(
  official: boolean,
  startFrame: GeneratedImage | undefined,
  endFrame: GeneratedImage | undefined,
  referenceImages: GeneratedImage[]
): VideoGenerationImageInputs {
  const references = uniquePaths(referenceImages);
  if (!official) {
    return {
      referenceImagePaths: references,
      firstFramePath: startFrame?.path || undefined,
      lastFramePath: endFrame?.path || undefined
    };
  }

  const explicitStart = startFrame?.path || undefined;
  const explicitEnd = endFrame?.path || undefined;
  const firstFramePath = explicitStart ?? references[0] ?? explicitEnd;
  const lastFramePath = explicitEnd && explicitEnd !== firstFramePath
    ? explicitEnd
    : references.find((path) => path !== firstFramePath);
  return {
    referenceImagePaths: [],
    firstFramePath,
    lastFramePath
  };
}

function uniquePaths(images: GeneratedImage[]): string[] {
  return images
    .map((image) => image.path.trim())
    .filter((path, index, paths) => Boolean(path) && paths.indexOf(path) === index);
}

function hasUsableDimensions(
  image: GeneratedImage | undefined
): image is GeneratedImage & { width: number; height: number } {
  return Boolean(
    image
    && Number.isFinite(image.width)
    && Number.isFinite(image.height)
    && (image.width ?? 0) > 0
    && (image.height ?? 0) > 0
  );
}
