import type { CodingAgentIntegrationStatus } from "./agent-integration.js";
import type { CreateModificationRequest, FinishModificationRequest, ModificationRequest, PublicModificationRequest, PreparedModificationRequest } from "./modification-requests.js";
import type { ImageDeliveryRecipe, ImageVersionIdentity, ImageDeliveryExportResult } from "./image-delivery.js";
import { WORKBENCH_COMMANDS } from "./contracts/workbench-commands.js";
import type { InstalledPlugin, PluginManifest, PluginPackage } from "./plugins.js";
import {
  WINDOW_SAVE_REQUEST,
  WINDOW_SAVE_RESULT,
  WINDOW_RENDERER_READY,
  type WindowSaveRequest,
  type WindowSaveResult
} from "./window-lifecycle.js";
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
  ProviderTestResult,
  ProviderTestOptions,
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
} from "./types.js";
import { GENERATION_NOTIFICATION_OPEN_CHANNEL, type GenerationNotificationTarget } from "./system-notification.js";
import {
  SCENE_COLLABORATION_CANCEL_CHANNEL,
  SCENE_COLLABORATION_EVENT_CHANNEL,
  SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL,
  SCENE_COLLABORATION_START_CHANNEL
} from "./assistant.js";
import type { LicenseStatusSnapshot } from "./licensing.js";
import type { InspirationSource } from "./inspiration-sources.js";
import type { FeedbackDetail, FeedbackHistoryPage, FeedbackSubmitRequest, FeedbackSubmissionResult } from "./feedback.js";
import type {
  MasterGoConnectionState,
  MasterGoReconstructionPreparation,
  MasterGoReconstructionRequest,
  MasterGoReconstructionTask,
  PrepareMasterGoReconstructionRequest
} from "./mastergo-reconstruction.js";
import { PI_AGENT_LOG_EVENT_CHANNEL, type PiAgentLogEntry, type PiAgentLogSnapshot } from "./pi-agent-log.js";
import { UPDATE_STATE_CHANNEL, type UpdateChannel, type UpdateStateSnapshot } from "./app-update.js";
import { ITERLAY_DEEP_LINK_CHANNEL, ITERLAY_DEEP_LINK_READY_CHANNEL } from "./deep-link.js";
import type { AgentSkillUpgradeDetail } from "./agent-integration.js";
import type { AssistantSkillDetail, AssistantSkillSummary, PiAgentResourceDetail, PiAgentResourceInventory } from "./types.js";
import {
  COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL,
  COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL,
  type BoardMutationPlan,
  type BoardMutationResult,
  type ComicDramaBoardSnapshot
} from "./comic-drama.js";
import { VIDEO_SEQUENCE_EVENT_CHANNEL } from "./video-sequence.js";
import { MEDIA_TOOLS_STATE_CHANNEL, type MediaToolsState } from "./media-tools.js";
import type { VideoSequence, VideoSequenceExportJob, VideoSequenceTask, VideoSequenceTemplate } from "../electron/video-sequence-types.js";

/** Payload-only transport shared by Electron preload and the development browser client. */
export interface WorkbenchTransport {
  // Wire values are unknown until each public method assigns its result contract.
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on<TArgs extends unknown[]>(channel: string, listener: (...args: TArgs) => void): () => void;
}

export const VIDEO_SEQUENCE_MUTATIONS = [
  "rename", "replaceKeyframe", "reorderKeyframes", "reorderSegments", "removeKeyframe",
  "updateDefaults", "updateSegment", "selectSegmentVersion"
] as const;

