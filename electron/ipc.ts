import { createAssistantSessionService } from "./application/assistant-session.js";
import { normalizeAssistantReferenceImage } from "./application/assistant-reference-image.js";
import { normalizeTemplateExtractionScenario, normalizeMemoryQueryValue } from "./application/assistant-request.js";
export { validateSceneCollaborationRequest } from "./application/assistant-request.js";
import { createAssetMaintenance } from "./application/asset-maintenance.js";
import { importBoardBuffer } from "./application/board-import.js";
import { ONLINE_SHARING_AVAILABLE } from "../shared/sharing-availability.js";
import { handoffBoardComments } from "./agent-comment-handoff.js";
import { imageDimensionsFromHeader } from "./media/image-metadata.js";
import type { PsdLayerInput } from "./media/psd-worker.js";
import { createImageGenerationCommand } from "./application/image-generation.js";
import { registerModificationRequestIpc } from "./modification-request-ipc.js";
import { registerImageDeliveryIpc } from "./image-delivery-ipc.js";
import { ImageProviderRegistry } from "./providers/image-registry.js";
import { checkImageGeneration, checkProviderConnection, localCredentialCheck, newProviderTestResult } from "./providers/diagnostics.js";
import { registerVideoIpc } from "./video/video-ipc.js";
export { registerVideoIpc } from "./video/video-ipc.js";
import { AssetCatalog } from "./application/asset-catalog.js";
import { encodePsdInWorker } from "./media/psd-worker-client.js";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  shell,
  type IpcMainInvokeEvent,
  type NativeImage
} from "electron";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { mergeAssistantToolCall, type AssistantToolCall } from "../shared/assistant-display.js";
import {
  SCENE_COLLABORATION_CANCEL_CHANNEL,
  SCENE_COLLABORATION_EVENT_CHANNEL,
  SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL,
  SCENE_COLLABORATION_START_CHANNEL,
  type SceneCollaborationInteractionResponsePayload,
  type StartSceneCollaborationPayload
} from "../shared/assistant.js";
import { isComicDramaNode } from "../shared/comic-drama.js";
import type { MasterGoReconstructionRequest, PrepareMasterGoReconstructionRequest } from "../shared/mastergo-reconstruction.js";
import { PI_AGENT_LOG_EVENT_CHANNEL } from "../shared/pi-agent-log.js";
import { getProviderModels } from "../shared/provider-models.js";
import {
  AppIconPreference,
  AppSettings,
  AssetComment,
  AssetDetailData,
  AssetLibraryItem,
  AssetReference,
  AssetVersion,
  AssistantConversationHistoryQuery,
  AssistantConversationRecord,
  CodexAuthStatus,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  CollaborateSceneStreamEvent,
  EnhancePromptRequest,
  EnhancePromptResult,
  FalModelCategory,
  FalModelOption,
  GenerateImageInput,
  isBoardImageNode,
  isBoardVideoNode,
  JobPromptInfo,
  OnlineShareImportData,
  ProviderConfig,
  ProviderModelOption,
  ProviderTestResult,
  ProviderTestOptions,
  SaveWechatStickerPackageRequest,
  SaveWechatStickerPackageResult,
  SceneAssistantInteraction,
  SceneCoverFocus,
  SceneMediaSummary,
  SceneTemplateData,
  SceneTemplateImportResult,
  SuggestAssistantIntentsRequest,
  SuggestAssistantIntentsResult,
  SuggestImageEditsRequest,
  SuggestImageEditsResult,
  UploadAppIconRequest,
  VideoGenerationJob,
  VideoProviderModelOption,
  WriteClipboardImageRequest,
  type BoardConnection,
  type BoardData,
  type BoardVideoNode,
  type PaidMediaQuoteRequest,
  type TextProviderConfig,
  type VideoProviderConfig
} from "../shared/types.js";
import { videoProviderModelOptionFromCapability } from "../shared/video-provider-models.js";
import { applyAppIcon, createCustomAppIcon, normalizeAppIcon } from "./app-icon.js";
import { buildAssetArchive, buildNamedArchive, type AssetArchiveItem, type NamedArchiveItem } from "./asset-archive.js";
import { registerAssetIoIpc } from "./asset-io-ipc.js";
import { resolveAssetFileCreatedAt, sortAssetsNewestFirst } from "./asset-library-order.js";
import {
  listAssistantSkills,
  readAssistantSkill,
  resetAssistantSkillOverride,
  resolveAssistantSkillPaths,
  saveAssistantSkillOverride
} from "./assistant-skills.js";
import { CodexOAuthService } from "./auth/codex-oauth.js";
import { buildBoardArchive } from "./board-archive.js";
import { registerBoardIpc } from "./board-ipc.js";
import {
  COMIC_DRAMA_AGENT_TOOL_NAMES,
  createComicDramaAgentTools,
  type ComicMediaOperation,
  type ComicMediaQuote
} from "./comic-drama-agent-tools.js";
import { registerComicDramaIpc } from "./comic-drama-ipc.js";
import { registerPluginIpc } from "./plugins/plugin-ipc.js";
import { ImageTaskQueue, ImageWorkerClient } from "./image-worker-client.js";
import { LocalInspirationClient } from "./inspiration-client.js";
import type { LicenseService } from "./licensing/service.js";
import { MasterGoBridge } from "./mastergo-bridge.js";
import { callLocalApi } from "./local-api.js";
import { getAgentIntegrationStatus, installAgentSkill, uninstallAgentSkill, removeLegacyIntegration, setSkillAutoInstallDeclined, syncAgentSkills, type CodingAgentId } from "./agent-integration.js";
import { getCliInstallationStatus, installCli } from "./cli-installation.js";
import { FfmpegService } from "./media/ffmpeg-service.js";
import { PaidMediaQuoteService } from "./paid-media-quote.js";
import { PiAgentLogStore } from "./pi-agent-log.js";
import { discoverPiAgentResources } from "./pi-agent-resources.js";
import { createIterlayAgentTools } from "./pi-agent-tools.js";
import { ManagerProductAnalyticsClient } from "./product-analytics-client.js";
import { ArkImageProvider } from "./providers/ark.js";
import { BailianImageProvider } from "./providers/bailian.js";
import { CodexOAuthImageProvider, CodexOAuthTextTransport } from "./providers/codex-oauth.js";
import { normalizeProviderError, ProviderError } from "./providers/errors.js";
import { FalImageProvider } from "./providers/fal.js";
import { Sub2ApiImageProvider } from "./providers/sub2api.js";
import {
  collaborateSceneAgentStreamWith,
  collaborateSceneAgentWith,
  collaborateSceneStreamWith,
  collaborateSceneWith,
  enhancePromptWith,
  extractAssistantMemoriesWith,
  OpenAICompatibleTextTransport,
  suggestAssistantIntentsWith,
  suggestImageEditsWith,
  type TextTransport
} from "./providers/text-assistant.js";

import { MiniMaxVideoProvider } from "./providers/video-minimax.js";
import { OpenRouterVideoProvider } from "./providers/video-openrouter.js";

import { ManagerPublicShareClient } from "./public-share-client.js";
import { buildSceneArchive, parseSceneArchive } from "./scene-archive.js";
import { registerSettingsIpc } from "./settings-ipc.js";
import { registerSharingIpc } from "./sharing-ipc.js";
import { AssetMetaStore } from "./storage/asset-meta-store.js";
import { AssetStore, decodeImageDataUrl, MAX_MANAGED_IMAGE_BYTES, mimeFromExtension } from "./storage/asset-store.js";
import { AssistantConversationStore } from "./storage/assistant-conversation-store.js";
import { BoardImageTrashStore } from "./storage/board-image-trash-store.js";
import { BoardStore } from "./storage/board-store.js";
import { CommentStore } from "./storage/comment-store.js";
import { HistoryStore } from "./storage/history-store.js";
import { MemoryStore, type MemoryEventInput } from "./storage/memory-store.js";
import { OnboardingStore } from "./storage/onboarding-store.js";
import { SceneMediaStore, type StoredSceneMedia } from "./storage/scene-media-store.js";
import { SettingsStore } from "./storage/settings-store.js";
import { ThumbHashStore, type ThumbHashEntry } from "./storage/thumbhash-store.js";
import { VideoSequenceStore } from "./storage/video-sequence-store.js";
import { VideoSequenceTemplateStore } from "./storage/video-sequence-template-store.js";
import { VideoTaskStore } from "./storage/video-task-store.js";
import { openSystemNotificationSettings, showTestSystemNotification } from "./system-notification.js";
import type { ThumbHashResult } from "./thumbhash-encoder.js";
import { VideoGenerationService } from "./video-generation-service.js";
import { registerVideoSequenceIpc } from "./video/video-sequence-ipc.js";
import { VideoSequenceScheduler } from "./video/video-sequence-scheduler.js";
import { resolveWindowsTitleBarOverlay } from "./window-chrome.js";

function updateWindowChromeTheme(event: IpcMainInvokeEvent, theme: AppSettings["theme"]): void {
  if (process.platform !== "win32") return;
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return;
  window.setTitleBarOverlay(resolveWindowsTitleBarOverlay(theme, nativeTheme.shouldUseDarkColors));
}

export function createVideoAssetLibraryItem(
  node: BoardVideoNode,
  board: Pick<BoardData, "id" | "name" | "updatedAt">,
  job: VideoGenerationJob | undefined,
  meta: { favorite: boolean; tags: string[] } | undefined,
  toAssetUrl: (filePath: string) => string
): AssetLibraryItem {
  const dataUrl = toAssetUrl(node.videoPath);
  const posterUrl = node.posterPath ? toAssetUrl(node.posterPath) : undefined;
  return {
    mediaType: "video",
    imagePath: node.videoPath,
    dataUrl,
    thumbnailUrl: posterUrl || dataUrl,
    ...(posterUrl ? { posterUrl } : {}),
    boardId: board.id,
    boardName: board.name,
    nodeId: node.id,
    jobId: node.jobId,
    prompt: job?.input.prompt || "",
    size: node.width && node.height ? `${node.width}x${node.height}` : undefined,
    createdAt: job?.createdAt ?? board.updatedAt,
    width: node.width,
    height: node.height,
    durationMs: node.durationMs,
    source: node.source === "upload" ? "upload" : "generated",
    favorite: meta?.favorite ?? false,
    tags: meta?.tags ?? []
  };
}

export async function decorateAssetLibraryItem(
  item: AssetLibraryItem,
  getThumbnail: (sourcePath: string) => Promise<string>,
  getThumbHash: (sourcePath: string) => Promise<ThumbHashEntry | null>
): Promise<{ item: AssetLibraryItem; newEntry?: ThumbHashEntry }> {
  if (item.mediaType === "video") return { item };
  let decorated = item;
  try {
    decorated = { ...item, thumbnailUrl: await getThumbnail(item.imagePath) };
  } catch {
    // Thumbnail failure falls back to the original controlled URL.
  }
  if (decorated.thumbHash) return { item: decorated };
  const entry = await getThumbHash(item.imagePath);
  if (!entry) return { item: decorated };
  return {
    item: {
      ...decorated,
      thumbHash: entry.hash,
      hasAlpha: entry.hasAlpha,
      width: decorated.width ?? entry.width,
      height: decorated.height ?? entry.height
    },
    newEntry: entry
  };
}

interface IpcDependencies {
  settings: SettingsStore;
  onboarding: OnboardingStore;
  history: HistoryStore;
  videoTasks: VideoTaskStore;
  videoSequences: VideoSequenceStore;
  videoSequenceTemplates: VideoSequenceTemplateStore;
  videoSequenceScheduler: VideoSequenceScheduler;
  ffmpeg: FfmpegService;
  videoService: VideoGenerationService;
  assets: AssetStore;
  boards: BoardStore;
  boardImageTrash: BoardImageTrashStore;
  comments: CommentStore;
  assistantConversations: AssistantConversationStore;
  memories: MemoryStore;
  assetMeta: AssetMetaStore;
  thumbHashes: ThumbHashStore;
  sceneMedia: SceneMediaStore;
  masterGoBridge: MasterGoBridge;
  piAgentLogs: PiAgentLogStore;
  license: LicenseService;
  /** Older integration fixtures may pass this field; it is never used. */
  officialProvider?: unknown;
  provider: Sub2ApiImageProvider;
  codexProvider: CodexOAuthImageProvider;
  codexAuth: CodexOAuthService;
  falProvider: FalImageProvider;
  bailianProvider: BailianImageProvider;
  arkProvider: ArkImageProvider;
  managerApiBaseUrl: string;
}

