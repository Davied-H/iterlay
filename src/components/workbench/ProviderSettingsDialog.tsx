import { AiSettingsNavigation, isAiSettingsSection, type AiSettingsSection } from "./settings/AiSettingsNavigation";
import "./settings/settings-navigation.css";
import { SettingsPageHeader } from "./settings/SettingsPrimitives";
import appIconDefault from "@/assets/app-icon-default.png";
import appIconMascot from "@/assets/app-icon-mascot.png";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUiText } from "@/i18n";
import { AiModelsSettings, type AiModelsSettingsHandle } from "./settings/AiModelsSettings";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCenter } from "@/components/update/update-context";
import { AppIconPickerDialog } from "@/components/workbench/AppIconPickerDialog";
import { MemoryManagerDialog } from "@/components/workbench/MemoryManagerDialog";
import { GenerateActionButton } from "@/components/workbench/PromptDock";
import { CodingAgentSettings } from "@/components/workbench/settings/CodingAgentSettings";
import { PiAgentSettingsPanel } from "@/components/workbench/settings/PiAgentSettingsPanel";
import { useI18n } from "@/i18n";
import { ASSISTANT_WIDTHS, setAssistantWidth, useAssistantWidth, type AssistantWidth } from "@/lib/assistant-width";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { cn } from "@/lib/utils";
import type {
  AppIconPreference,
  AssistantIntentSuggestionCount,
  AssistantMemoryStats,
  AssistantSkillDetail,
  AssistantSkillSummary,
  CustomAppIcon,
  GenerateButtonStyle,
  PiAgentResourceInventory
} from "@shared/types";
import {
  BellRing,
  Check,
  Eye,
  FolderOpen,
  Languages,
  LayoutDashboard,
  Loader2,
  Plug,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2
} from "lucide-react";
import { useEffect,  useId, useRef, useState } from "react";
import {
  AppIconChoice,
  ChoiceGrid,
  LANGUAGE_OPTIONS,
  NavItem,
  readFileAsDataUrl,
  SettingRow,
  SETTINGS_OPTION_SELECTED_CLASS,
  SettingsGroup,
  THEME_OPTIONS,
  type NotificationTestState,
  type ProviderSettingsDialogProps,
  type Section
} from "./settings/provider-settings-components";
export { addVideoProviderModel, makeVideoProviderModelDefault, removeVideoProviderModel, videoProviderModels } from "./settings/provider-settings-components";


