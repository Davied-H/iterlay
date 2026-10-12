import { IMAGE_NODE_WIDTH, type GeneratedImage } from "./image-node-model";

const VERSION_ROW_GAP = 40;

export interface VersionPreviewPlacement {
  position: { x: number; y: number };
  previewIndex: number;
}

function versionDimensions(source: GeneratedImage, version: NonNullable<GeneratedImage["versions"]>[number]): Pick<GeneratedImage, "width" | "height"> {
  return {
    width: version.width ?? source.width,
    height: version.height ?? source.height
  };
}

function withVersionRowPlacement(
  images: GeneratedImage[],
  placement: VersionPreviewPlacement | undefined
): GeneratedImage[] {
  if (!placement) return images;
  const step = IMAGE_NODE_WIDTH + VERSION_ROW_GAP;
  const startX = placement.position.x - placement.previewIndex * step;
  return images.map((image, index) => ({
    ...image,
    placementPosition: {
      x: startX + index * step,
      y: placement.position.y
    },
    preserveViewportOnCreate: true
  }));
}

export function createDetachedVersionImage(
  source: GeneratedImage,
  versionIndex: number,
  id: string,
  placementPosition?: { x: number; y: number }
): GeneratedImage | null {
  const version = source.versions?.[versionIndex];
  if (!version) return null;

  return {
    id,
    path: version.path,
    dataUrl: version.dataUrl,
    jobId: version.jobId,
    ...versionDimensions(source, version),
    source: source.source,
    derivation: source.derivation,
    placementAnchorId: source.id,
    placementPosition,
    preserveViewportOnCreate: placementPosition ? true : undefined,
    selectOnCreate: true
  };
}

export function separateImageVersions(
  source: GeneratedImage,
  createId: () => string,
  placement?: VersionPreviewPlacement
): GeneratedImage[] | null {
  const versions = source.versions;
  if (!versions || versions.length < 2) return null;
  const activeVersion = Math.max(0, Math.min(source.activeVersion ?? versions.length - 1, versions.length - 1));

  return withVersionRowPlacement(versions.map((version, index) => ({
    id: index === activeVersion ? source.id : createId(),
    path: version.path,
    dataUrl: version.dataUrl,
    jobId: version.jobId,
    ...versionDimensions(source, version),
    source: source.source,
    derivation: source.derivation,
    placementAnchorId: index === activeVersion ? undefined : source.id,
    selectOnCreate: index === activeVersion ? undefined : true
  })), placement);
}

export function copyImageVersions(
  source: GeneratedImage,
  createId: () => string,
  placement?: VersionPreviewPlacement
): GeneratedImage[] | null {
  const versions = source.versions;
  if (!versions || versions.length < 2) return null;
  return withVersionRowPlacement(versions.map((version) => ({
    id: createId(),
    path: version.path,
    dataUrl: version.dataUrl,
    jobId: version.jobId,
    ...versionDimensions(source, version),
    source: source.source,
    derivation: source.derivation,
    placementAnchorId: source.id,
    selectOnCreate: true
  })), placement);
}

export function extractImageVersion(
  source: GeneratedImage,
  versionIndex: number,
  id: string,
  placementPosition?: { x: number; y: number }
): GeneratedImage[] | null {
  const versions = source.versions;
  const extracted = versions?.[versionIndex];
  if (!versions || versions.length < 2 || !extracted) return null;

  const remaining = versions.filter((_, index) => index !== versionIndex);
  const previousActive = Math.max(0, Math.min(source.activeVersion ?? versions.length - 1, versions.length - 1));
  const nextActive = versionIndex < previousActive
    ? previousActive - 1
    : versionIndex === previousActive
      ? Math.min(previousActive, remaining.length - 1)
      : previousActive;
  const active = remaining[nextActive];
  const updatedSource: GeneratedImage = {
    ...source,
    path: active.path,
    dataUrl: active.dataUrl,
    jobId: active.jobId,
    ...versionDimensions(source, active),
    versions: remaining.length > 1 ? remaining : undefined,
    activeVersion: remaining.length > 1 ? nextActive : undefined
  };
  const standalone: GeneratedImage = {
    id,
    path: extracted.path,
    dataUrl: extracted.dataUrl,
    jobId: extracted.jobId,
    ...versionDimensions(source, extracted),
    source: source.source,
    derivation: source.derivation,
    placementAnchorId: source.id,
    placementPosition,
    preserveViewportOnCreate: placementPosition ? true : undefined,
    selectOnCreate: true
  };
  return [updatedSource, standalone];
}
