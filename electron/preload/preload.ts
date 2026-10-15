import { contextBridge, ipcRenderer } from "electron";
import type {
  AnalyzeSliceSubjectsRequest,
  AnalyzeSliceSubjectsResult,
  AssistantConversationHistoryQuery,
  AssistantConversationRecord,
  AssistantMemoryDetail,
  AssistantMemoryGenerationResult,
  AssistantMemoryStats,
  AssistantMemoryContextItem,
  AssistantMemoryQuery,
  AssistantSurface,
  AppIconPreference,
  AppIconLibrary,
  AppSettings,
  AppSettingsPatch,
  AssetComment,
  AssetDetailData,
  AssetLibraryItem,
  AssetLibraryPage,
  AssetTagInfo,
  BoardData,
  BoardDetail,
  BoardNodeVersion,
  BoardSavePayload,
  BoardSummary,
  TrashedBoardSummary,
  TrashedBoardImage,
  RestoreTrashedBoardImageResult,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  CollaborateSceneStreamEvent,
  CodexAuthStatus,
  CreditLedgerEntry,
  CreditStatus,
  EnhancePromptRequest,
  EnhancePromptResult,
  FalModelCategory,
  FalModelOption,
  GenerateImageInput,
  GenerateResponse,
  GenerationJob,
  GiftActivationOverview,
  JobPromptInfo,
  OnboardingState,
  OnboardingStatus,
  OnlineImageShareRequest,
  OnlineShareImportData,
  OnlineShareCanvasOrigin,
  OnlineShareSession,
  PaidMediaQuote,
  PaidMediaQuoteRequest,
  ProviderConfig,
  ProviderModelOption,
  VideoProviderModelOption,
  ReferralOverview,
  SceneCoverFocus,
  SceneMediaSummary,
  SceneTemplateData,
  SceneTemplateImportResult,
  TemplateSubmissionResult,
  SaveWechatStickerPackageRequest,
  SaveWechatStickerPackageResult,
  SliceImageRequest,
  SliceImageResult,
  SuggestAssistantIntentsRequest,
  SuggestAssistantIntentsResult,
  SuggestImageEditsRequest,
  SuggestImageEditsResult,
  SystemNotificationDeliveryResult,
  TextProviderConfig,
  VideoProviderConfig,
  UploadAppIconRequest,
  UnpositionedBoardNode,
  VideoGenerationInput,
  VideoGenerationJob,
  VideoProviderCapabilities,
  WriteClipboardImageRequest
} from "../../shared/types.js";
import {
  GENERATION_NOTIFICATION_OPEN_CHANNEL,
  type GenerationNotificationTarget
} from "../../shared/system-notification.js";
import {
  SCENE_COLLABORATION_CANCEL_CHANNEL,
  SCENE_COLLABORATION_EVENT_CHANNEL,
  SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL,
  SCENE_COLLABORATION_START_CHANNEL
} from "../../shared/assistant.js";
import type { LicenseStatusSnapshot } from "../../shared/licensing.js";
import type { InspirationSource } from "../../shared/inspiration-sources.js";
import type {
  FeedbackDetail,
  FeedbackHistoryPage,
  FeedbackSubmitRequest,
  FeedbackSubmissionResult
} from "../../shared/feedback.js";
import type {
  MasterGoConnectionState,
  MasterGoReconstructionPreparation,
  MasterGoReconstructionRequest,
  MasterGoReconstructionTask,
  PrepareMasterGoReconstructionRequest
} from "../../shared/mastergo-reconstruction.js";
import {
  PI_AGENT_LOG_EVENT_CHANNEL,
  type PiAgentLogEntry,
  type PiAgentLogSnapshot
} from "../../shared/pi-agent-log.js";
import { UPDATE_STATE_CHANNEL, type UpdateChannel, type UpdateStateSnapshot } from "../../shared/app-update.js";
import {
  ITERLAY_DEEP_LINK_CHANNEL,
  ITERLAY_DEEP_LINK_READY_CHANNEL
} from "../../shared/deep-link.js";
import type { McpSkillUpgradeDetail } from "../../shared/mcp-integration.js";
import type {
  AssistantSkillDetail,
  AssistantSkillSummary,
  PiAgentResourceDetail,
  PiAgentResourceInventory
} from "../../shared/types.js";
import {
  COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL,
  COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL,
  type BoardMutationPlan,
  type BoardMutationResult,
  type ComicDramaBoardSnapshot
} from "../../shared/comic-drama.js";
import { VIDEO_SEQUENCE_EVENT_CHANNEL } from "../../shared/video-sequence.js";
import { MEDIA_TOOLS_STATE_CHANNEL, type MediaToolsState } from "../../shared/media-tools.js";
import type {
  VideoSequence,
  VideoSequenceExportJob,
  VideoSequenceTask,
  VideoSequenceTemplate
} from "../video-sequence-types.js";

