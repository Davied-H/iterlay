import type { ResolvedAppLocale } from "./i18n.js";
import {
  normalizeComicDramaEntryNode,
  normalizeComicDramaNode,
  normalizeComicDramaVersionBinding,
  normalizeVideoSequenceEntryNode
} from "./comic-drama.js";
import type {
  BoardComicDramaEntryNode,
  BoardGroup,
  BoardMutationResult,
  BoardVideoSequenceEntryNode,
  ComicCharacterNode,
  ComicDramaBoardNode,
  ComicDramaVersionBinding,
  ComicFrameContextSnapshot,
  ComicGenerationCostItem,
  ComicFrameRole,
  ComicVideoContextSnapshot,
  ComicSegmentScriptNode,
  ComicSettingNode
} from "./comic-drama.js";

export type {
  BoardComicDramaEntryNode, BoardGroup, BoardMutationPlan, BoardMutationResult, BoardVideoSequenceEntryNode,
  ComicCharacterDraft, ComicCharacterNode, ComicDramaAction, ComicDramaBoardNode, ComicDramaBoardSnapshot,
  ComicDramaContextSnapshot, ComicDramaVersionBinding, ComicFrameContextSnapshot, ComicFrameRole, ComicGenerationCostItem, ComicVideoContextSnapshot, ComicSegmentScriptNode,
  ComicSettingNode
} from "./comic-drama.js";

export type ProviderType = "official" | "codex-oauth" | "openai-compatible" | "openrouter" | "bailian" | "ark" | "poe" | "fal";
export type ProviderApiMode = "images" | "responses";
export type FalSizeMode = "image_size" | "aspect_ratio" | "aspect_ratio_and_resolution";
export type FalReferenceInput = "image_urls" | "image_url";
export type ImageWorkflowMode = "generate" | "edit";
export type CreationMode = "general" | "ui-design";
export type UiMaterialRole = "prd" | "wireframe" | "visual" | "brand" | "content" | "reference";
export type TemplateExtractionScenario = "design-language" | "layout-skeleton" | "series-template" | "replica";
/** 模板工厂首轮由界面确定的工作路线；自由输入不强行归类。 */
export type TemplateAssistantEntryIntent = "build" | "extract" | "audit" | "validate";
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

export type SceneTemplateCategory =
  | "marketing"
  | "product"
  | "social"
  | "illustration"
  | "portrait"
  | "brand"
  | "concept"
  | "editing"
  | "other";

export interface SceneTemplateField {
  id: string;
  label: string;
  value: string;
}

export interface SceneTemplateConversationMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  tone?: "default" | "error";
  receipt?: {
    label: string;
  };
  /** 仅发送给后续模型轮次的完整上下文，不在气泡中展示。 */
  assistantContext?: string;
  /** 本轮实际生成的完整提示词，默认折叠供回顾与复用。 */
  generatedPrompt?: string;
}

/** 可跨进程传递并写入 .itt 文件的模板定义。 */
export interface SceneTemplateData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  previewImages?: string[];
  previewPrompts?: string[];
  category: SceneTemplateCategory;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  extractionScenario?: TemplateExtractionScenario;
  fields?: SceneTemplateField[];
  conversation?: SceneTemplateConversationMessage[];
  source: "preset" | "custom";
  createdAt?: string;
}

export interface SceneTemplateImportResult {
  scene: SceneTemplateData;
  instanceCount: number;
  coverCount: number;
}

export type TemplateSubmissionStatus = "pending" | "published" | "rejected" | "taken_down" | "withdrawn";

export interface TemplateSubmissionResult {
  id: string;
  slug: string;
  name: string;
  authorName: string;
  status: TemplateSubmissionStatus;
  reviewNote?: string;
  submittedAt: string;
  reviewedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
}

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

export const OFFICIAL_PROVIDER_ID = "iterlay-official";
export const OFFICIAL_PROVIDER_NAME = "Iterlay 官方";
export const OFFICIAL_MAX_IMAGE_COUNT = 4;
export const IMAGE_CREDIT_COST = 10;
/** 官方文本助手（润色 / 场景大师 / 修改建议等）每次调用消耗的 Credit。 */
export const TEXT_CREDIT_COST = 1;

export const OFFICIAL_PROVIDER_CONFIG: ProviderConfig = {
  id: OFFICIAL_PROVIDER_ID,
  name: OFFICIAL_PROVIDER_NAME,
  type: "official",
  baseUrl: "",
  generationEndpoint: "",
  referenceEndpoint: "",
  model: "官方图片模型",
  supportsReferenceImages: true
};

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

export const OFFICIAL_VIDEO_PROVIDER_ID = "iterlay-official-video";
export const OFFICIAL_VIDEO_PROVIDER_CONFIG: VideoProviderConfig = {
  id: OFFICIAL_VIDEO_PROVIDER_ID,
  name: OFFICIAL_PROVIDER_NAME,
  type: "official",
  baseUrl: "",
  model: "官方视频模型"
};

export const DEFAULT_VIDEO_PROVIDER_ID = "volcengine-ark-video";
export const DEFAULT_VIDEO_PROVIDER_CONFIG: VideoProviderConfig = {
  id: DEFAULT_VIDEO_PROVIDER_ID,
  name: "火山方舟",
  type: "ark",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  model: "doubao-seedance-1-5-pro-250528"
};

export const OFFICIAL_TEXT_PROVIDER_ID = "iterlay-official-text";

export const OFFICIAL_TEXT_PROVIDER_CONFIG: TextProviderConfig = {
  id: OFFICIAL_TEXT_PROVIDER_ID,
  name: OFFICIAL_PROVIDER_NAME,
  type: "official",
  baseUrl: "",
  model: ""
};

export interface CreditBalance {
  walletId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  unitCost: number;
  status: string;
  updatedAt: string;
}

/** 官方视频使用的独立金豆钱包；与图片、文本 Credit 互不转换。 */
export interface GoldBeanBalance {
  walletId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  updatedAt: string;
}

export interface CreditStatus {
  credits: CreditBalance;
  /** 旧版服务端可能暂未返回；缺失时 UI 应按未知余额处理。 */
  goldBeans?: GoldBeanBalance;
  providerAvailable: boolean;
  model?: string;
  /** 官方文本助手是否可用（后台已配置文本模型）。 */
  textAvailable?: boolean;
  textModel?: string;
  /** Manager 当前是否存在已启用且明确支持 Function Calling 的文本负载。 */
  textFunctionCallingAvailable?: boolean;
  /** 官方视频生成是否可用（后台至少配置一个可用视频负载）。 */
  videoAvailable?: boolean;
  videoModel?: string;
  videoModels?: string[];
  videoGoldBeanCostPerSecond?: number;
}

