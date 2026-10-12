import type {
  FrozenImageSource,
  VideoGenerationInput,
  VideoSegmentConfig,
  VideoSegmentVersion,
  VideoSequence,
  VideoSequenceDefaults,
  VideoSequenceExportJob,
  VideoSequenceExportVersion,
  VideoSequenceKeyframe,
  VideoSegmentInputSnapshot,
  VideoSequenceSegment,
  VideoSequenceTemplate,
  VideoTaskStatus
} from "../shared/types.js";
import { resolveSegmentConfig } from "../shared/video-sequence.js";

export type FrozenSequenceImage = FrozenImageSource;
export type VideoSequenceSegmentConfig = VideoSegmentConfig;
export type VideoSequenceSegmentVersion = VideoSegmentVersion;
export type SequenceMediaMetadata = Pick<VideoSegmentVersion,
  "mimeType" | "width" | "height" | "durationMs" | "fps" | "videoCodec" | "audioCodec">;

export type {
  VideoSequence,
  VideoSequenceDefaults,
  VideoSequenceExportJob,
  VideoSequenceExportVersion,
  VideoSequenceKeyframe,
  VideoSequenceSegment,
  VideoSequenceTemplate
};

/** Electron-only durable runner record; shared domain objects remain authoritative. */
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
  /** Optional only for reading legacy tasks; new tasks always persist it. */
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
  media?: SequenceMediaMetadata;
  error?: string;
}

export const DEFAULT_SEQUENCE_DEFAULTS: VideoSequenceDefaults = {
  model: "doubao-seedance-1-5-pro-250528",
  aspectRatio: "16:9",
  resolution: "720p",
  fps: 30,
  durationSeconds: 5,
  generateAudio: false,
  watermark: false
};

export const effectiveSegmentConfig = resolveSegmentConfig;
