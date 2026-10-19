import type { ComicFrameContextSnapshot, ComicGenerationCostItem } from "../comic-drama.js";
import type { CreditBalance } from "./legacy-commercial.js";
import type { UiMaterialRole } from "./scenes.js";

export type ImageWorkflowMode = "generate" | "edit";

export type CreationMode = "general" | "ui-design";

export type GptImageGenerateUseCase =
  | "photorealistic-natural"
  | "product-mockup"
  | "ui-mockup"
  | "infographic-diagram"
  | "logo-brand"
  | "illustration-story"
  | "stylized-concept"
  | "historical-scene"
  | "ads-marketing"
  | "other";

export type GptImageEditUseCase =
  | "text-localization"
  | "identity-preserve"
  | "precise-object-edit"
  | "lighting-weather"
  | "background-extraction"
  | "style-transfer"
  | "compositing"
  | "sketch-to-render"
  | "other";

export type GptImageUseCase = GptImageGenerateUseCase | GptImageEditUseCase;

export type ImageQuality = "auto" | "low" | "medium" | "high";

export type ImageBackground = "auto" | "opaque" | "transparent";

export type ImageOutputFormat = "png";

export type ReferenceImageRole = "reference" | "edit-target" | "style-reference" | "subject" | "base-scene";

export interface PromptSpec {
  assetType?: string;
  primaryRequest: string;
  inputImages?: string;
  sceneBackdrop?: string;
  subject?: string;
  styleMedium?: string;
  compositionFraming?: string;
  lightingMood?: string;
  colorPalette?: string;
  materialsTextures?: string;
  verbatimText?: string;
  constraints?: string;
  avoid?: string;
}

export interface GenerateImageInput {
  /** Identity of a claimed, prepared annotation brief; never reused by history restoration. */
  modificationRequestId?: string;
  /** 调用端可追踪的任务身份；用于取消尚未提交给 Provider 的排队任务。 */
  clientTaskId?: string;
  /** 还原历史草稿的来源，仅用于追溯；不复用原任务的计费或幂等身份。 */
  historySourceJobId?: string;
  /** 编辑发起时固定的源版本。参考图副本携带实际像素，不能随当前激活版本漂移。 */
  editSource?: ImageEditSourceSnapshot;
  /** 漫剧帧生成使用的不可变上下文和幂等提交身份。 */
  comicDramaContextSnapshot?: ComicFrameContextSnapshot;
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
  workflowMode: ImageWorkflowMode;
  /** 由画布生成节点发起时记录节点 ID，供主进程在渲染层重载后原子回写结果。 */
  generationNodeId?: string;
  /** 图片生成的编排方式；缺省按普通生成处理，兼容旧历史记录。 */
  creationMode?: CreationMode;
  useCase?: GptImageUseCase;
  /** 来源场景，用于在场景详情中回溯由该场景生成的图片。 */
  sceneId?: string;
  promptSpec?: PromptSpec;
  prompt: string;
  model: string;
  size: string;
  n: number;
  quality?: ImageQuality;
  style?: string;
  /** GPT Image output background. Transparent output is encoded as PNG. */
  background?: ImageBackground;
  outputFormat?: ImageOutputFormat;
  referenceImages: ReferenceImagePayload[];
  /** 发起生成时所在的画板；结果和历史都归属到它。 */
  boardId?: string;
  /** 由 AI 助手确认发起时，记录来源会话，供图片详情回到该次创作记录。 */
  assistantConversationId?: string;
  /** 本次生成使用的 provider id；缺省时主进程用 activeProviderId。 */
  providerId?: string;
  /** 场景详情页独立生成：不进入画板、素材库或全局生成历史。 */
  sceneOnly?: boolean;
}

export interface GenerationResult {
  images: ProviderImageResult[];
  /** 非致命问题（如 n 张里有部分失败、Provider 返回张数不足），由 UI 以警告形式展示。 */
  warnings?: string[];
  /** 官方 Provider 返回的扣费后余额；自定义 Provider 不设置。 */
  credits?: CreditBalance;
}

export interface GenerationJob {
  /** Server-computed binding for durable idempotent requests. */
  requestHash?: string;
  id: string;
  status: JobStatus;
  createdAt: string;
  completedAt?: string;
  prompt: string;
  /** 发起生成时的 Provider 快照；即使后续改名或删除配置，历史仍能准确展示。 */
  providerId?: string;
  providerName?: string;
  /** Provider 实际使用的图片模型；旧记录回退到 input.model。 */
  model?: string;
  input: Omit<GenerateImageInput, "referenceImages">;
  /** 可恢复的输入与受管参考图；旧记录缺省，不能凭空补造丢失的语义。 */
  inputSnapshot?: ImageGenerationInputSnapshot;
  useCase?: GptImageUseCase;
  referenceImagePaths: string[];
  outputImagePaths: string[];
  error?: string;
  /** 归属画板；旧数据在首次迁移时统一挂到默认画板。 */
  boardId?: string;
  /** 官方 Provider 的服务端任务 ID；仅用于关闭 App 后恢复。 */
  remoteJobId?: string;
}

export interface GenerateRequest {
  input: GenerateImageInput;
}

export interface GenerateResponse {
  job: GenerationJob;
  images: Array<{
    path: string;
    /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
    dataUrl: string;
  }>;
  warnings?: string[];
  /** 仅官方 Provider 返回，便于 UI 在生成完成后立即刷新余额。 */
  credits?: CreditBalance;
}

export interface ProviderGenerateInput {
  clientRequestId?: string;
  workflowMode: ImageWorkflowMode;
  useCase?: GptImageUseCase;
  prompt: string;
  model: string;
  size: string;
  n: number;
  quality?: ImageQuality;
  style?: string;
  background?: ImageBackground;
  outputFormat?: ImageOutputFormat;
  referenceImages: Array<{
    name: string;
    mimeType: string;
    role?: ReferenceImageRole;
    bytes: Buffer;
  }>;
}

export interface ProviderImageResult {
  bytes: Buffer;
  mimeType: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export interface ImageGenerationCancelResult {
  status: "cancelled" | "running" | "not-found";
  remoteCancelled: false;
  message: string;
  jobId?: string;
}

export interface ReferenceImagePayload {
  id: string;
  name: string;
  mimeType: string;
  dataBase64: string;
  role?: ReferenceImageRole;
  /** UI 设计模式下，这张材料在 AI 编排中的语义职责。 */
  semanticRole?: UiMaterialRole;
  /** 参考图来自当前画布节点时记录来源，用于把生成结果落在它旁边。 */
  sourceNodeId?: string;
}

export interface StoredReferenceImage {
  id: string;
  name: string;
  mimeType: string;
  role?: ReferenceImageRole;
  semanticRole?: UiMaterialRole;
  sourceNodeId?: string;
  path: string;
}

export interface ImageEditSourceSnapshot {
  nodeId?: string;
  boardId?: string;
  imagePath: string;
  jobId?: string;
}

export interface ImageGenerationInputSnapshot {
  version: 1;
  input: Omit<GenerateImageInput, "referenceImages">;
  references: StoredReferenceImage[];
}
