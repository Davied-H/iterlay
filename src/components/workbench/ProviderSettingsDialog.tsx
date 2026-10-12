import appIconDefault from "@/assets/app-icon-default.png";
import appIconMascot from "@/assets/app-icon-mascot.png";
import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogHeader,
DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover,PopoverContent,PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCenter } from "@/components/update/update-context";
import { AppIconPickerDialog } from "@/components/workbench/AppIconPickerDialog";
import { Field } from "@/components/workbench/Field";
import { MemoryManagerDialog } from "@/components/workbench/MemoryManagerDialog";
import { GenerateActionButton } from "@/components/workbench/PromptDock";
import { McpIntegrationPanel } from "@/components/workbench/settings/McpIntegrationPanel";
import { PiAgentSettingsPanel } from "@/components/workbench/settings/PiAgentSettingsPanel";
import { useI18n,type MessageKey } from "@/i18n";
import { ASSISTANT_WIDTHS,setAssistantWidth,useAssistantWidth,type AssistantWidth } from "@/lib/assistant-width";
import { getImageWorkbenchApi,getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { addCodexProvider,createCodexProvider } from "@/lib/provider-settings";
import { cn } from "@/lib/utils";
import { getProviderModels,selectProviderModel } from "@shared/provider-models";
import type {
AppIconPreference,
AppSettings,
AssistantIntentSuggestionCount,
AssistantMemoryStats,
AssistantSkillDetail,
AssistantSkillSummary,
CodexAuthStatus,
CopyImageFormat,
CustomAppIcon,
EditInfoMode,
FalModelCategory,
FalModelOption,
FalModelPrice,
FalReferenceInput,
FalSizeMode,
GenerateButtonStyle,
ImageDoubleClickAction,
MemoryUsageLevel,
PiAgentBuiltinToolName,
PiAgentResourceInventory,
ProviderApiMode,
ProviderConfig,
ProviderModelOption,
ProviderType,
TextProviderConfig,
VersionSeparationMode,
VideoProviderConfig
} from "@shared/types";
import {
ArrowLeft,
ArrowRight,
BellRing,
Bot,
Check,
CheckCircle2,
ChevronRight,
ChevronsUpDown,
Eye,
EyeOff,
FolderOpen,
Image as ImageIcon,
KeyRound,
Languages,
LayoutDashboard,
Loader2,
LogIn,
LogOut,
MessageSquareText,
Monitor,
Moon,
Pencil,
Plug,
Plus,
RefreshCw,
RotateCcw,
Search,
Settings2,
ShieldCheck,
Sparkles,
Sun,
Terminal,
Trash2,
UserRound,
Video,
XCircle,
} from "lucide-react";
import { useEffect,useId,useMemo,useRef,useState,type ReactNode } from "react";
import { COMMUNITY_TEXT_PROVIDER } from '../../../shared/community-providers';

interface ProviderSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryPoint?: "default" | "provider-setup" | "model-management";
  providers: ProviderConfig[];
  activeProviderId: string;
  textProviders: TextProviderConfig[];
  activeTextProviderId: string;
  videoProviders: VideoProviderConfig[];
  activeVideoProviderId: string;
  providerKeyStatus: Record<string, boolean>;
  bridgeError: string | null;
  language: AppSettings["language"];
  onLanguageChange: (language: AppSettings["language"]) => void;
  theme: AppSettings["theme"];
  onThemeChange: (theme: AppSettings["theme"], origin?: { x: number; y: number }) => void;
  promptDockAutoCollapse: boolean;
  onPromptDockAutoCollapseChange: (value: boolean) => void;
  advancedVideoModesEnabled: boolean;
  onAdvancedVideoModesEnabledChange: (value: boolean) => void;
  canvasThumbnailPreview: boolean;
  onCanvasThumbnailPreviewChange: (value: boolean) => void;
  canvasMinimapVisible: boolean;
  onCanvasMinimapVisibleChange: (value: boolean) => void;
  canvasImageToolbarOnHover: boolean;
  onCanvasImageToolbarOnHoverChange: (value: boolean) => void;
  canvasRelationshipHoverHighlight: boolean;
  onCanvasRelationshipHoverHighlightChange: (value: boolean) => void;
  wechatStickerExportEnabled: boolean;
  onWechatStickerExportEnabledChange: (value: boolean) => void;
  onlineImageSharingEnabled: boolean;
  onOnlineImageSharingEnabledChange: (value: boolean) => void;
  copyImageFormat: CopyImageFormat;
  onCopyImageFormatChange: (value: CopyImageFormat) => void;
  boardSmartSuggestionsEnabled: boolean;
  onBoardSmartSuggestionsEnabledChange: (value: boolean) => void;
  boardAssistantEnabled: boolean;
  onBoardAssistantEnabledChange: (value: boolean) => void;
  boardAssistantAgentModeEnabled: boolean;
  boardAssistantAgentModeAvailable: boolean;
  boardAssistantAgentModeModel?: string;
  onBoardAssistantAgentModeEnabledChange: (value: boolean) => void;
  piAgentBuiltinTools: PiAgentBuiltinToolName[];
  onPiAgentBuiltinToolsChange: (value: PiAgentBuiltinToolName[]) => void;
  piAgentIterlayTools: string[];
  onPiAgentIterlayToolsChange: (value: string[]) => void;
  piAgentSkillPaths: string[];
  onPiAgentSkillPathsChange: (value: string[]) => void;
  piAgentExtensionPaths: string[];
  onPiAgentExtensionPathsChange: (value: string[]) => void;
  piAgentCustomSkillPaths: string[];
  onPiAgentCustomSkillPathsChange: (value: string[]) => void;
  piAgentCustomExtensionPaths: string[];
  onPiAgentCustomExtensionPathsChange: (value: string[]) => void;
  piAgentMaxTurns: number;
  onPiAgentMaxTurnsChange: (value: number) => void;
  piAgentWebSearchMaxResults: number;
  onPiAgentWebSearchMaxResultsChange: (value: number) => void;
  boardAssistantAwarenessEnabled: boolean;
  onBoardAssistantAwarenessEnabledChange: (value: boolean) => void;
  boardAssistantIntentSuggestionsEnabled: boolean;
  onBoardAssistantIntentSuggestionsEnabledChange: (value: boolean) => void;
  boardAssistantIntentSuggestionCount: AssistantIntentSuggestionCount;
  onBoardAssistantIntentSuggestionCountChange: (value: AssistantIntentSuggestionCount) => void;
  editSmartSuggestionsEnabled: boolean;
  editSmartSuggestionsAvailable: boolean;
  onEditSmartSuggestionsEnabledChange: (value: boolean) => void;
  memoryEnabled: boolean;
  onMemoryEnabledChange: (value: boolean) => void;
  memoryUsageLevel: MemoryUsageLevel;
  onMemoryUsageLevelChange: (value: MemoryUsageLevel) => void;
  editInfoMode: EditInfoMode;
  onEditInfoModeChange: (value: EditInfoMode) => void;
  imageDoubleClickAction: ImageDoubleClickAction;
  onImageDoubleClickActionChange: (value: ImageDoubleClickAction) => void;
  versionSeparationMode: VersionSeparationMode;
  onVersionSeparationModeChange: (value: VersionSeparationMode) => void;
  generateButtonStyle: GenerateButtonStyle;
  onGenerateButtonStyleChange: (value: GenerateButtonStyle) => void;
  downloadDirectory: string;
  onDownloadDirectoryChange: (value: string) => void;
  onSaved: (next: {
    providers: ProviderConfig[];
    activeProviderId: string;
    textProviders: TextProviderConfig[];
    activeTextProviderId: string;
    videoProviders: VideoProviderConfig[];
    activeVideoProviderId: string;
    apiKeyByProviderId: Record<string, string>;
  }) => Promise<void> | void;
}

type Section = "provider" | "system" | "board" | "ai" | "pi-agent" | "agent";
type TestState = { ok: boolean; message: string } | null;
type NotificationTestState = { ok: boolean; message: string } | null;
type ProviderView = "overview" | "connections";
type AiRouteKind = "image" | "text" | "video";
interface AiRouteOption {
  id: string;
  name: string;
  model: string;
  detail: string;
  ready: boolean;
}

const SETTINGS_OPTION_SELECTED_CLASS = "bg-card text-foreground shadow-sm ring-1 ring-foreground/20";
const EMPTY_MODEL_OPTIONS: ProviderModelOption[] = [];
const EMPTY_MODEL_IDS: string[] = [];
const FAL_VIDEO_MODEL_CATEGORIES = ["text-to-video", "image-to-video"] as const satisfies readonly FalModelCategory[];

const THEME_OPTIONS: Array<{
  value: AppSettings["theme"];
  label: MessageKey;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "settings.theme.system", icon: Monitor },
  { value: "light", label: "settings.theme.light", icon: Sun },
  { value: "dark", label: "settings.theme.dark", icon: Moon }
];

const LANGUAGE_OPTIONS: Array<{
  value: AppSettings["language"];
  label: "settings.language.system" | "settings.language.zhCN" | "settings.language.enUS";
}> = [
  { value: "system", label: "settings.language.system" },
  { value: "zh-CN", label: "settings.language.zhCN" },
  { value: "en-US", label: "settings.language.enUS" }
];

// 切换 API Mode 时套用的端点/模型默认值（仅在字段仍为另一模式默认值时才覆盖）。
const MODE_DEFAULTS: Record<ProviderApiMode, Pick<ProviderConfig, "generationEndpoint" | "referenceEndpoint" | "model">> = {
  responses: { generationEndpoint: "/v1/responses", referenceEndpoint: "", model: "gpt-5.5" },
  images: { generationEndpoint: "/v1/images/generations", referenceEndpoint: "/v1/images/edits", model: "gpt-image-2" }
};

function createProvider(index: number): ProviderConfig {
  return {
    id: `provider-${crypto.randomUUID().slice(0, 8)}`,
    name: `新服务 ${index}`,
    type: "openai-compatible",
    apiMode: "responses",
    baseUrl: "",
    generationEndpoint: "/v1/responses",
    referenceEndpoint: "",
    model: "gpt-5.5",
    supportsReferenceImages: true
  };
}

function createTextProvider(index: number): TextProviderConfig {
  return {
    id: `text-provider-${crypto.randomUUID().slice(0, 8)}`,
    name: `AI 助手 ${index}`,
    type: "openai-compatible",
    baseUrl: "",
    model: ""
  };
}

function createVideoProvider(index: number): VideoProviderConfig {
  return {
    id: `video-provider-${crypto.randomUUID().slice(0, 8)}`,
    name: `火山方舟 ${index}`,
    type: "ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seedance-1-5-pro-250528"
  };
}

function videoProviderDefaults(type: VideoProviderConfig["type"]): Pick<VideoProviderConfig, "name" | "baseUrl" | "model" | "models"> {

  const defaults = type === "fal"
    ? { name: "fal.ai", baseUrl: "https://queue.fal.run", model: "fal-ai/kling-video/v2.1/standard/text-to-video" }
    : type === "openrouter"
      ? { name: "OpenRouter", baseUrl: "https://openrouter.ai/api", model: "google/veo-3.1-fast" }
      : type === "minimax"
        ? { name: "MiniMax", baseUrl: "https://api.minimax.io", model: "MiniMax-H3" }
      : { name: "火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seedance-1-5-pro-250528" };
  return { ...defaults, models: [defaults.model] };
}

function createCodexTextProvider(
  id = `text-codex-oauth-${crypto.randomUUID().slice(0, 8)}`,
  authProviderId = id,
  name = "Codex / ChatGPT"
): TextProviderConfig {
  return {
    id,
    name,
    type: "codex-oauth",
    authProviderId,
    baseUrl: "",
    model: "gpt-5.4-mini"
  };
}

function textAuthProviderId(provider: TextProviderConfig): string {
  return provider.authProviderId || provider.id;
}

const FAL_DEFAULTS: Pick<
  ProviderConfig,
  "baseUrl" | "generationEndpoint" | "referenceEndpoint" | "model" | "referenceModel" | "falSizeMode" | "falReferenceInput"
> = {
  baseUrl: "https://queue.fal.run",
  generationEndpoint: "",
  referenceEndpoint: "",
  model: "fal-ai/nano-banana-pro",
  referenceModel: "fal-ai/nano-banana-pro/edit",
  falSizeMode: "aspect_ratio_and_resolution",
  falReferenceInput: "image_urls"
};

const PLATFORM_DEFAULTS: Record<
  Exclude<ProviderType, "official" | "codex-oauth" | "openai-compatible" | "fal">,
  Pick<
    ProviderConfig,
    "name" | "apiMode" | "baseUrl" | "generationEndpoint" | "referenceEndpoint" | "model" | "supportsReferenceImages"
  >
> = {
  openrouter: {
    name: "OpenRouter",
    apiMode: "images",
    baseUrl: "https://openrouter.ai/api",
    generationEndpoint: "/v1/images",
    referenceEndpoint: "",
    model: "bytedance-seed/seedream-4.5",
    supportsReferenceImages: true
  },
  bailian: {
    name: "阿里云百炼",
    apiMode: undefined,
    baseUrl: "https://dashscope.aliyuncs.com",
    generationEndpoint: "/api/v1/services/aigc/multimodal-generation/generation",
    referenceEndpoint: "",
    model: "qwen-image-2.0-pro",
    supportsReferenceImages: true
  },
  ark: {
    name: "火山方舟 Seedream",
    apiMode: undefined,
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    generationEndpoint: "/images/generations",
    referenceEndpoint: "",
    model: "doubao-seedream-5-0-pro-260628",
    supportsReferenceImages: true
  },
  poe: {
    name: "Poe",
    apiMode: "images",
    baseUrl: "https://api.poe.com",
    generationEndpoint: "/v1/images",
    referenceEndpoint: "",
    model: "nano-banana-2",
    supportsReferenceImages: false
  }
};

const BAILIAN_IMAGE_MODEL_OPTIONS: ProviderModelOption[] = [
  { id: "qwen-image-2.0-pro", ownedBy: "Qwen · 通用生成与编辑（推荐）" },
  { id: "qwen-image-2.0", ownedBy: "Qwen · 通用生成与编辑" },
  { id: "qwen-image-3.0-pro", ownedBy: "Qwen · 生成与编辑（限量开放）" },
  { id: "qwen-image-max", ownedBy: "Qwen · 文生图" },
  { id: "qwen-image-plus", ownedBy: "Qwen · 文生图" },
  { id: "qwen-image", ownedBy: "Qwen · 文生图" },
  { id: "qwen-image-edit-max", ownedBy: "Qwen · 图片编辑" },
  { id: "qwen-image-edit-plus", ownedBy: "Qwen · 图片编辑" },
  { id: "qwen-image-edit", ownedBy: "Qwen · 图片编辑" }
];

const ARK_IMAGE_MODEL_OPTIONS: ProviderModelOption[] = [
  { id: "doubao-seedream-5-0-pro-260628", ownedBy: "Seedream · 5.0 pro 高精度编辑（推荐）" },
  { id: "doubao-seedream-5-0-260128", ownedBy: "Seedream · 5.0 lite 联网检索" },
  { id: "doubao-seedream-4-5-251128", ownedBy: "Seedream · 4.5 生成与组图" },
  { id: "doubao-seedream-4-0-250828", ownedBy: "Seedream · 4.0 生成与组图" }
];

function mergeModelOptions(
  presets: ProviderModelOption[],
  remote: ProviderModelOption[]
): ProviderModelOption[] {
  const seen = new Set<string>();
  return [...presets, ...remote].filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function apiKeyPlaceholder(type: ProviderType): string {
  if (type === "fal") return "fal key";
  if (type === "openrouter") return "sk-or-v1-...";
  if (type === "poe") return "Poe API Key";
  if (type === "ark") return "火山方舟 API Key";
  return "sk-...";
}

const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  official: "官方",
  "codex-oauth": "Codex 账号",
  "openai-compatible": "OpenAI Compatible",
  openrouter: "OpenRouter",
  bailian: "阿里云百炼",
  ark: "火山方舟 Seedream",
  poe: "Poe",
  fal: "fal.ai"
};

const SIGNED_OUT_CODEX_STATUS: CodexAuthStatus = { state: "signed-out" };

