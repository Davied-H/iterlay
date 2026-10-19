export type ProviderType = "official" | "codex-oauth" | "openai-compatible" | "openrouter" | "bailian" | "ark" | "poe" | "fal";

export type ProviderApiMode = "images" | "responses";

export type FalSizeMode = "image_size" | "aspect_ratio" | "aspect_ratio_and_resolution";

export type FalReferenceInput = "image_urls" | "image_url";

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiMode?: ProviderApiMode;
  compatResponseFormat?: "b64_json";
  baseUrl: string;
  generationEndpoint: string;
  referenceEndpoint?: string;
  /** 该 Provider 下已保存的图片模型；model 始终是当前默认项。 */
  models?: string[];
  model: string;
  supportsReferenceImages: boolean;
  /** Codex 图片账号是否自动创建关联文本服务；删除该文本服务后设为 false。 */
  autoBindText?: boolean;
  /** 图生图/编辑模型 ID；当前用于 fal.ai，留空时沿用 model。 */
  referenceModel?: string;
  /** fal 模型接收尺寸的方式；不同模型的输入 schema 不同。 */
  falSizeMode?: FalSizeMode;
  /** fal 编辑模型接收单张 image_url 或多张 image_urls。 */
  falReferenceInput?: FalReferenceInput;
}

export type CodexAuthState =
  | "signed-out"
  | "authorizing"
  | "connected"
  | "refreshing"
  | "expired"
  | "reauth-required";

/** 可安全暴露给渲染进程的 Codex 账号状态，不包含任何 OAuth Token。 */
export interface CodexAuthStatus {
  state: CodexAuthState;
  email?: string;
  accountId?: string;
  planType?: string;
  expiresAt?: string;
  message?: string;
}

export type TextProviderType = "official" | "codex-oauth" | "openai-compatible";

/**
 * 文本 Provider：供 AI 智能辅助（润色扩写、场景大师、修改建议、主体识别）使用，
 * 与图片 Provider 独立切换；Codex 账号类型可与图片 Provider 共享同一份 OAuth 凭据。
 */
export interface TextProviderConfig {
  id: string;
  name: string;
  type: TextProviderType;
  /** Codex 账号凭据所属的 Provider id；自动绑定图片 Provider 时指向图片 Provider id。 */
  authProviderId?: string;
  /** OpenAI 兼容服务地址；请求发往 {baseUrl}/v1/chat/completions。official 类型留空。 */
  baseUrl: string;
  /** 文本模型 ID；official 类型留空（由官方后台配置）。 */
  model: string;
}

export type VideoProviderType = "official" | "ark" | "fal" | "openrouter" | "minimax";

/** 视频生成 Provider，与图片和文本 Provider 独立配置及切换。 */
export interface VideoProviderConfig {
  id: string;
  name: string;
  type: VideoProviderType;
  /** fal.ai / OpenRouter 视频可复用同类型图片 Provider 的服务地址与 API Key。 */
  connectionProviderId?: string;
  baseUrl: string;
  /** 该 Provider 下已保存的视频模型；model 始终是当前默认项。 */
  models?: string[];
  /** 运行时模型目录；旧设置可省略，缺少能力元数据时按 unknown 处理。 */
  modelOptions?: VideoProviderModelOption[];
  /** 默认视频模型或接入点 ID。 */
  model: string;
}

export const DEFAULT_VIDEO_PROVIDER_ID = "volcengine-ark-video";

export const DEFAULT_VIDEO_PROVIDER_CONFIG: VideoProviderConfig = {
  id: DEFAULT_VIDEO_PROVIDER_ID,
  name: "火山方舟",
  type: "ark",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  model: "doubao-seedance-1-5-pro-250528"
};

/** OpenAI-compatible `/v1/models` 返回的可选模型。 */
export interface ProviderModelOption {
  id: string;
  ownedBy?: string;
}

export type VideoProviderMode =
  | "text-to-video"
  | "image-to-video"
  | "first-last-frame"
  | "multi-reference"
  | "remix"
  | "extend";

/** 单个视频模型的完整能力；缺失不代表不支持，而是能力未知。 */
export interface VideoProviderCapability {
  modes: VideoProviderMode[];
  maxInputs: { images: number; videos: number; audios: number };
  supportsCancel: boolean;
  supportsProgress: boolean;
  supportsGeneratedAudio: boolean;
  supportsWatermarkControl: boolean;
  ratios: string[];
  resolutions: string[];
  durationSeconds: { min: number; max: number; supportsAuto: boolean };
}

/** 向后兼容通用模型选项；supportedModes 仅是 capability.modes 的兼容投影。 */
export interface VideoProviderModelOption extends ProviderModelOption {
  supportedModes?: VideoProviderMode[];
  capability?: VideoProviderCapability;
  pricingLabel?: string;
  /** 缺失时保守要求描述；只有明确 false 才允许纯媒体生成。 */
  requiresPrompt?: boolean;
  supportsGeneratedAudio?: boolean;
  supportedFrameImages?: Array<"first_frame" | "last_frame">;
  supportedDurations?: number[];
  supportedRatios?: string[];
  supportedResolutions?: string[];
}

export type ProviderCheckStatus = "passed" | "failed" | "unknown" | "not-tested";
export type ProviderCheckName = "network" | "authentication" | "model" | "capability" | "generation";
export interface ProviderCheck {
  status: ProviderCheckStatus;
  message: string;
}
export interface ProviderTestOptions {
  mode: "connection" | "generation";
  /** 只有用户明确确认可能产生服务商费用后，才可提交真实图片请求。 */
  acknowledgeCharges?: boolean;
}
export interface ProviderTestResult {
  ok: boolean;
  message: string;
  mode?: "connection" | "generation";
  /** 目录中出现模型，只证明可见性，不证明生图、编辑或工具调用能力。 */
  checks?: Record<ProviderCheckName, ProviderCheck>;
  billing?: { generationSubmitted: boolean; mayHaveIncurredCharge: boolean };
  /** 测试图仅供查看，不自动加入画板或历史。 */
  previewDataUrl?: string;
  /** 原生 OpenAI Chat Completions tools/tool_calls 协议探测结果。 */
  functionCalling?: "supported" | "unsupported" | "unknown";
}

export type FalModelCategory =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video";

export interface FalModelPrice {
  unitPrice: number;
  unit: string;
  currency: string;
}

export interface FalModelOption {
  endpointId: string;
  displayName: string;
  category: FalModelCategory;
  description?: string;
  tags?: string[];
  price?: FalModelPrice;
}

/** @deprecated 使用 VideoProviderCapability；保留旧名称供 preload 调用方兼容。 */
export type VideoProviderCapabilities = VideoProviderCapability;