export function registerIpc({
  settings,
  onboarding,
  history,
  videoTasks,
  videoSequences,
  videoSequenceTemplates,
  videoSequenceScheduler,
  ffmpeg,
  videoService,
  assets,
  boards,
  boardImageTrash,
  comments,
  assistantConversations,
  memories,
  assetMeta,
  thumbHashes,
  sceneMedia,
  masterGoBridge,
  piAgentLogs,
  license,
  provider,
  codexProvider,
  codexAuth,
  falProvider,
  bailianProvider,
  arkProvider,
  managerApiBaseUrl
}: IpcDependencies): () => void {
  const modifications = registerModificationRequestIpc(boards,assets,history);
  const assetCatalog = new AssetCatalog(loadAssetCatalog, async (items) => {
    const decorated = await mapWithConcurrency(items, 4, decorateAssetItem);
    const entries = decorated.flatMap((result) => result.newEntry ? [result.newEntry] : []);
    if (entries.length) void thumbHashes.putMany(entries).catch((error) => console.warn("素材占位信息写入失败", error));
    return decorated.map((result) => result.item);
  });
  const imageTasks = new ImageTaskQueue();
  registerImageDeliveryIpc({boards,assets,imageTasks});
  const mediaAbort = new AbortController();
  const imageWorker = new ImageWorkerClient();
  const paidMediaQuotes = new PaidMediaQuoteService(() => license.getDeviceId());
  const videoIpc = registerVideoIpc({
    settings,
    assets,
    boards,
    videoTasks,
    videoService,
    onAssetsChanged: () => invalidateAssetCatalog(),
    paidMediaQuotes
  });
  const videoSequenceIpc = registerVideoSequenceIpc({
    store: videoSequences,
    templates: videoSequenceTemplates,
    scheduler: videoSequenceScheduler,
    ffmpeg,
    boards,
    assets,
    settings,
    paidMediaQuotes
  });
  const disposeComicDramaIpc = registerComicDramaIpc(boards);
  const disposePluginIpc = registerPluginIpc();
  const publicShareClient = new ManagerPublicShareClient(
    license,
    managerApiBaseUrl,
    (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init)
  );
  const analytics = new ManagerProductAnalyticsClient(
    license,
    managerApiBaseUrl,
    (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init)
  );
  const sharingIpc = registerSharingIpc({
    settings,
    history,
    assets,
    ensureDownloadDirectory,
    publicShareClient,
    trackShareCreated: (surface) => {
      void analytics.track("share.created", { surface });
    }
  });
  const inspirationClient = new LocalInspirationClient();
  void analytics.track("app.opened");
  const imageProviders = new ImageProviderRegistry({
    "openai-compatible": provider, openrouter: provider, poe: provider,
    "codex-oauth": codexProvider, fal: falProvider, bailian: bailianProvider, ark: arkProvider
  });
  const getProviderAdapter = (config: ProviderConfig) => imageProviders.get(config);

  const { recordMemory, prepareSceneCollaborationRequest, recordAssistantResult } = createAssistantSessionService({
    settings, memories, assets, assistantConversations,
    normalizeReference: (reference, index, maxBytes) => imageTasks.run(
      () => normalizeAssistantReferenceImage(reference, index, maxBytes)
    )
  });
  /** 智能辅助统一走文本 Provider；官方类型由 Credit 与签名请求把关，其余需要本地授权与 API Key。 */
  const resolveTextProvider = (requestedId: string | undefined, capability: "generate" | "edit"): TextProviderConfig => {
    const currentSettings = settings.getSettings();
    const id = requestedId?.trim() || currentSettings.activeTextProviderId;
    const textProvider = currentSettings.textProviders.find((p) => p.id === id) ?? currentSettings.textProviders[0];
    if (!textProvider) {
      throw new ProviderError("INVALID_CONFIG", "请先在设置中配置文本 Provider。");
    }
    {
      license.assertCapability(capability);
    }
    return textProvider;
  };
  const getTextTransport = (config: TextProviderConfig): TextTransport => {

    if (config.type === "codex-oauth") {
      return new CodexOAuthTextTransport(codexAuth, config.authProviderId || config.id, config.model);
    }
    return new OpenAICompatibleTextTransport(config, settings.getApiKey(config.id));
  };
  const resolveAssistantAgentMode = async (
    request: CollaborateSceneRequest,
    textProvider: TextProviderConfig
  ): Promise<boolean> => {
    if (!settings.getSettings().assistantAgentModeEnabled && request.agentMode !== true) return false;
    if (!request.assistantSurface) return false;

    if (textProvider.type === "codex-oauth") {
      const status = codexAuth.getStatus(textProvider.authProviderId || textProvider.id);
      if (status.state !== "connected" && status.state !== "refreshing") {
        throw new ProviderError("AGENT_MODE_UNAVAILABLE", "请先登录 Codex / ChatGPT 文本 Provider。");
      }
      return true;
    }

    if (!textProvider.baseUrl.trim() || !textProvider.model.trim() || !settings.getApiKey(textProvider.id).trim()) {
      throw new ProviderError("AGENT_MODE_UNAVAILABLE", "请先配置第三方文本 Provider 的地址、模型与 API Key。");
    }
    return true;
  };
  const getAssistantAgentResourceOptions = async (
    request: CollaborateSceneRequest,
    uiCallbacks: {
      presentInteraction?: (
        interaction: SceneAssistantInteraction
      ) => Promise<{ action: "submit" | "dismiss"; values?: Record<string, string | string[]> }>;
      presentActivity?: (label: string) => void;
      presentReasoningSummary?: (delta: string) => void;
      presentTool?: (tool: AssistantToolCall) => void;
      presentDirections?: (directions: NonNullable<CollaborateSceneResult["directions"]>) => void;
    } = {}
  ) => {
    const { builtInRoot, overrideRoot } = getAssistantSkillRoots();
    const skills = await resolveAssistantSkillPaths(
      request,
      builtInRoot,
      overrideRoot
    );
    const currentSettings = settings.getSettings();
    const resolvedSettings = request.assistantSurface === "comic-drama"
      ? {
          ...currentSettings,
          piAgentBuiltinTools: [],
          piAgentIterlayTools: [...COMIC_DRAMA_AGENT_TOOL_NAMES],
          piAgentSkillPaths: [],
          piAgentExtensionPaths: []
        }
      : currentSettings;
    const logTaskId = crypto.randomUUID();
    return {
      cwd: app.getAppPath(),
      agentDir: path.join(app.getPath("home"), ".pi", "agent"),
      settings: resolvedSettings,
      requiredSkillPaths: skills.paths,
      requiredSkillIds: skills.ids,
      recordLog: (entry: import("../shared/pi-agent-log.js").PiAgentLogInput) => {
        piAgentLogs.record({ ...entry, taskId: logTaskId });
      },
      ...uiCallbacks
    };
  };
  const createAssistantAgentTools = (
    request: CollaborateSceneRequest,
    agentRunId: string,
    signal?: AbortSignal,
    onComicMutation?: (result: import("../shared/comic-drama.js").BoardMutationResult) => void,
    confirmComicMedia?: (input: {
      quote: ComicMediaQuote;
      operation: ComicMediaOperation;
    }) => Promise<boolean>
  ) => {
    const boardId = request.memoryQuery?.boardId;
    if (request.assistantSurface === "comic-drama") {
      if (!boardId) {
        throw new ProviderError("INVALID_REQUEST", "漫剧 Agent 缺少当前子画板 ID。");
      }
      const mediaTaskKinds = new Map<string, "image" | "video">();
      const mediaTaskOperations = new Map<string, ComicMediaOperation>();
      const finalizedMediaTasks = new Set<string>();
      return createComicDramaAgentTools({
        getSnapshot: (id) => boards.getComicDramaBoardSnapshot(id),
        applyMutation: async (input) => {
          const result = await boards.applyComicDramaAgentMutation(input);
          onComicMutation?.(result);
          return result;
        },
        ...(confirmComicMedia ? {
          issueMediaQuote: async (operation) => {
            const clientRequestId = crypto.randomUUID();
            const inputFingerprint = await fingerprintAgentMediaOperation(operation);
            return issuePaidMediaQuote({
              kind: operation.kind === "video" ? "video" : "image",
              clientRequestId,
              inputFingerprint,
              boardId: operation.boardId,
              requestScope: operation.targetNodeId,
              operation: operation.kind === "video" ? "video:start" : "image:generate",
              providerId: operation.providerId,
              imageCount: operation.count,
              durationSeconds: operation.durationSeconds,
              model: operation.model,
              resolution: operation.resolution,
              generateAudio: operation.generateAudio,
              stage: operation.kind === "character-image"
                ? "character"
                : operation.kind === "video"
                  ? "video"
                  : operation.kind
            });
          },
          confirmMedia: confirmComicMedia,
          generateMedia: async ({ quote, operation }) => {
            const metadata = {
              generationAttemptId: quote.clientRequestId,
              inputFingerprint: quote.inputFingerprint,
              quoteId: quote.quoteId,
              quoteExpiresAt: quote.expiresAt,
              idempotencyKey: [quote.clientRequestId, quote.inputFingerprint, quote.quoteId].join(":"),
              priceSnapshot: quote.priceSnapshot,
              quoteBoardId: boardId,
              quoteRequestScope: operation.targetNodeId,
              quotePurpose: quote.priceSnapshot.stage,
              quoteOperation: operation.kind === "video" ? "video:start" : "image:generate"
            };
            const method = operation.kind === "video" ? "generate_video" : "generate_image";
            const result = await callLocalApi(app.getPath("userData"), method, {
              boardId,
              prompt: operation.prompt,
              providerId: operation.providerId,
              model: operation.model,
              n: operation.count,
              size: operation.size,
              durationSeconds: operation.durationSeconds,
              resolution: operation.resolution,
              generateAudio: operation.generateAudio,
              ...metadata
            }) as { generationId?: string; videoGenerationId?: string; status?: string; boardId?: string };
            const taskId = result.generationId ?? result.videoGenerationId;
            if (!taskId) throw new Error("媒体任务未返回任务 ID。");
            mediaTaskKinds.set(taskId, operation.kind === "video" ? "video" : "image");
            mediaTaskOperations.set(taskId, operation);
            return {
              taskId,
              status: result.status ?? "running",
              boardId: result.boardId ?? boardId
            };
          },
          getMediaStatus: async (taskIds) => Promise.all(taskIds.map(async (taskId) => {
            const kind = mediaTaskKinds.get(taskId);
            if (!kind) throw new Error(`当前 Agent run 中不存在媒体任务：${taskId}`);
            const status = await callLocalApi(
              app.getPath("userData"),
              kind === "video" ? "get_video_generation_status" : "get_generation_status",
              kind === "video" ? { videoGenerationId: taskId } : { generationId: taskId }
            ) as {
              status?: string;
              images?: Array<{ path?: string }>;
              video?: { path?: string };
            } | null;
            const operation = mediaTaskOperations.get(taskId);
            if (status && operation && !finalizedMediaTasks.has(taskId)
              && (status.status === "succeeded" || status.status === "completed")) {
              const board = await boards.getBoard(boardId);
              const source = board?.nodes.find((node) => node.id === operation.targetNodeId);
              const paths = kind === "video"
                ? [status.video?.path].filter((value): value is string => Boolean(value))
                : (status.images ?? []).flatMap((image) => image.path ? [image.path] : []);
              const targets = board?.nodes.filter((node) => (
                paths.some((mediaPath) => (
                  isBoardImageNode(node)
                    ? node.imagePath === mediaPath
                    : isBoardVideoNode(node) && node.videoPath === mediaPath
                ))
              )) ?? [];
              if (board && source && isComicDramaNode(source) && targets.length > 0) {
                const snapshot = await boards.getComicDramaBoardSnapshot(boardId);
                const connections = targets.map((target): BoardConnection => ({
                  id: crypto.randomUUID(),
                  source: source.id,
                  target: target.id,
                  sourceHandle: "source-right",
                  targetHandle: "target-left",
                  kind: "reference",
                  versionBinding: { mode: "pinned", versionId: source.activeVersionId },
                  label: operation.kind === "character-image"
                    ? "角色形象"
                    : operation.kind === "video" ? "片段视频" : operation.kind === "first-frame" ? "首帧" : "尾帧"
                }));
                const inputHash = await fingerprintAgentMediaOperation({
                  taskId,
                  sourceNodeId: source.id,
                  targetNodeIds: targets.map((target) => target.id)
                });
                const result = await boards.applyComicDramaAgentMutation({
                  toolName: "attach_comic_media",
                  idempotencyKey: `attach:${taskId}`,
                  inputHash,
                  plan: {
                    planId: crypto.randomUUID(),
                    boardId,
                    baseRevision: snapshot.revision,
                    preview: {
                      title: "关联漫剧媒体结果",
                      additions: { nodes: 0, connections: connections.length, groups: 0 },
                      impact: "把已完成媒体固定到对应漫剧版本。",
                      cost: "不产生额外媒体费用。"
                    },
                    additions: { nodes: [], connections, groups: [] }
                  }
                });
                finalizedMediaTasks.add(taskId);
                onComicMutation?.(result);
              }
            }
            return status;
          }))
        } : {})
      }, {
        agentRunId,
        conversationId: request.conversationId ?? agentRunId,
        boardId,
        signal
      });
    }
    return createIterlayAgentTools(app.getPath("userData"), { boardId });
  };
  const getAssistantSkillRoots = () => ({
    builtInRoot: app.isPackaged
      ? path.join(process.resourcesPath, "skills", "iterlay-assistants")
      : path.join(app.getAppPath(), "resources", "skills", "iterlay-assistants"),
    overrideRoot: path.join(app.getPath("userData"), "assistant-skills")
  });
  const sceneCollaborationStreams = new Map<
    string,
    {
      controller: AbortController;
      senderId: number;
      pendingInteractions: Map<
        string,
        {
          resolve: (response: {
            action: "submit" | "dismiss";
            values?: Record<string, string | string[]>;
          }) => void;
          reject: (error: Error) => void;
        }
      >;
    }
  >();

  function sendSceneCollaborationEvent(
    sender: Electron.WebContents,
    event: CollaborateSceneStreamEvent
  ): void {
    if (!sender.isDestroyed()) sender.send(SCENE_COLLABORATION_EVENT_CHANNEL, event);
  }

  const toSceneMediaSummary = (media: StoredSceneMedia): SceneMediaSummary => ({
    sceneId: media.sceneId,
    results: media.results.map((result) => ({
      ...result,
      imageUrl: assets.toAssetUrl(result.path)
    })),
    covers: media.covers.map((cover) => ({
      ...cover,
      imageUrl: assets.toAssetUrl(cover.path)
    }))
  });

  function normalizeDownloadDirectory(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("请输入下载目录。");
    const expanded = trimmed === "~"
      ? app.getPath("home")
      : trimmed.startsWith(`~${path.sep}`)
        ? path.join(app.getPath("home"), trimmed.slice(2))
        : trimmed;
    if (!path.isAbsolute(expanded)) throw new Error("请输入完整的绝对路径。");
    return path.normalize(expanded);
  }

  async function ensureDownloadDirectory(input: string): Promise<string> {
    const directory = normalizeDownloadDirectory(input);
    await mkdir(directory, { recursive: true });
    const info = await stat(directory);
    if (!info.isDirectory()) throw new Error("下载路径不是文件夹。");
    return directory;
  }

  async function chooseDownloadDirectory(): Promise<string | null> {
    const configured = settings.getSettings().downloadDirectory?.trim();
    const result = await dialog.showOpenDialog({
      title: "选择下载目录",
      defaultPath: configured || app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"]
    });
    const selected = result.filePaths[0];
    if (result.canceled || !selected) return null;
    const directory = await ensureDownloadDirectory(selected);
    settings.setDownloadDirectory(directory);
    return directory;
  }

  async function resolveDownloadDirectory(): Promise<string | null> {
    const configured = settings.getSettings().downloadDirectory?.trim();
    if (configured) return ensureDownloadDirectory(configured);
    return chooseDownloadDirectory();
  }

  async function availableDownloadPath(directory: string, suggestedName: string): Promise<string> {
    const safeName = Array.from(path.basename(suggestedName))
      .filter((character) => character.charCodeAt(0) >= 32)
      .join("") || "image.png";
    const extension = path.extname(safeName);
    const stem = path.basename(safeName, extension);
    for (let index = 0; index < 10_000; index += 1) {
      const suffix = index === 0 ? "" : `-${index + 1}`;
      const candidate = path.join(directory, `${stem}${suffix}${extension}`);
      try {
        await access(candidate);
      } catch {
        return candidate;
      }
    }
    throw new Error("下载目录中同名文件过多，请更换下载目录。");
  }

  async function loadAssetCatalog(): Promise<AssetLibraryItem[]> {
    const [boardList, jobs, videoJobs, metaList, thumbHashMap] = await Promise.all([
      boards.listBoards(),
      history.listJobs(),
      videoTasks.listJobs(),
      assetMeta.list(),
      thumbHashes.getMap()
    ]);
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const videoJobById = new Map(videoJobs.map((job) => [job.id, job]));
    const metaByPath = new Map(metaList.map((meta) => [meta.imagePath, meta]));
    const seen = new Set<string>();
    const candidates: AssetLibraryItem[] = [];
    const ordered = [...boardList].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    for (const board of ordered) {
      for (const node of board.nodes) {
        if (isBoardVideoNode(node)) {
          if (!node.videoPath || seen.has(node.videoPath)) continue;
          seen.add(node.videoPath);
          candidates.push(createVideoAssetLibraryItem(
            node,
            board,
            videoJobById.get(node.jobId),
            metaByPath.get(node.videoPath),
            (filePath) => assets.toAssetUrl(filePath)
          ));
          continue;
        }
        if (!isBoardImageNode(node) || !node.imagePath || seen.has(node.imagePath)) continue;
        seen.add(node.imagePath);
        const job = jobById.get(node.jobId);
        const meta = metaByPath.get(node.imagePath);
        const thumbEntry = thumbHashMap.get(node.imagePath);
        const dataUrl = assets.toAssetUrl(node.imagePath);
        candidates.push({
          imagePath: node.imagePath,
          dataUrl,
          thumbnailUrl: dataUrl,
          boardId: board.id,
          boardName: board.name,
          nodeId: node.id,
          jobId: node.jobId,
          prompt: job?.prompt || job?.input.prompt || "",
          useCase: job?.useCase ?? job?.input.useCase,
          size:
            node.source === "slice" && node.width && node.height
              ? `${node.width}x${node.height}`
              : job?.input.size ?? (node.width && node.height ? `${node.width}x${node.height}` : undefined),
          createdAt: job?.createdAt ?? board.updatedAt,
          // 生成/本地上传节点可能没写宽高，用 thumbhash 编码时记录的原始尺寸回填。
          width: node.width ?? thumbEntry?.width,
          height: node.height ?? thumbEntry?.height,
          thumbHash: thumbEntry?.hash,
          hasAlpha: thumbEntry?.hasAlpha,
          source: node.source === "upload" ? "upload" : node.source === "slice" ? "slice" : "generated",
          favorite: meta?.favorite ?? false,
          tags: meta?.tags ?? []
        });
      }
    }

    const inspected = await mapWithConcurrency(candidates, 16, async (item) => {
      try {
        const info = await stat(item.imagePath);
        return info.isFile()
          ? { ...item, createdAt: resolveAssetFileCreatedAt(info, item.createdAt) }
          : null;
      } catch {
        return null;
      }
    });
    const items = sortAssetsNewestFirst(inspected.filter((item): item is AssetLibraryItem => item !== null));
    return items;
  }

  async function getAssetThumbnailUrl(sourcePath: string, requestedSize = 480): Promise<string> {
    const maxSize = requestedSize <= 192 ? 192 : 480;
    return assets.getThumbnailUrl(
      sourcePath,
      (readablePath) => imageTasks.run(() => {
        const source = nativeImage.createFromPath(readablePath);
        if (source.isEmpty()) throw new Error("无法生成缩略图。");
        const size = source.getSize();
        const scale = Math.min(1, maxSize / Math.max(size.width, size.height));
        const thumbnail = scale < 1
          ? source.resize({
              width: Math.max(1, Math.round(size.width * scale)),
              height: Math.max(1, Math.round(size.height * scale)),
              quality: "good"
            })
          : source;
        return thumbnail.toPNG({ scaleFactor: 1 });
      }),
      `pixel-bounded-${maxSize}-v1`
    );
  }

  async function createThumbHashForFile(filePath: string): Promise<ThumbHashEntry | null> {
    const result = await createThumbHashForNativeImage(
      await imageTasks.run(() => nativeImage.createFromPath(filePath))
    );
    return result ? { imagePath: filePath, ...result } : null;
  }

  async function createGeneratedBoardNodes(imagePaths: string[], jobId: string) {
    return Promise.all(imagePaths.map(async (imagePath) => {
      const image = await imageTasks.run(() => nativeImage.createFromPath(imagePath));
      const { width, height } = image.isEmpty() ? { width: 0, height: 0 } : image.getSize();
      return {
        id: crypto.randomUUID(),
        imagePath,
        jobId,
        source: "generated" as const,
        width: width || undefined,
        height: height || undefined
      };
    }));
  }

  async function createThumbHashForNativeImage(image: NativeImage): Promise<ThumbHashResult | null> {
    try {
      const pixels = await imageTasks.run(() => {
        if (image.isEmpty()) return null;
        const sourceSize = image.getSize();
        if (sourceSize.width <= 0 || sourceSize.height <= 0) return null;
        const scale = Math.min(1, 100 / Math.max(sourceSize.width, sourceSize.height));
        const small = scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(sourceSize.width * scale)),
              height: Math.max(1, Math.round(sourceSize.height * scale)),
              quality: "good"
            })
          : image;
        const size = small.getSize();
        const bitmap = small.toBitmap({ scaleFactor: 1 });
        if (bitmap.length !== size.width * size.height * 4) return null;
        return {
          bgra: Uint8Array.from(bitmap),
          width: size.width,
          height: size.height,
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height
        };
      });
      return pixels ? await imageWorker.encodeThumbHash(pixels) : null;
    } catch {
      return null;
    }
  }

  /** 入库时的 fire-and-forget 编码：失败静默，由素材库分页时的惰性补算兜底。 */
  function backfillThumbHashes(imagePaths: string[]): void {
    void (async () => {
      const entries: ThumbHashEntry[] = [];
      for (const imagePath of imagePaths) {
        const entry = await createThumbHashForFile(imagePath);
        if (entry) entries.push(entry);
      }
      await thumbHashes.putMany(entries);
    })().catch(() => undefined);
  }

  /** 分页返回前补齐缩略图与 ThumbHash；新算出的 entry 交由调用方批量落盘。 */
  async function decorateAssetItem(
    item: AssetLibraryItem
  ): Promise<{ item: AssetLibraryItem; newEntry?: ThumbHashEntry }> {
    return decorateAssetLibraryItem(
      item,
      (sourcePath) => getAssetThumbnailUrl(sourcePath),
      (sourcePath) => createThumbHashForFile(sourcePath)
    );
  }

  function invalidateAssetCatalog(): void { assetCatalog.invalidate(); }
  const assetMaintenance = createAssetMaintenance({
    assets, boards, history, videoTasks, sceneMedia, comments, assetMeta,
    boardImageTrash, assistantConversations, memories, settings, modifications,
    onAssetsChanged: invalidateAssetCatalog
  });
  const { scheduleAssetGarbageCollection, removeBoardAssociations, purgeExpiredBoardTrash, referencedAssetPaths } = assetMaintenance;

  registerSettingsIpc({
    settings,
    onboarding,
    codexAuth,
    onOnboardingCompleted: (key) => {
      void analytics.track("onboarding.completed", { step: key.slice(0, 40) });
    },
    onBoardTrashRetentionChanged: () => {
      void purgeExpiredBoardTrash();
    },
    onThemeChanged: updateWindowChromeTheme,
    trackSettingsUpdated: () => {
      void analytics.track("settings.updated");
    }
  });
  ipcMain.handle("pi-agent:resources:list", () => discoverPiAgentResources(
    app.getAppPath(),
    path.join(app.getPath("home"), ".pi", "agent"),
    settings.getSettings()
  ));
  ipcMain.handle("pi-agent:resources:read", async (_event, resourcePath: string) => {
    if (typeof resourcePath !== "string" || !resourcePath.trim()) {
      throw new Error("Pi Agent 资源路径无效。");
    }
    const inventory = await discoverPiAgentResources(
      app.getAppPath(),
      path.join(app.getPath("home"), ".pi", "agent"),
      settings.getSettings()
    );
    const resource = [...inventory.skills, ...inventory.extensions]
      .find((item) => item.path === resourcePath);
    if (!resource) throw new Error("Pi Agent 资源不在当前发现范围内。");
    const content = await readFile(resource.path, "utf8");
    if (content.length > 100_000) throw new Error("Pi Agent 资源内容超过 100000 字符，无法预览。");
    return { ...resource, content };
  });
  ipcMain.handle("assistant-skills:list", () => {
    const roots = getAssistantSkillRoots();
    return listAssistantSkills(roots.builtInRoot, roots.overrideRoot);
  });
  ipcMain.handle("assistant-skills:get", (_event, id: string) => {
    const roots = getAssistantSkillRoots();
    return readAssistantSkill(id, roots.builtInRoot, roots.overrideRoot);
  });
  ipcMain.handle("assistant-skills:save", (_event, id: string, content: string) => {
    const roots = getAssistantSkillRoots();
    return saveAssistantSkillOverride(id, content, roots.builtInRoot, roots.overrideRoot);
  });
  ipcMain.handle("assistant-skills:reset", (_event, id: string) => {
    const roots = getAssistantSkillRoots();
    return resetAssistantSkillOverride(id, roots.builtInRoot, roots.overrideRoot);
  });
  ipcMain.handle("inspiration:list", () => inspirationClient.list());
  ipcMain.handle("inspiration:open", async (_event, sourceId: unknown) => {
    if (typeof sourceId !== "string" || !sourceId.trim()) throw new Error("灵感来源无效。");
    await shell.openExternal(await inspirationClient.urlFor(sourceId));
  });
  const integrationHome = app.isPackaged ? app.getPath("home") : path.join(app.getPath("userData"), "agent-home");
  const bundledSkillPath = app.isPackaged ? path.join(process.resourcesPath, "skills", "iterlay-workspace") : path.join(app.getAppPath(), "resources", "skills", "iterlay-workspace");
  const cliOptions = { homeDir: integrationHome, selfTest: true, userDataPath: app.isPackaged ? undefined : app.getPath("userData"), executable: process.execPath, scriptPath: app.isPackaged ? path.join(process.resourcesPath, "cli", "dist", "main.js") : path.join(app.getAppPath(), "cli", "dist", "main.js") };
  let cliError: string | undefined;
  const installAppCli = async () => { const result = await installCli(cliOptions); cliError = result.error; return result; };
  const installation = app.isPackaged ? installAppCli() : Promise.resolve(null);
  const skillSync = app.isPackaged ? syncAgentSkills(integrationHome, bundledSkillPath, { userDataPath: app.getPath("userData") }).catch((error) => { console.warn("同步 CLI Skill 失败", error); return null; }) : Promise.resolve(null);
  let skillUpgradeConsumed = false;
  const readAgentStatus = async () => ({ ...await getAgentIntegrationStatus(integrationHome), cli: { ...await getCliInstallationStatus(integrationHome), error: cliError }, development: !app.isPackaged });
  ipcMain.handle("agent:status", async () => { await installation; await skillSync; return readAgentStatus(); });
  ipcMain.handle("agent:comments:handoff", async (_event, input: unknown) => {
    const request = input as { boardId?: unknown; commentIds?: unknown } | null;
    if (!request || typeof request.boardId !== "string" || !request.boardId.trim() || !Array.isArray(request.commentIds)
      || request.commentIds.some((id) => typeof id !== "string")) throw new Error("画板评论交接参数无效。");
    const board = await boards.getBoard(request.boardId);
    if (!board) throw new Error("画板不存在，请重新打开后再试。");
    const agent = settings.getSettings().defaultCodingAgent ?? "codex";
    const claudeExecutable = agent === "claude-code"
      ? (await getAgentIntegrationStatus(app.getPath("home"))).clients.find((client) => client.id === agent)?.executablePath
      : undefined;
    return handoffBoardComments({
      agent, board, comments: await comments.list(), commentIds: request.commentIds,
      userDataPath: app.getPath("userData"), cliExecutable: process.execPath, cliScriptPath: cliOptions.scriptPath,
      claudeExecutable, openExternal: (url) => shell.openExternal(url), openPath: (file) => shell.openPath(file)
    });
  });
  ipcMain.handle("agent:cli:install", async () => { const cli = await installAppCli(); return { ...await readAgentStatus(), cli }; });
  ipcMain.handle("agent:skill-upgrade:consume", async () => { const result = await skillSync; if (skillUpgradeConsumed) return []; skillUpgradeConsumed = true; return result?.skillUpgrades ?? []; });
  ipcMain.handle("pi-agent-log:list", () => piAgentLogs.getSnapshot());
  ipcMain.handle("pi-agent-log:clear", async () => {
    await piAgentLogs.clear();
    return { ok: true };
  });
  ipcMain.handle("pi-agent-log:openDirectory", async () => {
    shell.showItemInFolder(piAgentLogs.logPath);
    return { ok: true };
  });
  const unsubscribePiAgentLogs = piAgentLogs.subscribe((entry) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(PI_AGENT_LOG_EVENT_CHANNEL, entry);
    }
  });
  ipcMain.handle("mastergo:getConnection", (_event, force?: boolean) => masterGoBridge.getConnection(Boolean(force)));
  ipcMain.handle("mastergo:openSetup", async (_event, target: "download" | "guide") => {
    const url = target === "download"
      ? "https://mastergo.com/resource"
      : "https://mastergo.com/help/MG/MCP/CONFIG";
    await shell.openExternal(url);
  });
  ipcMain.handle(
    "mastergo:prepareReconstruction",
    (_event, request: PrepareMasterGoReconstructionRequest) => masterGoBridge.prepareReconstruction(request)
  );
  ipcMain.handle(
    "mastergo:startReconstruction",
    (_event, request: MasterGoReconstructionRequest, textProviderId?: string) => {
      const textProvider = resolveTextProvider(textProviderId, "generate");
      return masterGoBridge.startReconstruction(request, getTextTransport(textProvider));
    }
  );
  ipcMain.handle("mastergo:getReconstructionTask", (_event, id: string) => masterGoBridge.getTask(id));
  ipcMain.handle("mastergo:cancelReconstructionTask", (_event, id: string) => masterGoBridge.cancelTask(id));
  ipcMain.handle("mastergo:readLayerAsset", (_event, assetPath: string) => masterGoBridge.readLayerAsset(assetPath));
  ipcMain.handle("mastergo:renderEditedHtml", (_event, taskId: string, html: string) => masterGoBridge.renderEditedHtml(taskId, html));
  ipcMain.handle("mastergo:downloadHtml", async (_event, input: { frameName?: unknown; html?: unknown }) => {
    if (typeof input?.html !== "string" || input.html.length < 1 || input.html.length > 10_000_000) {
      throw new Error("HTML 内容无效。");
    }
    const directory = await resolveDownloadDirectory();
    if (!directory) return { ok: false };
    const name = safeArchiveBaseName(typeof input.frameName === "string" ? input.frameName : "可编辑设计稿");
    const destinationPath = await availableDownloadPath(directory, `${name}.html`);
    await writeFile(destinationPath, input.html, "utf8");
    return { ok: true, path: destinationPath };
  });
  ipcMain.handle("mastergo:downloadLayers", async (_event, input: { frameName?: unknown; layers?: unknown }) => {
    if (!Array.isArray(input?.layers) || input.layers.length < 1 || input.layers.length > 100) throw new Error("分层素材无效。");
    const directory = await resolveDownloadDirectory();
    if (!directory) return { ok: false };
    const name = safeArchiveBaseName(typeof input.frameName === "string" ? input.frameName : "分层素材");
    const files = await Promise.all(input.layers.map(async (layer, index) => {
      if (!layer || typeof layer !== "object") throw new Error("分层素材无效。");
      const record = layer as { name?: unknown; path?: unknown };
      if (typeof record.name !== "string" || typeof record.path !== "string") throw new Error("分层素材无效。");
      return { name: `${String(index + 1).padStart(2, "0")}-${safeArchiveBaseName(record.name)}.png`, bytes: await masterGoBridge.readLayerAssetBytes(record.path) };
    }));
    const destinationPath = await availableDownloadPath(directory, `${name}-分层素材.zip`);
    await writeFile(destinationPath, await buildNamedArchive(files));
    return { ok: true, path: destinationPath, count: files.length };
  });
  ipcMain.handle("mastergo:exportPsd", async (_event, input: { frameName?: unknown; canvas?: unknown; layers?: unknown }) => {
    const canvas = input?.canvas as { width?: unknown; height?: unknown } | undefined;
    const canvasWidth = typeof canvas?.width === "number" ? canvas.width : NaN;
    const canvasHeight = typeof canvas?.height === "number" ? canvas.height : NaN;
    if (!canvas || !Number.isInteger(canvasWidth) || !Number.isInteger(canvasHeight) || canvasWidth < 1 || canvasHeight < 1 || canvasWidth > 16_000 || canvasHeight > 16_000 || !Array.isArray(input?.layers) || input.layers.length < 1 || input.layers.length > 100) {
      throw new Error("PSD 导出参数无效。");
    }
    const psdLayers: PsdLayerInput[] = [];
    let totalPixelBytes = 0;
    for (const layer of input.layers) {
      if (!layer || typeof layer !== "object") throw new Error("分层素材无效。");
      const record = layer as { name?: unknown; path?: unknown; x?: unknown; y?: unknown };
      if (typeof record.name !== "string" || typeof record.path !== "string" || !Number.isFinite(record.x) || !Number.isFinite(record.y)) throw new Error("分层素材无效。");
      const bytes = await masterGoBridge.readLayerAssetBytes(record.path);
      const metadata = imageDimensionsFromHeader(bytes);
      if (metadata && totalPixelBytes + metadata.width * metadata.height * 4 > 256 * 1024 * 1024) throw new Error("PSD 图层总像素数据不能超过 256 MB。");
      const decoded = await imageTasks.run(() => {
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new Error(`无法读取素材“${record.name}”。`);
        const size = image.getSize();
        totalPixelBytes += size.width * size.height * 4;
        if (totalPixelBytes > 256 * 1024 * 1024) throw new Error("PSD 图层总像素数据不能超过 256 MB。");
        return { name: record.name as string, left: Math.round(record.x as number), top: Math.round(record.y as number), width: size.width, height: size.height, bgra: Uint8Array.from(image.toBitmap()) };
      });
      psdLayers.push(decoded);
    }
    const directory = await resolveDownloadDirectory();
    if (!directory) return { ok: false };
    const name = safeArchiveBaseName(typeof input.frameName === "string" ? input.frameName : "分层设计稿");
    const destinationPath = await availableDownloadPath(directory, `${name}.psd`);
    await writeFile(destinationPath, await encodePsdInWorker({ width: canvasWidth, height: canvasHeight, layers: psdLayers }, mediaAbort.signal));
    return { ok: true, path: destinationPath };
  });
  ipcMain.handle("agent:skill:install", async (_event, client: CodingAgentId) => {
    if (client !== "codex" && client !== "claude-code") throw new Error("未知的 Coding Agent。");
    const cli = await installAppCli();
    if (cli.error) throw new Error(cli.error);
    await installAgentSkill(client, integrationHome, bundledSkillPath);
    await removeLegacyIntegration(client, integrationHome);
    await setSkillAutoInstallDeclined(app.getPath("userData"), client, false);
    return readAgentStatus();
  });
  ipcMain.handle("agent:skill:remove", async (_event, client: CodingAgentId) => {
    if (client !== "codex" && client !== "claude-code") throw new Error("未知的 Coding Agent。");
    await uninstallAgentSkill(client, integrationHome);
    await setSkillAutoInstallDeclined(app.getPath("userData"), client, true);
    return readAgentStatus();
  });
  ipcMain.handle("app:clearCache", async (event) => {
    await event.sender.session.clearCache();
    return { ok: true };
  });
  ipcMain.handle("notification:test", () => showTestSystemNotification());
  ipcMain.handle("notification:openSettings", () => openSystemNotificationSettings());

  ipcMain.handle("clipboard:writeImage", (_event, request: WriteClipboardImageRequest) => {
    if (request?.mimeType !== "image/gif" || !(request.bytes instanceof ArrayBuffer)) {
      throw new Error("剪贴板图片格式无效。");
    }
    const bytes = Buffer.from(request.bytes);
    if (bytes.byteLength < 6 || !bytes.subarray(0, 6).toString("ascii").startsWith("GIF8")) {
      throw new Error("剪贴板图片不是有效的 GIF 文件。");
    }
    clipboard.writeBuffer("image/gif", bytes);
    return { ok: true };
  });

  ipcMain.handle("memory:getStats", async () => memories.getStats());
  ipcMain.handle("memory:list", async () => memories.listMemories());
  ipcMain.handle("memory:delete", async (_event, id: unknown) => {
    if (typeof id !== "string" || id.length > 200) throw new Error("记忆 ID 格式无效。");
    return { ok: await memories.deleteMemory(id) };
  });
  ipcMain.handle("memory:organize", async () => memories.organize());
  const generateMemoriesFromHistory = async () => {
    const [jobs, sceneEntries, sourceComments, sourceConversations] = await Promise.all([
      history.listJobs(),
      sceneMedia.list(),
      comments.list(),
      assistantConversations.list()
    ]);
    const jobEvents = jobs.slice(0, 300).map((job): MemoryEventInput => {
      const surface = job.input.sceneId
        ? "scene-template"
        : job.input.workflowMode === "edit" ? "canvas-edit" : "canvas-prompt";
      return {
        type: job.status === "succeeded"
          ? "generation_succeeded"
          : job.status === "failed" ? "generation_failed" : "prompt_submitted",
        surface,
        content: job.prompt || job.input.prompt,
        boardId: job.boardId,
        sceneId: job.input.sceneId,
        jobId: job.id,
        sourceId: `generation-job:${job.id}`,
        occurredAt: job.completedAt ?? job.createdAt
      };
    });
    const sceneEvents = sceneEntries
      .flatMap((entry) => entry.results)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 300)
      .map((result): MemoryEventInput => ({
          type: "generation_succeeded",
          surface: "scene-template" as const,
          content: result.prompt,
          sceneId: result.sceneId,
          jobId: result.jobId,
          sourceId: `scene-result:${result.id}`,
          occurredAt: result.createdAt
      }));
    const commentEvents = sourceComments.slice(0, 300).map((comment): MemoryEventInput => ({
      type: "comment_added",
      surface: "comment",
      content: comment.text,
      assetPath: comment.imagePath,
      sourceId: comment.id,
      occurredAt: comment.createdAt
    }));
    const conversationEvents = sourceConversations.slice(0, 300).map((conversation): MemoryEventInput => ({
      type: "assistant_conversation",
      surface: conversation.surface,
      content: [
        conversation.instruction ? `用户：${conversation.instruction}` : "",
        conversation.response ? `助手：${conversation.response}` : ""
      ].filter(Boolean).join("\n"),
      boardId: conversation.boardId,
      sceneId: conversation.sceneId,
      assetPath: conversation.assetPath,
      sourceId: conversation.id,
      occurredAt: conversation.occurredAt
    }));
    const events = [...jobEvents, ...sceneEvents, ...commentEvents, ...conversationEvents]
      .filter((event) => event.content?.trim())
      .sort((a, b) => Date.parse(b.occurredAt ?? "") - Date.parse(a.occurredAt ?? ""))
      .slice(0, 160);
    if (events.length === 0) {
      return { stats: await memories.getStats(), importedEventCount: 0, generatedMemoryCount: 0 };
    }
    const sources = events.map((event) => ({
      id: event.sourceId!,
      type: event.type as "prompt_submitted" | "assistant_conversation" | "comment_added" | "generation_succeeded" | "generation_failed",
      content: event.content!.slice(0, 1_600),
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      scope: event.assetPath ? "asset" as const
        : event.boardId ? "board" as const
          : event.sceneId ? "scene" as const : "global" as const
    }));
    const textProvider = resolveTextProvider(undefined, "generate");
    const extracted = await extractAssistantMemoriesWith(getTextTransport(textProvider), sources);
    return memories.saveExtractedMemories(events, extracted);
  };
  ipcMain.handle("memory:generate", generateMemoriesFromHistory);
  const periodicMemoryGeneration = setInterval(() => {
    if (!settings.getSettings().memoryEnabled) return;
    void memories.getPendingEventCount()
      .then((count) => count > 0 ? generateMemoriesFromHistory() : undefined)
      .catch((error) => console.warn("定期提炼助手记忆失败。", error));
  }, 6 * 60 * 60 * 1_000);
  periodicMemoryGeneration.unref();
  ipcMain.handle("memory:clear", async () => {
    await memories.clear();
    return { ok: true };
  });
  ipcMain.handle(
    "memory:checkpointDraft",
    async (_event, content: string, surface: unknown, query?: CollaborateSceneRequest["memoryQuery"]) => {
      if (!settings.getSettings().memoryEnabled) return { ok: true };
      if (typeof content !== "string" || content.length > 12_000) {
        throw new Error("提示词草稿格式无效。");
      }
      if (surface !== "scene-template" && surface !== "canvas-prompt" && surface !== "canvas-edit") {
        throw new Error("提示词草稿场景无效。");
      }
      const rawQuery = query && typeof query === "object" ? query : {};
      await memories.record({
        type: "prompt_draft",
        surface,
        content,
        boardId: normalizeMemoryQueryValue(rawQuery.boardId),
        sceneId: normalizeMemoryQueryValue(rawQuery.sceneId),
        assetPath: normalizeMemoryQueryValue(rawQuery.assetPath)
      });
      return { ok: true };
    }
  );

  const validateCodexProviderId = (value: unknown): string => {
    if (typeof value !== "string" || !value.trim() || value.length > 200) {
      throw new Error("Codex Provider ID 格式无效。");
    }
    return value.trim();
  };

  ipcMain.handle("codexAuth:getStatus", (_event, providerId: unknown): CodexAuthStatus =>
    codexAuth.getStatus(validateCodexProviderId(providerId))
  );
  ipcMain.handle("codexAuth:signIn", (_event, providerId: unknown): Promise<CodexAuthStatus> =>
    codexAuth.signIn(validateCodexProviderId(providerId))
  );
  ipcMain.handle("codexAuth:refresh", (_event, providerId: unknown): Promise<CodexAuthStatus> =>
    codexAuth.refreshNow(validateCodexProviderId(providerId))
  );
  ipcMain.handle("codexAuth:signOut", (_event, providerId: unknown): CodexAuthStatus =>
    codexAuth.signOut(validateCodexProviderId(providerId))
  );
  ipcMain.handle(
    "memory:suggestions",
    async (_event, query?: CollaborateSceneRequest["memoryQuery"], queryText?: string) => {
      const currentSettings = settings.getSettings();
      if (!currentSettings.memoryEnabled) return [];
      const rawQuery = query && typeof query === "object" ? query : {};
      const normalizedQuery = {
        boardId: normalizeMemoryQueryValue(rawQuery.boardId),
        sceneId: normalizeMemoryQueryValue(rawQuery.sceneId),
        assetPath: normalizeMemoryQueryValue(rawQuery.assetPath)
      };
      return memories.retrieve(
        normalizedQuery,
        currentSettings.memoryUsageLevel ?? "balanced",
        typeof queryText === "string" ? queryText.slice(0, 2_000) : "图片创作"
      );
    }
  );

  ipcMain.handle("appIcon:set", (_event, value: AppIconPreference) => {
    const current = settings.getSettings();
    const appIcon = normalizeAppIcon(value, current.customAppIcons);
    if (typeof value === "string" && value.startsWith("custom:") && appIcon !== value) {
      throw new Error("这个伙伴头像已不存在。");
    }
    applyAppIcon(appIcon, current.customAppIcons);
    settings.setAppIcon(appIcon);
    return { ok: true, appIcon };
  });

  ipcMain.handle("appIcon:upload", (_event, request: UploadAppIconRequest) => {
    const icon = createCustomAppIcon(request);
    const library = settings.addCustomAppIcon(icon);
    applyAppIcon(library.appIcon, library.customAppIcons);
    return library;
  });

  ipcMain.handle("appIcon:delete", (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim()) throw new Error("头像不存在。");
    const current = settings.getSettings();
    if (!current.customAppIcons?.some((icon) => icon.id === id)) throw new Error("头像不存在。");
    const library = settings.deleteCustomAppIcon(id);
    applyAppIcon(library.appIcon, library.customAppIcons);
    return library;
  });

  const issuePaidMediaQuote = async (input: PaidMediaQuoteRequest): Promise<never> => { void input; throw new Error("开源版不提供官方付费模型。"); };
  ipcMain.handle("media:quote", (_event, input: PaidMediaQuoteRequest) => issuePaidMediaQuote(input));
  ipcMain.handle("credits:getStatus", () => { throw new Error("开源版无需 Credits。"); });
  ipcMain.handle("credits:listTransactions", () => []);
  ipcMain.handle("referrals:getOverview", () => { throw new Error("开源版无需邀请奖励。"); });

  for (const channel of ["feedback:submit", "feedback:listHistory", "feedback:getDetail", "feedback:delete"]) {
    ipcMain.handle(channel, () => { throw new Error("请通过 GitHub Issues 提交和查看反馈。"); });
  }

  ipcMain.handle(
    "provider:testConnection",
    async (_event, config: ProviderConfig, apiKeyOverride?: string, options?: ProviderTestOptions): Promise<ProviderTestResult> => {
      try {
        const apiKey = apiKeyOverride?.trim() || settings.getApiKey(config.id);
        if (options?.mode === "generation") {
          return await checkImageGeneration(config, options.acknowledgeCharges === true,
            (input) => getProviderAdapter(config).generate(input, config, apiKey));
        }
        if (config.type === "codex-oauth") {
          await codexAuth.getAccess(config.id);
          return localCredentialCheck();
        }
        return checkProviderConnection(config, apiKey, "image", (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init));
      } catch (error) {
        const result = newProviderTestResult();
        result.message = normalizeProviderError(error).message;
        return result;
      }
    }
  );

  ipcMain.handle(
    "textProvider:testConnection",
    async (_event, config: TextProviderConfig, apiKeyOverride?: string): Promise<ProviderTestResult> => {
      try {
        if (config.type === "codex-oauth") {
          await codexAuth.getAccess(config.authProviderId || config.id);
          return localCredentialCheck();
        }
        const apiKey = apiKeyOverride?.trim() || settings.getApiKey(config.id);
        return checkProviderConnection(config, apiKey, "text", (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init));
      } catch (error) {
        const result = newProviderTestResult();
        result.message = normalizeProviderError(error).message;
        return result;
      }
    }
  );

  ipcMain.handle(
    "videoProvider:testConnection",
    async (_event, config: VideoProviderConfig, apiKeyOverride?: string): Promise<ProviderTestResult> => {
      try {
        const connection = settings.resolveVideoProviderConnection(config);
        const apiKey = apiKeyOverride?.trim() || connection.apiKey;
        return checkProviderConnection({ ...config, baseUrl: connection.baseUrl }, apiKey, "video", (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init));
      } catch (error) {
        const result = newProviderTestResult();
        result.message = normalizeProviderError(error).message;
        return result;
      }
    }
  );

  ipcMain.handle(
    "videoProvider:listModels",
    async (_event, config: VideoProviderConfig, apiKeyOverride?: string): Promise<VideoProviderModelOption[]> => {
      try {
        const connection = settings.resolveVideoProviderConnection(config);
        const apiKey = apiKeyOverride?.trim() || connection.apiKey;
        const models = getProviderModels(config);
        if (config.type !== "openrouter" && config.type !== "minimax") {
          const capability = videoService.capability(config.type);
          return models.map((model) => videoProviderModelOptionFromCapability(model, capability));
        }
        if (config.type === "minimax") {
          return await new MiniMaxVideoProvider((input, init) => net.fetch(input instanceof URL ? input.toString() : input, init)).listModels({
            provider: "minimax",
            model: config.model,
            apiKey,
            ...(connection.baseUrl.trim() ? { baseUrl: connection.baseUrl.trim() } : {})
          });
        }
        return await new OpenRouterVideoProvider((input, init) => net.fetch(input instanceof URL ? input.toString() : input, init)).listModels({
          provider: "openrouter",
          model: config.model,
          apiKey,
          ...(connection.baseUrl.trim() ? { baseUrl: connection.baseUrl.trim() } : {})
        });
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.handle(
    "textProvider:listModels",
    async (_event, config: TextProviderConfig, apiKeyOverride?: string): Promise<ProviderModelOption[]> => {
      try {
        if (config.type === "codex-oauth") {
          return await new CodexOAuthTextTransport(
            codexAuth,
            config.authProviderId || config.id,
            config.model
          ).listModels();
        }
        const apiKey = apiKeyOverride?.trim() || settings.getApiKey(config.id);
        return await new OpenAICompatibleTextTransport(config, apiKey).listModels();
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.handle(
    "provider:listModels",
    async (_event, config: ProviderConfig, apiKeyOverride?: string): Promise<ProviderModelOption[]> => {
      try {
        const apiKey = apiKeyOverride?.trim() || settings.getApiKey(config.id);
        return config.type === "codex-oauth"
          ? await codexProvider.listModels(config, apiKey)
          : config.type === "ark"
            ? await arkProvider.listModels(config, apiKey)
            : await provider.listModels(config, apiKey);
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.handle(
    "provider:listFalModels",
    async (
      _event,
      category: FalModelCategory,
      query?: string,
      providerId?: string,
      apiKeyOverride?: string
    ): Promise<FalModelOption[]> => {
      if (
        category !== "text-to-image"
        && category !== "image-to-image"
        && category !== "text-to-video"
        && category !== "image-to-video"
      ) {
        throw new Error("不支持的 fal.ai 模型分类。");
      }
      try {
        const apiKey = apiKeyOverride?.trim() || (providerId ? settings.getApiKey(providerId) : "");
        return await falProvider.listModels(category, typeof query === "string" ? query : "", apiKey);
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  const imageGeneration = createImageGenerationCommand({
    settings,
    history,
    assets,
    getProviderAdapter,
    recordMemory,
    sceneMedia,
    backfillThumbHashes,
    createGeneratedBoardNodes,
    boards,
    analytics
  });
  ipcMain.handle("image:generate", (_event, input: GenerateImageInput) => imageGeneration(input));
  ipcMain.handle("image:cancel", (_event, clientTaskId: string) => imageGeneration.cancel(clientTaskId));

  ipcMain.handle("sceneMedia:list", async (): Promise<SceneMediaSummary[]> =>
    Promise.all((await sceneMedia.list()).map(async (media) => toSceneMediaSummary(media)))
  );

  ipcMain.handle(
    "sceneMedia:addExample",
    async (_event, sceneId: string, sourcePath: string, prompt: string) => {
      const bytes = await assets.readManagedBytes(sourcePath);
      await sceneMedia.saveGeneration(
        sceneId,
        {
          jobId: `example-${crypto.randomUUID()}`,
          prompt,
          createdAt: new Date().toISOString()
        },
        [{ bytes, mimeType: mimeFromExtension(sourcePath) }]
      );
      return { ok: true };
    }
  );

  ipcMain.handle("sceneMedia:deleteResult", async (_event, sceneId: string, resultId: string) => ({
    ok: await sceneMedia.deleteResult(sceneId, resultId)
  }));

  ipcMain.handle("sceneMedia:reorderResults", async (_event, sceneId: string, resultIds: string[]) => {
    await sceneMedia.reorderResults(sceneId, resultIds);
    return { ok: true };
  });

  ipcMain.handle(
    "sceneMedia:setCover",
    async (_event, sceneId: string, sourcePath: string, replaceCoverId?: string) => {
      const bytes = await assets.readManagedBytes(sourcePath);
      await sceneMedia.addCover(sceneId, sourcePath, bytes, mimeFromExtension(sourcePath), replaceCoverId);
      return { ok: true };
    }
  );

  ipcMain.handle("sceneMedia:removeCover", async (_event, sceneId: string, coverId: string) => ({
    ok: await sceneMedia.removeCover(sceneId, coverId)
  }));

  ipcMain.handle("sceneMedia:clearCovers", async (_event, sceneId: string) => ({
    ok: true,
    count: await sceneMedia.clearCovers(sceneId)
  }));

  ipcMain.handle("sceneMedia:reorderCovers", async (_event, sceneId: string, coverIds: string[]) => {
    await sceneMedia.reorderCovers(sceneId, coverIds);
    return { ok: true };
  });

  ipcMain.handle(
    "sceneMedia:updateCoverFocus",
    async (_event, sceneId: string, coverId: string, focus: SceneCoverFocus) => {
      await sceneMedia.updateCoverFocus(sceneId, coverId, focus);
      return { ok: true };
    }
  );

  ipcMain.handle("sceneMedia:deleteScene", async (_event, sceneId: string) => {
    await sceneMedia.deleteScene(sceneId);
    return { ok: true };
  });

  // ---------- 模板导出 / 导入（.itt = 模板定义 + 实例 + 封面） ----------

  ipcMain.handle("scenes:export", async (_event, scene: SceneTemplateData) => {
    if (!isSceneTemplateData(scene)) throw new Error("模板数据无效，无法导出。");
    const result = await dialog.showSaveDialog({
      defaultPath: `${safeArchiveBaseName(scene.name)}.itt`,
      filters: [{ name: "Iterlay 模板", extensions: ["itt"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };

    const media = (await sceneMedia.list()).find((item) => item.sceneId === scene.id);
    await writeFile(result.filePath, await buildSceneArchive(scene, media, app.getVersion()));
    void analytics.track("scene.created", { action: "export" });
    return {
      ok: true,
      path: result.filePath,
      instanceCount: media?.results.length ?? 0,
      coverCount: media?.covers.length ?? 0
    };
  });

  ipcMain.handle("scenes:submitTemplate", () => {
    throw new Error("请导出模板文件，通过 GitHub Issues 投稿。");
  });
  ipcMain.handle("scenes:getTemplateSubmission", () => null);

  async function importSceneBuffer(buffer: Buffer): Promise<SceneTemplateImportResult> {
    const parsed = await parseSceneArchive(buffer);
    const sceneId = `custom:${crypto.randomUUID()}`;
    const importedScene: SceneTemplateData = {
      ...parsed.scene,
      id: sceneId,
      source: "custom",
      previewImages: undefined,
      createdAt: new Date().toISOString()
    };
    const importedMedia = await sceneMedia.importScene(sceneId, parsed.media, parsed.images);
    return {
      scene: importedScene,
      instanceCount: importedMedia.results.length,
      coverCount: importedMedia.covers.length
    };
  }

  ipcMain.handle("scenes:import", async (): Promise<SceneTemplateImportResult | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Iterlay 模板", extensions: ["itt", "zip"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return importSceneBuffer(await readFile(result.filePaths[0]));
  });

  ipcMain.handle("scenes:importData", async (_event, data: ArrayBuffer) => importSceneBuffer(Buffer.from(data)));

  ipcMain.handle("prompt:enhance", async (_event, req: EnhancePromptRequest): Promise<EnhancePromptResult> => {
    if (!req.prompt.trim()) {
      throw new Error("请先输入提示词。");
    }
    try {
      const textProvider = resolveTextProvider(req.textProviderId, "generate");
      const prompt = await enhancePromptWith(getTextTransport(textProvider), req);
      return { prompt };
    } catch (error) {
      throw normalizeProviderError(error);
    }
  });

  ipcMain.handle(
    "scene:collaborate",
    async (_event, req: CollaborateSceneRequest): Promise<CollaborateSceneResult> => {
      try {
        const preparedRequest = await prepareSceneCollaborationRequest(req);
        const textProvider = resolveTextProvider(preparedRequest.textProviderId, "generate");
        const useAgent = await resolveAssistantAgentMode(preparedRequest, textProvider);
        const agentTools = useAgent
          ? createAssistantAgentTools(preparedRequest, crypto.randomUUID())
          : [];
        const agentResourceOptions = useAgent
          ? await getAssistantAgentResourceOptions(preparedRequest)
          : undefined;
        const result = useAgent
          ? await collaborateSceneAgentWith(
              getTextTransport(textProvider),
              preparedRequest,
              undefined,
              agentTools,
              agentResourceOptions
            )
          : await collaborateSceneWith(getTextTransport(textProvider), preparedRequest);
        await recordAssistantResult(preparedRequest, result);
        return result;
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.on(
    SCENE_COLLABORATION_START_CHANNEL,
    async (event, payload: StartSceneCollaborationPayload): Promise<void> => {
      const requestId = typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
      if (!requestId || requestId.length > 128) return;
      if (sceneCollaborationStreams.has(requestId)) {
        sendSceneCollaborationEvent(event.sender, {
          requestId,
          type: "error",
          message: "这个 AI 请求已经在处理中。"
        });
        return;
      }

      const controller = new AbortController();
      const sender = event.sender;
      const handleDestroyed = (): void => controller.abort();
      sceneCollaborationStreams.set(requestId, {
        controller,
        senderId: sender.id,
        pendingInteractions: new Map()
      });
      sender.once("destroyed", handleDestroyed);
      let toolCalls: AssistantToolCall[] = [];
      let reasoningSummary = "";
      const presentActivity = (label: string): void => {
        if (!controller.signal.aborted) {
          sendSceneCollaborationEvent(sender, { requestId, type: "activity", label });
        }
      };
      const activityForTool = (toolName: string): string | undefined => {
        if (toolName === "web_search") return "正在查找相关资料…";
        if (toolName === "finish_assistant_result") return "正在整理最终回复…";
        if (toolName.startsWith("present_")) return "正在准备下一步…";
        if (toolName.startsWith("quote_")) return "正在核算本次操作…";
        if (toolName.startsWith("generate_")) return "正在执行生成操作…";
        if (toolName.startsWith("get_") || toolName.startsWith("inspect_") || toolName.startsWith("validate_")) {
          return "正在读取并核对画板信息…";
        }
        return undefined;
      };

      try {
        presentActivity("正在整理输入…");
        const preparedRequest = await prepareSceneCollaborationRequest(payload.request);
        presentActivity("正在理解你的需求…");
        const textProvider = resolveTextProvider(preparedRequest.textProviderId, "generate");
        presentActivity("正在连接文本模型…");
        const onDelta = (delta: string): void => {
          if (!controller.signal.aborted && delta) {
            sendSceneCollaborationEvent(sender, { requestId, type: "delta", delta });
          }
        };
        const onReasoningSummary = (delta: string): void => {
          if (controller.signal.aborted || !delta) return;
          const bounded = delta.replaceAll("\u0000", "").slice(0, Math.max(0, 12_000 - reasoningSummary.length));
          if (!bounded) return;
          reasoningSummary += bounded;
          sendSceneCollaborationEvent(sender, { requestId, type: "reasoning-summary", delta: bounded });
        };
        const onFields = (fields: CollaborateSceneResult["fields"]): void => {
          if (!controller.signal.aborted) {
            sendSceneCollaborationEvent(sender, { requestId, type: "fields", fields });
          }
        };
        const presentInteraction = (interaction: SceneAssistantInteraction) => {
          const active = sceneCollaborationStreams.get(requestId);
          if (!active || controller.signal.aborted) {
            throw new ProviderError("INTERACTION_CANCELLED", "助手交互已取消。");
          }
          const interactionId = crypto.randomUUID();
          return new Promise<{
            action: "submit" | "dismiss";
            values?: Record<string, string | string[]>;
          }>((resolve, reject) => {
            active.pendingInteractions.set(interactionId, { resolve, reject });
            sendSceneCollaborationEvent(sender, {
              requestId,
              type: "interaction",
              interactionId,
              interaction
            });
          });
        };
        const useAgent = await resolveAssistantAgentMode(preparedRequest, textProvider);
        const agentResourceOptions = useAgent
          ? await getAssistantAgentResourceOptions(preparedRequest, {
              presentInteraction,
              presentReasoningSummary: onReasoningSummary,
              presentTool: (tool) => {
                if (controller.signal.aborted) return;
                toolCalls = mergeAssistantToolCall(toolCalls, tool);
                sendSceneCollaborationEvent(sender, { requestId, type: "tool", tool });
                if (tool.status === "running") {
                  const label = activityForTool(tool.name);
                  if (label) presentActivity(label);
                }
              },
              presentActivity: (label) => {
                presentActivity(label);
              }
            })
          : undefined;
        if (!useAgent) presentActivity("正在生成回复…");
        const result = useAgent
          ? await collaborateSceneAgentStreamWith(
              getTextTransport(textProvider),
              preparedRequest,
              onDelta,
              controller.signal,
              onFields,
              createAssistantAgentTools(
                preparedRequest,
                requestId,
                controller.signal,
                (result) => {
                  if (!controller.signal.aborted) {
                    sendSceneCollaborationEvent(sender, {
                      requestId,
                      type: "comic-mutation",
                      result
                    });
                  }
                },
                async ({ quote, operation }) => {
                  const response = await presentInteraction({
                    type: "confirm",
                    title: operation.kind === "video" ? "确认生成漫剧视频" : "确认生成漫剧图片",
                    description: `本次将消耗 ${quote.priceSnapshot.amount} ${quote.priceSnapshot.currency}。确认后 Agent 才会启动冻结的媒体任务。`,
                    confirmLabel: "确认并生成",
                    cancelLabel: "取消"
                  });
                  return response.action === "submit";
                }
              ),
              agentResourceOptions
            )
          : await collaborateSceneStreamWith(
              getTextTransport(textProvider),
              preparedRequest,
              onDelta,
              controller.signal,
              onFields,
              onReasoningSummary
            );
        if (!controller.signal.aborted) {
          presentActivity("正在保存回复…");
          await recordAssistantResult(preparedRequest, result, toolCalls, reasoningSummary);
          sendSceneCollaborationEvent(sender, { requestId, type: "result", result });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          sendSceneCollaborationEvent(sender, { requestId, type: "cancelled" });
        } else {
          sendSceneCollaborationEvent(sender, {
            requestId,
            type: "error",
            message: normalizeProviderError(error).message
          });
        }
      } finally {
        const active = sceneCollaborationStreams.get(requestId);
        active?.pendingInteractions.forEach(({ reject }) => {
          reject(new ProviderError("INTERACTION_CANCELLED", "助手交互已取消。"));
        });
        sender.removeListener("destroyed", handleDestroyed);
        sceneCollaborationStreams.delete(requestId);
      }
    }
  );

  ipcMain.on(SCENE_COLLABORATION_CANCEL_CHANNEL, (event, requestId: string): void => {
    if (typeof requestId !== "string") return;
    const active = sceneCollaborationStreams.get(requestId.trim());
    if (active?.senderId === event.sender.id) active.controller.abort();
  });

  ipcMain.on(
    SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL,
    (event, payload: SceneCollaborationInteractionResponsePayload): void => {
      if (!payload || typeof payload.requestId !== "string" || typeof payload.interactionId !== "string") return;
      const active = sceneCollaborationStreams.get(payload.requestId);
      if (!active || active.senderId !== event.sender.id) return;
      const pending = active.pendingInteractions.get(payload.interactionId);
      if (!pending) return;
      active.pendingInteractions.delete(payload.interactionId);
      if (payload.action === "dismiss") {
        pending.resolve({ action: "dismiss" });
        return;
      }
      pending.resolve({
        action: "submit",
        values: payload.values && typeof payload.values === "object" ? payload.values : {}
      });
    }
  );

  ipcMain.handle(
    "assistant:suggestIntents",
    async (_event, req: SuggestAssistantIntentsRequest): Promise<SuggestAssistantIntentsResult> => {
      if (!req || !["scene-template", "canvas-prompt", "canvas-edit", "gallery-review"].includes(req.assistantSurface)) {
        throw new Error("缺少有效的 AI 助手上下文。");
      }
      const conversation = Array.isArray(req.conversation) ? req.conversation : [];
      const currentFields = Array.isArray(req.currentFields) ? req.currentFields : [];
      const templateScenario = normalizeTemplateExtractionScenario(req.templateScenario);
      void analytics.track("assistant.opened", { surface: req.assistantSurface });
      try {
        const textProvider = resolveTextProvider(
          req.textProviderId,
          req.assistantSurface === "canvas-edit" ? "edit" : "generate"
        );
        const suggestions = await suggestAssistantIntentsWith(getTextTransport(textProvider), {
          ...req,
          conversation,
          currentFields,
          ...(templateScenario ? { templateScenario } : {})
        });
        void analytics.track("assistant.completed", { surface: req.assistantSurface });
        return { suggestions };
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.handle(
    "prompt:suggestImageEdits",
    async (_event, req: SuggestImageEditsRequest): Promise<SuggestImageEditsResult> => {
      if (!req || typeof req.sourcePath !== "string" || !req.sourcePath.trim()) {
        throw new Error("缺少待分析的图片。");
      }
      try {
        const textProvider = resolveTextProvider(req.textProviderId, "edit");
        const imageDataUrl = await assets.readManagedDataUrl(req.sourcePath);
        const currentSettings = settings.getSettings();
        const memoryContext = currentSettings.memoryEnabled
          ? await memories.retrieve(
              { assetPath: req.sourcePath },
              currentSettings.memoryUsageLevel ?? "balanced",
              "图片编辑建议"
            )
          : [];
        const suggestions = await suggestImageEditsWith(getTextTransport(textProvider), imageDataUrl, memoryContext);
        return { suggestions };
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.handle(
    "assistant:history:list",
    async (_event, rawQuery?: AssistantConversationHistoryQuery): Promise<AssistantConversationRecord[]> => {
      const query = rawQuery && typeof rawQuery === "object" && !Array.isArray(rawQuery)
        ? rawQuery
        : {};
      const boardId = normalizeMemoryQueryValue(query.boardId);
      const assetPath = normalizeMemoryQueryValue(query.assetPath);
      const conversationId = normalizeMemoryQueryValue(query.conversationId);
      const surface = query.surface;
      if (surface !== undefined && !["scene-template", "canvas-prompt", "canvas-edit", "gallery-review", "comic-drama", "video"].includes(surface)) {
        throw new Error("AI 助手收到无效的历史范围。");
      }
      return (await assistantConversations.list()).filter((record) => (
        (!conversationId || record.conversationId === conversationId)
        && (!boardId || record.boardId === boardId)
        && (!assetPath || record.assetPath === assetPath)
        && (!surface || record.surface === surface)
      )).map((record) => ({
        ...record,
        ...(record.attachments ? { attachments: record.attachments.map(({ path: attachmentPath, ...attachment }) => {
          if (!attachmentPath) return attachment;
          try { return { ...attachment, src: assets.toAssetUrl(attachmentPath) }; }
          catch { return { ...attachment, src: "" }; }
        }) } : {})
      }));
    }
  );

  ipcMain.handle("history:list", (_event, boardId?: string) => history.listJobs(boardId));
  ipcMain.handle("history:scenes", () => history.listSceneJobs());
  ipcMain.handle("history:page", (_event, boardId?: string, cursor?: string, limit?: number) => history.listPage(boardId, cursor, limit));

  ipcMain.handle("official:recoverGenerations", () => ({ recovered: 0, pending: 0, boardIds: [] }));

  ipcMain.handle("history:clear", async (_event, boardId: string) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少要清空历史的画板 ID。");
    const count = await history.clearJobsByBoard(boardId);
    scheduleAssetGarbageCollection();
    return { ok: true, count };
  });

  ipcMain.handle("history:reuse", async (_event, jobId: string) => {
    const jobs = await history.listJobs();
    return jobs.find((job) => job.id === jobId) || null;
  });

  ipcMain.handle("asset:save", async (_event, sourcePath: string) => {
    const directory = await resolveDownloadDirectory();
    if (!directory) return { ok: false };
    const destinationPath = await availableDownloadPath(directory, path.basename(sourcePath) || "image.png");
    await assets.exportAsset(sourcePath, destinationPath);
    void analytics.track("asset.exported");
    return { ok: true, path: destinationPath, directory };
  });

  ipcMain.handle("downloads:chooseDirectory", async () => {
    const directory = await chooseDownloadDirectory();
    return directory ? { ok: true, path: directory } : { ok: false };
  });

  ipcMain.handle("downloads:setDirectory", async (_event, input: string) => {
    const directory = await ensureDownloadDirectory(input);
    settings.setDownloadDirectory(directory);
    return { ok: true, path: directory };
  });

  ipcMain.handle("downloads:openPath", async (_event, input: unknown) => {
    if (typeof input !== "string" || input.length === 0 || input.length > 4_096 || !path.isAbsolute(input)) {
      throw new Error("下载路径无效。");
    }
    try {
      await access(input);
    } catch {
      throw new Error("文件已被移动或删除。");
    }
    const error = await shell.openPath(input);
    if (error) throw new Error("无法使用系统默认应用打开该文件。");
    return { ok: true };
  });

  ipcMain.handle("asset:saveBatch", async (_event, sourcePaths: unknown) => {
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0 || sourcePaths.length > 1_000) {
      throw new Error("请选择 1 至 1000 张图片后再批量下载。");
    }
    const uniquePaths = [...new Set(sourcePaths.filter((value): value is string => typeof value === "string"))];
    if (uniquePaths.length === 0) throw new Error("所选图片暂不可下载。");

    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join("");
    const directory = await resolveDownloadDirectory();
    if (!directory) return { ok: false };

    const archiveItems = (
      await Promise.all(
        uniquePaths.map(async (sourcePath): Promise<AssetArchiveItem | null> => {
          try {
            return { sourcePath, bytes: await assets.readManagedBytes(sourcePath) };
          } catch {
            return null;
          }
        })
      )
    ).filter((item): item is AssetArchiveItem => item !== null);
    if (archiveItems.length === 0) throw new Error("所选图片均无法读取，未创建压缩包。");

    const destinationPath = await availableDownloadPath(directory, `iterlay-images-${timestamp}.zip`);
    const archive = await buildAssetArchive(archiveItems);
    await writeFile(destinationPath, archive);
    return {
      ok: true,
      path: destinationPath,
      directory,
      count: archiveItems.length,
      skipped: uniquePaths.length - archiveItems.length
    };
  });

  ipcMain.handle(
    "asset:saveWechatStickerPackage",
    async (_event, input: SaveWechatStickerPackageRequest): Promise<SaveWechatStickerPackageResult> => {
      const files = Array.isArray(input?.files) ? input.files : [];
      if (files.length === 0 || files.length > 100) {
        throw new Error("微信表情素材包应包含 1 至 100 个文件。");
      }

      const packageName = sanitizeWechatPackageName(input.packageName);
      const normalizedFiles: NamedArchiveItem[] = [];
      const usedPaths = new Set<string>();
      let totalBytes = 0;

      for (const file of files) {
        const relativePath = normalizeWechatPackageRelativePath(file?.relativePath);
        if (usedPaths.has(relativePath)) throw new Error(`素材包包含重复文件：${relativePath}`);
        usedPaths.add(relativePath);

        const bytes = toWechatPackageBytes(file?.bytes);
        if (bytes.length === 0 || bytes.length > MAX_MANAGED_IMAGE_BYTES) {
          throw new Error(`素材文件 ${relativePath} 为空或超过 25MB。`);
        }
        totalBytes += bytes.length;
        if (totalBytes > 200 * 1024 * 1024) throw new Error("微信表情素材包总大小不能超过 200MB。");
        normalizedFiles.push({ name: relativePath, bytes });
      }

      const directory = await resolveDownloadDirectory();
      if (!directory) return { ok: false };
      const folderPath = await availableDownloadPath(directory, packageName);
      await mkdir(folderPath, { recursive: true });
      await Promise.all(normalizedFiles.map(async (file) => {
        const destinationPath = path.join(folderPath, ...file.name.split("/"));
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await writeFile(destinationPath, file.bytes);
      }));

      let zipPath: string | undefined;
      if (input.createZip !== false) {
        zipPath = await availableDownloadPath(directory, `${path.basename(folderPath)}.zip`);
        await writeFile(zipPath, await buildNamedArchive(normalizedFiles));
      }

      return {
        ok: true,
        directory,
        folderPath,
        zipPath,
        fileCount: normalizedFiles.length
      };
    }
  );

  ipcMain.handle("sharing:readImport", async (_event, source: unknown): Promise<OnlineShareImportData> => {
    if (!ONLINE_SHARING_AVAILABLE) throw new Error("在线分享暂未开放，请导入本地模板文件。");
    if (typeof source !== "string" || source.length > 8_192) throw new Error("分享链接无效。");
    let shareUrl: URL;
    try {
      shareUrl = new URL(source);
    } catch {
      throw new Error("分享链接无效。");
    }
    if (
      (shareUrl.protocol !== "http:" && shareUrl.protocol !== "https:") ||
      shareUrl.username ||
      shareUrl.password
    ) {
      throw new Error("分享链接必须是 HTTP 或 HTTPS 地址。");
    }
    shareUrl.hash = "";
    shareUrl.search = "";
    shareUrl.pathname = `${shareUrl.pathname.replace(/\/+$/, "")}/`;
    const importUrl = new URL("import", shareUrl);
    const response = await fetch(importUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`读取分享内容失败（HTTP ${response.status}）。`);
    const payload = await response.json() as Partial<OnlineShareImportData>;
    if (
      typeof payload.prompt !== "string" ||
      !Array.isArray(payload.referenceUrls) ||
      payload.referenceUrls.length > 4 ||
      payload.referenceUrls.some((item) => typeof item !== "string")
    ) {
      throw new Error("分享内容格式无效。");
    }
    return {
      prompt: payload.prompt,
      referenceUrls: payload.referenceUrls.map((item) => new URL(item, shareUrl).href)
    };
  });
  registerAssetIoIpc({
    assets,
    license,
    imageTasks,
    thumbHashes,
    referencedAssetPaths,
    invalidateAssetCatalog,
    backfillThumbHashes,
    createThumbHashForNativeImage,
    getAssetThumbnailUrl,
    resolveTextProvider,
    getTextTransport,
    trackAssetImported: (source) => {
      void analytics.track("asset.imported", { source });
    }
  });
  // ---------- 画板 ----------

  registerBoardIpc({
    assets,
    boards,
    boardImageTrash,
    settings,
    videoIpc,
    videoTasks,
    invalidateAssetCatalog,
    purgeExpiredBoardTrash,
    removeBoardAssociations,
    scheduleAssetGarbageCollection,
    trackBoardOpened: () => {
      void analytics.track("board.opened");
    },
    trackBoardCreated: () => {
      void analytics.track("board.created");
    }
  });

  // ---------- 素材库 / 评论 ----------

  ipcMain.handle("assets:library", (_event, cursor?: string, limit?: number) => assetCatalog.page(cursor, limit));
  ipcMain.handle("assets:item", (_event, boardId: string, nodeId: string) => assetCatalog.item(boardId, nodeId));

  ipcMain.handle("assets:detail", async (_event, boardId: string, nodeId: string): Promise<AssetDetailData> => {
    const board = await boards.getBoard(boardId);
    const node = board?.nodes.find((item) => item.id === nodeId);
    if (!board || !node || !isBoardImageNode(node)) return { versions: [], activeVersion: 0 };

    // 构建 jobId → job 映射（单次查询）。
    const jobs = await history.listJobs();
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    // 版本源：有编辑版本链则用它，否则合成单版本。
    const versionSources =
      node.versions && node.versions.length > 0
        ? node.versions
        : [{ imagePath: node.imagePath, jobId: node.jobId, width: node.width, height: node.height }];

    const referencedPaths = new Set(
      versionSources.flatMap((version) => jobById.get(version.jobId)?.referenceImagePaths ?? [])
    );
    const lineageByPath = new Map<string, { boardId: string; nodeId: string }>();
    if (referencedPaths.size > 0) {
      for (const candidateBoard of await boards.listBoards()) {
        for (const candidateNode of candidateBoard.nodes) {
          if (!isBoardImageNode(candidateNode)) continue;
          const paths = [candidateNode.imagePath, ...(candidateNode.versions ?? []).map((version) => version.imagePath)];
          for (const imagePath of paths) {
            if (referencedPaths.has(imagePath) && !lineageByPath.has(imagePath)) {
              lineageByPath.set(imagePath, { boardId: candidateBoard.id, nodeId: candidateNode.id });
            }
          }
        }
      }
    }

    const versions: AssetVersion[] = [];
    for (const ver of versionSources) {
      if (!(await assets.isReadable(ver.imagePath))) continue;
      const dataUrl = assets.toAssetUrl(ver.imagePath);

      const job = jobById.get(ver.jobId);
      const w = ver.width;
      const h = ver.height;

      // 构建引用图列表 + 血缘解析。
      const references: AssetReference[] = [];
      for (const refPath of job?.referenceImagePaths ?? []) {
        if (!(await assets.isReadable(refPath))) continue;
        const source = lineageByPath.get(refPath);
        references.push({
          imagePath: refPath,
          dataUrl: assets.toAssetUrl(refPath),
          sourceBoardId: source?.boardId,
          sourceNodeId: source?.nodeId
        });
      }

      versions.push({
        imagePath: ver.imagePath,
        dataUrl,
        jobId: ver.jobId,
        prompt: job?.prompt || job?.input.prompt || "",
        promptSpec: job?.input.promptSpec,
        useCase: job?.useCase ?? job?.input.useCase,
        size: job?.input.size ?? (w && h ? `${w}x${h}` : undefined),
        model: job?.input.model,
        createdAt: job?.createdAt ?? board.updatedAt,
        assistantConversationId: job?.input.assistantConversationId,
        references
      });
    }

    const rawActive = node.versions
      ? (node.activeVersion ?? node.versions.length - 1)
      : versions.length - 1;
    const activeVersion = Math.max(0, Math.min(rawActive, versions.length - 1));

    return { versions, activeVersion };
  });

  ipcMain.handle("assets:jobPrompt", async (_event, jobId: string): Promise<JobPromptInfo> => {
    const jobs = await history.listJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return { prompt: "", referenceImages: [] };
    const referenceImages: string[] = [];
    for (const filePath of job.referenceImagePaths ?? []) {
      if (await assets.isReadable(filePath)) referenceImages.push(assets.toAssetUrl(filePath));
    }
    return { prompt: job.prompt, referenceImages, promptSpec: job.input.promptSpec };
  });

  ipcMain.handle("comments:list", async () => comments.list());

  ipcMain.handle(
    "comments:add",
    async (_event, imagePath: string, text: string, position?: AssetComment["position"]) => {
      const comment = await comments.add(imagePath, text, position);
      recordMemory({
        type: "comment_added",
        surface: "comment",
        content: comment.text,
        assetPath: comment.imagePath,
        sourceId: comment.id
      });
      const sourceBoard = (await boards.listBoards()).find((board) => board.nodes.some((node) => (
        isBoardImageNode(node)
        && (node.imagePath === imagePath || (node.versions ?? []).some((version) => version.imagePath === imagePath))
      )));
      if (sourceBoard) {
        recordMemory({
          type: "comment_added",
          surface: "comment",
          content: comment.text,
          boardId: sourceBoard.id,
          sourceId: comment.id
        });
      }
      return comment;
    }
  );

  ipcMain.handle("comments:remove", async (_event, id: string) => {
    await comments.remove(id);
    await memories.removeBySource(id);
    return { ok: true };
  });

  ipcMain.handle(
    "comments:updatePosition",
    async (_event, id: string, position: NonNullable<AssetComment["position"]>) => (
      comments.updatePosition(id, position)
    )
  );

  // ---------- 素材元数据（收藏 / 标签 / 导出 dataUrl） ----------

  ipcMain.handle("assets:meta", async (_event, imagePath: string) => assetMeta.get(imagePath));

  ipcMain.handle("assets:toggleFavorite", async (_event, imagePath: string) => {
    const meta = await assetMeta.toggleFavorite(imagePath);
    invalidateAssetCatalog();
    return meta;
  });

  ipcMain.handle("assets:setTags", async (_event, imagePath: string, tags: string[]) => {
    const meta = await assetMeta.setTags(imagePath, tags);
    invalidateAssetCatalog();
    return meta;
  });

  ipcMain.handle("assets:metaList", async () => assetMeta.list());

  ipcMain.handle("asset:saveDataUrl", async (_event, dataUrl: string, suggestedName?: string) => {
    const directory = await resolveDownloadDirectory();
    if (!directory) return { ok: false };
    const destinationPath = await availableDownloadPath(directory, suggestedName || "image.png");
    if (dataUrl.startsWith("data:")) {
      const decoded = decodeImageDataUrl(dataUrl);
      await writeFile(destinationPath, decoded.bytes);
    } else {
      const sourcePath = assets.resolveAssetUrl(dataUrl);
      if (!sourcePath) throw new Error("无法识别的图片来源。");
      await assets.exportAsset(sourcePath, destinationPath);
    }
    return { ok: true, path: destinationPath, directory };
  });

  // ---------- 画板导出 / 导入（.itb = 标准 zip；兼容旧 .irb） ----------

  ipcMain.handle("boards:export", async (_event, id: string) => {
    const board = await boards.getBoard(id);
    if (!board) throw new Error("画板不存在。");
    const result = await dialog.showSaveDialog({
      defaultPath: `${board.name}.itb`,
      filters: [{ name: "Iterlay 画板", extensions: ["itb"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };

    // 定稿：历史保留失败记录，排除进行中/排队任务。
    const jobs = (await history.listJobs()).filter(
      (job) => job.boardId === id && job.status !== "running" && job.status !== "queued"
    );
    const videoJobs = (await videoTasks.listJobs()).filter(
      (job) => job.input.boardId === id && ["completed", "failed", "cancelled"].includes(job.status)
    );
    // 收集该画板图片对应的评论 / 收藏标签，一并打包（导入端可还原）。
    const imagePaths = new Set<string>();
    for (const node of board.nodes) {
      if (!isBoardImageNode(node)) continue;
      imagePaths.add(node.imagePath);
      for (const version of node.versions ?? []) imagePaths.add(version.imagePath);
    }
    const boardComments = (await comments.list()).filter((comment) => imagePaths.has(comment.imagePath));
    const boardMeta = (await assetMeta.list()).filter((meta) => imagePaths.has(meta.imagePath));
    const buffer = await buildBoardArchive(
      board, jobs, app.getVersion(), boardComments, boardMeta, videoJobs,
      await videoSequences.listSequences(id)
    );
    await writeFile(result.filePath, buffer);
    void analytics.track("board.exported");
    return { ok: true, path: result.filePath };
  });

  const importBoard = (buffer: Buffer) => importBoardBuffer(buffer, {
    assets, boards, history, videoTasks, videoSequences, comments, assetMeta,
    onImported: invalidateAssetCatalog
  });

  ipcMain.handle("boards:import", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Iterlay 画板", extensions: ["itb", "irb", "zip"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return importBoard(await readFile(result.filePaths[0]));
  });

  ipcMain.handle("boards:importData", async (_event, data: ArrayBuffer) => importBoard(Buffer.from(data)));
  return () => {
    assetMaintenance.dispose();
    mediaAbort.abort();
    imageWorker.dispose();
    videoIpc.dispose();
    videoSequenceIpc.dispose();
    disposeComicDramaIpc();
    disposePluginIpc();
    unsubscribePiAgentLogs();
    sharingIpc.dispose();
  };
}

function isSceneTemplateData(value: unknown): value is SceneTemplateData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scene = value as Partial<SceneTemplateData>;
  return Boolean(
    typeof scene.id === "string" && scene.id.trim() &&
    typeof scene.name === "string" && scene.name.trim() &&
    typeof scene.description === "string" &&
    typeof scene.prompt === "string" && scene.prompt.trim() &&
    typeof scene.category === "string" &&
    (scene.mode === "generate" || scene.mode === "edit") &&
    typeof scene.useCase === "string" &&
    (scene.extractionScenario === undefined || Boolean(normalizeTemplateExtractionScenario(scene.extractionScenario))) &&
    (scene.source === "preset" || scene.source === "custom")
  );
}

function safeArchiveBaseName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "未命名模板";
}

async function fingerprintAgentMediaOperation(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeWechatPackageName(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  const safe = Array.from(normalized || "iterlay-wechat-stickers")
    .filter((character) => character.charCodeAt(0) >= 32 && !/[\\/:*?"<>|]/.test(character))
    .join("")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return safe || "iterlay-wechat-stickers";
}

function normalizeWechatPackageRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) {
    throw new Error("微信表情素材包包含无效文件名。");
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) =>
      !segment ||
      segment === "." ||
      segment === ".." ||
      Array.from(segment).some((character) => character.charCodeAt(0) < 32) ||
      /[:*?"<>|]/.test(segment)
    )
  ) {
    throw new Error(`微信表情素材包包含不安全路径：${value}`);
  }
  return segments.join("/");
}

function toWechatPackageBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("微信表情素材包含无法识别的二进制数据。");
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await mapper(values[index]);
      }
    })
  );
  return results;
}