export function ProviderSettingsDialog({
  open,
  onOpenChange,
  entryPoint = "default",
  onImportStarterBoard,
  onOpenStarterBoards,
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
  boardCommentsEnabled,
  onBoardCommentsEnabledChange,
  boardGalleryEnabled,
  onBoardGalleryEnabledChange,
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

  const { t, locale } = useI18n();
  const segmentedControlId = useId();
  const assistantWidth = useAssistantWidth();
  const updateCenter = useUpdateCenter();
  const [section, setSection] = useState<Section>("board");
  const [memoryStats, setMemoryStats] = useState<AssistantMemoryStats | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryManagerOpen, setMemoryManagerOpen] = useState(false);
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
  const [piAgentResources, setPiAgentResources] = useState<PiAgentResourceInventory | null>(null);
  const [piAgentResourceError, setPiAgentResourceError] = useState<string | null>(null);
  const [assistantSkills, setAssistantSkills] = useState<AssistantSkillSummary[]>([]);
  const [assistantSkillEditor, setAssistantSkillEditor] = useState<AssistantSkillDetail | null>(null);
  const [assistantSkillDraft, setAssistantSkillDraft] = useState("");
  const [assistantSkillBusy, setAssistantSkillBusy] = useState(false);
  const [assistantSkillError, setAssistantSkillError] = useState<string | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const modelSettingsRef = useRef<AiModelsSettingsHandle>(null);
  const lastAiSectionRef = useRef<AiSettingsSection>("provider");
  const aiPanelId = useId();
  const aiSection = isAiSettingsSection(section);
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

  // 每次打开都以外部最新状态为准重新播种草稿。
  useEffect(() => {
    if (!open) {
      dialogOpenRef.current = false;
      return;
    }
    if (dialogOpenRef.current) return;
    dialogOpenRef.current = true;
    setSection(entryPoint === "coding-agent" ? "agent" : entryPoint === "default" ? "board" : "provider");
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
    if (!open || bridgeError || !boardAssistantAgentModeAvailable) return;
    let disposed = false;
    setPiAgentResourceError(null);
    void getImageWorkbenchApi().getPiAgentResources()
      .then((inventory) => {
        if (!disposed) setPiAgentResources(inventory);
      })
      .catch((error) => {
        if (!disposed) setPiAgentResourceError(getWorkbenchErrorMessage(error, "无法读取助手工具与技能。"));
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

  function requestSection(next: Section): void {
    if (next === section) return;
    const activate = () => {
      if (isAiSettingsSection(next)) lastAiSectionRef.current = next;
      setSection(next);
    };
    if (section === "provider" && modelSettingsRef.current) modelSettingsRef.current.requestLeave(activate);
    else activate();
  }
  function requestOpenChange(next: boolean): void {
    if (!next && section === "provider" && modelSettingsRef.current) modelSettingsRef.current.requestLeave(() => onOpenChange(false));
    else onOpenChange(next);
  }

  const PageContainer = section === "pi-agent" || section === "agent" ? "div" : ScrollArea;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        ref={setDialogPortalContainer}
        onOpenAutoFocus={(event) => {
          if (event.target instanceof HTMLElement) {
            event.preventDefault();
            event.target.focus();
          }
        }}
        overlayClassName="bg-black/35 data-[state=open]:duration-150 dark:bg-black/65"
        className="workbench-settings-dialog max-w-none gap-0 overflow-hidden border p-0 outline-none data-[state=open]:duration-150 data-[state=open]:zoom-in-95"
        data-section={section}
      >
        <DialogTitle className="sr-only">{section === "provider" ? uiText("AI 模型") : section === "ai" ? uiText("创作助手") : section === "pi-agent" ? uiText("工具与技能") : section === "agent" ? "Coding Agent" : section === "system" ? t("settings.system.title") : t("settings.board.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("settings.categories")}</DialogDescription>
        <div className="settings-frame">
          {/* 左栏：只保留设置一级导航。 */}
          <aside className="settings-sidebar">
            <div className="settings-sidebar-heading">
              <Settings2 className="text-foreground" aria-label={t("settings.title")} />
              <span className="text-foreground">{t("settings.title")}</span>
            </div>
            <nav className="settings-navigation" aria-label={t("settings.categories")}>
              <NavItem icon={LayoutDashboard} label={t("settings.board.title")} active={section === "board"} onClick={() => requestSection("board")} />
              <NavItem icon={Sparkles} label={uiText("AI 设置")} active={aiSection} onClick={() => requestSection(lastAiSectionRef.current)} />
              <NavItem icon={Plug} label={uiText("Coding Agent")} active={section === "agent"} onClick={() => requestSection("agent")} />
              <NavItem icon={Settings2} label={t("settings.system.title")} active={section === "system"} onClick={() => requestSection("system")} />
            </nav>

            <div className="flex-1" />
          </aside>

          {/* 右栏：当前 Provider 配置或其他设置内容。 */}
          <section className="settings-workspace">
            <div className="settings-content-panel" id={aiPanelId} role={aiSection ? "tabpanel" : undefined} aria-label={aiSection ? uiText(section === "provider" ? "模型与服务" : section === "ai" ? "创作助手" : "工具与技能") : undefined}>
            {!contentReady ? null : section === "provider" ? (
              <AiModelsSettings
                ref={modelSettingsRef}
                embedded
                navigation={<AiSettingsNavigation value="provider" panelId={aiPanelId} onChange={requestSection} />}
                entryPoint={entryPoint}
                providers={providers}
                activeProviderId={activeProviderId}
                textProviders={textProviders}
                activeTextProviderId={activeTextProviderId}
                videoProviders={videoProviders}
                activeVideoProviderId={activeVideoProviderId}
                providerKeyStatus={providerKeyStatus}
                bridgeError={bridgeError}
                onSaved={onSaved}
                portalContainer={dialogPortalContainer}
              />
            ) : (
              <>
                {section !== "pi-agent" && section !== "agent" ? <SettingsPageHeader
                  title={section === "ai" ? uiText("创作助手") : section === "system" ? t("settings.system.title") : t("settings.board.title")}
                  description={uiText(section === "ai" ? "管理助手的交互方式、编辑建议和本地记忆。" : section === "system" ? "管理外观、存储、通知和应用更新。" : "调整创作操作、图片处理和画布显示。")}
                /> : null}
                {section === "ai" ? <AiSettingsNavigation value="ai" panelId={aiPanelId} onChange={requestSection} /> : null}
                <PageContainer key={section} className={cn("min-h-0 flex-1", (section === "pi-agent" || section === "agent") && "flex flex-col overflow-hidden")}>
                  <div className={cn(
                    "flex w-full flex-col",
                    section === "pi-agent" || section === "agent" ? "min-h-0 flex-1" : "settings-page-body"
                  )}>
                  {section === "pi-agent" ? (
                  <PiAgentSettingsPanel
                    navigation={<AiSettingsNavigation value="pi-agent" panelId={aiPanelId} onChange={requestSection} />}
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
                  <CodingAgentSettings
                    disabled={Boolean(bridgeError)}
                    providerReady={Boolean(providerKeyStatus[activeProviderId])}
                    onOpenModels={() => requestSection("provider")}
                    onImportBoard={onImportStarterBoard ? () => { onOpenChange(false); onImportStarterBoard(); } : undefined}
                    onOpenBoards={onOpenStarterBoards ? () => { onOpenChange(false); onOpenStarterBoards(); } : undefined}
                  />
                  ) : section === "system" ? (
                  <>
                  <SettingsGroup title={t("settings.appearance")}>
                    <SettingRow
                      stackControlOnNarrow
                      title={t("settings.language.title")}
                      description={<span className="block min-h-10">{t("settings.language.description")}</span>}
                      control={
                        <div className="settings-segmented-control" role="radiogroup" aria-label={t("settings.language.groupLabel")}>
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
                                {active ? <SegmentedControlIndicator layoutId={`settings-language-${segmentedControlId}`} className="rounded bg-card shadow-sm" /> : null}
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
                      stackControlOnNarrow
                      title={t("settings.theme.title")}
                      description={t("settings.theme.description")}
                      control={
                        <div className="settings-segmented-control" role="radiogroup" aria-label={t("settings.theme.groupLabel")}>
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
                                {active ? <SegmentedControlIndicator layoutId={`settings-theme-${segmentedControlId}`} className="rounded bg-card shadow-sm" /> : null}
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
                      <div className="settings-choice-grid settings-choice-grid--two" role="radiogroup" aria-label={t("settings.appIcon.groupLabel")}>
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
                      stackControlOnNarrow
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
                  <SettingsGroup title={uiText("使用与交互")}>
                    <SettingRow
                      interactive
                      title={uiText("显示创作助手")}
                      description={uiText("在画板输入区显示 AI 助手入口，并启用对应快捷键。")}
                      control={<Switch checked={boardAssistantEnabled} onCheckedChange={onBoardAssistantEnabledChange} />}
                    />
                    <SettingRow
                      interactive
                      disabled={!boardAssistantEnabled}
                      title={uiText("自动理解输入")}
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

                  <SettingsGroup title={uiText("图片编辑")}>
                    <SettingRow
                      interactive
                      disabled={!editSmartSuggestionsAvailable}
                      title={uiText("AI 编辑建议")}
                      description={
                        editSmartSuggestionsAvailable
                          ? uiText("进入图片编辑时自动生成修改建议。")
                          : uiText("请在“模型与服务”中配置支持图片理解的文本模型。")
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

                  <SettingsGroup title={uiText("助手记忆")}>
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
                          ? uiText("{{ui:0}} 条有效记忆 · {{ui:1}} 条来源记录{{ui:2}}", [memoryStats.activeMemoryCount, memoryStats.eventCount, memoryStats.lastOrganizedAt ? uiText(" · 最近整理 {{ui:0}}", [new Date(memoryStats.lastOrganizedAt).toLocaleDateString(locale)]) : ""])
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
                      <div className="settings-generate-options" role="radiogroup" aria-label={uiText("生成按钮样式")}>
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
                              aria-label={uiText("选择{{ui:0}}样式", [uiText(option.title)])}
                              onClick={(event) => {
                                event.stopPropagation();
                                onGenerateButtonStyleChange(option.value);
                              }}
                            >
                              {uiText("生成")}</GenerateActionButton>
                            <span className={cn(
                              "text-xs font-medium",
                              generateButtonStyle === option.value ? "text-foreground" : "text-muted-foreground"
                            )}>{uiText(option.title)}</span>
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

                  <SettingsGroup title={uiText("画板工具")}>
                    <SettingRow
                      interactive
                      title={uiText("画板评论")}
                      description={uiText("开启后显示顶部评论入口和画布评论标记，并启用 C 快捷键。")}
                      control={<Switch aria-label={uiText("画板评论")} checked={boardCommentsEnabled} onCheckedChange={onBoardCommentsEnabledChange} />}
                    />
                    <SettingRow
                      interactive
                      title={uiText("画廊")}
                      description={uiText("开启后显示顶部画廊入口，并启用 G 快捷键。")}
                      control={<Switch aria-label={uiText("画廊")} checked={boardGalleryEnabled} onCheckedChange={onBoardGalleryEnabledChange} />}
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
                      description={uiText("在画布左下角固定显示全局缩略图，位于缩放工具栏上方。")}
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
                </PageContainer>
              </>
            )}
            </div>
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
        <DialogContent className="settings-aux-dialog flex h-[min(760px,90vh)] max-w-3xl flex-col overflow-hidden p-0">
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
