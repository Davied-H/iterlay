import type { ImageDerivation, ImageSource } from "@shared/types";

/** 图片的一个编辑版本（索引 0 为原图）。 */
export interface ImageVersion {
  path: string;
  dataUrl: string;
  jobId: string;
  width?: number;
  height?: number;
}

export interface GeneratedImage {
  id: string;
  path: string;
  dataUrl: string;
  jobId: string;
  pending?: boolean;
  generationStatus?: "queued" | "running";
  pendingStartedAt?: number;
  pendingPrompt?: string;
  /** 生成中卡片展示的本次引用图；任务完成后清除。 */
  pendingReferenceImages?: Array<{ name: string; dataUrl: string }>;
  placementAnchorId?: string;
  placementPosition?: { x: number; y: number };
  placementWidth?: number;
  preserveViewportOnCreate?: boolean;
  selectOnCreate?: boolean;
  source?: ImageSource;
  derivation?: ImageDerivation;
  width?: number;
  height?: number;
  versions?: ImageVersion[];
  activeVersion?: number;
  editing?: boolean;
  pendingEditCount?: number;
  queuedEditCount?: number;
  editingStartedAt?: number;
}

export interface VersionSeparationPlacement {
  position: { x: number; y: number };
  previewIndex: number;
}

export const IMAGE_NODE_WIDTH = 264;
export const IMAGE_NODE_MIN_WIDTH = 120;
export const IMAGE_NODE_MAX_WIDTH = 600;

/** Supports older in-memory nodes that only carried the boolean editing flag. */
export function getPendingEditCount(image: GeneratedImage): number {
  if (typeof image.pendingEditCount === "number" && image.pendingEditCount > 0) {
    return Math.floor(image.pendingEditCount);
  }
  return image.editing ? 1 : 0;
}

export function imageKey(image: GeneratedImage): string {
  return image.id;
}

export function imageNodeHeight(image: GeneratedImage): number {
  if (image.width && image.height) return (IMAGE_NODE_WIDTH * image.height) / image.width;
  return IMAGE_NODE_WIDTH;
}

export interface ResolvedGeneratedImageVersion {
  image?: GeneratedImage;
  conflict?: string;
}

/** Resolves the media bytes and version identity together; pinned UI must never submit the active version implicitly. */
export function resolveGeneratedImageVersion(
  image: GeneratedImage,
  pinnedVersionId?: string
): ResolvedGeneratedImageVersion {
  if (!pinnedVersionId) return { image };
  const versions = image.versions ?? [{
    path: image.path,
    dataUrl: image.dataUrl,
    jobId: image.jobId,
    width: image.width,
    height: image.height
  }];
  const candidates = pinnedVersionId
    ? versions.filter((version) => version.jobId === pinnedVersionId)
    : [versions[Math.min(Math.max(0, image.activeVersion ?? versions.length - 1), Math.max(0, versions.length - 1))]];
  if (candidates.length !== 1 || !candidates[0]) {
    return { conflict: pinnedVersionId
      ? `固定版本 ${pinnedVersionId} 无法唯一解析到生成媒体。`
      : "当前图片版本无法解析。" };
  }
  const version = candidates[0];
  if (!version.path.trim() && !version.dataUrl.trim()) return { conflict: "固定版本缺少可提交的媒体路径。" };
  return {
    image: {
      ...image,
      path: version.path,
      dataUrl: version.dataUrl,
      jobId: version.jobId,
      width: version.width,
      height: version.height
    }
  };
}
