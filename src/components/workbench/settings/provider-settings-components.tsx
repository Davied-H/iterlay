import { useUiText } from "@/i18n";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Field } from "@/components/workbench/Field";

import { type MessageKey } from "@/i18n";

import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

import { cn } from "@/lib/utils";
import { getProviderModels } from "@shared/provider-models";
import type {
  AppSettings,
  AssistantIntentSuggestionCount,
  CodexAuthStatus,
  CopyImageFormat,
  EditInfoMode,
  FalModelCategory,
  FalModelOption,
  FalModelPrice,
  GenerateButtonStyle,
  ImageDoubleClickAction,
  MemoryUsageLevel,
  PiAgentBuiltinToolName,
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
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export interface ProviderSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryPoint?: "default" | "provider-setup" | "model-management" | "coding-agent";
  onImportStarterBoard?: () => void;
  onOpenStarterBoards?: () => void;
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
  boardCommentsEnabled: boolean;
  onBoardCommentsEnabledChange: (value: boolean) => void;
  boardGalleryEnabled: boolean;
  onBoardGalleryEnabledChange: (value: boolean) => void;
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

export type Section = "provider" | "system" | "board" | "ai" | "pi-agent" | "agent";

export type TestState = { ok: boolean; message: string } | null;

export type NotificationTestState = { ok: boolean; message: string } | null;

export type ProviderView = "overview" | "connections";

export type AiRouteKind = "image" | "text" | "video";

export interface AiRouteOption {
  id: string;
  name: string;
  model: string;
  detail: string;
  ready: boolean;
}

export const SETTINGS_OPTION_SELECTED_CLASS = "settings-option-selected";

export const EMPTY_MODEL_OPTIONS: ProviderModelOption[] = [];

export const EMPTY_MODEL_IDS: string[] = [];

export const FAL_VIDEO_MODEL_CATEGORIES = ["text-to-video", "image-to-video"] as const satisfies readonly FalModelCategory[];

export const THEME_OPTIONS: Array<{
  value: AppSettings["theme"];
  label: MessageKey;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "settings.theme.system", icon: Monitor },
  { value: "light", label: "settings.theme.light", icon: Sun },
  { value: "dark", label: "settings.theme.dark", icon: Moon }
];

export const LANGUAGE_OPTIONS: Array<{
  value: AppSettings["language"];
  label: "settings.language.system" | "settings.language.zhCN" | "settings.language.enUS";
}> = [
  { value: "system", label: "settings.language.system" },
  { value: "zh-CN", label: "settings.language.zhCN" },
  { value: "en-US", label: "settings.language.enUS" }
];

// 切换 API Mode 时套用的端点/模型默认值（仅在字段仍为另一模式默认值时才覆盖）。
export const MODE_DEFAULTS: Record<ProviderApiMode, Pick<ProviderConfig, "generationEndpoint" | "referenceEndpoint" | "model">> = {
  responses: { generationEndpoint: "/v1/responses", referenceEndpoint: "", model: "gpt-5.5" },
  images: { generationEndpoint: "/v1/images/generations", referenceEndpoint: "/v1/images/edits", model: "gpt-image-2" }
};

