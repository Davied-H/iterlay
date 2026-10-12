import type { VideoProviderModelOption } from "../../shared/types.js";

export type VideoInputRole =
  | "first-frame"
  | "last-frame"
  | "reference-image"
  | "reference-video"
  | "reference-audio";

export interface VideoMediaInput {
  id: string;
  kind: "image" | "video" | "audio";
  role: VideoInputRole;
  mimeType: string;
  name?: string;
  url?: string;
  bytes?: Buffer;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface VideoProviderCapability {
  provider: "official" | "ark" | "fal" | "openrouter" | "minimax";
  modes: Array<"text-to-video" | "image-to-video" | "first-last-frame" | "multi-reference" | "remix" | "extend">;
  maxInputs: { images: number; videos: number; audios: number };
  supportsCancel: boolean;
  supportsProgress: boolean;
  supportsGeneratedAudio: boolean;
  supportsWatermarkControl: boolean;
  ratios: string[];
  resolutions: string[];
  durationSeconds: { min: number; max: number; supportsAuto: boolean };
}

export interface VideoSubmitInput {
  clientRequestId?: string;
  prompt: string;
  mode?: "generate" | "remix" | "extend";
  model?: string;
  ratio?: string;
  resolution?: string;
  durationSeconds?: number | "auto";
  generateAudio?: boolean;
  watermark?: boolean;
  inputs?: VideoMediaInput[];
}

export interface ArkVideoProviderConfig {
  provider: "ark";
  baseUrl?: string;
  apiKey: string;
  model: string;
  requestTimeoutMs?: number;
}

export interface FalVideoProviderConfig {
  provider: "fal";
  baseUrl?: string;
  apiKey: string;
  model: string;
  requestTimeoutMs?: number;
}

export interface OfficialVideoProviderConfig {
  provider: "official";
  model: string;
}

export interface OpenRouterVideoProviderConfig {
  provider: "openrouter";
  baseUrl?: string;
  apiKey: string;
  model: string;
  requestTimeoutMs?: number;
}

export interface MiniMaxVideoProviderConfig {
  provider: "minimax";
  baseUrl?: string;
  apiKey: string;
  model: string;
  requestTimeoutMs?: number;
}

export type VideoProviderConfig =
  | OfficialVideoProviderConfig
  | ArkVideoProviderConfig
  | FalVideoProviderConfig
  | OpenRouterVideoProviderConfig
  | MiniMaxVideoProviderConfig;

export type VideoRemoteStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";

/** Serializable remote identity. It deliberately contains no API key or local polling state. */
export interface VideoRemoteTask {
  provider: "official" | "ark" | "fal" | "openrouter" | "minimax";
  id: string;
  model: string;
  status: VideoRemoteStatus;
  submittedAt: string;
  updatedAt: string;
  progress?: number;
  error?: string;
  outputs?: VideoRemoteOutput[];
  rawStatus?: string;
  /** fal.ai queue submit 返回的实际任务地址；内部路由可能不同于公开 endpoint。 */
  statusUrl?: string;
  responseUrl?: string;
  cancelUrl?: string;
}

export interface VideoRemoteOutput {
  kind: "video" | "image";
  role: "result" | "last-frame";
  url: string;
  mimeType?: string;
}

export interface DownloadedVideo {
  bytes: Buffer;
  mimeType: string;
  sourceUrl: string;
}

export interface VideoCancelResult {
  supported: boolean;
  cancelled: boolean;
  task: VideoRemoteTask;
  message?: string;
}

export interface VideoRequestOptions {
  signal?: AbortSignal;
}

export interface VideoProvider {
  readonly capability: VideoProviderCapability;
  readonly capabilityAppliesToAllModels?: boolean;
  submit(input: VideoSubmitInput, config: VideoProviderConfig, options?: VideoRequestOptions): Promise<VideoRemoteTask>;
  poll(task: VideoRemoteTask, config: VideoProviderConfig, options?: VideoRequestOptions): Promise<VideoRemoteTask>;
  cancel(task: VideoRemoteTask, config: VideoProviderConfig, options?: VideoRequestOptions): Promise<VideoCancelResult>;
  download(output: VideoRemoteOutput, config: VideoProviderConfig, options?: VideoRequestOptions): Promise<DownloadedVideo>;
  listModels?(config: VideoProviderConfig, apiKeyOverride?: string): Promise<VideoProviderModelOption[]>;
}
