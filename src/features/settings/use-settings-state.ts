import type {
  AppSettings,
  AssistantIntentSuggestionCount,
  CopyImageFormat,
  EditInfoMode,
  GenerateButtonStyle,
  ImageDoubleClickAction,
  MemoryUsageLevel,
  ProviderConfig,
  TextProviderConfig,
  VersionSeparationMode,
  VideoProviderConfig
} from "@shared/types";
import { DEFAULT_VIDEO_PROVIDER_CONFIG, DEFAULT_VIDEO_PROVIDER_ID } from "@shared/types";

import { useState } from "react";

import { COMMUNITY_TEXT_PROVIDER } from "../../../shared/community-providers";

type UiTheme = AppSettings["theme"];
export function useSettingsState(defaultProvider: ProviderConfig) {
const [providers, setProviders] = useState<ProviderConfig[]>([defaultProvider]);
const [activeProviderId, setActiveProviderId] = useState<string>(defaultProvider.id);
const [textProviders, setTextProviders] = useState<TextProviderConfig[]>([{ ...COMMUNITY_TEXT_PROVIDER }]);
const [activeTextProviderId, setActiveTextProviderId] = useState<string>(COMMUNITY_TEXT_PROVIDER.id);
const [videoProviders, setVideoProviders] = useState<VideoProviderConfig[]>([{ ...DEFAULT_VIDEO_PROVIDER_CONFIG }]);
const [activeVideoProviderId, setActiveVideoProviderId] = useState<string>(DEFAULT_VIDEO_PROVIDER_ID);
const [providerKeyStatus, setProviderKeyStatus] = useState<Record<string, boolean>>({});
const [setupComplete, setSetupComplete] = useState(false);
const [theme, setTheme] = useState<UiTheme>(() => {
    const bootTheme = new URLSearchParams(window.location.search).get("bootTheme");
    return bootTheme === "dark" || bootTheme === "light" ? bootTheme : "system";
  });
const [promptDockAutoCollapse, setPromptDockAutoCollapse] = useState(false);
const [advancedVideoModesEnabled, setAdvancedVideoModesEnabled] = useState(false);
const [canvasThumbnailPreview, setCanvasThumbnailPreview] = useState(true);
const [canvasMinimapVisible, setCanvasMinimapVisible] = useState(true);
const [canvasImageToolbarOnHover, setCanvasImageToolbarOnHover] = useState(false);
const [canvasRelationshipHoverHighlight, setCanvasRelationshipHoverHighlight] = useState(false);
const [wechatStickerExportEnabled, setWechatStickerExportEnabled] = useState(false);
const [onlineImageSharingEnabled, setOnlineImageSharingEnabled] = useState(true);
const [copyImageFormat, setCopyImageFormat] = useState<CopyImageFormat>("png");
const [boardSmartSuggestionsEnabled, setBoardSmartSuggestionsEnabled] = useState(false);
const [boardAssistantEnabled, setBoardAssistantEnabled] = useState(true);
const [boardAssistantAgentModeEnabled, setBoardAssistantAgentModeEnabled] = useState(false);
const [piAgentBuiltinTools, setPiAgentBuiltinTools] = useState<AppSettings["piAgentBuiltinTools"]>([
    "read",
    "grep",
    "find",
    "ls"
  ]);
const [piAgentIterlayTools, setPiAgentIterlayTools] = useState<string[]>([]);
const [piAgentSkillPaths, setPiAgentSkillPaths] = useState<string[]>([]);
const [piAgentExtensionPaths, setPiAgentExtensionPaths] = useState<string[]>([]);
const [piAgentCustomSkillPaths, setPiAgentCustomSkillPaths] = useState<string[]>([]);
const [piAgentCustomExtensionPaths, setPiAgentCustomExtensionPaths] = useState<string[]>([]);
const [piAgentMaxTurns, setPiAgentMaxTurns] = useState(12);
const [piAgentWebSearchMaxResults, setPiAgentWebSearchMaxResults] = useState(5);
const [boardAssistantAwarenessEnabled, setBoardAssistantAwarenessEnabled] = useState(true);
const [boardAssistantIntentSuggestionsEnabled, setBoardAssistantIntentSuggestionsEnabled] = useState(true);
const [boardAssistantIntentSuggestionCount, setBoardAssistantIntentSuggestionCount] =
    useState<AssistantIntentSuggestionCount>(3);
const [memoryEnabled, setMemoryEnabled] = useState(true);
const [memoryUsageLevel, setMemoryUsageLevel] = useState<MemoryUsageLevel>("balanced");
const [editInfoMode, setEditInfoMode] = useState<EditInfoMode>("flip");
const [imageDoubleClickAction, setImageDoubleClickAction] = useState<ImageDoubleClickAction>("edit");
const [downloadDirectory, setDownloadDirectory] = useState("");
const [versionSeparationMode, setVersionSeparationMode] = useState<VersionSeparationMode>("copy");
const [generateButtonStyle, setGenerateButtonStyle] = useState<GenerateButtonStyle>("folded");
return {
    providers,
    setProviders,
    activeProviderId,
    setActiveProviderId,
    textProviders,
    setTextProviders,
    activeTextProviderId,
    setActiveTextProviderId,
    videoProviders,
    setVideoProviders,
    activeVideoProviderId,
    setActiveVideoProviderId,
    providerKeyStatus,
    setProviderKeyStatus,
    setupComplete,
    setSetupComplete,
    theme,
    setTheme,
    promptDockAutoCollapse,
    setPromptDockAutoCollapse,
    advancedVideoModesEnabled,
    setAdvancedVideoModesEnabled,
    canvasThumbnailPreview,
    setCanvasThumbnailPreview,
    canvasMinimapVisible,
    setCanvasMinimapVisible,
    canvasImageToolbarOnHover,
    setCanvasImageToolbarOnHover,
    canvasRelationshipHoverHighlight,
    setCanvasRelationshipHoverHighlight,
    wechatStickerExportEnabled,
    setWechatStickerExportEnabled,
    onlineImageSharingEnabled,
    setOnlineImageSharingEnabled,
    copyImageFormat,
    setCopyImageFormat,
    boardSmartSuggestionsEnabled,
    setBoardSmartSuggestionsEnabled,
    boardAssistantEnabled,
    setBoardAssistantEnabled,
    boardAssistantAgentModeEnabled,
    setBoardAssistantAgentModeEnabled,
    piAgentBuiltinTools,
    setPiAgentBuiltinTools,
    piAgentIterlayTools,
    setPiAgentIterlayTools,
    piAgentSkillPaths,
    setPiAgentSkillPaths,
    piAgentExtensionPaths,
    setPiAgentExtensionPaths,
    piAgentCustomSkillPaths,
    setPiAgentCustomSkillPaths,
    piAgentCustomExtensionPaths,
    setPiAgentCustomExtensionPaths,
    piAgentMaxTurns,
    setPiAgentMaxTurns,
    piAgentWebSearchMaxResults,
    setPiAgentWebSearchMaxResults,
    boardAssistantAwarenessEnabled,
    setBoardAssistantAwarenessEnabled,
    boardAssistantIntentSuggestionsEnabled,
    setBoardAssistantIntentSuggestionsEnabled,
    boardAssistantIntentSuggestionCount,
    setBoardAssistantIntentSuggestionCount,
    memoryEnabled,
    setMemoryEnabled,
    memoryUsageLevel,
    setMemoryUsageLevel,
    editInfoMode,
    setEditInfoMode,
    imageDoubleClickAction,
    setImageDoubleClickAction,
    downloadDirectory,
    setDownloadDirectory,
    versionSeparationMode,
    setVersionSeparationMode,
    generateButtonStyle,
    setGenerateButtonStyle
  };
}
export type SettingsState = ReturnType<typeof useSettingsState>;
