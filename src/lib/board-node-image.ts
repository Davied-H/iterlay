import type { BoardNodeSnapshot } from "@shared/types";
import type { GeneratedImage } from "@/components/canvas/image-node-model";

export interface BoardNodeImageLayout {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export function serializeGeneratedImage(
  image: GeneratedImage,
  layout: BoardNodeImageLayout
): BoardNodeSnapshot {
  const activeVersion = image.versions?.findIndex((version) => version.path === image.path) ?? -1;
  const hasVersions = (image.versions?.length ?? 0) > 1 && activeVersion >= 0;

  return {
    type: "image",
    id: image.id,
    imagePath: image.path,
    jobId: image.jobId,
    source: image.source ?? "generated",
    x: layout.x,
    y: layout.y,
    width: image.width,
    height: image.height,
    displayWidth: layout.width,
    derivation: image.derivation,
    finalVersion: image.finalVersion,
    versions: hasVersions ? image.versions?.map((version) => ({
      imagePath: version.path,
      jobId: version.jobId,
      width: version.width,
      height: version.height
    })) : undefined,
    activeVersion: hasVersions ? activeVersion : undefined
  };
}

export function hydrateGeneratedImage(
  node: BoardNodeSnapshot,
  imageUrls: Readonly<Record<string, string>>
): GeneratedImage | null {
  const dataUrl = imageUrls[node.imagePath];
  if (!dataUrl) return null;

  const versions = node.versions
    ?.filter((version) => imageUrls[version.imagePath])
    .map((version) => ({
      path: version.imagePath,
      dataUrl: imageUrls[version.imagePath],
      jobId: version.jobId,
      width: version.width,
      height: version.height
    }));
  const activeVersion = versions?.findIndex((version) => version.path === node.imagePath) ?? -1;
  const hasVersions = (versions?.length ?? 0) > 1 && activeVersion >= 0;

  return {
    id: node.id,
    path: node.imagePath,
    dataUrl,
    jobId: node.jobId,
    source: node.source,
    width: node.width,
    height: node.height,
    derivation: node.derivation,
    finalVersion: node.finalVersion,
    versions: hasVersions ? versions : undefined,
    activeVersion: hasVersions ? activeVersion : undefined
  };
}

export function hydrateBoardNodeImageLayout(node: BoardNodeSnapshot): BoardNodeImageLayout {
  return {
    x: node.x,
    y: node.y,
    width: node.displayWidth
  };
}