export type PiAgentBuiltinToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls";

export const PI_AGENT_DEFAULT_ITERLAY_TOOLS = [
  "list_boards",
  "get_active_board",
  "get_board",
  "get_board_layout",
  "open_board",
  "fit_board_view",
  "focus_nodes",
  "move_image",
  "resize_image",
  "arrange_images",
  "duplicate_images",
  "trash_images",
  "restore_image",
  "set_image_version",
  "create_board",
  "list_assets",
  "get_generation_status",
  "generate_image",
  "edit_image",
  "import_image",
  "generate_video",
  "get_video_generation_status",
  "stop_video_polling",
  "import_video",
  "export_assets",
  "open_iterlay"
] as const;

export interface PiAgentResourceEntry {
  id: string;
  kind: "skill" | "extension";
  name: string;
  description: string;
  path: string;
  source: "system" | "project" | "package" | "custom";
  packageName?: string;
  warning?: string;
}

export interface PiAgentResourceInventory {
  builtinTools: Array<{
    name: PiAgentBuiltinToolName;
    description: string;
    risk: "read" | "write" | "execute";
  }>;
  iterlayTools: Array<{ name: string; description: string }>;
  skills: PiAgentResourceEntry[];
  extensions: PiAgentResourceEntry[];
  warnings: string[];
}

export interface PiAgentResourceDetail extends PiAgentResourceEntry {
  content: string;
}

export interface AssistantSkillSummary {
  id: string;
  name: string;
  description: string;
  hasOverride: boolean;
  activePath: string;
}

export interface AssistantSkillDetail extends AssistantSkillSummary {
  content: string;
  builtInContent: string;
}

export interface ReferralEntry {
  id: string;
  status: "pending" | "rewarded" | "cancelled";
  rewardCredits: number;
  createdAt: string;
  rewardedAt?: string | null;
}

export interface ReferralOverview {
  invitationCode: string;
  invitationLink: string;
  rewardCredits: number;
  totalInvited: number;
  successfulCount: number;
  totalRewards: number;
  creditBalance: number;
  items: ReferralEntry[];
}

export type GiftActivationCampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "redeeming"
  | "paused"
  | "ended";

export type GiftActivationCodeStatus = "available" | "redeemed" | "expired";

