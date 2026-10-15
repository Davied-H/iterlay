import { useUiText } from "@/i18n";
import appIconDefault from "@/assets/app-icon-default.png";
import appIconMascot from "@/assets/app-icon-mascot.png";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCenter } from "@/components/update/update-context";
import { AppIconPickerDialog } from "@/components/workbench/AppIconPickerDialog";
import { Field } from "@/components/workbench/Field";
import { MemoryManagerDialog } from "@/components/workbench/MemoryManagerDialog";
import { GenerateActionButton } from "@/components/workbench/PromptDock";
import { McpIntegrationPanel } from "@/components/workbench/settings/McpIntegrationPanel";
import { PiAgentSettingsPanel } from "@/components/workbench/settings/PiAgentSettingsPanel";
import { useI18n } from "@/i18n";
import { ASSISTANT_WIDTHS, setAssistantWidth, useAssistantWidth, type AssistantWidth } from "@/lib/assistant-width";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { addCodexProvider, createCodexProvider } from "@/lib/provider-settings";
import { cn } from "@/lib/utils";
import { selectProviderModel } from "@shared/provider-models";
import type {
  AppIconPreference,
  AssistantIntentSuggestionCount,
  AssistantMemoryStats,
  AssistantSkillDetail,
  AssistantSkillSummary,
  CodexAuthStatus,
  CustomAppIcon,
  FalReferenceInput,
  FalSizeMode,
  GenerateButtonStyle,
  PiAgentResourceInventory,
  ProviderApiMode,
  ProviderConfig,
  ProviderType,
  TextProviderConfig,
  VideoProviderConfig
} from "@shared/types";
import {
  ArrowLeft,
  BellRing,
  Bot,
  Check,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Plug,
  RotateCcw,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  Video
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COMMUNITY_TEXT_PROVIDER } from '../../../shared/community-providers';
import {
  type ProviderSettingsDialogProps,
  type Section,
  type TestState,
  type NotificationTestState,
  type ProviderView,
  type AiRouteKind,
  type AiRouteOption,
  SETTINGS_OPTION_SELECTED_CLASS,
  THEME_OPTIONS,
  LANGUAGE_OPTIONS,
  MODE_DEFAULTS,
  createProvider,
  createVideoProvider,
  videoProviderDefaults,
  createCodexTextProvider,
  textAuthProviderId,
  FAL_DEFAULTS,
  PLATFORM_DEFAULTS,
  BAILIAN_IMAGE_MODEL_OPTIONS,
  ARK_IMAGE_MODEL_OPTIONS,
  apiKeyPlaceholder,
  PROVIDER_TYPE_LABELS,
  SIGNED_OUT_CODEX_STATUS,
  hostOf,
  AppIconChoice,
  readFileAsDataUrl,
  TextProviderSetupWizard,
  ProviderSetupWizard,
  CodexAccountPanel,
  SummaryRow,
  ProviderModelsEditor,
  videoProviderModels,
  addVideoProviderModel,
  VideoProviderModelsEditor,
  VideoProviderModelAddControl,
  ProviderModelCombobox,
  FalModelCombobox,
  NavItem,
  TestStatus,
  SettingsGroup,
  SettingRow,
  ChoiceGrid,
  FormSection,
  AdvancedSettings,
  TypeBadge,
  ApiKeyInput,
  AiConfigurationOverview,
  ModelConnectionListItem
} from "./settings/provider-settings-components";
export { videoProviderModels, addVideoProviderModel, removeVideoProviderModel, makeVideoProviderModelDefault } from "./settings/provider-settings-components";

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
  const uiText = useUiText();

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
  }, [
    open,
    entryPoint,
    providers,
    activeProviderId,
    textProviders,
    activeTextProviderId,
    videoProviders,
    activeVideoProviderId,
    bridgeError,
    downloadDirectory,
    onDownloadDirectoryChange
  ]);

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
                label={uiText("AI 模型")}
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
            <section className="flex w-[clamp(280px,27vw,320px)] min-w-0 shrink-0 flex-col overflow-hidden border-r border-border/80 bg-background/55" aria-label={uiText("模型列表")}>
              <div className="flex h-[64px] shrink-0 items-center border-b border-border/80 px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={uiText("返回 AI 模型")}
                    title={uiText("返回 AI 模型")}
                    onClick={() => setProviderView("overview")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="truncate text-sm font-semibold text-foreground">{uiText("模型管理")}</h2>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 border-b border-border/80 p-2" role="tablist" aria-label={uiText("模型类型")}>
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
                    <span className="max-[900px]:sr-only">{uiText("图片模型")}</span>
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
                    <span className="max-[900px]:sr-only">{uiText("视频模型")}</span>
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
                    <span className="max-[900px]:sr-only">{uiText("助手模型")}</span>
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
                  <DialogDescription className="mt-1 truncate text-xs leading-5">{selectedVideo.type === "fal" ? "fal.ai" : selectedVideo.type === "openrouter" ? "OpenRouter" : selectedVideo.type === "minimax" ? "MiniMax" : uiText("火山方舟")} {uiText("视频生成 · ")}{selectedVideo.model}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex w-full flex-col gap-6 px-6 py-5">
                    {<>
                    <FormSection title={uiText("连接信息")}>
                      <Field label={uiText("服务类型")}>
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
                              {type === "ark" ? uiText("火山方舟") : type === "fal" ? "fal.ai" : type === "openrouter" ? "OpenRouter" : "MiniMax"}
                            </button>
                          ))}
                        </div>
                      </Field>
                      {selectedVideo.type === "fal" || selectedVideo.type === "openrouter" ? (
                        <Field label={uiText("连接配置")}>
                          <Select
                            value={selectedVideo.connectionProviderId || "independent"}
                            disabled={disableEditing}
                            onValueChange={(value) => patchSelectedVideo({
                              connectionProviderId: value === "independent" ? undefined : value
                            })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="independent">{uiText("独立配置")}</SelectItem>
                              {(selectedVideo.type === "fal" ? falImageProviders : openRouterImageProviders).map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>{uiText("复用图片服务 · ")}{provider.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(selectedVideo.type === "fal" ? falImageProviders : openRouterImageProviders).length === 0 ? (
                            <p className="text-[11px] leading-5 text-muted-foreground">{uiText("添加同类型图片服务后，可复用其地址和 API Key。")}</p>
                          ) : selectedVideo.connectionProviderId ? (
                            <p className="text-[11px] leading-5 text-muted-foreground">{uiText("服务地址与 API Key 跟随所选图片服务，视频模型仍独立配置。")}</p>
                          ) : null}
                        </Field>
                      ) : null}
                      <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                        <Field label={uiText("名称")}><Input value={selectedVideo.name} disabled={disableEditing} onChange={(event) => patchSelectedVideo({ name: event.target.value })} /></Field>
                        <Field label={uiText("服务地址")}><Input value={selectedVideo.connectionProviderId ? list.find((provider) => provider.id === selectedVideo.connectionProviderId)?.baseUrl || "关联的图片服务不存在" : selectedVideo.baseUrl} disabled={disableEditing || Boolean(selectedVideo.connectionProviderId)} placeholder={selectedVideo.type === "fal" ? "https://queue.fal.run" : selectedVideo.type === "openrouter" ? "https://openrouter.ai/api" : selectedVideo.type === "minimax" ? "https://api.minimax.io" : "https://ark.cn-beijing.volces.com/api/v3"} onChange={(event) => patchSelectedVideo({ baseUrl: event.target.value })} /></Field>
                      </div>
                      <Field label={uiText("视频模型")}>
                        <VideoProviderModelsEditor
                          provider={selectedVideo}
                          disabled={disableEditing}
                          portalContainer={dialogPortalContainer}
                          apiKeyOverride={keyDrafts[videoConnectionId(selectedVideo)]?.trim() || undefined}
                          onChange={(model, models) => patchSelectedVideo({ model, models })}
                        />
                      </Field>
                    </FormSection>
                    <FormSection title={uiText("访问密钥")}>
                      <Field label="API Key">
                        <ApiKeyInput value={selectedVideo.connectionProviderId ? "" : keyDrafts[selectedVideo.id] ?? ""} disabled={disableEditing || Boolean(selectedVideo.connectionProviderId)} placeholder={selectedVideo.connectionProviderId ? (isVideoProviderReady(selectedVideo) ? "已从图片服务复用" : "所选图片服务尚未配置密钥") : providerKeyStatus[selectedVideo.id] ? uiText("已安全保存，输入可覆盖") : uiText("输入 {{ui:0}} API Key", [selectedVideo.type === "fal" ? "fal.ai" : selectedVideo.type === "openrouter" ? "OpenRouter" : selectedVideo.type === "minimax" ? "MiniMax" : "火山方舟"])} onValueChange={(value) => { setKeyDrafts((current) => ({ ...current, [selectedVideo.id]: value })); setTestResult(null); }} />
                        <p className="text-[11px] leading-5 text-muted-foreground">{selectedVideo.connectionProviderId ? uiText("密钥由所选图片服务统一管理。") : uiText("密钥仅保存在本机，不会上传或随项目同步。")}</p>
                      </Field>
                    </FormSection>
                    </>}
                  </div>
                </ScrollArea>
                <div className="flex min-h-[64px] items-center justify-between gap-3 border-t border-border/80 bg-background/85 px-6 py-3">
                  <TestStatus bridgeError={bridgeError} testing={testing} result={testResult} hasKey={isVideoProviderReady(selectedVideo)} credential={"key"} />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void handleTest()} disabled={disableEditing || testing || saving}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("测试连接")}</Button>
                    <Button onClick={() => void handleSave()} disabled={disableEditing || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("保存")}</Button>
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
                          {textSetupFlow?.providerId === selectedText.id ? uiText("添加 AI 助手服务") : selectedText.name || "未命名服务"}
                        </DialogTitle>
                        <TypeBadge label={selectedText.type === "codex-oauth" ? uiText("Codex 账号") : "OpenAI Compatible"} />
                      </div>
                      <DialogDescription className="mt-1 truncate text-xs leading-5">
                        {selectedText.type === "codex-oauth"
                            ? uiText("使用 Codex / ChatGPT 账号提供 AI 智能辅助；可与图片模型共享登录。")
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
                        <FormSection title={uiText("服务信息")}>
                          <Field label={uiText("名称")}>
                            <Input
                              value={selectedText.name}
                              disabled={disableEditing}
                              onChange={(event) => patchSelectedText({ name: event.target.value })}
                            />
                          </Field>
                          <Field label={uiText("文本模型")}>
                            <ProviderModelCombobox
                              value={selectedText.model}
                              disabled={disableEditing}
                              textProvider={selectedText}
                              portalContainer={dialogPortalContainer}
                              placeholder={uiText("选择文本模型")}
                              onChange={(model) => patchSelectedText({ model })}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">
                              {uiText("可用模型由当前 ChatGPT 账号提供，打开菜单时自动刷新。")}</p>
                          </Field>
                          <div className="divide-y divide-border rounded-lg border border-border bg-card">
                            <SummaryRow label={uiText("账号绑定")} value={selectedText.authProviderId === selectedText.id ? "独立账号" : "与图片能力共用"} />
                          </div>
                        </FormSection>
                      </>
                    ) : (
                      <>
                        <FormSection title={uiText("连接信息")}>
                          <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                            <Field label={uiText("名称")}>
                              <Input
                                value={selectedText.name}
                                disabled={textFieldsDisabled}
                                onChange={(event) => patchSelectedText({ name: event.target.value })}
                                placeholder={uiText("给这个 AI 助手起个名字")}
                              />
                            </Field>
                            <Field label={uiText("服务地址")}>
                              <Input
                                value={selectedText.baseUrl}
                                disabled={textFieldsDisabled}
                                onChange={(event) => patchSelectedText({ baseUrl: event.target.value })}
                                placeholder="https://api.example.com"
                              />
                            </Field>
                          </div>

                          <Field label={uiText("助手模型")}>
                            <ProviderModelCombobox
                              value={selectedText.model}
                              disabled={textFieldsDisabled}
                              textProvider={selectedText}
                              portalContainer={dialogPortalContainer}
                              apiKeyOverride={keyDrafts[selectedText.id]?.trim()}
                              placeholder={uiText("选择文本模型")}
                              onChange={(model) => patchSelectedText({ model })}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">
                              {uiText("请求发往 Base URL 的 /v1/chat/completions；修改建议与主体识别会传图，建议选支持视觉的模型。")}</p>
                          </Field>
                        </FormSection>

                        <FormSection title={uiText("访问密钥")}>
                          <Field label="API Key">
                            <ApiKeyInput
                              value={keyDrafts[selectedText.id] ?? ""}
                              disabled={textFieldsDisabled}
                              placeholder={providerKeyStatus[selectedText.id] ? uiText("已安全保存，输入可覆盖") : "sk-..."}
                              onValueChange={(value) => {
                                setKeyDrafts((current) => ({ ...current, [selectedText.id]: value }));
                                setTestResult(null);
                              }}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">{uiText("密钥仅保存在本机，不会上传或随项目同步。")}</p>
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
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("测试连接")}
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={disableEditing || saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("保存")}
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
                          {setupFlow?.providerId === selected.id ? uiText("添加图片服务") : selected.name || "未命名服务"}
                        </DialogTitle>
                        <TypeBadge label={PROVIDER_TYPE_LABELS[selected.type]} />
                      </div>
                      <DialogDescription className="mt-1 truncate text-xs leading-5">
                        {setupFlow?.providerId === selected.id
                          ? uiText("选择服务并完成连接，技术参数会按服务自动配置。")
                          : selected.type === "codex-oauth"
                            ? uiText("使用本机保存的 Codex / ChatGPT 登录状态直接生成图片。")
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
                      <FormSection title={uiText("服务信息")}>
                        <Field label={uiText("名称")}>
                          <Input
                            value={selected.name}
                            disabled={disableEditing}
                            onChange={(event) => patchSelected({ name: event.target.value })}
                            placeholder={uiText("例如：我的 Codex")}
                          />
                        </Field>
                        <div className="divide-y divide-border rounded-lg border border-border bg-card">
                          <SummaryRow label={uiText("图片模型")} value="gpt-image-2" mono />
                          <SummaryRow label={uiText("同步文本模型")} value="gpt-5.4-mini" mono />
                          <SummaryRow label={uiText("运行方式")} value="Codex Responses · 本机直连" />
                        </div>
                      </FormSection>
                      </>
                    ) : (
                      <>
                        <FormSection title={uiText("连接信息")}>
                          <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                            <Field label={uiText("名称")}>
                              <Input
                                value={selected.name}
                                disabled={fieldsDisabled}
                                onChange={(event) => patchSelected({ name: event.target.value })}
                                placeholder={uiText("给这个服务起个名字")}
                              />
                            </Field>
                            <Field label={uiText("服务类型")}>
                              <Select
                                value={selected.type}
                                disabled={fieldsDisabled}
                                onValueChange={(value) => changeProviderType(value as ProviderType)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="codex-oauth">{uiText("新增 Codex / ChatGPT 账号")}</SelectItem>
                                  <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
                                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                                  <SelectItem value="bailian">{uiText("阿里云百炼")}</SelectItem>
                                  <SelectItem value="ark">{uiText("火山方舟 Seedream")}</SelectItem>
                                  <SelectItem value="poe">Poe</SelectItem>
                                  <SelectItem value="fal">fal.ai</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                          </div>

                          {selected.type === "fal" ? (
                            <>
                              <Field label={uiText("队列地址")}>
                                <Input
                                  value={selected.baseUrl}
                                  disabled={disableEditing}
                                  onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                  placeholder="https://queue.fal.run"
                                />
                              </Field>

                              <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                <Field label={uiText("图片模型")}>
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
                                <Field label={uiText("编辑模型")}>
                                  <FalModelCombobox
                                    value={selected.referenceModel ?? ""}
                                    disabled={disableEditing}
                                    category="image-to-image"
                                    portalContainer={dialogPortalContainer}
                                    providerId={selected.id}
                                    apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                    onChange={(referenceModel) => patchSelected({ referenceModel })}
                                    placeholder={uiText("留空则沿用生成模型")}
                                  />
                                </Field>
                              </div>

                              <AdvancedSettings>
                                <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                  <Field label={uiText("尺寸参数")}>
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
                                  <Field label={uiText("参考图参数")}>
                                    <Select
                                      value={selected.falReferenceInput ?? "image_urls"}
                                      disabled={disableEditing}
                                      onValueChange={(value) => patchSelected({ falReferenceInput: value as FalReferenceInput })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="image_urls">{uiText("image_urls（多图）")}</SelectItem>
                                        <SelectItem value="image_url">{uiText("image_url（单图）")}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </Field>
                                </div>
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  {uiText("参数名取决于所选模型的 API Schema，任务会通过官方队列提交并自动获取结果。")}</p>
                              </AdvancedSettings>
                            </>
                          ) : selected.type === "bailian" ? (
                            <>
                              <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                <Field label={uiText("服务地址")}>
                                  <Input
                                    value={selected.baseUrl}
                                    disabled={disableEditing}
                                    onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                    placeholder="https://dashscope.aliyuncs.com"
                                  />
                                </Field>
                                <Field label={uiText("生成 / 编辑模型")}>
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
                                {uiText("默认使用北京地域。新工作空间可填写专属域名；新加坡地域请使用对应地址与 API Key。")}</p>
                              <AdvancedSettings>
                                <Field label={uiText("生成接口路径")}>
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
                                <Field label={uiText("服务地址")}>
                                  <Input
                                    value={selected.baseUrl}
                                    disabled={disableEditing}
                                    onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                    placeholder="https://ark.cn-beijing.volces.com/api/v3"
                                  />
                                </Field>
                                <Field label={uiText("生成 / 编辑模型")}>
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
                                {uiText("使用火山方舟 API Key。打开模型列表会按当前服务地址实时拉取（如 doubao-seedream-5-0-pro-260628）； 5.0 pro 支持最多 10 张参考图与高精度编辑，其余 Seedream 模型支持最多 14 张参考图。")}</p>
                              <AdvancedSettings>
                                <Field label={uiText("生成接口路径")}>
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
                                    <Field label={uiText("服务地址")}>
                                      <Input
                                        value={selected.baseUrl}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                        placeholder="https://your-relay.example.com"
                                      />
                                    </Field>
                                    <Field label={uiText("图片模型")}>
                                      <ProviderModelCombobox
                                        value={selected.model}
                                        disabled={disableEditing}
                                        provider={selected}
                                        portalContainer={dialogPortalContainer}
                                        apiKeyOverride={keyDrafts[selected.id]?.trim()}
                                        placeholder={uiText("选择图片模型")}
                                        onChange={(model) => patchSelected({ model })}
                                      />
                                    </Field>
                                  </div>

                                  <AdvancedSettings>
                                    <div className="grid grid-cols-1 gap-4 min-[1050px]:grid-cols-2">
                                    <Field label={uiText("接口模式")}>
                                      <Select
                                        value={selected.apiMode ?? "responses"}
                                        disabled={disableEditing}
                                        onValueChange={(value) => changeApiMode(value as ProviderApiMode)}
                                      >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="responses">Responses</SelectItem>
                                          <SelectItem value="images">{uiText("Images")}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </Field>
                                    <Field label={uiText("生成接口路径")}>
                                      <Input
                                        value={selected.generationEndpoint}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ generationEndpoint: event.target.value })}
                                      />
                                    </Field>
                                    </div>
                                    {(selected.apiMode ?? "responses") === "images" ? (
                                      <>
                                      <Field label={uiText("编辑接口路径")}>
                                      <Input
                                        value={selected.referenceEndpoint || ""}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ referenceEndpoint: event.target.value })}
                                      />
                                      </Field>
                                      <label className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5">
                                        <span className="text-xs text-muted-foreground">{uiText("发送兼容格式 response_format=b64_json")}</span>
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
                                    <Field label={uiText("服务地址")}>
                                      <Input
                                        value={selected.baseUrl}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ baseUrl: event.target.value })}
                                      />
                                    </Field>
                                    <Field label={uiText("图片模型")}>
                                      <Input
                                        value={selected.model}
                                        disabled={disableEditing}
                                        onChange={(event) => patchSelected({ model: event.target.value })}
                                      />
                                    </Field>
                                  </div>
                                  <AdvancedSettings>
                                    <Field label={uiText("生成接口路径")}>
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
                                  {uiText("参考图通过 OpenRouter Images API 的 input_references 字段发送，实际支持数量由所选模型决定。")}</p>
                              ) : null}
                              {selected.type === "poe" ? (
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  {uiText("Poe 当前按官方 Images API 接入；默认模型为 nano-banana-2，暂不启用参考图输入。")}</p>
                              ) : null}
                            </>
                          )}
                        </FormSection>

                        <FormSection title={uiText("可用模型")}>
                          <ProviderModelsEditor
                            provider={selected}
                            disabled={disableEditing}
                            portalContainer={dialogPortalContainer}
                            apiKeyOverride={keyDrafts[selected.id]?.trim()}
                            onChange={(model, models) => patchSelected({ model, models })}
                          />
                        </FormSection>

                        <FormSection title={uiText("访问密钥")}>
                          <Field label="API Key">
                            <ApiKeyInput
                              value={keyDrafts[selected.id] ?? ""}
                              disabled={disableEditing}
                              placeholder={providerKeyStatus[selected.id] ? uiText("已安全保存，输入可覆盖") : apiKeyPlaceholder(selected.type)}
                              onValueChange={(value) => {
                                setKeyDrafts((current) => ({ ...current, [selected.id]: value }));
                                setTestResult(null);
                              }}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">{uiText("密钥仅保存在本机，不会上传或随项目同步。")}</p>
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
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : selected.type === "codex-oauth" ? uiText("检查状态") : uiText("测试连接")}
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={disableEditing || saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("保存")}
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
                          aria-label={uiText("选择下载目录")}
                          title={uiText("选择下载目录")}
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
                          {uiText("应用")}</Button>
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

                  <SettingsGroup title={uiText("在线分享")}>
                    <SettingRow
                      interactive
                      title={uiText("快速分享图片")}
                      description={uiText("允许通过 Manager 建立公网连接并生成图片二维码。分享会持续到手动关闭、到期或退出 APP。")}
                      control={
                        <Switch
                          checked={onlineImageSharingEnabled}
                          onCheckedChange={onOnlineImageSharingEnabledChange}
                        />
                      }
                    />
                  </SettingsGroup>

                  <SettingsGroup title={uiText("通知")}>
                    <SettingRow
                      title={uiText("系统通知")}
                      description={uiText("图片生成或编辑完成后发送桌面提醒。")}
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
                            {uiText("测试通知")}</Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={Boolean(bridgeError)}
                            onClick={() => void openNotificationSettings()}
                          >
                            {uiText("系统设置")}</Button>
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

                  <SettingsGroup title={uiText("更新")}>
                    <SettingRow
                      interactive
                      title={uiText("参与开发者计划（Beta）")}
                      description={uiText("抢先接收 Beta 测试版更新推送。Beta 版本可能不稳定，可随时退出，退出后会在下一个正式版发布时回到稳定通道。")}
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
                  <SettingsGroup title={uiText("画板 AI")}>
                    <SettingRow
                      interactive
                      title={uiText("AI 助手")}
                      description={uiText("在画板输入区显示 AI 助手入口，并启用对应快捷键。")}
                      control={<Switch checked={boardAssistantEnabled} onCheckedChange={onBoardAssistantEnabledChange} />}
                    />
                    <SettingRow
                      interactive
                      disabled={!boardAssistantEnabled}
                      title={uiText("AI 感知")}
                      description={uiText("添加引用或输入文字后，自动识别上下文、解析意图并给出建议。")}
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
                      title={uiText("后续问题推荐")}
                      description={uiText("在助手对话底部显示可继续追问的推荐问题。")}
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
                      title={uiText("推荐问题数量")}
                      description={uiText("控制每次显示的后续问题数量。")}
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

                  <SettingsGroup title={uiText("编辑 AI")}>
                    <SettingRow
                      interactive
                      disabled={!editSmartSuggestionsAvailable}
                      title={uiText("AI 编辑建议")}
                      description={
                        editSmartSuggestionsAvailable
                          ? uiText("进入图片编辑时自动生成修改建议。")
                          : uiText("需要先在 AI 模型中配置支持图片理解的助手模型。")
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

                  <SettingsGroup title={uiText("AI 助手记忆")}>
                    <SettingRow
                      interactive
                      title={uiText("使用记忆")}
                      description={uiText("记录近期提示词、创作操作和评论，在调用助手时作为可选参考。内容保存在本机。")}
                      control={<Switch checked={memoryEnabled} onCheckedChange={onMemoryEnabledChange} />}
                    />
                    <SettingRow
                      disabled={!memoryEnabled}
                      title={uiText("使用程度")}
                      description={uiText("控制助手参考历史的范围和数量；当前指令始终优先。")}
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
                      title={uiText("本地记忆")}
                      description={
                        memoryStats
                          ? uiText("{{ui:0}} 条有效记忆 · {{ui:1}} 条来源记录{{ui:2}}", [memoryStats.activeMemoryCount, memoryStats.eventCount, memoryStats.lastOrganizedAt ? ` · 最近整理 ${new Date(memoryStats.lastOrganizedAt).toLocaleDateString()}` : ""])
                          : uiText("正在读取记忆状态…")
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
                            {uiText("查看")}</Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={clearingMemory || !memoryStats || memoryStats.eventCount === 0}
                            onClick={() => void clearAssistantMemory()}
                          >
                            {clearingMemory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            {uiText("清除")}</Button>
                        </div>
                      }
                    />
                  </SettingsGroup>
                  </>
                  ) : (
                  <>
                  <SettingsGroup title={uiText("生成与输入")}>
                    <SettingRow title={uiText("生成按钮样式")} description={uiText("选择画板底部主生成按钮的视觉效果。")}>
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/75 p-1 sm:grid-cols-4" role="radiogroup" aria-label={uiText("生成按钮样式")}>
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
                              aria-label={uiText("选择{{ui:0}}样式", [option.title])}
                              onClick={(event) => {
                                event.stopPropagation();
                                onGenerateButtonStyleChange(option.value);
                              }}
                            >
                              {uiText("生成")}</GenerateActionButton>
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
                      title={uiText("输入框锚点展开收起")}
                      description={uiText("开启后，底部输入框失去焦点时收窄，聚焦时平滑展开；关闭则始终保持宽模式。")}
                      control={<Switch checked={promptDockAutoCollapse} onCheckedChange={onPromptDockAutoCollapseChange} />}
                    />
                    <SettingRow
                      interactive
                      title={uiText("高级视频模式")}
                      description={uiText("开启后显示视频改编和继续生成入口；关闭时仅保留新建视频。")}
                      control={<Switch checked={advancedVideoModesEnabled} onCheckedChange={onAdvancedVideoModesEnabledChange} />}
                    />
                    <SettingRow
                      interactive
                      title={uiText("常用场景快捷建议")}
                      description={uiText("在输入框上方显示常用场景建议；关闭后隐藏整条建议栏。")}
                      control={<Switch checked={boardSmartSuggestionsEnabled} onCheckedChange={onBoardSmartSuggestionsEnabledChange} />}
                    />
                  </SettingsGroup>

                  <SettingsGroup title={uiText("图片操作")}>
                    <SettingRow
                      title={uiText("复制图片格式")}
                      description={uiText("设置“复制原图”和对应快捷键写入系统剪贴板的格式。")}
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
                      title={uiText("微信表情导出")}
                      description={uiText("实验性功能。开启后，图片菜单和多选工具栏会显示微信表情导出入口。")}
                      control={
                        <Switch
                          checked={wechatStickerExportEnabled}
                          onCheckedChange={onWechatStickerExportEnabledChange}
                        />
                      }
                    />
                    <SettingRow
                      interactive
                      title={uiText("悬停图片时显示工具栏")}
                      description={uiText("开启后，将鼠标移到图片上即可显示操作工具栏；关闭时需先点击选中图片。")}
                      control={
                        <Switch
                          checked={canvasImageToolbarOnHover}
                          onCheckedChange={onCanvasImageToolbarOnHoverChange}
                        />
                      }
                    />
                    <SettingRow title={uiText("双击画板图片")} description={uiText("设置在画板中双击图片时触发的快捷操作。")}>
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
                    <SettingRow title={uiText("编辑态查看图片信息")} description={uiText("编辑模式下点击图片，用哪种方式展示它的提示词与引用图。")}>
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

                  <SettingsGroup title={uiText("画布显示与性能")}>
                    <SettingRow
                      interactive
                      title={t("settings.canvasRelationshipHoverHighlight.title")}
                      description={t("settings.canvasRelationshipHoverHighlight.description")}
                      control={<Switch checked={canvasRelationshipHoverHighlight} onCheckedChange={onCanvasRelationshipHoverHighlightChange} />}
                    />
                    <SettingRow
                      interactive
                      title={uiText("显示画布小地图")}
                      description={uiText("在画布左下角显示全局缩略图；小地图可通过顶部抓手移动位置。")}
                      control={<Switch checked={canvasMinimapVisible} onCheckedChange={onCanvasMinimapVisibleChange} />}
                    />
                    <SettingRow
                      interactive
                      title={uiText("缩小画板时使用缩略图")}
                      description={uiText("性能优化。开启后，低倍率画板使用较小预览图以降低显存占用；关闭时始终显示原图。")}
                      control={<Switch checked={canvasThumbnailPreview} onCheckedChange={onCanvasThumbnailPreviewChange} />}
                    />
                  </SettingsGroup>

                  <SettingsGroup title={uiText("版本管理")}>
                    <SettingRow title={uiText("版本分离方式")} description={uiText("设置从版本栈分离单个版本或全部版本时，是否保留原版本栈。")}>
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
              {uiText("保存后创建用户覆盖副本，只影响新会话。name 必须保持不变。")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-5">
            <Textarea
              value={assistantSkillDraft}
              disabled={assistantSkillBusy}
              spellCheck={false}
              onChange={(event) => setAssistantSkillDraft(event.target.value)}
              className="h-full min-h-[420px] resize-none font-mono text-xs leading-5"
              aria-label={uiText("编辑助手 Skill")}
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
              {uiText("重置为内置版本")}</Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={assistantSkillBusy}
                onClick={() => setAssistantSkillEditor(null)}
              >
                {uiText("取消")}</Button>
              <Button
                type="button"
                disabled={assistantSkillBusy || !assistantSkillDraft.trim()}
                onClick={() => void saveAssistantSkill()}
              >
                {assistantSkillBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {uiText("保存覆盖")}</Button>
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