const api = {
  activateDeepLinks: () =>
    ipcRenderer.invoke(ITERLAY_DEEP_LINK_READY_CHANNEL) as Promise<string[]>,
  onDeepLink: (listener: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => listener(url);
    ipcRenderer.on(ITERLAY_DEEP_LINK_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(ITERLAY_DEEP_LINK_CHANNEL, handler);
    };
  },
  getUpdateState: () => ipcRenderer.invoke("update:getState") as Promise<UpdateStateSnapshot>,
  checkForUpdates: () => ipcRenderer.invoke("update:check") as Promise<UpdateStateSnapshot>,
  downloadUpdate: () => ipcRenderer.invoke("update:download") as Promise<UpdateStateSnapshot>,
  cancelUpdateDownload: () => ipcRenderer.invoke("update:cancelDownload") as Promise<UpdateStateSnapshot>,
  installUpdate: () => ipcRenderer.invoke("update:install") as Promise<UpdateStateSnapshot>,
  dismissInstalledRelease: () =>
    ipcRenderer.invoke("update:dismissInstalledRelease") as Promise<UpdateStateSnapshot>,
  skipUpdateVersion: (version: string) =>
    ipcRenderer.invoke("update:skipVersion", version) as Promise<UpdateStateSnapshot>,
  setUpdateChannel: (channel: UpdateChannel) =>
    ipcRenderer.invoke("update:setChannel", channel) as Promise<UpdateStateSnapshot>,
  onUpdateState: (listener: (snapshot: UpdateStateSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: UpdateStateSnapshot): void => listener(snapshot);
    ipcRenderer.on(UPDATE_STATE_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, handler);
    };
  },
  getLicenseStatus: () => ipcRenderer.invoke("license:getStatus") as Promise<LicenseStatusSnapshot>,
  startLicenseTrial: () => ipcRenderer.invoke("license:startTrial") as Promise<LicenseStatusSnapshot>,
  activateLicense: (email: string, licenseKey: string) =>
    ipcRenderer.invoke("license:activate", email, licenseKey) as Promise<LicenseStatusSnapshot>,
  checkLicense: () => ipcRenderer.invoke("license:check") as Promise<LicenseStatusSnapshot>,
  deactivateLicense: () => ipcRenderer.invoke("license:deactivate") as Promise<LicenseStatusSnapshot>,
  openLicensePortal: () => ipcRenderer.invoke("license:openPortal") as Promise<void>,
  openInspirationSource: (sourceId: string) =>
    ipcRenderer.invoke("inspiration:open", sourceId) as Promise<void>,
  listInspirationSources: () => ipcRenderer.invoke("inspiration:list") as Promise<InspirationSource[]>,
  getCreditStatus: () => ipcRenderer.invoke("credits:getStatus") as Promise<CreditStatus>,
  listCreditTransactions: (limit?: number) =>
    ipcRenderer.invoke("credits:listTransactions", limit) as Promise<CreditLedgerEntry[]>,
  getReferralOverview: () =>
    ipcRenderer.invoke("referrals:getOverview") as Promise<ReferralOverview>,
  getGiftActivationOverview: () =>
    ipcRenderer.invoke("giftActivations:getOverview") as Promise<GiftActivationOverview>,
  recordGiftActivationShare: (codeId: string) =>
    ipcRenderer.invoke("giftActivations:recordShare", codeId) as Promise<void>,
  submitFeedback: (request: FeedbackSubmitRequest) =>
    ipcRenderer.invoke("feedback:submit", request) as Promise<FeedbackSubmissionResult>,
  listFeedbackHistory: (limit?: number) =>
    ipcRenderer.invoke("feedback:listHistory", limit) as Promise<FeedbackHistoryPage>,
  getFeedbackDetail: (feedbackId: string) =>
    ipcRenderer.invoke("feedback:getDetail", feedbackId) as Promise<FeedbackDetail>,
  deleteFeedback: (feedbackId: string) =>
    ipcRenderer.invoke("feedback:delete", feedbackId) as Promise<void>,
  getSettings: () =>
    ipcRenderer.invoke("settings:get") as Promise<
      AppSettings & {
        providerKeyStatus: Record<string, boolean>;
        codexAuthStatusByProviderId: Record<string, CodexAuthStatus>;
        setupComplete: boolean;
      }
    >,
  saveSettings: (settings: AppSettings & { apiKeyByProviderId?: Record<string, string> }) =>
    ipcRenderer.invoke("settings:save", settings),
  updateSettings: (patch: AppSettingsPatch) => ipcRenderer.invoke("settings:update", patch),
  getMcpIntegrationStatus: () => ipcRenderer.invoke("mcp:integration:status") as Promise<{
    clients: Array<{
      id: "codex" | "claude-code";
      configured: boolean;
      configPath: string;
      skillInstalled: boolean;
      skillPath: string;
    }>;
  }>,
  consumeMcpSkillUpgrades: () =>
    ipcRenderer.invoke("mcp:skill-upgrade:consume") as Promise<McpSkillUpgradeDetail[]>,
  getPiAgentLogs: () =>
    ipcRenderer.invoke("pi-agent-log:list") as Promise<PiAgentLogSnapshot>,
  getPiAgentResources: () =>
    ipcRenderer.invoke("pi-agent:resources:list") as Promise<PiAgentResourceInventory>,
  getPiAgentResourceDetail: (resourcePath: string) =>
    ipcRenderer.invoke("pi-agent:resources:read", resourcePath) as Promise<PiAgentResourceDetail>,
  listAssistantSkills: () =>
    ipcRenderer.invoke("assistant-skills:list") as Promise<AssistantSkillSummary[]>,
  getAssistantSkill: (id: string) =>
    ipcRenderer.invoke("assistant-skills:get", id) as Promise<AssistantSkillDetail>,
  saveAssistantSkill: (id: string, content: string) =>
    ipcRenderer.invoke("assistant-skills:save", id, content) as Promise<AssistantSkillDetail>,
  resetAssistantSkill: (id: string) =>
    ipcRenderer.invoke("assistant-skills:reset", id) as Promise<AssistantSkillDetail>,
  clearPiAgentLogs: () =>
    ipcRenderer.invoke("pi-agent-log:clear") as Promise<{ ok: true }>,
  openPiAgentLogDirectory: () =>
    ipcRenderer.invoke("pi-agent-log:openDirectory") as Promise<{ ok: true }>,
  onPiAgentLog: (listener: (entry: PiAgentLogEntry) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: PiAgentLogEntry): void => listener(entry);
    ipcRenderer.on(PI_AGENT_LOG_EVENT_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(PI_AGENT_LOG_EVENT_CHANNEL, handler);
    };
  },
  getMasterGoConnection: (force = false) =>
    ipcRenderer.invoke("mastergo:getConnection", force) as Promise<MasterGoConnectionState>,
  openMasterGoSetup: (target: "download" | "guide") =>
    ipcRenderer.invoke("mastergo:openSetup", target) as Promise<void>,
  prepareMasterGoReconstruction: (request: PrepareMasterGoReconstructionRequest) =>
    ipcRenderer.invoke("mastergo:prepareReconstruction", request) as Promise<MasterGoReconstructionPreparation>,
  startMasterGoReconstruction: (request: MasterGoReconstructionRequest, textProviderId?: string) =>
    ipcRenderer.invoke("mastergo:startReconstruction", request, textProviderId) as Promise<MasterGoReconstructionTask>,
  getMasterGoReconstructionTask: (id: string) =>
    ipcRenderer.invoke("mastergo:getReconstructionTask", id) as Promise<MasterGoReconstructionTask>,
  cancelMasterGoReconstructionTask: (id: string) =>
    ipcRenderer.invoke("mastergo:cancelReconstructionTask", id) as Promise<MasterGoReconstructionTask>,
  readMasterGoLayerAsset: (path: string) =>
    ipcRenderer.invoke("mastergo:readLayerAsset", path) as Promise<string>,
  downloadMasterGoHtml: (input: { frameName: string; html: string }) =>
    ipcRenderer.invoke("mastergo:downloadHtml", input) as Promise<{ ok: boolean; path?: string }>,
  downloadMasterGoLayers: (input: { frameName: string; layers: Array<{ name: string; path: string }> }) =>
    ipcRenderer.invoke("mastergo:downloadLayers", input) as Promise<{ ok: boolean; path?: string; count?: number }>,
  exportMasterGoPsd: (input: {
    frameName: string;
    canvas: { width: number; height: number };
    layers: Array<{ name: string; path: string; x: number; y: number; width: number; height: number }>;
  }) => ipcRenderer.invoke("mastergo:exportPsd", input) as Promise<{ ok: boolean; path?: string }>,
  renderMasterGoEditedHtml: (taskId: string, html: string) =>
    ipcRenderer.invoke("mastergo:renderEditedHtml", taskId, html) as Promise<string>,
  configureMcpClient: (client: "codex" | "claude-code") =>
    ipcRenderer.invoke("mcp:integration:configure", client) as Promise<{
      clients: Array<{
        id: "codex" | "claude-code";
        configured: boolean;
        configPath: string;
        skillInstalled: boolean;
        skillPath: string;
      }>;
    }>,
  installMcpSkill: (client: "codex" | "claude-code") =>
    ipcRenderer.invoke("mcp:integration:installSkill", client) as Promise<{
      clients: Array<{
        id: "codex" | "claude-code";
        configured: boolean;
        configPath: string;
        skillInstalled: boolean;
        skillPath: string;
      }>;
    }>,
  exportMcpPluginPackage: (client: "codex" | "claude-code") =>
    ipcRenderer.invoke("mcp:plugin-package:export", client) as Promise<{
      ok: boolean;
      client: "codex" | "claude-code";
      path?: string;
    }>,
  openCodexPrompt: (prompt: string) =>
    ipcRenderer.invoke("mcp:integration:openCodexPrompt", prompt) as Promise<{ ok: true }>,
  removeMcpIntegration: (client: "codex" | "claude-code") =>
    ipcRenderer.invoke("mcp:integration:remove", client) as Promise<{
      clients: Array<{
        id: "codex" | "claude-code";
        configured: boolean;
        configPath: string;
        skillInstalled: boolean;
        skillPath: string;
      }>;
    }>,
  uninstallMcpIntegration: (client: "codex" | "claude-code", target: "mcp" | "skill") =>
    ipcRenderer.invoke("mcp:integration:uninstall", client, target) as Promise<{
      clients: Array<{
        id: "codex" | "claude-code";
        configured: boolean;
        configPath: string;
        skillInstalled: boolean;
        skillPath: string;
      }>;
    }>,
  clearAppCache: () => ipcRenderer.invoke("app:clearCache") as Promise<{ ok: boolean }>,
  testSystemNotification: () =>
    ipcRenderer.invoke("notification:test") as Promise<SystemNotificationDeliveryResult>,
  openSystemNotificationSettings: () =>
    ipcRenderer.invoke("notification:openSettings") as Promise<{ ok: boolean }>,
  onGenerationNotificationOpen: (listener: (target: GenerationNotificationTarget) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, target: GenerationNotificationTarget): void => listener(target);
    ipcRenderer.on(GENERATION_NOTIFICATION_OPEN_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(GENERATION_NOTIFICATION_OPEN_CHANNEL, handler);
    };
  },
  getOnboardingState: (legacyState?: OnboardingState) =>
    ipcRenderer.invoke("onboarding:get", legacyState) as Promise<OnboardingState>,
  markOnboardingSeen: (key: string, status: OnboardingStatus) =>
    ipcRenderer.invoke("onboarding:mark", key, status) as Promise<OnboardingState>,
  clearOnboardingSeen: (key: string) =>
    ipcRenderer.invoke("onboarding:clear", key) as Promise<OnboardingState>,
  getMemoryStats: () => ipcRenderer.invoke("memory:getStats") as Promise<AssistantMemoryStats>,
  listMemories: () => ipcRenderer.invoke("memory:list") as Promise<AssistantMemoryDetail[]>,
  deleteMemory: (id: string) => ipcRenderer.invoke("memory:delete", id) as Promise<{ ok: boolean }>,
  organizeMemory: () => ipcRenderer.invoke("memory:organize") as Promise<AssistantMemoryStats>,
  generateMemories: () => ipcRenderer.invoke("memory:generate") as Promise<AssistantMemoryGenerationResult>,
  clearMemory: () => ipcRenderer.invoke("memory:clear") as Promise<{ ok: boolean }>,
  checkpointPromptDraft: (content: string, surface: AssistantSurface, query?: AssistantMemoryQuery) =>
    ipcRenderer.invoke("memory:checkpointDraft", content, surface, query) as Promise<{ ok: boolean }>,
  getMemorySuggestions: (query?: AssistantMemoryQuery, queryText?: string) =>
    ipcRenderer.invoke("memory:suggestions", query, queryText) as Promise<AssistantMemoryContextItem[]>,
  setAppIcon: (appIcon: AppIconPreference) =>
    ipcRenderer.invoke("appIcon:set", appIcon) as Promise<{ ok: boolean; appIcon: AppIconPreference }>,
  uploadAppIcon: (request: UploadAppIconRequest) =>
    ipcRenderer.invoke("appIcon:upload", request) as Promise<AppIconLibrary>,
  deleteAppIcon: (id: string) =>
    ipcRenderer.invoke("appIcon:delete", id) as Promise<AppIconLibrary>,
  testProvider: (config: ProviderConfig, apiKey?: string) =>
    ipcRenderer.invoke("provider:testConnection", config, apiKey),
  testTextProvider: (config: TextProviderConfig, apiKey?: string) =>
    ipcRenderer.invoke("textProvider:testConnection", config, apiKey),
  testVideoProvider: (config: VideoProviderConfig, apiKey?: string) =>
    ipcRenderer.invoke("videoProvider:testConnection", config, apiKey),
  listProviderModels: (config: ProviderConfig, apiKey?: string) =>
    ipcRenderer.invoke("provider:listModels", config, apiKey) as Promise<ProviderModelOption[]>,
  listTextProviderModels: (config: TextProviderConfig, apiKey?: string) =>
    ipcRenderer.invoke("textProvider:listModels", config, apiKey) as Promise<ProviderModelOption[]>,
  listVideoProviderModels: (config: VideoProviderConfig, apiKey?: string) =>
    ipcRenderer.invoke("videoProvider:listModels", config, apiKey) as Promise<VideoProviderModelOption[]>,
  listFalModels: (category: FalModelCategory, query?: string, providerId?: string, apiKey?: string) =>
    ipcRenderer.invoke("provider:listFalModels", category, query, providerId, apiKey) as Promise<FalModelOption[]>,
  getCodexAuthStatus: (providerId: string) =>
    ipcRenderer.invoke("codexAuth:getStatus", providerId) as Promise<CodexAuthStatus>,
  startCodexAuth: (providerId: string) =>
    ipcRenderer.invoke("codexAuth:signIn", providerId) as Promise<CodexAuthStatus>,
  refreshCodexAuth: (providerId: string) =>
    ipcRenderer.invoke("codexAuth:refresh", providerId) as Promise<CodexAuthStatus>,
  signOutCodex: (providerId: string) =>
    ipcRenderer.invoke("codexAuth:signOut", providerId) as Promise<CodexAuthStatus>,
  quotePaidMedia: (input: PaidMediaQuoteRequest) => ipcRenderer.invoke("media:quote", input) as Promise<PaidMediaQuote>,
  generateImage: (input: GenerateImageInput) => ipcRenderer.invoke("image:generate", input) as Promise<GenerateResponse>,
  enhancePrompt: (req: EnhancePromptRequest) => ipcRenderer.invoke("prompt:enhance", req) as Promise<EnhancePromptResult>,
  collaborateScene: (req: CollaborateSceneRequest) =>
    ipcRenderer.invoke("scene:collaborate", req) as Promise<CollaborateSceneResult>,
  startSceneCollaboration: (requestId: string, req: CollaborateSceneRequest) =>
    ipcRenderer.send(SCENE_COLLABORATION_START_CHANNEL, { requestId, request: req }),
  cancelSceneCollaboration: (requestId: string) =>
    ipcRenderer.send(SCENE_COLLABORATION_CANCEL_CHANNEL, requestId),
  respondSceneCollaborationInteraction: (
    requestId: string,
    interactionId: string,
    action: "submit" | "dismiss",
    values?: Record<string, string | string[]>
  ) => ipcRenderer.send(SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL, {
    requestId,
    interactionId,
    action,
    values
  }),
  onSceneCollaborationEvent: (listener: (event: CollaborateSceneStreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, streamEvent: CollaborateSceneStreamEvent): void => {
      listener(streamEvent);
    };
    ipcRenderer.on(SCENE_COLLABORATION_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SCENE_COLLABORATION_EVENT_CHANNEL, handler);
  },
  suggestAssistantIntents: (req: SuggestAssistantIntentsRequest) =>
    ipcRenderer.invoke("assistant:suggestIntents", req) as Promise<SuggestAssistantIntentsResult>,
  listAssistantConversations: (query?: AssistantConversationHistoryQuery) =>
    ipcRenderer.invoke("assistant:history:list", query) as Promise<AssistantConversationRecord[]>,
  suggestImageEdits: (req: SuggestImageEditsRequest) =>
    ipcRenderer.invoke("prompt:suggestImageEdits", req) as Promise<SuggestImageEditsResult>,
  listHistory: () => ipcRenderer.invoke("history:list") as Promise<GenerationJob[]>,
  recoverOfficialGenerations: () => ipcRenderer.invoke("official:recoverGenerations") as Promise<{
    recovered: number;
    pending: number;
    boardIds: string[];
  }>,
  listSceneMedia: () => ipcRenderer.invoke("sceneMedia:list") as Promise<SceneMediaSummary[]>,
  addSceneExample: (sceneId: string, sourcePath: string, prompt: string) =>
    ipcRenderer.invoke("sceneMedia:addExample", sceneId, sourcePath, prompt) as Promise<{ ok: boolean }>,
  deleteSceneResult: (sceneId: string, resultId: string) =>
    ipcRenderer.invoke("sceneMedia:deleteResult", sceneId, resultId) as Promise<{ ok: boolean }>,
  reorderSceneResults: (sceneId: string, resultIds: string[]) =>
    ipcRenderer.invoke("sceneMedia:reorderResults", sceneId, resultIds) as Promise<{ ok: boolean }>,
  setSceneCover: (sceneId: string, sourcePath: string, replaceCoverId?: string) =>
    ipcRenderer.invoke("sceneMedia:setCover", sceneId, sourcePath, replaceCoverId) as Promise<{ ok: boolean }>,
  removeSceneCover: (sceneId: string, coverId: string) =>
    ipcRenderer.invoke("sceneMedia:removeCover", sceneId, coverId) as Promise<{ ok: boolean }>,
  clearSceneCovers: (sceneId: string) =>
    ipcRenderer.invoke("sceneMedia:clearCovers", sceneId) as Promise<{ ok: boolean; count: number }>,
  reorderSceneCovers: (sceneId: string, coverIds: string[]) =>
    ipcRenderer.invoke("sceneMedia:reorderCovers", sceneId, coverIds) as Promise<{ ok: boolean }>,
  updateSceneCoverFocus: (sceneId: string, coverId: string, focus: SceneCoverFocus) =>
    ipcRenderer.invoke("sceneMedia:updateCoverFocus", sceneId, coverId, focus) as Promise<{ ok: boolean }>,
  deleteSceneMedia: (sceneId: string) =>
    ipcRenderer.invoke("sceneMedia:deleteScene", sceneId) as Promise<{ ok: boolean }>,
  exportScene: (scene: SceneTemplateData) =>
    ipcRenderer.invoke("scenes:export", scene) as Promise<{
      ok: boolean;
      path?: string;
      instanceCount?: number;
      coverCount?: number;
    }>,
  submitSceneTemplate: (scene: SceneTemplateData, authorName: string, exampleResultIds: string[]) =>
    ipcRenderer.invoke("scenes:submitTemplate", scene, authorName, exampleResultIds) as Promise<TemplateSubmissionResult>,
  getSceneTemplateSubmission: (sourceTemplateId: string) =>
    ipcRenderer.invoke("scenes:getTemplateSubmission", sourceTemplateId) as Promise<TemplateSubmissionResult | null>,
  importScene: () => ipcRenderer.invoke("scenes:import") as Promise<SceneTemplateImportResult | null>,
  importSceneData: (data: ArrayBuffer) =>
    ipcRenderer.invoke("scenes:importData", data) as Promise<SceneTemplateImportResult>,
  clearHistory: (boardId: string) =>
    ipcRenderer.invoke("history:clear", boardId) as Promise<{ ok: boolean; count: number }>,
  reuseHistory: (jobId: string) => ipcRenderer.invoke("history:reuse", jobId) as Promise<GenerationJob | null>,
  saveAsset: (sourcePath: string) =>
    ipcRenderer.invoke("asset:save", sourcePath) as Promise<{ ok: boolean; path?: string; directory?: string }>,
  chooseDownloadDirectory: () =>
    ipcRenderer.invoke("downloads:chooseDirectory") as Promise<{ ok: boolean; path?: string }>,
  setDownloadDirectory: (directory: string) =>
    ipcRenderer.invoke("downloads:setDirectory", directory) as Promise<{ ok: boolean; path?: string }>,
  openDownloadedPath: (targetPath: string) =>
    ipcRenderer.invoke("downloads:openPath", targetPath) as Promise<{ ok: boolean }>,
  shareDownloadedPath: (targetPath: string) =>
    ipcRenderer.invoke("downloads:sharePath", targetPath) as Promise<{ ok: boolean } & OnlineShareSession>,
  startOnlineImageShare: (request: OnlineImageShareRequest) =>
    ipcRenderer.invoke("sharing:startImage", request) as Promise<{ ok: boolean } & OnlineShareSession>,
  getActiveOnlineShare: () =>
    ipcRenderer.invoke("sharing:getActive") as Promise<OnlineShareSession | null>,
  stopOnlineShare: () =>
    ipcRenderer.invoke("sharing:stop") as Promise<{ ok: boolean }>,
  shareWechatStickerPackage: (
    folderPath: string,
    zipPath?: string,
    origin?: OnlineShareCanvasOrigin
  ) =>
    ipcRenderer.invoke("downloads:shareWechatPackage", {
      folderPath,
      zipPath,
      ...(origin ? { origin } : {})
    }) as Promise<{
      ok: boolean;
      url: string;
      expiresAt: number;
    }>,
  stopSharingDownloadedPath: () =>
    ipcRenderer.invoke("downloads:stopSharing") as Promise<{ ok: boolean }>,
  saveAssetsAsZip: (sourcePaths: string[]) =>
    ipcRenderer.invoke("asset:saveBatch", sourcePaths) as Promise<{
      ok: boolean;
      path?: string;
      directory?: string;
      count?: number;
      skipped?: number;
    }>,
  saveWechatStickerPackage: (request: SaveWechatStickerPackageRequest) =>
    ipcRenderer.invoke("asset:saveWechatStickerPackage", request) as Promise<SaveWechatStickerPackageResult>,
  writeClipboardImage: (request: WriteClipboardImageRequest) =>
    ipcRenderer.invoke("clipboard:writeImage", request) as Promise<{ ok: true }>,
  deleteAsset: (sourcePath: string) => ipcRenderer.invoke("asset:delete", sourcePath),
  importUploadedImage: (dataUrl: string) => ipcRenderer.invoke("asset:importUpload", dataUrl) as Promise<{ path: string }>,
  importVideo: (data: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke("video:import", data, mimeType) as Promise<{ path: string; mimeType: string; videoUrl: string }>,
  importAudio: (data: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke("audio:import", data, mimeType) as Promise<{ path: string; mimeType: string; audioUrl: string }>,
  getVideoCapabilities: () =>
    ipcRenderer.invoke("video:capabilities") as Promise<VideoProviderCapabilities>,
  startVideoGeneration: (input: VideoGenerationInput) =>
    ipcRenderer.invoke("video:start", input) as Promise<VideoGenerationJob>,
  listVideoJobs: () => ipcRenderer.invoke("video:list") as Promise<VideoGenerationJob[]>,
  clearVideoJobs: (boardId: string) => ipcRenderer.invoke("video:clear", boardId) as Promise<number>,
  getVideoJob: (id: string) => ipcRenderer.invoke("video:get", id) as Promise<VideoGenerationJob | null>,
  recoverVideoGenerations: () => ipcRenderer.invoke("video:recover") as Promise<VideoGenerationJob[]>,
  stopVideoPolling: (id: string) =>
    ipcRenderer.invoke("video:stopPolling", id) as Promise<{ stopped: boolean; job: VideoGenerationJob | null }>,
  saveVideo: (sourcePath: string) =>
    ipcRenderer.invoke("video:save", sourcePath) as Promise<{ ok: boolean; path?: string }>,
  revealVideo: (sourcePath: string) =>
    ipcRenderer.invoke("video:reveal", sourcePath) as Promise<{ ok: boolean }>,
  getMediaToolsState: () => ipcRenderer.invoke("mediaTools:getState") as Promise<MediaToolsState>,
  installMediaTools: () => ipcRenderer.invoke("mediaTools:install") as Promise<MediaToolsState>,
  cancelMediaToolsDownload: () => ipcRenderer.invoke("mediaTools:cancel") as Promise<void>,
  onMediaToolsState: (listener: (state: MediaToolsState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: MediaToolsState): void => listener(state);
    ipcRenderer.on(MEDIA_TOOLS_STATE_CHANNEL, handler);
    return (): void => { ipcRenderer.removeListener(MEDIA_TOOLS_STATE_CHANNEL, handler); };
  },
  createVideoSequence: (input: { boardId: string; name?: string; imageNodeIds: string[]; defaults?: Partial<VideoSequence["defaults"]> }) =>
    ipcRenderer.invoke("videoSequence:create", input) as Promise<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>,
  createVideoSequenceFromVideos: (input: { boardId: string; name?: string; videoNodeIds: string[]; defaults?: Partial<VideoSequence["defaults"]> }) =>
    ipcRenderer.invoke("videoSequence:createFromVideos", input) as Promise<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>,
  getVideoSequence: (input: { boardId: string; sequenceId: string }) =>
    ipcRenderer.invoke("videoSequence:get", input) as Promise<(VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }) | null>,
  listVideoSequences: (boardId: string) =>
    ipcRenderer.invoke("videoSequence:list", { boardId }) as Promise<Array<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>>,
  mutateVideoSequence: (operation: "rename" | "replaceKeyframe" | "reorderKeyframes" | "reorderSegments" | "removeKeyframe" | "updateDefaults" | "updateSegment" | "selectSegmentVersion", input: Record<string, unknown>) =>
    ipcRenderer.invoke(`videoSequence:${operation}`, input) as Promise<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>,
  deleteVideoSequence: (input: { boardId: string; sequenceId: string; expectedRevision: number }) =>
    ipcRenderer.invoke("videoSequence:delete", input) as Promise<{ ok: true }>,
  runVideoSequence: (input: { boardId: string; sequenceId: string; expectedRevision: number; scope: "affected" | "all" | { segmentIds: string[] }; generationAttemptId?: string; inputFingerprint?: string; quoteId?: string; quoteExpiresAt?: string; idempotencyKey?: string; priceSnapshot?: GenerateImageInput["priceSnapshot"] }) =>
    ipcRenderer.invoke("videoSequence:run", input) as Promise<{ sequence: VideoSequence; jobs: VideoSequenceTask[]; estimate?: { currency: "credit"; total: number; authoritative: boolean } }>,
  retryVideoSequence: (input: { boardId: string; sequenceId: string; segmentIds: string[] }) =>
    ipcRenderer.invoke("videoSequence:retry", input) as Promise<{ sequence: VideoSequence; jobs: VideoSequenceTask[] }>,
  pauseVideoSequence: (input: { boardId: string; sequenceId: string }) => ipcRenderer.invoke("videoSequence:pause", input) as Promise<VideoSequence>,
  resumeVideoSequence: (input: { boardId: string; sequenceId: string }) => ipcRenderer.invoke("videoSequence:resume", input) as Promise<{ sequence: VideoSequence; jobs: VideoSequenceTask[] }>,
  cancelVideoSequenceTask: (taskId: string) => ipcRenderer.invoke("videoSequence:cancelTask", { taskId }) as Promise<{ supported: boolean; cancelled: boolean; job: VideoSequenceTask | null }>,
  exportVideoSequence: (input: { boardId: string; sequenceId: string; expectedRevision: number; fileName?: string; resolution?: string; fps?: number; includeAudio?: boolean }) => ipcRenderer.invoke("videoSequence:export", input) as Promise<VideoSequenceExportJob>,
  getVideoSequenceExport: (exportJobId: string) => ipcRenderer.invoke("videoSequence:getExport", { exportJobId }) as Promise<VideoSequenceExportJob | null>,
  saveVideoSequenceExport: (input: { boardId: string; sequenceId: string; exportVersionId: string }) => ipcRenderer.invoke("videoSequence:saveExport", input) as Promise<{ ok: boolean; path?: string }>,
  listVideoSequenceTemplates: () => ipcRenderer.invoke("videoSequenceTemplate:list") as Promise<VideoSequenceTemplate[]>,
  createVideoSequenceTemplate: (input: { sequence: VideoSequence; name: string; description: string }) => ipcRenderer.invoke("videoSequenceTemplate:create", input) as Promise<VideoSequenceTemplate>,
  updateVideoSequenceTemplate: (template: VideoSequenceTemplate, expectedVersion: number) => ipcRenderer.invoke("videoSequenceTemplate:update", { template, expectedVersion }) as Promise<VideoSequenceTemplate>,
  deleteVideoSequenceTemplate: (templateId: string, expectedVersion: number) => ipcRenderer.invoke("videoSequenceTemplate:delete", { templateId, expectedVersion }) as Promise<{ ok: true }>,
  instantiateVideoSequenceTemplate: (input: { boardId: string; templateId: string; imageNodeIds: string[] }) => ipcRenderer.invoke("videoSequenceTemplate:instantiate", input) as Promise<VideoSequence>,
  exportVideoSequenceTemplate: (templateId: string) => ipcRenderer.invoke("videoSequenceTemplate:export", { templateId }) as Promise<{ ok: boolean; path?: string }>,
  importVideoSequenceTemplate: () => ipcRenderer.invoke("videoSequenceTemplate:import") as Promise<VideoSequenceTemplate | null>,
  importVideoSequenceTemplateData: (data: ArrayBuffer) => ipcRenderer.invoke("videoSequenceTemplate:importData", data) as Promise<VideoSequenceTemplate>,
  onVideoSequenceEvent: (listener: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload);
    ipcRenderer.on(VIDEO_SEQUENCE_EVENT_CHANNEL, handler);
    return (): void => { ipcRenderer.removeListener(VIDEO_SEQUENCE_EVENT_CHANNEL, handler); };
  },
  importImageUrl: (imageUrl: string) =>
    ipcRenderer.invoke("asset:importUrl", imageUrl) as Promise<{
      path: string;
      dataUrl: string;
      width: number;
      height: number;
    }>,
  readOnlineShareImport: (source: string) =>
    ipcRenderer.invoke("sharing:readImport", source) as Promise<OnlineShareImportData>,
  readAssetDataUrl: (sourcePath: string) => ipcRenderer.invoke("asset:readDataUrl", sourcePath) as Promise<string>,
  getAssetThumbnail: (sourcePath: string, maxSize?: number) =>
    ipcRenderer.invoke("asset:thumbnail", sourcePath, maxSize) as Promise<string>,
  sliceImage: (request: SliceImageRequest) =>
    ipcRenderer.invoke("asset:slice", request) as Promise<SliceImageResult[]>,
  analyzeSliceSubjects: (request: AnalyzeSliceSubjectsRequest) =>
    ipcRenderer.invoke("asset:analyzeSliceSubjects", request) as Promise<AnalyzeSliceSubjectsResult>,
  listBoards: () => ipcRenderer.invoke("boards:list") as Promise<BoardSummary[]>,
  getBoard: (id: string) => ipcRenderer.invoke("boards:get", id) as Promise<BoardDetail | null>,
  getComicDramaBoardSnapshot: (boardId: string) =>
    ipcRenderer.invoke(COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL, boardId) as Promise<ComicDramaBoardSnapshot>,
  applyComicDramaMutationPlan: (plan: BoardMutationPlan) =>
    ipcRenderer.invoke(COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL, plan) as Promise<BoardMutationResult>,
  createBoard: (name?: string) => ipcRenderer.invoke("boards:create", name) as Promise<BoardData>,
  createComicDramaProject: (input: import("../../shared/types.js").ComicDramaProjectCreateInput) =>
    ipcRenderer.invoke("boards:createComicDramaProject", input) as Promise<import("../../shared/types.js").ComicDramaProjectCreateResult>,
  saveBoard: (payload: BoardSavePayload) => ipcRenderer.invoke("boards:save", payload) as Promise<BoardSummary>,
  moveBoardImage: (boardId: string, nodeId: string, x: number, y: number) =>
    ipcRenderer.invoke("boards:images:move", boardId, nodeId, x, y) as Promise<{
      boardId: string;
      nodeId: string;
      previous: { x: number; y: number };
      position: { x: number; y: number };
    }>,
  resizeBoardImage: (boardId: string, nodeId: string, displayWidth: number) =>
    ipcRenderer.invoke("boards:images:resize", boardId, nodeId, displayWidth) as Promise<{
      boardId: string;
      nodeId: string;
      previousWidth: number;
      displayWidth: number;
      displayHeight: number;
    }>,
  arrangeBoardImages: (boardId: string, nodeIds: string[], mode: "horizontal" | "vertical" | "grid", gap?: number) =>
    ipcRenderer.invoke("boards:images:arrange", boardId, nodeIds, mode, gap) as Promise<{
      boardId: string;
      mode: "horizontal" | "vertical" | "grid";
      gap: number;
      positions: Array<{ nodeId: string; x: number; y: number }>;
    }>,
  duplicateBoardImages: (boardId: string, nodeIds: string[], offset?: number) =>
    ipcRenderer.invoke("boards:images:duplicate", boardId, nodeIds, offset) as Promise<{
      boardId: string;
      copies: Array<{ sourceNodeId: string; nodeId: string; x: number; y: number }>;
    }>,
  setBoardImageVersion: (boardId: string, nodeId: string, versionIndex: number) =>
    ipcRenderer.invoke("boards:images:setVersion", boardId, nodeId, versionIndex) as Promise<{
      boardId: string;
      nodeId: string;
      previousVersionIndex: number;
      versionIndex: number;
      versionCount: number;
      imagePath: string;
    }>,
  renameBoard: (id: string, name: string) => ipcRenderer.invoke("boards:rename", id, name) as Promise<BoardSummary | null>,
  duplicateBoard: (id: string) => ipcRenderer.invoke("boards:duplicate", id) as Promise<BoardSummary | null>,
  deleteBoard: (id: string) => ipcRenderer.invoke("boards:delete", id) as Promise<{ ok: boolean }>,
  listTrashedBoards: () => ipcRenderer.invoke("boards:trash:list") as Promise<TrashedBoardSummary[]>,
  restoreBoard: (id: string) =>
    ipcRenderer.invoke("boards:trash:restore", id) as Promise<BoardSummary | null>,
  permanentlyDeleteBoard: (id: string) =>
    ipcRenderer.invoke("boards:trash:delete", id) as Promise<{ ok: boolean }>,
  emptyBoardTrash: () =>
    ipcRenderer.invoke("boards:trash:empty") as Promise<{ ok: boolean; count: number }>,
  listTrashedBoardImages: () =>
    ipcRenderer.invoke("boards:images:trash:list") as Promise<TrashedBoardImage[]>,
  trashBoardImages: (boardId: string, nodeIds: string[]) =>
    ipcRenderer.invoke("boards:images:trash:move", boardId, nodeIds) as Promise<{
      count: number;
      items: Array<{ trashId: string; nodeId: string }>;
    }>,
  restoreTrashedBoardImage: (id: string) =>
    ipcRenderer.invoke("boards:images:trash:restore", id) as Promise<RestoreTrashedBoardImageResult | null>,
  permanentlyDeleteTrashedBoardImage: (id: string) =>
    ipcRenderer.invoke("boards:images:trash:delete", id) as Promise<{ ok: boolean }>,
  emptyTrashedBoardImages: () =>
    ipcRenderer.invoke("boards:images:trash:empty") as Promise<{ ok: boolean; count: number }>,
  appendBoardNodes: (id: string, nodes: UnpositionedBoardNode[]) =>
    ipcRenderer.invoke("boards:appendNodes", id, nodes) as Promise<{ ok: boolean }>,
  appendBoardNodeVersions: (id: string, nodeId: string, versions: BoardNodeVersion[]) =>
    ipcRenderer.invoke("boards:appendVersions", id, nodeId, versions) as Promise<{ ok: boolean }>,
  getBoardsState: () => ipcRenderer.invoke("boards:getState") as Promise<{ lastOpenedBoardId?: string }>,
  setLastOpenedBoard: (id: string) => ipcRenderer.invoke("boards:setLastOpened", id) as Promise<{ ok: boolean }>,
  exportBoard: (id: string) => ipcRenderer.invoke("boards:export", id) as Promise<{ ok: boolean; path?: string }>,
  importBoard: () => ipcRenderer.invoke("boards:import") as Promise<BoardSummary | null>,
  importBoardData: (data: ArrayBuffer) => ipcRenderer.invoke("boards:importData", data) as Promise<BoardSummary>,
  listAssets: (cursor?: string, limit?: number) =>
    ipcRenderer.invoke("assets:library", cursor, limit) as Promise<AssetLibraryPage>,
  getAsset: (boardId: string, nodeId: string) =>
    ipcRenderer.invoke("assets:item", boardId, nodeId) as Promise<AssetLibraryItem | null>,
  getAssetDetail: (boardId: string, nodeId: string) =>
    ipcRenderer.invoke("assets:detail", boardId, nodeId) as Promise<AssetDetailData>,
  getJobPrompt: (jobId: string) => ipcRenderer.invoke("assets:jobPrompt", jobId) as Promise<JobPromptInfo>,
  listComments: () => ipcRenderer.invoke("comments:list") as Promise<AssetComment[]>,
  addComment: (imagePath: string, text: string, position?: AssetComment["position"]) =>
    ipcRenderer.invoke("comments:add", imagePath, text, position) as Promise<AssetComment>,
  updateCommentPosition: (id: string, position: NonNullable<AssetComment["position"]>) =>
    ipcRenderer.invoke("comments:updatePosition", id, position) as Promise<AssetComment | null>,
  removeComment: (id: string) => ipcRenderer.invoke("comments:remove", id) as Promise<{ ok: boolean }>,
  getAssetMeta: (imagePath: string) =>
    ipcRenderer.invoke("assets:meta", imagePath) as Promise<AssetTagInfo>,
  toggleAssetFavorite: (imagePath: string) =>
    ipcRenderer.invoke("assets:toggleFavorite", imagePath) as Promise<AssetTagInfo>,
  setAssetTags: (imagePath: string, tags: string[]) =>
    ipcRenderer.invoke("assets:setTags", imagePath, tags) as Promise<AssetTagInfo>,
  listAssetMeta: () => ipcRenderer.invoke("assets:metaList") as Promise<AssetTagInfo[]>,
  saveImageDataUrl: (dataUrl: string, suggestedName?: string) =>
    ipcRenderer.invoke("asset:saveDataUrl", dataUrl, suggestedName) as Promise<{
      ok: boolean;
      path?: string;
      directory?: string;
    }>
};

contextBridge.exposeInMainWorld("imageWorkbench", api);

export type ImageWorkbenchApi = typeof api;
