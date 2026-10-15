import type { ComicGenerationCostItem, ComicVideoContextSnapshot } from "../comic-drama.js";

export type VideoGenerationStatus =
  | "draft"
  | "ready"
  | "blocked"
  | "submitting"
  | "queued"
  | "generating"
  | "post_processing"
  | "recovering"
  | "polling_stopped"
  | "completed"
  | "modified"
  | "failed"
  | "cancelled";

export type VideoGenerationJobStatus =
  | "submitting"
  | "queued"
  | "generating"
  | "post_processing"
  | "recovering"
  | "completed"
  | "failed"
  | "cancelled";

export interface VideoGenerationInput {
  /** 漫剧视频提交固定的首尾帧上下文和幂等提交身份。 */
  comicDramaContextSnapshot?: ComicVideoContextSnapshot;
  inputFingerprint?: string;
  generationAttemptId?: string;
  quoteId?: string;
  quoteExpiresAt?: string;
  idempotencyKey?: string;
  priceSnapshot?: ComicGenerationCostItem;
  quoteBoardId?: string;
  quoteRequestScope?: string;
  quotePurpose?: string;
  quoteOperation?: string;
  /** 漫剧首尾帧链路要求主进程再次校验模型能力。 */
  requireFirstLastFrameCapability?: boolean;
  mode?: "generate" | "remix" | "extend";
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  referenceImagePaths: string[];
  referenceVideoPaths?: string[];
  referenceAudioPaths?: string[];
  sourceVideoPath?: string;
  targetVideoNodeId?: string;
  firstFramePath?: string;
  lastFramePath?: string;
  generateAudio?: boolean;
  watermark?: boolean;
  providerId?: string;
  boardId?: string;
  generationNodeId?: string;
}

export interface VideoGenerationJob {
  id: string;
  status: VideoGenerationJobStatus;
  createdAt: string;
  completedAt?: string;
  input: VideoGenerationInput;
  providerId?: string;
  providerName?: string;
  model: string;
  remoteTaskId?: string;
  remoteStatusUrl?: string;
  remoteResponseUrl?: string;
  remoteCancelUrl?: string;
  outputVideoPath?: string;
  outputPosterPath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  error?: string;
}

export type VideoTaskStatus =
  | "pending"
  | "submitting"
  | "remote_unknown"
  | "queued"
  | "generating"
  | "downloading"
  | "validating"
  | "completed"
  | "failed_retryable"
  | "failed_terminal"
  | "cancel_requested"
  | "cancelled";

/** Renderer-visible snapshot of a durable video-sequence task. */
export interface VideoSequenceTask {
  schemaVersion: 1;
  id: string;
  clientRequestId: string;
  batchRequestId?: string;
  boardId: string;
  sequenceId: string;
  segmentId: string;
  segmentRevision: number;
  inputFingerprint: string;
  attempt: number;
  status: VideoTaskStatus;
  createdAt: string;
  updatedAt: string;
  input: VideoGenerationInput;
  /** Frames/config frozen before the durable task is created. */
  inputSnapshot?: VideoSegmentInputSnapshot;
  providerName?: string;
  remoteProviderType?: "official" | "ark" | "fal" | "openrouter" | "minimax";
  remoteTaskId?: string;
  remoteStatusUrl?: string;
  remoteResponseUrl?: string;
  remoteCancelUrl?: string;
  remoteOutputs?: Array<{ kind: "video" | "image"; role: "result" | "last-frame"; url: string; mimeType?: string }>;
  processingCheckpoint?: "remote-complete" | "downloaded" | "validated" | "published";
  outputVideoPath?: string;
  outputPosterPath?: string;
  media?: Pick<VideoSegmentVersion,
    "mimeType" | "width" | "height" | "durationMs" | "fps" | "videoCodec" | "audioCodec">;
  error?: string;
}

export interface VideoTaskError {
  code: string;
  message: string;
  retryable: boolean;
  stage: "submit" | "poll" | "download" | "validate" | "persist" | "export";
}

/** Provider 返回的远端文件快照；下载恢复不能依赖 renderer 内存。 */
export interface VideoRemoteOutputSnapshot {
  url: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
}

/** 新任务格式保留旧任务全部字段，旧 video IPC 因此仍可读取。 */
export interface VideoGenerationJobV2 extends VideoGenerationJob {
  schemaVersion: 2;
  kind: "single" | "sequence-segment";
  clientRequestId: string;
  updatedAt: string;
  sequenceId?: string;
  segmentId?: string;
  sequenceRevision?: number;
  segmentRevision?: number;
  inputFingerprint?: string;
  attempt: number;
  taskStatus: VideoTaskStatus;
  remoteProviderType?: "official" | "ark" | "fal" | "openrouter" | "minimax";
  remoteOutputs?: VideoRemoteOutputSnapshot[];
  processingCheckpoint?: "remote-complete" | "downloaded" | "validated" | "published";
  errorDetail?: VideoTaskError;
}

export interface VideoSequenceDefaults {
  providerId?: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  fps: 24 | 25 | 30 | 50 | 60;
  durationSeconds: number;
  generateAudio: boolean;
  watermark: boolean;
}

