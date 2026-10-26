import { useAssistantBranchLifecycle } from "@/features/assistant/use-assistant-branch-lifecycle";
import type { GeneratedImage } from "@/components/canvas/ImageNode";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { createAssistantInstructionSender } from "@/features/assistant/assistant-instruction";
import { useAssistantHistory } from "@/features/assistant/use-assistant-history";
import { ASSISTANT_VIEWPORT_MARGIN, useAssistantPanelLayout } from "@/features/assistant/use-assistant-panel-layout";
import { useAssistantSessionState, type AssistantIntentSuggestionMode } from "@/features/assistant/use-assistant-session-state";
import { useComicAssistantContext } from "@/features/assistant/use-comic-assistant-context";
import { requestPluginCapability } from "@/features/plugins/request-plugin-capability";
import { useUiText } from "@/i18n";
import { translateSourceText } from "@/i18n/ui-text";
import { SHORT_DRAMA_PLUGIN_ID } from "@shared/plugins";
import type {
  AssistantIntentSuggestionCount,
  AssistantSurface,
  BoardMutationPlan,
  CollaborateSceneResult,
  ComicDramaBoardSnapshot,
  CreationMode,
  CreditStatus,
  GenerateButtonStyle,
  GenerateImageInput,
  MemoryUsageLevel,
  ProviderConfig,
  ReferenceImagePayload,
  SceneAssistantReference,
  SceneMediaSummary,
  UiDesignBrief,
  UiMaterialRole
} from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, LayoutTemplate, Library, Loader2, PanelLeft, PanelLeftOpen, PanelRight, PanelRightOpen, RefreshCw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GenerateActionButton } from "./GenerateActionButton";
import { GenerationSettingsPicker } from "./GenerationSettingsPicker";
import { ProviderPicker } from "./ProviderPicker";
import { ReferencePicker } from "./ReferencePicker";
export { GenerateActionButton } from "./GenerateActionButton";

import type {
  AiAssistantContextImage,
  AiAssistantInteractionState,
  AiAssistantInteractionValues,
  AiAssistantMessage,
  AiAssistantReceipt,
  AiAssistantReceiptAction
} from "@/components/assistant/AiAssistant";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { InlinePromptEditor } from "@/components/workbench/InlinePromptEditor";
import { useI18n, type MessageKey } from "@/i18n";
import { ASSISTANT_PROMPT_IDLE_MS, buildAssistantContextSignature, shouldScheduleAssistantPromptAnalysis } from "@/lib/assistant-awareness";
import { buildAssistantHistory, getLatestAssistantConversation } from "@/lib/assistant-history";
import {
  buildAssistantActionConfirmInteraction,
  buildAssistantConfirmationPreview,
  formatAssistantInteractionAnswers,
  resolveAssistantInteraction,
  type AssistantConfirmationPreview
} from "@/lib/assistant-interaction";
import {
  type AssistantDockLayout
} from "@/lib/assistant-panel-docking";
import { matchesAssistantShortcut } from "@/lib/assistant-shortcut";

import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import {
  buildPromptAssistantCurrentFields,
  buildPromptAssistantGreeting,
  resolveAssistantGenerationCount,
  sceneAssistantFieldsToPrompt,
  settleCancelledAssistantMessages
} from "@/lib/prompt-assistant";
import { getProviderMaxImageCount } from "@/lib/provider-image-count";
import { findSceneForMode, type NewSceneInput, type SceneDefinition } from "@/lib/scene-library";
import { getScenePreviewImages } from "@/lib/scene-media";
import { isSendEnter } from "@/lib/send-on-enter";
import { type TextProviderReadinessStatus } from "@/lib/text-provider-readiness";
import {
  buildUiDesignAssistantGreeting,
  createUiDesignBrief,
  hasUiDesignBriefFields,
  inferUiMaterialRole,
  uiDesignBriefToFields
} from "@/lib/ui-design-workflow";
import { cn } from "@/lib/utils";
import { settleAssistantToolCalls } from "@shared/assistant-display";
import { AssistantInteraction } from "../assistant/AssistantInteraction";
import { PromptFusionDock } from "./PromptFusionDock";

const loadAiAssistant = () =>
  import("@/components/assistant/AiAssistant").then((module) => ({ default: module.AiAssistant }));
const AiAssistant = lazy(loadAiAssistant);
const loadScenePickerDialog = () =>
  import("@/components/workbench/SceneLibrary").then((module) => ({ default: module.ScenePickerDialog }));
const ScenePickerDialog = lazy(loadScenePickerDialog);

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function getAssistantGeneratedPrompt(result: CollaborateSceneResult): string {
  if (result.intent === "chat") return "";
  return sceneAssistantFieldsToPrompt(result.fields)
    || result.detailedPrompt?.trim()
    || (result.directions?.length === 1 ? result.directions[0].prompt.trim() : "");
}

const DEFAULT_PROMPT_HEIGHT = 80;

const PROMPT_PARENT_SYNC_DELAY_MS = 250;

interface EditTargetInfo {
  dataUrl: string;
  path: string;
}

interface TemplatePreviewLightbox {
  src: string;
  sourceRect: { left: number; top: number; width: number; height: number };
}

interface TemplatePromptPreview {
  sceneId: string;
  prompt: string;
  referenceSignature: string;
}

interface UiDesignBriefPreview {
  signature: string;
  brief: UiDesignBrief;
}

const UI_MATERIAL_ROLES: UiMaterialRole[] = [
  "prd",
  "wireframe",
  "visual",
  "brand",
  "content",
  "reference"
];
const UI_MATERIAL_ROLE_MESSAGE_KEYS: Record<UiMaterialRole, MessageKey> = {
  prd: "prompt.uiDesign.role.prd",
  wireframe: "prompt.uiDesign.role.wireframe",
  visual: "prompt.uiDesign.role.visual",
  brand: "prompt.uiDesign.role.brand",
  content: "prompt.uiDesign.role.content",
  reference: "prompt.uiDesign.role.reference"
};

export interface AssistantGenerationRequest {
  prompt: string;
  count: number;
  preservePrompt?: boolean;
  mediaType?: CollaborateSceneResult["mediaType"];
  videoSettings?: CollaborateSceneResult["videoSettings"];
  prepareOnly?: boolean;
}

function buildAssistantOpeningInstruction(surface: AssistantSurface): string {
  if (surface === "canvas-edit") {
    return "这是用户打开图片编辑助手时已经存在的编辑上下文。第一张参考图是当前正在编辑的目标图，后续参考图仅用于辅助判断。先判断现有编辑目标是否明确：明确时用 2 到 3 句自然、简短的话概括目标图与编辑重点，并给出不超过 3 条局部、可控的可选方向，不要提问；只有缺少修改对象或期望结果、确实无法继续时，才询问一个最关键的问题。不要按重新生成新图的方式扩写，不要直接返回可应用内容或确认框。";
  }
  return "这是用户打开画板助手时已经存在的创作上下文。若当前字段中存在“当前模板”，它是本次创作必须遵守的规则；请把模板、当前提示词和参考图结合起来理解。先判断用户更可能是在继续创作、调整现有内容、探索方向还是仅查看建议。用 2 到 3 句自然、简短的话说明你对当前上下文的具体理解；上下文足够时给出不超过 3 个有针对性的下一步方向，不要提问，只有缺少核心主体或任务类型、确实无法给出可用建议时才问一个问题。不要显示系统字段，不要假设广告、电商或营销用途，不要直接返回可应用内容或确认框。";
}

function buildAssistantIdlePromptInstruction(surface: AssistantSurface): string {
  if (surface === "canvas-edit") {
    return "用户已经停顿了一会儿但还没有提交编辑。请结合当前编辑目标、提示词和辅助参考图，简短说明你理解的修改意图，并给出不超过 3 条局部、可控的优化建议。不要改动未提及区域，不要自动应用提示词或发起生成。";
  }
  return "用户已经停顿了一会儿但还没有提交生成。请结合当前模板（如有）、提示词和参考图，用 2 到 3 句简短的话确认你理解的画面，并给出不超过 3 条真正有帮助的完善方向。不要假设广告、电商等用途，不要自动改写提示词或发起生成。";
}

interface PromptDockProps {
  boardId: string;
  boardNameById?: ReadonlyMap<string, string>;
  input: GenerateImageInput;
  scenes: SceneDefinition[];
  favoriteSceneIds: string[];
  activeCount: number;
  queuedCount?: number;
  canGenerate: boolean;
  generateButtonStyle: GenerateButtonStyle;
  /** Provider 未配置或未保存 API Key：生成按钮转为"去配置"引导，而不是禁用。 */
  needsProviderSetup: boolean;
  providerBlocksGenerateReferences: boolean;
  /** 已保存的 provider 列表与当前激活项，供输入框内切换。 */
  providers: ProviderConfig[];
  activeProviderId: string;
  /** 仅官方 Provider 传入；自定义 Provider 必须为 null，避免残留 Credit UI。 */
  creditStatus: CreditStatus | null;
  creditLoading: boolean;
  officialRequiredCredits: number;
  onSelectProvider: (id: string, model?: string) => void;
  comicDramaSnapshot?: ComicDramaBoardSnapshot | null;
  comicDramaSelectedNodeIds?: string[];
  onApplyComicDramaPlan?: (plan: BoardMutationPlan) => Promise<void>;
  /** 右侧轨道（历史、评论或图片详情）打开时，为底部 Dock 与 AI 助手预留空间。 */
  rightRailOpen: boolean;
  autoCollapse: boolean;
  boardSmartSuggestionsEnabled: boolean;
  assistantEnabled: boolean;
  assistantAgentModeEnabled?: boolean;
  assistantAwarenessEnabled: boolean;
  assistantIntentSuggestionsEnabled: boolean;
  assistantIntentSuggestionCount: AssistantIntentSuggestionCount;
  editSmartSuggestionsEnabled: boolean;
  memoryEnabled: boolean;
  memoryUsageLevel: MemoryUsageLevel;
  /** 非空表示处于图片编辑会话：dock 过渡为编辑模式。 */
  editTarget: EditTargetInfo | null;
  /** 当前画板上可选作参考图的图片（供"从画布选择"选择器）。 */
  boardImages: GeneratedImage[];
  /** 是否正在读取编辑目标并生成修改建议。 */
  suggestingEdits: boolean;
  suggestedEdits: string[];
  canSuggestEdits: boolean;
  supportsPromptEnhancement: boolean;
  /** 文本能力不可用的具体原因；只有 unconfigured 应引导用户打开设置。 */
  promptEnhancementUnavailableReason?: TextProviderReadinessStatus;
  promptEnhancementUnavailableMessage?: string;
  /** 仅在画板位于前景、没有模态界面时响应 AI 助手快捷键。 */
  assistantShortcutEnabled: boolean;
  /** 智能辅助（官方 Provider 按次扣 Credit）结束后回调，用于刷新余额显示。 */
  onAssistantCreditsUsed?: () => void;
  onExitEdit: () => void;
  onOpenAdvancedEdit: () => void;
  onApplyScene: (scene: SceneDefinition) => void;
  onToggleFavoriteScene: (id: string) => void;
  onSaveScene: (input: NewSceneInput) => SceneDefinition | void;
  onResolveTemplatePrompt: (
    scene: SceneDefinition,
    request: string,
    referenceImages: SceneAssistantReference[]
  ) => Promise<string>;
  onResolveUiDesignBrief: (
    request: string,
    materials: ReferenceImagePayload[],
    scene: SceneDefinition | null
  ) => Promise<UiDesignBrief>;
  onOpenSceneLibrary: () => void;
  onPromptChange: (prompt: string) => void;
  onApplySuggestedEdit: (prompt: string) => void;
  onRegenerateSuggestedEdits: () => void;
  onInputChange: (patch: Partial<GenerateImageInput>) => void;
  onReferenceFiles: (files: FileList | null) => void;
  onPasteCanvasReferences: (images: GeneratedImage[]) => void;
  onPasteImages: (files: File[]) => void;
  onAddCanvasReference: (image: GeneratedImage) => void;
  onRemoveReference: (id: string) => void;
  onGenerate: (
    sourceRect: { left: number; top: number; width: number; height: number } | undefined,
    prompt: string
  ) => void;
  onGeneratePrompts: (requests: AssistantGenerationRequest[], assistantConversationId?: string) => Promise<string | null> | void;
  /** 从全部画板历史恢复时，先导航到会话所属画板。 */
  onOpenAssistantConversation?: (conversationId: string, boardId?: string) => void;
  /** 外部从图片详情恢复指定 AI 助手绘画记录。 */
  assistantConversationRequest?: { conversationId: string; nonce: number } | null;
  onOpenSettings: () => void;
  onOpenModelManagement: () => void;
  onAssistantDockLayoutChange?: (
    layout: AssistantDockLayout | null
  ) => Promise<AssistantDockLayout | null>;
  promptFocusNonce?: number;
  onPromptFocusChange?: (focused: boolean) => void;
}

