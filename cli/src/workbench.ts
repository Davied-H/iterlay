import { verifyProviderOutput } from "../../electron/application/provider-output-verification.js";
import { checkProviderConnection } from "../../electron/providers/diagnostics.js";
import path from "node:path";
import { AssetStore } from "../../electron/storage/asset-store.js";
import { BoardStore } from "../../electron/storage/board-store.js";
import { BoardImageTrashStore } from "../../electron/storage/board-image-trash-store.js";
import { HistoryStore } from "../../electron/storage/history-store.js";
import { SettingsStore } from "../../electron/storage/settings-store-core.js";
import { TemplateStore } from "../../electron/storage/template-store.js";
import { VideoTaskStore } from "../../electron/storage/video-task-store.js";
import { SceneMediaStore } from "../../electron/storage/scene-media-store.js";
import { ModificationRequestStore } from "../../electron/storage/modification-request-store.js";
import { ModificationRequests } from "../../electron/application/modification-requests.js";
import { AssetCatalog } from "../../electron/application/asset-catalog.js";
import { registerBoardCommands } from "../../electron/board-commands.js";
import { registerVideoCommands } from "../../electron/video/video-commands.js";
import { createImageGenerationCommand } from "../../electron/application/image-generation.js";
import { configureProvider } from "../../electron/provider-settings.js";
import { ImageProviderRegistry } from "../../electron/providers/image-registry.js";
import { Sub2ApiImageProvider } from "../../electron/providers/sub2api.js";
import { ArkImageProvider } from "../../electron/providers/ark.js";
import { BailianImageProvider } from "../../electron/providers/bailian.js";
import { FalImageProvider } from "../../electron/providers/fal.js";
import { VideoGenerationService } from "../../electron/video-generation-service.js";
import { readImageDimensions } from "../../electron/media/image-metadata.js";
import { WORKBENCH_COMMANDS } from "../../shared/contracts/workbench-commands.js";
import { isBoardImageNode, isBoardVideoNode, type AssetLibraryItem } from "../../shared/types.js";
import { validateCropRect, MAX_SLICE_COUNT } from "../../shared/image-slicing.js";
import { waitForStorageMutations } from "../../electron/storage/atomic-json.js";
import type { WorkspaceApi } from "../../electron/application/workbench-api.js";
import type { CommandRegistrar } from "../../electron/application/command-registrar.js";
import { workspaceCipher } from "./credentials.js";
import { encodeNodeImageDelivery } from "./image-output-encoder.js";

