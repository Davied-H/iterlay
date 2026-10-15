import type { SettingsState } from "./use-settings-state";
import { translateSourceText } from "@/i18n/ui-text";

import { type GeneratedImage } from "@/components/canvas/image-node-model";

import { canUseTextAgent } from "@/lib/text-provider-readiness";

import { selectProviderModel } from "@shared/provider-models";
import type {
  AppSettings,
  AppSettingsPatch,
  AssistantIntentSuggestionCount,
  CopyImageFormat,
  EditInfoMode,
  GenerateButtonStyle,
  GenerateImageInput,
  ImageDoubleClickAction,
  MemoryUsageLevel,
  ProviderConfig,
  TextProviderConfig,
  VersionSeparationMode,
  VideoProviderConfig
} from "@shared/types";

import { toast } from "sonner";

import type { Dispatch, SetStateAction } from "react";
import type { AppLanguage } from "@shared/i18n";
import type { ImageWorkbenchApi } from "@shared/workbench-client";
type UiTheme = AppSettings["theme"];
export interface SettingsActionDependencies {
  settings: SettingsState;
  getWorkbenchApi: () => ImageWorkbenchApi | null;
  reportWorkbenchError: (error: unknown) => void;
  setInput: Dispatch<SetStateAction<GenerateImageInput>>;
  setLanguage: (language: AppLanguage) => void;
  language: AppLanguage;
  editSmartSuggestionsPreference: boolean | undefined;
  hydrateVideoProviderCatalogs: (providersToHydrate: VideoProviderConfig[]) => Promise<VideoProviderConfig[]>;
  setStatus: (message: string) => void;
  setWechatExportRequest: Dispatch<SetStateAction<{ images: GeneratedImage[]; mode: "personal" | "album"; } | null>>;
  setQuickImageShareImages: Dispatch<SetStateAction<GeneratedImage[] | null>>;
  activeTextProvider: TextProviderConfig;
  setEditSmartSuggestionsPreference: Dispatch<SetStateAction<boolean | undefined>>;
}
export function createSettingsActions(dependencies: SettingsActionDependencies) {
 const {
  settings,
  getWorkbenchApi,
  reportWorkbenchError,
  setInput,
  setLanguage,
  language,
  editSmartSuggestionsPreference,
  hydrateVideoProviderCatalogs,
  setStatus,
  setWechatExportRequest,
  setQuickImageShareImages,
  activeTextProvider,
  setEditSmartSuggestionsPreference
} = dependencies;
  const {
  setSetupComplete,
  providers,
  setProviders,
  setActiveProviderId,
  setTheme,
  theme,
  promptDockAutoCollapse,
  advancedVideoModesEnabled,
  canvasThumbnailPreview,
  canvasMinimapVisible,
  canvasImageToolbarOnHover,
  canvasRelationshipHoverHighlight,
  wechatStickerExportEnabled,
  onlineImageSharingEnabled,
  copyImageFormat,
  boardSmartSuggestionsEnabled,
  memoryEnabled,
  memoryUsageLevel,
  editInfoMode,
  imageDoubleClickAction,
  downloadDirectory,
  versionSeparationMode,
  generateButtonStyle,
  setTextProviders,
  setActiveTextProviderId,
  setVideoProviders,
  setActiveVideoProviderId,
  setProviderKeyStatus,
  setPromptDockAutoCollapse,
  setAdvancedVideoModesEnabled,
  setCanvasThumbnailPreview,
  setCanvasMinimapVisible,
  setCanvasImageToolbarOnHover,
  setCanvasRelationshipHoverHighlight,
  setBoardSmartSuggestionsEnabled,
  setWechatStickerExportEnabled,
  setOnlineImageSharingEnabled,
  setCopyImageFormat,
  setBoardAssistantIntentSuggestionsEnabled,
  setBoardAssistantAwarenessEnabled,
  setBoardAssistantEnabled,
  providerKeyStatus,
  setBoardAssistantAgentModeEnabled,
  setPiAgentBuiltinTools,
  setPiAgentIterlayTools,
  setPiAgentSkillPaths,
  setPiAgentExtensionPaths,
  setPiAgentCustomSkillPaths,
  setPiAgentCustomExtensionPaths,
  setPiAgentMaxTurns,
  setPiAgentWebSearchMaxResults,
  setBoardAssistantIntentSuggestionCount,
  setMemoryEnabled,
  setMemoryUsageLevel,
  setEditInfoMode,
  setImageDoubleClickAction,
  setVersionSeparationMode,
  setGenerateButtonStyle
} = settings;
function persistSettingsPatch(patch: AppSettingsPatch): void {
    const api = getWorkbenchApi();
    if (!api) return;
    void api
      .updateSettings(patch)
      .then(() => setSetupComplete(true))
      .catch(reportWorkbenchError);
  }

function selectActiveProvider(id: string, model?: string): void {
    const target = providers.find((p) => p.id === id);
    if (!target) return;
    const nextTarget = model ? selectProviderModel(target, model) : target;
    const nextProviders = providers.map((provider) => provider.id === id ? nextTarget : provider);
    setProviders(nextProviders);
    setActiveProviderId(id);
    setInput((current) => ({
      ...current,
      model: nextTarget.model,
      size: current.size
    }));
    persistSettingsPatch({ providers: nextProviders, activeProviderId: id });
  }

function changeTheme(next: UiTheme, _origin?: { x: number; y: number }): void {
    void _origin;
    setTheme(next);
    persistSettingsPatch({ theme: next });
  }

function changeLanguage(next: AppSettings["language"]): void {
    setLanguage(next);
    persistSettingsPatch({ language: next });
  }

async function persistProviders(next: {
    providers: ProviderConfig[];
    activeProviderId: string;
    textProviders: TextProviderConfig[];
    activeTextProviderId: string;
    videoProviders: VideoProviderConfig[];
    activeVideoProviderId: string;
    apiKeyByProviderId?: Record<string, string>;
  }): Promise<void> {
    const api = getWorkbenchApi();
    if (!api) return;
    try {
      await api.saveSettings({
        providers: next.providers,
        activeProviderId: next.activeProviderId,
        textProviders: next.textProviders,
        activeTextProviderId: next.activeTextProviderId,
        videoProviders: next.videoProviders,
        activeVideoProviderId: next.activeVideoProviderId,
        language,
        theme,
        promptDockAutoCollapse,
        advancedVideoModesEnabled,
        canvasThumbnailPreview,
        canvasMinimapVisible,
        canvasImageToolbarOnHover,
        canvasRelationshipHoverHighlight,
        wechatStickerExportEnabled,
        onlineImageSharingEnabled,
        copyImageFormat,
        boardSmartSuggestionsEnabled,
        editSmartSuggestionsEnabled: editSmartSuggestionsPreference,
        memoryEnabled,
        memoryUsageLevel,
        editInfoMode,
        imageDoubleClickAction,
        downloadDirectory,
        versionSeparationMode,
        generateButtonStyle,
        apiKeyByProviderId: next.apiKeyByProviderId
      });
      const fresh = await api.getSettings();
      setProviders(fresh.providers);
      setActiveProviderId(fresh.activeProviderId);
      setTextProviders(fresh.textProviders);
      setActiveTextProviderId(fresh.activeTextProviderId);
      const freshVideoProviders = fresh.videoProviders;
      setVideoProviders(await hydrateVideoProviderCatalogs(freshVideoProviders));
      setActiveVideoProviderId(fresh.activeVideoProviderId);
      setProviderKeyStatus(fresh.providerKeyStatus);
      setSetupComplete(true);
      const active = fresh.providers.find((p) => p.id === fresh.activeProviderId) ?? fresh.providers[0];
      if (active) setInput((current) => ({ ...current, model: active.model }));
      setStatus("配置已保存。");
      toast.success(translateSourceText("配置已保存"));
    } catch (error) {
      reportWorkbenchError(error);
    }
  }

function changePromptDockAutoCollapse(next: boolean): void {
    setPromptDockAutoCollapse(next);
    persistSettingsPatch({ promptDockAutoCollapse: next });
  }

function changeAdvancedVideoModesEnabled(next: boolean): void {
    setAdvancedVideoModesEnabled(next);
    persistSettingsPatch({ advancedVideoModesEnabled: next });
  }

function changeCanvasThumbnailPreview(next: boolean): void {
    setCanvasThumbnailPreview(next);
    persistSettingsPatch({ canvasThumbnailPreview: next });
  }

function changeCanvasMinimapVisible(next: boolean): void {
    setCanvasMinimapVisible(next);
    persistSettingsPatch({ canvasMinimapVisible: next });
  }

function changeCanvasImageToolbarOnHover(next: boolean): void {
    setCanvasImageToolbarOnHover(next);
    persistSettingsPatch({ canvasImageToolbarOnHover: next });
  }

function changeCanvasRelationshipHoverHighlight(next: boolean): void {
    setCanvasRelationshipHoverHighlight(next);
    persistSettingsPatch({ canvasRelationshipHoverHighlight: next });
  }

function changeBoardSmartSuggestionsEnabled(next: boolean): void {
    setBoardSmartSuggestionsEnabled(next);
    persistSettingsPatch({ boardSmartSuggestionsEnabled: next });
  }

function changeWechatStickerExportEnabled(next: boolean): void {
    setWechatStickerExportEnabled(next);
    if (!next) setWechatExportRequest(null);
    persistSettingsPatch({ wechatStickerExportEnabled: next });
  }

function changeOnlineImageSharingEnabled(next: boolean): void {
    setOnlineImageSharingEnabled(next);
    if (!next) setQuickImageShareImages(null);
    persistSettingsPatch({ onlineImageSharingEnabled: next });
  }

function changeCopyImageFormat(next: CopyImageFormat): void {
    setCopyImageFormat(next);
    persistSettingsPatch({ copyImageFormat: next });
  }

function changeBoardAssistantIntentSuggestionsEnabled(next: boolean): void {
    setBoardAssistantIntentSuggestionsEnabled(next);
    persistSettingsPatch({ boardAssistantIntentSuggestionsEnabled: next });
  }

function changeBoardAssistantAwarenessEnabled(next: boolean): void {
    setBoardAssistantAwarenessEnabled(next);
    persistSettingsPatch({ boardAssistantAwarenessEnabled: next });
  }

function changeBoardAssistantEnabled(next: boolean): void {
    setBoardAssistantEnabled(next);
    persistSettingsPatch({ boardAssistantEnabled: next });
  }

function changeBoardAssistantAgentModeEnabled(next: boolean): void {
    const enabled = next && canUseTextAgent(activeTextProvider, providerKeyStatus);
    setBoardAssistantAgentModeEnabled(enabled);
    persistSettingsPatch({
      assistantAgentModeEnabled: enabled,
      boardAssistantAgentModeEnabled: enabled
    });
  }

function changePiAgentBuiltinTools(next: NonNullable<AppSettings["piAgentBuiltinTools"]>): void {
    setPiAgentBuiltinTools(next);
    persistSettingsPatch({ piAgentBuiltinTools: next });
  }

function changePiAgentIterlayTools(next: string[]): void {
    setPiAgentIterlayTools(next);
    persistSettingsPatch({ piAgentIterlayTools: next });
  }

function changePiAgentSkillPaths(next: string[]): void {
    setPiAgentSkillPaths(next);
    persistSettingsPatch({ piAgentSkillPaths: next });
  }

function changePiAgentExtensionPaths(next: string[]): void {
    setPiAgentExtensionPaths(next);
    persistSettingsPatch({ piAgentExtensionPaths: next });
  }

function changePiAgentCustomSkillPaths(next: string[]): void {
    setPiAgentCustomSkillPaths(next);
    persistSettingsPatch({ piAgentCustomSkillPaths: next });
  }

function changePiAgentCustomExtensionPaths(next: string[]): void {
    setPiAgentCustomExtensionPaths(next);
    persistSettingsPatch({ piAgentCustomExtensionPaths: next });
  }

function changePiAgentMaxTurns(next: number): void {
    setPiAgentMaxTurns(next);
    persistSettingsPatch({ piAgentMaxTurns: next });
  }

function changePiAgentWebSearchMaxResults(next: number): void {
    setPiAgentWebSearchMaxResults(next);
    persistSettingsPatch({ piAgentWebSearchMaxResults: next });
  }

function changeBoardAssistantIntentSuggestionCount(next: AssistantIntentSuggestionCount): void {
    setBoardAssistantIntentSuggestionCount(next);
    persistSettingsPatch({ boardAssistantIntentSuggestionCount: next });
  }

function changeEditSmartSuggestionsEnabled(next: boolean): void {
    setEditSmartSuggestionsPreference(next);
    persistSettingsPatch({ editSmartSuggestionsEnabled: next });
  }

function persistMemoryPreferences(enabled: boolean, usageLevel: MemoryUsageLevel): void {
    setMemoryEnabled(enabled);
    setMemoryUsageLevel(usageLevel);
    persistSettingsPatch({
      memoryEnabled: enabled,
      memoryUsageLevel: usageLevel
    });
  }

function changeMemoryEnabled(next: boolean): void {
    persistMemoryPreferences(next, memoryUsageLevel);
  }

function changeMemoryUsageLevel(next: MemoryUsageLevel): void {
    persistMemoryPreferences(memoryEnabled, next);
  }

function changeEditInfoMode(next: EditInfoMode): void {
    setEditInfoMode(next);
    persistSettingsPatch({ editInfoMode: next });
  }

function changeImageDoubleClickAction(next: ImageDoubleClickAction): void {
    setImageDoubleClickAction(next);
    persistSettingsPatch({ imageDoubleClickAction: next });
  }

function changeVersionSeparationMode(next: VersionSeparationMode): void {
    setVersionSeparationMode(next);
    persistSettingsPatch({ versionSeparationMode: next });
  }

function changeGenerateButtonStyle(next: GenerateButtonStyle): void {
    setGenerateButtonStyle(next);
    persistSettingsPatch({ generateButtonStyle: next });
  }
return {
    persistSettingsPatch,
    selectActiveProvider,
    changeTheme,
    changeLanguage,
    persistProviders,
    changePromptDockAutoCollapse,
    changeAdvancedVideoModesEnabled,
    changeCanvasThumbnailPreview,
    changeCanvasMinimapVisible,
    changeCanvasImageToolbarOnHover,
    changeCanvasRelationshipHoverHighlight,
    changeBoardSmartSuggestionsEnabled,
    changeWechatStickerExportEnabled,
    changeOnlineImageSharingEnabled,
    changeCopyImageFormat,
    changeBoardAssistantIntentSuggestionsEnabled,
    changeBoardAssistantAwarenessEnabled,
    changeBoardAssistantEnabled,
    changeBoardAssistantAgentModeEnabled,
    changePiAgentBuiltinTools,
    changePiAgentIterlayTools,
    changePiAgentSkillPaths,
    changePiAgentExtensionPaths,
    changePiAgentCustomSkillPaths,
    changePiAgentCustomExtensionPaths,
    changePiAgentMaxTurns,
    changePiAgentWebSearchMaxResults,
    changeBoardAssistantIntentSuggestionCount,
    changeEditSmartSuggestionsEnabled,
    persistMemoryPreferences,
    changeMemoryEnabled,
    changeMemoryUsageLevel,
    changeEditInfoMode,
    changeImageDoubleClickAction,
    changeVersionSeparationMode,
    changeGenerateButtonStyle
  };
}
