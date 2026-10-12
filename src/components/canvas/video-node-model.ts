export type VideoNodeStatus =
  | "draft"
  | "submitting"
  | "queued"
  | "generating"
  | "post_processing"
  | "recovering"
  | "completed"
  | "modified"
  | "failed"
  | "cancelled";

export interface GeneratedVideo {
  id: string;
  path: string;
  dataUrl: string;
  posterPath?: string;
  posterDataUrl?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationMs?: number;
  mimeType?: string;
  hasAudio?: boolean;
  version?: number;
  title?: string;
  status?: VideoNodeStatus;
  error?: string;
}

export interface VideoReferenceInput {
  id: string;
  name: string;
  path: string;
  dataUrl?: string;
  posterDataUrl?: string;
  durationMs?: number;
}

export interface AudioReferenceInput {
  id: string;
  name: string;
  path: string;
  durationMs?: number;
  mimeType?: string;
}

export const VIDEO_MAX_REFERENCE_IMAGES = 9;

export type VideoGenerationMode = "generate" | "remix" | "extend";

export function videoGenerationModeLabel(mode: VideoGenerationMode): string {
  if (mode === "remix") return "改编";
  if (mode === "extend") return "继续";
  return "新建";
}

export function normalizedVideoVersions(video: GeneratedVideo, versions: readonly GeneratedVideo[] | undefined): GeneratedVideo[] {
  const candidates = versions?.length ? versions : [video];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.id || candidate.path;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const VIDEO_NODE_WIDTH = 360;
export const VIDEO_NODE_MIN_WIDTH = 280;
export const VIDEO_NODE_ASPECT_RATIO = 16 / 9;
export const VIDEO_NODE_HEIGHT = VIDEO_NODE_WIDTH / VIDEO_NODE_ASPECT_RATIO;

export function videoNodeStatusLabel(status: VideoNodeStatus): string {
  switch (status) {
    case "submitting": return "提交中";
    case "queued": return "排队中";
    case "generating": return "生成中";
    case "post_processing": return "下载中";
    case "recovering": return "恢复中";
    case "completed": return "已完成";
    case "modified": return "已修改";
    case "failed": return "失败";
    case "cancelled": return "已取消";
    default: return "草稿";
  }
}

export function formatVideoDuration(durationMs: number | undefined): string {
  if (!Number.isFinite(durationMs) || durationMs! < 0) return "--:--";
  const totalSeconds = Math.round(durationMs! / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function videoAspectRatio(video: Pick<GeneratedVideo, "width" | "height" | "aspectRatio">): number {
  if (video.width && video.height && video.width > 0 && video.height > 0) {
    return video.width / video.height;
  }
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(video.aspectRatio?.trim() ?? "");
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return width / height;
  }
  return VIDEO_NODE_ASPECT_RATIO;
}