export interface GiftActivationCampaign {
  id: string;
  name: string;
  enabled: boolean;
  redemptionEnabled: boolean;
  startsAt?: string | null;
  issuanceEndsAt?: string | null;
  redemptionEndsAt?: string | null;
  defaultQuota: number;
  totalCodeLimit: number;
  maxMajorVersion: number;
  maxDevices: number;
  activationCredits: number;
  shareMessage: string;
  status: GiftActivationCampaignStatus;
  codesIssued: boolean;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface GiftActivationCode {
  id: string;
  sequence: number;
  code: string;
  codePrefix: string;
  status: GiftActivationCodeStatus;
  shareCount: number;
  redeemedEmail?: string;
  redeemedAt?: string | null;
  createdAt: string;
}

export interface GiftActivationOverview {
  campaign: GiftActivationCampaign;
  eligible: boolean;
  eligibilityReason?: string;
  totalQuota: number;
  availableCount: number;
  redeemedCount: number;
  codes: GiftActivationCode[];
}

export interface CreditLedgerEntry {
  id: string;
  walletId: string;
  amount: number;
  balanceAfter: number;
  entryType: string;
  sourceType?: string;
  sourceId?: string;
  actorType: string;
  actorId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

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
}

export interface EnhancePromptRequest {
  prompt: string;
  workflowMode: ImageWorkflowMode;
  useCase?: GptImageUseCase;
  /** 可选模板。提供时，prompt 作为本次自然语言需求，模型需据此填充模板。 */
  templatePrompt?: string;
  /** 指定用哪个文本 provider；缺省用 activeTextProviderId。 */
  textProviderId?: string;
}

export interface EnhancePromptResult {
  prompt: string;
}

export interface SceneAssistantField {
  label: string;
  value: string;
}

export interface SceneAssistantReference {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface AssistantConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export type AssistantSurface = "scene-template" | "canvas-prompt" | "canvas-edit" | "gallery-review" | "comic-drama" | "video";
export type AssistantSkillScenario = "ui-design" | "video";
export type AssistantIntentSuggestionCount = 3 | 4 | 5;

export interface AssistantConversationRecord {
  id: string;
  conversationId: string;
  surface: AssistantSurface;
  instruction: string;
  response: string;
  reasoningSummary?: string;
  /** 本轮生成的完整提示词，与面向用户的回复文案分开保存。 */
  generatedPrompt?: string;
  attachments?: (import("./assistant-display.js").AssistantAttachmentSnapshot & { path?: string })[];
  toolCalls?: import("./assistant-display.js").AssistantToolCall[];
  occurredAt: string;
  boardId?: string;
  sceneId?: string;
  assetPath?: string;
}

export interface AssistantConversationHistoryQuery {
  conversationId?: string;
  boardId?: string;
  surface?: AssistantSurface;
  assetPath?: string;
}

/** 独立意图建议 agent 的只读上下文，不触发主助手动作或写入对话历史。 */
export interface SuggestAssistantIntentsRequest {
  assistantSurface: AssistantSurface;
  /** scene-template 下区分创建模板与使用已有模板，避免推荐 Agent 混淆任务。 */
  templateWorkflow?: "create" | "use";
  locale?: ResolvedAppLocale;
  conversation: AssistantConversationMessage[];
  currentFields: SceneAssistantField[];
  /** 当前模板的提取场景，用于生成匹配模板职责的后续建议。 */
  templateScenario?: TemplateExtractionScenario;
  /** 用于视觉理解的参考图，最多 4 张。 */
  referenceImages?: SceneAssistantReference[];
  referenceImageCount?: number;
  suggestionCount?: AssistantIntentSuggestionCount;
  /** contextual 预测最可能的下一步；divergent 在手动刷新时探索与上一批不同的创作方向。 */
  suggestionMode?: "contextual" | "divergent";
  /** 发散刷新时的排除基线，避免只对上一批建议改写措辞或微调参数。 */
  previousSuggestions?: string[];
  /** 空白首次推荐的随机种子，用于打散每次打开时的创作起点。 */
  variationSeed?: string;
  /** 指定用哪个文本 provider；缺省用 activeTextProviderId。 */
  textProviderId?: string;
}

export interface SuggestAssistantIntentsResult {
  suggestions: string[];
}

export type MemoryUsageLevel = "cautious" | "balanced" | "active";
export type AssistantMemoryKind = "episodic" | "semantic" | "procedural";
export type AssistantMemoryScope = "asset" | "board" | "scene" | "global";

export interface AssistantMemoryQuery {
  boardId?: string;
  sceneId?: string;
  assetPath?: string;
}

export interface AssistantMemoryContextItem {
  id: string;
  kind: AssistantMemoryKind;
  scope: AssistantMemoryScope;
  content: string;
  confidence: number;
  evidenceCount: number;
  lastReinforcedAt: string;
}

export interface AssistantMemoryStats {
  eventCount: number;
  activeMemoryCount: number;
  candidateMemoryCount: number;
  lastOrganizedAt?: string;
}

export interface AssistantMemoryGenerationResult {
  stats: AssistantMemoryStats;
  importedEventCount: number;
  generatedMemoryCount: number;
}

export interface AssistantMemoryEvidence {
  id: string;
  type: "prompt_draft" | "prompt_submitted" | "assistant_generated" | "assistant_conversation" | "comment_added" | "generation_succeeded" | "generation_failed";
  surface: AssistantSurface | "comment" | "generation";
  summary: string;
  occurredAt: string;
  boardId?: string;
  sceneId?: string;
  assetPath?: string;
  jobId?: string;
}

export interface AssistantMemoryDetail extends AssistantMemoryContextItem {
  status: "candidate" | "active" | "expired";
  createdAt: string;
  expiresAt: string;
  positiveSignals: number;
  negativeSignals: number;
  generationReason: string;
  evidence: AssistantMemoryEvidence[];
}

export interface SceneAssistantInteractionOption {
  label: string;
  value: string;
}

export interface SceneAssistantInteractionField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  required?: boolean;
  multiple?: boolean;
  options?: SceneAssistantInteractionOption[];
}

export type SceneAssistantInteraction =
  | {
      type: "confirm";
      title: string;
      description?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  | {
      type: "form";
      title: string;
      description?: string;
      submitLabel?: string;
      cancelLabel?: string;
      fields: SceneAssistantInteractionField[];
    };

export interface CollaborateSceneRequest {
  instruction: string;
  locale?: ResolvedAppLocale;
  referenceImages: SceneAssistantReference[];
  currentFields: SceneAssistantField[];
  /** scene-template 下区分创建模板与使用已有模板。 */
  templateWorkflow?: "create" | "use";
  /** 当前模板的提取场景；仅 scene-template 助手使用。 */
  templateScenario?: TemplateExtractionScenario;
  /** 模板工厂入口已明确的工作路线，用于约束首轮协作重点。 */
  templateIntent?: TemplateAssistantEntryIntent;
  /** 当前生成数量及所选图片 Provider 的可用上限，供画板助手联动生成设置。 */
  generationSettings?: {
    count: number;
    maxCount: number;
  };
  /** 当前任务已经进行过的澄清轮数；达到 1 后默认不得继续追问。 */
  clarificationRounds?: number;
  conversation?: AssistantConversationMessage[];
  /** 将同一次多轮交流归并为一条可恢复的历史会话。 */
  conversationId?: string;
  /** 自动上下文分析可关闭记录，避免在历史列表中产生不可见的伪会话。 */
  recordInHistory?: boolean;
  assistantSurface?: AssistantSurface;
  /** 对共享 surface 做确定性 Skill 路由，不允许模型自行选择基础场景。 */
  assistantScenario?: AssistantSkillScenario;
  /** 当前创作范围；主进程据此检索记忆。渲染进程不得直接提供 memoryContext。 */
  memoryQuery?: AssistantMemoryQuery;
  /** 由主进程检索并覆盖，仅供文本助手消息构建使用。 */
  memoryContext?: AssistantMemoryContextItem[];
  workflowMode: ImageWorkflowMode;
  useCase?: GptImageUseCase;
  /** 指定用哪个文本 provider；缺省用 activeTextProviderId。 */
  textProviderId?: string;
  /** 仅画板助手使用；主进程会再次校验设置和官方模型能力。 */
  agentMode?: boolean;
}

/**
 * 模型自报的本轮意图：direct=指令明确可直接执行；creative=目标模糊需要澄清；
 * chat=说明性回答，不产出可应用内容。前端据此决定是否应用结果。
 */
export type AssistantIntent = "direct" | "creative" | "chat";

export type AssistantGoal =
  | "create"
  | "continue"
  | "vary"
  | "edit"
  | "explore"
  | "review"
  | "explain";

export type AssistantCommitment = "execute_now" | "prepare_only" | "advise_only";

export type SceneAssistantAction =
  | { type: "apply_prompt" }
  | { type: "set_generation_count"; count: number }
  | { type: "generate" }
  | { type: "generate_directions"; directionIds: string[] }
  | {
      type: "comic_drama_plan";
      operation:
        | "update-setting"
        | "propose-characters"
        | "update-character"
        | "create-segment"
        | "update-segment"
        | "create-media-chain";
      instruction: string;
      characterDrafts?: Array<{
        name: string;
        role: string;
        profile: string;
        appearanceAnchors: string[];
        visualPrompt: string;
        visualDescription: string;
        required: boolean;
      }>;
    };

export interface SceneAssistantDirection {
  id: string;
  title: string;
  description?: string;
  prompt: string;
}

export interface SceneAssistantDirectorReview {
  verdict: "approved" | "repaired";
  reasonCodes: string[];
}

export interface CollaborateSceneResult {
  message: string;
  intent?: AssistantIntent;
  goal?: AssistantGoal;
  commitment?: AssistantCommitment;
  suggestedName?: string;
  suggestedDescription?: string;
  fields: SceneAssistantField[];
  /** 画板场景可选的结构化细节版提示词；fields 承载默认应用的简洁版。 */
  detailedPrompt?: string;
  /** 用户明确要求并行候选时，画板助手建议同步应用的生成数量。 */
  generationCount?: number;
  actions?: SceneAssistantAction[];
  directions?: SceneAssistantDirection[];
  directorReview?: SceneAssistantDirectorReview;
  interaction?: SceneAssistantInteraction;
}

export type CollaborateSceneStreamEvent =
  | { requestId: string; type: "tool"; tool: import("./assistant-display.js").AssistantToolCall }
  | { requestId: string; type: "delta"; delta: string }
  | { requestId: string; type: "reasoning-summary"; delta: string }
  | { requestId: string; type: "activity"; label: string }
  | { requestId: string; type: "fields"; fields: SceneAssistantField[] }
  | { requestId: string; type: "comic-mutation"; result: BoardMutationResult }
  | { requestId: string; type: "result"; result: CollaborateSceneResult }
  | {
      requestId: string;
      type: "interaction";
      interactionId: string;
      interaction: SceneAssistantInteraction;
    }
  | { requestId: string; type: "error"; message: string }
  | { requestId: string; type: "cancelled" };

export interface SuggestImageEditsRequest {
  sourcePath: string;
  /** 指定用哪个文本 provider；缺省用 activeTextProviderId。 */
  textProviderId?: string;
}

export interface SuggestImageEditsResult {
  suggestions: string[];
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

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

/** 公网分享页可被 Iterlay 一键导入的创作上下文。 */
export interface OnlineShareImportData {
  prompt: string;
  referenceUrls: string[];
}

export interface StoredReferenceImage {
  id: string;
  name: string;
  mimeType: string;
  role?: ReferenceImageRole;
  path: string;
}


export interface PaidMediaQuoteRequest {
  kind: "image" | "video" | "video-sequence";
  clientRequestId: string;
  inputFingerprint: string;
  boardId: string;
  requestScope: string;
  operation: "image:generate" | "video:start" | "videoSequence:run" | "videoSequence:retry";
  providerId?: string;
  imageCount?: number;
  durationSeconds?: number;
  model?: string;
  resolution?: string;
  generateAudio?: boolean;
  videoItems?: Array<{ clientRequestId: string; providerId?: string; model?: string; durationSeconds: number; resolution?: string; generateAudio?: boolean }>;
  stage: ComicGenerationCostItem["stage"];
}

export interface PaidMediaQuote {
  quoteId: string;
  clientRequestId: string;
  inputFingerprint: string;
  providerKey: string;
  expiresAt: string;
  priceSnapshot: ComicGenerationCostItem & { authoritative: true };
}

export interface GenerateImageInput {
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

export interface UiDesignBrief {
  goal: string;
  surface: string;
  structure: string;
  visualDirection: string;
  constraints: string;
  /** 已融合用户需求、材料职责和可选模板规则，可直接交给图片模型。 */
  generationPrompt: string;
}

export interface SceneCoverFocus {
  x: number;
  y: number;
}

export interface SceneMediaResult {
  id: string;
  jobId: string;
  sceneId: string;
  path: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
  providerId?: string;
  providerName?: string;
  model?: string;
}

export interface SceneCoverImage {
  id: string;
  sceneId: string;
  path: string;
  imageUrl: string;
  sourcePath: string;
  createdAt: string;
  focus: SceneCoverFocus;
}

export interface SceneMediaSummary {
  sceneId: string;
  results: SceneMediaResult[];
  covers: SceneCoverImage[];
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

export interface GenerationResult {
  images: ProviderImageResult[];
  /** 非致命问题（如 n 张里有部分失败、Provider 返回张数不足），由 UI 以警告形式展示。 */
  warnings?: string[];
  /** 官方 Provider 返回的扣费后余额；自定义 Provider 不设置。 */
  credits?: CreditBalance;
}

export interface GenerationJob {
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
  useCase?: GptImageUseCase;
  referenceImagePaths: string[];
  outputImagePaths: string[];
  error?: string;
  /** 归属画板；旧数据在首次迁移时统一挂到默认画板。 */
  boardId?: string;
  /** 官方 Provider 的服务端任务 ID；仅用于关闭 App 后恢复。 */
  remoteJobId?: string;
}

/** 编辑态点击图片查看提示词的方式：flip=图片翻转背面展示；panel=右侧打字机面板。 */
export type EditInfoMode = "flip" | "panel";

/** 画板图片的双击动作：进入编辑、加入参考图，或聚焦放大图片。 */
export type ImageDoubleClickAction = "edit" | "reference" | "focus";

/** “复制原图”写入系统剪贴板时使用的图片格式。 */
export type CopyImageFormat = "png" | "gif";

/** 版本分离语义：copy 保留原版本栈，extract 从原版本栈移出。 */
export type VersionSeparationMode = "copy" | "extract";

/** 画板底部主生成按钮的视觉样式。 */
export type GenerateButtonStyle = "folded" | "glow" | "prismatic" | "send";

export type BuiltinAppIconPreference = "default" | "mascot";

/** 应用在 Dock、任务栏和窗口中使用的图标。 */
export type AppIconPreference = BuiltinAppIconPreference | `custom:${string}`;

/** 用户上传并保存在本机的伙伴头像。 */
export interface CustomAppIcon {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface AppIconLibrary {
  appIcon: AppIconPreference;
  customAppIcons: CustomAppIcon[];
}

export interface UploadAppIconRequest {
  name: string;
  dataUrl: string;
}

export type OnboardingStatus = "completed" | "skipped" | "seen";

export interface OnboardingRecord {
  status: OnboardingStatus;
  at: string;
}

export type OnboardingState = Record<string, OnboardingRecord>;

export interface AppSettings {
  /** 已保存的 provider 列表；至少一个。 */
  providers: ProviderConfig[];
  /** 当前激活（默认生成用）的 provider id，需存在于 providers 中。 */
  activeProviderId: string;
  /** 已保存的文本 Provider 列表（AI 智能辅助用）；至少包含官方内置项。 */
  textProviders: TextProviderConfig[];
  /** 当前激活的文本 provider id，需存在于 textProviders 中。 */
  activeTextProviderId: string;
  /** 已保存的视频 Provider 列表。 */
  videoProviders: VideoProviderConfig[];
  /** 新建视频生成节点默认使用的 Provider。 */
  activeVideoProviderId: string;
  /** 应用界面语言；system 会跟随操作系统语言。 */
  language: import("./i18n.js").AppLanguage;
  theme: "light" | "dark" | "system";
  /** 底部输入框是否启用"失焦收窄 / 聚焦展开"，默认关闭。 */
  promptDockAutoCollapse: boolean;
  /** 是否显示视频改编和继续生成入口，默认关闭。 */
  advancedVideoModesEnabled?: boolean;
  /** 画板缩小时是否使用低分辨率缩略图，默认关闭。 */
  canvasThumbnailPreview: boolean;
  /** 是否显示画布小地图，默认开启。 */
  canvasMinimapVisible?: boolean;
  /** 是否在悬停画板图片时显示操作工具栏，默认关闭。 */
  canvasImageToolbarOnHover?: boolean;
  /** 是否在悬停画布节点时突出其关联关系并弱化其他节点，默认关闭。 */
  canvasRelationshipHoverHighlight?: boolean;
  /** 是否显示实验性的微信表情导出入口，默认关闭。 */
  wechatStickerExportEnabled?: boolean;
  /** 是否允许通过 Manager 创建图片的公网快速分享，默认开启。 */
  onlineImageSharingEnabled?: boolean;
  /** “复制原图”的目标格式，默认 png。 */
  copyImageFormat?: CopyImageFormat;
  /** 是否在画板输入框上方显示快捷建议，默认关闭。 */
  boardSmartSuggestionsEnabled?: boolean;
  /** 是否启用画板 AI 助手入口与快捷键，默认开启。 */
  boardAssistantEnabled?: boolean;
  /** 是否使用 Pi Agent 驱动画板助手，默认关闭。 */
  boardAssistantAgentModeEnabled?: boolean;
  /** 是否让所有用户可见助手统一使用 Pi Agent，默认关闭。 */
  assistantAgentModeEnabled?: boolean;
  /** Agent 会话启用的 Pi 内置工具。 */
  piAgentBuiltinTools?: PiAgentBuiltinToolName[];
  /** Agent 会话启用的 Iterlay MCP 工具；Web 搜索和终结工具始终保留。 */
  piAgentIterlayTools?: string[];
  /** 已启用的 Skill 文件或目录路径。 */
  piAgentSkillPaths?: string[];
  /** 已启用的 Pi 扩展文件或目录路径。 */
  piAgentExtensionPaths?: string[];
  /** 用户追加到发现范围的 Skill 路径。 */
  piAgentCustomSkillPaths?: string[];
  /** 用户追加到发现范围的扩展路径。 */
  piAgentCustomExtensionPaths?: string[];
  /** 单次可见助手请求允许的最大 Agent 轮数。 */
  piAgentMaxTurns?: number;
  /** 单次 Web 搜索默认允许返回的最大结果数。 */
  piAgentWebSearchMaxResults?: number;
  /** 是否在输入文字或添加引用后自动感知并解析上下文，默认开启。 */
  boardAssistantAwarenessEnabled?: boolean;
  /** 是否在画板 AI 助手中生成后续问题推荐，默认开启。 */
  boardAssistantIntentSuggestionsEnabled?: boolean;
  /** 画板 AI 助手每次生成的意图建议数量，默认 3，最多 5。 */
  boardAssistantIntentSuggestionCount?: AssistantIntentSuggestionCount;
  /** 是否在图片编辑时生成智能建议，默认开启。 */
  editSmartSuggestionsEnabled?: boolean;
  /** 是否记录并在 AI 助手中使用创作记忆，默认开启。 */
  memoryEnabled?: boolean;
  /** 记忆召回范围和上下文预算。 */
  memoryUsageLevel?: MemoryUsageLevel;
  /** 编辑态点击图片查看提示词的方式，默认 flip。 */
  editInfoMode?: EditInfoMode;
  /** 双击画板图片时执行的动作，默认 edit。 */
  imageDoubleClickAction?: ImageDoubleClickAction;
  /** 图片与批量压缩包的自动下载目录；首次下载时由用户选择。 */
  downloadDirectory?: string;
  /** 版本分离默认保留原版本栈。 */
  versionSeparationMode?: VersionSeparationMode;
  /** 画板底部主生成按钮样式，默认 folded。 */
  generateButtonStyle?: GenerateButtonStyle;
  /** 应用图标，默认使用 Iterlay 品牌标志。 */
  appIcon?: AppIconPreference;
  /** 用户上传的伙伴头像历史。 */
  customAppIcons?: CustomAppIcon[];
  /** 回收站保留天数；0 表示永不自动清理，默认 3 天。 */
  boardTrashRetentionDays?: BoardTrashRetentionDays;
}

/** 对现有设置做原子增量更新，未提供的字段保持不变。 */
export type AppSettingsPatch = Partial<AppSettings>;

export type OnlineShareKind = "image" | "wechat-stickers";

/** 图片公网分享页的内容配置。单图请求继续使用 sourcePath，多图使用 sourcePaths。 */
export interface OnlineImageShareRequest {
  sourcePath?: string;
  sourcePaths?: string[];
  jobId?: string;
  /** 多图分享时，按图片顺序传入各自的生成任务，用于展示详情。 */
  jobIds?: string[];
  showPrompt: boolean;
  /** 分享内容所在画板与节点，供在线分享管理一键返回。 */
  origin?: OnlineShareCanvasOrigin;
}

export interface OnlineShareCanvasOrigin {
  boardId: string;
  nodeIds: string[];
}

/** 当前由桌面端维持的 Manager 公网分享会话；同一时间最多一个。 */
export interface OnlineShareSession {
  id: string;
  kind: OnlineShareKind;
  title: string;
  url: string;
  startedAt: number;
  expiresAt: number;
  /** 部分分享（例如从画板发起的图片分享）可定位回来源节点。 */
  origin?: OnlineShareCanvasOrigin;
}

export type BoardTrashRetentionDays = 0 | 1 | 3 | 7 | 30 | 90;

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

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  /** 原生 OpenAI Chat Completions tools/tool_calls 协议探测结果。 */
  functionCalling?: "supported" | "unsupported" | "unknown";
}

export type SystemNotificationDeliveryStatus =
  | "delivered"
  | "requested"
  | "unsupported"
  | "failed";

export interface SystemNotificationDeliveryResult {
  status: SystemNotificationDeliveryStatus;
  message?: string;
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

export interface AppErrorShape {
  code: string;
  message: string;
}

// ---------- 画板（Board） ----------

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

export type ImageSource = "generated" | "upload" | "slice";

export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDerivation {
  sourceNodeId: string;
  sourceImagePath: string;
  crop: ImageCropRect;
}

export interface SliceImageRequest {
  sourcePath: string;
  crops: ImageCropRect[];
}

export interface SliceImageResult {
  path: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
  dataUrl: string;
  width: number;
  height: number;
}

export interface WechatStickerPackageFile {
  /** 相对导出目录的 POSIX 路径，例如 stickers/01.png。 */
  relativePath: string;
  bytes: ArrayBuffer;
}

export interface SaveWechatStickerPackageRequest {
  packageName: string;
  files: WechatStickerPackageFile[];
  createZip?: boolean;
}

export interface SaveWechatStickerPackageResult {
  ok: boolean;
  directory?: string;
  folderPath?: string;
  zipPath?: string;
  fileCount?: number;
}

export interface WriteClipboardImageRequest {
  mimeType: "image/gif";
  bytes: ArrayBuffer;
}

export interface SliceSubjectDetection {
  index: number;
  bounds: ImageCropRect;
  confidence: number;
}

export interface AnalyzeSliceSubjectsRequest {
  sourcePath: string;
  crops: ImageCropRect[];
  /** 指定用哪个文本 provider；缺省用 activeTextProviderId。 */
  textProviderId?: string;
}

export interface AnalyzeSliceSubjectsResult {
  items: SliceSubjectDetection[];
}

/** 节点的一个编辑版本（v1 为原图）。 */
export interface BoardNodeVersion {
  imagePath: string;
  jobId: string;
  width?: number;
  height?: number;
}

/** 所有画板节点共享的可持久化布局信息。 */
export interface BoardNodeBase {
  id: string;
  x: number;
  y: number;
  title?: string;
  locked?: boolean;
  zIndex?: number;
  /** 画布上的展示宽度；节点类型未指定时由注册表提供默认值。 */
  displayWidth?: number;
  /** 非图片节点的展示高度；图片节点始终按原图比例推导。 */
  displayHeight?: number;
}

/** 画板上一个图片节点的落盘快照：只存资产引用与坐标，不复制图片文件。 */
export interface BoardNodeSnapshot extends BoardNodeBase {
  /** 旧画板没有此字段；读取时等同于 image。 */
  type?: "image";
  /** 画布节点 id（即 GeneratedImage.id），保存/恢复时保持一致。 */
  id: string;
  /** 当前激活版本的图片路径（与 versions[activeVersion] 一致，兼容无版本的旧数据）。 */
  imagePath: string;
  jobId: string;
  source: ImageSource;
  width?: number;
  height?: number;
  /** 编辑版本链（含原图）；无编辑历史时省略。 */
  versions?: BoardNodeVersion[];
  activeVersion?: number;
  /** 切图派生关系；普通生成/上传节点省略。 */
  derivation?: ImageDerivation;
}

/** 带显式判别字段的新格式图片节点。 */
export interface BoardImageNode extends BoardNodeSnapshot {
  type: "image";
}

export interface BoardTextNode extends BoardNodeBase {
  type: "text";
  text: string;
  heightMode?: "auto" | "manual";
}

export type BoardGenerationStatus = "idle" | "queued" | "running" | "succeeded" | "failed";

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

/** @deprecated 使用 VideoProviderCapability；保留旧名称供 preload 调用方兼容。 */
export type VideoProviderCapabilities = VideoProviderCapability;

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

export interface OfficialVideoBatchQuoteRequest {
  clientBatchId: string;
  items: Array<{
    clientRequestId: string;
    model: string;
    durationSeconds: number;
    resolution: string;
    generateAudio: boolean;
  }>;
}

export interface OfficialVideoBatchQuote {
  quoteId: string;
  currency: "credit";
  total: number;
  items: Array<{ clientRequestId: string; amount: number }>;
  expiresAt: string;
}

export interface OfficialVideoBatchReservation {
  reservationId: string;
  quoteId: string;
  status: "reserved" | "committed" | "released" | "expired";
}

export type VideoSequenceEvent =
  | { type: "sequence-changed"; boardId: string; sequenceId: string; revision: number }
  | { type: "task-changed"; boardId: string; sequenceId: string; job: VideoGenerationJobV2 }
  | { type: "export-changed"; boardId: string; sequenceId: string; job: VideoSequenceExportJob };

export interface BoardVideoVersion {
  videoPath: string;
  posterPath?: string;
  jobId: string;
  mimeType?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationMs?: number;
}

export interface BoardVideoNode extends BoardNodeBase {
  type: "video";
  videoPath: string;
  posterPath?: string;
  jobId: string;
  source: "generated" | "upload";
  mimeType?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationMs?: number;
  versions?: BoardVideoVersion[];
  activeVersion?: number;
  status?: VideoGenerationJobStatus | "draft" | "modified";
  error?: string;
  generationNodeId?: string;
}

export interface BoardVideoGenerationNode extends BoardNodeBase {
  type: "video-generation";
  mode?: "generate" | "remix" | "extend";
  prompt?: string;
  providerId?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  watermark?: boolean;
  referenceVideoPaths?: string[];
  referenceAudioPaths?: string[];
  referenceAudioNames?: Record<string, string>;
  sourceVideoPath?: string;
  targetVideoNodeId?: string;
  lastGenerationId?: string;
  status?: VideoGenerationStatus;
  error?: string;
  heightMode?: "auto" | "manual";
}

/** 生成节点只保存可复用配置；图片和文本输入由 reference 连线在运行时解析。 */
export interface BoardGenerationNode extends BoardNodeBase {
  type: "generation";
  prompt?: string;
  providerId?: string;
  model?: string;
  useCase?: GptImageUseCase;
  size?: string;
  count?: number;
  lastGenerationId?: string;
  /** 最新生成结果。漫剧帧只有用户采用后才复制到 lastGenerationId。 */
  latestGenerationId?: string;
  status?: BoardGenerationStatus;
  error?: string;
  /** 漫剧首帧/尾帧生成意图；普通图片生成节点省略。 */
  comicFrameRole?: ComicFrameRole;
  comicFrameContextSnapshot?: ComicFrameContextSnapshot;
  /** 节点输入区的自适应或用户手动调整高度。 */
  heightMode?: "auto" | "manual";
}

/** 旧图片节点仍可无 type；存储读取边界会将其规范化为显式 image。 */
export type BoardNode =
  | BoardNodeSnapshot
  | BoardTextNode
  | BoardGenerationNode
  | BoardVideoNode
  | BoardVideoGenerationNode
  | ComicDramaBoardNode
  | BoardComicDramaEntryNode
  | BoardVideoSequenceEntryNode;

/** Omit 对联合类型不分发，追加节点 API 使用显式联合保持各节点字段推断。 */
export type UnpositionedBoardNode =
  | Omit<BoardNodeSnapshot, "x" | "y">
  | Omit<BoardTextNode, "x" | "y">
  | Omit<BoardGenerationNode, "x" | "y">
  | Omit<BoardVideoNode, "x" | "y">
  | Omit<BoardVideoGenerationNode, "x" | "y">
  | Omit<ComicSettingNode, "x" | "y">
  | Omit<ComicCharacterNode, "x" | "y">
  | Omit<ComicSegmentScriptNode, "x" | "y">
  | Omit<BoardComicDramaEntryNode, "x" | "y">
  | Omit<BoardVideoSequenceEntryNode, "x" | "y">;

export function isBoardImageNode(node: BoardNode): node is BoardNodeSnapshot {
  return node.type === undefined || node.type === "image";
}

export function isBoardTextNode(node: BoardNode): node is BoardTextNode {
  return node.type === "text";
}

export function isBoardGenerationNode(node: BoardNode): node is BoardGenerationNode {
  return node.type === "generation";
}

export function isBoardVideoNode(node: BoardNode): node is BoardVideoNode {
  return node.type === "video";
}

export function isBoardVideoGenerationNode(node: BoardNode): node is BoardVideoGenerationNode {
  return node.type === "video-generation";
}

/** 将可信存储中的旧图片节点补齐判别字段；无法识别的节点不会进入画板。 */
export function normalizeBoardNode(value: unknown): BoardNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<BoardNode> & Record<string, unknown>;
  if (typeof node.id !== "string" || typeof node.x !== "number" || typeof node.y !== "number") return null;
  if (node.type === "comic-setting" || node.type === "comic-character" || node.type === "comic-segment-script") {
    return normalizeComicDramaNode(value);
  }
  if (node.type === "comic-drama-entry") return normalizeComicDramaEntryNode(value);
  if (node.type === "video-sequence-entry") return normalizeVideoSequenceEntryNode(value);
  if (node.type === "text") {
    if (typeof node.text !== "string") return null;
    return { ...node, type: "text", text: node.text } as BoardTextNode;
  }
  if (node.type === "generation") return { ...node, type: "generation" } as BoardGenerationNode;
  if (node.type === "video-generation") return { ...node, type: "video-generation" } as BoardVideoGenerationNode;
  if (node.type === "video") {
    if (typeof node.videoPath !== "string" || typeof node.jobId !== "string") return null;
    if (node.source !== "generated" && node.source !== "upload") return null;
    return { ...node, type: "video" } as BoardVideoNode;
  }
  if (node.type !== undefined && node.type !== "image") return null;
  if (typeof node.imagePath !== "string" || typeof node.jobId !== "string" || typeof node.source !== "string") return null;
  return { ...node, type: "image" } as BoardImageNode;
}

export type BoardConnectionRoutingMode = "auto" | "manual";

export type BoardConnectionRoutingKind = "orthogonal" | "straight" | "curved";

/** 手动路由控制点。id 在坐标变化时保持不变，用于稳定线段和标签锚点。 */
export interface BoardConnectionWaypoint {
  id: string;
  x: number;
  y: number;
}

/** 连接线的持久化路由意图；自动路由的计算结果不会写回画板。 */
export interface BoardConnectionRouting {
  mode: BoardConnectionRoutingMode;
  kind: BoardConnectionRoutingKind;
  waypoints: BoardConnectionWaypoint[];
}

/** 标签锚点。存在 segmentId 时 progress 为线段内进度，否则为全路径进度。 */
export interface BoardConnectionLabelAnchor {
  segmentId?: string;
  /** 线段消失或异步路由拓扑变化时，用于在整条新路径上稳定回退。 */
  globalProgress?: number;
  progress: number;
}

export type BoardConnectionDash = "solid" | "dashed" | "dotted";

export type BoardConnectionMarker = "none" | "arrow";

export type BoardConnectionKind = "visual" | "reference";

export type BoardConnectionSide = "top" | "right" | "bottom" | "left";

/** 连接端点在节点边上的完整持久化锚点；数字格式仅保留用于读取旧画板。 */
export interface BoardConnectionAnchor {
  side: BoardConnectionSide;
  ratio: number;
  mode: "auto" | "pinned";
}

/** 连接线的可持久化视觉样式；缺省字段由画布主题提供稳定默认值。 */
export interface BoardConnectionStyle {
  color?: string;
  width?: number;
  dash?: BoardConnectionDash;
  startMarker?: BoardConnectionMarker;
  endMarker?: BoardConnectionMarker;
  /** 箭头在屏幕上的显示尺寸，单位为 px。 */
  markerSize?: number;
  lineJumps?: boolean;
}

/** 画板中两个图片节点之间的有向连接。端点记录在节点四边，便于恢复同一条视觉路径。 */
export interface BoardConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** visual 仅表达画布关系；reference 会作为生成节点的上游输入。旧连线缺省为 visual。 */
  kind?: BoardConnectionKind;
  /** reference 缺省跟随活动版本；固定版本缺失时保留连接并阻止生成。 */
  versionBinding?: ComicDramaVersionBinding;
  /** 系统维护的语义依赖不可由用户单独删除或重连；删除端点节点时随节点清理。 */
  locked?: boolean;
  /** 锚点沿连接侧边的位置；旧画板可能仍为 0-1 数字。 */
  sourceAnchor?: number | BoardConnectionAnchor;
  targetAnchor?: number | BoardConnectionAnchor;
  label?: string;
  /** 连线标签沿完整路径的归一化位置，0 为起点，1 为终点。 */
  labelProgress?: number;
  /** 稳定绑定到路径线段的标签位置；优先于 labelProgress。 */
  labelAnchor?: BoardConnectionLabelAnchor;
  style?: BoardConnectionStyle;
  /** @deprecated 旧版画布绝对坐标，仅用于迁移为 labelProgress。 */
  labelPosition?: { x: number; y: number };
  /** 连接线的路由模式、形态与手动控制点。 */
  routing?: BoardConnectionRouting;
  /** @deprecated 单拐线的中间路由坐标，仅用于迁移为 routing.waypoints。 */
  routeCoordinate?: number;
}

export function normalizeBoardConnection(value: unknown): BoardConnection | null {
  if (!value || typeof value !== "object") return null;
  const connection = value as Partial<BoardConnection> & Record<string, unknown>;
  if (
    typeof connection.id !== "string"
    || typeof connection.source !== "string"
    || typeof connection.target !== "string"
  ) return null;
  const binding = connection.kind === "reference"
    ? normalizeComicDramaVersionBinding(connection.versionBinding)
    : undefined;
  return {
    ...connection,
    kind: connection.kind === "reference" ? "reference" : "visual",
    ...(binding ? { versionBinding: binding } : {}),
    ...(connection.locked === true ? { locked: true } : { locked: undefined })
  } as BoardConnection;
}

export interface BoardData {
  /** 当前持久化模型版本；旧画板缺省视为 v1，读取后升级为 v3。 */
  schemaVersion?: 3;
  /** 内容 revision；旧画板读取为 0。助手计划以此做乐观并发控制。 */
  revision?: number;
  id: string;
  name: string;
  /** 独立漫剧子画板通过 parentBoardId 返回承载入口卡的普通画板。 */
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  createdAt: string;
  updatedAt: string;
  nodes: BoardNode[];
  connections?: BoardConnection[];
  groups?: BoardGroup[];
  viewport?: BoardViewport;
  /** 库页卡片封面，渲染层生成的小尺寸 dataUrl，随画板 JSON 一起存。 */
  thumbnailDataUrl?: string;
  /** 序列定义属于画板，但只能通过专用 sequence mutation 修改。 */
  videoSequences?: VideoSequence[];
}

export interface BoardSummary {
  id: string;
  name: string;
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  /** 画板引用的唯一图片文件总大小（包含版本链）。 */
  storageBytes?: number;
  thumbnailDataUrl?: string;
}

export interface TrashedBoardSummary extends BoardSummary {
  deletedAt: string;
  /** 根据当前保留策略计算；永不自动清理时省略。 */
  expiresAt?: string;
}

/** 画板内被移除的图片节点。图片文件会保留到回收站清理为止。 */
export interface TrashedBoardImage {
  id: string;
  boardId: string;
  boardName: string;
  node: BoardNodeSnapshot;
  deletedAt: string;
  /** 根据当前保留策略计算；永不自动清理时省略。 */
  expiresAt?: string;
  /** 受控图片 URL，仅用于回收站预览。 */
  previewUrl?: string;
}

export interface RestoreTrashedBoardImageResult {
  item: TrashedBoardImage;
  /** 当前节点与版本链的受控图片 URL。 */
  imageUrls: Record<string, string>;
}

/** 从画板库进入画板时的来源位置与预览，用于连续的工作台展开过渡。 */
export interface BoardEnterOrigin {
  rect: { left: number; top: number; width: number; height: number };
  thumbnailDataUrl?: string;
}

/** boards:get 的返回：主进程按 imagePath 附上受控协议 URL，不传图片字节。 */
export interface BoardDetail extends BoardData {
  images: Record<string, string>;
  /** 视频、poster 等非图片媒体路径到受控协议 URL 的映射。 */
  media?: Record<string, string>;
}

/** boards:save 的入参：未提供的字段保留原值（增量合并）。 */
export interface BoardSavePayload {
  id: string;
  name?: string;
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  /** 画布完整快照保存时允许显式删除漫剧与入口节点；旧调用缺省继续保留。 */
  replaceManagedNodes?: boolean;
  nodes?: BoardNode[];
  connections?: BoardConnection[];
  groups?: BoardGroup[];
  videoSequences?: VideoSequence[];
  viewport?: BoardViewport;
  thumbnailDataUrl?: string;
}

export interface ComicDramaProjectCreateInput {
  parentBoardId: string;
  name?: string;
  position: { x: number; y: number };
}

export interface ComicDramaProjectCreateResult {
  parentBoard: BoardData;
  childBoard: BoardData;
  entryNode: BoardComicDramaEntryNode;
}

// ---------- 素材库 / 评论 ----------

/** 素材库条目：一张生成图片 + 其来源画板与提示词（由主进程聚合所有画板生成节点得到）。 */
export interface AssetLibraryItem {
  /** 缺省按 image 处理，兼容既有素材记录。 */
  mediaType?: "image" | "video";
  imagePath: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留，不再携带 base64。 */
  dataUrl: string;
  /** 列表使用的小尺寸持久缩略图 URL。 */
  thumbnailUrl: string;
  /** 来源画板与节点：用于"进入画板并定位"。 */
  boardId: string;
  boardName: string;
  nodeId: string;
  jobId: string;
  prompt: string;
  useCase?: GptImageUseCase;
  size?: string;
  createdAt: string;
  width?: number;
  height?: number;
  posterUrl?: string;
  durationMs?: number;
  /** ThumbHash（base64）：列表在真图加载前显示的模糊占位，同时兜底提供宽高比。 */
  thumbHash?: string;
  /** 是否含透明像素：列表据此垫棋盘格衬底。 */
  hasAlpha?: boolean;
  /** 素材来源：生成结果 / 用户上传 / 切图派生（供素材库来源筛选）。 */
  source: ImageSource;
  /** 收藏与标签（供素材库筛选）。 */
  favorite: boolean;
  tags: string[];
}

export interface AssetLibraryPage {
  items: AssetLibraryItem[];
  total: number;
  /** 快照游标；继续加载时传回，避免重复扫描画板与历史。 */
  nextCursor?: string;
}

/** 素材/图片评论：按图片文件 imagePath 归属，持久化，画布评论栏与素材详情共用。 */
export interface AssetComment {
  id: string;
  imagePath: string;
  text: string;
  createdAt: string;
  /** 图片内的归一化标记坐标；旧评论和素材详情评论可以没有坐标。 */
  position?: {
    x: number;
    y: number;
  };
}

/** 某个生成任务的提示词与引用图（用于编辑态查看图片来源信息）。 */
export interface JobPromptInfo {
  prompt: string;
  referenceImages: string[];
  /** 结构化提示词（若该次生成有），供工作台拆分展示。 */
  promptSpec?: PromptSpec;
}

/** 引用图（生成/编辑时用到的源图）；若其本身是画板上的某素材，附血缘跳转信息。 */
export interface AssetReference {
  imagePath: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
  dataUrl: string;
  /** 该引用图对应的来源素材（生成节点），用于血缘跳转；无则表示外部上传/无法定位。 */
  sourceBoardId?: string;
  sourceNodeId?: string;
}

/** 素材的一个版本（v1 起），带该次生成/编辑的提示词、结构化字段与引用图。 */
export interface AssetVersion {
  imagePath: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
  dataUrl: string;
  jobId: string;
  prompt: string;
  promptSpec?: PromptSpec;
  useCase?: GptImageUseCase;
  size?: string;
  model?: string;
  createdAt: string;
  /** 该版本由 AI 助手发起生成时对应的会话。 */
  assistantConversationId?: string;
  references: AssetReference[];
}

/** 素材详情按需数据：版本链（含各自提示词/引用图/血缘）+ 激活版本下标。 */
export interface AssetDetailData {
  versions: AssetVersion[];
  activeVersion: number;
}

/** 素材的收藏与标签（按图片文件 imagePath 归属，持久化）。 */
export interface AssetTagInfo {
  imagePath: string;
  favorite: boolean;
  tags: string[];
}