export function createWorkbenchClient(transport: WorkbenchTransport) {
  return {
  setImageFinalVersion: (input:{boardId:string;nodeId:string;version:ImageVersionIdentity|null}) => transport.invoke("imageDelivery:setFinalVersion",input) as Promise<BoardData>,
  saveImageDeliveryRecipe: (input:{boardId:string;recipe:ImageDeliveryRecipe}) => transport.invoke("imageDelivery:saveRecipe",input) as Promise<BoardData>,
  removeImageDeliveryRecipe: (input:{boardId:string;recipeId:string}) => transport.invoke("imageDelivery:removeRecipe",input) as Promise<BoardData>,
  exportImageDeliveryRecipe: (input:{boardId:string;recipeId:string}) => transport.invoke("imageDelivery:export",input) as Promise<ImageDeliveryExportResult>,
  createModificationRequest: (input: CreateModificationRequest) => transport.invoke("modifications:create",input) as Promise<PublicModificationRequest>,
  cancelImageGeneration: (clientTaskId:string) => transport.invoke("image:cancel",clientTaskId) as Promise<{status:"cancelled"|"running"|"not-found";remoteCancelled:false;message:string;jobId?:string}>,
  listModificationRequests: (boardId?: string) => transport.invoke("modifications:list",boardId) as Promise<PublicModificationRequest[]>,
  getModificationRequest: (id:string) => transport.invoke("modifications:get",id) as Promise<PublicModificationRequest>,
  clarifyModificationRequest: (id:string,instruction:string) => transport.invoke("modifications:clarify",id,instruction) as Promise<PublicModificationRequest>,
  prepareModificationRequest: (id:string,claimToken:string) => transport.invoke("modifications:prepare",id,claimToken) as Promise<PreparedModificationRequest>,
  claimModificationRequest: (id:string,owner:string) => transport.invoke("modifications:claim",id,owner) as Promise<ModificationRequest>,
  finishModificationRequest: (input:FinishModificationRequest) => transport.invoke("modifications:finish",input) as Promise<PublicModificationRequest>,
  listPlugins: () => transport.invoke("plugins:list") as Promise<InstalledPlugin[]>,
  listPluginCatalog: () => transport.invoke("plugins:catalog") as Promise<PluginManifest[]>,
  getPlugin: (id: string) => transport.invoke("plugins:get", id) as Promise<PluginPackage & InstalledPlugin>,
  getPluginFrameUrl: (id: string) => transport.invoke("plugins:frameUrl", id) as Promise<string>,
  inspectPlugin: (bytes: Uint8Array) => transport.invoke("plugins:inspect", bytes) as Promise<PluginManifest>,
  installPlugin: (bytes: Uint8Array) => transport.invoke("plugins:install", bytes) as Promise<InstalledPlugin>,
  installCatalogPlugin: (id: string) => transport.invoke("plugins:installCatalog", id) as Promise<InstalledPlugin>,
  setPluginEnabled: (id: string, enabled: boolean) => transport.invoke("plugins:setEnabled", id, enabled) as Promise<void>,
  uninstallPlugin: (id: string) => transport.invoke("plugins:uninstall", id) as Promise<void>,
  readPluginState: (id: string, scope: string) => transport.invoke("plugins:readState", id, scope) as Promise<unknown>,
  writePluginState: (id: string, scope: string, value: unknown) => transport.invoke("plugins:writeState", id, scope, value) as Promise<void>,
  authorizePlugin: (id: string, permission: string) => transport.invoke("plugins:authorize", id, permission) as Promise<void>,
  onWorkbenchEvent: (listener: (event: { type: string; [key: string]: unknown }) => void) => {
    const handler = (event: { type: string; [key: string]: unknown }): void => { listener(event); };
    return transport.on("workbench:event", handler);
  },
  windowRendererReady: () => transport.send(WINDOW_RENDERER_READY),
  completeWindowSave: (result: WindowSaveResult) => transport.send(WINDOW_SAVE_RESULT, result),
  onWindowSaveRequest: (listener: (request: WindowSaveRequest) => void) => {
    const handler = (request: WindowSaveRequest): void => { listener(request); };
    return transport.on(WINDOW_SAVE_REQUEST, handler);
  },
  activateDeepLinks: () =>
    transport.invoke(ITERLAY_DEEP_LINK_READY_CHANNEL) as Promise<string[]>,
  onDeepLink: (listener: (url: string) => void) => {
    const handler = (url: string): void => listener(url);
    return transport.on(ITERLAY_DEEP_LINK_CHANNEL, handler);
  },
  getUpdateState: () => transport.invoke("update:getState") as Promise<UpdateStateSnapshot>,
  checkForUpdates: () => transport.invoke("update:check") as Promise<UpdateStateSnapshot>,
  downloadUpdate: () => transport.invoke("update:download") as Promise<UpdateStateSnapshot>,
  cancelUpdateDownload: () => transport.invoke("update:cancelDownload") as Promise<UpdateStateSnapshot>,
  installUpdate: () => transport.invoke("update:install") as Promise<UpdateStateSnapshot>,
  dismissInstalledRelease: () =>
    transport.invoke("update:dismissInstalledRelease") as Promise<UpdateStateSnapshot>,
  skipUpdateVersion: (version: string) =>
    transport.invoke("update:skipVersion", version) as Promise<UpdateStateSnapshot>,
  setUpdateChannel: (channel: UpdateChannel) =>
    transport.invoke("update:setChannel", channel) as Promise<UpdateStateSnapshot>,
  onUpdateState: (listener: (snapshot: UpdateStateSnapshot) => void) => {
    const handler = (snapshot: UpdateStateSnapshot): void => listener(snapshot);
    return transport.on(UPDATE_STATE_CHANNEL, handler);
  },
  getLicenseStatus: () => transport.invoke("license:getStatus") as Promise<LicenseStatusSnapshot>,
  startLicenseTrial: () => transport.invoke("license:startTrial") as Promise<LicenseStatusSnapshot>,
  activateLicense: (email: string, licenseKey: string) =>
    transport.invoke("license:activate", email, licenseKey) as Promise<LicenseStatusSnapshot>,
  checkLicense: () => transport.invoke("license:check") as Promise<LicenseStatusSnapshot>,
  deactivateLicense: () => transport.invoke("license:deactivate") as Promise<LicenseStatusSnapshot>,
  openLicensePortal: () => transport.invoke("license:openPortal") as Promise<void>,
  openInspirationSource: (sourceId: string) =>
    transport.invoke("inspiration:open", sourceId) as Promise<void>,
  listInspirationSources: () => transport.invoke("inspiration:list") as Promise<InspirationSource[]>,
  getCreditStatus: () => transport.invoke("credits:getStatus") as Promise<CreditStatus>,
  listCreditTransactions: (limit?: number) =>
    transport.invoke("credits:listTransactions", limit) as Promise<CreditLedgerEntry[]>,
  getReferralOverview: () =>
    transport.invoke("referrals:getOverview") as Promise<ReferralOverview>,
  getGiftActivationOverview: () =>
    transport.invoke("giftActivations:getOverview") as Promise<GiftActivationOverview>,
  recordGiftActivationShare: (codeId: string) =>
    transport.invoke("giftActivations:recordShare", codeId) as Promise<void>,
  submitFeedback: (request: FeedbackSubmitRequest) =>
    transport.invoke("feedback:submit", request) as Promise<FeedbackSubmissionResult>,
  listFeedbackHistory: (limit?: number) =>
    transport.invoke("feedback:listHistory", limit) as Promise<FeedbackHistoryPage>,
  getFeedbackDetail: (feedbackId: string) =>
    transport.invoke("feedback:getDetail", feedbackId) as Promise<FeedbackDetail>,
  deleteFeedback: (feedbackId: string) =>
    transport.invoke("feedback:delete", feedbackId) as Promise<void>,
  getSettings: () =>
    transport.invoke(WORKBENCH_COMMANDS.getSettings) as Promise<
      AppSettings & {
        providerKeyStatus: Record<string, boolean>;
        codexAuthStatusByProviderId: Record<string, CodexAuthStatus>;
        setupComplete: boolean;
      }
    >,
  saveSettings: (settings: AppSettings & { apiKeyByProviderId?: Record<string, string> }) =>
    transport.invoke("settings:save", settings) as Promise<{ ok: boolean }>,
  updateSettings: (patch: AppSettingsPatch) => transport.invoke("settings:update", patch) as Promise<{ ok: boolean }>,
  getCodingAgentStatus: () => transport.invoke("agent:status") as Promise<CodingAgentIntegrationStatus>,
  installCli: () => transport.invoke("agent:cli:install") as Promise<CodingAgentIntegrationStatus>,
  consumeAgentSkillUpgrades: () => transport.invoke("agent:skill-upgrade:consume") as Promise<AgentSkillUpgradeDetail[]>,
  getPiAgentLogs: () =>
    transport.invoke("pi-agent-log:list") as Promise<PiAgentLogSnapshot>,
  getPiAgentResources: () =>
    transport.invoke("pi-agent:resources:list") as Promise<PiAgentResourceInventory>,
  getPiAgentResourceDetail: (resourcePath: string) =>
    transport.invoke("pi-agent:resources:read", resourcePath) as Promise<PiAgentResourceDetail>,
  listAssistantSkills: () =>
    transport.invoke("assistant-skills:list") as Promise<AssistantSkillSummary[]>,
  getAssistantSkill: (id: string) =>
    transport.invoke("assistant-skills:get", id) as Promise<AssistantSkillDetail>,
  saveAssistantSkill: (id: string, content: string) =>
    transport.invoke("assistant-skills:save", id, content) as Promise<AssistantSkillDetail>,
  resetAssistantSkill: (id: string) =>
    transport.invoke("assistant-skills:reset", id) as Promise<AssistantSkillDetail>,
  clearPiAgentLogs: () =>
    transport.invoke("pi-agent-log:clear") as Promise<{ ok: true }>,
  openPiAgentLogDirectory: () =>
    transport.invoke("pi-agent-log:openDirectory") as Promise<{ ok: true }>,
  onPiAgentLog: (listener: (entry: PiAgentLogEntry) => void) => {
    const handler = (entry: PiAgentLogEntry): void => listener(entry);
    return transport.on(PI_AGENT_LOG_EVENT_CHANNEL, handler);
  },
  getMasterGoConnection: (force = false) =>
    transport.invoke("mastergo:getConnection", force) as Promise<MasterGoConnectionState>,
  openMasterGoSetup: (target: "download" | "guide") =>
    transport.invoke("mastergo:openSetup", target) as Promise<void>,
  prepareMasterGoReconstruction: (request: PrepareMasterGoReconstructionRequest) =>
    transport.invoke("mastergo:prepareReconstruction", request) as Promise<MasterGoReconstructionPreparation>,
  startMasterGoReconstruction: (request: MasterGoReconstructionRequest, textProviderId?: string) =>
    transport.invoke("mastergo:startReconstruction", request, textProviderId) as Promise<MasterGoReconstructionTask>,
  getMasterGoReconstructionTask: (id: string) =>
    transport.invoke("mastergo:getReconstructionTask", id) as Promise<MasterGoReconstructionTask>,
  cancelMasterGoReconstructionTask: (id: string) =>
    transport.invoke("mastergo:cancelReconstructionTask", id) as Promise<MasterGoReconstructionTask>,
  readMasterGoLayerAsset: (path: string) =>
    transport.invoke("mastergo:readLayerAsset", path) as Promise<string>,
  downloadMasterGoHtml: (input: { frameName: string; html: string }) =>
    transport.invoke("mastergo:downloadHtml", input) as Promise<{ ok: boolean; path?: string }>,
  downloadMasterGoLayers: (input: { frameName: string; layers: Array<{ name: string; path: string }> }) =>
    transport.invoke("mastergo:downloadLayers", input) as Promise<{ ok: boolean; path?: string; count?: number }>,
  exportMasterGoPsd: (input: {
    frameName: string;
    canvas: { width: number; height: number };
    layers: Array<{ name: string; path: string; x: number; y: number; width: number; height: number }>;
  }) => transport.invoke("mastergo:exportPsd", input) as Promise<{ ok: boolean; path?: string }>,
  renderMasterGoEditedHtml: (taskId: string, html: string) =>
    transport.invoke("mastergo:renderEditedHtml", taskId, html) as Promise<string>,
  installAgentSkill: (client: "codex" | "claude-code") => transport.invoke("agent:skill:install", client) as Promise<CodingAgentIntegrationStatus>,
  removeAgentSkill: (client: "codex" | "claude-code") => transport.invoke("agent:skill:remove", client) as Promise<CodingAgentIntegrationStatus>,
  clearAppCache: () => transport.invoke("app:clearCache") as Promise<{ ok: boolean }>,
  testSystemNotification: () =>
    transport.invoke("notification:test") as Promise<SystemNotificationDeliveryResult>,
  openSystemNotificationSettings: () =>
    transport.invoke("notification:openSettings") as Promise<{ ok: boolean }>,
  onGenerationNotificationOpen: (listener: (target: GenerationNotificationTarget) => void) => {
    const handler = (target: GenerationNotificationTarget): void => listener(target);
    return transport.on(GENERATION_NOTIFICATION_OPEN_CHANNEL, handler);
  },
  getOnboardingState: (legacyState?: OnboardingState) =>
    transport.invoke("onboarding:get", legacyState) as Promise<OnboardingState>,
  markOnboardingSeen: (key: string, status: OnboardingStatus) =>
    transport.invoke("onboarding:mark", key, status) as Promise<OnboardingState>,
  clearOnboardingSeen: (key: string) =>
    transport.invoke("onboarding:clear", key) as Promise<OnboardingState>,
  getMemoryStats: () => transport.invoke("memory:getStats") as Promise<AssistantMemoryStats>,
  listMemories: () => transport.invoke("memory:list") as Promise<AssistantMemoryDetail[]>,
  deleteMemory: (id: string) => transport.invoke("memory:delete", id) as Promise<{ ok: boolean }>,
  organizeMemory: () => transport.invoke("memory:organize") as Promise<AssistantMemoryStats>,
  generateMemories: () => transport.invoke("memory:generate") as Promise<AssistantMemoryGenerationResult>,
  clearMemory: () => transport.invoke("memory:clear") as Promise<{ ok: boolean }>,
  checkpointPromptDraft: (content: string, surface: AssistantSurface, query?: AssistantMemoryQuery) =>
    transport.invoke("memory:checkpointDraft", content, surface, query) as Promise<{ ok: boolean }>,
  getMemorySuggestions: (query?: AssistantMemoryQuery, queryText?: string) =>
    transport.invoke("memory:suggestions", query, queryText) as Promise<AssistantMemoryContextItem[]>,
  setAppIcon: (appIcon: AppIconPreference) =>
    transport.invoke("appIcon:set", appIcon) as Promise<{ ok: boolean; appIcon: AppIconPreference }>,
  uploadAppIcon: (request: UploadAppIconRequest) =>
    transport.invoke("appIcon:upload", request) as Promise<AppIconLibrary>,
  deleteAppIcon: (id: string) =>
    transport.invoke("appIcon:delete", id) as Promise<AppIconLibrary>,
  testProvider: (config: ProviderConfig, apiKey?: string, options?: ProviderTestOptions) =>
    transport.invoke("provider:testConnection", config, apiKey, options) as Promise<ProviderTestResult>,
  testTextProvider: (config: TextProviderConfig, apiKey?: string) =>
    transport.invoke("textProvider:testConnection", config, apiKey) as Promise<ProviderTestResult>,
  testVideoProvider: (config: VideoProviderConfig, apiKey?: string) =>
    transport.invoke("videoProvider:testConnection", config, apiKey) as Promise<ProviderTestResult>,
  listProviderModels: (config: ProviderConfig, apiKey?: string) =>
    transport.invoke("provider:listModels", config, apiKey) as Promise<ProviderModelOption[]>,
  listTextProviderModels: (config: TextProviderConfig, apiKey?: string) =>
    transport.invoke("textProvider:listModels", config, apiKey) as Promise<ProviderModelOption[]>,
  listVideoProviderModels: (config: VideoProviderConfig, apiKey?: string) =>
    transport.invoke("videoProvider:listModels", config, apiKey) as Promise<VideoProviderModelOption[]>,
  listFalModels: (category: FalModelCategory, query?: string, providerId?: string, apiKey?: string) =>
    transport.invoke("provider:listFalModels", category, query, providerId, apiKey) as Promise<FalModelOption[]>,
  getCodexAuthStatus: (providerId: string) =>
    transport.invoke("codexAuth:getStatus", providerId) as Promise<CodexAuthStatus>,
  startCodexAuth: (providerId: string) =>
    transport.invoke("codexAuth:signIn", providerId) as Promise<CodexAuthStatus>,
  refreshCodexAuth: (providerId: string) =>
    transport.invoke("codexAuth:refresh", providerId) as Promise<CodexAuthStatus>,
  signOutCodex: (providerId: string) =>
    transport.invoke("codexAuth:signOut", providerId) as Promise<CodexAuthStatus>,
  quotePaidMedia: (input: PaidMediaQuoteRequest) => transport.invoke("media:quote", input) as Promise<PaidMediaQuote>,
  generateImage: (input: GenerateImageInput) => transport.invoke(WORKBENCH_COMMANDS.generateImage, input) as Promise<GenerateResponse>,
  enhancePrompt: (req: EnhancePromptRequest) => transport.invoke("prompt:enhance", req) as Promise<EnhancePromptResult>,
  collaborateScene: (req: CollaborateSceneRequest) =>
    transport.invoke("scene:collaborate", req) as Promise<CollaborateSceneResult>,
  startSceneCollaboration: (requestId: string, req: CollaborateSceneRequest) =>
    transport.send(SCENE_COLLABORATION_START_CHANNEL, { requestId, request: req }),
  cancelSceneCollaboration: (requestId: string) =>
    transport.send(SCENE_COLLABORATION_CANCEL_CHANNEL, requestId),
  respondSceneCollaborationInteraction: (
    requestId: string,
    interactionId: string,
    action: "submit" | "dismiss",
    values?: Record<string, string | string[]>
  ) => transport.send(SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL, {
    requestId,
    interactionId,
    action,
    values
  }),
  onSceneCollaborationEvent: (listener: (event: CollaborateSceneStreamEvent) => void) => {
    const handler = (streamEvent: CollaborateSceneStreamEvent): void => {
      listener(streamEvent);
    };
    return transport.on(SCENE_COLLABORATION_EVENT_CHANNEL, handler);
  },
  suggestAssistantIntents: (req: SuggestAssistantIntentsRequest) =>
    transport.invoke("assistant:suggestIntents", req) as Promise<SuggestAssistantIntentsResult>,
  listAssistantConversations: (query?: AssistantConversationHistoryQuery) =>
    transport.invoke("assistant:history:list", query) as Promise<AssistantConversationRecord[]>,
  suggestImageEdits: (req: SuggestImageEditsRequest) =>
    transport.invoke("prompt:suggestImageEdits", req) as Promise<SuggestImageEditsResult>,
  listHistory: (boardId?: string) => (boardId ? transport.invoke(WORKBENCH_COMMANDS.listHistory, boardId) : transport.invoke(WORKBENCH_COMMANDS.listHistory)) as Promise<GenerationJob[]>,
  listSceneHistory: () => transport.invoke("history:scenes") as Promise<GenerationJob[]>,
  listHistoryPage: (boardId?: string, cursor?: string, limit?: number) =>
    transport.invoke("history:page", boardId, cursor, limit) as Promise<{ items: GenerationJob[]; total: number; nextCursor?: string }>,
  recoverOfficialGenerations: () => transport.invoke("official:recoverGenerations") as Promise<{
    recovered: number;
    pending: number;
    boardIds: string[];
  }>,
  listSceneMedia: () => transport.invoke("sceneMedia:list") as Promise<SceneMediaSummary[]>,
  addSceneExample: (sceneId: string, sourcePath: string, prompt: string) =>
    transport.invoke("sceneMedia:addExample", sceneId, sourcePath, prompt) as Promise<{ ok: boolean }>,
  deleteSceneResult: (sceneId: string, resultId: string) =>
    transport.invoke("sceneMedia:deleteResult", sceneId, resultId) as Promise<{ ok: boolean }>,
  reorderSceneResults: (sceneId: string, resultIds: string[]) =>
    transport.invoke("sceneMedia:reorderResults", sceneId, resultIds) as Promise<{ ok: boolean }>,
  setSceneCover: (sceneId: string, sourcePath: string, replaceCoverId?: string) =>
    transport.invoke("sceneMedia:setCover", sceneId, sourcePath, replaceCoverId) as Promise<{ ok: boolean }>,
  removeSceneCover: (sceneId: string, coverId: string) =>
    transport.invoke("sceneMedia:removeCover", sceneId, coverId) as Promise<{ ok: boolean }>,
  clearSceneCovers: (sceneId: string) =>
    transport.invoke("sceneMedia:clearCovers", sceneId) as Promise<{ ok: boolean; count: number }>,
  reorderSceneCovers: (sceneId: string, coverIds: string[]) =>
    transport.invoke("sceneMedia:reorderCovers", sceneId, coverIds) as Promise<{ ok: boolean }>,
  updateSceneCoverFocus: (sceneId: string, coverId: string, focus: SceneCoverFocus) =>
    transport.invoke("sceneMedia:updateCoverFocus", sceneId, coverId, focus) as Promise<{ ok: boolean }>,
  deleteSceneMedia: (sceneId: string) =>
    transport.invoke("sceneMedia:deleteScene", sceneId) as Promise<{ ok: boolean }>,
  exportScene: (scene: SceneTemplateData) =>
    transport.invoke("scenes:export", scene) as Promise<{
      ok: boolean;
      path?: string;
      instanceCount?: number;
      coverCount?: number;
    }>,
  submitSceneTemplate: (scene: SceneTemplateData, authorName: string, exampleResultIds: string[]) =>
    transport.invoke("scenes:submitTemplate", scene, authorName, exampleResultIds) as Promise<TemplateSubmissionResult>,
  getSceneTemplateSubmission: (sourceTemplateId: string) =>
    transport.invoke("scenes:getTemplateSubmission", sourceTemplateId) as Promise<TemplateSubmissionResult | null>,
  importScene: () => transport.invoke("scenes:import") as Promise<SceneTemplateImportResult | null>,
  importSceneData: (data: ArrayBuffer) =>
    transport.invoke("scenes:importData", data) as Promise<SceneTemplateImportResult>,
  clearHistory: (boardId: string) =>
    transport.invoke("history:clear", boardId) as Promise<{ ok: boolean; count: number }>,
  reuseHistory: (jobId: string) => transport.invoke("history:reuse", jobId) as Promise<GenerationJob | null>,
  saveAsset: (sourcePath: string) =>
    transport.invoke("asset:save", sourcePath) as Promise<{ ok: boolean; path?: string; directory?: string }>,
  chooseDownloadDirectory: () =>
    transport.invoke("downloads:chooseDirectory") as Promise<{ ok: boolean; path?: string }>,
  setDownloadDirectory: (directory: string) =>
    transport.invoke("downloads:setDirectory", directory) as Promise<{ ok: boolean; path?: string }>,
  openDownloadedPath: (targetPath: string) =>
    transport.invoke("downloads:openPath", targetPath) as Promise<{ ok: boolean }>,
  shareDownloadedPath: (targetPath: string) =>
    transport.invoke("downloads:sharePath", targetPath) as Promise<{ ok: boolean } & OnlineShareSession>,
  startOnlineImageShare: (request: OnlineImageShareRequest) =>
    transport.invoke("sharing:startImage", request) as Promise<{ ok: boolean } & OnlineShareSession>,
  getActiveOnlineShare: () =>
    transport.invoke("sharing:getActive") as Promise<OnlineShareSession | null>,
  stopOnlineShare: () =>
    transport.invoke("sharing:stop") as Promise<{ ok: boolean }>,
  shareWechatStickerPackage: (
    folderPath: string,
    zipPath?: string,
    origin?: OnlineShareCanvasOrigin
  ) =>
    transport.invoke("downloads:shareWechatPackage", {
      folderPath,
      zipPath,
      ...(origin ? { origin } : {})
    }) as Promise<{
      ok: boolean;
      url: string;
      expiresAt: number;
    }>,
  stopSharingDownloadedPath: () =>
    transport.invoke("downloads:stopSharing") as Promise<{ ok: boolean }>,
  saveAssetsAsZip: (sourcePaths: string[]) =>
    transport.invoke(WORKBENCH_COMMANDS.saveAssetsAsZip, sourcePaths) as Promise<{
      ok: boolean;
      path?: string;
      directory?: string;
      count?: number;
      skipped?: number;
    }>,
  saveWechatStickerPackage: (request: SaveWechatStickerPackageRequest) =>
    transport.invoke("asset:saveWechatStickerPackage", request) as Promise<SaveWechatStickerPackageResult>,
  writeClipboardImage: (request: WriteClipboardImageRequest) =>
    transport.invoke("clipboard:writeImage", request) as Promise<{ ok: true }>,
  deleteAsset: (sourcePath: string) => transport.invoke("asset:delete", sourcePath) as Promise<{ ok: boolean; message?: string }>,
  importUploadedImage: (dataUrl: string) => transport.invoke(WORKBENCH_COMMANDS.importUploadedImage, dataUrl) as Promise<{ path: string }>,
  importVideo: (data: ArrayBuffer, mimeType: string) =>
    transport.invoke(WORKBENCH_COMMANDS.importVideo, data, mimeType) as Promise<{ path: string; mimeType: string; videoUrl: string }>,
  importAudio: (data: ArrayBuffer, mimeType: string) =>
    transport.invoke("audio:import", data, mimeType) as Promise<{ path: string; mimeType: string; audioUrl: string }>,
  getVideoCapabilities: () =>
    transport.invoke("video:capabilities") as Promise<VideoProviderCapabilities>,
  startVideoGeneration: (input: VideoGenerationInput) =>
    transport.invoke(WORKBENCH_COMMANDS.startVideoGeneration, input) as Promise<VideoGenerationJob>,
  listVideoJobs: (boardId?: string) => (boardId ? transport.invoke("video:list", boardId) : transport.invoke("video:list")) as Promise<VideoGenerationJob[]>,
  clearVideoJobs: (boardId: string) => transport.invoke("video:clear", boardId) as Promise<number>,
  getVideoJob: (id: string) => transport.invoke(WORKBENCH_COMMANDS.getVideoJob, id) as Promise<VideoGenerationJob | null>,
  recoverVideoGenerations: () => transport.invoke("video:recover") as Promise<VideoGenerationJob[]>,
  stopVideoPolling: (id: string) =>
    transport.invoke(WORKBENCH_COMMANDS.stopVideoPolling, id) as Promise<{ stopped: boolean; job: VideoGenerationJob | null }>,
  saveVideo: (sourcePath: string) =>
    transport.invoke("video:save", sourcePath) as Promise<{ ok: boolean; path?: string }>,
  revealVideo: (sourcePath: string) =>
    transport.invoke("video:reveal", sourcePath) as Promise<{ ok: boolean }>,
  getMediaToolsState: () => transport.invoke("mediaTools:getState") as Promise<MediaToolsState>,
  installMediaTools: () => transport.invoke("mediaTools:install") as Promise<MediaToolsState>,
  cancelMediaToolsDownload: () => transport.invoke("mediaTools:cancel") as Promise<void>,
  onMediaToolsState: (listener: (state: MediaToolsState) => void) => {
    const handler = (state: MediaToolsState): void => listener(state);
    return transport.on(MEDIA_TOOLS_STATE_CHANNEL, handler);
  },
  createVideoSequence: (input: { boardId: string; name?: string; imageNodeIds: string[]; defaults?: Partial<VideoSequence["defaults"]> }) =>
    transport.invoke("videoSequence:create", input) as Promise<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>,
  createVideoSequenceFromVideos: (input: { boardId: string; name?: string; videoNodeIds: string[]; defaults?: Partial<VideoSequence["defaults"]> }) =>
    transport.invoke("videoSequence:createFromVideos", input) as Promise<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>,
  getVideoSequence: (input: { boardId: string; sequenceId: string }) =>
    transport.invoke("videoSequence:get", input) as Promise<(VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }) | null>,
  listVideoSequences: (boardId: string) =>
    transport.invoke("videoSequence:list", { boardId }) as Promise<Array<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>>,
  mutateVideoSequence: (operation: typeof VIDEO_SEQUENCE_MUTATIONS[number], input: Record<string, unknown>) =>
    transport.invoke(`videoSequence:${operation}`, input) as Promise<VideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] }>,
  deleteVideoSequence: (input: { boardId: string; sequenceId: string; expectedRevision: number }) =>
    transport.invoke("videoSequence:delete", input) as Promise<{ ok: true }>,
  runVideoSequence: (input: { boardId: string; sequenceId: string; expectedRevision: number; scope: "affected" | "all" | { segmentIds: string[] }; generationAttemptId?: string; inputFingerprint?: string; quoteId?: string; quoteExpiresAt?: string; idempotencyKey?: string; priceSnapshot?: GenerateImageInput["priceSnapshot"] }) =>
    transport.invoke("videoSequence:run", input) as Promise<{ sequence: VideoSequence; jobs: VideoSequenceTask[]; estimate?: { currency: "credit"; total: number; authoritative: boolean } }>,
  retryVideoSequence: (input: { boardId: string; sequenceId: string; segmentIds: string[] }) =>
    transport.invoke("videoSequence:retry", input) as Promise<{ sequence: VideoSequence; jobs: VideoSequenceTask[] }>,
  pauseVideoSequence: (input: { boardId: string; sequenceId: string }) => transport.invoke("videoSequence:pause", input) as Promise<VideoSequence>,
  resumeVideoSequence: (input: { boardId: string; sequenceId: string }) => transport.invoke("videoSequence:resume", input) as Promise<{ sequence: VideoSequence; jobs: VideoSequenceTask[] }>,
  cancelVideoSequenceTask: (taskId: string) => transport.invoke("videoSequence:cancelTask", { taskId }) as Promise<{ supported: boolean; cancelled: boolean; job: VideoSequenceTask | null }>,
  exportVideoSequence: (input: { boardId: string; sequenceId: string; expectedRevision: number; fileName?: string; resolution?: string; fps?: number; includeAudio?: boolean }) => transport.invoke("videoSequence:export", input) as Promise<VideoSequenceExportJob>,
  getVideoSequenceExport: (exportJobId: string) => transport.invoke("videoSequence:getExport", { exportJobId }) as Promise<VideoSequenceExportJob | null>,
  saveVideoSequenceExport: (input: { boardId: string; sequenceId: string; exportVersionId: string }) => transport.invoke("videoSequence:saveExport", input) as Promise<{ ok: boolean; path?: string }>,
  listVideoSequenceTemplates: () => transport.invoke("videoSequenceTemplate:list") as Promise<VideoSequenceTemplate[]>,
  createVideoSequenceTemplate: (input: { sequence: VideoSequence; name: string; description: string }) => transport.invoke("videoSequenceTemplate:create", input) as Promise<VideoSequenceTemplate>,
  updateVideoSequenceTemplate: (template: VideoSequenceTemplate, expectedVersion: number) => transport.invoke("videoSequenceTemplate:update", { template, expectedVersion }) as Promise<VideoSequenceTemplate>,
  deleteVideoSequenceTemplate: (templateId: string, expectedVersion: number) => transport.invoke("videoSequenceTemplate:delete", { templateId, expectedVersion }) as Promise<{ ok: true }>,
  instantiateVideoSequenceTemplate: (input: { boardId: string; templateId: string; imageNodeIds: string[] }) => transport.invoke("videoSequenceTemplate:instantiate", input) as Promise<VideoSequence>,
  exportVideoSequenceTemplate: (templateId: string) => transport.invoke("videoSequenceTemplate:export", { templateId }) as Promise<{ ok: boolean; path?: string }>,
  importVideoSequenceTemplate: () => transport.invoke("videoSequenceTemplate:import") as Promise<VideoSequenceTemplate | null>,
  importVideoSequenceTemplateData: (data: ArrayBuffer) => transport.invoke("videoSequenceTemplate:importData", data) as Promise<VideoSequenceTemplate>,
  onVideoSequenceEvent: (listener: (event: unknown) => void) => {
    const handler = (payload: unknown): void => listener(payload);
    return transport.on(VIDEO_SEQUENCE_EVENT_CHANNEL, handler);
  },
  importImageUrl: (imageUrl: string) =>
    transport.invoke("asset:importUrl", imageUrl) as Promise<{
      path: string;
      dataUrl: string;
      width: number;
      height: number;
    }>,
  readOnlineShareImport: (source: string) =>
    transport.invoke("sharing:readImport", source) as Promise<OnlineShareImportData>,
  readAssetDataUrl: (sourcePath: string) => transport.invoke(WORKBENCH_COMMANDS.readAssetDataUrl, sourcePath) as Promise<string>,
  getAssetThumbnail: (sourcePath: string, maxSize?: number) =>
    transport.invoke("asset:thumbnail", sourcePath, maxSize) as Promise<string>,
  sliceImage: (request: SliceImageRequest) =>
    transport.invoke("asset:slice", request) as Promise<SliceImageResult[]>,
  analyzeSliceSubjects: (request: AnalyzeSliceSubjectsRequest) =>
    transport.invoke("asset:analyzeSliceSubjects", request) as Promise<AnalyzeSliceSubjectsResult>,
  listBoards: () => transport.invoke(WORKBENCH_COMMANDS.listBoards) as Promise<BoardSummary[]>,
  getBoard: (id: string) => transport.invoke(WORKBENCH_COMMANDS.getBoard, id) as Promise<BoardDetail | null>,
  getComicDramaBoardSnapshot: (boardId: string) =>
    transport.invoke(COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL, boardId) as Promise<ComicDramaBoardSnapshot>,
  applyComicDramaMutationPlan: (plan: BoardMutationPlan) =>
    transport.invoke(COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL, plan) as Promise<BoardMutationResult>,
  createBoard: (name?: string) => transport.invoke(WORKBENCH_COMMANDS.createBoard, name) as Promise<BoardData>,
  createComicDramaProject: (input: import("./types.js").ComicDramaProjectCreateInput) =>
    transport.invoke("boards:createComicDramaProject", input) as Promise<import("./types.js").ComicDramaProjectCreateResult>,
  saveBoard: (payload: BoardSavePayload) => transport.invoke("boards:save", payload) as Promise<BoardSummary>,
  moveBoardImage: (boardId: string, nodeId: string, x: number, y: number) =>
    transport.invoke(WORKBENCH_COMMANDS.moveBoardImage, boardId, nodeId, x, y) as Promise<{
      boardId: string;
      nodeId: string;
      previous: { x: number; y: number };
      position: { x: number; y: number };
    }>,
  resizeBoardImage: (boardId: string, nodeId: string, displayWidth: number) =>
    transport.invoke(WORKBENCH_COMMANDS.resizeBoardImage, boardId, nodeId, displayWidth) as Promise<{
      boardId: string;
      nodeId: string;
      previousWidth: number;
      displayWidth: number;
      displayHeight: number;
    }>,
  arrangeBoardImages: (boardId: string, nodeIds: string[], mode: "horizontal" | "vertical" | "grid", gap?: number) =>
    transport.invoke(WORKBENCH_COMMANDS.arrangeBoardImages, boardId, nodeIds, mode, gap) as Promise<{
      boardId: string;
      mode: "horizontal" | "vertical" | "grid";
      gap: number;
      positions: Array<{ nodeId: string; x: number; y: number }>;
    }>,
  duplicateBoardImages: (boardId: string, nodeIds: string[], offset?: number) =>
    transport.invoke(WORKBENCH_COMMANDS.duplicateBoardImages, boardId, nodeIds, offset) as Promise<{
      boardId: string;
      copies: Array<{ sourceNodeId: string; nodeId: string; x: number; y: number }>;
    }>,
  setBoardImageVersion: (boardId: string, nodeId: string, versionIndex: number) =>
    transport.invoke(WORKBENCH_COMMANDS.setBoardImageVersion, boardId, nodeId, versionIndex) as Promise<{
      boardId: string;
      nodeId: string;
      previousVersionIndex: number;
      versionIndex: number;
      versionCount: number;
      imagePath: string;
    }>,
  renameBoard: (id: string, name: string) => transport.invoke("boards:rename", id, name) as Promise<BoardSummary | null>,
  duplicateBoard: (id: string) => transport.invoke("boards:duplicate", id) as Promise<BoardSummary | null>,
  deleteBoard: (id: string) => transport.invoke("boards:delete", id) as Promise<{ ok: boolean }>,
  listTrashedBoards: () => transport.invoke("boards:trash:list") as Promise<TrashedBoardSummary[]>,
  restoreBoard: (id: string) =>
    transport.invoke("boards:trash:restore", id) as Promise<BoardSummary | null>,
  permanentlyDeleteBoard: (id: string) =>
    transport.invoke("boards:trash:delete", id) as Promise<{ ok: boolean }>,
  emptyBoardTrash: () =>
    transport.invoke("boards:trash:empty") as Promise<{ ok: boolean; count: number }>,
  listTrashedBoardImages: () =>
    transport.invoke(WORKBENCH_COMMANDS.listTrashedBoardImages) as Promise<TrashedBoardImage[]>,
  trashBoardImages: (boardId: string, nodeIds: string[]) =>
    transport.invoke(WORKBENCH_COMMANDS.trashBoardImages, boardId, nodeIds) as Promise<{
      count: number;
      items: Array<{ trashId: string; nodeId: string }>;
    }>,
  restoreTrashedBoardImage: (id: string) =>
    transport.invoke(WORKBENCH_COMMANDS.restoreTrashedBoardImage, id) as Promise<RestoreTrashedBoardImageResult | null>,
  permanentlyDeleteTrashedBoardImage: (id: string) =>
    transport.invoke("boards:images:trash:delete", id) as Promise<{ ok: boolean }>,
  emptyTrashedBoardImages: () =>
    transport.invoke("boards:images:trash:empty") as Promise<{ ok: boolean; count: number }>,
  appendBoardNodes: (id: string, nodes: UnpositionedBoardNode[]) =>
    transport.invoke(WORKBENCH_COMMANDS.appendBoardNodes, id, nodes) as Promise<{ ok: boolean }>,
  appendBoardNodeVersions: (id: string, nodeId: string, versions: BoardNodeVersion[]) =>
    transport.invoke(WORKBENCH_COMMANDS.appendBoardNodeVersions, id, nodeId, versions) as Promise<{ ok: boolean }>,
  getBoardsState: () => transport.invoke(WORKBENCH_COMMANDS.getBoardsState) as Promise<{ lastOpenedBoardId?: string }>,
  setLastOpenedBoard: (id: string) => transport.invoke("boards:setLastOpened", id) as Promise<{ ok: boolean }>,
  exportBoard: (id: string) => transport.invoke("boards:export", id) as Promise<{ ok: boolean; path?: string }>,
  importBoard: () => transport.invoke("boards:import") as Promise<BoardSummary | null>,
  importBoardData: (data: ArrayBuffer) => transport.invoke("boards:importData", data) as Promise<BoardSummary>,
  listAssets: (cursor?: string, limit?: number) =>
    transport.invoke(WORKBENCH_COMMANDS.listAssets, cursor, limit) as Promise<AssetLibraryPage>,
  getAsset: (boardId: string, nodeId: string) =>
    transport.invoke("assets:item", boardId, nodeId) as Promise<AssetLibraryItem | null>,
  getAssetDetail: (boardId: string, nodeId: string) =>
    transport.invoke("assets:detail", boardId, nodeId) as Promise<AssetDetailData>,
  getJobPrompt: (jobId: string) => transport.invoke("assets:jobPrompt", jobId) as Promise<JobPromptInfo>,
  listComments: () => transport.invoke("comments:list") as Promise<AssetComment[]>,
  addComment: (imagePath: string, text: string, position?: AssetComment["position"]) =>
    transport.invoke("comments:add", imagePath, text, position) as Promise<AssetComment>,
  updateCommentPosition: (id: string, position: NonNullable<AssetComment["position"]>) =>
    transport.invoke("comments:updatePosition", id, position) as Promise<AssetComment | null>,
  removeComment: (id: string) => transport.invoke("comments:remove", id) as Promise<{ ok: boolean }>,
  getAssetMeta: (imagePath: string) =>
    transport.invoke("assets:meta", imagePath) as Promise<AssetTagInfo>,
  toggleAssetFavorite: (imagePath: string) =>
    transport.invoke("assets:toggleFavorite", imagePath) as Promise<AssetTagInfo>,
  setAssetTags: (imagePath: string, tags: string[]) =>
    transport.invoke("assets:setTags", imagePath, tags) as Promise<AssetTagInfo>,
  listAssetMeta: () => transport.invoke("assets:metaList") as Promise<AssetTagInfo[]>,
  saveImageDataUrl: (dataUrl: string, suggestedName?: string) =>
    transport.invoke("asset:saveDataUrl", dataUrl, suggestedName) as Promise<{
      ok: boolean;
      path?: string;
      directory?: string;
    }>
  };
}

export type ImageWorkbenchApi = ReturnType<typeof createWorkbenchClient>;

/** Derive the server allowlists from the exact API that both renderers use. */
export function collectWorkbenchChannels(): { invoke: Set<string>; send: Set<string>; events: Set<string> } {
  const channels = { invoke: new Set<string>(), send: new Set<string>(), events: new Set<string>() };
  const api = createWorkbenchClient({
    invoke: (channel) => { channels.invoke.add(channel); return Promise.resolve(undefined); },
    send: (channel) => { channels.send.add(channel); },
    on: (channel) => { channels.events.add(channel); return () => undefined; }
  });
  // Client methods only forward or package their arguments; no business actions run here.
  for (const [name, method] of Object.entries(api)) {
    if (name === "mutateVideoSequence") continue;
    (method as (...args: unknown[]) => unknown)();
  }
  for (const operation of VIDEO_SEQUENCE_MUTATIONS) api.mutateVideoSequence(operation, {});
  return channels;
}