export function PromptDock({
  boardId,
  boardNameById,
  input,
  scenes,
  favoriteSceneIds,
  activeCount,

  canGenerate,
  generateButtonStyle,
  needsProviderSetup,

  providers,
  activeProviderId,
  creditStatus,
  creditLoading,
  officialRequiredCredits,
  onSelectProvider,
  comicDramaSnapshot = null,
  comicDramaSelectedNodeIds = [],
  onApplyComicDramaPlan,
  rightRailOpen,

  assistantEnabled,
  assistantAgentModeEnabled = false,
  assistantAwarenessEnabled,
  assistantIntentSuggestionsEnabled,
  assistantIntentSuggestionCount,
  editSmartSuggestionsEnabled,
  memoryEnabled,
  memoryUsageLevel,
  editTarget,
  boardImages,
  suggestingEdits,
  suggestedEdits,
  canSuggestEdits,
  supportsPromptEnhancement,
  promptEnhancementUnavailableReason,
  promptEnhancementUnavailableMessage,
  assistantShortcutEnabled,
  onAssistantCreditsUsed,
  onExitEdit,
  onOpenAdvancedEdit,
  onApplyScene,
  onToggleFavoriteScene,
  onSaveScene,
  onResolveTemplatePrompt,
  onResolveUiDesignBrief,
  onOpenSceneLibrary,
  onPromptChange,
  onApplySuggestedEdit,
  onRegenerateSuggestedEdits,
  onInputChange,
  onReferenceFiles,
  onPasteCanvasReferences,
  onPasteImages,
  onAddCanvasReference,
  onRemoveReference,
  onGenerate,
  onGeneratePrompts,
  onOpenAssistantConversation,
  assistantConversationRequest,
  onOpenSettings,
  onOpenModelManagement,
  onAssistantDockLayoutChange,
  promptFocusNonce,
  onPromptFocusChange
}: PromptDockProps): React.ReactElement {

  const uiText = useUiText();

  const { locale, t } = useI18n();
  const [promptHeight, setPromptHeight] = useState(DEFAULT_PROMPT_HEIGHT);
  const [maxPromptHeight, setMaxPromptHeight] = useState(360);
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(assistantEnabled && !comicDramaSnapshot);
  const [fusionPromptContext, setFusionPromptContext] = useState<string | null>(null);
  const autoOpenedComicBoardRef = useRef<string | undefined>(undefined);
  const assistantSession = useAssistantSessionState();
  const {

    setAssistantHasUnreadResult,
    assistantValue,
    setAssistantValue,
    assistantStreaming,
    setAssistantStreaming,
    assistantActivity,
    setAssistantActivity,
    assistantIntentSuggestions,
    setAssistantIntentSuggestions,
    assistantIntentSuggestionsLoading,
    setAssistantIntentSuggestionsLoading,

    setMemorySuggestions,
    assistantMessages,
    setAssistantMessages,
    assistantConversationId,
    setAssistantConversationId,
    assistantInteraction,
    setAssistantInteraction,
    assistantStreamRef,
    assistantBackgroundRequestRef,
    assistantRequestVersionRef,
    assistantIntentSuggestionRequestRef,
    assistantIntentSuggestionHistoryRef,
    assistantApplyTimerRef,
    assistantAutoPromptTimerRef,
    assistantReferenceSignatureRef,
    assistantAnalyzedContextSignatureRef,
    assistantSubmittedContextSignatureRef,
    pendingAssistantReferenceCountRef,
    assistantPreviousGenerationPromptRef,
    assistantClarificationRoundsRef,
    sendAssistantInstructionRef,
    requestAssistantIntentSuggestionsRef,
    assistantBranchSignatureRef
  } = assistantSession;

  const [templateResolving, setTemplateResolving] = useState(false);
  const [templatePromptPreview, setTemplatePromptPreview] = useState<TemplatePromptPreview | null>(null);
  const [uiBriefResolving, setUiBriefResolving] = useState(false);
  const [uiBriefPreview, setUiBriefPreview] = useState<UiDesignBriefPreview | null>(null);
  const [templateMedia, setTemplateMedia] = useState<SceneMediaSummary | undefined>();
  const [templateMediaLoading, setTemplateMediaLoading] = useState(false);
  const [templateMediaError, setTemplateMediaError] = useState(false);
  const [templateMediaReloadNonce, setTemplateMediaReloadNonce] = useState(0);
  const [templatePreviewLightbox, setTemplatePreviewLightbox] = useState<TemplatePreviewLightbox | null>(null);

  const [suggestedEditsExpanded, setSuggestedEditsExpanded] = useState(false);

  const promptEditorRef = useRef<HTMLDivElement>(null);
  const assistantFileInputRef = useRef<HTMLInputElement>(null);

  const assistantOpenRef = useRef(false);
  const comicDramaSnapshotRef = useRef(comicDramaSnapshot);

  useEffect(() => {
    // Recover an orphaned progress label without unlocking a live request or
    // an application/generation action that is still scheduled.
    if (assistantActivity && !assistantStreaming &&
      assistantStreamRef.current === null && assistantApplyTimerRef.current === null) {
      setAssistantActivity(null);
    }
  }, [assistantActivity, assistantApplyTimerRef, assistantStreamRef, assistantStreaming, setAssistantActivity]);
  const assistantPreviousFocusRef = useRef<HTMLElement | null>(null);
  const assistantShortcutActionRef = useRef<() => void>(() => { });
  const promptSyncTimerRef = useRef<number | null>(null);

  const promptDraftRef = useRef(input.prompt);
  const parentPromptRef = useRef(input.prompt);
  const pendingParentPromptRef = useRef<string | null>(null);

  /** 最近一次从输入框真正提交生成的提示词，供“下一集/继续”在输入框清空后延续。 */

  const reduceMotion = useReducedMotion();

  assistantOpenRef.current = assistantOpen;
  comicDramaSnapshotRef.current = comicDramaSnapshot;
  parentPromptRef.current = input.prompt;
  const promptDraft = input.prompt;

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];
  const maxImageCount = getProviderMaxImageCount(activeProvider);
  const creationMode: CreationMode = input.creationMode ?? "general";
  const isUiDesignMode = creationMode === "ui-design" && input.workflowMode === "generate" && editTarget === null;
  const assistantAvailable = assistantEnabled;
  // 漫剧子画板拥有独立的 ComicDramaWorkspace 助手。主画板上的入口卡片
  // 仍使用通用创作助手，避免把漫剧阶段引导和普通画布创作混在一起。
  const comicDramaActive: boolean = false;
  const assistantSurface: AssistantSurface = editTarget ? "canvas-edit" : comicDramaActive ? "comic-drama" : "canvas-prompt";
  const {
    setAssistantOffset,
    fusionAnchor,
    assistantDockSide,
    setAssistantDockSide,
    assistantDockCollapsed,
    setAssistantDockCollapsed,
    assistantDockPreview,
    assistantDragging,
    assistantSize,
    assistantPanelRef,
    assistantExpandButtonRef,
    restoreAssistantDockPreference,
    startAssistantDrag,
    startAssistantResize,
    startAssistantDockResize,
    resizeAssistantDock,
    endAssistantDockResize,
    cancelAssistantDockResize,
    handleAssistantDockResizeKeyDown,
    resizeAssistant,
    endAssistantResize,
    assistantDockWidth,
    collapseDockedAssistant,
    expandDockedAssistant
  } = useAssistantPanelLayout({ boardId, assistantSurface, assistantOpen, assistantAvailable, rightRailOpen, setAssistantOpen, onAssistantDockLayoutChange });
  const {
    setAssistantHistory,
    assistantHistory,
    assistantHistoryLoading,
    assistantHistoryScope,
    loadAssistantHistory,
    restoreAssistantConversation,
    selectAssistantHistory,
    changeAssistantHistoryScope
  } = useAssistantHistory({ session: assistantSession, boardId, boardNameById, assistantSurface, assetPath: editTarget?.path, onOpenAssistantConversation });
  // Effect lifetimes depend on context; action implementations read the latest render.
  const assistantEffectActionsRef = useRef({ clearAssistantAutoPromptTimer, cancelBackgroundAssistantRequest, restoreAssistantConversation, stopAssistant });
  assistantEffectActionsRef.current = { clearAssistantAutoPromptTimer, cancelBackgroundAssistantRequest, restoreAssistantConversation, stopAssistant };
  useEffect(() => {
    setAssistantOpen(assistantAvailable);
    setFusionPromptContext(null);
  }, [assistantAvailable, boardId, assistantSurface]);
  const { guide: comicDramaGuide, context: comicDramaContext } = useComicAssistantContext(
    comicDramaActive, comicDramaSnapshot, comicDramaSelectedNodeIds
  );
  useEffect(() => {
    if (!comicDramaActive || !comicDramaSnapshot || !comicDramaGuide) return;
    const guideId = `comic-guide:${comicDramaSnapshot.boardId}:${comicDramaGuide.stage}`;
    const shouldOpen = autoOpenedComicBoardRef.current !== comicDramaSnapshot.boardId;
    autoOpenedComicBoardRef.current = comicDramaSnapshot.boardId;
    if (shouldOpen) setAssistantOpen(true);
    setAssistantMessages((current) => current.some((message) => message.assistantContext === guideId)
      ? current
      : [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: comicDramaGuide.message,
        assistantContext: guideId
      }]);
    setAssistantIntentSuggestions(comicDramaGuide.suggestions);
  }, [comicDramaActive, comicDramaGuide, comicDramaSnapshot, setAssistantIntentSuggestions, setAssistantMessages]);
  const activeScene = useMemo(
    () => findSceneForMode(scenes, input.sceneId, input.workflowMode) ?? null,
    [input.sceneId, input.workflowMode, scenes]
  );
  // 模板规则也属于助手上下文：仅切换了模板时，提示词和参考图不变也要重新理解。
  const assistantTemplateSignature = activeScene
    ? `${activeScene.id}\u0000${activeScene.name}\u0000${activeScene.prompt}`
    : "";

  const assistantReferenceSignature = input.referenceImages.map((image) => image.id).join("|");
  const editTargetSignature = editTarget
    ? `${editTarget.path}\u0000${editTarget.dataUrl.length}:${editTarget.dataUrl.slice(-32)}`
    : "";
  const assistantOpeningContextSignature = [
    buildAssistantContextSignature({
      surface: assistantSurface,
      editTargetSignature,
      prompt: promptDraft,
      referenceSignature: assistantReferenceSignature,
      templateSignature: assistantTemplateSignature
    }),
    creationMode
  ].join("\u0000");
  const assistantBranchSignature = [
    boardId,
    assistantSurface,
    creationMode,
    editTargetSignature,
    assistantTemplateSignature
  ].join("\u0000");
  // 首次挂载也要恢复当前画板，而不是把已保存的会话当作新会话处理。

  const editTargetDataUrl = editTarget?.dataUrl;
  const assistantContextImages = useMemo<AiAssistantContextImage[]>(() => [
    ...(editTarget ? [{
      id: `edit-target:${editTarget.path}`,
      src: editTarget.dataUrl,
      alt: "当前编辑图片",
      role: "edit-target" as const
    }] : []),
    ...input.referenceImages.map((image) => ({
      id: image.id,
      src: `data:${image.mimeType};base64,${image.dataBase64}`,
      alt: image.name,
      role: "reference" as const,
      onRemove: () => onRemoveReference(image.id)
    }))
  ], [editTarget, input.referenceImages, onRemoveReference]);

  useEffect(() => {
    if (pendingParentPromptRef.current === input.prompt) {
      pendingParentPromptRef.current = null;
      return;
    }
    if (input.prompt === promptDraftRef.current) return;
    pendingParentPromptRef.current = null;
    if (promptSyncTimerRef.current !== null) {
      window.clearTimeout(promptSyncTimerRef.current);
      promptSyncTimerRef.current = null;
    }
    promptDraftRef.current = input.prompt;
  }, [input.prompt]);

  useEffect(() => {
    const draft = promptDraft.trim();
    if (!draft || !hasImageWorkbenchApi()) return;
    const timer = window.setTimeout(() => {
      void getImageWorkbenchApi().checkpointPromptDraft(draft, assistantSurface, {
        ...(boardId ? { boardId } : {}),
        ...(editTarget?.path ? { assetPath: editTarget.path } : {}),
        ...(input.sceneId ? { sceneId: input.sceneId } : {})
      }).catch(() => undefined);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [assistantSurface, boardId, editTarget?.path, input.sceneId, promptDraft]);
  useEffect(() => {
    if (!memoryEnabled || editTarget?.path || !hasImageWorkbenchApi()) {
      setMemorySuggestions([]);
      return;
    }
    let cancelled = false;
    void getImageWorkbenchApi().getMemorySuggestions(
      {
        ...(boardId ? { boardId } : {}),
        ...(input.sceneId ? { sceneId: input.sceneId } : {})
      },
      input.sceneId ? "模板 图片创作" : "图片生成 提示词"
    ).then((items) => {
      if (cancelled) return;
      setMemorySuggestions(items.filter((item) => (
        item.content.startsWith("最近实际使用的提示词：")
        || item.content.startsWith("最近正在构思：")
      )).slice(0, 2));
    }).catch(() => {
      if (!cancelled) setMemorySuggestions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, editTarget?.path, input.sceneId, memoryEnabled, memoryUsageLevel, setMemorySuggestions]);
  // 已引用的画布节点 id：选择器里据此显示"已加入 ✓"。
  const referencedNodeIds = new Set(
    input.referenceImages.map((image) => image.sourceNodeId).filter((id): id is string => Boolean(id))
  );
  const sceneTemplatePrompts = useMemo(
    () => scenes.filter((scene) => scene.mode === input.workflowMode).map((scene) => scene.prompt),
    [scenes, input.workflowMode]
  );
  const templatePromptPreviewReady = Boolean(
    !isUiDesignMode &&
    activeScene &&
    templatePromptPreview?.sceneId === activeScene.id &&
    templatePromptPreview.referenceSignature === assistantReferenceSignature &&
    templatePromptPreview.prompt.trim() === promptDraft.trim()
  );
  const uiBriefSignature = [
    promptDraft.trim(),
    activeScene?.id ?? "",
    ...input.referenceImages.map((image) => (
      `${image.id}:${image.semanticRole ?? inferUiMaterialRole(image.name)}`
    ))
  ].join("\u0000");
  const uiBriefReady = Boolean(
    isUiDesignMode &&
    uiBriefPreview?.signature === uiBriefSignature &&
    uiBriefPreview.brief.generationPrompt.trim()
  );
  const templatePreviewImages = useMemo(
    () => activeScene ? getScenePreviewImages(activeScene, templateMedia) : [],
    [activeScene, templateMedia]
  );

  const structuredLineCount = input.sceneId ? promptDraft.split("\n").length : 1;
  const structuredPromptHeight = Math.min(
    maxPromptHeight,
    Math.max(DEFAULT_PROMPT_HEIGHT, structuredLineCount * 32 + 8)
  );
  const visiblePromptHeight = promptHeight;
  const templateNeedsProviderSetup = Boolean(activeScene && !supportsPromptEnhancement);
  const uiBriefNeedsProviderSetup = isUiDesignMode && !supportsPromptEnhancement;
  // 首次生成后原始输入会被清空；此时采用助手更新的有效 Brief 仍可作为生成来源。
  const hasUiDesignInput = promptDraft.trim().length > 0 || input.referenceImages.length > 0 || uiBriefReady;
  const canSubmit = canGenerate
    && (isUiDesignMode ? hasUiDesignInput : promptDraft.trim().length > 0)
    && !templateNeedsProviderSetup
    && !uiBriefNeedsProviderSetup
    && !templateResolving
    && !uiBriefResolving;
  const uiGenerateActionLabel = uiBriefResolving
    ? t("prompt.uiDesign.brief.loadingShort")
    : uiBriefReady
      ? t("prompt.uiDesign.brief.confirmGenerate")
      : uiBriefPreview
        ? t("prompt.uiDesign.brief.update")
        : t("prompt.uiDesign.brief.prepare");

  useEffect(() => {
    const sceneId = activeScene?.id;
    setTemplateMedia(undefined);
    setTemplateMediaError(false);
    setTemplatePreviewLightbox(null);
    if (!sceneId || !hasImageWorkbenchApi()) {
      setTemplateMediaLoading(false);
      return;
    }

    let cancelled = false;
    setTemplateMediaLoading(true);
    void getImageWorkbenchApi().listSceneMedia().then((summaries) => {
      if (cancelled) return;
      setTemplateMedia(summaries.find((summary) => summary.sceneId === sceneId));
    }).catch(() => {
      if (!cancelled) setTemplateMediaError(true);
    }).finally(() => {
      if (!cancelled) setTemplateMediaLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, templateMediaReloadNonce]);

  useEffect(() => {
    setTemplatePromptPreview((current) => (
      current && current.sceneId === activeScene?.id ? current : null
    ));
  }, [activeScene?.id]);

  useEffect(() => {
    const normalized = Math.min(maxImageCount, Math.max(1, Math.trunc(input.n) || 1));
    if (normalized !== input.n) onInputChange({ n: normalized });
  }, [input.n, maxImageCount, onInputChange]);

  function clearPromptSyncTimer(): void {
    if (promptSyncTimerRef.current === null) return;
    window.clearTimeout(promptSyncTimerRef.current);
    promptSyncTimerRef.current = null;
  }

  function clearAssistantAutoPromptTimer(): void {
    if (assistantAutoPromptTimerRef.current === null) return;
    window.clearTimeout(assistantAutoPromptTimerRef.current);
    assistantAutoPromptTimerRef.current = null;
  }

  function cancelBackgroundAssistantRequest(): void {
    if (!assistantBackgroundRequestRef.current) return;
    assistantRequestVersionRef.current += 1;
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    assistantBackgroundRequestRef.current = false;
    setAssistantStreaming(false);
    setAssistantMessages((current) => current.filter((message) => !message.streaming));
  }

  function syncPromptToParent(prompt = promptDraftRef.current): void {
    clearPromptSyncTimer();
    if (parentPromptRef.current === prompt) return;
    parentPromptRef.current = prompt;
    pendingParentPromptRef.current = prompt;
    onPromptChange(prompt);
  }

  // Pass the text's on-screen rect so the generate flow can launch the particle burst from it.
  async function handleSubmit(): Promise<void> {
    const currentPrompt = promptDraftRef.current;
    clearAssistantAutoPromptTimer();
    cancelBackgroundAssistantRequest();
    syncPromptToParent(currentPrompt);
    let promptToGenerate = currentPrompt.trim();
    if (isUiDesignMode && !uiBriefReady) {
      setUiBriefResolving(true);
      try {
        const materials = input.referenceImages.map((image) => ({
          ...image,
          semanticRole: image.semanticRole ?? inferUiMaterialRole(image.name)
        }));
        const brief = await onResolveUiDesignBrief(promptToGenerate, materials, activeScene);
        if (!brief.generationPrompt.trim()) {
          throw new Error(t("prompt.uiDesign.brief.empty"));
        }
        setUiBriefPreview({ signature: uiBriefSignature, brief });
        openUiDesignAssistant(brief);
        toast.success(t("prompt.uiDesign.brief.readyToast"));
      } catch (error) {
        toast.error(getWorkbenchErrorMessage(error, t("prompt.uiDesign.brief.error")));
      } finally {
        setUiBriefResolving(false);
      }
      return;
    }
    if (isUiDesignMode && uiBriefPreview) {
      promptToGenerate = uiBriefPreview.brief.generationPrompt.trim();
    }
    const hasCurrentTemplatePreview = Boolean(
      activeScene &&
      templatePromptPreview?.sceneId === activeScene.id &&
      templatePromptPreview.referenceSignature === assistantReferenceSignature &&
      templatePromptPreview.prompt.trim() === promptToGenerate
    );
    if (activeScene && !isUiDesignMode && !hasCurrentTemplatePreview) {
      setTemplateResolving(true);
      try {
        const referenceImages = input.referenceImages.slice(0, 4).map(({ name, mimeType, dataBase64 }) => ({
          name,
          mimeType,
          dataBase64
        }));
        const previewPrompt = (await onResolveTemplatePrompt(activeScene, promptToGenerate, referenceImages)).trim();
        if (!previewPrompt) throw new Error("AI 没有返回可用的模板提示词，请调整需求后重试。");
        promptDraftRef.current = previewPrompt;
        parentPromptRef.current = previewPrompt;
        pendingParentPromptRef.current = previewPrompt;
        onInputChange({ prompt: previewPrompt });
        setTemplatePromptPreview({
          sceneId: activeScene.id,
          prompt: previewPrompt,
          referenceSignature: assistantReferenceSignature
        });
        assistantAnalyzedContextSignatureRef.current = buildAssistantContextSignature({
          surface: assistantSurface,
          editTargetSignature,
          prompt: previewPrompt,
          referenceSignature: assistantReferenceSignature,
          templateSignature: assistantTemplateSignature
        });
        setPromptHeight(Math.min(maxPromptHeight, Math.max(DEFAULT_PROMPT_HEIGHT, previewPrompt.split("\n").length * 32 + 8)));
        setAssistantMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `已结合「${activeScene.name}」${referenceImages.length > 0 ? `和 ${referenceImages.length} 张参考图` : ""}生成${editTarget ? "编辑指令" : "提示词"}预览。你可以确认${editTarget ? "应用" : "生成"}，也可以继续告诉我怎么调整。`
          }
        ]);
        toast.success(editTarget ? translateSourceText("编辑指令预览已生成，确认后才会应用") : translateSourceText("提示词预览已生成，确认后才会出图"));
      } catch (error) {
        toast.error(getWorkbenchErrorMessage(error, "暂时无法套用模板，请稍后重试。"));
      } finally {
        setTemplateResolving(false);
      }
      return;
    }
    assistantSubmittedContextSignatureRef.current = buildAssistantContextSignature({
      surface: assistantSurface,
      editTargetSignature,
      prompt: promptToGenerate,
      referenceSignature: assistantReferenceSignature,
      templateSignature: assistantTemplateSignature
    });
    if (assistantSurface === "canvas-prompt" && promptToGenerate) {
      assistantPreviousGenerationPromptRef.current = promptToGenerate;
    }
    const el = promptEditorRef.current;
    if (el && promptToGenerate) {
      const rect = el.getBoundingClientRect();
      const padX = 8;
      const padY = 6;
      onGenerate({
        left: rect.left + padX,
        top: rect.top + padY,
        width: Math.max(1, rect.width - padX * 2),
        height: Math.max(1, rect.height - padY * 2)
      }, promptToGenerate);
    } else {
      onGenerate(undefined, promptToGenerate);
    }
    if (isUiDesignMode) setUiBriefPreview(null);
    // Reset the shared direct editor height after submission.
    setPromptHeight(DEFAULT_PROMPT_HEIGHT);
  }

  useEffect(() => {
    function recompute(): void {
      setMaxPromptHeight(Math.max(160, Math.min(360, Math.round(window.innerHeight * 0.42))));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  useEffect(() => () => {
    if (promptSyncTimerRef.current !== null) window.clearTimeout(promptSyncTimerRef.current);
  }, []);

  useEffect(() => {
    sendAssistantInstructionRef.current = sendAssistantInstruction;
    requestAssistantIntentSuggestionsRef.current = requestAssistantIntentSuggestions;
  });

  useEffect(() => {
    if (assistantIntentSuggestionsEnabled || assistantSurface === "comic-drama") return;
    assistantIntentSuggestionRequestRef.current += 1;
    assistantIntentSuggestionHistoryRef.current = [];
    setAssistantIntentSuggestions([]);
    setAssistantIntentSuggestionsLoading(false);
  }, [
    assistantIntentSuggestionHistoryRef,
    assistantIntentSuggestionRequestRef,
    assistantIntentSuggestionsEnabled,
    assistantSurface,
    setAssistantIntentSuggestions,
    setAssistantIntentSuggestionsLoading
  ]);

  useEffect(() => {
    if (assistantEnabled && assistantAwarenessEnabled) return;
    assistantEffectActionsRef.current.clearAssistantAutoPromptTimer();
    pendingAssistantReferenceCountRef.current = 0;
    assistantEffectActionsRef.current.cancelBackgroundAssistantRequest();
  }, [assistantAwarenessEnabled, assistantEnabled, pendingAssistantReferenceCountRef]);

  const assistantIntentRefreshKey = `${assistantConversationId}:${assistantMessages.at(-1)?.id ?? "opening"}`;
  const assistantIntentAttemptedKeyRef = useRef<string | null>(null);
  // Refresh once per settled turn. Stream deltas and composer edits must not
  // keep replacing suggestions; a busy opening must retry once it becomes idle.
  useEffect(() => {
    if (
      !assistantOpen ||
      assistantSurface === "comic-drama" ||
      !assistantIntentSuggestionsEnabled ||
      !supportsPromptEnhancement ||
      assistantStreaming || assistantActivity || assistantInteraction ||
      assistantIntentAttemptedKeyRef.current === assistantIntentRefreshKey
    ) return;
    const timer = window.setTimeout(() => {
      assistantIntentAttemptedKeyRef.current = assistantIntentRefreshKey;
      void requestAssistantIntentSuggestionsRef.current();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    assistantIntentSuggestionsEnabled,
    assistantOpen,
    assistantSurface,
    assistantIntentRefreshKey,
    assistantStreaming,
    assistantActivity,
    assistantInteraction,
    requestAssistantIntentSuggestionsRef,
    supportsPromptEnhancement
  ]);

  const assistantOpeningReadinessRef = useRef({ assistantEnabled, assistantAwarenessEnabled, supportsPromptEnhancement, assistantOpeningContextSignature });
  assistantOpeningReadinessRef.current = { assistantEnabled, assistantAwarenessEnabled, supportsPromptEnhancement, assistantOpeningContextSignature };
  useAssistantBranchLifecycle(assistantBranchSignature, boardId, (shouldRestoreBoardConversation) => {
    assistantBranchSignatureRef.current = assistantBranchSignature;
    // 只有首次进入或切换画板时恢复会话。同一画板的模板、模式等上下文变化
    // 仍按原有语义开启新的助手分支，不能意外跳回旧对话。
    assistantRequestVersionRef.current += 1;
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    assistantAnalyzedContextSignatureRef.current = "";
    pendingAssistantReferenceCountRef.current = 0;
    assistantPreviousGenerationPromptRef.current = "";
    assistantClarificationRoundsRef.current = 0;
    assistantIntentSuggestionHistoryRef.current = [];
    assistantSubmittedContextSignatureRef.current = "";
    setAssistantConversationId(crypto.randomUUID());
    setAssistantHistory([]);
    setAssistantMessages([]);
    setAssistantInteraction(null);
    setAssistantValue("");
    setAssistantStreaming(false);
    setAssistantActivity(null);
    setAssistantHasUnreadResult(false);

    if (assistantSurface === "comic-drama" && comicDramaSnapshot && comicDramaGuide) {
      setAssistantMessages([{
        id: crypto.randomUUID(),
        role: "assistant",
        content: comicDramaGuide.message,
        assistantContext: `comic-guide:${comicDramaSnapshot.boardId}:${comicDramaGuide.stage}`
      }]);
      setAssistantIntentSuggestions(comicDramaGuide.suggestions);
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    const requestVersion = assistantRequestVersionRef.current;
    const startOpeningAnalysis = (): void => {
      const readiness = assistantOpeningReadinessRef.current;
      if (!readiness.assistantEnabled || !readiness.assistantAwarenessEnabled || !readiness.supportsPromptEnhancement) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled || assistantRequestVersionRef.current !== requestVersion) return;
        assistantAnalyzedContextSignatureRef.current = readiness.assistantOpeningContextSignature;
        void sendAssistantInstructionRef.current(
          buildAssistantOpeningInstruction(assistantSurface),
          "",
          false,
          false,
          true
        );
      });
    };

    if (!shouldRestoreBoardConversation || !hasImageWorkbenchApi()) {
      startOpeningAnalysis();
      return () => {
        cancelled = true;
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }

    void getImageWorkbenchApi().listAssistantConversations({
      ...(boardId ? { boardId } : {}),
      surface: assistantSurface,
      ...(editTarget?.path ? { assetPath: editTarget.path } : {})
    }).then((records) => {
      if (
        cancelled
        || assistantBranchSignatureRef.current !== assistantBranchSignature
        || assistantRequestVersionRef.current !== requestVersion
      ) return;

      const history = buildAssistantHistory(records);
      const latestConversation = getLatestAssistantConversation(records);
      if (latestConversation) {
        setAssistantHistory(history);
        assistantEffectActionsRef.current.restoreAssistantConversation(latestConversation);
        return;
      }

      startOpeningAnalysis();
    }).catch(() => {
      // 历史读取失败时仍保留新会话与既有的上下文分析能力。
      startOpeningAnalysis();
    });

    return () => {
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  });

  useEffect(() => {
    const previousSignature = assistantReferenceSignatureRef.current;
    assistantReferenceSignatureRef.current = assistantReferenceSignature;
    if (previousSignature === assistantReferenceSignature) return;
    if (!assistantEnabled || !assistantAwarenessEnabled) {
      pendingAssistantReferenceCountRef.current = 0;
      return;
    }

    const previousIds = new Set(previousSignature.split("|").filter(Boolean));
    const addedCount = input.referenceImages.filter((image) => !previousIds.has(image.id)).length;
    if (addedCount > 0) {
      pendingAssistantReferenceCountRef.current += addedCount;
      assistantEffectActionsRef.current.cancelBackgroundAssistantRequest();
    }
  }, [
    assistantAwarenessEnabled,
    assistantEnabled,
    assistantReferenceSignature,
    assistantReferenceSignatureRef,
    input.referenceImages,
    pendingAssistantReferenceCountRef
  ]);

  useEffect(() => {
    if (
      !assistantEnabled ||
      !assistantAwarenessEnabled ||
      !supportsPromptEnhancement ||
      assistantStreaming ||
      assistantActivity
    ) return;
    const addedCount = pendingAssistantReferenceCountRef.current;
    if (addedCount === 0) return;
    pendingAssistantReferenceCountRef.current = 0;
    assistantAnalyzedContextSignatureRef.current = assistantOpeningContextSignature;
    void sendAssistantInstructionRef.current(
      assistantSurface === "canvas-edit"
        ? `我刚为当前编辑任务添加了 ${addedCount} 张辅助参考图。请始终以第一张目标图为主，识别新增引用中真正可借鉴的细节，并给出 2 到 3 条不会破坏目标图主体、构图和未提及区域的编辑建议。不要把辅助参考图误认为新的编辑目标。`
        : `我刚添加了 ${addedCount} 张参考图。请先识别新增引用的主体、风格和构图，并给出 2 到 3 条简短、可执行的通用建议。不要根据系统默认值推断广告、电商或其他具体用途；如果当前提示词为空且必须确认意图，只询问我想如何使用参考图，并提供延续风格、保留主体、参考构图、组合元素等中性选项。`,
      `已添加 ${addedCount} 张参考图`,
      false,
      false,
      true
    );
  }, [
    assistantActivity,
    assistantAwarenessEnabled,
    assistantEnabled,
    assistantOpeningContextSignature,
    assistantReferenceSignature,
    assistantSurface,
    assistantStreaming,
    supportsPromptEnhancement,
    pendingAssistantReferenceCountRef,
    assistantAnalyzedContextSignatureRef,
    sendAssistantInstructionRef
  ]);

  useEffect(() => {
    assistantEffectActionsRef.current.clearAssistantAutoPromptTimer();
    const currentPrompt = promptDraft.trim();
    if (
      !assistantEnabled ||
      !assistantAwarenessEnabled ||
      !supportsPromptEnhancement ||
      !currentPrompt ||
      assistantActivity
    ) return;
    if (assistantBackgroundRequestRef.current && assistantStreaming) {
      assistantEffectActionsRef.current.cancelBackgroundAssistantRequest();
      return;
    }
    if (assistantStreaming) return;
    if (!shouldScheduleAssistantPromptAnalysis({
      supportsPromptEnhancement,
      prompt: currentPrompt,
      working: assistantStreaming || Boolean(assistantActivity),
      contextSignature: assistantOpeningContextSignature,
      analyzedContextSignature: assistantAnalyzedContextSignatureRef.current,
      submittedContextSignature: assistantSubmittedContextSignatureRef.current
    })) return;

    const contextSignature = assistantOpeningContextSignature;
    assistantAutoPromptTimerRef.current = window.setTimeout(() => {
      assistantAutoPromptTimerRef.current = null;
      if (
        assistantAnalyzedContextSignatureRef.current === contextSignature
        || assistantSubmittedContextSignatureRef.current === contextSignature
      ) return;
      assistantAnalyzedContextSignatureRef.current = contextSignature;
      void sendAssistantInstructionRef.current(
        buildAssistantIdlePromptInstruction(assistantSurface),
        "",
        false,
        false,
        true
      );
    }, ASSISTANT_PROMPT_IDLE_MS);
    return assistantEffectActionsRef.current.clearAssistantAutoPromptTimer;
  }, [
    assistantActivity,
    assistantAnalyzedContextSignatureRef,
    assistantAutoPromptTimerRef,
    assistantAwarenessEnabled,
    assistantBackgroundRequestRef,
    assistantEnabled,
    assistantOpeningContextSignature,
    assistantStreaming,
    assistantSubmittedContextSignatureRef,
    assistantSurface,
    promptDraft,
    sendAssistantInstructionRef,
    supportsPromptEnhancement
  ]);

  useEffect(() => {
    if (!input.sceneId || structuredLineCount <= 1) return;
    setPromptHeight(structuredPromptHeight);
  }, [input.sceneId, structuredLineCount, structuredPromptHeight]);

  useEffect(() => {
    if (!promptFocusNonce) return;
    const frame = window.requestAnimationFrame(() => {
      const target = promptEditorRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "textarea, [data-structured-field-content]"
      );
      if (!target) return;
      target.focus();
      const end = target.value.length;
      target.setSelectionRange(end, end);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [promptFocusNonce]);

  useEffect(() => {
    setSuggestedEditsExpanded(false);
  }, [editTargetDataUrl]);

  useEffect(() => {
    if (suggestedEdits.length > 0) setSuggestedEditsExpanded(true);
  }, [suggestedEdits]);

  function handlePromptFocus(): void {
    onPromptFocusChange?.(true);
    if (input.sceneId && structuredLineCount > 1 && promptHeight < structuredPromptHeight) {
      setPromptHeight(structuredPromptHeight);
    }
  }

  function handlePromptChange(prompt: string): void {
    promptDraftRef.current = prompt;
    setTemplatePromptPreview((current) => current ? { ...current, prompt } : current);
    setUiBriefPreview(null);
    clearPromptSyncTimer();
    promptSyncTimerRef.current = window.setTimeout(() => {
      promptSyncTimerRef.current = null;
      syncPromptToParent(prompt);
    }, PROMPT_PARENT_SYNC_DELAY_MS);
    if (prompt.length === 0) setPromptHeight(DEFAULT_PROMPT_HEIGHT);
  }

  function changeCreationMode(next: CreationMode): void {
    if (next === creationMode) return;
    setUiBriefPreview(null);
    setTemplatePromptPreview(null);
    onInputChange({
      creationMode: next,
      referenceImages: next === "ui-design"
        ? input.referenceImages.map((image) => ({
          ...image,
          semanticRole: image.semanticRole ?? inferUiMaterialRole(image.name)
        }))
        : input.referenceImages
    });
  }

  function changeUiMaterialRole(id: string, semanticRole: UiMaterialRole): void {
    setUiBriefPreview(null);
    onInputChange({
      referenceImages: input.referenceImages.map((image) => (
        image.id === id ? { ...image, semanticRole } : image
      ))
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (!isSendEnter(event)) return;
    event.preventDefault();
    if (canSubmit) void handleSubmit();
    else if (needsProviderSetup || templateNeedsProviderSetup || uiBriefNeedsProviderSetup) onOpenSettings();
  }

  function openUiDesignAssistant(brief = uiBriefPreview?.brief ?? null): void {
    if (!assistantAvailable) return;
    assistantPreviousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    assistantReferenceSignatureRef.current = assistantReferenceSignature;
    pendingAssistantReferenceCountRef.current = 0;
    setAssistantOffset({ x: 0, y: 0 });
    setAssistantHasUnreadResult(false);
    restoreAssistantDockPreference();
    setAssistantOpen(true);
    setAssistantMessages((current) => {
      const greeting = buildUiDesignAssistantGreeting(brief, input.referenceImages.length, locale);
      const lastMessage = current.at(-1);
      if (lastMessage?.role === "assistant" && lastMessage.content === greeting) return current;
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: greeting,
          ...(brief ? { generatedPrompt: brief.generationPrompt } : {})
        }
      ];
    });
  }

  function openAssistant(): void {
    if (!assistantAvailable) return;
    setAssistantOpen(true);
    setAssistantDockCollapsed(false);
    restoreAssistantDockPreference();
    setAssistantHasUnreadResult(false);
  }

  useEffect(() => {
    const conversationId = assistantConversationRequest?.conversationId;
    if (!conversationId) return;
    let cancelled = false;
    void getImageWorkbenchApi().listAssistantConversations({ conversationId }).then((records) => {
      if (cancelled) return;
      const conversation = buildAssistantHistory(records, boardNameById).find((item) => item.id === conversationId);
      if (!conversation) {
        toast.error(translateSourceText("未找到这次 AI 助手记录。"));
        return;
      }
      assistantPreviousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setAssistantOffset({ x: 0, y: 0 });
      setAssistantHasUnreadResult(false);
      assistantEffectActionsRef.current.restoreAssistantConversation(conversation);
      restoreAssistantDockPreference();
      setAssistantOpen(true);
    }).catch((error) => {
      if (!cancelled) toast.error(getWorkbenchErrorMessage(error, "无法打开 AI 助手记录。"));
    });
    return () => { cancelled = true; };
  }, [
    assistantConversationRequest?.conversationId,
    assistantConversationRequest?.nonce,
    boardNameById,
    restoreAssistantDockPreference,
    setAssistantHasUnreadResult,
    setAssistantOffset
  ]);

  function startNewAssistantConversation(): void {
    // 新会话只重置助手上下文，保留生成区里的提示词、模板、参考图和编辑状态。
    const currentPrompt = promptDraftRef.current;
    setAssistantConversationId(crypto.randomUUID());
    setAssistantMessages([{
      id: "fusion-greeting",
      role: "assistant",
      content: assistantSurface === "comic-drama" && comicDramaSnapshot
        ? comicDramaGuide?.message ?? "请先安装或更新漫剧插件。"
        : isUiDesignMode
          ? buildUiDesignAssistantGreeting(uiBriefPreview?.brief ?? null, input.referenceImages.length, locale)
          : buildPromptAssistantGreeting(currentPrompt, {
            editing: editTarget !== null,
            referenceCount: input.referenceImages.length,
            templateName: activeScene?.name
          }, locale)
    }]);
    setAssistantValue("");
    setAssistantInteraction(null);
    setAssistantIntentSuggestions([]);
    assistantClarificationRoundsRef.current = 0;
    assistantIntentSuggestionHistoryRef.current = [];
    assistantAnalyzedContextSignatureRef.current = assistantOpeningContextSignature;
  }

  function stopAssistant(): void {
    assistantRequestVersionRef.current += 1;
    assistantIntentSuggestionRequestRef.current += 1;
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    assistantBackgroundRequestRef.current = false;
    setAssistantStreaming(false);
    setAssistantActivity(null);
    setAssistantIntentSuggestionsLoading(false);
    setAssistantMessages((current) => settleCancelledAssistantMessages(current).map((message) => ({
      ...message, toolCalls: settleAssistantToolCalls(message.toolCalls, "cancelled")
    })));
  }

  const closeAssistant = useCallback((): void => {
    setAssistantOpen(false);
    setAssistantDockCollapsed(false);
    if (assistantDockSide) {
      setAssistantDockSide(null);
      setAssistantOffset({ x: 0, y: 0 });
      void onAssistantDockLayoutChange?.(null);
    }
    const previousFocus = assistantPreviousFocusRef.current;
    assistantPreviousFocusRef.current = null;
    if (previousFocus && previousFocus !== document.body) {
      window.requestAnimationFrame(() => {
        if (previousFocus.isConnected) previousFocus.focus();
      });
    }
  }, [assistantDockSide, onAssistantDockLayoutChange, setAssistantDockCollapsed, setAssistantDockSide, setAssistantOffset]);

  function applyAssistantChanges(nextPrompt: string, generationCount?: number): void {
    const patch: Partial<GenerateImageInput> = {};
    if (nextPrompt) {
      patch.prompt = nextPrompt;
      if (!templatePromptPreview || templatePromptPreview.sceneId !== input.sceneId) patch.sceneId = undefined;
    }
    if (generationCount !== undefined) patch.n = generationCount;
    if (Object.keys(patch).length > 0) onInputChange(patch);
    if (!nextPrompt) return;
    setTemplatePromptPreview((current) => current ? {
      ...current,
      prompt: nextPrompt,
      referenceSignature: assistantReferenceSignature
    } : current);
    assistantAnalyzedContextSignatureRef.current = buildAssistantContextSignature({
      surface: assistantSurface,
      editTargetSignature,
      prompt: nextPrompt,
      referenceSignature: assistantReferenceSignature,
      templateSignature: assistantTemplateSignature
    });
    // 助手更新提示词后自动展开输入卡片，并把高度撑到能直接看到结构化字段。
    const lineCount = nextPrompt.split("\n").length;
    setPromptHeight(Math.min(maxPromptHeight, Math.max(DEFAULT_PROMPT_HEIGHT, lineCount * 32 + 8)));
  }

  function showAssistantConfirmation(
    interaction: Extract<AiAssistantInteractionState["interaction"], { type: "confirm" }>,
    onConfirm: () => void,
    options?: {
      activityLabel?: string;
      generationActivityLabel?: string;
      dismissMessage?: string;
      confirmationPreview?: AssistantConfirmationPreview;
      onGenerateImmediately?: () => void;
    }
  ): void {
    setAssistantInteraction({
      state: {
        id: crypto.randomUUID(),
        interaction,
        confirmationPreview: options?.confirmationPreview,
        canGenerateImmediately: Boolean(options?.onGenerateImmediately)
      },
      onConfirm,
      onGenerateImmediately: options?.onGenerateImmediately,
      activityLabel: options?.activityLabel,
      generationActivityLabel: options?.generationActivityLabel,
      dismissMessage: options?.dismissMessage
    });
  }

  function submitImmediateAssistantGeneration(prompt: string, count = input.n, result?: CollaborateSceneResult): void {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    if (assistantSurface === "canvas-prompt") assistantPreviousGenerationPromptRef.current = nextPrompt;
    onGeneratePrompts([{ prompt: nextPrompt, count, mediaType: result?.mediaType, videoSettings: result?.videoSettings }], assistantConversationId);
  }

  function applyReviewedAssistantPrompt(prompt: string, message?: AiAssistantMessage): void {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    // Older saved conversations may contain only a labelled video prompt.
    const isVideo = message?.mediaType === "video" || /^\s*视频提示词[：:]/u.test(nextPrompt);
    if (isVideo) {
      const submit = async (prepareOnly: boolean) => {
        try {
          const error = await onGeneratePrompts([{ prompt: nextPrompt, count: 1,
            mediaType: "video", videoSettings: message?.videoSettings, prepareOnly }], assistantConversationId);
          if (error) toast.error(error);
          else toast.success(prepareOnly ? "已创建视频草稿，请在视频节点中继续" : "已进入视频生成流程，请在画板确认并查看进度");
        } catch (error) { toast.error(error instanceof Error ? error.message : "视频任务提交失败"); }
      };
      showAssistantConfirmation(
        buildAssistantActionConfirmInteraction(assistantSurface, { changesPrompt: true, hasCurrentPrompt: false }),
        () => void submit(true),
        { onGenerateImmediately: () => void submit(false),
          confirmationPreview: buildAssistantConfirmationPreview("视频提示词", [{ value: nextPrompt }]) }
      );
      return;
    }
    showAssistantConfirmation(
      buildAssistantActionConfirmInteraction(assistantSurface, {
        changesPrompt: nextPrompt !== promptDraftRef.current.trim(),
        hasCurrentPrompt: Boolean(promptDraftRef.current.trim())
      }),
      () => {
        applyAssistantChanges(nextPrompt);
        toast.success(assistantSurface === "canvas-edit" ? translateSourceText("已应用到当前编辑指令") : translateSourceText("已应用到当前提示词"));
      },
      {
        activityLabel: assistantSurface === "canvas-edit" ? "正在更新编辑指令…" : "正在更新当前提示词…",
        generationActivityLabel: "正在提交生成…",
        onGenerateImmediately: () => {
          applyAssistantChanges(nextPrompt);
          submitImmediateAssistantGeneration(nextPrompt);
        },
        confirmationPreview: buildAssistantConfirmationPreview(
          assistantSurface === "canvas-edit" ? "将应用的编辑指令" : "将应用的提示词",
          [{ value: nextPrompt }]
        )
      }
    );
  }

  function buildAssistantDirectionMessage(result: CollaborateSceneResult): Pick<
    AiAssistantMessage,
    "assistantContext" | "directions" | "onGenerateAllDirections"
  > {
    const sourceDirections = (result.directions ?? []).slice(0, maxImageCount);
    if (sourceDirections.length === 0) return {};
    const assistantContext = [
      result.message,
      "本轮给出的结构化方向：",
      ...sourceDirections.map((direction) => (
        `- [${direction.id}] ${direction.title}${direction.description ? `：${direction.description}` : ""}\n  提示词：${direction.prompt}`
      ))
    ].join("\n");
    const requests = sourceDirections.map((direction) => ({ prompt: direction.prompt, count: 1, preservePrompt: true }));
    return {
      assistantContext,
      directions: sourceDirections.map((direction) => ({
        id: direction.id,
        title: direction.title,
        description: direction.description,
        onApply: () => showAssistantConfirmation(
          buildAssistantActionConfirmInteraction(assistantSurface, {
            changesPrompt: true,
            hasCurrentPrompt: Boolean(promptDraftRef.current.trim())
          }),
          () => applyAssistantChanges(direction.prompt),
          {
            activityLabel: assistantSurface === "canvas-edit" ? "正在更新编辑指令…" : "正在更新当前提示词…",
            generationActivityLabel: "正在提交生成…",
            onGenerateImmediately: () => {
              applyAssistantChanges(direction.prompt);
              submitImmediateAssistantGeneration(direction.prompt);
            },
            confirmationPreview: buildAssistantConfirmationPreview(
              assistantSurface === "canvas-edit" ? "将应用的编辑指令" : "将应用的提示词",
              [{ label: direction.title, value: direction.prompt }]
            )
          }
        ),
        onGenerate: () => showAssistantConfirmation(
          buildAssistantActionConfirmInteraction(assistantSurface, {
            changesPrompt: false,
            hasCurrentPrompt: Boolean(promptDraftRef.current.trim()),
            generationRequestCount: 1,
            generationImageCount: 1
          }),
          () => {
            if (assistantSurface === "canvas-prompt") assistantPreviousGenerationPromptRef.current = direction.prompt;
            onGeneratePrompts(
              [{ prompt: direction.prompt, count: 1, preservePrompt: true }],
              assistantConversationId
            );
          },
          {
            activityLabel: "正在提交生成…",
            dismissMessage: "先不生成，我想继续完善。",
            confirmationPreview: buildAssistantConfirmationPreview(
              "本次用于生成的提示词",
              [{ label: direction.title, value: direction.prompt }]
            )
          }
        )
      })),
      onGenerateAllDirections: requests.length > 1
        ? () => showAssistantConfirmation(
          buildAssistantActionConfirmInteraction(assistantSurface, {
            changesPrompt: false,
            hasCurrentPrompt: Boolean(promptDraftRef.current.trim()),
            generationRequestCount: requests.length,
            generationImageCount: requests.reduce((total, request) => total + request.count, 0)
          }),
          () => onGeneratePrompts(requests, assistantConversationId),
          {
            activityLabel: "正在提交生成…",
            dismissMessage: "先不生成，我想继续完善。",
            confirmationPreview: buildAssistantConfirmationPreview(
              "本次用于生成的提示词",
              sourceDirections.map((direction) => ({ label: direction.title, value: direction.prompt }))
            )
          }
        )
        : undefined
    };
  }

  function resolveAssistantGenerationRequests(
    result: CollaborateSceneResult,
    prompt: string,
    previousCount: number
  ): AssistantGenerationRequest[] {
    const actions = result.actions ?? [];
    const directionAction = actions.find((action) => action.type === "generate_directions");
    if (directionAction?.type === "generate_directions") {
      const ids = new Set(directionAction.directionIds);
      return (result.directions ?? [])
        .filter((direction) => ids.has(direction.id))
        .slice(0, maxImageCount)
        .map((direction) => ({ prompt: direction.prompt, count: 1, preservePrompt: true }));
    }
    if (!actions.some((action) => action.type === "generate") || !prompt.trim()) return [];
    return [{
      prompt: prompt.trim(),
      mediaType: result.mediaType, videoSettings: result.videoSettings,
      count: resolveAssistantGenerationCount(result, maxImageCount) ?? previousCount
    }];
  }

  function applyPromptAssistantResult(
    result: CollaborateSceneResult,
    assistantMessageId: string,
    previous: Pick<GenerateImageInput, "prompt" | "sceneId" | "n">
  ): void {
    const concisePrompt = sceneAssistantFieldsToPrompt(result.fields);
    const detailedPrompt = result.detailedPrompt?.trim() ?? "";
    const hasDetailed = Boolean(detailedPrompt) && detailedPrompt !== concisePrompt;
    const generationCount = resolveAssistantGenerationCount(result, maxImageCount);
    const changesGenerationCount = generationCount !== undefined && generationCount !== previous.n;
    const resultingPrompt = concisePrompt || previous.prompt || assistantPreviousGenerationPromptRef.current;
    const generationRequests = resolveAssistantGenerationRequests(result, resultingPrompt, previous.n);
    const executesGeneration = generationRequests.length > 0;

    function buildReceipt(variant: "concise" | "detailed"): AiAssistantReceipt {
      const actions: AiAssistantReceiptAction[] = executesGeneration ? [] : [{
        label: "撤销",
        kind: "undo",
        onAction: () => {
          onInputChange({ prompt: previous.prompt, sceneId: previous.sceneId, n: previous.n });
          setAssistantMessages((messages) => messages.map((item) => (
            item.id === assistantMessageId ? { ...item, receipt: undefined } : item
          )));
        }
      }];
      if (hasDetailed) {
        actions.push({
          label: variant === "concise" ? "细节版" : "简洁版",
          kind: "toggle",
          onAction: () => {
            const nextVariant = variant === "concise" ? "detailed" : "concise";
            showAssistantConfirmation(
              buildAssistantActionConfirmInteraction(assistantSurface, {
                changesPrompt: true,
                hasCurrentPrompt: true
              }),
              () => applyVariant(nextVariant),
              {
                activityLabel: assistantSurface === "canvas-edit" ? "正在更新编辑指令…" : "正在更新当前提示词…",
                generationActivityLabel: "正在提交生成…",
                onGenerateImmediately: () => {
                  applyVariant(nextVariant);
                  submitImmediateAssistantGeneration(
                    nextVariant === "detailed" ? detailedPrompt : concisePrompt,
                    generationCount ?? previous.n, result
                  );
                },
                confirmationPreview: buildAssistantConfirmationPreview(
                  assistantSurface === "canvas-edit" ? "将应用的编辑指令" : "将应用的提示词",
                  [{ value: nextVariant === "detailed" ? detailedPrompt : concisePrompt }]
                )
              }
            );
          }
        });
      }
      const appliedPrompt = variant === "detailed" ? detailedPrompt : concisePrompt;
      const changesPrompt = Boolean(appliedPrompt) && appliedPrompt !== previous.prompt;
      return {
        label: executesGeneration
          ? generationRequests.length > 1
            ? `正在生成 ${generationRequests.length} 个方向…`
            : result.mediaType === "video" ? "正在提交视频任务…" : `正在生成 · ${generationRequests[0].count} 张…`
          : changesPrompt && changesGenerationCount
            ? assistantSurface === "canvas-edit" ? "已更新编辑指令和生成数量" : "已更新提示词和生成数量"
            : changesGenerationCount
              ? "已更新生成数量"
              : assistantSurface === "canvas-edit" ? "已更新编辑指令" : "已更新当前提示词",
        actions
      };
    }

    function applyVariant(variant: "concise" | "detailed"): void {
      applyAssistantChanges(variant === "detailed" ? detailedPrompt : concisePrompt, generationCount);
      setAssistantMessages((messages) => messages.map((item) => (
        item.id === assistantMessageId ? { ...item, receipt: buildReceipt(variant) } : item
      )));
    }

    const changesPrompt = Boolean(concisePrompt) && concisePrompt !== previous.prompt;
    const hasAppliedChange = changesPrompt || changesGenerationCount;
    if (hasAppliedChange && result.mediaType !== "video") applyAssistantChanges(changesPrompt ? concisePrompt : "", generationCount);
    const directionMessage = buildAssistantDirectionMessage(result);
    setAssistantMessages((current) => current.map((message) => (
      message.id === assistantMessageId
        ? {
          ...message,
          content: result.message,
          streaming: false,
          generatedPrompt: getAssistantGeneratedPrompt(result) || undefined,
          mediaType: result.mediaType, videoSettings: result.videoSettings,
          ...directionMessage,
          ...(hasAppliedChange || executesGeneration ? { receipt: buildReceipt("concise") } : {})
        }
        : message
    )));
    setAssistantValue("");
    setAssistantStreaming(false);
    setAssistantActivity(null);
    setAssistantInteraction(null);
    assistantStreamRef.current = null;
    assistantApplyTimerRef.current = null;
    if (executesGeneration) {
      if (assistantSurface === "canvas-prompt" && generationRequests.length === 1) {
        assistantPreviousGenerationPromptRef.current = generationRequests[0].prompt;
      }
      void Promise.resolve().then(async () => await onGeneratePrompts(generationRequests, assistantConversationId))
        .then((error) => {
          setAssistantMessages((messages) => messages.map((message) => message.id === assistantMessageId
            ? { ...message, receipt: { label: error ? `生成失败：${error}` : result.mediaType === "video" ? "已进入视频生成流程，请在画板确认" : "生成完成", actions: [] } }
            : message));
        }).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : "请重试。";
          setAssistantMessages((messages) => messages.map((message) => message.id === assistantMessageId
            ? { ...message, receipt: { label: `生成失败：${reason}`, actions: [] } }
            : message));
        });
    }
  }

  function receiveUiDesignAssistantResult(
    result: CollaborateSceneResult,
    assistantMessageId: string
  ): void {
    const hasBrief = hasUiDesignBriefFields(result);
    const nextBrief = hasBrief ? createUiDesignBrief(result) : null;
    setAssistantMessages((current) => current.map((message) => (
      message.id === assistantMessageId
        ? {
          ...message,
          content: result.message,
          streaming: false,
          ...(nextBrief ? { generatedPrompt: nextBrief.generationPrompt } : {})
        }
        : message
    )));
    setAssistantValue("");
    setAssistantStreaming(false);
    assistantStreamRef.current = null;

    const interaction = resolveAssistantInteraction(result, assistantSurface);
    if (interaction?.type === "form") {
      assistantClarificationRoundsRef.current += 1;
      setAssistantInteraction({
        state: {
          id: crypto.randomUUID(),
          interaction
        }
      });
      return;
    }
    assistantClarificationRoundsRef.current = 0;
    setAssistantInteraction(null);
    if (!nextBrief || result.intent === "chat") return;

    const previousPreview = uiBriefPreview;
    showAssistantConfirmation(
      {
        type: "confirm",
        title: previousPreview ? "更新当前 UI Brief？" : "采用这版 UI Brief？",
        description: "确认后会更新画板中的 UI Brief，但不会立即生成图片。",
        confirmLabel: previousPreview ? "更新 Brief" : "采用 Brief",
        cancelLabel: "继续调整"
      },
      () => {
        setUiBriefPreview({ signature: uiBriefSignature, brief: nextBrief });
        setAssistantMessages((messages) => messages.map((message) => (
          message.id === assistantMessageId
            ? {
              ...message,
              receipt: {
                label: previousPreview ? "已更新 UI Brief" : "已采用 UI Brief",
                actions: [{
                  label: "撤销",
                  kind: "undo",
                  onAction: () => {
                    setUiBriefPreview(previousPreview);
                    setAssistantMessages((items) => items.map((item) => (
                      item.id === assistantMessageId ? { ...item, receipt: undefined } : item
                    )));
                  }
                }]
              }
            }
            : message
        )));
      },
      {
        activityLabel: "正在更新 UI Brief…",
        confirmationPreview: buildAssistantConfirmationPreview("将更新的 UI Brief", [
          { label: "产品目标", value: nextBrief.goal },
          { label: "界面载体", value: nextBrief.surface },
          { label: "信息结构", value: nextBrief.structure },
          { label: "视觉方向", value: nextBrief.visualDirection },
          { label: "关键约束", value: nextBrief.constraints }
        ])
      }
    );
  }

  function receivePromptAssistantResult(
    result: CollaborateSceneResult,
    assistantMessageId: string,
    previous: Pick<GenerateImageInput, "prompt" | "sceneId" | "n">
  ): void {
    if (isUiDesignMode) {
      receiveUiDesignAssistantResult(result, assistantMessageId);
      return;
    }
    const directionMessage = buildAssistantDirectionMessage(result);
    setAssistantMessages((current) => current.map((message) => (
      message.id === assistantMessageId
        ? {
          ...message,
          content: result.message,
          streaming: false,
          generatedPrompt: getAssistantGeneratedPrompt(result) || undefined,
          mediaType: result.mediaType, videoSettings: result.videoSettings,
          ...directionMessage
        }
        : message
    )));
    setAssistantValue("");
    setAssistantStreaming(false);
    assistantStreamRef.current = null;

    // Video plans share the same media-aware apply/confirm path as their prompt card.
    // Do not apply video text to the image composer, including legacy result confirmations.
    const interaction = resolveAssistantInteraction(result, assistantSurface);
    const videoPrompt = getAssistantGeneratedPrompt(result)?.trim();
    if (result.mediaType === "video" && videoPrompt && interaction?.type !== "form") {
      setAssistantInteraction(null);
      assistantClarificationRoundsRef.current = 0;
      applyReviewedAssistantPrompt(videoPrompt, {
        id: assistantMessageId, role: "assistant", content: result.message,
        mediaType: "video", videoSettings: result.videoSettings
      });
      return;
    }
    // 模型主动要求的交互（澄清表单，或旧协议返回的确认）仍走底部面板。
    if (interaction) {
      if (interaction.type === "form") assistantClarificationRoundsRef.current += 1;
      setAssistantInteraction({
        state: {
          id: crypto.randomUUID(),
          interaction,
          ...(interaction.type === "confirm" ? {
            confirmationPreview: buildAssistantConfirmationPreview(
              assistantSurface === "canvas-edit" ? "将应用的编辑指令" : "将应用的提示词",
              [{ value: sceneAssistantFieldsToPrompt(result.fields) }]
            ),
            canGenerateImmediately: Boolean(sceneAssistantFieldsToPrompt(result.fields))
          } : {})
        },
        ...(interaction.type === "confirm" ? {
          onConfirm: () => applyPromptAssistantResult(result, assistantMessageId, previous),
          onGenerateImmediately: () => {
            const prompt = sceneAssistantFieldsToPrompt(result.fields);
            applyPromptAssistantResult(result, assistantMessageId, previous);
            submitImmediateAssistantGeneration(
              prompt,
              resolveAssistantGenerationCount(result, maxImageCount) ?? previous.n, result
            );
          },
          generationActivityLabel: "正在提交生成…",
          activityLabel: assistantSurface === "canvas-edit" ? "正在更新编辑指令…" : "正在更新当前提示词…"
        } : {})
      });
      return;
    }
    assistantClarificationRoundsRef.current = 0;

    const nextPrompt = sceneAssistantFieldsToPrompt(result.fields);
    const nextGenerationCount = resolveAssistantGenerationCount(result, maxImageCount);
    const previewPrompt = nextPrompt || previous.prompt || assistantPreviousGenerationPromptRef.current;
    const generationRequests = resolveAssistantGenerationRequests(result, previewPrompt, previous.n);
    const executesGeneration = generationRequests.length > 0;
    // intent=chat 是纯说明性回复：即使意外携带字段也不改动画板内容。
    if ((!nextPrompt && nextGenerationCount === undefined && !executesGeneration) || result.intent === "chat") {
      setAssistantInteraction(null);
      return;
    }

    const changesPrompt = Boolean(nextPrompt) && nextPrompt !== previous.prompt;
    // AI 助手不能直接改变提示词或发起生成；两类执行都必须停在用户确认面板。
    if (changesPrompt || executesGeneration) {
      showAssistantConfirmation(
        buildAssistantActionConfirmInteraction(assistantSurface, {
          changesPrompt,
          hasCurrentPrompt: Boolean(previous.prompt.trim()),
          generationRequestCount: generationRequests.length,
          generationImageCount: generationRequests.reduce((total, request) => total + request.count, 0)
        }),
        () => applyPromptAssistantResult(result, assistantMessageId, previous),
        {
          activityLabel: executesGeneration
            ? "正在提交生成…"
            : assistantSurface === "canvas-edit" ? "正在更新编辑指令…" : "正在更新当前提示词…",
          ...(!executesGeneration && previewPrompt ? {
            generationActivityLabel: "正在提交生成…",
            onGenerateImmediately: () => {
              applyPromptAssistantResult(result, assistantMessageId, previous);
              submitImmediateAssistantGeneration(
                previewPrompt,
                nextGenerationCount ?? previous.n, result
              );
            }
          } : {}),
          ...(executesGeneration ? { dismissMessage: "先不生成，我想继续完善。" } : {}),
          confirmationPreview: buildAssistantConfirmationPreview(
            executesGeneration
              ? changesPrompt ? "将应用并用于生成的提示词" : "本次用于生成的提示词"
              : assistantSurface === "canvas-edit" ? "将应用的编辑指令" : "将应用的提示词",
            generationRequests.length > 1
              ? generationRequests.map((request, index) => ({
                label: result.directions?.find((direction) => direction.prompt === request.prompt)?.title ?? `方向 ${index + 1}`,
                value: request.prompt
              }))
              : [{ value: generationRequests[0]?.prompt ?? nextPrompt }]
          )
        }
      );
      return;
    }
    applyPromptAssistantResult(result, assistantMessageId, previous);
  }

  function buildCurrentAssistantFields() {
    if (assistantSurface === "comic-drama" && comicDramaSnapshot) {
      const context = comicDramaContext;
      const selected = comicDramaSnapshot.nodes.filter((node) => comicDramaSelectedNodeIds.includes(node.id));
      const guide = comicDramaGuide;
      return [
        { label: "漫剧上下文", value: context },
        { label: "当前阶段", value: guide ? `${guide.stage}：${guide.message}` : "请先安装或更新漫剧插件。" },
        { label: "画板 revision", value: String(comicDramaSnapshot.revision) },
        { label: "完整漫剧节点快照", value: JSON.stringify(comicDramaSnapshot.nodes) },
        { label: "选中节点快照", value: JSON.stringify(selected) },
        {
          label: "引用连接与分组摘要", value: JSON.stringify({
            connections: comicDramaSnapshot.connections,
            groups: comicDramaSnapshot.groups
          })
        }
      ];
    }
    if (!isUiDesignMode) {
      return [
        ...buildPromptAssistantCurrentFields(
          promptDraftRef.current,
          assistantPreviousGenerationPromptRef.current,
          assistantSurface
        ),
        ...(activeScene ? [{
          label: `当前模板：${activeScene.name}`,
          value: activeScene.prompt
        }] : [])
      ];
    }
    const materialRoles = input.referenceImages.map((image, index) => (
      `${index + 1}. ${image.name}：${image.semanticRole ?? inferUiMaterialRole(image.name)}`
    )).join("\n");
    return [
      ...(uiBriefPreview
        ? uiDesignBriefToFields(uiBriefPreview.brief, promptDraftRef.current)
        : promptDraftRef.current.trim()
          ? [{ label: "用户原始需求", value: promptDraftRef.current.trim() }]
          : []),
      ...(materialRoles ? [{ label: "材料职责", value: materialRoles }] : []),
      ...(activeScene ? [{ label: "模板规则", value: activeScene.prompt }] : [])
    ];
  }

  const sendAssistantInstruction = createAssistantInstructionSender({
    assistantStreaming,
    assistantActivity,
    assistantIntentSuggestionRequestRef,
    setAssistantIntentSuggestions,
    setAssistantIntentSuggestionsLoading,
    assistantRequestVersionRef,
    setAssistantInteraction,
    setAssistantMessages,
    setAssistantValue,
    assistantBackgroundRequestRef,
    setAssistantStreaming,
    setAssistantActivity,
    assistantClarificationRoundsRef,
    assistantMessages,
    assistantConversationId,
    assistantStreamRef,
    setAssistantHasUnreadResult,
    input,
    supportsPromptEnhancement,
    promptEnhancementUnavailableMessage,
    promptEnhancementUnavailableReason,
    onOpenSettings,
    boardId,
    assistantAgentModeEnabled,
    onAssistantCreditsUsed,
    editTarget,
    activeScene,
    locale,
    promptDraftRef,
    isUiDesignMode,
    uiBriefPreview,
    fusionPromptContext,
    buildCurrentAssistantFields,
    maxImageCount,
    assistantSurface,
    assistantOpenRef,
    t,
    receivePromptAssistantResult,
    receiveComicDramaAgentResult
  });

  async function receiveComicDramaAgentResult(
    result: CollaborateSceneResult,
    assistantMessageId: string,
    originalInstruction: string
  ): Promise<void> {
    setAssistantMessages((current) => current.map((message) => message.id === assistantMessageId
      ? { ...message, content: result.message, streaming: false }
      : message));
    setAssistantValue("");
    setAssistantStreaming(false);
    setAssistantActivity(null);
    assistantStreamRef.current = null;

    const interaction = resolveAssistantInteraction(result, "comic-drama");
    if (interaction) {
      if (interaction.type === "form") assistantClarificationRoundsRef.current += 1;
      setAssistantInteraction({
        state: { id: crypto.randomUUID(), interaction }
      });
      return;
    }
    setAssistantInteraction(null);
    assistantClarificationRoundsRef.current = 0;

    const action = result.actions?.find((candidate) => candidate.type === "comic_drama_plan");
    if (action?.type !== "comic_drama_plan") return;
    const snapshot = comicDramaSnapshotRef.current;
    if (!snapshot || !onApplyComicDramaPlan) return;
    const requestVersion = assistantRequestVersionRef.current;
    const isCurrent = (): boolean => assistantRequestVersionRef.current === requestVersion
      && comicDramaSnapshotRef.current?.boardId === snapshot.boardId
      && comicDramaSnapshotRef.current.revision === snapshot.revision;
    let plan: BoardMutationPlan;
    let contextLabel: string;
    try {
      [plan, contextLabel] = await Promise.all([requestPluginCapability(SHORT_DRAMA_PLUGIN_ID, "comic.plan", {
        snapshot,
        selectedNodeIds: comicDramaSelectedNodeIds,
        instruction: action.instruction,
        operation: action.operation,
        ...(action.characterDrafts ? { characterDrafts: action.characterDrafts } : {})
      }, { isCurrentBoard: isCurrent }), requestPluginCapability(SHORT_DRAMA_PLUGIN_ID, "comic.context", {
        snapshot, selectedNodeIds: comicDramaSelectedNodeIds
      }, { isCurrentBoard: isCurrent })]);
      if (!isCurrent()) return;
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "无法根据当前画板创建漫剧计划，请安装或更新漫剧插件。";
      setAssistantMessages((current) => current.map((item) => item.id === assistantMessageId
        ? { ...item, content: `${result.message}\n\n${message}`, tone: "error", streaming: false }
        : item));
      return;
    }
    const messageId = assistantMessageId;
    const readiness = snapshot.nodes.some((node) => node.type === "comic-segment-script" && comicDramaSelectedNodeIds.includes(node.id))
      ? "首帧未采用；尾帧与视频生成保持阻塞。添加计划不会调用 Provider。" : undefined;
    const updateStatus = (status: "preview" | "applying" | "applied" | "conflict" | "error", error?: string): void => {
      setAssistantMessages((current) => current.map((message) => message.id === messageId && message.comicDramaPlan
        ? { ...message, comicDramaPlan: { ...message.comicDramaPlan, status, error } } : message));
    };
    setAssistantMessages((current) => current.map((message) => message.id === assistantMessageId
      ? {
        ...message,
        assistantContext: `漫剧 Agent 计划：${JSON.stringify({
          message: result.message,
          fields: result.fields,
          action
        })}`,
        comicDramaPlan: {
          plan, contextLabel, readiness, status: "preview",
          onApply: (characterDraftIds) => {
            updateStatus("applying");
            const appliedPlan = plan.action?.kind === "propose-characters" && characterDraftIds?.length
              ? requestPluginCapability(SHORT_DRAMA_PLUGIN_ID, "comic.charactersPlan", {
                snapshot,
                settingNodeId: snapshot.nodes.find((node) => node.type === "comic-setting")?.id ?? "",
                drafts: plan.action.characterDrafts,
                characterDraftIds
              }, {
                isCurrentBoard: () => comicDramaSnapshotRef.current?.boardId === snapshot.boardId
              })
              : Promise.resolve(plan);
            void appliedPlan.then(onApplyComicDramaPlan).then(() => updateStatus("applied")).catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : "添加失败，未添加任何节点。";
              updateStatus(/REVISION_CONFLICT|revision|画板内容已更新/ui.test(errorMessage) ? "conflict" : "error", errorMessage);
            });
          },
          onRefine: () => setAssistantValue(action.instruction),
          onRetry: () => void sendAssistantInstruction(originalInstruction, originalInstruction, false, false)
        }
      }
      : message));
  }

  function submitAssistant(): void {
    void sendAssistantInstruction(assistantValue);
  }

  function selectAssistantIntentSuggestion(suggestion: string): void {
    void sendAssistantInstruction(suggestion, suggestion, false);
  }

  async function requestAssistantIntentSuggestions(
    mode: AssistantIntentSuggestionMode = "contextual"
  ): Promise<void> {
    if (
      !assistantOpen ||
      !assistantIntentSuggestionsEnabled ||
      !supportsPromptEnhancement ||
      assistantStreaming ||
      assistantActivity ||
      assistantInteraction
    ) return;
    const requestId = assistantIntentSuggestionRequestRef.current + 1;
    assistantIntentSuggestionRequestRef.current = requestId;
    setAssistantIntentSuggestionsLoading(true);
    const hasCreativeContext = (
      assistantMessages.some((message) => message.role === "user" && message.content.trim())
      || buildCurrentAssistantFields().some((field) => field.value.trim())
      || input.referenceImages.length > 0
      || assistantSurface === "canvas-edit"
    );
    const suggestionMode = (
      mode === "contextual"
      && !hasCreativeContext
      && assistantIntentSuggestionHistoryRef.current.length > 0
    ) ? "divergent" : mode;
    try {
      const result = await getImageWorkbenchApi().suggestAssistantIntents({
        assistantSurface,
        locale,
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-12)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        currentFields: buildCurrentAssistantFields(),
        referenceImages: input.referenceImages.slice(0, 4).map(({ name, mimeType, dataBase64 }) => ({
          name,
          mimeType,
          dataBase64
        })),
        referenceImageCount: input.referenceImages.length + (assistantSurface === "canvas-edit" ? 1 : 0),
        suggestionCount: assistantIntentSuggestionCount,
        suggestionMode,
        previousSuggestions: suggestionMode === "divergent" ? assistantIntentSuggestionHistoryRef.current : [],
        variationSeed: crypto.randomUUID()
      });
      if (assistantIntentSuggestionRequestRef.current !== requestId) return;
      assistantIntentSuggestionHistoryRef.current = suggestionMode === "divergent"
        ? [...assistantIntentSuggestionHistoryRef.current, ...result.suggestions].slice(-20)
        : result.suggestions;
      setAssistantIntentSuggestions(result.suggestions);
      if (!assistantOpenRef.current && result.suggestions.length > 0) setAssistantHasUnreadResult(true);
      onAssistantCreditsUsed?.();
    } catch (error) {
      if (assistantIntentSuggestionRequestRef.current !== requestId) return;
      // Keep usable entry points and the refresh button even if the API fails.
      setAssistantIntentSuggestions((current) => current.length > 0 ? current : [
        translateSourceText("帮我探索创作方向"),
        translateSourceText("帮我调整背景与光线"),
        translateSourceText("帮我整理完整提示词")
      ]);
      toast.error(getWorkbenchErrorMessage(error, "推荐暂时无法加载，请点击“换一组”重试。"));
    } finally {
      if (assistantIntentSuggestionRequestRef.current === requestId) {
        setAssistantIntentSuggestionsLoading(false);
      }
    }
  }

  function submitAssistantInteraction(values: AiAssistantInteractionValues): void {
    const pending = assistantInteraction;
    if (!pending) return;
    if (pending.agentInteractionId) {
      assistantStreamRef.current?.respondToInteraction(
        pending.agentInteractionId,
        "submit",
        values
      );
      setAssistantInteraction(null);
      setAssistantActivity("正在继续…");
      return;
    }
    if (pending.state.interaction.type === "form") {
      const answers = formatAssistantInteractionAnswers(pending.state.interaction, values);
      void sendAssistantInstruction(answers);
      return;
    }

    executeAssistantInteraction(pending.onConfirm, pending.activityLabel);
  }

  function executeAssistantInteraction(
    action: (() => void) | undefined,
    activityLabel?: string
  ): void {
    if (!action) return;
    setAssistantInteraction(null);
    setAssistantActivity(activityLabel ?? "正在执行…");
    assistantApplyTimerRef.current = window.setTimeout(() => {
      try {
        action();
      } catch (error) {
        toast.error(getWorkbenchErrorMessage(error, "操作未完成，请重试。"));
      } finally {
        assistantApplyTimerRef.current = null;
        setAssistantActivity(null);
      }
    }, 420);
  }

  function generateAssistantInteraction(): void {
    const pending = assistantInteraction;
    if (!pending) return;
    executeAssistantInteraction(
      pending.onGenerateImmediately,
      pending.generationActivityLabel ?? "正在提交生成…"
    );
  }

  function dismissAssistantInteraction(): void {
    if (!assistantInteraction) return;
    if (assistantInteraction.agentInteractionId) {
      assistantStreamRef.current?.respondToInteraction(
        assistantInteraction.agentInteractionId,
        "dismiss"
      );
      setAssistantInteraction(null);
      setAssistantActivity("正在继续…");
      return;
    }
    const content = assistantInteraction.state.interaction.type === "confirm"
      ? assistantInteraction.dismissMessage ?? "先不应用，我想继续完善。"
      : "先不补充这些信息。";
    setAssistantInteraction(null);
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content }
    ]);
  }

  function refineAssistantInteraction(value: string): void {
    const instruction = value.trim();
    if (!instruction) return;
    setAssistantInteraction(null);
    void sendAssistantInstruction(instruction);
  }

  useEffect(() => {
    assistantShortcutActionRef.current = () => {
      if (assistantOpenRef.current) closeAssistant();
      else openAssistant();
    };
  });

  useEffect(() => {
    if (assistantEnabled || !assistantOpen) return;
    assistantEffectActionsRef.current.stopAssistant();
    closeAssistant();
  }, [assistantEnabled, assistantOpen, closeAssistant]);

  useEffect(() => {
    if (!assistantShortcutEnabled) return;

    function handleAssistantShortcut(event: KeyboardEvent): void {
      if (!matchesAssistantShortcut(event)) return;
      event.preventDefault();
      assistantShortcutActionRef.current();
    }

    window.addEventListener("keydown", handleAssistantShortcut);
    return () => window.removeEventListener("keydown", handleAssistantShortcut);
  }, [assistantShortcutEnabled]);

  return (
    <>
      <PromptFusionDock
        assistantEnabled={assistantAvailable}
        panelRef={assistantPanelRef}
        dockSide={assistantAvailable ? assistantDockSide : null}
        collapsed={assistantAvailable && assistantDockCollapsed}
        dragging={assistantDragging}
        panelStyle={!assistantAvailable ? undefined : assistantDockSide ? { width: assistantDockWidth } : {
          ...(fusionAnchor ? {
            position: "fixed", left: fusionAnchor.left, bottom: fusionAnchor.bottom, top: "auto", transform: "none",
            maxHeight: assistantOpen
              ? `calc(100dvh - ${fusionAnchor.bottom + ASSISTANT_VIEWPORT_MARGIN}px)`
              : `min(72dvh, calc(100dvh - ${fusionAnchor.bottom + ASSISTANT_VIEWPORT_MARGIN}px))`
          } : {}),
          ...(assistantSize ? {
            // 折叠态也沿用展开态的宽度，避免收起再展开时面板横向跳变。
            width: `${assistantSize.width}px`,
            ...(assistantOpen ? { height: `${assistantSize.height}px` } : {})
          } : {})
        }}
        resizePointerHandlers={assistantDockSide ? undefined : {
          onPointerDown: startAssistantResize,
          onPointerMove: resizeAssistant,
          onPointerUp: endAssistantResize,
          onPointerCancel: endAssistantResize
        }}
        dockResizePointerHandlers={assistantDockSide ? {
          onPointerDown: startAssistantDockResize,
          onPointerMove: resizeAssistantDock,
          onPointerUp: endAssistantDockResize,
          onPointerCancel: cancelAssistantDockResize,
          onKeyDown: handleAssistantDockResizeKeyDown
        } : undefined}
        headerPointerHandlers={{
          onPointerDown: startAssistantDrag
        }}
        rightRailOpen={rightRailOpen}
        key={`${boardId ?? "board"}:${assistantSurface}`}
        open={assistantAvailable && assistantOpen}
        busy={assistantAvailable && (assistantStreaming || Boolean(assistantActivity))}
        inputDisabled={assistantAvailable && Boolean(assistantInteraction)}
        confirmationId={assistantInteraction?.state.id}
        confirmation={assistantAvailable && assistantInteraction ? <AssistantInteraction
          key={assistantInteraction.state.id}
          state={assistantInteraction.state}
          disabled={Boolean(assistantActivity)}
          onSubmit={submitAssistantInteraction}
          onGenerate={generateAssistantInteraction}
          onDismiss={dismissAssistantInteraction}
          onRefine={refineAssistantInteraction}
        /> : null}
        value={assistantValue}
        directValue={promptDraft}
        getDirectValue={() => promptDraftRef.current}
        latestPrompt={[...assistantMessages].reverse().find((message) => message.role === "assistant" && !message.streaming && message.tone !== "error" && message.generatedPrompt?.trim())?.generatedPrompt}
        contextImages={assistantContextImages}
        onOpenChange={(open) => {
          syncPromptToParent();
          if (assistantDockSide && !open) { collapseDockedAssistant(); return; }
          if (open) {
            // Re-enter from the bottom anchor so the collapsed bar and the
            // expanded Fusion panel do not flash through the old drag offset.
            setAssistantOffset({ x: 0, y: 0 });
          }
          setAssistantOpen(open);
        }}
        onValueChange={setAssistantValue}
        onDirectValueChange={(value) => { handlePromptChange(value); syncPromptToParent(value); }}
        onPromptContextChange={setFusionPromptContext}
        onSubmit={submitAssistant}
        onStop={stopAssistant}
        onPasteImages={onPasteImages}
        onPasteCanvasReferences={onPasteCanvasReferences}
        extra={<>
          {editTarget ? (
            <div className="fusion-edit-tools" data-tour="edit-banner">
              <div className="flex min-w-0 items-center gap-1">
                {editSmartSuggestionsEnabled ? <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                    aria-expanded={suggestedEditsExpanded && suggestedEdits.length > 0}
                    aria-controls="fusion-suggested-edit-list"
                    disabled={suggestedEdits.length === 0}
                    onClick={() => setSuggestedEditsExpanded((value) => !value)}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    <span aria-live="polite">{suggestingEdits && suggestedEdits.length === 0 ? t("prompt.smartSuggestions.loading") : uiText("编辑建议")}</span>
                    {suggestedEdits.length > 0 ? (suggestedEditsExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />) : null}
                  </Button>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          aria-label={t(suggestingEdits ? "prompt.smartSuggestions.regenerating" : "prompt.smartSuggestions.regenerate")}
                          disabled={suggestingEdits || !canSuggestEdits}
                          onClick={onRegenerateSuggestedEdits}
                        >
                          {suggestingEdits ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{t(canSuggestEdits ? "prompt.smartSuggestions.regenerate" : "prompt.smartSuggestions.noModel")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </> : null}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground" onClick={() => { syncPromptToParent(); onOpenAdvancedEdit(); }}>
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                    {t("prompt.editBanner.advanced")}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={t("prompt.editBanner.exit")} title={t("prompt.editBanner.exit")} onClick={() => { syncPromptToParent(); onExitEdit(); }}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
              <ul id="fusion-suggested-edit-list" hidden={!editSmartSuggestionsEnabled || !suggestedEditsExpanded || suggestedEdits.length === 0} className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {suggestedEdits.map((suggestion, index) => (
                  <li key={`${suggestion}:${index}`}>
                    <button type="button" onClick={() => onApplySuggestedEdit(suggestion)} title={t("prompt.smartSuggestions.item", { suggestion })} className="flex min-h-8 w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {activeScene ? <details className="prompt-template-reference"><summary>
            <LayoutTemplate size={14} aria-hidden="true" />
            <span className="prompt-template-reference-label">{uiText("模板")}</span>
            <span className="prompt-template-reference-name" title={activeScene.name}>{activeScene.name}</span>
            <ChevronDown size={14} className="prompt-template-reference-chevron" aria-hidden="true" />
          </summary><div className="prompt-template-reference-content">
            <p className="max-h-24 overflow-auto whitespace-pre-wrap py-2">{activeScene.prompt}</p>
            {templatePreviewImages.length ? <div className="my-2 flex gap-2">{templatePreviewImages.map((preview, index) => <button
              key={preview.src} type="button" className="h-14 w-20 overflow-hidden rounded" aria-label={uiText("查看模板示例 {{ui:0}}", [index + 1])}
              onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTemplatePreviewLightbox({ src: preview.src, sourceRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }); }}>
              <img src={preview.src} alt={uiText("模板示例 {{ui:0}}", [index + 1])} className="h-full w-full object-cover" />
            </button>)}</div> : null}
            {templateMediaLoading ? <p role="status">{uiText("正在加载示例…")}</p> : null}
            {templateMediaError ? <button type="button" onClick={() => setTemplateMediaReloadNonce((current) => current + 1)}>{uiText("重新加载示例")}</button> : null}
            <div className="flex gap-3"><button type="button" onClick={() => setScenePickerOpen(true)}>{uiText("更换模板")}</button><button type="button" onClick={() => onInputChange({ sceneId: undefined })}>{uiText("移除模板")}</button></div>
          </div></details> : null}
          {uiBriefPreview ? <details className="mb-2 text-xs"><summary>UI Brief · {uiBriefPreview.brief.goal}</summary><p>{uiBriefPreview.brief.structure}</p><p>{uiBriefPreview.brief.visualDirection}</p></details> : null}
          {isUiDesignMode && input.referenceImages.length ? <details className="mb-2 text-xs"><summary>{uiText("材料职责")}</summary>{input.referenceImages.map((image) => <label className="my-2 flex items-center justify-between gap-2" key={image.id}><span className="truncate">{image.name}</span><select aria-label={t("prompt.uiDesign.role.changeFor", { name: image.name })} value={image.semanticRole ?? inferUiMaterialRole(image.name)} onChange={(event) => changeUiMaterialRole(image.id, event.target.value as UiMaterialRole)}>{UI_MATERIAL_ROLES.map((role) => <option key={role} value={role}>{t(UI_MATERIAL_ROLE_MESSAGE_KEYS[role])}</option>)}</select></label>)}</details> : null}

        </>}
        directEditor={<InlinePromptEditor
          ref={promptEditorRef} prompt={promptDraft} templatePrompts={sceneTemplatePrompts}
          height={Math.min(128, Math.max(56, visiblePromptHeight))} dragging={false}
          reduceMotion={Boolean(reduceMotion)} onFocus={handlePromptFocus} onChange={handlePromptChange}
          onSubmitKey={handleKeyDown} onPasteCanvasItems={(items) => onPasteCanvasReferences(items.map((item) => item.image))}
          onPasteImages={onPasteImages}
          placeholder={editTarget ? t("prompt.placeholder.edit") : t("prompt.placeholder.generate")}
        />}
        controls={<>
          <ReferencePicker boardImages={boardImages} referenceCount={input.referenceImages.length} referencedNodeIds={referencedNodeIds}
            atLimit={input.referenceImages.length >= 4} showLabel={false} materialMode={isUiDesignMode} reduceMotion={Boolean(reduceMotion)}
            onAddCanvasReference={onAddCanvasReference} onReferenceFiles={onReferenceFiles} />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" data-tour="dock-template" aria-label={t("prompt.template.choose")} onClick={() => setScenePickerOpen(true)}><Library className="h-4 w-4" /></Button>
          {providers.length ? <ProviderPicker providers={providers} activeProviderId={activeProviderId}
            creditStatus={creditStatus} creditLoading={creditLoading} requiredCredits={officialRequiredCredits}
            showLabel={false} reduceMotion={Boolean(reduceMotion)} onSelect={onSelectProvider} onManage={onOpenModelManagement} /> : null}
          <GenerationSettingsPicker size={input.size} count={input.n} quality={input.quality} model={input.model} workflowMode={input.workflowMode} transparentBackground={input.background === "transparent"}
            maxCount={maxImageCount} provider={activeProvider} onSizeChange={(size) => onInputChange({ size })}
            onQualityChange={(quality) => onInputChange({ quality })}
            onCountChange={(n) => onInputChange({ n })} onTransparentBackgroundChange={(enabled) => onInputChange({ background: enabled ? "transparent" : "auto", outputFormat: "png" })}
          />
          {!editTarget && input.workflowMode === "generate" ? <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={uiText("创作模式")}><LayoutTemplate /></Button></DropdownMenuTrigger>
            <DropdownMenuContent side="top"><DropdownMenuRadioGroup value={creationMode} onValueChange={(value) => changeCreationMode(value as CreationMode)}>
              <DropdownMenuRadioItem value="general">{t("prompt.creationMode.general")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ui-design">{t("prompt.creationMode.uiDesign")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu> : null}
          {activeCount > 0 ? <span role="status" className="text-xs text-muted-foreground">{activeCount} {uiText("项任务")}</span> : null}
        </>}
        directAction={<GenerateActionButton buttonStyle={generateButtonStyle} compact
          disabled={!canSubmit && !needsProviderSetup && !templateNeedsProviderSetup && !uiBriefNeedsProviderSetup}
          onClick={needsProviderSetup || templateNeedsProviderSetup || uiBriefNeedsProviderSetup ? onOpenSettings : () => void handleSubmit()}>
          {needsProviderSetup ? uiText("去配置") : isUiDesignMode ? uiGenerateActionLabel : templateResolving ? uiText("正在生成预览") : activeScene && !templatePromptPreviewReady ? uiText("预览提示词") : editTarget ? uiText("应用修改") : uiText("生成 {{ui:0}} 张", [input.n])}
        </GenerateActionButton>}
        assistant={<Suspense fallback={<div className="p-4 text-sm" role="status">{uiText("正在加载助手…")}</div>}>
          <AiAssistant  hideComposer variant={assistantDockSide ? "docked" : "floating"} dockSide={assistantDockSide ?? undefined} compact
            hideInteraction
            headerPointerHandlers={{
              onPointerDown: startAssistantDrag
            }}
            title={isUiDesignMode ? t("assistant.title.uiDesign") : assistantSurface === "canvas-edit" ? t("assistant.title.imageEdit") : uiText("创作助手")}
            messages={assistantMessages.length ? assistantMessages : [{
              id: "fusion-greeting", role: "assistant",
              content: buildPromptAssistantGreeting(promptDraft, { editing: editTarget !== null, referenceCount: input.referenceImages.length, templateName: activeScene?.name }, locale)
            }]}
            value={assistantValue} streaming={assistantStreaming} activityLabel={assistantActivity ?? undefined}
            interaction={assistantInteraction?.state} disabled={Boolean(assistantActivity)}
            intentSuggestionsEnabled={assistantIntentSuggestionsEnabled} intentSuggestionCount={assistantIntentSuggestionCount}
            intentSuggestions={assistantIntentSuggestions.length ? assistantIntentSuggestions : assistantMessages.length === 0 ? [uiText("帮我探索创作方向"), uiText("帮我调整背景与光线"), uiText("帮我整理完整提示词")] : []} intentSuggestionsLoading={assistantIntentSuggestionsLoading}
            history={assistantHistory} historyLoading={assistantHistoryLoading} historyScope={assistantHistoryScope}
            currentConversationId={assistantConversationId} onValueChange={setAssistantValue} onSubmit={submitAssistant} onStop={stopAssistant}
            onClose={assistantDockSide ? () => collapseDockedAssistant() : undefined}
            onIntentSuggestionSelect={selectAssistantIntentSuggestion}
            onRefreshIntentSuggestions={() => void requestAssistantIntentSuggestions("divergent")}
            onInteractionSubmit={submitAssistantInteraction} onInteractionDismiss={dismissAssistantInteraction}
            onInteractionRefine={refineAssistantInteraction} onInteractionGenerate={generateAssistantInteraction}
            onHistoryOpen={() => void loadAssistantHistory()} onHistoryScopeChange={changeAssistantHistoryScope}
            onHistorySelect={selectAssistantHistory} onNewConversation={startNewAssistantConversation}
            onApplyGeneratedPrompt={applyReviewedAssistantPrompt}
          />
        </Suspense>}
      />
      <input
        ref={assistantFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onReferenceFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <AnimatePresence initial={false}>
        {assistantOpen && assistantDragging && assistantDockPreview ? (
          <motion.aside
            key={`assistant-dock-preview-${assistantDockPreview.side}`}
            aria-hidden="true"
            data-assistant-dock-preview={assistantDockPreview.side}
            initial={reduceMotion
              ? { opacity: 0 }
              : {
                opacity: 0,
                scaleX: 0.96,
                x: assistantDockPreview.side === "left" ? -8 : 8
              }}
            animate={{
              opacity: 0.28 + assistantDockPreview.strength * 0.42,
              scaleX: 0.985 + assistantDockPreview.strength * 0.015,
              x: 0
            }}
            exit={reduceMotion
              ? { opacity: 0 }
              : {
                opacity: 0,
                scaleX: 0.98,
                x: assistantDockPreview.side === "left" ? -4 : 4
              }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: EASE_OUT }}
            className={cn(
              "pointer-events-none fixed bottom-0 top-12 z-20 overflow-hidden bg-card/55",
              assistantDockPreview.side === "left"
                ? "left-0 origin-left border-r border-border"
                : "right-0 origin-right border-l border-border"
            )}
            style={{ width: `${assistantDockWidth}px` }}
          >
            <motion.span
              className={cn(
                "absolute z-10 h-12 w-1 rounded-full bg-[hsl(var(--ring))]",
                assistantDockPreview.side === "left" ? "right-0" : "left-0"
              )}
              initial={false}
              animate={{
                opacity: 0.55 + assistantDockPreview.strength * 0.45,
                scaleY: 0.58 + assistantDockPreview.strength * 0.42,
                y: "-50%"
              }}
              transition={{ duration: reduceMotion ? 0 : 0.12, ease: EASE_OUT }}
              style={{
                top: Math.max(72, Math.min(window.innerHeight - 72, assistantDockPreview.centerY))
              }}
            />
            <span
              className={cn(
                "absolute top-3 flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground",
                assistantDockPreview.side === "left" ? "right-2" : "left-2"
              )}
            >
              {assistantDockPreview.side === "left"
                ? <PanelLeft className="h-4 w-4" />
                : <PanelRight className="h-4 w-4" />}
            </span>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {assistantAvailable && assistantOpen && assistantDockCollapsed && assistantDockSide ? (
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  ref={assistantExpandButtonRef}
                  key="assistant-expand-button"
                  type="button"
                  aria-label={t("assistant.expand")}
                  initial={reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: assistantDockSide === "right" ? 12 : -12, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: assistantDockSide === "right" ? 8 : -8, scale: 0.94 }}
                  transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: EASE_OUT }}
                  onClick={expandDockedAssistant}
                  className={cn(
                    "fixed top-16 z-30 flex h-10 w-10 items-center justify-center rounded-lg border border-[#dededa] bg-[#fbfbf9] text-[#686865] shadow-[0_3px_8px_rgba(22,22,20,0.12)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#eeeeeb] hover:text-[#242422] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/45 motion-reduce:transform-none motion-reduce:transition-none dark:border-border dark:bg-background dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
                    assistantDockSide === "right" ? "right-2" : "left-2"
                  )}
                >
                  {assistantDockSide === "right"
                    ? <PanelRightOpen className="h-[18px] w-[18px]" aria-hidden />
                    : <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side={assistantDockSide === "right" ? "left" : "right"}>
                {t("assistant.expand")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </AnimatePresence>

      {scenePickerOpen ? (
        <Suspense fallback={null}>
          <ScenePickerDialog
            open
            scenes={scenes.filter((scene) => scene.mode === input.workflowMode)}
            favoriteSceneIds={favoriteSceneIds}
            currentPrompt={promptDraftRef.current}
            mode={input.workflowMode}
            useCase={input.useCase ?? "other"}
            onOpenChange={setScenePickerOpen}
            onSelect={(scene) => {
              onApplyScene(scene);
              setScenePickerOpen(false);
            }}
            onToggleFavorite={onToggleFavoriteScene}
            onSave={onSaveScene}
            onManage={() => {
              setScenePickerOpen(false);
              onOpenSceneLibrary();
            }}
          />
        </Suspense>
      ) : null}

      <AnimatePresence>
        {templatePreviewLightbox ? (
          <ImageZoomLightbox
            key={templatePreviewLightbox.src}
            src={templatePreviewLightbox.src}
            alt={uiText("{{ui:0}}示例大图", [activeScene?.name ?? "模板"])}
            sourceRect={templatePreviewLightbox.sourceRect}
            onClose={() => setTemplatePreviewLightbox(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