export async function createNodeWorkbench(userDataPath: string) {
  const directory = path.join(userDataPath, "workspace");
  const settings = new SettingsStore(directory, await workspaceCipher(userDataPath));
  const assets = new AssetStore(directory);
  const boards = new BoardStore(directory, (file) => readImageDimensions(file, async () => null));
  const trash = new BoardImageTrashStore(directory);
  const history = new HistoryStore(directory);
  const videoTasks = new VideoTaskStore(directory);
  const templates = new TemplateStore(path.join(userDataPath, "templates.json"));
  const modifications = new ModificationRequests(new ModificationRequestStore(userDataPath), boards, assets, history);
  await history.failInterruptedJobs();
  const handlers = new Map<string, Parameters<CommandRegistrar>[1]>();
  const register: CommandRegistrar = (channel, handler) => { handlers.set(channel, handler); };
  const video = registerVideoCommands({ settings, assets, boards, videoTasks, videoService: new VideoGenerationService() }, register);
  registerBoardCommands({
    assets, boards, boardImageTrash: trash, settings, videoIpc: video, videoTasks,
    invalidateAssetCatalog: () => catalog.invalidate(),
    // Trash stays recoverable until explicitly removed; no unattended asset deletion.
    purgeExpiredBoardTrash: async () => 0,
    removeBoardAssociations: async (ids) => { for (const id of ids) { await history.removeJobsByBoard(id); await videoTasks.removeJobsByBoard(id); } },
    scheduleAssetGarbageCollection: () => undefined,
    trackBoardOpened: () => undefined, trackBoardCreated: () => undefined
  }, register);
  const provider = new Sub2ApiImageProvider();
  const registry = new ImageProviderRegistry({ "openai-compatible": provider, openrouter: provider, poe: provider,
    ark: new ArkImageProvider(), bailian: new BailianImageProvider(), fal: new FalImageProvider() });
  const generation = createImageGenerationCommand({
    settings, assets, boards, history, sceneMedia: new SceneMediaStore(directory),
    getProviderAdapter: (config) => registry.get(config), recordMemory: () => undefined,
    encodeImageDelivery: encodeNodeImageDelivery,
    backfillThumbHashes: () => undefined, createGeneratedBoardNodes: async () => [],
    analytics: { track: async () => undefined }
  });
  const catalog = new AssetCatalog(async () => {
    const jobs = new Map((await history.listJobs()).map((job) => [job.id, job]));
    const items: AssetLibraryItem[] = [];
    for (const board of await boards.listBoards()) for (const node of board.nodes) {
      if (!isBoardImageNode(node) && !isBoardVideoNode(node)) continue;
      const file = isBoardVideoNode(node) ? node.videoPath : node.imagePath;
      if (!file) continue;
      const url = assets.toAssetUrl(file), job = jobs.get(node.jobId);
      items.push({ mediaType: isBoardVideoNode(node) ? "video" : "image", imagePath: file, dataUrl: url, thumbnailUrl: url,
        boardId: board.id, boardName: board.name, nodeId: node.id, jobId: node.jobId,
        prompt: job?.prompt ?? "", createdAt: job?.createdAt ?? board.updatedAt,
        width: node.width, height: node.height, source: node.source ?? "generated", favorite: false, tags: [] });
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, async (items) => items);
  const api = Object.fromEntries(Object.entries(WORKBENCH_COMMANDS).map(([name, channel]) => [name, async (...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`独立运行时不支持操作 ${name}。`);
    return handler(undefined as never, ...args);
  }])) as WorkspaceApi;
  Object.assign(api, {
    getSettings: async () => ({ ...settings.getSettings(), providerKeyStatus: settings.getKeyStatus(), codexAuthStatusByProviderId: {}, setupComplete: settings.hasSavedSettings() }),
    testProvider: (config, override, options) => options?.mode === "generation"
      ? verifyProviderOutput(config, options, override, { settings, assets, history, getProviderAdapter: (value) => registry.get(value) })
      : checkProviderConnection(config, override?.trim() || settings.getApiKey(config.id), "image"),
    configureProvider: (input) => configureProvider(settings, input),
    generateImage: (input) => generation(input), cancelImageGeneration: (id) => generation.cancel(id),
    retryImageDelivery: (input) => generation.retryDelivery(input),
    listHistory: () => history.listJobs(),
    listTemplates: () => templates.list(), getTemplate: (id) => templates.get(id),
    createTemplate: (input) => templates.create(input), updateTemplate: (id, patch, expected) => templates.update(id, patch, expected),
    syncTemplates: (previous, next, migrate) => templates.sync(previous, next, migrate),
    importUploadedImage: async (dataUrl) => ({ path: await assets.saveUpload(dataUrl) }),
    readAssetDataUrl: (file) => assets.readManagedDataUrl(file),
    listAssets: (cursor, limit) => catalog.page(cursor, limit),
    sliceImage: async (request) => {
      if (!Array.isArray(request.crops) || !request.crops.length || request.crops.length > MAX_SLICE_COUNT) throw new Error("切图区域数量无效。");
      const bytes = await assets.readManagedBytes(request.sourcePath);
      const { default: sharp } = await import("sharp");
      const image = sharp(bytes, { limitInputPixels: 100_000_000 });
      const size = await image.metadata();
      if (!size.width || !size.height) throw new Error("无法读取源图片尺寸。");
      request.crops.forEach((crop) => validateCropRect(crop, size.width!, size.height!));
      const outputs = [];
      for (const crop of request.crops) outputs.push(await image.clone().extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer());
      const files = await assets.saveDerivedPngs(`slice-${crypto.randomUUID()}`, outputs);
      return files.map((file, index) => ({ path: file, dataUrl: assets.toAssetUrl(file), width: request.crops[index].width, height: request.crops[index].height }));
    },
    saveAssetsAsZip: async () => { throw new Error("独立模式请使用 assets export --path … --out … 导出文件。"); },
    createModificationRequest: (input) => modifications.create(input), listModificationRequests: (id) => modifications.list(id),
    getModificationRequest: (id) => modifications.get(id), clarifyModificationRequest: (id, instruction) => modifications.clarify(id, instruction),
    prepareModificationRequest: (id, token) => modifications.prepare(id, token), claimModificationRequest: (id, owner) => modifications.claim(id, owner),
    finishModificationRequest: (input) => modifications.finish(input)
  } satisfies Partial<WorkspaceApi>);
  try { await video.recover(); } catch (error) { await video.dispose(); throw error; }
  return {
    api,
    invalidate: () => catalog.invalidate(),
    dispose: async () => { await video.dispose(); await waitForStorageMutations(); await history.flush(); }
  };
}
