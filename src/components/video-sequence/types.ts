import type { VideoProviderConfig } from "@shared/types";

export type VideoSequenceSegmentState =
  | "empty" | "configured" | "valid" | "stale" | "missing_input" | "incompatible";
export type VideoSequenceTaskState =
  | "idle" | "submitting" | "queued" | "generating" | "post_processing"
  | "recovering" | "completed" | "failed" | "cancelled";

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

export interface VideoSequenceKeyframe {
  id: string;
  order: number;
  label?: string;
  imagePath: string;
  nodeId?: string;
  missing?: boolean;
  sourceUpdateAvailable?: boolean;
}

export interface VideoSequenceSegmentVersion {
  id: string;
  videoPath: string;
  posterPath?: string;
  durationMs: number;
  width?: number;
  height?: number;
  createdAt: string;
  model?: string;
}

export interface VideoSequenceSegment {
  id: string;
  order: number;
  fromKeyframeId: string;
  toKeyframeId: string;
  prompt: string;
  providerId?: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  generateAudio?: boolean;
  watermark?: boolean;
  trimInMs: number;
  trimOutMs?: number;
  muted?: boolean;
  state: VideoSequenceSegmentState;
  taskState?: VideoSequenceTaskState;
  progress?: number;
  error?: string;
  versions: VideoSequenceSegmentVersion[];
  activeVersionId?: string;
}

export interface VideoSequence {
  kind?: "keyframe-generation" | "video-assembly";
  id: string;
  boardId: string;
  boardName?: string;
  name: string;
  revision: number;
  updatedAt: string;
  defaults: VideoSequenceDefaults;
  keyframes: VideoSequenceKeyframe[];
  segments: VideoSequenceSegment[];
}

export interface VideoSequenceCredits {
  balance?: number;
  videoGoldBeanCostPerSecond?: number;
  quoteLabel?: string;
}

export interface VideoSequenceTemplateSummary {
  id: string;
  name: string;
  slotCount: number;
  segmentCount: number;
  aspectRatio: string;
  updatedAt?: string;
}

export interface VideoSequenceExportOptions {
  fileName: string;
  resolution: string;
  fps: number;
  includeAudio: boolean;
  updateBeforeExport: boolean;
}

export interface VideoSequenceEditorProps {
  sequence: VideoSequence;
  mediaUrls: Readonly<Record<string, string>>;
  providers: readonly VideoProviderConfig[];
  credits?: VideoSequenceCredits;
  templates?: readonly VideoSequenceTemplateSummary[];
  saving?: boolean;
  saveError?: string;
  onChange: (sequence: VideoSequence) => void;
  onGenerateSegment: (segmentId: string) => void | Promise<void>;
  onGenerateBatch: (segmentIds: string[]) => void | Promise<void>;
  onSaveTemplate: (name: string) => void | Promise<void>;
  onApplyTemplate: (templateId: string) => void | Promise<void>;
  onExport: (options: VideoSequenceExportOptions) => void | Promise<void>;
  onClose: () => void;
  onLocateKeyframe?: (keyframeId: string) => void;
  onReplaceKeyframe?: (keyframeId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}
