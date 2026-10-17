import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { AppSettings, AppSettingsPatch, CodexAuthStatus, OnboardingState, OnboardingStatus } from "../shared/types.js";
import { CodexOAuthService } from "./auth/codex-oauth.js";
import { OnboardingStore } from "./storage/onboarding-store.js";
import { SettingsStore } from "./storage/settings-store.js";

type SettingsPayload = AppSettings & { apiKeyByProviderId?: Record<string, string> };

interface SettingsIpcDependencies {
  settings: SettingsStore;
  onboarding: OnboardingStore;
  codexAuth: CodexOAuthService;
  onOnboardingCompleted: (key: string) => void;
  onBoardTrashRetentionChanged: () => void;
  onThemeChanged: (event: IpcMainInvokeEvent, theme: AppSettings["theme"]) => void;
  trackSettingsUpdated: () => void;
}

export function registerSettingsIpc({
  settings,
  onboarding,
  codexAuth,
  onOnboardingCompleted,
  onBoardTrashRetentionChanged,
  onThemeChanged,
  trackSettingsUpdated
}: SettingsIpcDependencies): void {
  ipcMain.handle("settings:get", () => {
    const current = settings.getSettings();
    const providerKeyStatus = settings.getKeyStatus();
    const codexAuthStatusByProviderId: Record<string, CodexAuthStatus> = {};
    for (const providerConfig of current.providers) {
      if (providerConfig.type !== "codex-oauth") continue;
      const status = codexAuth.getStatus(providerConfig.id);
      codexAuthStatusByProviderId[providerConfig.id] = status;
      providerKeyStatus[providerConfig.id] = status.state === "connected" || status.state === "refreshing";
    }
    for (const textProvider of current.textProviders) {
      if (textProvider.type !== "codex-oauth") continue;
      const authProviderId = textProvider.authProviderId || textProvider.id;
      const status = codexAuthStatusByProviderId[authProviderId] ?? codexAuth.getStatus(authProviderId);
      codexAuthStatusByProviderId[authProviderId] = status;
      providerKeyStatus[textProvider.id] = status.state === "connected" || status.state === "refreshing";
    }
    return {
      ...current,
      providerKeyStatus,
      codexAuthStatusByProviderId,
      setupComplete: settings.hasSavedSettings()
    };
  });

  ipcMain.handle("onboarding:get", (_event, legacyState?: OnboardingState) =>
    onboarding.getState(legacyState)
  );
  ipcMain.handle("onboarding:mark", async (_event, key: string, status: OnboardingStatus) => {
    const state = await onboarding.markSeen(key, status);
    if (status === "completed") onOnboardingCompleted(key);
    return state;
  });
  ipcMain.handle("onboarding:clear", (_event, key: string) => onboarding.clearSeen(key));

  ipcMain.handle("settings:save", async (event, payload: SettingsPayload) => {
    await settings.transaction(() => {
    settings.saveSettings({
      providers: payload.providers,
      activeProviderId: payload.activeProviderId,
      textProviders: payload.textProviders,
      activeTextProviderId: payload.activeTextProviderId,
      videoProviders: payload.videoProviders,
      activeVideoProviderId: payload.activeVideoProviderId,
      language: payload.language,
      theme: payload.theme,
      promptDockAutoCollapse: payload.promptDockAutoCollapse ?? false,
      canvasThumbnailPreview: Boolean(payload.canvasThumbnailPreview),
      canvasMinimapVisible: payload.canvasMinimapVisible,
      canvasImageToolbarOnHover: payload.canvasImageToolbarOnHover,
      wechatStickerExportEnabled: payload.wechatStickerExportEnabled,
      copyImageFormat: payload.copyImageFormat,
      boardSmartSuggestionsEnabled: payload.boardSmartSuggestionsEnabled,
      boardAssistantEnabled: payload.boardAssistantEnabled,
      boardAssistantAgentModeEnabled: payload.boardAssistantAgentModeEnabled,
      assistantAgentModeEnabled: payload.assistantAgentModeEnabled,
      piAgentBuiltinTools: payload.piAgentBuiltinTools,
      piAgentIterlayTools: payload.piAgentIterlayTools,
      piAgentSkillPaths: payload.piAgentSkillPaths,
      piAgentExtensionPaths: payload.piAgentExtensionPaths,
      piAgentCustomSkillPaths: payload.piAgentCustomSkillPaths,
      piAgentCustomExtensionPaths: payload.piAgentCustomExtensionPaths,
      piAgentMaxTurns: payload.piAgentMaxTurns,
      piAgentWebSearchMaxResults: payload.piAgentWebSearchMaxResults,
      boardAssistantAwarenessEnabled: payload.boardAssistantAwarenessEnabled,
      boardAssistantIntentSuggestionsEnabled: payload.boardAssistantIntentSuggestionsEnabled,
      boardAssistantIntentSuggestionCount: payload.boardAssistantIntentSuggestionCount,
      editSmartSuggestionsEnabled: payload.editSmartSuggestionsEnabled,
      memoryEnabled: payload.memoryEnabled,
      memoryUsageLevel: payload.memoryUsageLevel,
      editInfoMode: payload.editInfoMode,
      imageDoubleClickAction: payload.imageDoubleClickAction,
      downloadDirectory: payload.downloadDirectory,
      cliDefaultBoardId: payload.cliDefaultBoardId,
      versionSeparationMode: payload.versionSeparationMode,
      generateButtonStyle: payload.generateButtonStyle,
      appIcon: payload.appIcon,
      boardTrashRetentionDays: payload.boardTrashRetentionDays
    });
    if (payload.apiKeyByProviderId) {
      for (const [providerId, apiKey] of Object.entries(payload.apiKeyByProviderId)) {
        if (typeof apiKey === "string") settings.setApiKey(providerId, apiKey);
      }
    }
    });
    if (payload.boardTrashRetentionDays !== undefined) onBoardTrashRetentionChanged();
    trackSettingsUpdated();
    onThemeChanged(event, payload.theme);
    codexAuth.retainProviders(new Set(
      [
        ...payload.providers
          .filter((providerConfig) => providerConfig.type === "codex-oauth")
          .map((providerConfig) => providerConfig.id),
        ...payload.textProviders
          .filter((textProvider) => textProvider.type === "codex-oauth")
          .map((textProvider) => textProvider.authProviderId || textProvider.id)
      ]
    ));
    return { ok: true };
  });

  ipcMain.handle("settings:update", async (event, patch: AppSettingsPatch) => {
    await settings.transaction(() => settings.updateSettings(patch));
    if (patch.boardTrashRetentionDays !== undefined) onBoardTrashRetentionChanged();
    if (patch.theme) onThemeChanged(event, patch.theme);
    return { ok: true };
  });
}