export interface FrozenImageSource {
  nodeId?: string;
  nodeVersionIndex?: number;
  imagePath: string;
  sha256: string;
  width?: number;
  height?: number;
}

export interface FrozenVideoSource {
  nodeId: string;
  nodeVersionIndex: number;
  versionId: string;
  videoPath: string;
  posterPath?: string;
  sha256: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs: number;
  fps?: number;
}

export interface VideoSequenceKeyframe {
  id: string;
  order: number;
  label?: string;
  source: FrozenImageSource;
}

export interface VideoSegmentConfig {
  prompt: string;
  providerId?: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  generateAudio?: boolean;
  watermark?: boolean;
}

export interface VideoSegmentTrim {
  inMs: number;
  outMs?: number;
  muted?: boolean;
}

export interface VideoSegmentInputSnapshot {
  kind?: "keyframe-generation";
  firstFrame: FrozenImageSource;
  lastFrame: FrozenImageSource;
  config: Required<VideoSegmentConfig>;
  providerName?: string;
}

export interface VideoAssemblyInputSnapshot {
  kind: "source-video";
  sourceVideo: FrozenVideoSource;
}

export interface VideoSegmentVersion {
  id: string;
  taskId: string;
  segmentRevision: number;
  inputFingerprint: string;
  inputSnapshot: VideoSegmentInputSnapshot | VideoAssemblyInputSnapshot;
  videoPath: string;
  posterPath?: string;
  mimeType: string;
  videoCodec?: string;
  audioCodec?: string;
  width: number;
  height: number;
  fps?: number;
  durationMs: number;
  createdAt: string;
  superseded?: boolean;
}

export interface VideoSequenceSegment {
  /** 旧片段缺省为 keyframe-generation。 */
  kind?: "keyframe-generation" | "source-video";
  sourceVideo?: FrozenVideoSource;
  id: string;
  order: number;
  fromKeyframeId: string;
  toKeyframeId: string;
  config: VideoSegmentConfig;
  trim: VideoSegmentTrim;
  desiredRevision: number;
  renderedRevision?: number;
  inputFingerprint: string;
  versions: VideoSegmentVersion[];
  activeVersionId?: string;
  lastTaskId?: string;
  error?: VideoTaskError;
}

export interface VideoSequenceExportVersion {
  id: string;
  sequenceRevision: number;
  exportFingerprint: string;
  segmentVersionIds: string[];
  trims: Array<{ segmentId: string; inMs: number; outMs?: number }>;
  videoPath: string;
  mimeType: "video/mp4";
  width: number;
  height: number;
  fps: number;
  includeAudio?: boolean;
  fileName?: string;
  durationMs: number;
  createdAt: string;
}

export interface VideoSequence {
  /** 旧序列缺省为 keyframe-generation。 */
  kind?: "keyframe-generation" | "video-assembly";
  id: string;
  boardId: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  defaults: VideoSequenceDefaults;
  keyframes: VideoSequenceKeyframe[];
  segments: VideoSequenceSegment[];
  exportVersions: VideoSequenceExportVersion[];
  activeExportVersionId?: string;
  templateSourceId?: string;
}

export interface VideoSequenceTemplateSlot {
  id: string;
  label: string;
  required: boolean;
}

export interface VideoSequenceTemplateSegment {
  id: string;
  fromSlotId: string;
  toSlotId: string;
  config: VideoSegmentConfig;
}

export interface VideoSequenceTemplate {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  defaults: VideoSequenceDefaults;
  slots: VideoSequenceTemplateSlot[];
  segments: VideoSequenceTemplateSegment[];
}

export interface VideoSequenceSnapshot {
  sequence: VideoSequence;
  jobs: VideoGenerationJobV2[];
  state: VideoSequenceState;
}

export type VideoSegmentState = "blocked" | "ready" | "stale" | "pending" | "running" | "failed" | "completed";

export type VideoSequenceState = "blocked" | "ready" | "running" | "partial" | "stale" | "completed" | "exporting" | "export_failed";

export interface VideoSequenceRunResult {
  sequence: VideoSequenceSnapshot;
  jobs: VideoGenerationJobV2[];
  estimate?: { currency: "credit"; total: number; authoritative: boolean };
}

export interface VideoSequenceExportJob {
  id: string;
  boardId: string;
  sequenceId: string;
  sequenceRevision: number;
  exportFingerprint: string;
  status: "pending" | "exporting" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  outputVideoPath?: string;
  exportVersionId?: string;
  fileName?: string;
  progress?: number;
  error?: VideoTaskError;
}

export interface RevisionConflictError {
  code: "REVISION_CONFLICT";
  current: VideoSequenceSnapshot;
}

export type VideoSequenceEvent =
  | { type: "sequence-changed"; boardId: string; sequenceId: string; revision: number }
  | { type: "task-changed"; boardId: string; sequenceId: string; job: VideoGenerationJobV2 }
  | { type: "export-changed"; boardId: string; sequenceId: string; job: VideoSequenceExportJob };