export function createProvider(index: number): ProviderConfig {
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

export function createVideoProvider(index: number): VideoProviderConfig {
  return {
    id: `video-provider-${crypto.randomUUID().slice(0, 8)}`,
    name: `火山方舟 ${index}`,
    type: "ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seedance-1-5-pro-250528"
  };
}

export function videoProviderDefaults(type: VideoProviderConfig["type"]): Pick<VideoProviderConfig, "name" | "baseUrl" | "model" | "models"> {

  const defaults = type === "fal"
    ? { name: "fal.ai", baseUrl: "https://queue.fal.run", model: "fal-ai/kling-video/v2.1/standard/text-to-video" }
    : type === "openrouter"
      ? { name: "OpenRouter", baseUrl: "https://openrouter.ai/api", model: "google/veo-3.1-fast" }
      : type === "minimax"
        ? { name: "MiniMax", baseUrl: "https://api.minimax.io", model: "MiniMax-H3" }
      : { name: "火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seedance-1-5-pro-250528" };
  return { ...defaults, models: [defaults.model] };
}

export function createCodexTextProvider(
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

export function textAuthProviderId(provider: TextProviderConfig): string {
  return provider.authProviderId || provider.id;
}

export const FAL_DEFAULTS: Pick<
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

export const PLATFORM_DEFAULTS: Record<
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

export const BAILIAN_IMAGE_MODEL_OPTIONS: ProviderModelOption[] = [
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

export const ARK_IMAGE_MODEL_OPTIONS: ProviderModelOption[] = [
  { id: "doubao-seedream-5-0-pro-260628", ownedBy: "Seedream · 5.0 pro 高精度编辑（推荐）" },
  { id: "doubao-seedream-5-0-260128", ownedBy: "Seedream · 5.0 lite 联网检索" },
  { id: "doubao-seedream-4-5-251128", ownedBy: "Seedream · 4.5 生成与组图" },
  { id: "doubao-seedream-4-0-250828", ownedBy: "Seedream · 4.0 生成与组图" }
];

export function mergeModelOptions(
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

export function apiKeyPlaceholder(type: ProviderType): string {
  if (type === "fal") return "fal key";
  if (type === "openrouter") return "sk-or-v1-...";
  if (type === "poe") return "Poe API Key";
  if (type === "ark") return "火山方舟 API Key";
  return "sk-...";
}

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  official: "官方",
  "codex-oauth": "Codex 账号",
  "openai-compatible": "OpenAI Compatible",
  openrouter: "OpenRouter",
  bailian: "阿里云百炼",
  ark: "火山方舟 Seedream",
  poe: "Poe",
  fal: "fal.ai"
};

export const SIGNED_OUT_CODEX_STATUS: CodexAuthStatus = { state: "signed-out" };

export function hostOf(baseUrl: string): string {
  if (!baseUrl.trim()) return "未填写服务地址";
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function AppIconChoice({
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
  const uiText = useUiText();

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
            {pending ? uiText("正在切换…") : chosen ? uiText("当前使用") : description}
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
              aria-label={uiText("管理伙伴头像")}
              title={uiText("管理伙伴头像")}
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

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("无法读取头像图片。"));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取头像图片。"));
    reader.readAsDataURL(file);
  });
}

export function TextProviderSetupWizard({
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
  const uiText = useUiText();

  const connected = status.state === "connected" || status.state === "refreshing";
  const codex = provider.type === "codex-oauth";
  const configured = codex
    ? connected
    : Boolean(provider.name.trim() && provider.baseUrl.trim() && (hasSavedKey || keyDraft.trim()));
  const ready = configured && Boolean(provider.model.trim());
  const steps = ["选择服务", codex ? "连接账号" : "接入配置", "确认模型", "验证"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-4 border-b border-border/70 px-6 pt-4" aria-label={uiText("第 {{ui:0}} 步，共 4 步", [step])}>
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
              <h3 className="text-sm font-semibold text-foreground">{uiText("选择连接方式")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{uiText("文本模型用于提示词润色、场景协作与图片分析。")}</p>
              <div className="mt-5 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                <SetupChoice
                  icon={UserRound}
                  title={uiText("Codex / ChatGPT 账号")}
                  description={uiText("自动复用已连接的图片账号，无需二次授权。")}
                  recommended
                  onClick={() => onChoose("codex-oauth")}
                />
                <SetupChoice
                  icon={KeyRound}
                  title="OpenAI Compatible"
                  description={uiText("使用 API Key、Base URL 与文本模型。")}
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
              capabilityLabel={uiText("文本模型")}
              capabilityValue={provider.model || "gpt-5.4-mini"}
              onSignIn={onSignIn}
            />
          ) : null}

          {step === 2 && !codex ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{uiText("填写接入信息")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{uiText("配置保存在本机，API Key 使用系统安全存储。")}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={uiText("名称")}>
                  <Input value={provider.name} onChange={(event) => onPatch({ name: event.target.value })} placeholder={uiText("例如：我的文本模型")} />
                </Field>
                <Field label="Base URL">
                  <Input value={provider.baseUrl} onChange={(event) => onPatch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                </Field>
              </div>
              <Field label="API Key">
                <ApiKeyInput
                  value={keyDraft}
                  disabled={false}
                  placeholder={hasSavedKey ? uiText("已安全保存，输入可覆盖") : "sk-..."}
                  onValueChange={onKeyChange}
                />
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{uiText("模型与能力")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {codex ? uiText("选择当前账号可用的 Codex 文本模型。") : uiText("选择支持视觉输入的模型可启用图片分析能力。")}
                </p>
              </div>
              {codex ? (
                <div className="space-y-4">
                  <Field label={uiText("文本模型")}>
                    <ProviderModelCombobox
                      value={provider.model}
                      disabled={!connected}
                      textProvider={provider}
                      portalContainer={portalContainer}
                      placeholder={uiText("选择文本模型")}
                      onChange={(model) => onPatch({ model })}
                    />
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      {uiText("可用模型由当前 ChatGPT 账号提供，打开菜单时自动刷新。")}</p>
                  </Field>
                  <div className="divide-y divide-border rounded-lg border border-border bg-card">
                    <SummaryRow label={uiText("可用能力")} value={uiText("提示词润色、场景协作、图片分析")} />
                    <SummaryRow label={uiText("账号绑定")} value={uiText(provider.authProviderId === provider.id ? "独立账号" : "与图片能力共用")} />
                  </div>
                </div>
              ) : (
                <Field label={uiText("文本模型")}>
                  <ProviderModelCombobox
                    value={provider.model}
                    disabled={false}
                    textProvider={provider}
                    portalContainer={portalContainer}
                    apiKeyOverride={keyDraft.trim()}
                    placeholder={uiText("选择文本模型")}
                    onChange={(model) => onPatch({ model })}
                  />
                </Field>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{uiText("连接验证")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{uiText("检查连接后保存，即可用于所有 AI 文本辅助。")}</p>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                <SummaryRow label={uiText("服务")} value={provider.name || "未命名"} />
                <SummaryRow label={uiText("文本模型")} value={provider.model || "未选择"} mono />
                <SummaryRow label={uiText("鉴权方式")} value={codex ? "Codex / ChatGPT 账号" : "API Key"} />
              </div>
              {testResult ? (
                <p className={cn("text-xs", testResult.ok ? "text-[hsl(var(--success))]" : "text-destructive")}>{testResult.message}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
        <span className="text-xs text-muted-foreground">{uiText("第 ")}{step} {uiText("步，共 4 步")}</span>
        <div className="flex items-center gap-2">
          {step === 1 ? <Button type="button" variant="ghost" onClick={onCancel}>{uiText("取消")}</Button> : (
            <Button type="button" variant="outline" onClick={onBack} disabled={Boolean(action) || testing || saving}>
              <ArrowLeft className="h-4 w-4" /> {uiText("返回")}</Button>
          )}
          {step === 2 ? (
            <Button type="button" onClick={onNext} disabled={!configured || Boolean(action)}>
              {uiText("继续 ")}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 3 ? (
            <Button type="button" onClick={onNext} disabled={!ready}>
              {uiText("继续 ")}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 4 ? (
            <>
              <Button type="button" variant="outline" onClick={onTest} disabled={!ready || testing || saving}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("测试连接")}
              </Button>
              <Button type="button" onClick={onSave} disabled={!ready || testing || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("保存并使用")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProviderSetupWizard({
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
  const uiText = useUiText();

  const connected = status.state === "connected" || status.state === "refreshing";
  const steps = ["选择服务", "连接账号", "确认模型", "验证"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-4 border-b border-border/70 px-6 pt-4" aria-label={uiText("第 {{ui:0}} 步，共 4 步", [step])}>
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
              <h3 className="text-sm font-semibold text-foreground">{uiText("选择连接方式")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{uiText("选择你已有的账号或服务。")}</p>
              <div className="mt-5 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                <SetupChoice
                  icon={UserRound}
                  title={uiText("Codex / ChatGPT 账号")}
                  description={uiText("浏览器登录，凭据保存在本机。")}
                  recommended
                  onClick={() => onChoose("codex-oauth")}
                />
                <SetupChoice
                  icon={KeyRound}
                  title="OpenAI Compatible"
                  description={uiText("使用 API Key、Base URL 与模型。")}
                  onClick={() => onChoose("openai-compatible")}
                />
                <SetupChoice
                  icon={Plug}
                  title="fal.ai"
                  description={uiText("连接 fal 队列与图片模型。")}
                  onClick={() => onChoose("fal")}
                />
                <SetupChoice
                  icon={ShieldCheck}
                  title="OpenRouter"
                  description={uiText("使用 OpenRouter 图片接口。")}
                  onClick={() => onChoose("openrouter")}
                />
                <SetupChoice
                  icon={ImageIcon}
                  title="Qwen Image"
                  description={uiText("通过阿里云百炼连接千问图片模型。")}
                  onClick={() => onChoose("bailian")}
                />
                <SetupChoice
                  icon={Plug}
                  title={uiText("火山方舟 Seedream")}
                  description={uiText("连接豆包 Seedream 图片模型（需 API Key）。")}
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
                <h3 className="text-sm font-semibold text-foreground">{uiText("模型与能力")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{uiText("账号连接使用预设的 Codex 图片能力。")}</p>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                <SummaryRow label={uiText("图片模型")} value={provider.model || "gpt-image-2"} mono />
                <SummaryRow label={uiText("同步文本模型")} value={uiText("gpt-5.4-mini · 自动绑定")} mono />
                <SummaryRow label={uiText("可用能力")} value={uiText("文生图、参考图、图片编辑")} />
                <SummaryRow label={uiText("连接方式")} value={uiText("Codex Responses · 本机直连")} />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{uiText("连接验证")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{uiText("保存后即可在画板输入框切换使用。")}</p>
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
                  <p className="text-sm font-medium text-foreground">{connected ? uiText("账号已连接") : uiText("账号尚未连接")}</p>
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
        <span className="text-xs text-muted-foreground">{uiText("第 ")}{step} {uiText("步，共 4 步")}</span>
        <div className="flex items-center gap-2">
          {step === 1 ? (
            <Button type="button" variant="ghost" onClick={onCancel}>{uiText("取消")}</Button>
          ) : (
            <Button type="button" variant="outline" onClick={onBack} disabled={Boolean(action) || testing || saving}>
              <ArrowLeft className="h-4 w-4" /> {uiText("返回")}</Button>
          )}
          {step === 2 ? (
            <Button type="button" onClick={onNext} disabled={!connected || Boolean(action)}>
              {uiText("继续 ")}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 3 ? (
            <Button type="button" onClick={onNext}>
              {uiText("继续 ")}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
          {step === 4 ? (
            <>
              <Button type="button" variant="outline" onClick={onTest} disabled={!connected || testing || saving}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("检查状态")}
              </Button>
              <Button type="button" onClick={onSave} disabled={!connected || testing || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("保存并使用")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SetupChoice({
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
  const uiText = useUiText();

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
        {recommended ? <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{uiText("推荐")}</span> : null}
      </span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
    </button>
  );
}

export function CodexAccountPanel({
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
  const uiText = useUiText();

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
        <h3 className="text-sm font-semibold text-foreground">{uiText("Codex / ChatGPT 账号")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{uiText("OAuth 凭据由操作系统安全存储保护。")}</p>
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
              {status.state === "reauth-required" || status.state === "expired" ? uiText("重新登录") : uiText("登录账号")}
            </Button>
          ) : null}
        </div>

        {connected ? (
          <div className="grid grid-cols-1 border-t border-border sm:grid-cols-3">
            <AccountFact label={uiText("状态")} value={stateLabel} />
            <AccountFact label={capabilityLabel} value={capabilityValue} mono />
            <AccountFact label={uiText("凭据")} value={uiText("系统安全存储")} />
          </div>
        ) : null}
      </div>

      {connected && (onRefresh || onSignOut) ? (
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={Boolean(action)}>
              {action === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {uiText("刷新状态")}</Button>
          ) : null}
          {onSignOut ? (
            <Button type="button" variant="ghost" size="sm" onClick={onSignOut} disabled={Boolean(action)} className="text-muted-foreground hover:text-destructive">
              {action === "sign-out" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              {uiText("退出账号")}</Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs leading-5 text-destructive">{error}</p> : null}

      <div className="flex items-start gap-3 border-t border-border pt-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-5 text-muted-foreground">
          {uiText("Access Token、Refresh Token 与账号标识只在 Electron 主进程中使用，不会写入普通设置文件。")}</p>
      </div>
    </div>
  );
}

export function AccountFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="min-w-0 border-b border-border p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="block text-[10px] text-muted-foreground">{uiText(label)}</span>
      <span className={cn("mt-1 block truncate text-xs font-medium text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

export function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4 px-4 py-3 text-xs">
      <span className="text-muted-foreground">{uiText(label)}</span>
      <span className={cn("truncate font-medium text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

export function ProviderModelsEditor({
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
  const uiText = useUiText();

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
        {uiText("模型可在画板中切换，默认项用于新任务。")}</p>
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
                    {uiText("默认")}</span>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{uiText("设为默认")}</span>
                )}
              </button>
              <button
                type="button"
                disabled={disabled || models.length <= 1}
                onClick={() => removeModel(model)}
                aria-label={uiText("删除模型 {{ui:0}}", [model])}
                title={models.length <= 1 ? uiText("至少保留一个模型") : uiText("删除模型")}
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
          emptyMessage={uiText("没有更多可添加的模型")}
          placeholder={uiText("选择或搜索模型")}
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
          emptyMessage={uiText("没有更多可添加的模型")}
          placeholder={uiText("选择或搜索模型")}
          onChange={addModel}
        />
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">
        {uiText("可搜索服务模型，或手动输入模型 ID。")}</p>
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

export function VideoProviderModelsEditor({
  provider,
  disabled,
  onChange
}: {
  provider: VideoProviderConfig;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  apiKeyOverride?: string;
  onChange: (model: string, models: string[]) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const models = videoProviderModels(provider);

  function removeModel(model: string): void {
    const next = removeVideoProviderModel(provider, model);
    if (next.models.length === models.length) return;
    onChange(next.model, next.models);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-5 text-muted-foreground">
        {uiText("默认模型会用于新建视频节点。可在下方添加其他模型。")}</p>
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
                <span className="shrink-0 text-[10px] text-muted-foreground">{isDefault ? uiText("默认") : uiText("设为默认")}</span>
              </button>
              <button
                type="button"
                disabled={disabled || models.length <= 1}
                onClick={() => removeModel(model)}
                aria-label={uiText("删除视频模型 {{ui:0}}", [model])}
                title={models.length <= 1 ? uiText("至少保留一个模型") : uiText("删除模型")}
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

export function VideoProviderModelAddControl({
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
  const uiText = useUiText();

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
        emptyMessage={uiText("没有更多可添加的视频模型")}
        placeholder={uiText("添加模型")}
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
      emptyMessage={uiText("没有更多可添加的视频模型")}
      placeholder={uiText("添加模型")}
      triggerClassName={triggerClassName}
      onChange={onChange}
    />
  );
}

export function ProviderModelCombobox({
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
  const uiText = useUiText();

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
            placeholder={uiText("搜索模型 ID 或提供商")}
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
                title={uiText("重新加载")}
                aria-label={uiText("重新加载服务模型")}
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
              <span className="min-w-0 flex-1">{uiText("不指定（使用默认模型）")}</span>
              {!value ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </button>
          ) : null}

          {!error && visibleOptions.length === 0 && loading ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">{uiText("正在加载模型…")}</p>
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
              <span className="min-w-0 flex-1 truncate">{uiText("使用自定义模型：")}{customValue}</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FalModelCombobox({
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
  const uiText = useUiText();

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
            placeholder={uiText("搜索模型名称或 endpoint ID")}
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
                title={uiText("重新加载")}
                aria-label={uiText("重新加载 fal.ai 模型")}
                onClick={() => setRetryNonce((value) => value + 1)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {!error && visibleOptions.length === 0 && loading ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">{uiText("正在加载模型…")}</p>
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
                            {model.category === "image-to-video" ? uiText("图生视频") : uiText("文生视频")}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate font-mono">{model.endpointId}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {model.price ? (
                        <span
                          className="whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground"
                          title={uiText("fal.ai 基础单价；实际费用可能随分辨率或输出量调整")}
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
              <span className="min-w-0 flex-1 truncate">{uiText("使用自定义 endpoint：")}{customValue}</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function formatFalPrice(price: FalModelPrice): string {
  const currencySymbol = price.currency === "USD" ? "$" : price.currency === "EUR" ? "€" : price.currency === "CNY" ? "¥" : `${price.currency} `;
  const maximumFractionDigits = price.unitPrice < 0.001 ? 6 : price.unitPrice < 0.1 ? 4 : 2;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(price.unitPrice);
  const unit = price.unit === "image" ? "张" : price.unit === "second" ? "秒" : price.unit === "megapixel" ? "MP" : price.unit;
  return `${currencySymbol}${amount} / ${unit}`;
}

export function NavItem({
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
  const uiText = useUiText();

  return (
    <button
      type="button"
      onClick={onClick}
      title={uiText(label)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "settings-nav-item",
        active
          ? "settings-nav-item--active"
          : "text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="max-[639px]:sr-only">{uiText(label)}</span>
    </button>
  );
}

export function TestStatus({
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
  const uiText = useUiText();

  if (bridgeError) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <XCircle className="h-3.5 w-3.5" /> {uiText("桌面接口缺失")}</span>
    );
  }
  if (testing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {uiText("测试中…")}</span>
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
      {credential === "account" ? uiText("需要登录") : uiText("需要 API Key")}
    </span>
  );
}

export { SettingsGroup, SettingsRow as SettingRow } from "./SettingsPrimitives";

/** 互斥选项组：使用紧凑的分段选择，避免设置面板内重复嵌套卡片。 */
export function ChoiceGrid<T extends string>({
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
  const uiText = useUiText();

  return (
    <div
      className={cn(
        "settings-choice-grid",
        columns === 3 ? "settings-choice-grid--three" : "settings-choice-grid--two"
      )}
      role="radiogroup"
      aria-label={uiText(ariaLabel)}
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
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!offset) return;
              event.preventDefault();
              const nextIndex = (options.indexOf(option) + offset + options.length) % options.length;
              onChange(options[nextIndex].value);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
            }}
            onClick={() => onChange(option.value)}
            className={cn(
              "settings-choice",
              active ? "settings-choice--selected" : "text-muted-foreground",
              disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground"
            )}
          >
            <span className="settings-choice-title">{uiText(option.title)}</span>
            {option.description ? (
              <span className="settings-choice-description">{uiText(option.description)}</span>
            ) : null}
            {active ? (
              <span className="settings-choice-check">
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
export function FormSection({ title, children }: { title: string; children: ReactNode }): React.ReactElement {
  const uiText = useUiText();

  return (
    <section className="flex flex-col gap-3.5 border-b border-border/80 pb-6 last:border-b-0 last:pb-0">
      <h3 className="text-[13px] font-semibold leading-5 text-foreground">{uiText(title)}</h3>
      <div className="flex flex-col gap-4 [&_label]:text-xs [&_label]:font-medium [&_label]:text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function AdvancedSettings({ children }: { children: ReactNode }): React.ReactElement {
  const uiText = useUiText();

  return (
    <details className="group border-t border-border/70 pt-2">
      <summary className="flex h-9 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>{uiText("高级设置")}</span>
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="mt-3 flex flex-col gap-4 pb-1">{children}</div>
    </details>
  );
}

export function TypeBadge({ label }: { label: string }): React.ReactElement {
  return (
    <span className="shrink-0 text-[11px] font-medium leading-4 text-muted-foreground">
      {label}
    </span>
  );
}

/** 密码态 API Key 输入，带显示/隐藏切换。 */
export function ApiKeyInput({
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
  const uiText = useUiText();

  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        value={value}
        disabled={disabled}
        type={visible ? "text" : "password"}
        aria-label="API Key"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="pr-10"
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={visible ? uiText("隐藏 API Key") : uiText("显示 API Key")}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function AiConfigurationOverview({
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
  const uiText = useUiText();

  const activeImage = imageOptions.find((option) => option.id === activeImageId) ?? imageOptions[0];
  const activeText = textOptions.find((option) => option.id === activeTextId) ?? textOptions[0];
  const activeVideo = videoOptions.find((option) => option.id === activeVideoId) ?? videoOptions[0];

  return (
    <>
      <DialogTitle className="sr-only">{uiText("AI 模型")}</DialogTitle>
      <DialogDescription className="sr-only">{uiText("选择各项功能使用的模型。")}</DialogDescription>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full flex-col px-6 py-7">
          <section>
            <div className="flex min-w-0 items-start justify-between gap-4 pr-10">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">{uiText("默认模型")}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiText("Iterlay 会在对应功能中自动使用这些模型。")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2.5"
                onClick={onManageImage}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {uiText("管理模型")}</Button>
            </div>
            <div className="mt-6 flex flex-col gap-6">
              <AiRouteRow
                title={uiText("图片生成")}
                description={uiText("生成、编辑和参考图")}
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
                title={uiText("文本模型")}
                description={uiText("提示词、协作和图片分析")}
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
                title={uiText("视频生成")}
                description={uiText("生成、续写和重混")}
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

export function AiRouteRow({
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
  const uiText = useUiText();

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
                aria-label={uiText("选择{{ui:0}}", [title])}
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
                {uiText("管理模型")}</button>
            </PopoverContent>
          </Popover>
          {!currentReady ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-destructive">
              <span>{uiText("连接需要处理")}</span>
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={onRepair}>{uiText("修复连接")}</button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full justify-between" onClick={onRepair}>
          {uiText("暂无可用模型")}<ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function ModelConnectionListItem({
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
  const uiText = useUiText();

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
              {uiText("设为默认")}</button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={deleteArmed ? uiText("确认删除 {{ui:0}}", [name]) : uiText("删除 {{ui:0}}", [name])}
              title={deleteArmed ? uiText("确认删除 {{ui:0}}", [name]) : uiText("删除 {{ui:0}}", [name])}
              className={cn(
                "flex h-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                deleteArmed
                  ? "w-auto bg-destructive/15 px-2 text-[11px] font-medium text-destructive"
                  : "w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              )}
            >
              {deleteArmed ? uiText("确认删除") : <Trash2 className="h-[18px] w-[18px]" />}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
