import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useAssistantSessionState, type AssistantIntentSuggestionMode } from "@/features/assistant/use-assistant-session-state";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Blend,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock3,
  ImagePlus,
  LayoutTemplate,
  Library,
  Loader2,
  Maximize2,
  Minus,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Server,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import type {
  AssistantIntentSuggestionCount,
  AssistantSurface,
  BoardMutationPlan,
  ComicDramaBoardSnapshot,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  CreationMode,
  CreditStatus,
  FalModelPrice,
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
import { IMAGE_CREDIT_COST } from "@shared/types";
import { validateGptImageSize } from "@shared/workflow";
import { getProviderModels } from "@shared/provider-models";
import type { GeneratedImage } from "@/components/canvas/ImageNode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AssistantAwarenessCanvas } from "@/components/workbench/AssistantAwarenessCanvas";
import { InlinePromptEditor } from "@/components/workbench/InlinePromptEditor";
import { PromptFusionDock } from "./PromptFusionDock";
import { startPointerDragSession, type PointerDragSession } from "@/lib/pointer-drag-session";
import { FusionPromptConfirmation } from "./FusionPromptConfirmation";
import { mergeAssistantToolCall, settleAssistantToolCalls } from "@shared/assistant-display";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import type {
  AiAssistantInteractionState,
  AiAssistantInteractionValues,
  AiAssistantContextImage,
  AiAssistantMessage,
  AiAssistantReceipt,
  AiAssistantReceiptAction,
  AiAssistantResizeCorner
} from "@/components/assistant/AiAssistant";
import {
  buildAssistantConfirmationPreview,
  buildAssistantActionConfirmInteraction,
  formatAssistantInteractionAnswers,
  resolveAssistantInteraction,
  type AssistantConfirmationPreview
} from "@/lib/assistant-interaction";
import {
  buildPromptAssistantCurrentFields,
  buildPromptAssistantGreeting,
  resolveAssistantGenerationCount,
  sceneAssistantFieldsToPrompt,
  settleCancelledAssistantMessages,
  settleFailedAssistantMessage
} from "@/lib/prompt-assistant";
import { startSceneCollaborationStream } from "@/lib/scene-collaboration-stream";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import {
  ASSISTANT_PROMPT_IDLE_MS,
  buildAssistantContextSignature,
  getAssistantAwarenessCopy,
  shouldScheduleAssistantPromptAnalysis
} from "@/lib/assistant-awareness";
import { buildAssistantHistory, getLatestAssistantConversation, type AssistantHistoryConversation } from "@/lib/assistant-history";
import { getAssistantShortcutDescriptor, matchesAssistantShortcut } from "@/lib/assistant-shortcut";
import { readAssistantPanelSize, writeAssistantPanelSize, type AssistantPanelSize } from "@/lib/assistant-panel-size";
import {
  ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH,
  readAssistantDockLayout,
  resolveAssistantDockMagnet,
  resolveAssistantDockWidth,
  writeAssistantDockLayout,
  type AssistantDockLayout,
  type AssistantDockSide
} from "@/lib/assistant-panel-docking";
import { getProviderMaxImageCount } from "@/lib/provider-image-count";
import { providerSupportsTransparentBackground } from "@/lib/provider-transparent-background";
import { shouldOpenTextProviderSettings, type TextProviderReadinessStatus } from "@/lib/text-provider-readiness";
import { getProviderImageSizeOptions, providerSupportsCustomImageSize } from "@/lib/provider-image-sizes";
import { getScenePreviewImages } from "@/lib/scene-media";
import { isSendEnter } from "@/lib/send-on-enter";
import { findSceneForMode, getQuickScenes, type NewSceneInput, type SceneDefinition } from "@/lib/scene-library";
import { gsap, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import {
  comicDramaAssistantContext,
  comicDramaAssistantGuide,
  createComicCharactersMutationPlan,
  createComicDramaMutationPlan
} from "@/lib/comic-drama-assistant";
import { useI18n, type MessageKey } from "@/i18n";
import { localizeLegacyText } from "@/i18n/legacy-messages";
import {
  buildUiDesignAssistantGreeting,
  buildUiDesignAssistantInstruction,
  createUiDesignBrief,
  hasUiDesignBriefFields,
  inferUiMaterialRole,
  uiDesignBriefToFields
} from "@/lib/ui-design-workflow";

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

function ToolbarReveal({
  visible,
  reduceMotion,
  children,
  className
}: {
  visible: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span
      aria-hidden={!visible}
      className={cn(
        "prompt-dock-toolbar-label hidden min-w-0 overflow-hidden whitespace-nowrap sm:grid",
        visible ? "ml-1 grid-cols-[1fr] opacity-100" : "ml-0 grid-cols-[0fr] opacity-0",
        !reduceMotion && "transition-[grid-template-columns,margin-left,opacity] duration-300 ease-out",
        className
      )}
    >
      <span className="min-w-0 overflow-hidden">{children}</span>
    </span>
  );
}

function ToolbarTooltip({
  label,
  disabled = false,
  children
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactElement;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip
        open={!disabled && open}
        onOpenChange={(next) => setOpen(!disabled && next)}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const DEFAULT_PROMPT_HEIGHT = 80;
const MIN_PROMPT_HEIGHT = 56;
const COLLAPSED_PROMPT_HEIGHT = 44;
const PROMPT_PARENT_SYNC_DELAY_MS = 250;
const PRISMATIC_LAYERS = [
  { delay: "0s", duration: "25s" },
  { delay: "0.15s", duration: "15.9s" },
  { delay: "0.53s", duration: "26.4s" },
  { delay: "0.45s", duration: "17.8s" },
  { delay: "1.6s", duration: "19.2s" },
  { delay: "1.6s", duration: "29.2s" },
  { delay: "1.6s", duration: "20.2s" }
] as const;
const ASSISTANT_VIEWPORT_MARGIN = 12;
const ASSISTANT_MIN_WIDTH = 300;
const ASSISTANT_MIN_HEIGHT = 360;

interface DockDragState {
  startY: number;
  startHeight: number;
  currentHeight: number;
}

interface AssistantDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: { x: number; y: number };
  startRect: DOMRect;
  dockCandidate: AssistantDockSide | null;
  originDockSide: AssistantDockSide | null;
  detached: boolean;
  position?: { left: number; top: number; bottom: number };
  translation?: { x: number; y: number };
  detachMetrics?: {
    width: number;
    height: number;
    grabX: number;
    grabY: number;
    floatingBaseLeft: number;
    floatingBaseTop: number;
  };
}

interface AssistantResizeState {
  pointerId: number;
  corner: AiAssistantResizeCorner;
  startX: number;
  startY: number;
  startOffset: { x: number; y: number };
  startRect: DOMRect;
  currentSize: AssistantPanelSize;
}

interface AssistantDockResizeState {
  pointerId: number;
  side: AssistantDockSide;
  startX: number;
  startWidth: number;
  currentWidth: number;
}

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
}

function dataUrlToAssistantReference(dataUrl: string, name: string): SceneAssistantReference | null {
  const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, dataBase64] = match;
  return mimeType && dataBase64 ? { name, mimeType, dataBase64 } : null;
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

function promptFromMemory(content: string): string {
  return content.replace(/^(?:最近实际使用的提示词|最近正在构思)：/, "").trim();
}

function memorySuggestionLabel(content: string): string {
  const prompt = promptFromMemory(content).replace(/\s+/g, " ");
  return prompt.length > 18 ? `${prompt.slice(0, 18)}…` : prompt;
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
  onGeneratePrompts: (requests: AssistantGenerationRequest[], assistantConversationId?: string) => void;
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
  queuedCount = 0,
  canGenerate,
  generateButtonStyle,
  needsProviderSetup,
  providerBlocksGenerateReferences,
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
  autoCollapse,
  boardSmartSuggestionsEnabled,
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
  // Effect lifetimes depend on context; action implementations read the latest render.
  const assistantEffectActionsRef = useRef({ clearAssistantAutoPromptTimer, cancelBackgroundAssistantRequest, restoreAssistantConversation, stopAssistant });
  assistantEffectActionsRef.current = { clearAssistantAutoPromptTimer, cancelBackgroundAssistantRequest, restoreAssistantConversation, stopAssistant };

  const uiText = useUiText();

  const { locale, t } = useI18n();
  const [promptHeight, setPromptHeight] = useState(DEFAULT_PROMPT_HEIGHT);
  const [maxPromptHeight, setMaxPromptHeight] = useState(360);
  const [expanded, setExpanded] = useState(false);
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(assistantEnabled && !comicDramaSnapshot);
  const [fusionPromptContext, setFusionPromptContext] = useState<string | null>(null);
  const autoOpenedComicBoardRef = useRef<string | undefined>(undefined);
  const {
  assistantHasUnreadResult,
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
  memorySuggestions,
  setMemorySuggestions,
  assistantMessages,
  setAssistantMessages,
  assistantConversationId,
  setAssistantConversationId,
  assistantHistory,
  setAssistantHistory,
  assistantHistoryLoading,
  setAssistantHistoryLoading,
  assistantHistoryScope,
  setAssistantHistoryScope,
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
  assistantBranchSignatureRef,
  assistantRestoredBoardIdRef
} = useAssistantSessionState();

  const [templateResolving, setTemplateResolving] = useState(false);
  const [templatePromptPreview, setTemplatePromptPreview] = useState<TemplatePromptPreview | null>(null);
  const [uiBriefResolving, setUiBriefResolving] = useState(false);
  const [uiBriefPreview, setUiBriefPreview] = useState<UiDesignBriefPreview | null>(null);
  const [templateMedia, setTemplateMedia] = useState<SceneMediaSummary | undefined>();
  const [templateMediaLoading, setTemplateMediaLoading] = useState(false);
  const [templateMediaError, setTemplateMediaError] = useState(false);
  const [templateMediaReloadNonce, setTemplateMediaReloadNonce] = useState(0);
  const [brokenTemplatePreviewSrcs, setBrokenTemplatePreviewSrcs] = useState<Set<string>>(() => new Set());
  const [templatePreviewLightbox, setTemplatePreviewLightbox] = useState<TemplatePreviewLightbox | null>(null);
  const [assistantOffset, setAssistantOffset] = useState({ x: 0, y: 0 });
  const [fusionAnchor, setFusionAnchor] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => { setFusionAnchor(null); }, [boardId]);
  const [assistantDockPreference, setAssistantDockPreference] =
    useState<AssistantDockLayout | null>(readAssistantDockLayout);
  const [assistantDockSide, setAssistantDockSide] = useState<AssistantDockSide | null>(null);
  const [assistantDockCollapsed, setAssistantDockCollapsed] = useState(false);
  const [assistantDockPreview, setAssistantDockPreview] = useState<{
    side: AssistantDockSide;
    strength: number;
    centerY: number;
  } | null>(null);
  const [assistantDragging, setAssistantDragging] = useState(false);

  const [assistantSize, setAssistantSize] = useState<AssistantPanelSize | null>(readAssistantPanelSize);
  const [assistantDockWidthOverride, setAssistantDockWidthOverride] = useState<number | null>(null);

  const [inlineVariableExpanded, setInlineVariableExpanded] = useState(false);
  const [suggestedEditsExpanded, setSuggestedEditsExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DockDragState | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const promptEditorRef = useRef<HTMLDivElement>(null);
  const assistantFileInputRef = useRef<HTMLInputElement>(null);
  const assistantPanelRef = useRef<HTMLDivElement>(null);
  const assistantExpandButtonRef = useRef<HTMLButtonElement>(null);
  const assistantDragRef = useRef<AssistantDragState | null>(null);
  const assistantDragSessionRef = useRef<PointerDragSession | null>(null);
  const assistantDragSequenceRef = useRef(0);
  useLayoutEffect(() => {
    if (!assistantDragging) assistantPanelRef.current?.style.removeProperty("translate");
  }, [assistantDragging, assistantDockSide, fusionAnchor, assistantOffset]);
  const assistantResizeRef = useRef<AssistantResizeState | null>(null);
  const assistantDockResizeRef = useRef<AssistantDockResizeState | null>(null);

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
  const assistantShortcutActionRef = useRef<() => void>(() => {});
  const onAssistantDockLayoutChangeRef = useRef(onAssistantDockLayoutChange);
  const promptSyncTimerRef = useRef<number | null>(null);

  const promptDraftRef = useRef(input.prompt);
  const parentPromptRef = useRef(input.prompt);
  const pendingParentPromptRef = useRef<string | null>(null);

  /** 最近一次从输入框真正提交生成的提示词，供“下一集/继续”在输入框清空后延续。 */

  const reduceMotion = useReducedMotion();
  const assistantShortcut = useMemo(() => getAssistantShortcutDescriptor(), []);
  assistantOpenRef.current = assistantOpen;
  comicDramaSnapshotRef.current = comicDramaSnapshot;
  onAssistantDockLayoutChangeRef.current = onAssistantDockLayoutChange;
  parentPromptRef.current = input.prompt;
  const promptDraft = input.prompt;

  useEffect(() => {
    return () => {
      void onAssistantDockLayoutChangeRef.current?.(null);
    };
  }, []);

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0];
  const maxImageCount = getProviderMaxImageCount(activeProvider);
  const creationMode: CreationMode = input.creationMode ?? "general";
  const isUiDesignMode = creationMode === "ui-design" && input.workflowMode === "generate" && editTarget === null;
  const assistantAvailable = assistantEnabled || isUiDesignMode;
  // 输入框、参考图或已选模板任一存在时不进入缩小模式，避免藏起正在准备的生成上下文。
  const hasDockContent = promptDraft.trim().length > 0 || input.referenceImages.length > 0 || Boolean(input.sceneId);
  // 系统设置关闭"锚点展开收起"时始终保持宽模式；编辑会话强制展开。
  const isExpanded = !autoCollapse || expanded || editTarget !== null || hasDockContent;
  const isAiMode = Boolean(input.sceneId);
  // 漫剧子画板拥有独立的 ComicDramaWorkspace 助手。主画板上的入口卡片
  // 仍使用通用创作助手，避免把漫剧阶段引导和普通画布创作混在一起。
  const comicDramaActive: boolean = false;
  const assistantSurface: AssistantSurface = editTarget ? "canvas-edit" : comicDramaActive ? "comic-drama" : "canvas-prompt";
  const fusionEnabled = assistantAvailable && assistantSurface !== "comic-drama";
  useEffect(() => {
    const panel = assistantPanelRef.current;
    // Reset on board/surface changes, and release native listeners on unmount.
    setAssistantDragging(false);
    setAssistantDockPreview(null);
    return () => {
      assistantDragSequenceRef.current += 1;
      assistantDragSessionRef.current?.dispose();
      assistantDragSessionRef.current = null;
      assistantDragRef.current = null;
      panel?.style.removeProperty("translate");
    };
  }, [boardId, assistantSurface, fusionEnabled]);
  useEffect(() => {
    if (fusionEnabled) setAssistantOpen(true);
    setFusionPromptContext(null);
  }, [fusionEnabled, boardId, assistantSurface]);
  const comicDramaGuide = useMemo(
    () => comicDramaSnapshot ? comicDramaAssistantGuide(comicDramaSnapshot, comicDramaSelectedNodeIds) : null,
    [comicDramaSelectedNodeIds, comicDramaSnapshot]
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
  const editTargetPath = editTarget?.path ?? "";
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
  const smartSuggestionsEnabled = editTarget !== null
    ? editSmartSuggestionsEnabled
    : boardSmartSuggestionsEnabled;
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
  const templateSummaryPreview = templatePreviewImages.find(
    (preview) => !brokenTemplatePreviewSrcs.has(preview.src)
  );
  const quickScenes = useMemo(
    () => getQuickScenes(scenes, favoriteSceneIds, input.workflowMode, editTargetPath.length > 0),
    [editTargetPath, favoriteSceneIds, input.workflowMode, scenes]
  );
  const structuredLineCount = input.sceneId ? promptDraft.split("\n").length : 1;
  const structuredPromptHeight = Math.min(
    maxPromptHeight,
    Math.max(DEFAULT_PROMPT_HEIGHT, structuredLineCount * 32 + 8)
  );
  const visiblePromptHeight = isExpanded ? promptHeight : COLLAPSED_PROMPT_HEIGHT;
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
  const assistantWorking = assistantStreaming || Boolean(assistantActivity) || assistantIntentSuggestionsLoading;
  const assistantAwarenessCopy = getAssistantAwarenessCopy({
    visible: assistantOpen,
    working: assistantWorking,
    unread: assistantHasUnreadResult
  });

  useEffect(() => {
    const sceneId = activeScene?.id;
    setTemplateMedia(undefined);
    setTemplateMediaError(false);
    setBrokenTemplatePreviewSrcs(new Set());
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
        setExpanded(true);
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
        setExpanded(true);
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
    // 提交后让输入区回到紧凑态；若参考图仍在（有内容），派生的 isExpanded 会保持展开，
    // 此时高度用默认值而不是收起高度，避免展开态下编辑器被压扁。
    setPromptHeight(DEFAULT_PROMPT_HEIGHT);
    setExpanded(false);
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

  const assistantIntentAvailabilityRef = useRef({ assistantStreaming, assistantActivity, assistantInteraction });
  assistantIntentAvailabilityRef.current = { assistantStreaming, assistantActivity, assistantInteraction };
  // 推荐是入口提示，不应随着每次输入、消息流式更新或画布字段变化而
  // 自动重刷；否则用户会看到推荐内容不断跳变。打开助手时加载一次，
  // 后续只由用户点击“换一组”或切换助手上下文触发更新。
  useEffect(() => {
    if (
      !assistantOpen ||
      assistantSurface === "comic-drama" ||
      !assistantIntentSuggestionsEnabled ||
      !supportsPromptEnhancement ||
      assistantIntentAvailabilityRef.current.assistantStreaming ||
      assistantIntentAvailabilityRef.current.assistantActivity ||
      assistantIntentAvailabilityRef.current.assistantInteraction
    ) return;
    const timer = window.setTimeout(() => {
      void requestAssistantIntentSuggestionsRef.current();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    assistantIntentSuggestionsEnabled,
    assistantOpen,
    assistantSurface,
    requestAssistantIntentSuggestionsRef,
    supportsPromptEnhancement
  ]);

  useEffect(() => {
    if (assistantBranchSignatureRef.current === assistantBranchSignature) return;
    assistantBranchSignatureRef.current = assistantBranchSignature;
    // 只有首次进入或切换画板时恢复会话。同一画板的模板、模式等上下文变化
    // 仍按原有语义开启新的助手分支，不能意外跳回旧对话。
    const shouldRestoreBoardConversation = assistantRestoredBoardIdRef.current !== boardId;
    assistantRestoredBoardIdRef.current = boardId;
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
      if (!assistantEnabled || !assistantAwarenessEnabled || !supportsPromptEnhancement) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled || assistantRequestVersionRef.current !== requestVersion) return;
        assistantAnalyzedContextSignatureRef.current = assistantOpeningContextSignature;
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
  }, [
    assistantBranchSignature,
    assistantAwarenessEnabled,
    assistantEnabled,
    assistantOpeningContextSignature,
    assistantSurface,
    boardId,
    comicDramaGuide,
    comicDramaSnapshot,
    editTarget?.path,
    supportsPromptEnhancement,
    assistantBranchSignatureRef,
    assistantRestoredBoardIdRef,
    assistantRequestVersionRef,
    assistantStreamRef,
    assistantAnalyzedContextSignatureRef,
    pendingAssistantReferenceCountRef,
    assistantPreviousGenerationPromptRef,
    assistantClarificationRoundsRef,
    assistantIntentSuggestionHistoryRef,
    assistantSubmittedContextSignatureRef,
    setAssistantConversationId,
    setAssistantHistory,
    setAssistantMessages,
    setAssistantInteraction,
    setAssistantValue,
    setAssistantStreaming,
    setAssistantActivity,
    setAssistantHasUnreadResult,
    setAssistantIntentSuggestions,
    sendAssistantInstructionRef
  ]);

  useEffect(() => {
    if (!assistantOpen) return;

    function clampToViewport(): void {
      const panel = assistantPanelRef.current;
      // 历史记录打开时 Dock 隐藏，不使用零尺寸边界重置助手位置。
      if (!panel || panel.getClientRects().length === 0) return;
      if (assistantDockSide) {
        if (
          window.innerWidth < ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH
          || (assistantDockSide === "right" && rightRailOpen)
        ) {
          setAssistantDockSide(null);
          setAssistantDockPreview(null);
          setAssistantOffset({ x: 0, y: 0 });
          void onAssistantDockLayoutChange?.(null);
        }
        return;
      }
      const rect = panel.getBoundingClientRect();
      const margin = ASSISTANT_VIEWPORT_MARGIN;
      const availableWidth = Math.max(1, window.innerWidth - margin * 2);
      const availableHeight = Math.max(1, window.innerHeight - margin * 2);
      if (
        assistantSize &&
        (rect.width > availableWidth + 0.5 || rect.height > availableHeight + 0.5)
      ) {
        setAssistantSize({
          width: Math.min(rect.width, availableWidth),
          height: Math.min(rect.height, availableHeight)
        });
        return;
      }
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      const targetLeft = Math.min(maxLeft, Math.max(margin, rect.left));
      const targetTop = Math.min(maxTop, Math.max(margin, rect.top));
      const deltaX = targetLeft - rect.left;
      const deltaY = targetTop - rect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      setAssistantOffset((current) => fusionEnabled
        ? { x: targetLeft, y: targetTop }
        : { x: current.x + deltaX, y: current.y + deltaY });
    }

    const frame = window.requestAnimationFrame(clampToViewport);
    window.addEventListener("resize", clampToViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", clampToViewport);
    };
  }, [
    assistantDockSide,
    assistantOpen,
    assistantSize,
    fusionEnabled,
    rightRailOpen,
    onAssistantDockLayoutChange
  ]);

  useEffect(() => {
    if (assistantDockSide || !assistantDockCollapsed) return;
    setAssistantDockCollapsed(false);
  }, [assistantDockCollapsed, assistantDockSide]);

  useEffect(() => {
    if (assistantDockSide && !assistantOpen) setAssistantOpen(true);
  }, [assistantDockSide, assistantOpen]);

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

  useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
  }, []);

  useEffect(() => {
    if (!input.sceneId || structuredLineCount <= 1) return;
    setPromptHeight(structuredPromptHeight);
    setExpanded(true);
  }, [input.sceneId, structuredLineCount, structuredPromptHeight]);

  useEffect(() => {
    if (!promptFocusNonce) return;
    setExpanded(true);
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
    setExpanded(true);
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
    if (next === "ui-design") setExpanded(true);
  }

  function changeUiMaterialRole(id: string, semanticRole: UiMaterialRole): void {
    setUiBriefPreview(null);
    onInputChange({
      referenceImages: input.referenceImages.map((image) => (
        image.id === id ? { ...image, semanticRole } : image
      ))
    });
  }

  function clampHeight(value: number): number {
    return Math.min(maxPromptHeight, Math.max(MIN_PROMPT_HEIGHT, value));
  }

  function handleDragStart(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startHeight = clampHeight(promptEditorRef.current?.getBoundingClientRect().height ?? promptHeight);
    dragRef.current = {
      startY: event.clientY,
      startHeight,
      currentHeight: startHeight
    };
    promptEditorRef.current?.style.setProperty("height", `${startHeight}px`);
    setDragging(true);
  }

  function handleDragMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    // Dragging up should grow the box: subtract the current Y from the start.
    drag.currentHeight = clampHeight(drag.startHeight + drag.startY - event.clientY);

    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const currentDrag = dragRef.current;
      if (!currentDrag) return;
      promptEditorRef.current?.style.setProperty("height", `${currentDrag.currentHeight}px`);
    });
  }

  function handleDragEnd(event: React.PointerEvent<HTMLDivElement>, cancelled = false): void {
    const drag = dragRef.current;
    if (!drag) return;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    if (!cancelled) {
      drag.currentHeight = clampHeight(drag.startHeight + drag.startY - event.clientY);
    }
    promptEditorRef.current?.style.setProperty("height", `${drag.currentHeight}px`);
    setPromptHeight(drag.currentHeight);
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (!isSendEnter(event)) return;
    event.preventDefault();
    if (canSubmit) void handleSubmit();
    else if (needsProviderSetup || templateNeedsProviderSetup || uiBriefNeedsProviderSetup) onOpenSettings();
  }

  const restoreAssistantDockPreference = useCallback((): void => {
    if (
      !assistantDockPreference
      || window.innerWidth < ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH
      || (assistantDockPreference.side === "right" && rightRailOpen)
    ) {
      setAssistantDockSide(null);
      void onAssistantDockLayoutChange?.(null);
      return;
    }
    const layout = {
      side: assistantDockPreference.side,
      width: resolveAssistantDockWidth(assistantDockPreference.width, window.innerWidth)
    } satisfies AssistantDockLayout;
    setAssistantDockSide(layout.side);
    void onAssistantDockLayoutChange?.(layout);
  }, [assistantDockPreference, rightRailOpen, onAssistantDockLayoutChange]);

  useEffect(() => {
    if (fusionEnabled) restoreAssistantDockPreference();
  }, [fusionEnabled, restoreAssistantDockPreference]);

  function openUiDesignAssistant(brief = uiBriefPreview?.brief ?? null): void {
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
    if (fusionEnabled) {
      setAssistantOpen(true);
      setAssistantDockCollapsed(false);
      restoreAssistantDockPreference();
      setAssistantHasUnreadResult(false);
      return;
    }
    if (isUiDesignMode) {
      openUiDesignAssistant();
      return;
    }
    assistantPreviousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const currentPrompt = promptDraftRef.current;
    assistantReferenceSignatureRef.current = assistantReferenceSignature;
    pendingAssistantReferenceCountRef.current = 0;
    setAssistantOffset({ x: 0, y: 0 });
    setAssistantHasUnreadResult(false);
    restoreAssistantDockPreference();
    setAssistantOpen(true);
    if (assistantSurface === "comic-drama" && comicDramaSnapshot) {
      const guide = comicDramaAssistantGuide(comicDramaSnapshot, comicDramaSelectedNodeIds);
      setAssistantMessages((current) => current.length > 0 ? current : [{
        id: crypto.randomUUID(),
        role: "assistant",
        content: guide.message,
        assistantContext: `comic-guide:${comicDramaSnapshot.boardId}:${guide.stage}`
      }]);
      setAssistantIntentSuggestions(guide.suggestions);
      return;
    }
    const hasOpeningContext = Boolean(
      assistantSurface === "canvas-edit" || currentPrompt.trim() || input.referenceImages.length > 0 || activeScene
    );
    const shouldAnalyzeOpeningContext =
      hasOpeningContext &&
      supportsPromptEnhancement &&
      assistantAnalyzedContextSignatureRef.current !== assistantOpeningContextSignature;
    if (shouldAnalyzeOpeningContext) {
      assistantAnalyzedContextSignatureRef.current = assistantOpeningContextSignature;
      void sendAssistantInstruction(
        buildAssistantOpeningInstruction(assistantSurface),
        "",
        false,
        false
      );
      return;
    }
    setAssistantMessages((current) => current.length > 0 ? current : [{
      id: crypto.randomUUID(),
      role: "assistant",
      content: buildPromptAssistantGreeting(currentPrompt, {
        editing: editTarget !== null,
        referenceCount: input.referenceImages.length,
        templateName: activeScene?.name
      }, locale)
    }]);
  }

  async function loadAssistantHistory(scope = assistantHistoryScope): Promise<void> {
    setAssistantHistoryLoading(true);
    try {
      const records = await getImageWorkbenchApi().listAssistantConversations({
        ...(scope === "board" && boardId ? { boardId } : {}),
        surface: assistantSurface,
        ...(editTarget?.path ? { assetPath: editTarget.path } : {})
      });
      setAssistantHistory(buildAssistantHistory(records, boardNameById));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法读取对话历史。"));
      setAssistantHistory([]);
    } finally {
      setAssistantHistoryLoading(false);
    }
  }

  function restoreAssistantConversation(conversation: AssistantHistoryConversation): void {
    assistantRequestVersionRef.current += 1;
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    assistantClarificationRoundsRef.current = 0;
    assistantIntentSuggestionHistoryRef.current = [];
    setAssistantConversationId(conversation.id);
    setAssistantMessages(conversation.messages);
    setAssistantValue("");
    setAssistantInteraction(null);
    setAssistantStreaming(false);
    setAssistantActivity(null);
    setAssistantIntentSuggestions([]);
    setAssistantIntentSuggestionsLoading(false);
  }

  function selectAssistantHistory(conversation: AssistantHistoryConversation): void {
    if (conversation.boardId && conversation.boardId !== boardId && onOpenAssistantConversation) {
      onOpenAssistantConversation(conversation.id, conversation.boardId);
      return;
    }
    restoreAssistantConversation(conversation);
  }

  function changeAssistantHistoryScope(scope: "board" | "all"): void {
    if (scope === assistantHistoryScope) return;
    setAssistantHistoryScope(scope);
    void loadAssistantHistory(scope);
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
    setAssistantHasUnreadResult
  ]);

  function startNewAssistantConversation(): void {
    // 新会话只重置助手上下文，保留生成区里的提示词、模板、参考图和编辑状态。
    const currentPrompt = promptDraftRef.current;
    setAssistantConversationId(crypto.randomUUID());
    setAssistantMessages([{
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantSurface === "comic-drama" && comicDramaSnapshot
        ? comicDramaAssistantGuide(comicDramaSnapshot, comicDramaSelectedNodeIds).message
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
  }, [assistantDockSide, onAssistantDockLayoutChange]);

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
    setExpanded(true);
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

  function submitImmediateAssistantGeneration(prompt: string, count = input.n): void {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    if (assistantSurface === "canvas-prompt") assistantPreviousGenerationPromptRef.current = nextPrompt;
    onGeneratePrompts([{ prompt: nextPrompt, count }], assistantConversationId);
  }

  function applyReviewedAssistantPrompt(prompt: string): void {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
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
                    generationCount ?? previous.n
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
            ? `已提交 ${generationRequests.length} 个方向`
            : `已提交生成 · ${generationRequests[0].count} 张`
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
    if (hasAppliedChange) applyAssistantChanges(changesPrompt ? concisePrompt : "", generationCount);
    const directionMessage = buildAssistantDirectionMessage(result);
    setAssistantMessages((current) => current.map((message) => (
      message.id === assistantMessageId
        ? {
            ...message,
            content: result.message,
            streaming: false,
            generatedPrompt: getAssistantGeneratedPrompt(result) || undefined,
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
      onGeneratePrompts(generationRequests, assistantConversationId);
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
        setExpanded(true);
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
            ...directionMessage
          }
        : message
    )));
    setAssistantValue("");
    setAssistantStreaming(false);
    assistantStreamRef.current = null;

    // 模型主动要求的交互（澄清表单，或旧协议返回的确认）仍走底部面板。
    const interaction = resolveAssistantInteraction(result, assistantSurface);
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
              resolveAssistantGenerationCount(result, maxImageCount) ?? previous.n
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
                nextGenerationCount ?? previous.n
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
      const context = comicDramaAssistantContext(comicDramaSnapshot, comicDramaSelectedNodeIds);
      const selected = comicDramaSnapshot.nodes.filter((node) => comicDramaSelectedNodeIds.includes(node.id));
      const guide = comicDramaAssistantGuide(comicDramaSnapshot, comicDramaSelectedNodeIds);
      return [
        { label: "漫剧上下文", value: context },
        { label: "当前阶段", value: `${guide.stage}：${guide.message}` },
        { label: "画板 revision", value: String(comicDramaSnapshot.revision) },
        { label: "完整漫剧节点快照", value: JSON.stringify(comicDramaSnapshot.nodes) },
        { label: "选中节点快照", value: JSON.stringify(selected) },
        { label: "引用连接与分组摘要", value: JSON.stringify({
          connections: comicDramaSnapshot.connections,
          groups: comicDramaSnapshot.groups
        }) }
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

  async function sendAssistantInstruction(
    instructionValue: string,
    displayContent = instructionValue,
    clearComposer = true,
    showUserMessage = true,
    background = false
  ): Promise<void> {
    const instruction = instructionValue.trim();
    if (!instruction || assistantStreaming || assistantActivity) return;
    if (!supportsPromptEnhancement) {
      const message = promptEnhancementUnavailableMessage || "请先在设置中配置文本 Provider。";
      if (promptEnhancementUnavailableReason === "checking") toast.info(message);
      else toast.error(message);
      if (shouldOpenTextProviderSettings(promptEnhancementUnavailableReason)) {
        onOpenSettings();
      }
      return;
    }

    assistantIntentSuggestionRequestRef.current += 1;
    setAssistantIntentSuggestions([]);
    setAssistantIntentSuggestionsLoading(false);

    const requestVersion = assistantRequestVersionRef.current + 1;
    assistantRequestVersionRef.current = requestVersion;
    const assistantMessageId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const previous = { prompt: promptDraftRef.current, sceneId: input.sceneId, n: input.n };
    setAssistantInteraction(null);
    setAssistantMessages((current) => [
      ...current,
      ...(fusionEnabled && current.length === 0 ? [{
        id: "fusion-greeting", role: "assistant" as const,
        content: buildPromptAssistantGreeting(promptDraftRef.current, {
          editing: editTarget !== null, referenceCount: input.referenceImages.length, templateName: activeScene?.name
        }, locale)
      }] : []),
      ...(showUserMessage
        ? [{ id: userMessageId, role: "user" as const, content: displayContent }]
        : []),
      { id: assistantMessageId, role: "assistant", content: "", streaming: true }
    ]);
    if (clearComposer) setAssistantValue("");
    assistantBackgroundRequestRef.current = background;
    setAssistantStreaming(true);
    setAssistantActivity("正在准备你的请求…");

    try {
      let referenceImages: SceneAssistantReference[];
      if (assistantSurface === "canvas-edit") {
        if (!editTarget?.path) throw new Error("当前编辑图片不可用，请退出编辑模式后重试。");
        let targetDataUrl: string;
        try {
          targetDataUrl = editTarget.dataUrl.startsWith("data:")
            ? editTarget.dataUrl
            : await getImageWorkbenchApi().readAssetDataUrl(editTarget.path);
        } catch {
          throw new Error("无法读取当前编辑图片，请重新打开图片后重试。");
        }
        if (assistantRequestVersionRef.current !== requestVersion) return;
        const targetReference = dataUrlToAssistantReference(targetDataUrl, "当前编辑目标图");
        if (!targetReference) throw new Error("无法读取当前编辑图片，请重新打开图片后重试。");
        referenceImages = [
          targetReference,
          ...input.referenceImages.slice(0, 3).map(({ name, mimeType, dataBase64 }) => ({
            name,
            mimeType,
            dataBase64
          }))
        ];
      } else {
        referenceImages = input.referenceImages.slice(0, 4).map(({ name, mimeType, dataBase64 }) => ({
          name,
          mimeType,
          dataBase64
        }));
      }

      if (showUserMessage) {
        const attachments = referenceImages.map((image, index) => ({
          id: `${userMessageId}:${index}`, name: image.name,
          src: `data:${image.mimeType};base64,${image.dataBase64}`,
          role: assistantSurface === "canvas-edit" && index === 0 ? "edit-target" as const : "reference" as const
        }));
        setAssistantMessages((current) => current.map((message) => message.id === userMessageId ? { ...message, attachments } : message));
      }
      const request = {
        instruction: isUiDesignMode
          ? buildUiDesignAssistantInstruction(instruction, Boolean(uiBriefPreview))
          : instruction,
        locale,
        referenceImages,
        currentFields: [
          ...buildCurrentAssistantFields(),
          ...(fusionPromptContext ? [{ label: "当前提示词上下文", value: fusionPromptContext }] : [])
        ],
        generationSettings: {
          count: input.n,
          maxCount: maxImageCount
        },
        clarificationRounds: assistantClarificationRoundsRef.current,
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-16)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        conversationId: assistantConversationId,
        recordInHistory: showUserMessage,
        assistantSurface,
        ...(isUiDesignMode ? { assistantScenario: "ui-design" as const } : {}),
        memoryQuery: {
          ...(boardId ? { boardId } : {}),
          ...(editTarget?.path ? { assetPath: editTarget.path } : {}),
          ...(input.sceneId ? { sceneId: input.sceneId } : {})
        },
        workflowMode: assistantSurface === "canvas-edit" ? "edit" : input.workflowMode,
        agentMode: assistantSurface === "comic-drama"
          || (assistantAgentModeEnabled && assistantSurface === "canvas-prompt")
      } satisfies CollaborateSceneRequest;

      assistantStreamRef.current = startSceneCollaborationStream(request, {
        onReasoningSummary: (delta) => {
          if (assistantRequestVersionRef.current !== requestVersion) return;
          setAssistantMessages((current) => current.map((message) => message.id === assistantMessageId
            ? { ...message, reasoningSummary: ((message.reasoningSummary ?? "") + delta).slice(0, 12_000) }
            : message));
        },
        onTool: (tool) => {
          if (assistantRequestVersionRef.current !== requestVersion) return;
          setAssistantMessages((current) => current.map((message) => message.id === assistantMessageId
            ? { ...message, toolCalls: mergeAssistantToolCall(message.toolCalls, tool) } : message));
        },
        onDelta: (delta) => {
          if (assistantRequestVersionRef.current !== requestVersion) return;
          setAssistantMessages((current) => current.map((message) => (
            message.id === assistantMessageId ? { ...message, content: message.content + delta } : message
          )));
        },
        onResult: (result) => {
          if (assistantRequestVersionRef.current === requestVersion) {
            // Progress labels (including result-repair activity) belong to the
            // finished request, not the confirmation it may create next.
            setAssistantActivity(null);
            if (assistantSurface === "comic-drama") {
              receiveComicDramaAgentResult(result, assistantMessageId, instruction);
            } else {
              receivePromptAssistantResult(result, assistantMessageId, previous);
            }
            assistantBackgroundRequestRef.current = false;
            if (!assistantOpenRef.current) setAssistantHasUnreadResult(true);
            onAssistantCreditsUsed?.();
          }
        },
        onActivity: (label) => {
          if (assistantRequestVersionRef.current === requestVersion) setAssistantActivity(label);
        },
        onInteraction: (interactionId, interaction) => {
          if (assistantRequestVersionRef.current !== requestVersion || !interaction) return;
          setAssistantActivity(null);
          setAssistantInteraction({
            state: { id: interactionId, interaction },
            agentInteractionId: interactionId
          });
        },
        onError: (message) => {
          if (assistantRequestVersionRef.current !== requestVersion) return;
          setAssistantMessages((current) => current.map((item) => (
            item.id === assistantMessageId
              ? {
                  ...settleFailedAssistantMessage(item, message),
                  toolCalls: settleAssistantToolCalls(item.toolCalls, "error"),
                  receipt: {
                    label: t("assistant.retry.checkState"),
                    actions: [{
                      label: t("assistant.retry.edit"),
                      onAction: () => setAssistantValue((current) => current.trim() ? current : instruction)
                    }]
                  }
                }
              : item
          )));
          setAssistantInteraction(null);
          setAssistantActivity(null);
          assistantBackgroundRequestRef.current = false;
          setAssistantStreaming(false);
          assistantStreamRef.current = null;
        },
        onCancelled: () => {
          if (assistantRequestVersionRef.current !== requestVersion) return;
          setAssistantActivity(null);
          setAssistantInteraction(null);
          setAssistantMessages((current) => settleCancelledAssistantMessages(current).map((message) => ({
            ...message, toolCalls: settleAssistantToolCalls(message.toolCalls, "cancelled")
          })));
          assistantBackgroundRequestRef.current = false;
          setAssistantStreaming(false);
          assistantStreamRef.current = null;
        }
      });
    } catch (error) {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      const message = getWorkbenchErrorMessage(
        error,
        assistantSurface === "canvas-edit"
          ? "无法读取当前编辑图片，请重新打开图片后重试。"
          : "AI 助手暂时不可用。"
      );
      setAssistantMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? {
              ...settleFailedAssistantMessage(item, message),
              receipt: {
                label: t("assistant.retry.checkState"),
                actions: [{
                  label: t("assistant.retry.edit"),
                  onAction: () => setAssistantValue((current) => current.trim() ? current : instruction)
                }]
              }
            }
          : item
      )));
      setAssistantInteraction(null);
      setAssistantActivity(null);
      assistantBackgroundRequestRef.current = false;
      setAssistantStreaming(false);
      assistantStreamRef.current = null;
    }
  }

  function receiveComicDramaAgentResult(
    result: CollaborateSceneResult,
    assistantMessageId: string,
    originalInstruction: string
  ): void {
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
    let plan: BoardMutationPlan;
    try {
      plan = createComicDramaMutationPlan({
        snapshot,
        selectedNodeIds: comicDramaSelectedNodeIds,
        instruction: action.instruction,
        operation: action.operation,
        ...(action.characterDrafts ? { characterDrafts: action.characterDrafts } : {})
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法根据当前画板创建漫剧计划。";
      setAssistantMessages((current) => current.map((item) => item.id === assistantMessageId
        ? { ...item, content: `${result.message}\n\n${message}`, tone: "error", streaming: false }
        : item));
      return;
    }
    const messageId = assistantMessageId;
    const contextLabel = comicDramaAssistantContext(snapshot, comicDramaSelectedNodeIds);
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
                ? createComicCharactersMutationPlan({ snapshot, settingNodeId: snapshot.nodes.find((node) => node.type === "comic-setting")?.id ?? "", drafts: plan.action.characterDrafts, characterDraftIds })
                : plan;
              void onApplyComicDramaPlan(appliedPlan).then(() => updateStatus("applied")).catch((error: unknown) => {
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
    } catch {
      if (assistantIntentSuggestionRequestRef.current !== requestId) return;
      if (suggestionMode === "contextual") setAssistantIntentSuggestions([]);
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
      action();
      setAssistantActivity(null);
      assistantApplyTimerRef.current = null;
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

  function startAssistantDrag(event: React.PointerEvent<HTMLElement>): void {
    if (event.button !== 0 || event.isPrimary === false || assistantDragRef.current ||
      (event.target as HTMLElement).closest("button, input, textarea, select, a, [role='button'], [contenteditable='true']")) return;
    const panel = assistantPanelRef.current;
    if (!panel) return;
    // Measure the settled panel, not an intermediate open/close animation.
    for (const animation of panel.getAnimations?.() ?? []) {
      if (animation.effect instanceof KeyframeEffect &&
        animation.effect.getKeyframes().some((frame) => "height" in frame)) animation.cancel();
    }
    event.preventDefault();
    event.stopPropagation();
    assistantDragSequenceRef.current += 1;
    setAssistantDragging(true);

    if (assistantDockSide) {
      const margin = ASSISTANT_VIEWPORT_MARGIN;
      const width = Math.min(
        fusionEnabled ? Number.parseFloat(getComputedStyle(panel).getPropertyValue("--assistant-width")) || 560 : assistantSize?.width ?? 360,
        Math.max(1, window.innerWidth - margin * 2)
      );
      const composerHeight = panel.querySelector(".prompt-fusion-composer")?.getBoundingClientRect().height ?? 128;
      const collapsedHeight = panel.getAttribute("data-fusion-mode") === "generate"
        ? composerHeight
        : composerHeight + (panel.querySelector(".prompt-fusion-collapsed")?.getBoundingClientRect().height ?? 0);
      const defaultHeight = fusionEnabled
        ? assistantOpen ? Math.min(640, window.innerHeight * 0.72) : collapsedHeight
        : isUiDesignMode ? 460 : 540;
      const height = Math.min(
        fusionEnabled ? defaultHeight : assistantSize?.height ?? defaultHeight,
        Math.max(1, window.innerHeight - margin * 2)
      );
      const dockedRect = panel.getBoundingClientRect();
      const grabX = Math.min(width - 24, Math.max(24, event.clientX - dockedRect.left));
      const grabY = Math.min(43, Math.max(0, event.clientY - dockedRect.top));
      const floatingWrapperWidth = Math.min(360, window.innerWidth - 32);
      const floatingWrapperHeight = Math.min(
        defaultHeight,
        window.innerHeight - (isUiDesignMode ? 140 : 136)
      );
      const floatingBaseLeft = window.innerWidth
        - (rightRailOpen ? 368 : 16)
        - floatingWrapperWidth;
      const floatingBaseTop = isUiDesignMode
        ? 16
        : window.innerHeight - 112 - floatingWrapperHeight;
      assistantDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: assistantOffset,
        startRect: dockedRect,
        dockCandidate: assistantDockSide,
        originDockSide: assistantDockSide,
        detached: false,
        detachMetrics: {
          width,
          height,
          grabX,
          grabY,
          floatingBaseLeft: fusionEnabled ? 0 : floatingBaseLeft,
          floatingBaseTop: fusionEnabled ? 0 : floatingBaseTop
        }
      };
    } else {
      setAssistantDockPreview(null);
      const rect = panel.getBoundingClientRect();
      assistantDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: fusionEnabled ? { x: rect.left, y: rect.top } : assistantOffset,
        startRect: rect,
        dockCandidate: null,
        originDockSide: null,
        detached: true
      };
    }
    assistantDragSessionRef.current = startPointerDragSession({
      target: panel,
      pointerId: event.pointerId,
      onMove: moveAssistant,
      onEnd: endAssistantDrag,
      onCancel: cancelAssistantDrag
    });
  }

  function moveAssistant(event: PointerEvent): void {
    const drag = assistantDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const margin = ASSISTANT_VIEWPORT_MARGIN;
    let deltaX = event.clientX - drag.startX;
    let deltaY = event.clientY - drag.startY;

    if (!drag.detached && drag.detachMetrics) {
      if (Math.hypot(deltaX, deltaY) < 10) return;
      const {
        width,
        height,
        grabX,
        grabY,
        floatingBaseLeft,
        floatingBaseTop
      } = drag.detachMetrics;
      const targetLeft = Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, event.clientX - grabX)
      );
      const targetTop = Math.min(
        window.innerHeight - height - margin,
        Math.max(margin, event.clientY - grabY)
      );
      const detachedOffset = {
        x: targetLeft - floatingBaseLeft,
        y: targetTop - floatingBaseTop
      };
      drag.detached = true;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.startOffset = detachedOffset;
      drag.startRect = new DOMRect(targetLeft, targetTop, width, height);
      setAssistantDockSide(null);
      if (fusionEnabled) void onAssistantDockLayoutChange?.(null);
      setAssistantOffset(detachedOffset);
      if (fusionEnabled) {
        setFusionAnchor({ left: targetLeft, bottom: window.innerHeight - targetTop - height });
      }
      drag.position = { left: targetLeft, top: targetTop, bottom: window.innerHeight - targetTop - height };
      drag.dockCandidate = null;
      setAssistantDockPreview(null);
      // React changes the base layout once on detachment. Start compositor
      // translation on the next frame, after that layout has committed.
      return;
    }

    const rawLeft = drag.startRect.left + deltaX;
    const magnet = resolveAssistantDockMagnet({
      panelLeft: rawLeft,
      panelWidth: drag.startRect.width,
      viewportWidth: window.innerWidth,
      rightAvailable: !rightRailOpen
    });
    const targetLeft = magnet
      ? Math.min(
          window.innerWidth - drag.startRect.width,
          Math.max(0, magnet.left)
        )
      : Math.min(
          window.innerWidth - drag.startRect.width - margin,
          Math.max(margin, rawLeft)
        );
    const targetTop = Math.min(
      window.innerHeight - drag.startRect.height - margin,
      Math.max(margin, drag.startRect.top + deltaY)
    );
    drag.dockCandidate = magnet?.side ?? null;
    const preview = magnet ? {
          side: magnet.side,
          strength: magnet.strength,
          centerY: targetTop + drag.startRect.height / 2
        } : null;
    setAssistantDockPreview((current) => {
      if (!current && !preview) return current;
      if (current && preview && current.side === preview.side &&
        Math.abs(current.strength - preview.strength) < 0.04 &&
        Math.abs(current.centerY - preview.centerY) < 4) return current;
      return preview;
    });
    drag.position = { left: targetLeft, top: targetTop, bottom: window.innerHeight - targetTop - drag.startRect.height };
    const panel = assistantPanelRef.current;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const x = (drag.translation?.x ?? 0) + targetLeft - rect.left;
      const y = (drag.translation?.y ?? 0) + targetTop - rect.top;
      drag.translation = { x, y };
      // Keep high-frequency coordinates out of React; commit once on release.
      panel.style.translate = `${x}px ${y}px`;
    }
  }

  function endAssistantDrag(): void {
    const drag = assistantDragRef.current;
    if (!drag) return;
    assistantDragRef.current = null;
    assistantDragSessionRef.current = null;
    if (drag.position) {
      if (fusionEnabled) {
        setFusionAnchor({ left: drag.position.left, bottom: drag.position.bottom });
        setAssistantOffset({ x: drag.position.left, y: drag.position.top });
      } else {
        setAssistantOffset({
          x: drag.startOffset.x + drag.position.left - drag.startRect.left,
          y: drag.startOffset.y + drag.position.top - drag.startRect.top
        });
      }
    }
    setAssistantDragging(false);
    setAssistantDockPreview(null);
    if (drag.originDockSide && !drag.detached) {
      return;
    }
    if (drag.dockCandidate) {
      const requestedLayout = {
        side: drag.dockCandidate,
        width: resolveAssistantDockWidth(assistantSize?.width, window.innerWidth)
      } satisfies AssistantDockLayout;
      setAssistantDockPreference(requestedLayout);
      writeAssistantDockLayout(requestedLayout);
      setAssistantDockSide(requestedLayout.side);
      setAssistantOffset({ x: 0, y: 0 });
      const sequence = assistantDragSequenceRef.current;
      void onAssistantDockLayoutChange?.(requestedLayout).then((resolvedLayout) => {
        if (sequence !== assistantDragSequenceRef.current) return;
        if (resolvedLayout?.side === requestedLayout.side) return;
        setAssistantDockSide(resolvedLayout?.side ?? null);
        if (!resolvedLayout) setAssistantOffset({ x: 0, y: 0 });
      });
    } else if (drag.originDockSide) {
      setAssistantDockPreference(null);
      writeAssistantDockLayout(null);
      const panel = assistantPanelRef.current;
      if (panel && !fusionEnabled) {
        const panelRect = panel.getBoundingClientRect();
        const dockWidth = resolveAssistantDockWidth(assistantSize?.width, window.innerWidth);
        const collapsedWidth = Math.max(1, window.innerWidth - dockWidth);
        const futurePanelLeft = drag.originDockSide === "left"
          ? panelRect.left - dockWidth
          : panelRect.left;
        const targetLeft = Math.min(
          collapsedWidth - panelRect.width - ASSISTANT_VIEWPORT_MARGIN,
          Math.max(ASSISTANT_VIEWPORT_MARGIN, futurePanelLeft)
        );
        const floatingWrapperWidth = Math.min(360, collapsedWidth - 32);
        const defaultHeight = isUiDesignMode ? 460 : 540;
        const floatingWrapperHeight = Math.min(
          defaultHeight,
          window.innerHeight - (isUiDesignMode ? 140 : 136)
        );
        const floatingBaseLeft = collapsedWidth
          - (rightRailOpen ? 368 : 16)
          - floatingWrapperWidth;
        const floatingBaseTop = isUiDesignMode
          ? 16
          : window.innerHeight - 112 - floatingWrapperHeight;
        setAssistantOffset({
          x: targetLeft - floatingBaseLeft,
          y: panelRect.top - floatingBaseTop
        });
      }
      void onAssistantDockLayoutChange?.(null);
    }
  }

  function cancelAssistantDrag(): void {
    const drag = assistantDragRef.current;
    if (!drag) return;
    assistantDragRef.current = null;
    assistantDragSessionRef.current = null;
    if (!drag.originDockSide && drag.position) {
      if (fusionEnabled) {
        setFusionAnchor({ left: drag.position.left, bottom: drag.position.bottom });
        setAssistantOffset({ x: drag.position.left, y: drag.position.top });
      } else {
        setAssistantOffset({
          x: drag.startOffset.x + drag.position.left - drag.startRect.left,
          y: drag.startOffset.y + drag.position.top - drag.startRect.top
        });
      }
    }
    setAssistantDragging(false);
    setAssistantDockPreview(null);
    if (drag.originDockSide && drag.detached) {
      setAssistantDockSide(drag.originDockSide);
      setAssistantOffset({ x: 0, y: 0 });
      if (fusionEnabled) {
        void onAssistantDockLayoutChange?.({
          side: drag.originDockSide,
          width: resolveAssistantDockWidth(assistantSize?.width, window.innerWidth)
        });
      }
    }
  }

  function startAssistantResize(
    corner: AiAssistantResizeCorner,
    event: React.PointerEvent<HTMLButtonElement>
  ): void {
    if (assistantDockSide) return;
    const panel = assistantPanelRef.current;
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startRect = panel.getBoundingClientRect();
    assistantResizeRef.current = {
      pointerId: event.pointerId,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: assistantOffset,
      startRect,
      currentSize: { width: startRect.width, height: startRect.height }
    };
  }

  function startAssistantDockResize(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!assistantDockSide || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    assistantDockResizeRef.current = {
      pointerId: event.pointerId,
      side: assistantDockSide,
      startX: event.clientX,
      startWidth: assistantDockWidth,
      currentWidth: assistantDockWidth
    };
  }

  function resizeAssistantDock(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantDockResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const direction = resize.side === "left" ? 1 : -1;
    resize.currentWidth = resolveAssistantDockWidth(
      resize.startWidth + (event.clientX - resize.startX) * direction,
      window.innerWidth
    );
    setAssistantDockWidthOverride(resize.currentWidth);
  }

  function endAssistantDockResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantDockResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    assistantDockResizeRef.current = null;
    setAssistantDockWidthOverride(null);
    const layout = {
      side: resize.side,
      width: resize.currentWidth
    } satisfies AssistantDockLayout;
    setAssistantDockPreference(layout);
    writeAssistantDockLayout(layout);
    void onAssistantDockLayoutChange?.(layout);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelAssistantDockResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantDockResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    assistantDockResizeRef.current = null;
    setAssistantDockWidthOverride(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleAssistantDockResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (!assistantDockSide) return;
    const step = event.shiftKey ? 48 : 16;
    const direction = assistantDockSide === "left" ? 1 : -1;
    const delta = event.key === "ArrowRight" ? step * direction : event.key === "ArrowLeft" ? -step * direction : 0;
    if (!delta) return;
    event.preventDefault();
    const layout = {
      side: assistantDockSide,
      width: resolveAssistantDockWidth(assistantDockWidth + delta, window.innerWidth)
    } satisfies AssistantDockLayout;
    setAssistantDockPreference(layout);
    writeAssistantDockLayout(layout);
    void onAssistantDockLayoutChange?.(layout);
  }

  function resizeAssistant(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const margin = ASSISTANT_VIEWPORT_MARGIN;
    const availableWidth = Math.max(1, window.innerWidth - margin * 2);
    const availableHeight = Math.max(1, window.innerHeight - margin * 2);
    const minWidth = Math.min(ASSISTANT_MIN_WIDTH, availableWidth);
    const minHeight = Math.min(ASSISTANT_MIN_HEIGHT, availableHeight);
    const deltaX = event.clientX - resize.startX;
    const deltaY = event.clientY - resize.startY;
    let left = resize.startRect.left;
    let top = resize.startRect.top;
    let right = resize.startRect.right;
    let bottom = resize.startRect.bottom;

    if (resize.corner.includes("w")) {
      left = Math.min(right - minWidth, Math.max(margin, resize.startRect.left + deltaX));
    } else {
      right = Math.max(
        resize.startRect.left + minWidth,
        Math.min(window.innerWidth - margin, resize.startRect.right + deltaX)
      );
    }
    if (resize.corner.includes("n")) {
      top = Math.min(bottom - minHeight, Math.max(margin, resize.startRect.top + deltaY));
    } else {
      bottom = Math.max(
        resize.startRect.top + minHeight,
        Math.min(window.innerHeight - margin, resize.startRect.bottom + deltaY)
      );
    }

    const nextSize = { width: right - left, height: bottom - top };
    resize.currentSize = nextSize;
    setAssistantSize(nextSize);
    if (fusionEnabled) {
      setFusionAnchor({ left, bottom: window.innerHeight - bottom });
    } else {
      setAssistantOffset({
        x: resize.startOffset.x + left - resize.startRect.left,
        y: resize.startOffset.y + top - resize.startRect.top
      });
    }
  }

  function endAssistantResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    assistantResizeRef.current = null;
    if (
      Math.abs(resize.currentSize.width - resize.startRect.width) >= 0.5 ||
      Math.abs(resize.currentSize.height - resize.startRect.height) >= 0.5
    ) {
      writeAssistantPanelSize(resize.currentSize);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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

  const assistantDockWidth = resolveAssistantDockWidth(
    assistantDockWidthOverride ?? assistantDockPreference?.width ?? assistantSize?.width,
    typeof window === "undefined" ? 1440 : window.innerWidth
  );

  function collapseDockedAssistant(event?: React.MouseEvent<HTMLButtonElement>): void {
    if (!assistantDockSide) return;
    if (event && event.detail !== 0) event.currentTarget.blur();
    setAssistantDockCollapsed(true);
    void onAssistantDockLayoutChange?.(null);
    if (!event || event.detail === 0) {
      window.requestAnimationFrame(() => assistantExpandButtonRef.current?.focus());
    }
  }

  function expandDockedAssistant(): void {
    if (!assistantDockSide) return;
    const layout = {
      side: assistantDockSide,
      width: assistantDockWidth
    } satisfies AssistantDockLayout;
    setAssistantDockCollapsed(false);
    void onAssistantDockLayoutChange?.(layout);
  }

  return (
    <>
      {fusionEnabled ? <PromptFusionDock
        panelRef={assistantPanelRef}
        dockSide={assistantDockSide}
        collapsed={assistantDockCollapsed}
        dragging={assistantDragging}
        panelStyle={assistantDockSide ? { width: assistantDockWidth } : {
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
        open={assistantOpen}
        busy={assistantStreaming || Boolean(assistantActivity)}
        inputDisabled={Boolean(assistantInteraction)}
        confirmationId={assistantInteraction?.state.interaction.type === "confirm" ? assistantInteraction.state.id : undefined}
        confirmation={assistantInteraction?.state.interaction.type === "confirm" ? <FusionPromptConfirmation
          key={assistantInteraction.state.id}
          state={assistantInteraction.state}
          disabled={Boolean(assistantActivity)}
          onApply={() => submitAssistantInteraction({})}
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
          if (assistantDockSide && !open) return;
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
          {editTarget ? <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground"><span className="mr-auto">{uiText("正在编辑当前图片")}</span><button type="button" onClick={onOpenAdvancedEdit}>{uiText("高级编辑")}</button><button type="button" onClick={onExitEdit}>{uiText("退出编辑")}</button></div> : null}
          {activeScene ? <details className="mb-2 text-xs"><summary>{uiText("模板：")}{activeScene.name}</summary>
            <p className="max-h-24 overflow-auto whitespace-pre-wrap py-2">{activeScene.prompt}</p>
            {templatePreviewImages.length ? <div className="my-2 flex gap-2">{templatePreviewImages.map((preview, index) => <button
              key={preview.src} type="button" className="h-14 w-20 overflow-hidden rounded" aria-label={uiText("查看模板示例 {{ui:0}}", [index + 1])}
              onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTemplatePreviewLightbox({ src: preview.src, sourceRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }); }}>
              <img src={preview.src} alt={uiText("模板示例 {{ui:0}}", [index + 1])} className="h-full w-full object-cover" />
            </button>)}</div> : null}
            {templateMediaLoading ? <p role="status">{uiText("正在加载示例…")}</p> : null}
            {templateMediaError ? <button type="button" onClick={() => setTemplateMediaReloadNonce((current) => current + 1)}>{uiText("重新加载示例")}</button> : null}
            <div className="flex gap-3"><button type="button" onClick={() => setScenePickerOpen(true)}>{uiText("更换模板")}</button><button type="button" onClick={() => onInputChange({ sceneId: undefined })}>{uiText("移除模板")}</button></div>
          </details> : null}
          {uiBriefPreview ? <details className="mb-2 text-xs"><summary>UI Brief · {uiBriefPreview.brief.goal}</summary><p>{uiBriefPreview.brief.structure}</p><p>{uiBriefPreview.brief.visualDirection}</p></details> : null}
          {isUiDesignMode && input.referenceImages.length ? <details className="mb-2 text-xs"><summary>{uiText("材料职责")}</summary>{input.referenceImages.map((image) => <label className="my-2 flex items-center justify-between gap-2" key={image.id}><span className="truncate">{image.name}</span><select aria-label={t("prompt.uiDesign.role.changeFor", { name: image.name })} value={image.semanticRole ?? inferUiMaterialRole(image.name)} onChange={(event) => changeUiMaterialRole(image.id, event.target.value as UiMaterialRole)}>{UI_MATERIAL_ROLES.map((role) => <option key={role} value={role}>{t(UI_MATERIAL_ROLE_MESSAGE_KEYS[role])}</option>)}</select></label>)}</details> : null}
          {editTarget && editSmartSuggestionsEnabled ? <details className="mb-2 text-xs"><summary>{uiText("编辑建议")}</summary>{suggestedEdits.map((suggestion) => <button className="block py-1 text-left" type="button" key={suggestion} onClick={() => onApplySuggestedEdit(suggestion)}>{suggestion}</button>)}<button type="button" disabled={suggestingEdits || !canSuggestEdits} onClick={onRegenerateSuggestedEdits}>{suggestingEdits ? uiText("正在获取建议…") : uiText("刷新建议")}</button></details> : null}
        </>}
        directEditor={<InlinePromptEditor
          ref={promptEditorRef} prompt={promptDraft} templatePrompts={sceneTemplatePrompts}
          height={Math.min(128, Math.max(56, visiblePromptHeight))} dragging={false}
          reduceMotion={Boolean(reduceMotion)} onFocus={handlePromptFocus} onChange={handlePromptChange}
          onSubmitKey={handleKeyDown} onPasteCanvasItems={(items) => onPasteCanvasReferences(items.map((item) => item.image))}
          onPasteImages={onPasteImages} onExpandedChange={setInlineVariableExpanded}
          placeholder={editTarget ? t("prompt.placeholder.edit") : t("prompt.placeholder.generate")}
        />}
        controls={<>
          <ReferencePicker boardImages={boardImages} referenceCount={input.referenceImages.length} referencedNodeIds={referencedNodeIds}
            atLimit={input.referenceImages.length >= 4} showLabel={false} materialMode={isUiDesignMode} reduceMotion={Boolean(reduceMotion)}
            onAddCanvasReference={onAddCanvasReference} onReferenceFiles={onReferenceFiles} onOpenChange={setReferencePickerOpen} />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" data-tour="dock-template" aria-label={t("prompt.template.choose")} onClick={() => setScenePickerOpen(true)}><Library className="h-4 w-4" /></Button>
          {providers.length ? <ProviderPicker providers={providers} activeProviderId={activeProviderId}
            creditStatus={creditStatus} creditLoading={creditLoading} requiredCredits={officialRequiredCredits}
            showLabel={false} reduceMotion={Boolean(reduceMotion)} onSelect={onSelectProvider} onManage={onOpenModelManagement} /> : null}
          <GenerationSettingsPicker size={input.size} count={input.n} transparentBackground={input.background === "transparent"}
            maxCount={maxImageCount} provider={activeProvider} onSizeChange={(size) => onInputChange({ size })}
            onCountChange={(n) => onInputChange({ n })} onTransparentBackgroundChange={(enabled) => onInputChange({ background: enabled ? "transparent" : "auto", outputFormat: "png" })}
            onOpenChange={setSizePickerOpen} showLabel={Boolean(assistantDockSide)} />
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
          {needsProviderSetup ? uiText("去配置") : isUiDesignMode ? uiGenerateActionLabel : templateResolving ? uiText("正在生成预览") : activeScene && !templatePromptPreviewReady ? uiText("预览提示词") : editTarget ? uiText("应用编辑") : uiText("生成")}
        </GenerateActionButton>}
        assistant={<Suspense fallback={<div className="p-4 text-sm" role="status">{uiText("正在加载助手…")}</div>}>
          <AiAssistant appearance="fusion" hideComposer variant={assistantDockSide ? "docked" : "floating"} dockSide={assistantDockSide ?? undefined} compact
            hideInteraction={assistantInteraction?.state.interaction.type === "confirm"}
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
            intentSuggestions={assistantIntentSuggestions.length ? assistantIntentSuggestions : assistantMessages.length === 0 ? ["帮我探索创作方向", "帮我调整背景与光线", "帮我整理完整提示词"] : []} intentSuggestionsLoading={assistantIntentSuggestionsLoading}
            history={assistantHistory} historyLoading={assistantHistoryLoading} historyScope={assistantHistoryScope}
            currentConversationId={assistantConversationId} onValueChange={setAssistantValue} onSubmit={submitAssistant} onStop={stopAssistant}
            onClose={() => assistantDockSide ? collapseDockedAssistant() : setAssistantOpen(false)} onIntentSuggestionSelect={selectAssistantIntentSuggestion}
            onRefreshIntentSuggestions={() => void requestAssistantIntentSuggestions("divergent")}
            onInteractionSubmit={submitAssistantInteraction} onInteractionDismiss={dismissAssistantInteraction}
            onInteractionRefine={refineAssistantInteraction} onInteractionGenerate={generateAssistantInteraction}
            onHistoryOpen={() => void loadAssistantHistory()} onHistoryScopeChange={changeAssistantHistoryScope}
            onHistorySelect={selectAssistantHistory} onNewConversation={startNewAssistantConversation}
            onApplyGeneratedPrompt={applyReviewedAssistantPrompt}
          />
        </Suspense>}
      /> : null}
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

      <AnimatePresence initial={false}>
        {!fusionEnabled && assistantAvailable && assistantOpen ? (
          <motion.div
            key="prompt-assistant"
            layout
            data-assistant-dock-side={assistantDockSide ?? "floating"}
            data-assistant-dock-collapsed={assistantDockCollapsed || undefined}
            data-assistant-dragging={assistantDragging ? "" : undefined}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            animate={assistantDockCollapsed && assistantDockSide
              ? {
                  opacity: 0,
                  x: reduceMotion
                    ? 0
                    : assistantDockSide === "right"
                      ? assistantDockWidth + 16
                      : -assistantDockWidth - 16,
                  y: 0,
                  scale: 1
                }
              : { opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{
              duration: reduceMotion ? 0.12 : 0.22,
              ease: EASE_OUT,
              layout: {
                duration: reduceMotion || assistantDragging ? 0 : 0.24,
                ease: EASE_OUT
              }
            }}
            className={cn(
              "fixed z-30",
              assistantDockCollapsed && "pointer-events-none",
              assistantDockSide
                ? cn(
                    "bottom-0 top-12",
                    assistantDockSide === "left" ? "left-0" : "right-0"
                  )
                : cn(
                    "w-[min(360px,calc(100vw-32px))]",
                    isUiDesignMode
                      ? "bottom-auto top-4 h-[min(460px,calc(100dvh-140px))]"
                      : "bottom-[112px] h-[min(540px,calc(100dvh-136px))]",
                    rightRailOpen ? "right-[368px]" : "right-4",
                    "max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-14 max-sm:h-auto max-sm:w-auto"
                  )
            )}
            aria-hidden={assistantDockCollapsed || undefined}
            inert={assistantDockCollapsed}
            style={assistantDockSide ? { width: `${assistantDockWidth}px` } : undefined}
          >
            <div
              ref={assistantPanelRef}
              className={cn(
                "relative h-full w-full",
                assistantDragging && "will-change-transform"
              )}
              style={assistantDockSide
                ? undefined
                : {
                    transform: `translate3d(${assistantOffset.x}px, ${assistantOffset.y}px, 0)`,
                    ...(assistantSize ? {
                      width: `${assistantSize.width}px`,
                      height: `${assistantSize.height}px`
                    } : {})
                  }}
            >
              {assistantDockSide ? (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={cn(
                          "absolute top-1.5 z-20 h-8 w-8 shrink-0 rounded-lg border-[#dededa] bg-[#fbfbf9] text-[#686865] shadow-[0_2px_6px_rgba(22,22,20,0.1)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#eeeeeb] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:border-border dark:bg-background dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
                          assistantDockSide === "right" ? "-left-10" : "-right-10"
                        )}
                        aria-label={t("assistant.collapse")}
                        onClick={collapseDockedAssistant}
                      >
                        {assistantDockSide === "right"
                          ? <PanelRightClose className="h-4 w-4" aria-hidden />
                          : <PanelLeftClose className="h-4 w-4" aria-hidden />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side={assistantDockSide === "right" ? "left" : "right"}>
                      {t("assistant.collapse")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <Suspense fallback={<div className="h-full rounded-xl border border-border bg-card" aria-busy="true" />}>
                <AiAssistant
                  variant={assistantDockSide ? "docked" : "floating"}
                  dockSide={assistantDockSide ?? undefined}
                  title={assistantSurface === "comic-drama" ? uiText("漫剧制作") : t(isUiDesignMode
                    ? "assistant.title.uiDesign"
                    : assistantSurface === "canvas-edit"
                      ? "assistant.title.imageEdit"
                      : "assistant.title.board")}
                  subtitle={assistantSurface === "comic-drama" && comicDramaSnapshot ? comicDramaAssistantContext(comicDramaSnapshot, comicDramaSelectedNodeIds) : undefined}
                  compact
                  messages={assistantMessages}
                  value={assistantValue}
                  composerAutoFocus
                  expandableComposer
                  placeholder={
                    assistantSurface === "comic-drama"
                      ? comicDramaGuide?.placeholder ?? "描述要新增或调整的漫剧内容…"
                    : isUiDesignMode
                      ? t("assistant.placeholder.uiDesign")
                      : assistantSurface === "canvas-edit"
                      ? t("assistant.placeholder.imageEdit")
                      : t("assistant.placeholder.board")
                  }
                  streaming={assistantStreaming}
                  activityLabel={assistantActivity ?? undefined}
                  interaction={assistantInteraction?.state}
                  intentSuggestionsEnabled={assistantSurface === "comic-drama"
                    ? Boolean(comicDramaGuide?.suggestions.length)
                    : assistantIntentSuggestionsEnabled}
                  intentSuggestionCount={assistantIntentSuggestionCount}
                  intentSuggestions={assistantIntentSuggestions}
                  intentSuggestionsLoading={assistantIntentSuggestionsLoading}
                  contextImages={assistantContextImages}
                  history={assistantHistory}
                  historyLoading={assistantHistoryLoading}
                  historyScope={assistantHistoryScope}
                  currentConversationId={assistantConversationId}
                  resizePointerHandlers={assistantDockSide ? undefined : {
                      onPointerDown: startAssistantResize,
                      onPointerMove: resizeAssistant,
                      onPointerUp: endAssistantResize,
                      onPointerCancel: endAssistantResize
                    }}
                  headerPointerHandlers={{
                    onPointerDown: startAssistantDrag,
                  }}
                  disabled={Boolean(assistantActivity)}
                  onValueChange={setAssistantValue}
                  onSubmit={submitAssistant}
                  onStop={stopAssistant}
                  onClose={closeAssistant}
                  onAttach={() => assistantFileInputRef.current?.click()}
                  onPasteImages={onPasteImages}
                  onIntentSuggestionSelect={selectAssistantIntentSuggestion}
                  onRefreshIntentSuggestions={() => void requestAssistantIntentSuggestions("divergent")}
                  onInteractionSubmit={submitAssistantInteraction}
                  onInteractionDismiss={dismissAssistantInteraction}
                  onInteractionRefine={refineAssistantInteraction}
                  onInteractionGenerate={generateAssistantInteraction}
                  onHistoryOpen={() => void loadAssistantHistory()}
                  onHistoryScopeChange={changeAssistantHistoryScope}
                  onHistorySelect={selectAssistantHistory}
                  onNewConversation={startNewAssistantConversation}
                  onApplyGeneratedPrompt={applyReviewedAssistantPrompt}
                />
              </Suspense>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!fusionEnabled ? <div
        onBlurCapture={(event) => {
          // The quick-scene strip and prompt card form one interaction surface. Moving
          // focus between them must not collapse the dock.
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null) &&
            !sizePickerOpen &&
            !referencePickerOpen &&
            !scenePickerOpen &&
            !inlineVariableExpanded
          ) {
            syncPromptToParent();
            setExpanded(false);
            onPromptFocusChange?.(false);
          }
        }}
        className={cn(
          "prompt-dock-layer pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-2",
          rightRailOpen ? "pr-[352px]" : "pr-4",
          !reduceMotion && "transition-[padding] duration-300 ease-out"
        )}
        data-right-rail-open={rightRailOpen || undefined}
        // 供编辑聚焦层测量建议栏和输入卡片组成的完整底部 Dock。
        data-edit-dock=""
      >
      <AnimatePresence initial={false}>
        {isExpanded && smartSuggestionsEnabled && (quickScenes.length > 0 || memorySuggestions.length > 0) && (!isAiMode || editTarget !== null) && (editTarget !== null || !promptDraft.trim()) ? (
          <motion.div
            key="quick-scenes"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: EASE_OUT }}
            className={cn(
              "pointer-events-auto flex w-full",
              isExpanded ? "max-w-2xl" : "max-w-lg",
              !reduceMotion && "transition-[max-width] duration-300 ease-out"
            )}
          >
            <div
              className={cn(
                "flex max-w-full flex-col",
                editTarget !== null && "quick-scene-strip w-full overflow-hidden p-1"
              )}
            >
              <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {editTarget !== null ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={suggestedEdits.length > 0 ? suggestedEditsExpanded : undefined}
                      aria-controls={suggestedEdits.length > 0 ? "suggested-edit-list" : undefined}
                      disabled={suggestedEdits.length === 0}
                      onClick={() => setSuggestedEditsExpanded((value) => !value)}
                      title={suggestedEdits.length > 0
                        ? t(suggestedEditsExpanded
                          ? "prompt.smartSuggestions.collapse"
                          : "prompt.smartSuggestions.expand")
                        : undefined}
                      className={cn(
                        "quick-scene-option flex shrink-0 items-center gap-1 disabled:cursor-default disabled:opacity-100",
                        suggestedEditsExpanded && suggestedEdits.length > 0 && "bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span aria-live="polite">
                        {suggestingEdits && suggestedEdits.length === 0
                          ? t("prompt.smartSuggestions.loading")
                          : `${t("prompt.smartSuggestions.label")}${suggestedEdits.length > 0 ? ` ${suggestedEdits.length}` : ""}`}
                      </span>
                      {suggestedEdits.length > 0 ? (
                        <motion.span
                          aria-hidden
                          animate={{ rotate: suggestedEditsExpanded ? 0 : 180 }}
                          transition={{ duration: reduceMotion ? 0 : 0.18, ease: EASE_OUT }}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </motion.span>
                      ) : null}
                    </button>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={t(suggestingEdits
                              ? "prompt.smartSuggestions.regenerating"
                              : "prompt.smartSuggestions.regenerate")}
                            disabled={suggestingEdits || !canSuggestEdits}
                            onClick={onRegenerateSuggestedEdits}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {suggestingEdits ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {t(canSuggestEdits
                            ? "prompt.smartSuggestions.regenerate"
                            : "prompt.smartSuggestions.noModel")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                ) : null}
                {editTarget === null ? memorySuggestions.map((memory) => {
                  const rememberedPrompt = promptFromMemory(memory.content);
                  return (
                    <button
                      key={memory.id}
                      type="button"
                      onClick={() => handlePromptChange(rememberedPrompt)}
                      title={uiText("来自近期创作：{{ui:0}}", [rememberedPrompt])}
                      className="quick-scene-tag"
                    >
                      {memorySuggestionLabel(memory.content)}
                    </button>
                  );
                }) : null}
                {quickScenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => onApplyScene(scene)}
                    title={scene.description}
                    className="quick-scene-tag"
                  >
                    {scene.name}
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {suggestedEditsExpanded && suggestedEdits.length > 0 ? (
                  <motion.ul
                    id="suggested-edit-list"
                    initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: EASE_OUT }}
                    className="mt-1 flex flex-col gap-1 overflow-hidden border-t border-border/70 pt-1"
                  >
                    {suggestedEdits.map((suggestion, index) => (
                      <li key={`${suggestion}:${index}`}>
                        <button
                          type="button"
                          onClick={() => onApplySuggestedEdit(suggestion)}
                          title={t("prompt.smartSuggestions.item", { suggestion })}
                          className="flex min-h-8 w-full items-center rounded-md bg-muted/60 px-2.5 py-1.5 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        data-tour="prompt-card"
        className={cn(
          "prompt-dock-card pointer-events-auto w-full overflow-hidden rounded-2xl border bg-card shadow-xl",
          editTarget ? "border-ring/70" : "border-border",
          isExpanded ? "max-w-2xl" : "max-w-lg",
          !reduceMotion && "transition-[max-width,border-color] duration-300 ease-out"
        )}
      >
        <div
          className={cn(
            "pointer-events-none flex items-center justify-center overflow-hidden",
            isExpanded ? "h-5 py-0.5" : "h-2",
            !reduceMotion && "transition-[height,padding] duration-300 ease-out"
          )}
        >
          <div
            data-prompt-dock-grip=""
            role="separator"
            aria-orientation="horizontal"
            aria-label={uiText("拖拽调整输入框高度")}
            title={uiText("拖拽调整高度 · 双击复位")}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={(event) => handleDragEnd(event, true)}
            onDoubleClick={() => setPromptHeight(DEFAULT_PROMPT_HEIGHT)}
            className={cn(
              "group/grip flex h-4 w-14 touch-none items-center justify-center rounded-full",
              isExpanded ? "pointer-events-auto cursor-ns-resize" : "pointer-events-none"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-9 rounded-full bg-border",
                !reduceMotion && "transition-[width,background-color,opacity] duration-200 ease-out",
                isExpanded
                  ? "opacity-100 group-hover/grip:w-11 group-hover/grip:bg-muted-foreground/50"
                  : "opacity-0",
                dragging && "w-11"
              )}
            />
          </div>
        </div>

        <div className="px-2.5 pb-1.5">
          <AnimatePresence initial={false}>
            {editTarget ? (
              <motion.div
                key="edit-context"
                initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div data-tour="edit-banner" className="mb-1.5 flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2">
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-medium text-foreground">{t("prompt.editBanner.title")}</span>
                    <span className="text-muted-foreground"> · {t("prompt.editBanner.description")}</span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2.5 text-xs font-semibold"
                    onClick={() => {
                      syncPromptToParent();
                      onOpenAdvancedEdit();
                    }}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t("prompt.editBanner.advanced")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={t("prompt.editBanner.exit")}
                    onClick={() => {
                      syncPromptToParent();
                      onExitEdit();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {activeScene ? (
              <motion.div
                key={activeScene.id}
                initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: 4 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: 4 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="prompt-dock-template-summary mb-1.5 flex min-h-[3.375rem] items-center gap-2.5 rounded-lg bg-muted/60 px-2 py-2">
                  <span className="prompt-dock-template-thumbnail relative flex h-9 w-9 shrink-0 overflow-hidden rounded-md bg-background">
                    {templateSummaryPreview ? (
                      <img
                        src={templateSummaryPreview.src}
                        alt=""
                        decoding="async"
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${templateSummaryPreview.focus.x * 100}% ${templateSummaryPreview.focus.y * 100}%`
                        }}
                        onError={() => {
                          setBrokenTemplatePreviewSrcs((current) => (
                            new Set(current).add(templateSummaryPreview.src)
                          ));
                        }}
                      />
                    ) : templateMediaLoading ? (
                      <span
                        className="h-full w-full animate-pulse bg-muted-foreground/10 motion-reduce:animate-none"
                        aria-label={uiText("正在加载模板示例")}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Library className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    )}
                    {templateResolving ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/72">
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin text-[hsl(var(--ai-accent))] motion-reduce:animate-none"
                          aria-hidden
                        />
                      </span>
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{activeScene.name}</p>
                    <p className="prompt-dock-template-status mt-0.5 truncate text-[10px] text-muted-foreground">
                      {isUiDesignMode
                        ? t("prompt.uiDesign.templateRole")
                        : templateResolving
                        ? input.referenceImages.length > 0
                          ? uiText("正在结合模板与引用图片生成{{ui:0}}", [editTarget ? "编辑指令" : "提示词"])
                          : uiText("正在根据本次需求生成{{ui:0}}", [editTarget ? "编辑指令" : "提示词"])
                        : templatePromptPreviewReady
                          ? editTarget
                            ? uiText("编辑指令预览已就绪 · 确认后应用")
                            : uiText("提示词预览已就绪 · 确认后生成")
                          : templatePromptPreview?.sceneId === activeScene.id
                            ? uiText("{{ui:0}}内容已变化 · 需要更新预览", [editTarget ? "编辑" : "创作"])
                            : input.referenceImages.length > 0
                              ? uiText("将结合模板与 {{ui:0}} 张引用图片生成{{ui:1}}预览", [input.referenceImages.length, editTarget ? "编辑指令" : "提示词"])
                              : editTarget
                                ? uiText("先预览编辑指令，确认后应用")
                                : uiText("先预览提示词，确认后生成")}
                    </p>
                  </div>
                  {templatePromptPreviewReady ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="prompt-dock-template-action h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
                      aria-label={uiText("继续调整模板提示词")}
                      onClick={openAssistant}
                    >
                      <WandSparkles className="h-3 w-3" aria-hidden />
                      <span className="prompt-dock-template-action-label">{uiText("继续调整")}</span>
                    </Button>
                  ) : null}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="prompt-dock-template-action h-7 shrink-0 gap-0.5 px-2 text-[11px] text-muted-foreground"
                        aria-label={uiText("查看模板详情")}
                      >
                        <span className="prompt-dock-template-action-label">{uiText("详情")}</span>
                        <ChevronUp className="h-3 w-3" aria-hidden />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="end" className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-3">
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{activeScene.name}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {activeScene.description || "AI 将保留模板规则，并结合这次需求生成完整提示词。"}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground">{uiText("示例效果")}</p>
                          {templatePreviewImages.length > 0 ? (
                            <div className="grid grid-cols-3 gap-1.5">
                              {templatePreviewImages.map((preview, index) => {
                                const broken = brokenTemplatePreviewSrcs.has(preview.src);
                                return (
                                  <button
                                    key={`${preview.src}-${index}`}
                                    type="button"
                                    disabled={broken}
                                    aria-label={uiText("放大预览示例 {{ui:0}}", [index + 1])}
                                    className="group relative aspect-[4/3] min-w-0 overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                                    onClick={(event) => {
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      setTemplatePreviewLightbox({
                                        src: preview.src,
                                        sourceRect: {
                                          left: rect.left,
                                          top: rect.top,
                                          width: rect.width,
                                          height: rect.height
                                        }
                                      });
                                    }}
                                  >
                                    {broken ? (
                                      <span className="flex h-full w-full items-center justify-center text-muted-foreground" title={uiText("示例图无法显示")}>
                                        <ImagePlus className="h-4 w-4" />
                                      </span>
                                    ) : (
                                      <>
                                        <img
                                          src={preview.src}
                                          alt={uiText("{{ui:0}}示例 {{ui:1}}", [activeScene.name, index + 1])}
                                          loading="lazy"
                                          decoding="async"
                                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
                                          style={{ objectPosition: `${preview.focus.x * 100}% ${preview.focus.y * 100}%` }}
                                          onError={() => {
                                            setBrokenTemplatePreviewSrcs((current) => new Set(current).add(preview.src));
                                          }}
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-[background-color,opacity] duration-150 group-hover:bg-black/30 group-hover:opacity-100 group-focus-visible:bg-black/30 group-focus-visible:opacity-100 motion-reduce:transition-none">
                                          <Maximize2 className="h-4 w-4 drop-shadow" />
                                        </span>
                                      </>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : templateMediaLoading ? (
                            <div className="grid grid-cols-3 gap-1.5" aria-label={uiText("正在加载模板示例")}>
                              {Array.from({ length: 3 }, (_, index) => (
                                <span key={index} className="aspect-[4/3] animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                              ))}
                            </div>
                          ) : templateMediaError ? (
                            <div className="flex h-16 items-center justify-center gap-2 rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                              <span>{uiText("示例图加载失败")}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={uiText("重新加载模板示例")}
                                onClick={() => setTemplateMediaReloadNonce((current) => current + 1)}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex h-16 items-center justify-center gap-2 rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                              <ImagePlus className="h-3.5 w-3.5" />
                              {uiText("暂无示例图")}</div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground">{uiText("模板规则")}</p>
                          <div className="max-h-40 overflow-y-auto rounded-md bg-muted/60 px-3 py-2">
                            <p className="whitespace-pre-wrap break-words text-[11px] leading-5 text-foreground/80">
                              {activeScene.prompt}
                            </p>
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setScenePickerOpen(true)}>
                          {uiText("更换模板")}</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={uiText("移除模板 {{ui:0}}", [activeScene.name])}
                    onClick={() => onInputChange({ sceneId: undefined })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {templateNeedsProviderSetup ? (
                  <button
                    type="button"
                    className="mb-1.5 w-full rounded-md border border-border px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={onOpenSettings}
                  >
                    {uiText("模板自动套用需要文本 AI，点击完成配置")}</button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {input.referenceImages.length > 0 ? (
            <div className="flex flex-col gap-1.5 px-1 pb-1.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <AnimatePresence initial={false}>
                  {input.referenceImages.map((image) => (
                    <motion.div
                      key={image.id}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
                      transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: EASE_OUT }}
                      className={cn(
                        "group/material relative flex h-14 shrink-0 items-center gap-2 rounded-lg bg-muted/65 p-1.5 transition-colors hover:bg-muted motion-reduce:transition-none",
                        isUiDesignMode ? "w-40 pr-7" : "w-14"
                      )}
                    >
                      <TooltipProvider delayDuration={250}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              data-reference-thumbnail=""
                              data-reference-id={image.id}
                              className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-background"
                            >
                              <img
                                src={`data:${image.mimeType};base64,${image.dataBase64}`}
                                alt={image.name}
                                className="h-full w-full object-cover"
                              />
                              {/* 来源点：画布来源用主色实心点，上传用中性点，帮助区分。 */}
                              <span
                                aria-hidden
                                className={cn(
                                  "absolute bottom-0.5 left-0.5 h-2 w-2 rounded-full border border-background",
                                  image.sourceNodeId ? "bg-primary" : "bg-muted-foreground/60"
                                )}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="start"
                            sideOffset={8}
                            className="w-52 rounded-lg bg-popover p-1.5 text-popover-foreground shadow-md"
                          >
                            <img
                              src={`data:${image.mimeType};base64,${image.dataBase64}`}
                              alt=""
                              className="h-36 w-full rounded-md bg-muted object-contain"
                            />
                            <div className="flex min-w-0 items-center gap-2 px-1 pb-0.5 pt-1.5">
                              <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={image.name}>
                                {image.name}
                              </span>
                              {isUiDesignMode ? (
                                <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                                  {t(UI_MATERIAL_ROLE_MESSAGE_KEYS[image.semanticRole ?? inferUiMaterialRole(image.name)])}
                                </span>
                              ) : null}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {isUiDesignMode ? (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium leading-4 text-foreground" title={image.name}>
                            {image.name}
                          </p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="-ml-1 mt-0.5 flex h-5 max-w-full items-center gap-0.5 rounded px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                                title={t("prompt.uiDesign.role.change")}
                                aria-label={t("prompt.uiDesign.role.changeFor", { name: image.name })}
                              >
                                <span className="truncate">
                                  {t(UI_MATERIAL_ROLE_MESSAGE_KEYS[image.semanticRole ?? inferUiMaterialRole(image.name)])}
                                </span>
                                <ChevronDown className="h-2.5 w-2.5 shrink-0" aria-hidden />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="start" className="min-w-28">
                              <DropdownMenuRadioGroup
                                value={image.semanticRole ?? inferUiMaterialRole(image.name)}
                                onValueChange={(value) => changeUiMaterialRole(image.id, value as UiMaterialRole)}
                              >
                                {UI_MATERIAL_ROLES.map((role) => (
                                  <DropdownMenuRadioItem key={role} value={role} className="text-xs">
                                    {t(UI_MATERIAL_ROLE_MESSAGE_KEYS[role])}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setUiBriefPreview(null);
                          onRemoveReference(image.id);
                        }}
                        aria-label={t("prompt.references.remove", { name: image.name })}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-[color,background-color,opacity] hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                          isUiDesignMode
                            ? "absolute right-1 top-1 opacity-0 group-hover/material:opacity-100 group-focus-within/material:opacity-100"
                            : "absolute right-0.5 top-0.5 bg-background/90 opacity-0 group-hover/material:opacity-100 group-focus-within/material:opacity-100"
                        )}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("prompt.references.clear")}
                        onClick={() => {
                          setUiBriefPreview(null);
                          onInputChange({ referenceImages: [] });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("prompt.references.clear")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {providerBlocksGenerateReferences && input.workflowMode === "generate" ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  {t("prompt.references.unsupported")}
                </p>
              ) : null}
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {isUiDesignMode && (uiBriefResolving || uiBriefReady) ? (
              <motion.section
                key={uiBriefResolving ? "ui-brief-loading" : "ui-brief-ready"}
                initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: 4 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: 4 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: EASE_OUT }}
                className="mb-2 overflow-hidden border-y border-border bg-muted/30"
                aria-live="polite"
              >
                {uiBriefResolving ? (
                  <div className="flex h-10 items-center gap-2 px-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--ai-accent))] motion-reduce:animate-none" aria-hidden />
                    <span>{t("prompt.uiDesign.brief.loading")}</span>
                  </div>
                ) : uiBriefPreview ? (
                  <div className="px-2 py-2">
                    <div className="mb-2 flex items-center gap-1.5">
                      <CircleCheck className="h-3.5 w-3.5 text-[hsl(var(--ai-accent))]" aria-hidden />
                      <h3 className="text-xs font-medium text-foreground">{t("prompt.uiDesign.brief.title")}</h3>
                      <span className="text-[10px] text-muted-foreground">{t("prompt.uiDesign.brief.confirmHint")}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 gap-1 px-1.5 text-[11px] text-[hsl(var(--ai-accent))] hover:bg-[hsl(var(--ai-muted))] hover:text-[hsl(var(--ai-accent))]"
                        onClick={() => openUiDesignAssistant()}
                      >
                        <WandSparkles className="h-3 w-3" aria-hidden />
                        {t("prompt.uiDesign.assistant.adjust")}
                      </Button>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("prompt.uiDesign.brief.regenerate")}
                              onClick={() => setUiBriefPreview(null)}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{t("prompt.uiDesign.brief.regenerate")}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px] leading-4">
                      <dt className="text-muted-foreground">{t("prompt.uiDesign.brief.goal")}</dt>
                      <dd className="min-w-0 break-words text-foreground/85">{uiBriefPreview.brief.goal}</dd>
                      <dt className="text-muted-foreground">{t("prompt.uiDesign.brief.surface")}</dt>
                      <dd className="min-w-0 break-words text-foreground/85">{uiBriefPreview.brief.surface}</dd>
                      <dt className="text-muted-foreground">{t("prompt.uiDesign.brief.structure")}</dt>
                      <dd className="min-w-0 break-words text-foreground/85">{uiBriefPreview.brief.structure}</dd>
                      <dt className="text-muted-foreground">{t("prompt.uiDesign.brief.visual")}</dt>
                      <dd className="min-w-0 break-words text-foreground/85">{uiBriefPreview.brief.visualDirection}</dd>
                      <dt className="text-muted-foreground">{t("prompt.uiDesign.brief.constraints")}</dt>
                      <dd className="min-w-0 break-words text-foreground/85">{uiBriefPreview.brief.constraints}</dd>
                    </dl>
                  </div>
                ) : null}
              </motion.section>
            ) : null}
          </AnimatePresence>

          <InlinePromptEditor
            ref={promptEditorRef}
            prompt={promptDraft}
            templatePrompts={sceneTemplatePrompts}
            height={visiblePromptHeight}
            dragging={dragging}
            reduceMotion={Boolean(reduceMotion)}
            onFocus={handlePromptFocus}
            onChange={handlePromptChange}
            onSubmitKey={handleKeyDown}
            onPasteCanvasItems={(items) => onPasteCanvasReferences(items.map((item) => item.image))}
            onPasteImages={onPasteImages}
            onExpandedChange={setInlineVariableExpanded}
            placeholder={
              editTarget
                ? t("prompt.placeholder.edit")
                : isUiDesignMode
                  ? t("prompt.placeholder.uiDesign")
                : templatePromptPreviewReady
                  ? t("prompt.placeholder.preview")
                : activeScene
                  ? t("prompt.placeholder.scene", { scene: activeScene.name })
                  : t("prompt.placeholder.generate")
            }
          />

          <div className="mt-3 flex items-center gap-0.5 sm:gap-1">
            {!editTarget && input.workflowMode === "generate" ? (
              <DropdownMenu>
                <ToolbarTooltip
                  label={t(isUiDesignMode ? "prompt.creationMode.uiDesign" : "prompt.creationMode.general")}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 shrink-0",
                        isUiDesignMode && "bg-muted text-foreground"
                      )}
                      aria-label={`${t("prompt.creationMode.aria")}：${t(isUiDesignMode ? "prompt.creationMode.uiDesign" : "prompt.creationMode.general")}`}
                    >
                      {isUiDesignMode
                        ? <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
                        : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                    </Button>
                  </DropdownMenuTrigger>
                </ToolbarTooltip>
                <DropdownMenuContent side="top" align="start" className="w-40">
                  <DropdownMenuRadioGroup
                    value={creationMode}
                    onValueChange={(value) => changeCreationMode(value as CreationMode)}
                  >
                    <DropdownMenuRadioItem value="general" className="text-xs">
                      {t("prompt.creationMode.general")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="ui-design" className="text-xs">
                      {t("prompt.creationMode.uiDesign")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <ReferencePicker
              boardImages={boardImages}
              referenceCount={input.referenceImages.length}
              referencedNodeIds={referencedNodeIds}
              atLimit={input.referenceImages.length >= 4}
              showLabel={false}
              materialMode={isUiDesignMode}
              reduceMotion={Boolean(reduceMotion)}
              onAddCanvasReference={onAddCanvasReference}
              onReferenceFiles={onReferenceFiles}
              onOpenChange={setReferencePickerOpen}
            />

            {!activeScene ? (
              <ToolbarTooltip label={t("prompt.template.choose")} disabled={scenePickerOpen}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-0 px-2 sm:px-2.5"
                  aria-label={t("prompt.template.choose")}
                  data-tour="dock-template"
                  onMouseEnter={() => void loadScenePickerDialog()}
                  onFocus={() => void loadScenePickerDialog()}
                  onClick={() => setScenePickerOpen(true)}
                >
                  <Library className="h-3.5 w-3.5" />
                </Button>
              </ToolbarTooltip>
            ) : null}

            {providers.length > 0 ? (
              <ProviderPicker
                providers={providers}
                activeProviderId={activeProviderId}
                creditStatus={creditStatus}
                creditLoading={creditLoading}
                requiredCredits={officialRequiredCredits}
                showLabel={false}
                reduceMotion={Boolean(reduceMotion)}
                onSelect={onSelectProvider}
                onManage={onOpenModelManagement}
              />
            ) : null}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <GenerationSettingsPicker
                size={input.size}
                count={input.n}
                transparentBackground={input.background === "transparent"}
                maxCount={maxImageCount}
                provider={activeProvider}
                onSizeChange={(size) => onInputChange({ size })}
                onCountChange={(n) => onInputChange({ n })}
                onTransparentBackgroundChange={(enabled) => onInputChange({
                  background: enabled ? "transparent" : "auto",
                  outputFormat: "png"
                })}
                onOpenChange={setSizePickerOpen}
              />
              {activeCount > 0 ? (
                <span
                  role="status"
                  aria-label={queuedCount === activeCount
                    ? uiText("{{ui:0}} 个任务排队中", [queuedCount])
                    : queuedCount > 0
                      ? uiText("正在处理 {{ui:0}} 个任务，{{ui:1}} 个任务排队中", [activeCount - queuedCount, queuedCount])
                      : uiText("正在处理 {{ui:0}} 个任务", [activeCount])}
                  title={queuedCount === activeCount
                    ? uiText("{{ui:0}} 个任务排队中", [queuedCount])
                    : uiText("正在处理 {{ui:0}} 个任务{{ui:1}}", [activeCount - queuedCount, queuedCount ? `，${queuedCount} 个任务排队中` : ""])}
                  className="flex h-8 shrink-0 items-center gap-1 px-1.5 text-xs tabular-nums text-muted-foreground"
                >
                  {queuedCount === activeCount
                    ? <Clock3 className="h-3 w-3" aria-hidden />
                    : <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  <span aria-hidden>{queuedCount === activeCount ? uiText("{{ui:0}} 排队", [queuedCount]) : activeCount}</span>
                  {queuedCount > 0 && queuedCount < activeCount ? <span aria-hidden>· {queuedCount} {uiText("排队")}</span> : null}
                </span>
              ) : null}
              {assistantAvailable ? (
                <>
                  <ToolbarTooltip
                    label={`${isUiDesignMode ? t("prompt.uiDesign.assistant.open") : assistantAwarenessCopy.buttonLabel}（${assistantShortcut.label}）`}
                    disabled={assistantOpen}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "prompt-dock-assistant-button relative h-8 shrink-0 gap-1.5 px-2.5 text-xs",
                        (assistantOpen || assistantWorking) && "border-[hsl(var(--ai-accent)/0.38)] bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))] hover:bg-[hsl(var(--ai-muted))] hover:text-[hsl(var(--ai-accent))]",
                        !assistantOpen && !assistantWorking && assistantHasUnreadResult && "border-[hsl(var(--ai-accent)/0.32)] text-[hsl(var(--ai-accent))] hover:bg-[hsl(var(--ai-muted))] hover:text-[hsl(var(--ai-accent))]"
                      )}
                      aria-label={isUiDesignMode ? t("prompt.uiDesign.assistant.open") : assistantAwarenessCopy.buttonLabel}
                      aria-keyshortcuts={assistantShortcut.ariaKeyShortcuts}
                      aria-expanded={assistantOpen}
                      aria-busy={assistantWorking || undefined}
                      onMouseEnter={() => void loadAiAssistant()}
                      onFocus={() => void loadAiAssistant()}
                      onClick={assistantOpen ? closeAssistant : openAssistant}
                    >
                      {assistantWorking ? (
                        <AssistantAwarenessCanvas
                          active
                          reduceMotion={Boolean(reduceMotion)}
                          className="pointer-events-none h-[18px] w-[18px] shrink-0 text-[hsl(var(--ai-accent))]"
                        />
                      ) : (
                        <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                          <WandSparkles className="h-3.5 w-3.5" aria-hidden />
                          {assistantHasUnreadResult ? (
                            <motion.span
                              initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
                              className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-[hsl(var(--ai-accent))] ring-2 ring-background"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                      )}
                      <span className="prompt-dock-assistant-label">{t("prompt.assistant.button")}</span>
                    </Button>
                  </ToolbarTooltip>
                  <span className="sr-only" role="status" aria-live="polite">
                    {assistantAwarenessCopy.liveStatus}
                  </span>
                </>
              ) : null}
              <GenerateActionButton
                buttonStyle={generateButtonStyle}
                compact={!isExpanded}
                aria-label={isUiDesignMode ? uiGenerateActionLabel : undefined}
                disabled={!canSubmit && !needsProviderSetup && !templateNeedsProviderSetup && !uiBriefNeedsProviderSetup}
                title={
                  needsProviderSetup
                    ? uiText("尚未完成 Provider 配置，点击前往设置")
                    : uiBriefNeedsProviderSetup
                      ? t("prompt.uiDesign.brief.needsProvider")
                    : templateNeedsProviderSetup
                      ? uiText("模板自动套用需要先配置文本 AI")
                      : isUiDesignMode && !uiBriefReady
                        ? t("prompt.uiDesign.brief.prepareTitle")
                      : activeScene && !templatePromptPreviewReady
                        ? uiText("先根据模板、需求和引用图片生成提示词预览")
                      : undefined
                }
                onClick={needsProviderSetup || templateNeedsProviderSetup || uiBriefNeedsProviderSetup
                  ? onOpenSettings
                  : () => void handleSubmit()}
              >
                {needsProviderSetup
                  ? uiText("去配置")
                  : isUiDesignMode
                    ? (
                        <>
                          <span className="max-sm:hidden">{uiGenerateActionLabel}</span>
                          <span className="sm:hidden">
                            {uiBriefResolving
                              ? t("prompt.uiDesign.brief.loadingMobile")
                              : uiBriefReady ? t("prompt.uiDesign.brief.generateMobile") : t("prompt.uiDesign.brief.prepareMobile")}
                          </span>
                        </>
                      )
                  : templateResolving
                    ? uiText("正在生成预览")
                    : activeScene
                      ? templatePromptPreviewReady
                        ? editTarget ? uiText("应用编辑") : uiText("确认生成")
                        : templatePromptPreview ? uiText("更新预览") : uiText("预览提示词")
                      : editTarget
                        ? uiText("应用编辑")
                        : uiText("生成")}
              </GenerateActionButton>
            </div>
          </div>
        </div>
      </div>
      </div>

      : null}
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

export function GenerateActionButton({
  buttonStyle,
  compact = false,
  children,
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { buttonStyle: GenerateButtonStyle; compact?: boolean }): React.ReactElement {
  const { locale } = useI18n();
  const [sendAnimationNonce, setSendAnimationNonce] = useState(0);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const reduceSendMotion = useReducedMotion();
  const label = typeof children === "string" || typeof children === "number" ? String(children) : "生成";
  const acknowledgementLabel = label === "去配置" ? "已打开" : label === "应用编辑" ? "已应用" : "已提交";
  const localizedLabel = localizeLegacyText(label, locale);
  const localizedAcknowledgementLabel = localizeLegacyText(acknowledgementLabel, locale);
  const displayChildren = typeof children === "string" || typeof children === "number"
    ? localizedLabel
    : children;

  useGSAP(() => {
    const button = sendButtonRef.current;
    if (!button || buttonStyle !== "send" || sendAnimationNonce === 0) return;

    const select = gsap.utils.selector(button);
    const defaultState = select<HTMLElement>("[data-send-default]")[0];
    const sentState = select<HTMLElement>("[data-send-sent]")[0];
    const defaultIcon = select<SVGElement>("[data-send-default] svg")[0];
    const sentIcon = select<SVGElement>("[data-send-sent] svg")[0];
    const defaultChars = select<HTMLElement>("[data-send-default] [data-send-char]");
    const sentChars = select<HTMLElement>("[data-send-sent] [data-send-char]");
    if (!defaultState || !sentState || !defaultIcon || !sentIcon) return;

    const finish = (): void => {
      setSendAnimationNonce((current) => current === sendAnimationNonce ? 0 : current);
    };
    const timeline = gsap.timeline({ onComplete: finish });

    if (reduceSendMotion) {
      timeline
        .set(defaultState, { autoAlpha: 0 })
        .set(sentState, { autoAlpha: 1 })
        .to({}, { duration: 0.7 })
        .set(sentState, { autoAlpha: 0 })
        .set(defaultState, { autoAlpha: 1 });
      return;
    }

    gsap.set(sentState, { autoAlpha: 1 });
    gsap.set(sentChars, { opacity: 0, y: -12, rotation: -18, filter: "blur(4px)" });
    gsap.set(sentIcon, { opacity: 0, scale: 0.5, rotation: -35 });

    timeline
      .to(defaultChars, {
        opacity: 0,
        y: 12,
        filter: "blur(4px)",
        duration: 0.24,
        ease: "power2.in",
        stagger: 0.025
      }, 0)
      .to(defaultIcon, {
        x: 76,
        y: -4,
        opacity: 0,
        scale: 0.25,
        rotation: 45,
        duration: 0.42,
        ease: "power2.in"
      }, 0)
      .to(sentIcon, {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 0.34,
        ease: "back.out(1.7)"
      }, 0.28)
      .to(sentChars, {
        opacity: 1,
        y: 0,
        rotation: 0,
        filter: "blur(0px)",
        duration: 0.3,
        ease: "power3.out",
        stagger: 0.055
      }, 0.34)
      .to({}, { duration: 0.68 })
      .to(sentChars, {
        opacity: 0,
        y: 8,
        filter: "blur(3px)",
        duration: 0.18,
        ease: "power2.in",
        stagger: 0.018
      })
      .to(sentIcon, { opacity: 0, scale: 0.7, duration: 0.18, ease: "power2.in" }, "<")
      .set(sentState, { autoAlpha: 0 })
      .fromTo(defaultIcon, {
        x: -24,
        y: 12,
        opacity: 0,
        scale: 1.35,
        rotation: -45
      }, {
        x: 0,
        y: 0,
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 0.32,
        ease: "power3.out"
      })
      .fromTo(defaultChars, {
        opacity: 0,
        y: -8,
        filter: "blur(3px)"
      }, {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.24,
        ease: "power2.out",
        stagger: 0.025
      }, "<0.04");
  }, {
    scope: sendButtonRef,
    dependencies: [localizedAcknowledgementLabel, buttonStyle, reduceSendMotion, sendAnimationNonce],
    revertOnUpdate: true
  });

  function handleSendStyleClick(event: React.MouseEvent<HTMLButtonElement>): void {
    onClick?.(event);
    if (event.defaultPrevented || props.disabled) return;

    setSendAnimationNonce((current) => current + 1);
  }

  if (buttonStyle === "glow") {
    return (
      <button
        type="button"
        className={cn("generate-glow-button shrink-0", compact && "generate-glow-button--compact", className)}
        onClick={onClick}
        {...props}
      >
        <span className="generate-glow-dots" aria-hidden />
        <Sparkles className="generate-glow-sparkle" aria-hidden />
        <span className="generate-glow-text">{displayChildren}</span>
      </button>
    );
  }

  if (buttonStyle === "prismatic") {
    return (
      <button
        type="button"
        className={cn(
          "generate-prismatic-button shrink-0",
          compact && "generate-prismatic-button--compact",
          className
        )}
        onClick={onClick}
        {...props}
      >
        <span className="generate-prismatic-light" aria-hidden />
        {PRISMATIC_LAYERS.map((layer, index) => (
          <span
            key={`${layer.delay}-${layer.duration}-${index}`}
            className={cn(
              "generate-prismatic-layer",
              index === PRISMATIC_LAYERS.length - 1 && "generate-prismatic-layer--dodge"
            )}
            style={{ animationDelay: layer.delay, animationDuration: layer.duration }}
            aria-hidden
          />
        ))}
        <span className="generate-prismatic-content">
          <Blend aria-hidden />
          {displayChildren}
        </span>
      </button>
    );
  }

  if (buttonStyle === "send") {
    return (
      <button
        ref={sendButtonRef}
        type="button"
        className={cn(
          "generate-send-button shrink-0",
          compact && "generate-send-button--compact",
          sendAnimationNonce > 0 && "generate-send-button--animating",
          className
        )}
        aria-label={localizedLabel}
        onClick={handleSendStyleClick}
        {...props}
      >
        <span className="generate-send-outline" aria-hidden />
        <span data-send-default className="generate-send-state generate-send-state--default" aria-hidden>
          <span className="generate-send-icon">
            <Send />
          </span>
          <span className="generate-send-label">
            {Array.from(localizedLabel).map((character, index) => (
              <span data-send-char key={`${character}-${index}`} style={{ "--generate-send-index": index } as React.CSSProperties}>
                {character}
              </span>
            ))}
          </span>
        </span>
        <span data-send-sent className="generate-send-state generate-send-state--sent" aria-hidden>
          <span className="generate-send-icon">
            <CircleCheck />
          </span>
          <span className="generate-send-label">
            {Array.from(localizedAcknowledgementLabel).map((character, index) => (
              <span data-send-char key={`${character}-${index}`} style={{ "--generate-send-index": index } as React.CSSProperties}>
                {character}
              </span>
            ))}
          </span>
        </span>
        <span className="sr-only" aria-live="polite">{sendAnimationNonce > 0 ? localizedAcknowledgementLabel : ""}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn("generate-action-button shrink-0", compact && "generate-action-button--compact", className)}
      onClick={onClick}
      {...props}
    >
      <span className="generate-action-fold" aria-hidden />
      <span className="generate-action-points" aria-hidden>
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </span>
      <span className="generate-action-inner">
        <Zap aria-hidden />
        {displayChildren}
      </span>
    </button>
  );
}

function parseSize(value: string): { w: string; h: string } {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value.trim());
  return match ? { w: match[1], h: match[2] } : { w: "", h: "" };
}

function providerModelPriceKey(providerId: string, model: string): string {
  return `${providerId}\u0000${model}`;
}

function formatFalModelPrice(price: FalModelPrice, locale: "zh-CN" | "en-US"): string {
  const currencySymbol = price.currency === "USD"
    ? "$"
    : price.currency === "EUR"
      ? "€"
      : price.currency === "CNY"
        ? "¥"
        : `${price.currency} `;
  const maximumFractionDigits = price.unitPrice < 0.001 ? 6 : price.unitPrice < 0.1 ? 4 : 2;
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits }).format(price.unitPrice);
  const unit = locale === "zh-CN"
    ? price.unit === "image" ? "张" : price.unit === "second" ? "秒" : price.unit === "megapixel" ? "MP" : price.unit
    : price.unit === "megapixel" ? "MP" : price.unit;
  return `${currencySymbol}${amount} / ${unit}`;
}

/** 输入框内的提供商切换器：一级选择 Provider，二级选择该 Provider 下的模型。 */
function ProviderPicker({
  providers,
  activeProviderId,
  creditStatus,
  creditLoading,
  requiredCredits,
  onSelect,
  onManage,
  showLabel = true,
  reduceMotion = false
}: {
  providers: ProviderConfig[];
  activeProviderId: string;
  creditStatus: CreditStatus | null;
  creditLoading: boolean;
  requiredCredits: number;
  onSelect: (id: string, model?: string) => void;
  onManage: () => void;
  showLabel?: boolean;
  reduceMotion?: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [falPrices, setFalPrices] = useState<Record<string, FalModelPrice | null>>({});
  const active = providers.find((p) => p.id === activeProviderId) ?? providers[0];
  const officialBalance = creditStatus?.credits.balance;
  const officialLow = officialBalance !== undefined && officialBalance < requiredCredits;
  const switchLabel = t("prompt.provider.switch");

  useEffect(() => {
    if (!open) return;
    const pending = providers.flatMap((provider) => {
      if (provider.type !== "fal") return [];
      return getProviderModels(provider).flatMap((model) => {
        const key = providerModelPriceKey(provider.id, model);
        return Object.prototype.hasOwnProperty.call(falPrices, key) ? [] : [{ provider, model, key }];
      });
    });
    if (pending.length === 0) return;

    if (!hasImageWorkbenchApi()) {
      setFalPrices((current) => Object.fromEntries([
        ...Object.entries(current),
        ...pending.map(({ key }) => [key, null] as const)
      ]));
      return;
    }

    let cancelled = false;
    void Promise.all(pending.map(async ({ provider, model, key }) => {
      try {
        const options = await getImageWorkbenchApi().listFalModels("text-to-image", model, provider.id);
        return [key, options.find((option) => option.endpointId === model)?.price ?? null] as const;
      } catch {
        return [key, null] as const;
      }
    })).then((entries) => {
      if (!cancelled) setFalPrices((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => {
      cancelled = true;
    };
  }, [falPrices, open, providers]);

  function getPriceLabel(provider: ProviderConfig, model: string): string {
    if (provider.type === "official") {
      return t("prompt.provider.cost.credits", { credits: IMAGE_CREDIT_COST });
    }
    if (provider.type === "codex-oauth") {
      return t("prompt.provider.cost.included");
    }
    if (provider.type === "fal") {
      const key = providerModelPriceKey(provider.id, model);
      if (!Object.prototype.hasOwnProperty.call(falPrices, key)) {
        return t("prompt.provider.cost.loading");
      }
      const price = falPrices[key];
      if (price) return formatFalModelPrice(price, locale);
    }
    return t("prompt.provider.cost.provider");
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <ToolbarTooltip label={switchLabel} disabled={open}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={switchLabel}
            className={cn(
              "min-w-0 shrink gap-0 px-2 sm:px-2.5",
              active?.type === "official" && officialLow && "text-destructive hover:text-destructive"
            )}
          >
            <Server className="h-3.5 w-3.5 shrink-0" />
            <ToolbarReveal
              visible={showLabel}
              reduceMotion={reduceMotion}
              className="prompt-dock-provider-label max-w-40 text-xs"
            >
              <span className="block truncate">{active?.type === "official" ? uiText("官方 ·") : active?.name || "Provider"}</span>
            </ToolbarReveal>
            <ToolbarReveal visible={showLabel} reduceMotion={reduceMotion}>
              <ChevronUp className="h-3 w-3 shrink-0 opacity-60" />
            </ToolbarReveal>
          </Button>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-60 shadow-md"
      >
        {providers.map((provider) => {
          const isActiveProvider = provider.id === active?.id;
          const models = getProviderModels(provider);
          return (
            <DropdownMenuSub key={provider.id}>
              <DropdownMenuSubTrigger
                className={cn("min-h-12 py-1.5", isActiveProvider && "bg-accent/60")}
              >
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-xs font-medium text-foreground">
                    {provider.name || t("prompt.provider.unnamed")}
                  </span>
                  <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {provider.model}
                  </span>
                </span>
                {provider.type === "official" ? (
                  <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", officialLow && "text-destructive")}>
                    {creditLoading
                      ? t("prompt.provider.balance", { balance: "--" })
                      : t("prompt.provider.balance", { balance: officialBalance ?? "--" })}
                  </span>
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 max-w-[calc(100vw-1rem)] shadow-md">
                {models.map((model) => {
                  const isActive = isActiveProvider && model === active.model;
                  return (
                    <DropdownMenuItem
                      key={model}
                      onSelect={() => onSelect(provider.id, model)}
                      className={cn("min-h-9 text-xs", isActive && "bg-accent/60")}
                    >
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
                          title={t("prompt.provider.cost.hint")}
                        >
                          {getPriceLabel(provider, model)}
                        </span>
                        <span className="flex h-3.5 w-3.5 items-center justify-center">
                          {isActive ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-9 gap-2 text-xs"
          onSelect={onManage}
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          {t("prompt.provider.manage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 参考图选择器：dock 里"参考图"按钮的下拉。核心是"从画布选择"——把当前画板
 * 的图片做成缩略图网格，点一下即加为参考图；辅以本地上传。已加入的显示 ✓。
 */
function ReferencePicker({
  boardImages,
  referenceCount,
  referencedNodeIds,
  atLimit,
  onAddCanvasReference,
  onReferenceFiles,
  onOpenChange,
  showLabel = true,
  materialMode = false,
  reduceMotion = false
}: {
  boardImages: GeneratedImage[];
  referenceCount: number;
  referencedNodeIds: Set<string>;
  atLimit: boolean;
  onAddCanvasReference: (image: GeneratedImage) => void;
  onReferenceFiles: (files: FileList | null) => void;
  onOpenChange: (open: boolean) => void;
  showLabel?: boolean;
  materialMode?: boolean;
  reduceMotion?: boolean;
}): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pickable = boardImages.filter((image) => !image.pending && Boolean(image.dataUrl));
  const addLabel = t(materialMode ? "prompt.uiDesign.material.add" : "prompt.references.add");

  function changeOpen(next: boolean): void {
    setOpen(next);
    onOpenChange(next);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <ToolbarTooltip label={addLabel} disabled={open}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-0 px-2 sm:px-2.5"
            aria-label={addLabel}
            data-tour="dock-reference"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <ToolbarReveal visible={showLabel} reduceMotion={reduceMotion}>
              {t(materialMode ? "prompt.uiDesign.material.label" : "prompt.references.label")}
            </ToolbarReveal>
            {referenceCount > 0 ? (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                {referenceCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-80 p-2">
        <div className="flex items-center justify-between px-0.5 pb-1.5">
          <span className="text-xs font-medium text-foreground">
            {t(materialMode ? "prompt.uiDesign.material.chooseFromCanvas" : "prompt.references.chooseFromCanvas")}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{referenceCount}/4</span>
        </div>
        {pickable.length > 0 ? (
          <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
            {pickable.map((image) => {
              const added = referencedNodeIds.has(image.id);
              const disabled = added || atLimit;
              return (
                <button
                  key={image.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddCanvasReference(image)}
                  className={cn(
                    "group/pick relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    disabled && "cursor-not-allowed"
                  )}
                  title={added
                    ? t("prompt.references.added")
                    : atLimit
                      ? t("prompt.references.limitReached", { max: 4 })
                      : t("prompt.references.use")}
                >
                  <img src={image.dataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                  {added ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-primary/70 text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : atLimit ? (
                    <span className="absolute inset-0 bg-background/60" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
            {t("prompt.references.emptyCanvas")}
          </p>
        )}

        <Separator className="my-2" />

        <label
          className={cn(
            "flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:bg-accent/50",
            atLimit && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="h-4 w-4" />
          {t(materialMode ? "prompt.uiDesign.material.upload" : "prompt.references.upload")}
          <input
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={atLimit}
            onChange={(event) => {
              onReferenceFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <p className="px-0.5 pt-1.5 text-[11px] text-muted-foreground">
          {t("prompt.references.pasteHint")}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function GenerationSettingsPicker({
  size,
  count,
  transparentBackground,
  maxCount,
  provider,
  onSizeChange,
  onCountChange,
  onTransparentBackgroundChange,
  onOpenChange,
  showLabel = false
}: {
  size: string;
  count: number;
  transparentBackground: boolean;
  maxCount: number;
  provider?: ProviderConfig;
  onSizeChange: (size: string) => void;
  onCountChange: (count: number) => void;
  onTransparentBackgroundChange: (enabled: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  showLabel?: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(() => parseSize(size).w);
  const [h, setH] = useState(() => parseSize(size).h);
  const availablePresets = getProviderImageSizeOptions(provider);
  const supportsCustomSize = providerSupportsCustomImageSize(provider);
  const supportsTransparentBackground = providerSupportsTransparentBackground(provider);
  const validation = validateGptImageSize(Number(w), Number(h));
  const custom = `${w}x${h}`;
  const canApplyCustom = supportsCustomSize && validation.ok && custom !== size;

  useEffect(() => {
    const parsed = parseSize(size);
    setW(parsed.w);
    setH(parsed.h);
  }, [size]);

  function changeOpen(next: boolean): void {
    setOpen(next);
    onOpenChange?.(next);
  }

  function updateCount(next: number): void {
    onCountChange(Math.max(1, Math.min(maxCount, Math.trunc(next) || 1)));
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <ToolbarTooltip label={t("prompt.generationSettings")} disabled={open}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={showLabel ? "sm" : "icon"}
            className={cn("shrink-0 text-muted-foreground", showLabel ? "prompt-fusion-settings h-8 gap-1 px-2" : "h-8 w-8")}
            aria-label={t("prompt.generationSettings")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {showLabel ? <span>{uiText("设置")}</span> : null}
          </Button>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-64 p-2.5">
        <p className="mb-2.5 text-sm font-semibold text-foreground">{t("prompt.generationSettings")}</p>
        <div>
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t("prompt.imageSize")}</p>
          <div className="flex flex-col gap-0.5">
            {availablePresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onSizeChange(preset.value)}
                className={cn(
                  "flex min-h-8 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                  size === preset.value && "bg-accent"
                )}
              >
                <span className="text-xs font-medium tabular-nums text-foreground">
                  {preset.value === "auto" ? t("prompt.auto") : preset.value}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {preset.value === "auto" ? t("prompt.imageSize.autoDescription") : preset.ratio}
                </span>
              </button>
            ))}
          </div>
        </div>
        {supportsCustomSize ? (
          <form
            className="mt-1.5 flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (canApplyCustom) onSizeChange(custom);
            }}
          >
            <Input
              value={w}
              onChange={(event) => setW(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-label={uiText("宽")}
              placeholder={uiText("宽")}
              className="h-7 px-2 text-center text-xs tabular-nums"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <Input
              value={h}
              onChange={(event) => setH(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-label={uiText("高")}
              placeholder={uiText("高")}
              className="h-7 px-2 text-center text-xs tabular-nums"
            />
            <Button type="submit" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={!canApplyCustom}>
              {uiText("应用")}</Button>
          </form>
        ) : null}
        <Separator className="my-2" />
        {supportsTransparentBackground ? (
          <>
            <div className="flex items-center justify-between gap-3 px-0.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{t("prompt.transparentBackground")}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("prompt.transparentBackground.description")}</p>
              </div>
              <Switch
                checked={transparentBackground}
                onCheckedChange={onTransparentBackgroundChange}
                aria-label={t("prompt.transparentBackground")}
              />
            </div>
            <Separator className="my-2" />
          </>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{t("prompt.imageCount")}</span>
          <div className="flex h-8 w-28 items-stretch overflow-hidden rounded-md border border-border bg-background">
            <button
              type="button"
              aria-label={t("prompt.imageCount.decrease")}
              disabled={count <= 1}
              onClick={() => updateCount(count - 1)}
              className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-35"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="flex min-w-0 flex-1 items-center justify-center border-x border-border text-xs font-medium tabular-nums">
              {count}
            </span>
            <button
              type="button"
              aria-label={t("prompt.imageCount.increase")}
              disabled={count >= maxCount}
              onClick={() => updateCount(count + 1)}
              className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-35"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
