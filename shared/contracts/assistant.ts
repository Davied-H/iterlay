import type { ResolvedAppLocale } from "../i18n.js";

import type { BoardMutationResult } from "../comic-drama.js";
import type { ImageWorkflowMode, GptImageUseCase } from "./generation.js";
import type { TemplateExtractionScenario, TemplateAssistantEntryIntent } from "./scenes.js";

export type PiAgentBuiltinToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls";

export const PI_AGENT_DEFAULT_ITERLAY_TOOLS = [
  "create_canvas",
  "update_canvas",
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
  /** Managed source identity, retained for media tool execution. */
  imagePath?: string;
  sourceNodeId?: string;
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
  mediaType?: "image" | "video";
  videoSettings?: CollaborateSceneResult["videoSettings"];
  attachments?: (import("../assistant-display.js").AssistantAttachmentSnapshot & { path?: string })[];
  toolCalls?: import("../assistant-display.js").AssistantToolCall[];
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
  /** Allow an additional free-text answer alongside this question. */
  allowSupplement?: boolean;
  options?: SceneAssistantInteractionOption[];
}

export type SceneAssistantInteraction =
  | {
      type: "permission";
      capability: "screen-capture";
      title: string;
      description: string;
      providerLabel: string;
    }
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
  /** 新对话创作入口：先收集需求，再确认方案，最后执行媒体任务。 */
  creationWorkflow?: boolean;
  /** 宿主填充；渲染进程提供的值不采信。 */
  screenCaptureAvailable?: boolean;
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
  /** 当前任务已经进行过的澄清轮数，供助手判断对话进展。 */
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
  | { type: "request_screen_capture"; reason: string }
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
  mediaType?: "image" | "video";
  videoSettings?: { durationSeconds?: number; aspectRatio?: string; resolution?: string };
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
  | { requestId: string; type: "steer-ready" }
  | { requestId: string; type: "tool"; tool: import("../assistant-display.js").AssistantToolCall }
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