function hostOf(baseUrl: string): string {
  if (!baseUrl.trim()) return "未填写服务地址";
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function ProviderSettingsDialog({
  open,
  onOpenChange,
  entryPoint = "default",
  providers,
  activeProviderId,
  textProviders,
  activeTextProviderId,
  videoProviders,
  activeVideoProviderId,
  providerKeyStatus,
  bridgeError,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  promptDockAutoCollapse,
  onPromptDockAutoCollapseChange,
  advancedVideoModesEnabled,
  onAdvancedVideoModesEnabledChange,
  canvasThumbnailPreview,
  onCanvasThumbnailPreviewChange,
  canvasMinimapVisible,
  onCanvasMinimapVisibleChange,
  canvasImageToolbarOnHover,
  onCanvasImageToolbarOnHoverChange,
  canvasRelationshipHoverHighlight,
  onCanvasRelationshipHoverHighlightChange,
  wechatStickerExportEnabled,
  onWechatStickerExportEnabledChange,
  onlineImageSharingEnabled,
  onOnlineImageSharingEnabledChange,
  copyImageFormat,
  onCopyImageFormatChange,
  boardSmartSuggestionsEnabled,
  onBoardSmartSuggestionsEnabledChange,
  boardAssistantEnabled,
  onBoardAssistantEnabledChange,
  boardAssistantAgentModeEnabled,
  boardAssistantAgentModeAvailable,
  boardAssistantAgentModeModel,
  onBoardAssistantAgentModeEnabledChange,
  piAgentBuiltinTools,
  onPiAgentBuiltinToolsChange,
  piAgentIterlayTools,
  onPiAgentIterlayToolsChange,
  piAgentSkillPaths,
  onPiAgentSkillPathsChange,
  piAgentExtensionPaths,
  onPiAgentExtensionPathsChange,
  piAgentCustomSkillPaths,
  onPiAgentCustomSkillPathsChange,
  piAgentCustomExtensionPaths,
  onPiAgentCustomExtensionPathsChange,
  piAgentMaxTurns,
  onPiAgentMaxTurnsChange,
  piAgentWebSearchMaxResults,
  onPiAgentWebSearchMaxResultsChange,
  boardAssistantAwarenessEnabled,
  onBoardAssistantAwarenessEnabledChange,
  boardAssistantIntentSuggestionsEnabled,
  onBoardAssistantIntentSuggestionsEnabledChange,
  boardAssistantIntentSuggestionCount,
  onBoardAssistantIntentSuggestionCountChange,
  editSmartSuggestionsEnabled,
  editSmartSuggestionsAvailable,
  onEditSmartSuggestionsEnabledChange,
  memoryEnabled,
  onMemoryEnabledChange,
  memoryUsageLevel,
  onMemoryUsageLevelChange,
  editInfoMode,
  onEditInfoModeChange,
  imageDoubleClickAction,
  onImageDoubleClickActionChange,
  versionSeparationMode,
  onVersionSeparationModeChange,
  generateButtonStyle,
  onGenerateButtonStyleChange,
  downloadDirectory,
  onDownloadDirectoryChange,
  onSaved
}: ProviderSettingsDialogProps): React.ReactElement {
  const { t } = useI18n();
  const segmentedControlId = useId();
  const assistantWidth = useAssistantWidth();
  const updateCenter = useUpdateCenter();
  const [section, setSection] = useState<Section>("board");
  const [list, setList] = useState<ProviderConfig[]>(providers);
  const [activeId, setActiveId] = useState(activeProviderId);
  const [textList, setTextList] = useState<TextProviderConfig[]>(textProviders);
  const [activeTextId, setActiveTextId] = useState(activeTextProviderId);
  const [videoList, setVideoList] = useState<VideoProviderConfig[]>(videoProviders);
  const [activeVideoId, setActiveVideoId] = useState(activeVideoProviderId);
  /** 当前编辑的是图片还是文本 Provider（两类 id 各自独立）。 */
  const [selectedKind, setSelectedKind] = useState<AiRouteKind>("image");
  const [selectedId, setSelectedId] = useState(activeProviderId);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [memoryStats, setMemoryStats] = useState<AssistantMemoryStats | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryManagerOpen, setMemoryManagerOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestState>(null);
  const [saving, setSaving] = useState(false);
  const [directoryDraft, setDirectoryDraft] = useState(downloadDirectory);
  const [savingDirectory, setSavingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearResult, setCacheClearResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [notificationTesting, setNotificationTesting] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<NotificationTestState>(null);
  const [appIcon, setAppIcon] = useState<AppIconPreference>("default");
  const [customAppIcons, setCustomAppIcons] = useState<CustomAppIcon[]>([]);
  const [pendingAppIcon, setPendingAppIcon] = useState<AppIconPreference | null>(null);
  const [appIconAction, setAppIconAction] = useState<"upload" | `delete:${string}` | null>(null);
  const [appIconPickerOpen, setAppIconPickerOpen] = useState(false);
  const [appIconError, setAppIconError] = useState<string | null>(null);
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLDivElement | null>(null);
  /** 两步删除确认：先点一次“武装”，3 秒内再点才真正删除。 */
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const [setupFlow, setSetupFlow] = useState<{ providerId: string; step: 1 | 2 | 3 | 4 } | null>(null);
  const [textSetupFlow, setTextSetupFlow] = useState<{ providerId: string; step: 1 | 2 | 3 | 4 } | null>(null);
  const [codexStatuses, setCodexStatuses] = useState<Record<string, CodexAuthStatus>>({});
  const [codexAction, setCodexAction] = useState<"sign-in" | "refresh" | "sign-out" | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [providerView, setProviderView] = useState<ProviderView>("overview");
  const [routeSavingKind, setRouteSavingKind] = useState<AiRouteKind | null>(null);
  const [routeSaveError, setRouteSaveError] = useState<string | null>(null);
  const [mcpClients, setMcpClients] = useState<Array<{
    id: "codex" | "claude-code";
    configured: boolean;
    configPath: string;
    skillInstalled: boolean;
    skillPath: string;
  }>>([]);
  const [mcpAction, setMcpAction] = useState<`${"setup" | "remove"}:${"codex" | "claude-code"}` | null>(null);
  const [mcpStep, setMcpStep] = useState<{ client: "codex" | "claude-code"; label: string } | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [piAgentResources, setPiAgentResources] = useState<PiAgentResourceInventory | null>(null);
  const [piAgentResourceError, setPiAgentResourceError] = useState<string | null>(null);
  const [assistantSkills, setAssistantSkills] = useState<AssistantSkillSummary[]>([]);
  const [assistantSkillEditor, setAssistantSkillEditor] = useState<AssistantSkillDetail | null>(null);
  const [assistantSkillDraft, setAssistantSkillDraft] = useState("");
  const [assistantSkillBusy, setAssistantSkillBusy] = useState(false);
  const [assistantSkillError, setAssistantSkillError] = useState<string | null>(null);
  const [pluginPackageAction, setPluginPackageAction] = useState<"codex" | "claude-code" | null>(null);
  const [pluginPackagePaths, setPluginPackagePaths] = useState<Partial<Record<"codex" | "claude-code", string>>>({});
  const [pluginPackageError, setPluginPackageError] = useState<string | null>(null);
  const [codexExamplesOpen, setCodexExamplesOpen] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const providerSetupOpenedRef = useRef(false);
  const dialogOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    let contentFrameId = 0;
    const shellFrameId = window.requestAnimationFrame(() => {
      contentFrameId = window.requestAnimationFrame(() => setContentReady(true));
    });
    return () => {
      window.cancelAnimationFrame(shellFrameId);
      if (contentFrameId) window.cancelAnimationFrame(contentFrameId);
    };
  }, [open]);

  useEffect(() => {
    if (!deleteArmedId) return;
    const timer = window.setTimeout(() => setDeleteArmedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteArmedId]);

  // 每次打开都以外部最新状态为准重新播种草稿。
  useEffect(() => {
    if (!open) {
      providerSetupOpenedRef.current = false;
      dialogOpenRef.current = false;
      setCodexExamplesOpen(false);
      setMcpStep(null);
      return;
    }
    if (dialogOpenRef.current) return;
    dialogOpenRef.current = true;
    const seed = providers.length > 0 ? providers : [createProvider(1)];
    const shouldStartProviderSetup = entryPoint === "provider-setup" && !providerSetupOpenedRef.current;
    const setupProvider = shouldStartProviderSetup ? createProvider(seed.length + 1) : null;
    setList(setupProvider ? [...seed, setupProvider] : seed);
    setActiveId(activeProviderId || seed[0].id);
    const textSeed = textProviders.length > 0 ? textProviders : [{ ...COMMUNITY_TEXT_PROVIDER }];
    setTextList(textSeed);
    setActiveTextId(activeTextProviderId || textSeed[0].id);
    const videoSeed = videoProviders.length > 0 ? videoProviders : [createVideoProvider(1)];
    setVideoList(videoSeed);
    setActiveVideoId(activeVideoProviderId || videoSeed[0].id);
    setSelectedKind("image");
    setSelectedId(setupProvider?.id || activeProviderId || seed[0].id);
    setKeyDrafts({});
    setDeleteArmedId(null);
    setTestResult(null);
    setSetupFlow(setupProvider ? { providerId: setupProvider.id, step: 1 } : null);
    setTextSetupFlow(null);
    setCodexAction(null);
    setCodexError(null);
    setRouteSavingKind(null);
    setRouteSaveError(null);
    const opensProviderConnections = Boolean(setupProvider) || entryPoint === "provider-setup" || entryPoint === "model-management";
    setProviderView(opensProviderConnections ? "connections" : "overview");
    setSection(opensProviderConnections ? "provider" : "board");
    if (shouldStartProviderSetup) providerSetupOpenedRef.current = true;
    setDirectoryDraft(downloadDirectory);
    setDirectoryError(null);
    setCacheClearResult(null);
    setNotificationTestResult(null);
    setAppIconError(null);
    if (!bridgeError) {
      void getImageWorkbenchApi().getSettings().then((settings) => {
        const currentDirectory = settings.downloadDirectory ?? "";
        setDirectoryDraft(currentDirectory);
        setAppIcon(settings.appIcon ?? "default");
        setCustomAppIcons(settings.customAppIcons ?? []);
        setCodexStatuses(settings.codexAuthStatusByProviderId ?? {});
        onDownloadDirectoryChange(currentDirectory);
      }).catch(() => undefined);
    }
  }, [open, entryPoint, providers, activeProviderId, textProviders, activeTextProviderId, videoProviders, activeVideoProviderId, bridgeError, downloadDirectory, onDownloadDirectoryChange]);

  useEffect(() => {
    if (!open || bridgeError) return;
    void getImageWorkbenchApi().getMcpIntegrationStatus()
      .then((status) => setMcpClients(status.clients))
      .catch((error) => setMcpError(getWorkbenchErrorMessage(error, "无法读取 Coding Agent 配置。")));
  }, [open, bridgeError]);

  useEffect(() => {
    if (!open || bridgeError || !boardAssistantAgentModeAvailable) return;
    let disposed = false;
    setPiAgentResourceError(null);
    void getImageWorkbenchApi().getPiAgentResources()
      .then((inventory) => {
        if (!disposed) setPiAgentResources(inventory);
      })
      .catch((error) => {
        if (!disposed) setPiAgentResourceError(getWorkbenchErrorMessage(error, "无法读取 Pi Agent 资源。"));
      });
    void getImageWorkbenchApi().listAssistantSkills()
      .then((skills) => {
        if (!disposed) setAssistantSkills(skills);
      })
      .catch((error) => {
        if (!disposed) setPiAgentResourceError(getWorkbenchErrorMessage(error, "无法读取内置助手 Skill。"));
      });
    return () => {
      disposed = true;
    };
  }, [boardAssistantAgentModeAvailable, bridgeError, open]);

  async function openAssistantSkillEditor(id: string): Promise<void> {
    setAssistantSkillBusy(true);
    setAssistantSkillError(null);
    try {
      const detail = await getImageWorkbenchApi().getAssistantSkill(id);
      setAssistantSkillEditor(detail);
      setAssistantSkillDraft(detail.content);
    } catch (error) {
      setAssistantSkillError(getWorkbenchErrorMessage(error, "无法读取助手 Skill。"));
    } finally {
      setAssistantSkillBusy(false);
    }
  }

  async function saveAssistantSkill(): Promise<void> {
    if (!assistantSkillEditor) return;
    setAssistantSkillBusy(true);
    setAssistantSkillError(null);
    try {
      const detail = await getImageWorkbenchApi().saveAssistantSkill(
        assistantSkillEditor.id,
        assistantSkillDraft
      );
      setAssistantSkillEditor(detail);
      setAssistantSkillDraft(detail.content);
      setAssistantSkills(await getImageWorkbenchApi().listAssistantSkills());
    } catch (error) {
      setAssistantSkillError(getWorkbenchErrorMessage(error, "无法保存助手 Skill。"));
    } finally {
      setAssistantSkillBusy(false);
    }
  }

  async function resetAssistantSkill(): Promise<void> {
    if (!assistantSkillEditor) return;
    setAssistantSkillBusy(true);
    setAssistantSkillError(null);
    try {
      const detail = await getImageWorkbenchApi().resetAssistantSkill(assistantSkillEditor.id);
      setAssistantSkillEditor(detail);
      setAssistantSkillDraft(detail.content);
      setAssistantSkills(await getImageWorkbenchApi().listAssistantSkills());
    } catch (error) {
      setAssistantSkillError(getWorkbenchErrorMessage(error, "无法重置助手 Skill。"));
    } finally {
      setAssistantSkillBusy(false);
    }
  }

  async function setupMcpClient(client: "codex" | "claude-code"): Promise<void> {
    setMcpAction(`setup:${client}`);
    setMcpError(null);
    try {
      const api = getImageWorkbenchApi();
      let status = await api.getMcpIntegrationStatus();
      let current = status.clients.find((item) => item.id === client);
      if (!current?.configured) {
        setMcpStep({ client, label: "正在写入 MCP 配置" });
        status = await api.configureMcpClient(client);
        current = status.clients.find((item) => item.id === client);
      }
      if (!current?.skillInstalled) {
        setMcpStep({ client, label: "正在安装 Iterlay Skill" });
        status = await api.installMcpSkill(client);
      }
      setMcpClients(status.clients);
      if (client === "codex" && status.clients.find((item) => item.id === client)?.configured && status.clients.find((item) => item.id === client)?.skillInstalled) {
        setCodexExamplesOpen(true);
      }
    } catch (error) {
      setMcpError(getWorkbenchErrorMessage(error, "无法完成 Coding Agent 配置。"));
    } finally {
      setMcpAction(null);
      setMcpStep(null);
    }
  }

  async function removeMcpIntegration(client: "codex" | "claude-code"): Promise<void> {
    setMcpAction(`remove:${client}`);
    setMcpError(null);
    try {
      const api = getImageWorkbenchApi();
      if (typeof api.removeMcpIntegration !== "function") {
        throw new Error("Iterlay 刚更新了 Coding Agent 功能，请完整退出并重新打开 App 后再移除集成。");
      }
      setMcpStep({ client, label: "正在移除 MCP 配置与 Iterlay Skill" });
      const status = await api.removeMcpIntegration(client);
      setMcpClients(status.clients);
    } catch (error) {
      setMcpError(getWorkbenchErrorMessage(error, "无法移除 Coding Agent 集成。"));
      void getImageWorkbenchApi().getMcpIntegrationStatus().then((status) => setMcpClients(status.clients)).catch(() => undefined);
    } finally {
      setMcpAction(null);
      setMcpStep(null);
    }
  }

  async function exportMcpPluginPackage(client: "codex" | "claude-code"): Promise<void> {
    setPluginPackageAction(client);
    setPluginPackageError(null);
    try {
      const result = await getImageWorkbenchApi().exportMcpPluginPackage(client);
      if (result.ok && result.path) setPluginPackagePaths((current) => ({ ...current, [client]: result.path }));
    } catch (error) {
      setPluginPackageError(getWorkbenchErrorMessage(error, "无法导出 Coding Agent 插件包。"));
    } finally {
      setPluginPackageAction(null);
    }
  }

  async function chooseDirectory(): Promise<void> {
    setSavingDirectory(true);
    setDirectoryError(null);
    try {
      const result = await getImageWorkbenchApi().chooseDownloadDirectory();
      if (!result.ok || !result.path) return;
      setDirectoryDraft(result.path);
      onDownloadDirectoryChange(result.path);
    } catch (error) {
      setDirectoryError(getWorkbenchErrorMessage(error, "无法选择下载目录。"));
    } finally {
      setSavingDirectory(false);
    }
  }

  async function applyDirectory(): Promise<void> {
    setSavingDirectory(true);
    setDirectoryError(null);
    try {
      const result = await getImageWorkbenchApi().setDownloadDirectory(directoryDraft);
      if (!result.ok || !result.path) return;
      setDirectoryDraft(result.path);
      onDownloadDirectoryChange(result.path);
    } catch (error) {
      setDirectoryError(getWorkbenchErrorMessage(error, "无法保存下载目录。"));
    } finally {
      setSavingDirectory(false);
    }
  }

  async function clearAppCache(): Promise<void> {
    if (!window.confirm(t("settings.clearCache.confirm"))) return;
    setClearingCache(true);
    setCacheClearResult(null);
    try {
      await getImageWorkbenchApi().clearAppCache();
      setCacheClearResult({ ok: true, message: t("settings.clearCache.success") });
    } catch (error) {
      setCacheClearResult({ ok: false, message: getWorkbenchErrorMessage(error, t("settings.clearCache.error")) });
    } finally {
      setClearingCache(false);
    }
  }

  async function testSystemNotification(): Promise<void> {
    setNotificationTesting(true);
    setNotificationTestResult(null);
    try {
      const result = await getImageWorkbenchApi().testSystemNotification();
      if (result.status === "delivered") {
        setNotificationTestResult({
          ok: true,
          message: "系统已接收测试通知。未看到横幅时，请检查系统通知权限、横幅样式和专注模式。"
        });
      } else if (result.status === "requested") {
        setNotificationTestResult({
          ok: false,
          message: "通知请求已提交，但系统没有返回投递状态。请打开系统设置检查 Iterlay 通知权限。"
        });
      } else {
        setNotificationTestResult({
          ok: false,
          message: result.message || (result.status === "unsupported"
            ? "当前系统不支持桌面通知。"
            : "系统通知投递失败。")
        });
      }
    } catch (error) {
      setNotificationTestResult({
        ok: false,
        message: getWorkbenchErrorMessage(error, "无法发送测试通知。")
      });
    } finally {
      setNotificationTesting(false);
    }
  }

  async function openNotificationSettings(): Promise<void> {
    try {
      const result = await getImageWorkbenchApi().openSystemNotificationSettings();
      if (!result.ok) {
        setNotificationTestResult({ ok: false, message: "当前系统无法直接打开通知设置。" });
      }
    } catch (error) {
      setNotificationTestResult({
        ok: false,
        message: getWorkbenchErrorMessage(error, "无法打开系统通知设置。")
      });
    }
  }

  async function changeAppIcon(next: AppIconPreference): Promise<void> {
    if (next === appIcon || pendingAppIcon) return;
    setPendingAppIcon(next);
    setAppIconError(null);
    try {
      const result = await getImageWorkbenchApi().setAppIcon(next);
      setAppIcon(result.appIcon);
    } catch (error) {
      setAppIconError(getWorkbenchErrorMessage(error, "无法切换应用图标。"));
    } finally {
      setPendingAppIcon(null);
    }
  }

  async function uploadAppIcon(file: File): Promise<void> {
    if (pendingAppIcon || appIconAction) return;
    setAppIconAction("upload");
    setAppIconError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await getImageWorkbenchApi().uploadAppIcon({ name: file.name, dataUrl });
      setAppIcon(result.appIcon);
      setCustomAppIcons(result.customAppIcons);
    } catch (error) {
      setAppIconError(getWorkbenchErrorMessage(error, "无法上传伙伴头像。"));
    } finally {
      setAppIconAction(null);
    }
  }

  async function deleteAppIcon(id: string): Promise<void> {
    if (pendingAppIcon || appIconAction) return;
    setAppIconAction(`delete:${id}`);
    setAppIconError(null);
    try {
      const result = await getImageWorkbenchApi().deleteAppIcon(id);
      setAppIcon(result.appIcon);
      setCustomAppIcons(result.customAppIcons);
    } catch (error) {
      setAppIconError(getWorkbenchErrorMessage(error, "无法删除伙伴头像。"));
    } finally {
      setAppIconAction(null);
    }
  }

  const selected = useMemo(
    () => list.find((p) => p.id === selectedId) ?? list[0],
    [list, selectedId]
  );
  const selectedText = useMemo(
    () => textList.find((p) => p.id === selectedId) ?? textList[0],
    [textList, selectedId]
  );
  const selectedVideo = useMemo(
    () => videoList.find((p) => p.id === selectedId) ?? videoList[0],
    [videoList, selectedId]
  );
  const activeImageProvider = useMemo(
    () => list.find((provider) => provider.id === activeId) ?? list[0],
    [activeId, list]
  );
  const activeAssistantProvider = useMemo(
    () => textList.find((provider) => provider.id === activeTextId) ?? textList[0],
    [activeTextId, textList]
  );
  const activeVideoProvider = useMemo(
    () => videoList.find((provider) => provider.id === activeVideoId) ?? videoList[0],
    [activeVideoId, videoList]
  );
  const falImageProviders = useMemo(
    () => list.filter((provider) => provider.type === "fal"),
    [list]
  );
  const openRouterImageProviders = useMemo(
    () => list.filter((provider) => provider.type === "openrouter"),
    [list]
  );

  function videoConnectionId(provider: VideoProviderConfig): string {
    return (provider.type === "fal" || provider.type === "openrouter") && provider.connectionProviderId
      ? provider.connectionProviderId
      : provider.id;
  }

  function isVideoProviderReady(provider: VideoProviderConfig): boolean {

    const connectionId = videoConnectionId(provider);
    return Boolean(providerKeyStatus[connectionId]) || Boolean(keyDrafts[connectionId]?.trim());
  }

  function isImageProviderReady(provider: ProviderConfig): boolean {

    if (provider.type === "codex-oauth") {
      return ["connected", "refreshing"].includes(
        (codexStatuses[provider.id] ?? SIGNED_OUT_CODEX_STATUS).state
      );
    }
    return Boolean(providerKeyStatus[provider.id]) || Boolean(keyDrafts[provider.id]?.trim());
  }

  function isTextProviderReady(provider: TextProviderConfig): boolean {

    if (provider.type === "codex-oauth") {
      return ["connected", "refreshing"].includes(
        (codexStatuses[textAuthProviderId(provider)] ?? SIGNED_OUT_CODEX_STATUS).state
      );
    }
    return Boolean(providerKeyStatus[provider.id]) || Boolean(keyDrafts[provider.id]?.trim());
  }

  const imageRouteOptions = list.map<AiRouteOption>((provider) => ({
    id: provider.id,
    name: provider.name || "未命名服务",
    model: provider.model || "默认图片模型",
    detail: provider.type === "codex-oauth"
        ? (codexStatuses[provider.id]?.email || "Codex / ChatGPT 账号")
        : hostOf(provider.baseUrl),
    ready: isImageProviderReady(provider)
  }));
  const textRouteOptions = textList.map<AiRouteOption>((provider) => ({
    id: provider.id,
    name: provider.name || "未命名服务",
    model: provider.model || ("默认文本模型"),
    detail: provider.type === "codex-oauth"
        ? (codexStatuses[textAuthProviderId(provider)]?.email || "Codex / ChatGPT 账号")
        : hostOf(provider.baseUrl),
    ready: isTextProviderReady(provider)
  }));
  const videoRouteOptions = videoList.map<AiRouteOption>((provider) => ({
    id: provider.id,
    name: provider.name || "未命名服务",
    model: provider.model || "默认视频模型",
    detail: hostOf(
      (provider.type === "fal" || provider.type === "openrouter") && provider.connectionProviderId
        ? list.find((candidate) => candidate.id === provider.connectionProviderId)?.baseUrl || provider.baseUrl
        : provider.baseUrl
    ),
    ready: isVideoProviderReady(provider)
  }));

  function apiKeyDraftPayload(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(keyDrafts)
        .map(([id, value]) => [id, value.trim()] as const)
        .filter(([, value]) => Boolean(value))
    );
  }

  async function changeActiveRoute(kind: AiRouteKind, providerId: string): Promise<void> {
    if (disableEditing || routeSavingKind) return;
    const previousId = kind === "image" ? activeId : kind === "text" ? activeTextId : activeVideoId;
    if (providerId === previousId) return;
    const nextActiveId = kind === "image" ? providerId : activeId;
    const nextActiveTextId = kind === "text" ? providerId : activeTextId;
    const nextActiveVideoId = kind === "video" ? providerId : activeVideoId;
    setRouteSaveError(null);
    setRouteSavingKind(kind);
    if (kind === "image") setActiveId(providerId);
    else if (kind === "text") setActiveTextId(providerId);
    else setActiveVideoId(providerId);
    try {
      await onSaved({
        providers: list,
        activeProviderId: nextActiveId,
        textProviders: textList,
        activeTextProviderId: nextActiveTextId,
        videoProviders: videoList,
        activeVideoProviderId: nextActiveVideoId,
        apiKeyByProviderId: apiKeyDraftPayload()
      });
    } catch (error) {
      if (kind === "image") setActiveId(previousId);
      else if (kind === "text") setActiveTextId(previousId);
      else setActiveVideoId(previousId);
      setRouteSaveError(getWorkbenchErrorMessage(error, "无法切换默认模型。"));
    } finally {
      setRouteSavingKind(null);
    }
  }

  function openConnectionManager(kind: AiRouteKind = "image", providerId?: string): void {
    const nextId = providerId ?? (kind === "image" ? activeId : kind === "text" ? activeTextId : activeVideoId);
    setSelectedKind(kind);
    setSelectedId(nextId);
    setSetupFlow(null);
    setTextSetupFlow(null);
    setTestResult(null);
    setProviderView("connections");
  }

  function selectConnectionTab(kind: AiRouteKind): void {
    if (kind === selectedKind) return;
    const setupId = kind === "image" ? setupFlow?.providerId : textSetupFlow?.providerId;
    setSelectedKind(kind);
    setSelectedId(setupId ?? (kind === "image" ? activeId : kind === "text" ? activeTextId : activeVideoId));
    setTestResult(null);
  }

  function patchSelected(partial: Partial<ProviderConfig>): void {
    if (!selected) return;
    setList((current) => current.map((provider) => {
      if (provider.id !== selected.id) return provider;
      const patched = { ...provider, ...partial };
      if (!partial.model || partial.models) return patched;
      if (partial.type && partial.type !== provider.type) {
        return { ...patched, models: [partial.model] };
      }
      return selectProviderModel(patched, partial.model);
    }));
    setTestResult(null);
  }

  function patchSelectedText(partial: Partial<TextProviderConfig>): void {
    if (!selectedText) return;
    setTextList((current) => current.map((p) => (p.id === selectedText.id ? { ...p, ...partial } : p)));
    setTestResult(null);
  }

  function patchSelectedVideo(partial: Partial<VideoProviderConfig>): void {
    if (!selectedVideo) return;
    setVideoList((current) => current.map((provider) => {
      if (provider.id !== selectedVideo.id) return provider;
      const patched = { ...provider, ...partial };
      if (!partial.model || partial.models) return patched;
      if (partial.type && partial.type !== provider.type) return { ...patched, models: [partial.model] };
      const models = videoProviderModels(patched);
      return { ...patched, models: [partial.model, ...models.filter((model) => model !== partial.model)] };
    }));
    setTestResult(null);
  }

  function changeApiMode(mode: ProviderApiMode): void {
    if (!selected) return;
    const prevMode: ProviderApiMode = selected.apiMode ?? "responses";
    if (mode === prevMode) return;
    const prev = MODE_DEFAULTS[prevMode];
    const next = MODE_DEFAULTS[mode];
    patchSelected({
      apiMode: mode,
      generationEndpoint: selected.generationEndpoint === prev.generationEndpoint ? next.generationEndpoint : selected.generationEndpoint,
      referenceEndpoint: (selected.referenceEndpoint ?? "") === prev.referenceEndpoint ? next.referenceEndpoint : selected.referenceEndpoint,
      model: selected.model === prev.model ? next.model : selected.model,
      compatResponseFormat: mode === "responses" ? undefined : selected.compatResponseFormat
    });
  }

  function changeProviderType(type: ProviderType): void {
    if (!selected || type === selected.type || type === "official") return;

    if (selected.type === "codex-oauth" && type !== "codex-oauth") {
      removeLinkedTextProviders(selected.id);
    }
    if (type === "codex-oauth") {
      const addition = addCodexProvider(list, activeId, selected.id);
      setList(addition.providers);
      setSelectedKind("image");
      setSelectedId(addition.provider.id);
      setActiveId(addition.activeProviderId);
      const linkedTextId = `text-${addition.provider.id}`;
      setTextList((current) => current.some((provider) =>
        provider.type === "codex-oauth" && textAuthProviderId(provider) === addition.provider.id
      ) ? current : [...current, createCodexTextProvider(linkedTextId, addition.provider.id)]);
      setTestResult(null);
      return;
    }
    const generatedName =
      /^(?:新 Provider|新服务) \d+$/.test(selected.name) ||
      ["fal.ai", "OpenRouter", "阿里云百炼", "Poe"].includes(selected.name);
    if (type === "fal") {
      patchSelected({
        type,
        name: generatedName ? "fal.ai" : selected.name,
        ...FAL_DEFAULTS,
        apiMode: undefined,
        compatResponseFormat: undefined,
        supportsReferenceImages: true
      });
      return;
    }
    if (type !== "openai-compatible") {
      patchSelected({
        type,
        ...PLATFORM_DEFAULTS[type],
        name: generatedName ? PLATFORM_DEFAULTS[type].name : selected.name,
        compatResponseFormat: undefined,
        referenceModel: undefined,
        falSizeMode: undefined,
        falReferenceInput: undefined
      });
      return;
    }
    patchSelected({
      type,
      name: generatedName ? `新服务 ${list.indexOf(selected) + 1}` : selected.name,
      apiMode: "responses",
      baseUrl: "",
      ...MODE_DEFAULTS.responses,
      compatResponseFormat: undefined,
      referenceModel: undefined,
      falSizeMode: undefined,
      falReferenceInput: undefined,
      supportsReferenceImages: true
    });
  }

  function addProvider(): void {
    const created = createProvider(list.length + 1);
    setList((current) => [...current, created]);
    setProviderView("connections");
    setSelectedKind("image");
    setSelectedId(created.id);
    setTestResult(null);
    setSetupFlow({ providerId: created.id, step: 1 });
  }

  function chooseSetupProvider(type: "codex-oauth" | "openai-compatible" | "fal" | "openrouter" | "bailian" | "ark"): void {
    if (!selected || setupFlow?.providerId !== selected.id) return;
    if (type === "codex-oauth") {
      setList((current) => current.map((provider) =>
        provider.id === selected.id ? createCodexProvider(selected.id) : provider
      ));
      const linkedTextId = `text-${selected.id}`;
      setTextList((current) => current.some((provider) =>
        provider.type === "codex-oauth" && textAuthProviderId(provider) === selected.id
      ) ? current : [...current, createCodexTextProvider(linkedTextId, selected.id)]);
      setActiveTextId(linkedTextId);
      setSetupFlow({ providerId: selected.id, step: 2 });
      return;
    }
    changeProviderType(type);
    setSetupFlow(null);
  }

  async function signInCodex(): Promise<void> {
    const authProviderId = selectedKind === "text"
      ? selectedText?.type === "codex-oauth" ? textAuthProviderId(selectedText) : null
      : selected?.type === "codex-oauth" ? selected.id : null;
    if (!authProviderId) return;
    setCodexAction("sign-in");
    setCodexError(null);
    setCodexStatuses((current) => ({ ...current, [authProviderId]: { state: "authorizing" } }));
    try {
      const status = await getImageWorkbenchApi().startCodexAuth(authProviderId);
      setCodexStatuses((current) => ({ ...current, [authProviderId]: status }));
      setTestResult({ ok: true, message: "Codex 账号已连接。" });
      if (selectedKind === "image" && selected && setupFlow?.providerId === selected.id) {
        setSetupFlow({ providerId: selected.id, step: 3 });
      }
      if (selectedKind === "text" && selectedText && textSetupFlow?.providerId === selectedText.id) {
        setTextSetupFlow({ providerId: selectedText.id, step: 3 });
      }
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "Codex 登录未完成。");
      setCodexError(message);
      const status = await getImageWorkbenchApi().getCodexAuthStatus(authProviderId).catch(() => SIGNED_OUT_CODEX_STATUS);
      setCodexStatuses((current) => ({ ...current, [authProviderId]: status }));
    } finally {
      setCodexAction(null);
    }
  }

  async function refreshCodex(): Promise<void> {
    const authProviderId = selectedKind === "text"
      ? selectedText?.type === "codex-oauth" ? textAuthProviderId(selectedText) : null
      : selected?.type === "codex-oauth" ? selected.id : null;
    if (!authProviderId) return;
    setCodexAction("refresh");
    setCodexError(null);
    try {
      const status = await getImageWorkbenchApi().refreshCodexAuth(authProviderId);
      setCodexStatuses((current) => ({ ...current, [authProviderId]: status }));
      setTestResult({ ok: true, message: "登录状态已刷新。" });
    } catch (error) {
      setCodexError(getWorkbenchErrorMessage(error, "无法刷新 Codex 登录状态。"));
      const status = await getImageWorkbenchApi().getCodexAuthStatus(authProviderId).catch(() => SIGNED_OUT_CODEX_STATUS);
      setCodexStatuses((current) => ({ ...current, [authProviderId]: status }));
    } finally {
      setCodexAction(null);
    }
  }

  async function signOutCodex(): Promise<void> {
    const authProviderId = selectedKind === "text"
      ? selectedText?.type === "codex-oauth" ? textAuthProviderId(selectedText) : null
      : selected?.type === "codex-oauth" ? selected.id : null;
    if (!authProviderId) return;
    if (!window.confirm("退出这个 Codex / ChatGPT 账号？本机保存的 OAuth 凭据将被删除。")) return;
    setCodexAction("sign-out");
    setCodexError(null);
    try {
      const status = await getImageWorkbenchApi().signOutCodex(authProviderId);
      setCodexStatuses((current) => ({ ...current, [authProviderId]: status }));
      setTestResult(null);
    } catch (error) {
      setCodexError(getWorkbenchErrorMessage(error, "无法退出 Codex 账号。"));
    } finally {
      setCodexAction(null);
    }
  }

  function addTextProvider(): void {
    const created = createTextProvider(textList.length + 1);
    setTextList((current) => [...current, created]);
    setProviderView("connections");
    setSelectedKind("text");
    setSelectedId(created.id);
    setTestResult(null);
    setSetupFlow(null);
    setTextSetupFlow({ providerId: created.id, step: 1 });
  }

  function addVideoProvider(): void {
    const created = createVideoProvider(videoList.length + 1);
    setVideoList((current) => [...current, created]);
    setProviderView("connections");
    setSelectedKind("video");
    setSelectedId(created.id);
    setTestResult(null);
  }

  function removeVideoProvider(id: string): void {

    if (videoList.length <= 1) return;
    setVideoList((current) => {
      const next = current.filter((provider) => provider.id !== id);
      if (activeVideoId === id) setActiveVideoId(next[0].id);
      if (selectedKind === "video" && selectedId === id) setSelectedId(next[0].id);
      return next;
    });
    setKeyDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function chooseTextSetupProvider(type: "codex-oauth" | "openai-compatible"): void {
    if (!selectedText || textSetupFlow?.providerId !== selectedText.id) return;
    if (type === "codex-oauth") {
      const linkedImage = list.find((provider) => provider.type === "codex-oauth");
      patchSelectedText(createCodexTextProvider(
        selectedText.id,
        linkedImage?.id || selectedText.id,
        linkedImage?.name || "Codex / ChatGPT"
      ));
    } else {
      patchSelectedText({ type: "openai-compatible", authProviderId: undefined });
    }
    setTextSetupFlow({ providerId: selectedText.id, step: 2 });
  }

  function removeTextProvider(id: string): void {
    const target = textList.find((provider) => provider.id === id);

    if (target?.type === "codex-oauth" && list.some((provider) =>
      provider.type === "codex-oauth" && provider.id === textAuthProviderId(target)
    )) return;
    if (textList.length <= 1) return;
    setTextList((current) => {
      const next = current.filter((p) => p.id !== id);
      if (activeTextId === id) setActiveTextId(next[0].id);
      if (selectedKind === "text" && selectedId === id) setSelectedId(next[0].id);
      return next;
    });
    setKeyDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (textSetupFlow?.providerId === id) setTextSetupFlow(null);
  }

  function removeLinkedTextProviders(authProviderId: string): void {
    setTextList((current) => {
      const removedIds = new Set(current.filter((provider) =>
        provider.type === "codex-oauth" && textAuthProviderId(provider) === authProviderId
      ).map((provider) => provider.id));
      if (removedIds.size === 0) return current;
      const next = current.filter((provider) => !removedIds.has(provider.id));
      if (removedIds.has(activeTextId)) setActiveTextId(next[0]?.id ?? COMMUNITY_TEXT_PROVIDER.id);
      if (selectedKind === "text" && removedIds.has(selectedId)) setSelectedId(next[0]?.id ?? "");
      setKeyDrafts((drafts) => Object.fromEntries(
        Object.entries(drafts).filter(([id]) => !removedIds.has(id))
      ));
      return next;
    });
  }

  function removeProvider(id: string): void {
    const target = list.find((provider) => provider.id === id);

    if (list.length <= 1) return;
    if (target?.type === "codex-oauth") removeLinkedTextProviders(target.id);
    setList((current) => {
      const next = current.filter((p) => p.id !== id);
      if (activeId === id) setActiveId(next[0].id);
      if (selectedId === id) setSelectedId(next[0].id);
      return next;
    });
    setKeyDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function handleTest(): Promise<void> {
    const target = selectedKind === "text" ? selectedText : selectedKind === "video" ? selectedVideo : selected;
    if (!target) return;
    setTesting(true);
    setTestResult(null);
    try {
      const api = getImageWorkbenchApi();
      const result = selectedKind === "text"
        ? await api.testTextProvider(selectedText, keyDrafts[selectedText.id]?.trim() || undefined)
        : selectedKind === "video"
          ? await api.testVideoProvider(
              selectedVideo,
              keyDrafts[videoConnectionId(selectedVideo)]?.trim() || undefined
            )
          : await api.testProvider(selected, keyDrafts[selected.id]?.trim() || undefined);
      setTestResult(result);
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(): Promise<void> {
    const finishingSetup = Boolean(setupFlow || textSetupFlow);
    setSaving(true);
    try {
      await onSaved({
        providers: list,
        activeProviderId: activeId,
        textProviders: textList,
        activeTextProviderId: activeTextId,
        videoProviders: videoList,
        activeVideoProviderId: activeVideoId,
        apiKeyByProviderId: apiKeyDraftPayload()
      });
      setSetupFlow(null);
      setTextSetupFlow(null);
      if (finishingSetup) setProviderView("overview");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let api: ReturnType<typeof getImageWorkbenchApi>;
    try {
      api = getImageWorkbenchApi();
    } catch {
      return;
    }
    void api.getMemoryStats()
      .then((stats) => {
        if (!cancelled) setMemoryStats(stats);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setMemoryManagerOpen(false);
  }, [open]);

  async function clearAssistantMemory(): Promise<void> {
    if (!window.confirm("清除全部助手记忆？画板、图片、生成历史、评论和助手对话原文不会被删除。")) return;
    setClearingMemory(true);
    try {
      await getImageWorkbenchApi().clearMemory();
      setMemoryStats({ eventCount: 0, activeMemoryCount: 0, candidateMemoryCount: 0 });
    } finally {
      setClearingMemory(false);
    }
  }

  const selectedHasKey = selectedKind === "text"
    ? selectedText
      ? selectedText.type === "official" || (selectedText.type === "codex-oauth"
        ? ["connected", "refreshing"].includes((codexStatuses[textAuthProviderId(selectedText)] ?? SIGNED_OUT_CODEX_STATUS).state)
        : Boolean(providerKeyStatus[selectedText.id]) || Boolean(keyDrafts[selectedText.id]?.trim()))
      : false
    : selected
      ? selected.type === "official" ||
        (selected.type === "codex-oauth"
          ? ["connected", "refreshing"].includes((codexStatuses[selected.id] ?? SIGNED_OUT_CODEX_STATUS).state)
          : Boolean(providerKeyStatus[selected.id]) || Boolean(keyDrafts[selected.id]?.trim()))
      : false;
  const disableEditing = Boolean(bridgeError);
  const fieldsDisabled = disableEditing || selected?.type === "official";
  const textFieldsDisabled = disableEditing || selectedText?.type === "official" || selectedText?.type === "codex-oauth";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setDialogPortalContainer}
        overlayClassName="bg-black/35 data-[state=open]:duration-150 dark:bg-black/65"
        className={cn(
          "max-w-none gap-0 overflow-hidden rounded-lg border-border/80 p-0 shadow-2xl data-[state=open]:duration-150 data-[state=open]:zoom-in-95",
          section === "pi-agent"
            ? "w-[min(1240px,calc(100vw-24px))]"
            : section === "provider" && providerView === "connections"
            ? "w-[min(1080px,calc(100vw-32px))]"
            : "w-[min(980px,calc(100vw-32px))]"
        )}
      >
        <div className={cn(
          "flex min-h-[520px]",
          section === "pi-agent"
            ? "h-[min(780px,calc(100vh-24px))]"
            : "h-[min(680px,calc(100vh-48px))]"
        )}>
          {/* 左栏：只保留设置一级导航。 */}
          <aside className="library-sidebar flex w-[168px] shrink-0 flex-col border-r max-[820px]:w-[56px]">
            <div className="flex h-[64px] shrink-0 items-center px-4 max-[820px]:justify-center max-[820px]:px-0">
              <Settings2 className="hidden h-4 w-4 text-foreground max-[820px]:block" aria-label={t("settings.title")} />
              <span className="text-[15px] font-semibold text-foreground max-[820px]:hidden">{t("settings.title")}</span>
            </div>
            <nav className="flex flex-col gap-1 px-2.5" aria-label={t("settings.categories")}>
              <NavItem icon={LayoutDashboard} label={t("settings.board.title")} active={section === "board"} onClick={() => setSection("board")} />
              <NavItem icon={Sparkles} label={t("settings.ai.title")} active={section === "ai"} onClick={() => setSection("ai")} />
              <NavItem icon={Bot} label="Pi Agent" active={section === "pi-agent"} onClick={() => setSection("pi-agent")} />
              <NavItem
                icon={Plug}
                label="AI 模型"
                active={section === "provider"}
                onClick={() => {
                  setSection("provider");
                  setProviderView("overview");
                  setRouteSaveError(null);
                }}
              />
              <NavItem icon={Terminal} label="Coding Agent" active={section === "agent"} onClick={() => setSection("agent")} />
              <NavItem icon={Settings2} label={t("settings.system.title")} active={section === "system"} onClick={() => setSection("system")} />
            </nav>

            <div className="flex-1" />
          </aside>

          {contentReady && section === "provider" && providerView === "connections" ? (
            <section className="flex w-[clamp(280px,27vw,320px)] min-w-0 shrink-0 flex-col overflow-hidden border-r border-border/80 bg-background/55" aria-label="模型列表">
              <div className="flex h-[64px] shrink-0 items-center border-b border-border/80 px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="返回 AI 模型"
                    title="返回 AI 模型"
                    onClick={() => setProviderView("overview")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="truncate text-sm font-semibold text-foreground">模型管理</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto shrink-0 gap-1.5"
                  disabled={disableEditing}
                  aria-label={`添加${selectedKind === "image" ? "图片" : selectedKind === "video" ? "视频" : "助手"}模型`}
                  onClick={() => {
                    if (selectedKind === "video") addVideoProvider();
                    else if (selectedKind === "text") addTextProvider();
                    else addProvider();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  添加模型
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1 border-b border-border/80 p-2" role="tablist" aria-label="模型类型">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedKind === "image"}
                  onClick={() => selectConnectionTab("image")}
                  className={cn(
                    "relative isolate flex h-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedKind === "image" ? "text-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {selectedKind === "image" ? <SegmentedControlIndicator layoutId={`provider-kind-${segmentedControlId}`} className="rounded-md bg-card shadow-sm ring-1 ring-foreground/20" /> : null}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="max-[900px]:sr-only">图片模型</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground max-[900px]:hidden">{list.length}</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedKind === "video"}
                  onClick={() => selectConnectionTab("video")}
                  className={cn(
                    "relative isolate flex h-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedKind === "video" ? "text-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {selectedKind === "video" ? <SegmentedControlIndicator layoutId={`provider-kind-${segmentedControlId}`} className="rounded-md bg-card shadow-sm ring-1 ring-foreground/20" /> : null}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5" />
                    <span className="max-[900px]:sr-only">视频模型</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground max-[900px]:hidden">{videoList.length}</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedKind === "text"}
                  onClick={() => selectConnectionTab("text")}
                  className={cn(
                    "relative isolate flex h-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedKind === "text" ? "text-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {selectedKind === "text" ? <SegmentedControlIndicator layoutId={`provider-kind-${segmentedControlId}`} className="rounded-md bg-card shadow-sm ring-1 ring-foreground/20" /> : null}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    <span className="max-[900px]:sr-only">助手模型</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground max-[900px]:hidden">{textList.length}</span>
                  </span>
                </button>
              </div>
              {selectedKind === "video" && selectedVideo && selectedVideo.type !== "official" ? (
                <div className="flex shrink-0 items-center border-b border-border/80 px-3 py-2">
                  <VideoProviderModelAddControl
                    provider={selectedVideo}
                    disabled={disableEditing}
                    portalContainer={dialogPortalContainer}
                    apiKeyOverride={keyDrafts[videoConnectionId(selectedVideo)]?.trim() || undefined}
                    onChange={(model) => {
                      const next = addVideoProviderModel(selectedVideo, model);
                      if (next.models.length !== videoProviderModels(selectedVideo).length) {
                        patchSelectedVideo(next);
                      }
                    }}
                  />
                </div>
              ) : null}
              <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                <div className="flex w-full min-w-0 flex-col gap-1 overflow-hidden p-3">
                  {selectedKind === "image" ? list.map((provider) => (
                    <ModelConnectionListItem
                      key={provider.id}
                      name={provider.name || "未命名服务"}
                      model={provider.model || "默认图片模型"}
                      type={provider.type}
                      selected={provider.id === selectedId}
                      active={provider.id === activeId}
                      ready={isImageProviderReady(provider)}
                      settingActive={routeSavingKind === "image" && provider.id === activeId}
                      setActiveDisabled={disableEditing || Boolean(routeSavingKind)}
                      canDelete={provider.type !== "official" && list.length > 1}
                      deleteArmed={deleteArmedId === provider.id}
                      onSelect={() => {
                        setSelectedId(provider.id);
                        setTestResult(null);
                      }}
                      onSetActive={() => {
                        setSelectedId(provider.id);
                        void changeActiveRoute("image", provider.id);
                      }}
                      onDelete={() => {
                        if (deleteArmedId === provider.id) {
                          removeProvider(provider.id);
                          setDeleteArmedId(null);
                        } else setDeleteArmedId(provider.id);
                      }}
                    />
                  )) : selectedKind === "text" ? textList.map((provider) => {
                    const linkedCodexText = provider.type === "codex-oauth" && list.some((imageProvider) =>
                      imageProvider.type === "codex-oauth" && imageProvider.id === textAuthProviderId(provider)
                    );
                    return (
                      <ModelConnectionListItem
                        key={provider.id}
                        name={provider.name || "未命名服务"}
                        model={provider.model || ("默认文本模型")}
                        type={provider.type}
                        selected={provider.id === selectedId}
                        active={provider.id === activeTextId}
                        ready={isTextProviderReady(provider)}
                        settingActive={routeSavingKind === "text" && provider.id === activeTextId}
                        setActiveDisabled={disableEditing || Boolean(routeSavingKind)}
                        canDelete={provider.type !== "official" && textList.length > 1 && !linkedCodexText}
                        deleteArmed={deleteArmedId === provider.id}
                        onSelect={() => {
                          setSelectedId(provider.id);
                          setTestResult(null);
                        }}
                        onSetActive={() => {
                          setSelectedId(provider.id);
                          void changeActiveRoute("text", provider.id);
                        }}
                        onDelete={() => {
                          if (deleteArmedId === provider.id) {
                            removeTextProvider(provider.id);
                            setDeleteArmedId(null);
                          } else setDeleteArmedId(provider.id);
                        }}
                      />
                    );
                  }) : videoList.map((provider) => (
                    <ModelConnectionListItem
                      key={provider.id}
                      name={provider.name || "未命名服务"}
                      model={provider.model || "默认视频模型"}
                      type={"openai-compatible"}
                      selected={provider.id === selectedId}
                      active={provider.id === activeVideoId}
                      ready={isVideoProviderReady(provider)}
                      settingActive={routeSavingKind === "video" && provider.id === activeVideoId}
                      setActiveDisabled={disableEditing || Boolean(routeSavingKind)}
                      canDelete={provider.type !== "official" && videoList.length > 1}
                      deleteArmed={deleteArmedId === provider.id}
                      onSelect={() => { setSelectedId(provider.id); setTestResult(null); }}
                      onSetActive={() => { setSelectedId(provider.id); void changeActiveRoute("video", provider.id); }}
                      onDelete={() => {
                        if (deleteArmedId === provider.id) { removeVideoProvider(provider.id); setDeleteArmedId(null); }
                        else setDeleteArmedId(provider.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* 右栏：当前 Provider 配置或其他设置内容。 */}
          <section className="workspace-surface flex min-w-0 flex-1 flex-col overflow-hidden">
            {!contentReady ? null : section === "provider" && providerView === "overview" ? (
              <AiConfigurationOverview
                imageOptions={imageRouteOptions}
                activeImageId={activeId}
                textOptions={textRouteOptions}
                activeTextId={activeTextId}
                videoOptions={videoRouteOptions}
                activeVideoId={activeVideoId}
                savingKind={routeSavingKind}
                error={routeSaveError || bridgeError}
                disabled={disableEditing}
                portalContainer={dialogPortalContainer}
                onSelectImage={(providerId) => changeActiveRoute("image", providerId)}
                onSelectText={(providerId) => changeActiveRoute("text", providerId)}
                onSelectVideo={(providerId) => changeActiveRoute("video", providerId)}
                onManageImage={() => openConnectionManager("image", activeImageProvider?.id)}
                onManageText={() => openConnectionManager("text", activeAssistantProvider?.id)}
                onManageVideo={() => openConnectionManager("video", activeVideoProvider?.id)}
                onRepairImage={() => openConnectionManager("image", activeImageProvider?.id)}
                onRepairText={() => openConnectionManager("text", activeAssistantProvider?.id)}
                onRepairVideo={() => openConnectionManager("video", activeVideoProvider?.id)}
              />
            ) : section === "provider" && selectedKind === "video" && selectedVideo ? (
              <>
                <DialogHeader className="min-h-[64px] justify-center border-b border-border/80 bg-background/85 py-2.5 pl-6 pr-14">
                  <DialogTitle className="truncate">{selectedVideo.name || "未命名视频服务"}</DialogTitle>
                  <DialogDescription className="mt-1 truncate text-xs leading-5">{selectedVideo.type === "fal" ? "fal.ai" : selectedVideo.type === "openrouter" ? "OpenRouter" : selectedVideo.type === "minimax" ? "MiniMax" : "火山方舟"} 视频生成 · {selectedVideo.model}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex w-full flex-col gap-6 px-6 py-5">
                    {<>
                    <FormSection title="连接信息">
                      <Field label="服务类型">
                        <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-4">
                          {(["ark", "fal", "openrouter", "minimax"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={selectedVideo.type === type}
                              disabled={disableEditing}
                              className={cn(
                                "h-9 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedVideo.type === type ? "border-foreground/25 bg-accent text-foreground" : "border-input bg-background text-muted-foreground hover:bg-accent/50"
                              )}
                              onClick={() => patchSelectedVideo({ type, connectionProviderId: undefined, ...videoProviderDefaults(type) })}
                            >
                              {type === "ark" ? "火山方舟" : type === "fal" ? "fal.ai" : type === "openrouter" ? "OpenRouter" : "MiniMax"}
                            </button>
                          ))}
                        </div>
                      </Field>
                      {selectedVideo.type === "fal" || selectedVideo.type === "openrouter" ? (
                        <Field label="连接配置">
                          <Select
                            value={selectedVideo.connectionProviderId || "independent"}
                            disabled={disableEditing}
                            onValueChange={(value) => patchSelectedVideo({
                              connectionProviderId: value === "independent" ? undefined : value
                            })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="independent">独立配置</SelectItem>
                              {(selectedVideo.type === "fal" ? falImageProviders : openRouterImageProviders).map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>复用图片服务 · {provider.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(selectedVideo.type === "fal" ? falImageProviders : openRouterImageProviders).length === 0 ? (
                            <p className="text-[11px] leading-5 text-muted-foreground">添加同类型图片服务后，可复用其地址和 API Key。</p>
                          ) : selectedVideo.connectionProviderId ? (
                            <p className="text-[11px] leading-5 text-muted-foreground">服务地址与 API Key 跟随所选图片服务，视频模型仍独立配置。</p>
                          ) : null}
                        </Field>
                      ) : null}
                      <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                        <Field label="名称"><Input value={selectedVideo.name} disabled={disableEditing} onChange={(event) => patchSelectedVideo({ name: event.target.value })} /></Field>
                        <Field label="服务地址"><Input value={selectedVideo.connectionProviderId ? list.find((provider) => provider.id === selectedVideo.connectionProviderId)?.baseUrl || "关联的图片服务不存在" : selectedVideo.baseUrl} disabled={disableEditing || Boolean(selectedVideo.connectionProviderId)} placeholder={selectedVideo.type === "fal" ? "https://queue.fal.run" : selectedVideo.type === "openrouter" ? "https://openrouter.ai/api" : selectedVideo.type === "minimax" ? "https://api.minimax.io" : "https://ark.cn-beijing.volces.com/api/v3"} onChange={(event) => patchSelectedVideo({ baseUrl: event.target.value })} /></Field>
                      </div>
                      <Field label="视频模型">
                        <VideoProviderModelsEditor
                          provider={selectedVideo}
                          disabled={disableEditing}
                          portalContainer={dialogPortalContainer}
                          apiKeyOverride={keyDrafts[videoConnectionId(selectedVideo)]?.trim() || undefined}
                          onChange={(model, models) => patchSelectedVideo({ model, models })}
                        />
                      </Field>
                    </FormSection>
                    <FormSection title="访问密钥">
                      <Field label="API Key">
                        <ApiKeyInput value={selectedVideo.connectionProviderId ? "" : keyDrafts[selectedVideo.id] ?? ""} disabled={disableEditing || Boolean(selectedVideo.connectionProviderId)} placeholder={selectedVideo.connectionProviderId ? (isVideoProviderReady(selectedVideo) ? "已从图片服务复用" : "所选图片服务尚未配置密钥") : providerKeyStatus[selectedVideo.id] ? "已安全保存，输入可覆盖" : `输入 ${selectedVideo.type === "fal" ? "fal.ai" : selectedVideo.type === "openrouter" ? "OpenRouter" : selectedVideo.type === "minimax" ? "MiniMax" : "火山方舟"} API Key`} onValueChange={(value) => { setKeyDrafts((current) => ({ ...current, [selectedVideo.id]: value })); setTestResult(null); }} />
                        <p className="text-[11px] leading-5 text-muted-foreground">{selectedVideo.connectionProviderId ? "密钥由所选图片服务统一管理。" : "密钥仅保存在本机，不会上传或随项目同步。"}</p>
                      </Field>
                    </FormSection>
                    </>}
                  </div>
                </ScrollArea>
                <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
                  <TestStatus bridgeError={bridgeError} testing={testing} result={testResult} hasKey={isVideoProviderReady(selectedVideo)} credential={"key"} />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void handleTest()} disabled={disableEditing || testing || saving}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "测试连接"}</Button>
                    <Button onClick={() => void handleSave()} disabled={disableEditing || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}</Button>
                  </div>
                </div>
              </>
            ) : section === "provider" && selectedKind === "text" && selectedText ? (
              <>
                <DialogHeader className="min-h-[64px] justify-center border-b border-border/80 bg-background/85 py-2.5 pl-6 pr-14">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <DialogTitle className="truncate">
                          {textSetupFlow?.providerId === selectedText.id ? "添加 AI 助手服务" : selectedText.name || "未命名服务"}
                        </DialogTitle>
                        <TypeBadge label={selectedText.type === "codex-oauth" ? "Codex 账号" : "OpenAI Compatible"} />
                      </div>
                      <DialogDescription className="mt-1 truncate text-xs leading-5">
                        {selectedText.type === "codex-oauth"
                            ? "使用 Codex / ChatGPT 账号提供 AI 智能辅助；可与图片模型共享登录。"
                            : `${selectedText.model || "未选择模型"} · ${hostOf(selectedText.baseUrl)}`}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                {textSetupFlow?.providerId === selectedText.id ? (
                  <TextProviderSetupWizard
                    step={textSetupFlow.step}
                    provider={selectedText}
                    status={selectedText.type === "codex-oauth"
                      ? codexStatuses[textAuthProviderId(selectedText)] ?? SIGNED_OUT_CODEX_STATUS
                      : SIGNED_OUT_CODEX_STATUS}
                    action={codexAction}
                    error={codexError}
                    testing={testing}
                    saving={saving}
                    testResult={testResult}
                    hasSavedKey={Boolean(providerKeyStatus[selectedText.id])}
                    keyDraft={keyDrafts[selectedText.id] ?? ""}
                    portalContainer={dialogPortalContainer}
                    onChoose={chooseTextSetupProvider}
                    onPatch={patchSelectedText}
                    onKeyChange={(value) => {
                      setKeyDrafts((current) => ({ ...current, [selectedText.id]: value }));
                      setTestResult(null);
                    }}
                    onBack={() => setTextSetupFlow((current) => current ? {
                      ...current,
                      step: Math.max(1, current.step - 1) as 1 | 2 | 3 | 4
                    } : current)}
                    onNext={() => setTextSetupFlow((current) => current ? {
                      ...current,
                      step: Math.min(4, current.step + 1) as 1 | 2 | 3 | 4
                    } : current)}
                    onSignIn={() => void signInCodex()}
                    onTest={() => void handleTest()}
                    onSave={() => void handleSave()}
                    onCancel={() => {
                      removeTextProvider(selectedText.id);
                      setTextSetupFlow(null);
                    }}
                  />
                ) : (
                <>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex w-full flex-col gap-6 px-6 py-5">
                    {selectedText.type === "codex-oauth" ? (
                      <>
                        <CodexAccountPanel
                          status={codexStatuses[textAuthProviderId(selectedText)] ?? SIGNED_OUT_CODEX_STATUS}
                          action={codexAction}
                          error={codexError}
                          capabilityLabel="文本模型"
                          capabilityValue={selectedText.model || "gpt-5.4-mini"}
                          onSignIn={() => void signInCodex()}
                          onRefresh={() => void refreshCodex()}
                          onSignOut={() => void signOutCodex()}
                        />
                        <FormSection title="服务信息">
                          <Field label="名称">
                            <Input
                              value={selectedText.name}
                              disabled={disableEditing}
                              onChange={(event) => patchSelectedText({ name: event.target.value })}
                            />
                          </Field>
                          <Field label="文本模型">
                            <ProviderModelCombobox
                              value={selectedText.model}
                              disabled={disableEditing}
                              textProvider={selectedText}
                              portalContainer={dialogPortalContainer}
                              placeholder="选择文本模型"
                              onChange={(model) => patchSelectedText({ model })}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">
                              可用模型由当前 ChatGPT 账号提供，打开菜单时自动刷新。
                            </p>
                          </Field>
                          <div className="divide-y divide-border rounded-lg border border-border bg-card">
                            <SummaryRow label="账号绑定" value={selectedText.authProviderId === selectedText.id ? "独立账号" : "与图片能力共用"} />
                          </div>
                        </FormSection>
                      </>
                    ) : (
                      <>
                        <FormSection title="连接信息">
                          <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                            <Field label="名称">
                              <Input
                                value={selectedText.name}
                                disabled={textFieldsDisabled}
                                onChange={(event) => patchSelectedText({ name: event.target.value })}
                                placeholder="给这个 AI 助手起个名字"
                              />
                            </Field>
                            <Field label="服务地址">
                              <Input
                                value={selectedText.baseUrl}
                                disabled={textFieldsDisabled}
                                onChange={(event) => patchSelectedText({ baseUrl: event.target.value })}
                                placeholder="https://api.example.com"
                              />
                            </Field>
                          </div>

                          <Field label="助手模型">
                            <ProviderModelCombobox
                              value={selectedText.model}
                              disabled={textFieldsDisabled}
                              textProvider={selectedText}
                              portalContainer={dialogPortalContainer}
                              apiKeyOverride={keyDrafts[selectedText.id]?.trim()}
                              placeholder="选择文本模型"
                              onChange={(model) => patchSelectedText({ model })}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">
                              请求发往 Base URL 的 /v1/chat/completions；修改建议与主体识别会传图，建议选支持视觉的模型。
                            </p>
                          </Field>
                        </FormSection>

                        <FormSection title="访问密钥">
                          <Field label="API Key">
                            <ApiKeyInput
                              value={keyDrafts[selectedText.id] ?? ""}
                              disabled={textFieldsDisabled}
                              placeholder={providerKeyStatus[selectedText.id] ? "已安全保存，输入可覆盖" : "sk-..."}
                              onValueChange={(value) => {
                                setKeyDrafts((current) => ({ ...current, [selectedText.id]: value }));
                                setTestResult(null);
                              }}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">密钥仅保存在本机，不会上传或随项目同步。</p>
                          </Field>
                        </FormSection>
                      </>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
                  <TestStatus
                    bridgeError={bridgeError}
                    testing={testing}
                    result={testResult}
                    hasKey={selectedHasKey}
                    credential={selectedText.type === "codex-oauth" ? "account" : "key"}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleTest()}
                      disabled={disableEditing || testing || saving}
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "测试连接"}
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={disableEditing || saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                    </Button>
                  </div>
                </div>
                </>
                )}
              </>
            ) : section === "provider" && selected ? (
              <>
                <DialogHeader className="min-h-[64px] justify-center border-b border-border/80 bg-background/85 py-2.5 pl-6 pr-14">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <DialogTitle className="truncate">
                          {setupFlow?.providerId === selected.id ? "添加图片服务" : selected.name || "未命名服务"}
                        </DialogTitle>
                        <TypeBadge label={PROVIDER_TYPE_LABELS[selected.type]} />
                      </div>
                      <DialogDescription className="mt-1 truncate text-xs leading-5">
                        {setupFlow?.providerId === selected.id
                          ? "选择服务并完成连接，技术参数会按服务自动配置。"
                          : selected.type === "codex-oauth"
                            ? "使用本机保存的 Codex / ChatGPT 登录状态直接生成图片。"
                          : `${selected.model || "未选择模型"} · ${hostOf(selected.baseUrl)}`}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                {setupFlow?.providerId === selected.id ? (
                  <ProviderSetupWizard
                    step={setupFlow.step}
                    provider={selected}
                    status={codexStatuses[selected.id] ?? SIGNED_OUT_CODEX_STATUS}
                    action={codexAction}
                    error={codexError}
                    testing={testing}
                    saving={saving}
                    testResult={testResult}
                    onChoose={chooseSetupProvider}
                    onBack={() => setSetupFlow((current) => current ? {
                      ...current,
                      step: Math.max(1, current.step - 1) as 1 | 2 | 3 | 4
                    } : current)}
                    onNext={() => setSetupFlow((current) => current ? {
                      ...current,
                      step: Math.min(4, current.step + 1) as 1 | 2 | 3 | 4
                    } : current)}
                    onSignIn={() => void signInCodex()}
                    onTest={() => void handleTest()}
                    onSave={() => void handleSave()}
                    onCancel={() => {
                      removeProvider(selected.id);
                      setSetupFlow(null);
                    }}
                  />
                ) : (
                <>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex w-full flex-col gap-6 px-6 py-5">
                    {selected.type === "codex-oauth" ? (
                      <>
                      <CodexAccountPanel
                        status={codexStatuses[selected.id] ?? SIGNED_OUT_CODEX_STATUS}
                        action={codexAction}
                        error={codexError}
                        onSignIn={() => void signInCodex()}
                        onRefresh={() => void refreshCodex()}
                        onSignOut={() => void signOutCodex()}
                      />
                      <FormSection title="服务信息">
                        <Field label="名称">
                          <Input
                            value={selected.name}
                            disabled={disableEditing}
                            onChange={(event) => patchSelected({ name: event.target.value })}
                            placeholder="例如：我的 Codex"
                          />
                        </Field>
                        <div className="divide-y divide-border rounded-lg border border-border bg-card">
                          <SummaryRow label="图片模型" value="gpt-image-2" mono />
                          <SummaryRow label="同步文本模型" value="gpt-5.4-mini" mono />
                          <SummaryRow label="运行方式" value="Codex Responses · 本机直连" />
                        </div>
                      </FormSection>
                      </>
                    ) : (
                      <>
                        <FormSection title="连接信息">
                          <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                            <Field label="名称">
                              <Input
                                value={selected.name}
                                disabled={fieldsDisabled}
                                onChange={(event) => patchSelected({ name: event.target.value })}
                                placeholder="给这个服务起个名字"
                              />
                            </Field>
                            <Field label="服务类型">
                              <Select
                                value={selected.type}
                                disabled={fieldsDisabled}
                                onValueChange={(value) => changeProviderType(value as ProviderType)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="codex-oauth">新增 Codex / ChatGPT 账号</SelectItem>
                                  <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
                                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                                  <SelectItem value="bailian">阿里云百炼</SelectItem>
                                  <SelectItem value="ark">火山方舟 Seedream</SelectItem>
                                  <SelectItem value="poe">Poe</SelectItem>
                                  <SelectItem value="fal">fal.ai</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                          </div>

                          {selected.type === "fal" ? (
                            <>
                              <Field label="队列地址">
                                <Input
                                  value={selected.baseUrl}
                                  disabled={disableEditing}
                                  onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                  placeholder="https://queue.fal.run"
                                />
                              </Field>

                              <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                <Field label="图片模型">
                                  <FalModelCombobox
                                    value={selected.model}
                                    disabled={disableEditing}
                                    category="text-to-image"
                                    portalContainer={dialogPortalContainer}
                                    providerId={selected.id}
                                    apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                    onChange={(model) => patchSelected({ model })}
                                    placeholder="fal-ai/nano-banana-pro"
                                  />
                                </Field>
                                <Field label="编辑模型">
                                  <FalModelCombobox
                                    value={selected.referenceModel ?? ""}
                                    disabled={disableEditing}
                                    category="image-to-image"
                                    portalContainer={dialogPortalContainer}
                                    providerId={selected.id}
                                    apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                    onChange={(referenceModel) => patchSelected({ referenceModel })}
                                    placeholder="留空则沿用生成模型"
                                  />
                                </Field>
                              </div>

                              <AdvancedSettings>
                                <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                  <Field label="尺寸参数">
                                    <Select
                                      value={selected.falSizeMode ?? "image_size"}
                                      disabled={disableEditing}
                                      onValueChange={(value) => patchSelected({ falSizeMode: value as FalSizeMode })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="image_size">image_size</SelectItem>
                                        <SelectItem value="aspect_ratio">aspect_ratio</SelectItem>
                                        <SelectItem value="aspect_ratio_and_resolution">aspect_ratio + resolution</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </Field>
                                  <Field label="参考图参数">
                                    <Select
                                      value={selected.falReferenceInput ?? "image_urls"}
                                      disabled={disableEditing}
                                      onValueChange={(value) => patchSelected({ falReferenceInput: value as FalReferenceInput })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="image_urls">image_urls（多图）</SelectItem>
                                        <SelectItem value="image_url">image_url（单图）</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </Field>
                                </div>
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  参数名取决于所选模型的 API Schema，任务会通过官方队列提交并自动获取结果。
                                </p>
                              </AdvancedSettings>
                            </>
                          ) : selected.type === "bailian" ? (
                            <>
                              <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                <Field label="服务地址">
                                  <Input
                                    value={selected.baseUrl}
                                    disabled={disableEditing}
                                    onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                    placeholder="https://dashscope.aliyuncs.com"
                                  />
                                </Field>
                                <Field label="生成 / 编辑模型">
                                  <ProviderModelCombobox
                                    value={selected.model}
                                    disabled={disableEditing}
                                    provider={selected}
                                    portalContainer={dialogPortalContainer}
                                    apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                    presetOptions={BAILIAN_IMAGE_MODEL_OPTIONS}
                                    loadRemote={false}
                                    onChange={(model) => patchSelected({ model })}
                                    placeholder="qwen-image-2.0-pro"
                                  />
                                </Field>
                              </div>

                              <p className="text-[11px] leading-5 text-muted-foreground">
                                默认使用北京地域。新工作空间可填写专属域名；新加坡地域请使用对应地址与 API Key。
                              </p>
                              <AdvancedSettings>
                                <Field label="生成接口路径">
                                  <Input
                                    value={selected.generationEndpoint}
                                    disabled={disableEditing}
                                    onChange={(event) => patchSelected({ generationEndpoint: event.target.value })}
                                  />
                                </Field>
                              </AdvancedSettings>
                            </>
                          ) : selected.type === "ark" ? (
                            <>
                              <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                <Field label="服务地址">
                                  <Input
                                    value={selected.baseUrl}
                                    disabled={disableEditing}
                                    onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                    placeholder="https://ark.cn-beijing.volces.com/api/v3"
                                  />
                                </Field>
                                <Field label="生成 / 编辑模型">
                                  <ProviderModelCombobox
                                    value={selected.model}
                                    disabled={disableEditing}
                                    provider={selected}
                                    portalContainer={dialogPortalContainer}
                                    apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                    presetOptions={ARK_IMAGE_MODEL_OPTIONS}
                                    loadRemote
                                    onChange={(model) => patchSelected({ model })}
                                    placeholder="doubao-seedream-5-0-pro-260628"
                                  />
                                </Field>
                              </div>

                              <p className="text-[11px] leading-5 text-muted-foreground">
                                使用火山方舟 API Key。打开模型列表会按当前服务地址实时拉取（如 doubao-seedream-5-0-pro-260628）；
                                5.0 pro 支持最多 10 张参考图与高精度编辑，其余 Seedream 模型支持最多 14 张参考图。
                              </p>
                              <AdvancedSettings>
                                <Field label="生成接口路径">
                                  <Input
                                    value={selected.generationEndpoint}
                                    disabled={disableEditing}
                                    onChange={(event) => patchSelected({ generationEndpoint: event.target.value })}
                                  />
                                </Field>
                              </AdvancedSettings>
                            </>
                          ) : (
                            <>
                              {selected.type === "openai-compatible" ? (
                                <>
                                  <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                    <Field label="服务地址">
                                      <Input
                                        value={selected.baseUrl}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                        placeholder="https://your-relay.example.com"
                                      />
                                    </Field>
                                    <Field label="图片模型">
                                      <ProviderModelCombobox
                                        value={selected.model}
                                        disabled={disableEditing}
                                        provider={selected}
                                        portalContainer={dialogPortalContainer}
                                        apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                        placeholder="选择图片模型"
                                        onChange={(model) => patchSelected({ model })}
                                      />
                                    </Field>
                                  </div>

                                  <AdvancedSettings>
                                    <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                    <Field label="接口模式">
                                      <Select
                                        value={selected.apiMode ?? "responses"}
                                        disabled={disableEditing}
                                        onValueChange={(value) => changeApiMode(value as ProviderApiMode)}
                                      >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="responses">Responses</SelectItem>
                                          <SelectItem value="images">Images</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </Field>
                                    <Field label="生成接口路径">
                                      <Input
                                        value={selected.generationEndpoint}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ generationEndpoint: event.target.value })}
                                      />
                                    </Field>
                                    </div>
                                    {(selected.apiMode ?? "responses") === "images" ? (
                                      <>
                                      <Field label="编辑接口路径">
                                      <Input
                                        value={selected.referenceEndpoint || ""}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ referenceEndpoint: event.target.value })}
                                      />
                                      </Field>
                                      <label className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5">
                                        <span className="text-xs text-muted-foreground">发送兼容格式 response_format=b64_json</span>
                                        <Switch
                                          checked={selected.compatResponseFormat === "b64_json"}
                                          disabled={disableEditing}
                                          onCheckedChange={(checked) =>
                                            patchSelected({ compatResponseFormat: checked ? "b64_json" : undefined })
                                          }
                                        />
                                      </label>
                                      </>
                                    ) : null}
                                  </AdvancedSettings>
                                </>
                              ) : (
                                <>
                                  <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                    <Field label="服务地址">
                                      <Input
                                        value={selected.baseUrl}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                      />
                                    </Field>
                                    <Field label="图片模型">
                                      <Input
                                        value={selected.model}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ model: event.target.value })}
                                      />
                                    </Field>
                                  </div>
                                  <AdvancedSettings>
                                    <Field label="生成接口路径">
                                      <Input
                                        value={selected.generationEndpoint}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ generationEndpoint: event.target.value })}
                                      />
                                    </Field>
                                  </AdvancedSettings>
                                </>
                              )}

                              {selected.type === "openrouter" ? (
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  参考图通过 OpenRouter Images API 的 input_references 字段发送，实际支持数量由所选模型决定。
                                </p>
                              ) : null}
                              {selected.type === "poe" ? (
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  Poe 当前按官方 Images API 接入；默认模型为 nano-banana-2，暂不启用参考图输入。
                                </p>
                              ) : null}
                            </>
                          )}
                        </FormSection>

                        <FormSection title="可用模型">
                          <ProviderModelsEditor
                            provider={selected}
                            disabled={disableEditing}
                            portalContainer={dialogPortalContainer}
                            apiKeyOverride={keyDrafts[selected.id]?.trim()}
                            onChange={(model, models) => patchSelected({ model, models })}
                          />
                        </FormSection>

                        <FormSection title="访问密钥">
                          <Field label="API Key">
                            <ApiKeyInput
                              value={keyDrafts[selected.id] ?? ""}
                              disabled={disableEditing}
                              placeholder={providerKeyStatus[selected.id] ? "已安全保存，输入可覆盖" : apiKeyPlaceholder(selected.type)}
                              onValueChange={(value) => {
                                setKeyDrafts((current) => ({ ...current, [selected.id]: value }));
                                setTestResult(null);
                              }}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">密钥仅保存在本机，不会上传或随项目同步。</p>
                          </Field>
                        </FormSection>
                      </>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
                  <TestStatus
                    bridgeError={bridgeError}
                    testing={testing}
                    result={testResult}
                    hasKey={selectedHasKey}
                    credential={selected.type === "codex-oauth" ? "account" : "key"}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleTest()}
                      disabled={disableEditing || testing || saving}
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : selected.type === "codex-oauth" ? "检查状态" : "测试连接"}
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={disableEditing || saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                    </Button>
                  </div>
                </div>
                </>
                )}
              </>
            ) : (
              <>
                <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>
                <DialogDescription className="sr-only">{t("settings.categories")}</DialogDescription>
                <ScrollArea className="min-h-0 flex-1">
                  <div className={cn(
                    "flex w-full flex-col",
                    section === "pi-agent" ? "min-h-full" : "gap-8 px-6 py-7"
                  )}>
                  {section === "pi-agent" ? (
                  <PiAgentSettingsPanel
                    available={boardAssistantAgentModeAvailable}
                    enabled={boardAssistantAgentModeEnabled}
                    model={boardAssistantAgentModeModel}
                    inventory={piAgentResources}
                    resourceError={piAgentResourceError}
                    assistantSkills={assistantSkills}
                    builtinTools={piAgentBuiltinTools}
                    iterlayTools={piAgentIterlayTools}
                    skillPaths={piAgentSkillPaths}
                    extensionPaths={piAgentExtensionPaths}
                    customSkillPaths={piAgentCustomSkillPaths}
                    customExtensionPaths={piAgentCustomExtensionPaths}
                    maxTurns={piAgentMaxTurns}
                    webSearchMaxResults={piAgentWebSearchMaxResults}
                    onEnabledChange={onBoardAssistantAgentModeEnabledChange}
                    onBuiltinToolsChange={onPiAgentBuiltinToolsChange}
                    onIterlayToolsChange={onPiAgentIterlayToolsChange}
                    onSkillPathsChange={onPiAgentSkillPathsChange}
                    onExtensionPathsChange={onPiAgentExtensionPathsChange}
                    onCustomSkillPathsChange={onPiAgentCustomSkillPathsChange}
                    onCustomExtensionPathsChange={onPiAgentCustomExtensionPathsChange}
                    onMaxTurnsChange={onPiAgentMaxTurnsChange}
                    onWebSearchMaxResultsChange={onPiAgentWebSearchMaxResultsChange}
                    onRefresh={() => void getImageWorkbenchApi().getPiAgentResources()
                      .then(setPiAgentResources)
                      .catch((error) => setPiAgentResourceError(getWorkbenchErrorMessage(error, "无法刷新资源。")))}
                    onEditAssistantSkill={(id) => void openAssistantSkillEditor(id)}
                  />
                  ) : section === "agent" ? (
                  <McpIntegrationPanel
                    clients={mcpClients}
                    action={mcpAction}
                    step={mcpStep}
                    error={mcpError}
                    pluginPackageAction={pluginPackageAction}
                    pluginPackagePaths={pluginPackagePaths}
                    pluginPackageError={pluginPackageError}
                    disabled={Boolean(bridgeError)}
                    codexExamplesOpen={codexExamplesOpen}
                    onCodexExamplesOpenChange={setCodexExamplesOpen}
                    onSetup={setupMcpClient}
                    onRemove={removeMcpIntegration}
                    onExportPluginPackage={exportMcpPluginPackage}
                    onOpenPluginPackage={(targetPath) => void getImageWorkbenchApi().openDownloadedPath(targetPath)}
                  />
                  ) : section === "system" ? (
                  <>
                  <SettingsGroup title={t("settings.appearance")}>
                    <SettingRow
                      title={t("settings.language.title")}
                      description={<span className="block min-h-10">{t("settings.language.description")}</span>}
                      control={
                        <div className="grid w-[348px] shrink-0 grid-cols-3 rounded-lg bg-muted/80 p-1" role="radiogroup" aria-label={t("settings.language.groupLabel")}>
                          {LANGUAGE_OPTIONS.map((option) => {
                            const active = language === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => onLanguageChange(option.value)}
                                className={cn(
                                  "relative isolate flex h-8 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                                )}
                              >
                                {active ? <SegmentedControlIndicator layoutId={`settings-language-${segmentedControlId}`} className="rounded-md bg-card shadow-sm ring-1 ring-foreground/20" /> : null}
                                <span className="relative z-10 inline-flex items-center gap-1.5">
                                  {option.value === "system" ? <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                                  <span>{t(option.label)}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      }
                    />
                    <SettingRow
                      title={t("settings.theme.title")}
                      description={t("settings.theme.description")}
                      control={
                        <div className="flex shrink-0 rounded-lg bg-muted/80 p-1" role="radiogroup" aria-label={t("settings.theme.groupLabel")}>
                          {THEME_OPTIONS.map((option) => {
                            const active = theme === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={(event) => onThemeChange(option.value, { x: event.clientX, y: event.clientY })}
                                className={cn(
                                  "relative isolate flex h-8 items-center rounded-md px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                                )}
                              >
                                {active ? <SegmentedControlIndicator layoutId={`settings-theme-${segmentedControlId}`} className="rounded-md bg-card shadow-sm ring-1 ring-foreground/20" /> : null}
                                <span className="relative z-10 inline-flex items-center gap-1.5">
                                  <option.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                  <span>{t(option.label)}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      }
                    />
                    <SettingRow
                      title={t("settings.assistantWidth.title")}
                      description={t("settings.assistantWidth.description")}
                      control={
                        <select
                          aria-label={t("settings.assistantWidth.title")}
                          value={assistantWidth}
                          onChange={(event) => setAssistantWidth(event.target.value as AssistantWidth)}
                          className="h-9 rounded-md border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {(Object.keys(ASSISTANT_WIDTHS) as AssistantWidth[]).map((size) => (
                            <option key={size} value={size}>{t(`settings.assistantWidth.${size}`)} · {ASSISTANT_WIDTHS[size]}px</option>
                          ))}
                        </select>
                      }
                    />
                    <SettingRow title={t("settings.appIcon.title")} description={t("settings.appIcon.description")}>
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/75 p-1" role="radiogroup" aria-label={t("settings.appIcon.groupLabel")}>
                        <AppIconChoice
                          title={t("settings.appIcon.brand")}
                          description={t("settings.appIcon.default")}
                          source={appIconDefault}
                          chosen={appIcon === "default"}
                          pending={pendingAppIcon === "default"}
                          disabled={Boolean(bridgeError) || Boolean(pendingAppIcon) || Boolean(appIconAction)}
                          onSelect={() => void changeAppIcon("default")}
                        />
                        <AppIconChoice
                          title={t("settings.appIcon.companion")}
                          description={t("settings.appIcon.customizable")}
                          source={appIcon.startsWith("custom:")
                            ? customAppIcons.find((icon) => `custom:${icon.id}` === appIcon)?.dataUrl ?? appIconMascot
                            : appIconMascot}
                          chosen={appIcon !== "default"}
                          pending={pendingAppIcon !== null && pendingAppIcon !== "default"}
                          disabled={Boolean(bridgeError) || Boolean(pendingAppIcon) || Boolean(appIconAction)}
                          onSelect={() => void changeAppIcon(
                            appIcon.startsWith("custom:") ? appIcon : "mascot"
                          )}
                          onManage={() => {
                            setAppIconError(null);
                            setAppIconPickerOpen(true);
                          }}
                        />
                      </div>
                      {appIconError ? <p className="text-xs text-destructive">{appIconError}</p> : null}
                    </SettingRow>
                  </SettingsGroup>

                  <SettingsGroup title={t("settings.storage")}>
                    <SettingRow title={t("settings.downloadDirectory.title")} description={t("settings.downloadDirectory.description")}>
                      <div className="flex gap-2">
                        <Input
                          className="min-w-0 flex-1"
                          value={directoryDraft}
                          disabled={Boolean(bridgeError) || savingDirectory}
                          placeholder={t("settings.downloadDirectory.placeholder")}
                          aria-label={t("settings.downloadDirectory.title")}
                          onChange={(event) => {
                            setDirectoryDraft(event.target.value);
                            setDirectoryError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void applyDirectory();
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={Boolean(bridgeError) || savingDirectory}
                          aria-label="选择下载目录"
                          title="选择下载目录"
                          className="shrink-0"
                          onClick={() => void chooseDirectory()}
                        >
                          {savingDirectory ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={Boolean(bridgeError) || savingDirectory || !directoryDraft.trim()}
                          className="shrink-0 whitespace-nowrap px-3"
                          onClick={() => void applyDirectory()}
                        >
                          应用
                        </Button>
                      </div>
                      {directoryError ? <p className="text-xs text-destructive">{directoryError}</p> : null}
                    </SettingRow>
                    <SettingRow
                      title={t("settings.clearCache.title")}
                      description={t("settings.clearCache.description")}
                      control={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={Boolean(bridgeError) || clearingCache}
                          className="shrink-0"
                          onClick={() => void clearAppCache()}
                        >
                          {clearingCache ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          {clearingCache ? t("settings.clearCache.pending") : t("settings.clearCache.action")}
                        </Button>
                      }
                    >
                      {cacheClearResult ? (
                        <p className={cn("text-xs", cacheClearResult.ok ? "text-muted-foreground" : "text-destructive")}>
                          {cacheClearResult.message}
                        </p>
                      ) : null}
                    </SettingRow>
                  </SettingsGroup>

                  <SettingsGroup title="在线分享">
                    <SettingRow
                      interactive
                      title="快速分享图片"
                      description="允许通过 Manager 建立公网连接并生成图片二维码。分享会持续到手动关闭、到期或退出 APP。"
                      control={
                        <Switch
                          checked={onlineImageSharingEnabled}
                          onCheckedChange={onOnlineImageSharingEnabledChange}
                        />
                      }
                    />
                  </SettingsGroup>

                  <SettingsGroup title="通知">
                    <SettingRow
                      title="系统通知"
                      description="图片生成或编辑完成后发送桌面提醒。"
                      control={
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={Boolean(bridgeError) || notificationTesting}
                            onClick={() => void testSystemNotification()}
                          >
                            {notificationTesting
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <BellRing className="h-4 w-4" />}
                            测试通知
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={Boolean(bridgeError)}
                            onClick={() => void openNotificationSettings()}
                          >
                            系统设置
                          </Button>
                        </div>
                      }
                    >
                      {notificationTestResult ? (
                        <p className={cn(
                          "text-xs leading-5",
                          notificationTestResult.ok ? "text-muted-foreground" : "text-destructive"
                        )}>
                          {notificationTestResult.message}
                        </p>
                      ) : null}
                    </SettingRow>
                  </SettingsGroup>

                  <SettingsGroup title="更新">
                    <SettingRow
                      interactive
                      title="参与开发者计划（Beta）"
                      description="抢先接收 Beta 测试版更新推送。Beta 版本可能不稳定，可随时退出，退出后会在下一个正式版发布时回到稳定通道。"
                      control={
                        <Switch
                          checked={updateCenter.state?.channel === "beta"}
                          disabled={Boolean(bridgeError) || !updateCenter.state}
                          onCheckedChange={(next) => void updateCenter.setChannel(next ? "beta" : "stable")}
                        />
                      }
                    />
                  </SettingsGroup>
                  </>
                  ) : section === "ai" ? (
                  <>
                  <SettingsGroup title="画板 AI">
                    <SettingRow
                      interactive
                      title="AI 助手"
                      description="在画板输入区显示 AI 助手入口，并启用对应快捷键。"
                      control={<Switch checked={boardAssistantEnabled} onCheckedChange={onBoardAssistantEnabledChange} />}
                    />
                    <SettingRow
                      interactive
                      disabled={!boardAssistantEnabled}
                      title="AI 感知"
                      description="添加引用或输入文字后，自动识别上下文、解析意图并给出建议。"
                      control={
                        <Switch
                          checked={boardAssistantAwarenessEnabled}
                          disabled={!boardAssistantEnabled}
                          onCheckedChange={onBoardAssistantAwarenessEnabledChange}
                        />
                      }
                    />
                    <SettingRow
                      interactive
                      disabled={!boardAssistantEnabled}
                      title="后续问题推荐"
                      description="在助手对话底部显示可继续追问的推荐问题。"
                      control={
                        <Switch
                          checked={boardAssistantIntentSuggestionsEnabled}
                          disabled={!boardAssistantEnabled}
                          onCheckedChange={onBoardAssistantIntentSuggestionsEnabledChange}
                        />
                      }
                    />
                    <SettingRow
                      disabled={!boardAssistantEnabled || !boardAssistantIntentSuggestionsEnabled}
                      title="推荐问题数量"
                      description="控制每次显示的后续问题数量。"
                    >
                      <ChoiceGrid
                        columns={3}
                        disabled={!boardAssistantEnabled || !boardAssistantIntentSuggestionsEnabled}
                        ariaLabel="推荐问题数量"
                        value={String(boardAssistantIntentSuggestionCount) as "3" | "4" | "5"}
                        onChange={(value) => {
                          onBoardAssistantIntentSuggestionCountChange(
                            Number(value) as AssistantIntentSuggestionCount
                          );
                        }}
                        options={[
                          { value: "3", title: "3 条", description: "默认" },
                          { value: "4", title: "4 条" },
                          { value: "5", title: "5 条", description: "最多" }
                        ]}
                      />
                    </SettingRow>
                  </SettingsGroup>

                  <SettingsGroup title="编辑 AI">
                    <SettingRow
                      interactive
                      disabled={!editSmartSuggestionsAvailable}
                      title="AI 编辑建议"
                      description={
                        editSmartSuggestionsAvailable
                          ? "进入图片编辑时自动生成修改建议。"
                          : "需要先在 AI 模型中配置支持图片理解的助手模型。"
                      }
                      control={
                        <Switch
                          checked={editSmartSuggestionsEnabled}
                          disabled={!editSmartSuggestionsAvailable}
                          onCheckedChange={onEditSmartSuggestionsEnabledChange}
                        />
                      }
                    />
                  </SettingsGroup>

                  <SettingsGroup title="AI 助手记忆">
                    <SettingRow
                      interactive
                      title="使用记忆"
                      description="记录近期提示词、创作操作和评论，在调用助手时作为可选参考。内容保存在本机。"
                      control={<Switch checked={memoryEnabled} onCheckedChange={onMemoryEnabledChange} />}
                    />
                    <SettingRow
                      disabled={!memoryEnabled}
                      title="使用程度"
                      description="控制助手参考历史的范围和数量；当前指令始终优先。"
                    >
                      <ChoiceGrid
                        columns={3}
                        disabled={!memoryEnabled}
                        ariaLabel="记忆使用程度"
                        value={memoryUsageLevel}
                        onChange={onMemoryUsageLevelChange}
                        options={[
                          { value: "cautious", title: "谨慎", description: "当前画板 · 近 7 天" },
                          { value: "balanced", title: "平衡", description: "相关场景 · 近 90 天" },
                          { value: "active", title: "积极", description: "更广范围 · 近 1 年" }
                        ]}
                      />
                    </SettingRow>
                    <SettingRow
                      title="本地记忆"
                      description={
                        memoryStats
                          ? `${memoryStats.activeMemoryCount} 条有效记忆 · ${memoryStats.eventCount} 条来源记录${memoryStats.lastOrganizedAt ? ` · 最近整理 ${new Date(memoryStats.lastOrganizedAt).toLocaleDateString()}` : ""}`
                          : "正在读取记忆状态…"
                      }
                      control={
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={clearingMemory}
                            onClick={() => setMemoryManagerOpen(true)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            查看
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={clearingMemory || !memoryStats || memoryStats.eventCount === 0}
                            onClick={() => void clearAssistantMemory()}
                          >
                            {clearingMemory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            清除
                          </Button>
                        </div>
                      }
                    />
                  </SettingsGroup>
                  </>
                  ) : (
                  <>
                  <SettingsGroup title="生成与输入">
                    <SettingRow title="生成按钮样式" description="选择画板底部主生成按钮的视觉效果。">
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/75 p-1 sm:grid-cols-4" role="radiogroup" aria-label="生成按钮样式">
                        {(
                          [
                            { value: "folded", title: "折角粒子" },
                            { value: "glow", title: "光环星芒" },
                            { value: "prismatic", title: "幻彩流光" },
                            { value: "send", title: "飞行发送" }
                          ] as Array<{ value: GenerateButtonStyle; title: string }>
                        ).map((option) => (
                          <div
                            key={option.value}
                            className={cn(
                              "flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-md px-2 py-3 transition-colors duration-150",
                              generateButtonStyle === option.value
                                ? SETTINGS_OPTION_SELECTED_CLASS
                                : "text-muted-foreground hover:bg-background/55 hover:text-foreground"
                            )}
                            onClick={() => onGenerateButtonStyleChange(option.value)}
                          >
                            <GenerateActionButton
                              buttonStyle={option.value}
                              role="radio"
                              aria-checked={generateButtonStyle === option.value}
                              aria-label={`选择${option.title}样式`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onGenerateButtonStyleChange(option.value);
                              }}
                            >
                              生成
                            </GenerateActionButton>
                            <span className={cn(
                              "text-xs font-medium",
                              generateButtonStyle === option.value ? "text-foreground" : "text-muted-foreground"
                            )}>{option.title}</span>
                          </div>
                        ))}
                      </div>
                    </SettingRow>
                    <SettingRow
                      interactive
                      title="输入框锚点展开收起"
                      description="开启后，底部输入框失去焦点时收窄，聚焦时平滑展开；关闭则始终保持宽模式。"
                      control={<Switch checked={promptDockAutoCollapse} onCheckedChange={onPromptDockAutoCollapseChange} />}
                    />
                    <SettingRow
                      interactive
                      title="高级视频模式"
                      description="开启后显示视频改编和继续生成入口；关闭时仅保留新建视频。"
                      control={<Switch checked={advancedVideoModesEnabled} onCheckedChange={onAdvancedVideoModesEnabledChange} />}
                    />
                    <SettingRow
                      interactive
                      title="常用场景快捷建议"
                      description="在输入框上方显示常用场景建议；关闭后隐藏整条建议栏。"
                      control={<Switch checked={boardSmartSuggestionsEnabled} onCheckedChange={onBoardSmartSuggestionsEnabledChange} />}
                    />
                  </SettingsGroup>

                  <SettingsGroup title="图片操作">
                    <SettingRow
                      title="复制图片格式"
                      description="设置“复制原图”和对应快捷键写入系统剪贴板的格式。"
                    >
                      <ChoiceGrid
                        columns={2}
                        ariaLabel="复制图片格式"
                        value={copyImageFormat}
                        onChange={onCopyImageFormatChange}
                        options={[
                          { value: "png", title: "PNG", description: "高清静态图，保留完整色彩" },
                          { value: "gif", title: "GIF", description: "保留动图；静态图转为单帧 GIF" }
                        ]}
                      />
                    </SettingRow>
                    <SettingRow
                      interactive
                      title="微信表情导出"
                      description="实验性功能。开启后，图片菜单和多选工具栏会显示微信表情导出入口。"
                      control={
                        <Switch
                          checked={wechatStickerExportEnabled}
                          onCheckedChange={onWechatStickerExportEnabledChange}
                        />
                      }
                    />
                    <SettingRow
                      interactive
                      title="悬停图片时显示工具栏"
                      description="开启后，将鼠标移到图片上即可显示操作工具栏；关闭时需先点击选中图片。"
                      control={
                        <Switch
                          checked={canvasImageToolbarOnHover}
                          onCheckedChange={onCanvasImageToolbarOnHoverChange}
                        />
                      }
                    />
                    <SettingRow title="双击画板图片" description="设置在画板中双击图片时触发的快捷操作。">
                      <ChoiceGrid
                        columns={3}
                        ariaLabel="双击画板图片"
                        value={imageDoubleClickAction}
                        onChange={onImageDoubleClickActionChange}
                        options={[
                          { value: "edit", title: "进入编辑", description: "打开编辑模式" },
                          { value: "reference", title: "添加到引用", description: "加入输入框参考图" },
                          { value: "focus", title: "聚焦图片", description: "居中并放大（默认）" }
                        ]}
                      />
                    </SettingRow>
                    <SettingRow title="编辑态查看图片信息" description="编辑模式下点击图片，用哪种方式展示它的提示词与引用图。">
                      <ChoiceGrid
                        columns={2}
                        ariaLabel="编辑态查看图片信息"
                        value={editInfoMode}
                        onChange={onEditInfoModeChange}
                        options={[
                          { value: "flip", title: "图片翻转", description: "点击图片翻到背面看提示词" },
                          { value: "panel", title: "右侧面板", description: "右侧滑出，打字机展示提示词" }
                        ]}
                      />
                    </SettingRow>
                  </SettingsGroup>

                  <SettingsGroup title="画布显示与性能">
                    <SettingRow
                      interactive
                      title={t("settings.canvasRelationshipHoverHighlight.title")}
                      description={t("settings.canvasRelationshipHoverHighlight.description")}
                      control={<Switch checked={canvasRelationshipHoverHighlight} onCheckedChange={onCanvasRelationshipHoverHighlightChange} />}
                    />
                    <SettingRow
                      interactive
                      title="显示画布小地图"
                      description="在画布左下角显示全局缩略图；小地图可通过顶部抓手移动位置。"
                      control={<Switch checked={canvasMinimapVisible} onCheckedChange={onCanvasMinimapVisibleChange} />}
                    />
                    <SettingRow
                      interactive
                      title="缩小画板时使用缩略图"
                      description="性能优化。开启后，低倍率画板使用较小预览图以降低显存占用；关闭时始终显示原图。"
                      control={<Switch checked={canvasThumbnailPreview} onCheckedChange={onCanvasThumbnailPreviewChange} />}
                    />
                  </SettingsGroup>

                  <SettingsGroup title="版本管理">
                    <SettingRow title="版本分离方式" description="设置从版本栈分离单个版本或全部版本时，是否保留原版本栈。">
                      <ChoiceGrid
                        columns={2}
                        ariaLabel="版本分离方式"
                        value={versionSeparationMode}
                        onChange={onVersionSeparationModeChange}
                        options={[
                          { value: "copy", title: "复制分离", description: "保留原版本栈（默认）" },
                          { value: "extract", title: "直接分离", description: "从原版本栈移出" }
                        ]}
                      />
                    </SettingRow>
                  </SettingsGroup>
                  </>
                  )}
                  </div>
                </ScrollArea>
              </>
            )}
          </section>
        </div>
      </DialogContent>
      <Dialog
        open={Boolean(assistantSkillEditor)}
        onOpenChange={(next) => {
          if (!next && !assistantSkillBusy) {
            setAssistantSkillEditor(null);
            setAssistantSkillError(null);
          }
        }}
      >
        <DialogContent className="flex h-[min(760px,90vh)] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>{assistantSkillEditor?.id ?? "助手 Skill"}</DialogTitle>
            <DialogDescription>
              保存后创建用户覆盖副本，只影响新会话。name 必须保持不变。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-5">
            <Textarea
              value={assistantSkillDraft}
              disabled={assistantSkillBusy}
              spellCheck={false}
              onChange={(event) => setAssistantSkillDraft(event.target.value)}
              className="h-full min-h-[420px] resize-none font-mono text-xs leading-5"
              aria-label="编辑助手 Skill"
            />
          </div>
          {assistantSkillError ? <p className="px-5 text-xs text-destructive">{assistantSkillError}</p> : null}
          <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={assistantSkillBusy || !assistantSkillEditor?.hasOverride}
              onClick={() => void resetAssistantSkill()}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置为内置版本
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={assistantSkillBusy}
                onClick={() => setAssistantSkillEditor(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={assistantSkillBusy || !assistantSkillDraft.trim()}
                onClick={() => void saveAssistantSkill()}
              >
                {assistantSkillBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                保存覆盖
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {memoryManagerOpen ? (
        <MemoryManagerDialog
          open
          onOpenChange={setMemoryManagerOpen}
          onStatsChange={setMemoryStats}
        />
      ) : null}
      {appIconPickerOpen ? (
        <AppIconPickerDialog
          open
          appIcon={appIcon}
          customAppIcons={customAppIcons}
          busy={Boolean(pendingAppIcon) || Boolean(appIconAction)}
          error={appIconError}
          onOpenChange={setAppIconPickerOpen}
          onSelect={changeAppIcon}
          onUpload={uploadAppIcon}
          onDelete={deleteAppIcon}
        />
      ) : null}
    </Dialog>
  );
}

function AppIconChoice({
  title,
  description,
  source,
  chosen,
  pending,
  disabled,
  onSelect,
  onManage
}: {
  title: string;
  description: string;
  source: string;
  chosen: boolean;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
  onManage?: () => void;
}): React.ReactElement {
  return (
    <div className={cn(
      "relative min-w-0 rounded-md transition-colors duration-150",
      chosen ? SETTINGS_OPTION_SELECTED_CLASS : "text-muted-foreground hover:bg-background/55 hover:text-foreground"
    )}>
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-md p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          onManage && "pr-[76px]"
        )}
      >
        <img src={source} alt="" aria-hidden className="h-11 w-11 shrink-0 rounded-lg object-cover" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {pending ? "正在切换…" : chosen ? "当前使用" : description}
          </span>
        </span>
      </button>
      {pending ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <>
          {chosen ? (
            <span className={cn(
              "absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-foreground",
              onManage ? "right-10" : "right-2"
            )} aria-hidden>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          ) : null}
          {onManage ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onManage}
              aria-label="管理伙伴头像"
              title="管理伙伴头像"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("无法读取头像图片。"));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取头像图片。"));
    reader.readAsDataURL(file);
  });
}

function TextProviderSetupWizard({
  step,
  provider,
  status,
  action,
  error,
  testing,
  saving,
  testResult,
  hasSavedKey,
  keyDraft,
  portalContainer,
  onChoose,
  onPatch,
  onKeyChange,
  onBack,
  onNext,
  onSignIn,
  onTest,
  onSave,
  onCancel
}: {
  step: 1 | 2 | 3 | 4;
  provider: TextProviderConfig;
  status: CodexAuthStatus;
  action: "sign-in" | "refresh" | "sign-out" | null;
  error: string | null;
  testing: boolean;
  saving: boolean;
  testResult: TestState;
  hasSavedKey: boolean;
  keyDraft: string;
  portalContainer: HTMLDivElement | null;
  onChoose: (type: "codex-oauth" | "openai-compatible") => void;
  onPatch: (partial: Partial<TextProviderConfig>) => void;
  onKeyChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSignIn: () => void;
  onTest: () => void;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const connected = status.state === "connected" || status.state === "refreshing";
  const codex = provider.type === "codex-oauth";
  const configured = codex
    ? connected
    : Boolean(provider.name.trim() && provider.baseUrl.trim() && (hasSavedKey || keyDraft.trim()));
  const ready = configured && Boolean(provider.model.trim());
  const steps = ["选择服务", codex ? "连接账号" : "接入配置", "确认模型", "验证"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-4 border-b border-border/70 px-6 pt-4" aria-label={`第 ${step} 步，共 4 步`}>
        {steps.map((label, index) => {
          const number = index + 1;
          return (
            <div
              key={`${number}-${label}`}
              className={cn(
                "border-b-2 px-2 pb-3 text-center text-[11px] font-medium",
                number <= step ? "border-foreground text-foreground" : "border-border text-muted-foreground"
              )}
            >
              {number} {label}
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="w-full">
          {step === 1 ? (
            <div>
              <h3 className="text-sm font-semibold text-foreground">选择连接方式</h3>
              <p className="mt-1 text-xs text-muted-foreground">文本模型用于提示词润色、场景协作与图片分析。</p>
              <div className="mt-5 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                <SetupChoice
                  icon={UserRound}
                  title="Codex / ChatGPT 账号"
                  description="自动复用已连接的图片账号，无需二次授权。"
                  recommended
                  onClick={() => onChoose("codex-oauth")}
                />
                <SetupChoice
                  icon={KeyRound}
                  title="OpenAI Compatible"
                  description="使用 API Key、Base URL 与文本模型。"
                  onClick={() => onChoose("openai-compatible")}
                />
              </div>
            </div>
          ) : null}

          {step === 2 && codex ? (
            <CodexAccountPanel
              status={status}
              action={action}
              error={error}
              capabilityLabel="文本模型"
              capabilityValue={provider.model || "gpt-5.4-mini"}
              onSignIn={onSignIn}
            />
          ) : null}

          {step === 2 && !codex ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">填写接入信息</h3>
                <p className="mt-1 text-xs text-muted-foreground">配置保存在本机，API Key 使用系统安全存储。</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="名称">
                  <Input value={provider.name} onChange={(event) => onPatch({ name: event.target.value })} placeholder="例如：我的文本模型" />
                </Field>
                <Field label="Base URL">
                  <Input value={provider.baseUrl} onChange={(event) => onPatch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                </Field>
              </div>
              <Field label="API Key">
                <ApiKeyInput
                  value={keyDraft}
                  disabled={false}
                  placeholder={hasSavedKey ? "已安全保存，输入可覆盖" : "sk-..."}
                  onValueChange={onKeyChange}
                />
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">模型与能力</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {codex ? "选择当前账号可用的 Codex 文本模型。" : "选择支持视觉输入的模型可启用图片分析能力。"}
                </p>
              </div>
              {codex ? (
                <div className="space-y-4">
                  <Field label="文本模型">
                    <ProviderModelCombobox
                      value={provider.model}
                      disabled={!connected}
                      textProvider={provider}
                      portalContainer={portalContainer}
                      placeholder="选择文本模型"
                      onChange={(model) => onPatch({ model })}
                    />
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      可用模型由当前 ChatGPT 账号提供，打开菜单时自动刷新。
                    </p>
                  </Field>
                  <div className="divide-y divide-border rounded-lg border border-border bg-card">
                    <SummaryRow label="可用能力" value="提示词润色、场景协作、图片分析" />
                    <SummaryRow label="账号绑定" value={provider.authProviderId === provider.id ? "独立账号" : "与图片能力共用"} />
                  </div>
                </div>
              ) : (
                <Field label="文本模型">
                  <ProviderModelCombobox
                    value={provider.model}
                    disabled={false}
                    textProvider={provider}
                    portalContainer={portalContainer}
                    apiKeyOverride={keyDraft.trim()}
                    placeholder="选择文本模型"
                    onChange={(model) => onPatch({ model })}
                  />
                </Field>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">连接验证</h3>
                <p className="mt-1 text-xs text-muted-foreground">检查连接后保存，即可用于所有 AI 文本辅助。</p>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                <SummaryRow label="服务" value={provider.name || "未命名"} />
                <SummaryRow label="文本模型" value={provider.model || "未选择"} mono />
                <SummaryRow label="鉴权方式" value={codex ? "Codex / ChatGPT 账号" : "API Key"} />
              </div>
              {testResult ? (
                <p className={cn("text-xs", testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive")}>{testResult.message}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
        <span className="text-xs text-muted-foreground">第 {step} 步，共 4 步</span>
        <div className="flex items-center gap-2">
          {step === 1 ? <Button type="button" variant="ghost" onClick={onCancel}>取消</Button> : (
            <Button type="button" variant="outline" onClick={onBack} disabled={Boolean(action) || testing || saving}>
              <ArrowLeft className="h-4 w-4" /> 返回
            </Button>
          )}
          {step === 2 ? (
            <Button type="button" onClick={onNext} disabled={!configured || Boolean(action)}>
              继续 <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 3 ? (
            <Button type="button" onClick={onNext} disabled={!ready}>
              继续 <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 4 ? (
            <>
              <Button type="button" variant="outline" onClick={onTest} disabled={!ready || testing || saving}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "测试连接"}
              </Button>
              <Button type="button" onClick={onSave} disabled={!ready || testing || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存并使用"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProviderSetupWizard({
  step,
  provider,
  status,
  action,
  error,
  testing,
  saving,
  testResult,
  onChoose,
  onBack,
  onNext,
  onSignIn,
  onTest,
  onSave,
  onCancel
}: {
  step: 1 | 2 | 3 | 4;
  provider: ProviderConfig;
  status: CodexAuthStatus;
  action: "sign-in" | "refresh" | "sign-out" | null;
  error: string | null;
  testing: boolean;
  saving: boolean;
  testResult: TestState;
  onChoose: (type: "codex-oauth" | "openai-compatible" | "fal" | "openrouter" | "bailian" | "ark") => void;
  onBack: () => void;
  onNext: () => void;
  onSignIn: () => void;
  onTest: () => void;
  onSave: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const connected = status.state === "connected" || status.state === "refreshing";
  const steps = ["选择服务", "连接账号", "确认模型", "验证"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-4 border-b border-border/70 px-6 pt-4" aria-label={`第 ${step} 步，共 4 步`}>
        {steps.map((label, index) => {
          const number = index + 1;
          const active = number === step;
          const done = number < step;
          return (
            <div
              key={label}
              className={cn(
                "border-b-2 px-2 pb-3 text-center text-[11px] font-medium",
                active || done ? "border-foreground text-foreground" : "border-border text-muted-foreground"
              )}
            >
              {number} {label}
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="w-full">
          {step === 1 ? (
            <div>
              <h3 className="text-sm font-semibold text-foreground">选择连接方式</h3>
              <p className="mt-1 text-xs text-muted-foreground">选择你已有的账号或服务。</p>
              <div className="mt-5 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                <SetupChoice
                  icon={UserRound}
                  title="Codex / ChatGPT 账号"
                  description="浏览器登录，凭据保存在本机。"
                  recommended
                  onClick={() => onChoose("codex-oauth")}
                />
                <SetupChoice
                  icon={KeyRound}
                  title="OpenAI Compatible"
                  description="使用 API Key、Base URL 与模型。"
                  onClick={() => onChoose("openai-compatible")}
                />
                <SetupChoice
                  icon={Plug}
                  title="fal.ai"
                  description="连接 fal 队列与图片模型。"
                  onClick={() => onChoose("fal")}
                />
                <SetupChoice
                  icon={ShieldCheck}
                  title="OpenRouter"
                  description="使用 OpenRouter 图片接口。"
                  onClick={() => onChoose("openrouter")}
                />
                <SetupChoice
                  icon={ImageIcon}
                  title="Qwen Image"
                  description="通过阿里云百炼连接千问图片模型。"
                  onClick={() => onChoose("bailian")}
                />
                <SetupChoice
                  icon={Plug}
                  title="火山方舟 Seedream"
                  description="连接豆包 Seedream 图片模型（需 API Key）。"
                  onClick={() => onChoose("ark")}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <CodexAccountPanel
              status={status}
              action={action}
              error={error}
              onSignIn={onSignIn}
            />
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">模型与能力</h3>
                <p className="mt-1 text-xs text-muted-foreground">账号连接使用预设的 Codex 图片能力。</p>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                <SummaryRow label="图片模型" value={provider.model || "gpt-image-2"} mono />
                <SummaryRow label="同步文本模型" value="gpt-5.4-mini · 自动绑定" mono />
                <SummaryRow label="可用能力" value="文生图、参考图、图片编辑" />
                <SummaryRow label="连接方式" value="Codex Responses · 本机直连" />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">连接验证</h3>
                <p className="mt-1 text-xs text-muted-foreground">保存后即可在画板输入框切换使用。</p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                  connected
                    ? "bg-[hsl(var(--success-muted))] text-[hsl(var(--success))]"
                    : "bg-muted text-muted-foreground"
                )}>
                  {connected ? <CheckCircle2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{connected ? "账号已连接" : "账号尚未连接"}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{status.email || "Codex / ChatGPT"}</p>
                </div>
              </div>
              {testResult ? (
                <p className={cn("text-xs", testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive")}>
                  {testResult.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
        <span className="text-xs text-muted-foreground">第 {step} 步，共 4 步</span>
        <div className="flex items-center gap-2">
          {step === 1 ? (
            <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
          ) : (
            <Button type="button" variant="outline" onClick={onBack} disabled={Boolean(action) || testing || saving}>
              <ArrowLeft className="h-4 w-4" /> 返回
            </Button>
          )}
          {step === 2 ? (
            <Button type="button" onClick={onNext} disabled={!connected || Boolean(action)}>
              继续 <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 3 ? (
            <Button type="button" onClick={onNext}>
              继续 <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 4 ? (
            <>
              <Button type="button" variant="outline" onClick={onTest} disabled={!connected || testing || saving}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "检查状态"}
              </Button>
              <Button type="button" onClick={onSave} disabled={!connected || testing || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存并使用"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SetupChoice({
  icon: Icon,
  title,
  description,
  recommended = false,
  onClick
}: {
  icon: typeof Plug;
  title: string;
  description: string;
  recommended?: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-h-[108px] rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/35 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {title}
        {recommended ? <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">推荐</span> : null}
      </span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
    </button>
  );
}

function CodexAccountPanel({
  status,
  action,
  error,
  onSignIn,
  onRefresh,
  onSignOut,
  capabilityLabel = "图片模型",
  capabilityValue = "gpt-image-2"
}: {
  status: CodexAuthStatus;
  action: "sign-in" | "refresh" | "sign-out" | null;
  error: string | null;
  onSignIn: () => void;
  onRefresh?: () => void;
  onSignOut?: () => void;
  capabilityLabel?: string;
  capabilityValue?: string;
}): React.ReactElement {
  const connected = status.state === "connected" || status.state === "refreshing";
  const needsLogin = status.state === "signed-out" || status.state === "expired" || status.state === "reauth-required";
  const stateLabel = status.state === "authorizing"
    ? "等待浏览器授权"
    : status.state === "refreshing"
      ? "正在刷新登录状态"
      : status.state === "reauth-required"
        ? "需要重新登录"
        : status.state === "expired"
          ? "登录已过期"
          : connected
            ? "账号已连接"
            : "尚未连接账号";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Codex / ChatGPT 账号</h3>
        <p className="mt-1 text-xs text-muted-foreground">OAuth 凭据由操作系统安全存储保护。</p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
              connected ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
            )}>
              {action === "sign-in" || status.state === "authorizing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{status.email || stateLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {connected ? [status.planType, "本机直连"].filter(Boolean).join(" · ") : stateLabel}
              </p>
            </div>
          </div>
          {needsLogin ? (
            <Button type="button" onClick={onSignIn} disabled={Boolean(action)} className="shrink-0">
              {action === "sign-in" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {status.state === "reauth-required" || status.state === "expired" ? "重新登录" : "登录账号"}
            </Button>
          ) : null}
        </div>

        {connected ? (
          <div className="grid grid-cols-1 border-t border-border sm:grid-cols-3">
            <AccountFact label="状态" value={stateLabel} />
            <AccountFact label={capabilityLabel} value={capabilityValue} mono />
            <AccountFact label="凭据" value="系统安全存储" />
          </div>
        ) : null}
      </div>

      {connected && (onRefresh || onSignOut) ? (
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={Boolean(action)}>
              {action === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              刷新状态
            </Button>
          ) : null}
          {onSignOut ? (
            <Button type="button" variant="ghost" size="sm" onClick={onSignOut} disabled={Boolean(action)} className="text-muted-foreground hover:text-destructive">
              {action === "sign-out" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              退出账号
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs leading-5 text-destructive">{error}</p> : null}

      <div className="flex items-start gap-3 border-t border-border pt-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-5 text-muted-foreground">
          Access Token、Refresh Token 与账号标识只在 Electron 主进程中使用，不会写入普通设置文件。
        </p>
      </div>
    </div>
  );
}

function AccountFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  return (
    <div className="min-w-0 border-b border-border p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <span className={cn("mt-1 block truncate text-xs font-medium text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4 px-4 py-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("truncate font-medium text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function ProviderModelsEditor({
  provider,
  disabled,
  portalContainer,
  apiKeyOverride,
  onChange
}: {
  provider: ProviderConfig;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  apiKeyOverride?: string;
  onChange: (model: string, models: string[]) => void;
}): React.ReactElement {
  const models = getProviderModels(provider);

  function addModel(value: string): void {
    const model = value.trim();
    if (!model || models.includes(model)) return;
    onChange(provider.model || model, [...models, model]);
  }

  function removeModel(model: string): void {
    if (models.length <= 1) return;
    const remaining = models.filter((candidate) => candidate !== model);
    onChange(provider.model === model ? remaining[0] : provider.model, remaining);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-5 text-muted-foreground">
        添加此 Provider 可用的图片模型。默认模型会用于新任务，也会显示在模型选择器中。
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {models.map((model) => {
          const isDefault = model === provider.model;
          return (
            <div
              key={model}
              className="flex min-h-11 items-center gap-3 border-b border-border px-3 last:border-b-0"
            >
              <button
                type="button"
                disabled={disabled || isDefault}
                onClick={() => onChange(model, models)}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left disabled:cursor-default"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{model}</span>
                {isDefault ? (
                  <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    默认
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">设为默认</span>
                )}
              </button>
              <button
                type="button"
                disabled={disabled || models.length <= 1}
                onClick={() => removeModel(model)}
                aria-label={`删除模型 ${model}`}
                title={models.length <= 1 ? "至少保留一个模型" : "删除模型"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {provider.type === "fal" ? (
        <FalModelCombobox
          value=""
          category="text-to-image"
          disabled={disabled}
          portalContainer={portalContainer}
          providerId={provider.id}
          apiKeyOverride={apiKeyOverride}
          excludedValues={models}
          emptyMessage="没有更多可添加的模型"
          placeholder="选择或搜索模型"
          onChange={addModel}
        />
      ) : (
        <ProviderModelCombobox
          value=""
          disabled={disabled}
          provider={provider}
          portalContainer={portalContainer}
          apiKeyOverride={apiKeyOverride}
          presetOptions={
            provider.type === "bailian"
              ? BAILIAN_IMAGE_MODEL_OPTIONS
              : provider.type === "ark"
                ? ARK_IMAGE_MODEL_OPTIONS
                : EMPTY_MODEL_OPTIONS
          }
          loadRemote={provider.type !== "bailian"}
          excludedValues={models}
          emptyMessage="没有更多可添加的模型"
          placeholder="选择或搜索模型"
          onChange={addModel}
        />
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">
        打开列表会自动获取服务模型；搜索不到时，可直接使用输入的自定义模型 ID。
      </p>
    </div>
  );
}

export function videoProviderModels(provider: Pick<VideoProviderConfig, "model" | "models">): string[] {
  const seen = new Set<string>();
  return [provider.model, ...(provider.models ?? [])].flatMap((value) => {
    const model = value?.trim();
    if (!model || seen.has(model)) return [];
    seen.add(model);
    return [model];
  });
}

export function addVideoProviderModel(
  provider: Pick<VideoProviderConfig, "model" | "models">,
  value: string
): { model: string; models: string[] } {
  const models = videoProviderModels(provider);
  const candidate = value.trim();
  if (!candidate || models.includes(candidate)) return { model: provider.model, models };
  return { model: provider.model || candidate, models: [...models, candidate] };
}

export function removeVideoProviderModel(
  provider: Pick<VideoProviderConfig, "model" | "models">,
  value: string
): { model: string; models: string[] } {
  const models = videoProviderModels(provider);
  if (models.length <= 1 || !models.includes(value)) return { model: provider.model, models };
  const remaining = models.filter((model) => model !== value);
  return { model: provider.model === value ? remaining[0] : provider.model, models: remaining };
}

export function makeVideoProviderModelDefault(
  provider: Pick<VideoProviderConfig, "model" | "models">,
  value: string
): { model: string; models: string[] } {
  const models = videoProviderModels(provider);
  if (!models.includes(value)) return { model: provider.model, models };
  return { model: value, models: [value, ...models.filter((model) => model !== value)] };
}

function VideoProviderModelsEditor({
  provider,
  disabled,
  portalContainer,
  apiKeyOverride,
  onChange
}: {
  provider: VideoProviderConfig;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  apiKeyOverride?: string;
  onChange: (model: string, models: string[]) => void;
}): React.ReactElement {
  const models = videoProviderModels(provider);

  function addModel(value: string): void {
    const next = addVideoProviderModel(provider, value);
    if (next.models.length === models.length) return;
    onChange(next.model, next.models);
  }

  function removeModel(model: string): void {
    const next = removeVideoProviderModel(provider, model);
    if (next.models.length === models.length) return;
    onChange(next.model, next.models);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-5 text-muted-foreground">
        默认模型会用于新建视频节点。可在左侧模型列表上方添加模型。
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {models.map((model) => {
          const isDefault = model === provider.model;
          return (
            <div key={model} className="flex min-h-11 items-center gap-3 border-b border-border px-3 last:border-b-0">
              <button
                type="button"
                disabled={disabled || isDefault}
                onClick={() => {
                  const next = makeVideoProviderModelDefault(provider, model);
                  onChange(next.model, next.models);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left disabled:cursor-default"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{model}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{isDefault ? "默认" : "设为默认"}</span>
              </button>
              <button
                type="button"
                disabled={disabled || models.length <= 1}
                onClick={() => removeModel(model)}
                aria-label={`删除视频模型 ${model}`}
                title={models.length <= 1 ? "至少保留一个模型" : "删除模型"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VideoProviderModelAddControl({
  provider,
  disabled,
  portalContainer,
  apiKeyOverride,
  onChange
}: {
  provider: VideoProviderConfig;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  apiKeyOverride?: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const models = videoProviderModels(provider);
  const triggerClassName = "h-8 w-full min-w-0 border-black bg-black px-3 text-xs font-medium text-white shadow-none hover:border-black hover:bg-black/90 hover:text-white focus-visible:ring-foreground/30 disabled:border-black disabled:bg-black disabled:text-white [&_svg]:text-white";
  if (provider.type === "fal") {
    return (
      <FalModelCombobox
        value=""
        category={FAL_VIDEO_MODEL_CATEGORIES}
        disabled={disabled}
        portalContainer={portalContainer}
        providerId={provider.connectionProviderId || provider.id}
        apiKeyOverride={apiKeyOverride}
        excludedValues={models}
        emptyMessage="没有更多可添加的视频模型"
        placeholder="添加模型"
        triggerClassName={triggerClassName}
        onChange={onChange}
      />
    );
  }
  return (
    <ProviderModelCombobox
      value=""
      disabled={disabled}
      videoProvider={provider}
      portalContainer={portalContainer}
      apiKeyOverride={apiKeyOverride}
      loadRemote={provider.type === "openrouter" || provider.type === "minimax"}
      allowCustom={provider.type !== "minimax"}
      excludedValues={models}
      emptyMessage="没有更多可添加的视频模型"
      placeholder="添加模型"
      triggerClassName={triggerClassName}
      onChange={onChange}
    />
  );
}

function ProviderModelCombobox({
  value,
  disabled,
  provider,
  textProvider,
  videoProvider,
  portalContainer,
  apiKeyOverride,
  triggerClassName,
  allowCustom = true,
  presetOptions = EMPTY_MODEL_OPTIONS,
  excludedValues = EMPTY_MODEL_IDS,
  loadRemote = true,
  allowEmpty = false,
  emptyMessage = "服务未返回可用模型",
  placeholder,
  onChange
}: {
  value: string;
  disabled: boolean;
  /** 图片 Provider：走 provider:listModels。与 textProvider 二选一。 */
  provider?: ProviderConfig;
  /** 文本 Provider：走 textProvider:listModels。 */
  textProvider?: TextProviderConfig;
  /** 视频 Provider：走 videoProvider:listModels。 */
  videoProvider?: VideoProviderConfig;
  portalContainer: HTMLElement | null;
  apiKeyOverride?: string;
  triggerClassName?: string;
  allowCustom?: boolean;
  presetOptions?: ProviderModelOption[];
  excludedValues?: string[];
  loadRemote?: boolean;
  allowEmpty?: boolean;
  emptyMessage?: string;
  placeholder: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProviderModelOption[]>(presetOptions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (!loadRemote) {
      setOptions(presetOptions);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const api = getImageWorkbenchApi();
    const request = videoProvider
      ? api.listVideoProviderModels(videoProvider, apiKeyOverride)
      : textProvider
      ? api.listTextProviderModels(textProvider, apiKeyOverride)
      : provider
        ? api.listProviderModels(provider, apiKeyOverride)
        : Promise.resolve([]);
    void request
      .then((models) => {
        if (active) setOptions(mergeModelOptions(presetOptions, models));
      })
      .catch((reason) => {
        if (active) setError(getWorkbenchErrorMessage(reason, "无法加载服务模型。"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiKeyOverride, loadRemote, open, presetOptions, provider, textProvider, videoProvider, retryNonce]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = useMemo(() => {
    const available = options.filter((model) => !excludedValues.includes(model.id));
    const filtered = normalizedQuery
      ? available.filter(
          (model) =>
            model.id.toLocaleLowerCase().includes(normalizedQuery) ||
            model.ownedBy?.toLocaleLowerCase().includes(normalizedQuery)
        )
      : available;
    if (!value || normalizedQuery || filtered.some((model) => model.id === value)) return filtered;
    return [{ id: value, ownedBy: "当前配置" }, ...filtered];
  }, [excludedValues, normalizedQuery, options, value]);
  const customValue = query.trim();
  const exactMatch = options.some((model) => model.id.toLocaleLowerCase() === normalizedQuery);
  const canUseCustom = allowCustom && Boolean(customValue) && !exactMatch && !excludedValues.includes(customValue);

  function choose(next: string): void {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", triggerClassName)}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        align="start"
        sideOffset={6}
        collisionBoundary={portalContainer}
        collisionPadding={8}
        className="w-[max(var(--radix-popover-trigger-width),20rem)] max-w-[var(--radix-popover-content-available-width)] overflow-hidden rounded-lg p-0"
      >
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canUseCustom) {
                event.preventDefault();
                choose(customValue);
              }
            }}
            placeholder="搜索模型 ID 或提供商"
            className="pl-8 pr-8"
          />
          {loading ? (
            <Loader2 className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {error ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-destructive">
              <span className="min-w-0 flex-1 truncate" title={error}>{error}</span>
              <button
                type="button"
                title="重新加载"
                aria-label="重新加载服务模型"
                onClick={() => setRetryNonce((current) => current + 1)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {allowEmpty && !normalizedQuery ? (
            <button
              type="button"
              onClick={() => choose("")}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !value && "bg-accent/60"
              )}
            >
              <span className="min-w-0 flex-1">不指定（使用默认模型）</span>
              {!value ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </button>
          ) : null}

          {!error && visibleOptions.length === 0 && loading ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">正在加载模型…</p>
          ) : null}
          {!error && visibleOptions.length === 0 && !loading && !customValue ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">{emptyMessage}</p>
          ) : null}

          {!error
            ? visibleOptions.map((model) => {
                const selected = model.id === value;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => choose(model.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-accent/60"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-medium text-foreground">{model.id}</span>
                      {model.ownedBy ? (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{model.ownedBy}</span>
                      ) : null}
                    </span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            : null}

          {canUseCustom ? (
            <button
              type="button"
              onClick={() => choose(customValue)}
              className="flex w-full items-center gap-2 rounded-md border-t border-border px-2 py-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">使用自定义模型：{customValue}</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FalModelCombobox({
  value,
  category,
  disabled,
  portalContainer,
  providerId,
  apiKeyOverride,
  triggerClassName,
  excludedValues = EMPTY_MODEL_IDS,
  emptyMessage = "没有可用模型",
  placeholder,
  onChange
}: {
  value: string;
  category: FalModelCategory | readonly FalModelCategory[];
  disabled: boolean;
  portalContainer: HTMLElement | null;
  providerId: string;
  apiKeyOverride?: string;
  triggerClassName?: string;
  excludedValues?: string[];
  emptyMessage?: string;
  placeholder: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FalModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const categoryKey = typeof category === "string" ? category : category.join(",");
  const categories = useMemo(
    () => categoryKey.split(",") as FalModelCategory[],
    [categoryKey]
  );
  const primaryCategory = categories[0] ?? "text-to-image";

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(
      () => {
        void Promise.allSettled(
          categories.map((modelCategory) =>
            getImageWorkbenchApi().listFalModels(modelCategory, query.trim(), providerId, apiKeyOverride)
          )
        )
          .then((results) => {
            if (!active) return;
            const uniqueModels = new Map<string, FalModelOption>();
            for (const result of results) {
              if (result.status !== "fulfilled") continue;
              for (const model of result.value) {
                const existing = uniqueModels.get(model.endpointId);
                uniqueModels.set(model.endpointId, existing
                  ? { ...existing, price: existing.price ?? model.price }
                  : model);
              }
            }
            if (results.every((result) => result.status === "rejected")) {
              throw results[0].reason;
            }
            setOptions([...uniqueModels.values()]);
          })
          .catch((reason) => {
            if (active) setError(getWorkbenchErrorMessage(reason, "无法加载 fal.ai 模型。"));
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      query.trim() ? 250 : 0
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [apiKeyOverride, categories, open, providerId, query, retryNonce]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = useMemo(() => {
    const available = options.filter((model) => !excludedValues.includes(model.endpointId));
    const filtered = normalizedQuery
      ? available.filter(
          (model) =>
            model.endpointId.toLocaleLowerCase().includes(normalizedQuery) ||
            model.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
            model.description?.toLocaleLowerCase().includes(normalizedQuery)
        )
      : available;
    if (!value || filtered.some((model) => model.endpointId === value) || normalizedQuery) return filtered;
    return [
      { endpointId: value, displayName: "当前配置", category: primaryCategory } satisfies FalModelOption,
      ...filtered
    ];
  }, [excludedValues, normalizedQuery, options, primaryCategory, value]);
  const exactMatch = options.some((model) => model.endpointId.toLocaleLowerCase() === normalizedQuery);
  const customValue = query.trim();
  const canUseCustom = customValue.includes("/") && !exactMatch && !excludedValues.includes(customValue);

  function choose(next: string): void {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", triggerClassName)}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        align="start"
        sideOffset={6}
        collisionBoundary={portalContainer}
        collisionPadding={8}
        className="w-[max(var(--radix-popover-trigger-width),20rem)] max-w-[var(--radix-popover-content-available-width)] overflow-hidden rounded-lg p-0"
      >
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canUseCustom && visibleOptions.length === 0) {
                event.preventDefault();
                choose(customValue);
              }
            }}
            placeholder="搜索模型名称或 endpoint ID"
            className="pl-8 pr-8"
          />
          {loading ? (
            <Loader2 className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {error ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-destructive">
              <span className="min-w-0 flex-1 truncate" title={error}>{error}</span>
              <button
                type="button"
                title="重新加载"
                aria-label="重新加载 fal.ai 模型"
                onClick={() => setRetryNonce((value) => value + 1)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {!error && visibleOptions.length === 0 && loading ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">正在加载模型…</p>
          ) : null}
          {!error && visibleOptions.length === 0 && !loading && !customValue ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">{emptyMessage}</p>
          ) : null}

          {!error
            ? visibleOptions.map((model) => {
                const selected = model.endpointId === value;
                return (
                  <button
                    key={model.endpointId}
                    type="button"
                    title={model.description}
                    onClick={() => choose(model.endpointId)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-accent/60"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{model.displayName}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        {categories.length > 1 ? (
                          <span className="shrink-0 rounded border border-border px-1 py-px leading-4">
                            {model.category === "image-to-video" ? "图生视频" : "文生视频"}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate font-mono">{model.endpointId}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {model.price ? (
                        <span
                          className="whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground"
                          title="fal.ai 基础单价；实际费用可能随分辨率或输出量调整"
                        >
                          {formatFalPrice(model.price)}
                        </span>
                      ) : null}
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                    </span>
                  </button>
                );
              })
            : null}

          {!error && canUseCustom ? (
            <button
              type="button"
              onClick={() => choose(customValue)}
              className="flex w-full items-center gap-2 rounded-md border-t border-border px-2 py-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">使用自定义 endpoint：{customValue}</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatFalPrice(price: FalModelPrice): string {
  const currencySymbol = price.currency === "USD" ? "$" : price.currency === "EUR" ? "€" : price.currency === "CNY" ? "¥" : `${price.currency} `;
  const maximumFractionDigits = price.unitPrice < 0.001 ? 6 : price.unitPrice < 0.1 ? 4 : 2;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(price.unitPrice);
  const unit = price.unit === "image" ? "张" : price.unit === "second" ? "秒" : price.unit === "megapixel" ? "MP" : price.unit;
  return `${currencySymbol}${amount} / ${unit}`;
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: typeof Plug;
  label: string;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[820px]:justify-center max-[820px]:px-0",
        active
          ? "library-sidebar-active font-medium text-foreground"
          : "text-muted-foreground hover:bg-background/65 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="max-[820px]:sr-only">{label}</span>
    </button>
  );
}

function TestStatus({
  bridgeError,
  testing,
  result,
  hasKey,
  credential
}: {
  bridgeError: string | null;
  testing: boolean;
  result: TestState;
  hasKey: boolean;
  credential: "key" | "account" | "managed";
}): React.ReactElement {
  if (bridgeError) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <XCircle className="h-3.5 w-3.5" /> 桌面接口缺失
      </span>
    );
  }
  if (testing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 测试中…
      </span>
    );
  }
  if (result) {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs", result.ok ? "text-[hsl(var(--success))]" : "text-destructive")}>
        {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        <span className="max-w-[280px] truncate">{result.message}</span>
      </span>
    );
  }
  if (hasKey) {
    const label = credential === "managed" ? "服务已就绪" : credential === "account" ? "账号已连接" : "密钥已保存";
    const StatusIcon = credential === "key" ? ShieldCheck : CheckCircle2;
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {credential === "account"
        ? <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
        : <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
      {credential === "account" ? "需要登录" : "需要 API Key"}
    </span>
  );
}

 function SettingsGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }): React.ReactElement {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <h3 className="px-0.5 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border/80 overflow-hidden border-y border-border/80 bg-card">{children}</div>
    </section>
  );
}

/** 设置行范式：左侧标题+描述，右侧控件；大控件（选项网格等）作为 children 堆叠在下方。 */
function SettingRow({
  title,
  description,
  control,
  children,
  disabled,
  interactive,
  stackControlOnNarrow
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 右侧对齐的紧凑控件（Switch、分段选择等）。 */
  control?: ReactNode;
  /** 标题下方的堆叠内容（选项网格、输入组等）。 */
  children?: ReactNode;
  disabled?: boolean;
  /** 渲染为 label，让整行可点击切换 Switch。 */
  interactive?: boolean;
  /** 在窄屏下将操作控件移到文案下方；用于无法压缩的按钮组。 */
  stackControlOnNarrow?: boolean;
}): React.ReactElement {
  const Comp = interactive ? "label" : "div";
  return (
    <Comp
      className={cn(
        "flex flex-col gap-3.5 px-4 py-4 transition-colors duration-150",
        interactive && "cursor-pointer hover:bg-muted/35"
      )}
    >
      <div className={cn(
        "flex items-center justify-between gap-8",
        stackControlOnNarrow && "max-[520px]:flex-col max-[520px]:items-stretch max-[520px]:gap-3"
      )}>
        <span className={cn("flex min-w-0 flex-col gap-0.5", disabled && "opacity-60")}>
          <span className="text-[13px] font-medium leading-5 text-foreground">{title}</span>
          {description ? <span className="max-w-[64ch] text-xs leading-5 text-muted-foreground">{description}</span> : null}
        </span>
        {control ? (
          <span className={cn("flex shrink-0 items-center", stackControlOnNarrow && "max-[520px]:self-end")}>
            {control}
          </span>
        ) : null}
      </div>
      {children}
    </Comp>
  );
}

/** 互斥选项组：使用紧凑的分段选择，避免设置面板内重复嵌套卡片。 */
function ChoiceGrid<T extends string>({
  value,
  options,
  columns = 2,
  onChange,
  ariaLabel,
  disabled = false
}: {
  value: T;
  options: Array<{ value: T; title: string; description?: string }>;
  columns?: 2 | 3;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-lg bg-muted/75 p-1",
        columns === 3 ? "grid-cols-3" : "grid-cols-2"
      )}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative min-h-[58px] rounded-md px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? SETTINGS_OPTION_SELECTED_CLASS : "text-muted-foreground hover:bg-background/55 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground"
            )}
          >
            <span className="block pr-5 text-[13px] font-medium">{option.title}</span>
            {option.description ? (
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{option.description}</span>
            ) : null}
            {active ? (
              <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center text-foreground">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Provider 表单的分组标题容器。 */
function FormSection({ title, children }: { title: string; children: ReactNode }): React.ReactElement {
  return (
    <section className="flex flex-col gap-3.5 border-b border-border/80 pb-6 last:border-b-0 last:pb-0">
      <h3 className="text-[13px] font-semibold leading-5 text-foreground">{title}</h3>
      <div className="flex flex-col gap-4 [&_label]:text-xs [&_label]:font-medium [&_label]:text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function AdvancedSettings({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <details className="group border-t border-border/70 pt-2">
      <summary className="flex h-9 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>高级设置</span>
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="mt-3 flex flex-col gap-4 pb-1">{children}</div>
    </details>
  );
}

function TypeBadge({ label }: { label: string }): React.ReactElement {
  return (
    <span className="shrink-0 text-[11px] font-medium leading-4 text-muted-foreground">
      {label}
    </span>
  );
}

/** 密码态 API Key 输入，带显示/隐藏切换。 */
function ApiKeyInput({
  value,
  disabled,
  placeholder,
  onValueChange
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onValueChange: (value: string) => void;
}): React.ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        value={value}
        disabled={disabled}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="pr-10"
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={visible ? "隐藏 API Key" : "显示 API Key"}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function AiConfigurationOverview({
  imageOptions,
  activeImageId,
  textOptions,
  activeTextId,
  videoOptions,
  activeVideoId,
  savingKind,
  error,
  disabled,
  portalContainer,
  onSelectImage,
  onSelectText,
  onSelectVideo,
  onManageImage,
  onManageText,
  onManageVideo,
  onRepairImage,
  onRepairText,
  onRepairVideo
}: {
  imageOptions: AiRouteOption[];
  activeImageId: string;
  textOptions: AiRouteOption[];
  activeTextId: string;
  videoOptions: AiRouteOption[];
  activeVideoId: string;
  savingKind: AiRouteKind | null;
  error: string | null;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  onSelectImage: (providerId: string) => Promise<void>;
  onSelectText: (providerId: string) => Promise<void>;
  onSelectVideo: (providerId: string) => Promise<void>;
  onManageImage: () => void;
  onManageText: () => void;
  onManageVideo: () => void;
  onRepairImage: () => void;
  onRepairText: () => void;
  onRepairVideo: () => void;
}): React.ReactElement {
  const activeImage = imageOptions.find((option) => option.id === activeImageId) ?? imageOptions[0];
  const activeText = textOptions.find((option) => option.id === activeTextId) ?? textOptions[0];
  const activeVideo = videoOptions.find((option) => option.id === activeVideoId) ?? videoOptions[0];

  return (
    <>
      <DialogTitle className="sr-only">AI 模型</DialogTitle>
      <DialogDescription className="sr-only">选择各项功能使用的模型。</DialogDescription>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full flex-col px-6 py-7">
          <section>
            <div className="flex min-w-0 items-start justify-between gap-4 pr-10">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">默认模型</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Iterlay 会在对应功能中自动使用这些模型。</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2.5"
                onClick={onManageImage}
              >
                <Settings2 className="h-3.5 w-3.5" />
                管理模型
              </Button>
            </div>
            <div className="mt-6 flex flex-col gap-6">
              <AiRouteRow
                title="图片生成"
                description="生成、编辑和参考图"
                current={activeImage}
                options={imageOptions}
                saving={savingKind === "image"}
                disabled={disabled || Boolean(savingKind)}
                portalContainer={portalContainer}
                onSelect={onSelectImage}
                onManageConnections={onManageImage}
                onRepair={onRepairImage}
              />
              <AiRouteRow
                title="AI 助手"
                description="提示词、协作和图片分析"
                current={activeText}
                options={textOptions}
                saving={savingKind === "text"}
                disabled={disabled || Boolean(savingKind)}
                portalContainer={portalContainer}
                onSelect={onSelectText}
                onManageConnections={onManageText}
                onRepair={onRepairText}
              />
              <AiRouteRow
                title="视频生成"
                description="生成、续写和重混"
                current={activeVideo}
                options={videoOptions}
                saving={savingKind === "video"}
                disabled={disabled || Boolean(savingKind)}
                portalContainer={portalContainer}
                onSelect={onSelectVideo}
                onManageConnections={onManageVideo}
                onRepair={onRepairVideo}
              />
            </div>
          </section>

          {error ? (
            <div className="mt-6 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive" role="alert">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </>
  );
}

function AiRouteRow({
  title,
  description,
  current,
  options,
  saving,
  disabled,
  portalContainer,
  onSelect,
  onManageConnections,
  onRepair
}: {
  title: string;
  description: string;
  current: AiRouteOption | undefined;
  options: AiRouteOption[];
  saving: boolean;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  onSelect: (providerId: string) => Promise<void>;
  onManageConnections: () => void;
  onRepair: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const availableOptions = options.filter((option) => option.ready);
  const currentReady = Boolean(current?.ready);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <label className="text-xs font-medium text-foreground">{title}</label>
        <span className="truncate text-[11px] text-muted-foreground">{description}</span>
      </div>

      {availableOptions.length > 0 ? (
        <div className="min-w-0">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={`选择${title}`}
                className="flex h-11 w-full min-w-0 items-center gap-3 rounded-md border border-input bg-background px-3 text-left transition-colors hover:border-foreground/25 hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{current?.model || "选择模型"}</span>
                <span className="max-w-[40%] truncate text-[11px] text-muted-foreground">{current?.name || "尚未连接服务"}</span>
                {saving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
            </PopoverTrigger>
            <PopoverContent portalContainer={portalContainer} align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-lg p-0">
              <div className="max-h-[320px] overflow-y-auto p-1.5">
                {availableOptions.map((option) => {
                  const selected = option.id === current?.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "bg-accent" : "hover:bg-accent/65"
                      )}
                      onClick={() => {
                        setOpen(false);
                        void onSelect(option.id);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{option.model}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{option.name}{option.detail ? ` · ${option.detail}` : ""}</span>
                      </span>
                      {selected ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} /> : null}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => {
                  setOpen(false);
                  onManageConnections();
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                管理模型
              </button>
            </PopoverContent>
          </Popover>
          {!currentReady ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-destructive">
              <span>连接需要处理</span>
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={onRepair}>修复连接</button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full justify-between" onClick={onRepair}>
          暂无可用模型
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function ModelConnectionListItem({
  name,
  model,
  type,
  selected,
  ready,
  active,
  settingActive,
  setActiveDisabled,
  canDelete,
  deleteArmed,
  onSelect,
  onSetActive,
  onDelete
}: {
  name: string;
  model: string;
  type: ProviderType;
  selected: boolean;
  ready: boolean;
  active: boolean;
  settingActive: boolean;
  setActiveDisabled: boolean;
  canDelete: boolean;
  deleteArmed: boolean;
  onSelect: () => void;
  onSetActive: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const isOfficial = type === "official";
  const isCodex = type === "codex-oauth";
  const canSetActive = ready && !active && !settingActive && !setActiveDisabled;
  const statusLabel = settingActive ? "切换中" : active ? "使用中" : ready ? "" : "需配置";
  const hasActions = canSetActive || canDelete;
  return (
    <div className="group/item relative min-w-0 overflow-hidden rounded-md">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "library-sidebar-active text-foreground" : "hover:bg-background/60",
          canSetActive && canDelete ? "pr-[116px]" : canSetActive ? "pr-[84px]" : canDelete ? "pr-11" : null
        )}
      >
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          ready ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"
        )}>
          {isCodex ? <UserRound className="h-3.5 w-3.5" /> : isOfficial ? <ShieldCheck className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block max-w-full truncate text-[13px] font-medium" title={name}>{name}</span>
          <span className="block max-w-full truncate text-[10px] leading-4 text-muted-foreground" title={model}>
            {model}
          </span>
        </span>
        {statusLabel ? (
          <span className={cn(
            "flex shrink-0 items-center gap-1 text-[10px] font-medium transition-opacity",
            active || settingActive ? "text-foreground/70" : "text-destructive",
            hasActions && "group-hover/item:opacity-0 group-focus-within/item:opacity-0"
          )}>
            {settingActive ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {statusLabel}
          </span>
        ) : null}
      </button>
      {hasActions ? (
        <div className={cn(
          "pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-background/95 p-0.5 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100",
          selected && "bg-card/95"
        )}>
          {canSetActive ? (
            <button
              type="button"
              onClick={onSetActive}
              className="flex h-9 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Check className="h-3.5 w-3.5" />
              设为默认
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={deleteArmed ? `确认删除 ${name}` : `删除 ${name}`}
              title={deleteArmed ? `确认删除 ${name}` : `删除 ${name}`}
              className={cn(
                "flex h-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                deleteArmed
                  ? "w-auto bg-destructive/15 px-2 text-[11px] font-medium text-destructive"
                  : "w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              )}
            >
              {deleteArmed ? "确认删除" : <Trash2 className="h-[18px] w-[18px]" />}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
