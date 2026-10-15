import { waitForStorageMutations } from "./storage/atomic-json.js";
import { readImageDimensions } from "./media/image-metadata.js";
import { ImageTaskQueue } from "./image-worker-client.js";
import { allowedExternalUrl, installRendererSecurity, isTrustedRendererUrl } from "./renderer-security.js";
import { installWindowLifecycle } from "./window-lifecycle.js";
import { app, BrowserWindow, dialog, Menu, nativeImage, nativeTheme, net, shell } from "electron";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { removeConnectedBackground } from "../shared/background-removal.js";
import { extractIterlayDeepLinks, ITERLAY_DEEP_LINK_SCHEME } from "../shared/deep-link.js";
import { resolveAppLocale, type ResolvedAppLocale } from "../shared/i18n.js";
import type { AppIconPreference, CustomAppIcon, ProviderConfig, ProviderGenerateInput } from "../shared/types.js";
import { VIDEO_SEQUENCE_EVENT_CHANNEL } from "../shared/video-sequence.js";
import { applyAppIcon, loadAppIcon } from "./app-icon.js";
import { buildApplicationMenuTemplate } from "./application-menu.js";
import { registerAssetProtocol } from "./asset-protocol.js";
import { CodexOAuthService } from "./auth/codex-oauth.js";
import { dispatchDeepLink, registerDeepLinkIpc } from "./deep-link.js";
import { ensureInitialDemoBoard } from "./demo-board.js";
import { registerIpc } from "./ipc.js";
import { LicenseService, registerLicenseIpc } from "./licensing/index.js";
import { MasterGoBridge } from "./mastergo-bridge.js";
import { startMcpBridge } from "./mcp-bridge.js";
import { runElectronMcpServer } from "./mcp-stdio.js";
import { FfmpegService } from "./media/ffmpeg-service.js";
import { MediaToolsManager } from "./media/media-tools-manager.js";
import { registerMediaToolsIpc } from "./media/media-tools-ipc.js";
import { MEDIA_TOOLS_STATE_CHANNEL } from "../shared/media-tools.js";
import {
  extractChromaticPhotoSubject,
  extractConnectedPhotoSubject,
  fillPhotoLayerInterior,
  hasLostProtectedOpaqueEdge,
  inpaintPhotoBackground,
  intersectPhotoLayerMask,
  measureOpaqueBounds,
  measureOpaqueEdgeFractions,
  measureOpaqueFraction,
  segmentPhotoLayer,
  subtractPhotoLayerMask
} from "./photo-layer-segmentation.js";
import { PiAgentEvolutionStore } from "./pi-agent-evolution.js";
import { PiAgentLogStore } from "./pi-agent-log.js";
import { ArkImageProvider } from "./providers/ark.js";
import { BailianImageProvider } from "./providers/bailian.js";
import { CodexOAuthImageProvider } from "./providers/codex-oauth.js";
import { FalImageProvider } from "./providers/fal.js";
import { Sub2ApiImageProvider } from "./providers/sub2api.js";
import type { VideoProviderConfig as RuntimeVideoProviderConfig } from "./providers/video-types.js";
import { exportLogArchive, RuntimeLog } from "./runtime-log.js";
import { buildStartupPage } from "./startup-page.js";
import { AssetMetaStore } from "./storage/asset-meta-store.js";
import { AssetStore } from "./storage/asset-store.js";
import { AssistantConversationStore } from "./storage/assistant-conversation-store.js";
import { BoardImageTrashStore } from "./storage/board-image-trash-store.js";
import { BoardStore } from "./storage/board-store.js";
import { CommentStore } from "./storage/comment-store.js";
import { HistoryStore } from "./storage/history-store.js";
import { MemoryStore } from "./storage/memory-store.js";
import { OnboardingStore } from "./storage/onboarding-store.js";
import { SceneMediaStore } from "./storage/scene-media-store.js";
import { SettingsStore } from "./storage/settings-store.js";
import { ThumbHashStore } from "./storage/thumbhash-store.js";
import { VideoSequenceStore } from "./storage/video-sequence-store.js";
import { VideoSequenceTemplateStore } from "./storage/video-sequence-template-store.js";
import { VideoTaskStore } from "./storage/video-task-store.js";
import { GitHubUpdateApiClient } from "./updater/github-api-client.js";
import {
  AppUpdateService,
  DirectDownloadDriver,
  registerUpdateIpc,
  UPDATE_STATE_CHANNEL,
  UpdatePreferenceStore
} from "./updater/index.js";
import { defaultVideoProviders, VideoGenerationService } from "./video-generation-service.js";
import { createVideoSubmitInputNormalizer } from "./video-reference-image.js";
import type { VideoSequenceTask } from "./video-sequence-types.js";
import { VideoSequenceScheduler } from "./video/video-sequence-scheduler.js";
import { resolveWindowFrameOptions, resolveWindowsTitleBarOverlay } from "./window-chrome.js";
import { migrateLegacyWorkspace } from "./workspace-migration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = "Iterlay";
const APP_ID = "dev.dong.iterlay";
const UPDATE_QUIT_FEEDBACK_DELAY_MS = 1_200;
const processStartedAt = performance.now();
// A packaged app ignores all browser-development flags.
const isBrowserDev = !app.isPackaged && process.env.ITERLAY_BROWSER_DEV === "1";
let browserDevBridge: { flush: () => Promise<void>; close: () => void } | undefined;
let updateQuitScheduled = false;

function quitForUpdate(): void {
  if (updateQuitScheduled) return;
  updateQuitScheduled = true;

  // 先让渲染层显示“正在安装并重启”，避免正常退出被误认为闪退。
  setTimeout(() => {
    if (process.platform !== "win32") {
      app.quit();
      return;
    }

    // NSIS 会等待当前 PID 退出后才替换文件。正常退出被活跃句柄卡住时，
    // 兜底终止进程，避免更新器无限等待并让用户停留在“正在重启”。
    let didBeginQuit = false;
    app.once("will-quit", () => {
      didBeginQuit = true;
    });
    app.quit();
    const forceExitTimer = setTimeout(() => {
      if (didBeginQuit) app.exit(0);
    }, 1_500);
    forceExitTimer.unref();
  }, UPDATE_QUIT_FEEDBACK_DELAY_MS);
}

function photoLayerSegmenterPath(): string {
  const fileName = `photo-layer-segmenter-${process.arch}`;
  return app.isPackaged
    ? path.join(process.resourcesPath, "native", fileName)
    : path.join(app.getAppPath(), "resources", "native", fileName);
}

function normalizeGeneratedPhotoEdit(bytes: Buffer, width: number, height: number): Electron.NativeImage {
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error("图片模型没有返回可读取的图片。");
  const size = image.getSize();
  const scale = Math.max(width / size.width, height / size.height);
  const resizedWidth = Math.max(width, Math.round(size.width * scale));
  const resizedHeight = Math.max(height, Math.round(size.height * scale));
  const resized = image.resize({ width: resizedWidth, height: resizedHeight, quality: "best" });
  return resized.crop({
    x: Math.max(0, Math.floor((resizedWidth - width) / 2)),
    y: Math.max(0, Math.floor((resizedHeight - height) / 2)),
    width,
    height
  });
}

if (isBrowserDev) {
  const userData = process.env.ITERLAY_BROWSER_DEV_USER_DATA;
  if (!userData || !process.env.ITERLAY_BROWSER_DEV_BRIDGE_CONFIG || !process.env.VITE_DEV_SERVER_URL) {
    throw new Error("请使用 pnpm dev 启动网页调试，以确保独立的开发工作区。");
  }
  app.setPath("userData", path.resolve(userData));
  app.setPath("sessionData", path.join(path.resolve(userData), "session"));
  app.setAppLogsPath(path.join(path.resolve(userData), "logs"));
  process.on("SIGTERM", () => app.quit());
  process.on("SIGINT", () => app.quit());
} else if (process.env.ITERLAY_PLAYWRIGHT === "1" && process.env.ITERLAY_E2E_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.ITERLAY_E2E_USER_DATA));
}
app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

const isMcpMode = process.argv.includes("--mcp");
if (!isMcpMode) installRendererSecurity(path.join(__dirname, "../../dist/index.html"), app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL);
let runtimeLog: RuntimeLog | undefined;
let flushAgentLogs: (() => Promise<void>) | undefined;
let flushHistoryStore: (() => Promise<void>) | undefined;
let guardWindowClose: ((window: BrowserWindow) => void) | undefined;
if (!isMcpMode) {
  try {
    runtimeLog = new RuntimeLog(app.getPath("logs"));
    runtimeLog.captureConsole();
    runtimeLog.record("main", "info", "Application started", { version: app.getVersion(), platform: process.platform, pid: process.pid });
    app.on("web-contents-created", (_event, contents) => {
      contents.on("console-message", (details) => {
        runtimeLog?.record(`renderer:${contents.id}`, details.level, details.message, `${details.sourceId}:${details.lineNumber}`);
      });
      contents.on("preload-error", (_event, preloadPath, error) => {
        runtimeLog?.record(`renderer:${contents.id}`, "error", preloadPath, error);
      });
    });
    app.on("child-process-gone", (_event, details) => runtimeLog?.record("child-process", "error", details));
  } catch (error) {
    console.error("Unable to initialize runtime logs", error);
  }
}
const hasSingleInstanceLock = isMcpMode || process.env.ITERLAY_PLAYWRIGHT === "1" ? true : app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  registerDeepLinkIpc();
  app.on("open-url", (event, url) => {
    event.preventDefault();
    dispatchDeepLink(url);
  });
  app.on("second-instance", (_event, argv) => {
    for (const url of extractIterlayDeepLinks(argv)) dispatchDeepLink(url);
  });
  for (const url of extractIterlayDeepLinks(process.argv)) dispatchDeepLink(url);
}

function installApplicationMenu(
  createNewWindow: () => void,
  locale: ResolvedAppLocale
): void {
  let exporting = false;
  const exportLogs = async () => {
    if (exporting) return;
    exporting = true;
    const title = locale === "zh-CN" ? "导出运行日志" : "Export Runtime Logs";
    try {
      const result = await dialog.showSaveDialog({
        title,
        defaultPath: path.join(app.getPath("downloads"), `Iterlay-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`),
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        message: locale === "zh-CN"
          ? "导出当前保留的运行和助手日志。日志可能包含提示词、文件路径等隐私信息，请检查后再分享。"
          : "Export retained runtime and agent logs. Review prompts, paths and personal information before sharing."
      });
      if (result.canceled || !result.filePath) return;
      if (!runtimeLog) throw new Error(locale === "zh-CN" ? "运行日志初始化失败，请检查日志目录权限或磁盘空间。" : "Runtime logging failed to initialize. Check disk space and permissions.");
      await Promise.all([flushAgentLogs?.(), runtimeLog?.flush()]);
      await exportLogArchive(app.getPath("logs"), result.filePath, {
        appVersion: app.getVersion(), platform: process.platform, arch: process.arch,
        electron: process.versions.electron, node: process.versions.node
      });
      shell.showItemInFolder(result.filePath);
    } catch (error) {
      console.error("Log export failed", error);
      await dialog.showMessageBox({ type: "error", title, message: locale === "zh-CN" ? "日志导出失败" : "Log export failed", detail: String(error) });
    } finally {
      exporting = false;
    }
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenuTemplate(createNewWindow, process.platform, locale, () => { void exportLogs(); })));
}

type WindowTheme = "light" | "dark" | "system";

function startupBackground(theme: WindowTheme): string {
  return theme === "dark" || (theme === "system" && nativeTheme.shouldUseDarkColors) ? "#121212" : "#fafafa";
}

function startupMark(stage: string): void {
  console.info(`[startup] ${stage} ${Math.round(performance.now() - processStartedAt)}ms`);
}

async function showLoadFailure(
  win: BrowserWindow,
  description: string,
  locale: ResolvedAppLocale = resolveAppLocale("system", app.getLocale())
): Promise<void> {
  if (isBrowserDev) throw new Error(`网页开发后端加载失败：${description}`);
  const detail = description.replace(/[<>&]/g, "");
  const copy = locale === "zh-CN"
    ? { title: "Iterlay 未能完成加载", description: "本地工作区没有被修改。", reload: "重新加载" }
    : { title: "Iterlay could not finish loading", description: "Your local workspace was not modified. ", reload: "Reload" };
  const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>Iterlay</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#fafafa;color:#171717;font:14px system-ui,sans-serif;-webkit-app-region:drag}.box{max-width:420px;padding:32px;text-align:center}h1{font-size:17px}p{line-height:1.65;color:#666}button{height:36px;border:0;border-radius:6px;padding:0 16px;background:#171717;color:white;font:inherit;cursor:pointer;-webkit-app-region:no-drag}</style><div class="box"><h1>${copy.title}</h1><p>${copy.description}${detail}</p><button onclick="location.reload()">${copy.reload}</button></div></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  if (!win.isVisible()) win.show();
}

function createWindowFrame(
  appIcon: AppIconPreference,
  customAppIcons: CustomAppIcon[] = [],
  theme: WindowTheme = "system"
): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: "Iterlay",
    icon: loadAppIcon(appIcon, customAppIcons),
    show: false,
    backgroundColor: startupBackground(theme),
    ...resolveWindowFrameOptions(process.platform, theme, nativeTheme.shouldUseDarkColors),
    webPreferences: {
      preload: path.join(__dirname, "preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  guardWindowClose?.(win);
  const openLink = (url: string): void => {
    if (url.toLowerCase().startsWith("iterlay:")) dispatchDeepLink(url);
    else if (allowedExternalUrl(url)) void shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url, path.join(__dirname, "../../dist/index.html"), app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL)) return;
    event.preventDefault();
    openLink(url);
  });
  win.once("ready-to-show", () => {
    if (isBrowserDev) return;
    win.show();
    startupMark("window-visible");
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    console.error("Iterlay main document failed to load", errorCode, errorDescription);
    void showLoadFailure(win, errorDescription);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Iterlay renderer process exited", details.reason, details.exitCode);
  });

  return win;
}

async function loadStartupPage(win: BrowserWindow, theme: WindowTheme): Promise<void> {
  if (isBrowserDev) { await win.loadURL("about:blank"); return; }
  const dark = theme === "dark" || (theme === "system" && nativeTheme.shouldUseDarkColors);
  const html = buildStartupPage({ dark, locale: resolveAppLocale("system", app.getLocale()) });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function loadApplication(win: BrowserWindow, theme: WindowTheme = "system"): Promise<void> {
  const bootTheme = theme === "system"
    ? (nativeTheme.shouldUseDarkColors ? "dark" : "light")
    : theme;
  try {
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      const url = new URL(process.env.VITE_DEV_SERVER_URL);
      url.searchParams.set("bootTheme", bootTheme);
      if (isBrowserDev) url.searchParams.set("__iterlay_backend", "1");
      await win.loadURL(url.toString());
      if (!isBrowserDev && process.env.ITERLAY_PLAYWRIGHT !== "1") {
        win.webContents.openDevTools({ mode: "detach" });
      }
    } else {
      await win.loadFile(path.join(__dirname, "../../dist/index.html"), { query: { bootTheme } });
    }
    // The transient data: startup page would otherwise remain in Chromium's history.
    // macOS mouse back/forward buttons can navigate to it after the workbench is ready.
    win.webContents.navigationHistory.clear();
  } catch (error) {
    console.error("Iterlay window load failed", error);
    await showLoadFailure(win, error instanceof Error ? error.message : "请重新加载后重试。");
  }
}

async function createWindow(
  appIcon: AppIconPreference,
  customAppIcons: CustomAppIcon[],
  theme: WindowTheme = "system"
): Promise<void> {
  const win = createWindowFrame(appIcon, customAppIcons, theme);
  await loadStartupPage(win, theme);
  await loadApplication(win, theme);
}

if (isMcpMode) {
  void runElectronMcpServer().finally(() => app.quit());
} else app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  if (app.isPackaged) app.setAsDefaultProtocolClient(ITERLAY_DEEP_LINK_SCHEME);
  guardWindowClose = installWindowLifecycle(
    async () => { await waitForStorageMutations(); await flushHistoryStore?.(); await Promise.all([flushAgentLogs?.(), runtimeLog?.flush()]); },
    isBrowserDev ? () => browserDevBridge?.flush() ?? Promise.resolve() : undefined
  );
  if (isBrowserDev && process.platform === "darwin") app.dock?.hide();
  startupMark("electron-ready");
  const startupWindow = createWindowFrame("default", [], "system");
  await loadStartupPage(startupWindow, "system");
  startupMark("startup-document-loaded");

  const dataDir = path.join(app.getPath("userData"), "workspace");
  if (!isBrowserDev) await migrateLegacyWorkspace(dataDir, app.getPath("appData"));
  startupMark("workspace-migrated");
  const settings = new SettingsStore(dataDir);
  const appLocale = resolveAppLocale(settings.getSettings().language, app.getLocale());
  const onboarding = new OnboardingStore(dataDir);
  const codexAuth = new CodexOAuthService(dataDir);
  const appIcon = settings.getSettings().appIcon ?? "default";
  const customAppIcons = settings.getSettings().customAppIcons ?? [];
  applyAppIcon(appIcon, customAppIcons);
  startupWindow.setBackgroundColor(startupBackground(settings.getSettings().theme));
  startupWindow.setIcon(loadAppIcon(appIcon, customAppIcons));
  if (process.platform === "win32") {
    startupWindow.setTitleBarOverlay(
      resolveWindowsTitleBarOverlay(settings.getSettings().theme, nativeTheme.shouldUseDarkColors)
    );
    nativeTheme.on("updated", () => {
      const currentTheme = settings.getSettings().theme;
      if (currentTheme !== "system") return;
      const overlay = resolveWindowsTitleBarOverlay(currentTheme, nativeTheme.shouldUseDarkColors);
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.setTitleBarOverlay(overlay);
      }
    });
  }
  installApplicationMenu(() => {
    const current = settings.getSettings();
    void createWindow(current.appIcon ?? "default", current.customAppIcons ?? [], current.theme);
  }, appLocale);
  const history = new HistoryStore(dataDir);
  flushHistoryStore = () => history.flush();
  const historyReady = history.failInterruptedJobs();
  const videoTasks = new VideoTaskStore(dataDir);
  const videoSequences = new VideoSequenceStore(dataDir);
  const videoSequenceTemplates = new VideoSequenceTemplateStore(dataDir);
  const dimensionTasks = new ImageTaskQueue();
  const boards = new BoardStore(dataDir, (imagePath) => readImageDimensions(imagePath, () => dimensionTasks.run(() => {
    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    return width > 0 && height > 0 ? { width, height } : null;
  })));

  const boardImageTrash = new BoardImageTrashStore(dataDir);
  const assets = new AssetStore(dataDir);
  const comments = new CommentStore(dataDir);
  const assistantConversations = new AssistantConversationStore(dataDir);
  const memories = new MemoryStore(dataDir);
  const memoryOrganizer = setInterval(() => {
    if (settings.getSettings().memoryEnabled) {
      void memories.organize().catch((error) => console.warn("整理助手记忆失败。", error));
    }
  }, 6 * 60 * 60 * 1_000);
  memoryOrganizer.unref();
  const assetMeta = new AssetMetaStore(dataDir);
  const thumbHashes = new ThumbHashStore(dataDir);
  const sceneMedia = new SceneMediaStore(dataDir);
  const license = new LicenseService();
  const manageApiBaseUrl = process.env.ITERLAY_LICENSE_API_URL ?? "https://iterlay.daived.com:31243/api/v1";
  const videoService = new VideoGenerationService(
    defaultVideoProviders(),
    createVideoSubmitInputNormalizer((bytes) => nativeImage.createFromBuffer(bytes))
  );
  let resumeMediaTasks: (() => void) | undefined;
  const mediaTools = new MediaToolsManager({
    userDataPath: app.getPath("userData"),
    resourcesPath: app.isPackaged ? process.resourcesPath : undefined,
    fetcher: (input, init) => net.fetch(input instanceof URL ? input.toString() : input, init),
    onStateChange: (state) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(MEDIA_TOOLS_STATE_CHANNEL, state);
      }
      if (state.status === "ready") resumeMediaTasks?.();
    }
  });
  const disposeMediaToolsIpc = registerMediaToolsIpc(mediaTools, {
    appFile: path.join(__dirname, "../../dist/index.html"),
    developmentUrl: app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL
  });
  const ffmpeg = new FfmpegService(dataDir, undefined, () => mediaTools.requireReady());
  const videoSequenceScheduler = new VideoSequenceScheduler({
    store: videoSequences,
    assets,
    videoService,
    ffmpeg,
    resolveProvider: (task: VideoSequenceTask) => {
      const current = settings.getSettings();
      const provider = current.videoProviders.find((candidate) => candidate.id === task.input.providerId)
        ?? current.videoProviders.find((candidate) => candidate.id === current.activeVideoProviderId);
      if (!provider) throw new Error("视频 Provider 不存在或已被删除。");
      if (provider.type === "openrouter") throw new Error("当前视频序列任务暂不支持 OpenRouter Provider。");
      const connection = settings.resolveVideoProviderConnection(provider);
      const model = task.input.model.trim() || provider.model.trim();
      if (!model) throw new Error("视频模型 ID 不能为空。");
      const config: RuntimeVideoProviderConfig = { provider: provider.type, model, apiKey: connection.apiKey, ...(connection.baseUrl.trim() ? { baseUrl: connection.baseUrl.trim() } : {}) };
      return { config, providerName: provider.name };
    },
    onChange: (task) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(VIDEO_SEQUENCE_EVENT_CHANNEL, { type: "task-changed", boardId: task.boardId, sequenceId: task.sequenceId, job: task });
      }
    }
  });
  resumeMediaTasks = () => videoSequenceScheduler.resumeWaitingForTools();
  void videoSequenceScheduler.recover().catch((error) => console.warn("恢复视频序列任务失败。", error));
  const compatibleImageProvider = new Sub2ApiImageProvider();
  const codexImageProvider = new CodexOAuthImageProvider(codexAuth);
  const falImageProvider = new FalImageProvider();
  const bailianImageProvider = new BailianImageProvider();
  const arkImageProvider = new ArkImageProvider();
  const editPhotoWithActiveProvider = async (
    reference: Buffer,
    prompt: string,
    width: number,
    height: number
  ): Promise<Buffer> => {
    const current = settings.getSettings();
    const config = current.providers.find((provider) => provider.id === current.activeProviderId)
      ?? current.providers[0];
    if (!config?.supportsReferenceImages) {
      throw new Error("当前图片模型不支持参考图编辑。");
    }
    await license.ensureCapability("edit", true);
    const apiKey = settings.getApiKey(config.id);
    if (config.type !== "official" && config.type !== "codex-oauth" && !apiKey) {
      throw new Error("当前图片 Provider 尚未配置 API Key。");
    }
    const input: ProviderGenerateInput = {
      workflowMode: "edit",
      useCase: "precise-object-edit",
      prompt,
      model: config.type === "fal"
        ? config.referenceModel?.trim() || config.model.trim()
        : config.model.trim(),
      size: `${width}x${height}`,
      n: 1,
      quality: "high",
      referenceImages: [{
        name: "photo-layer-reference.png",
        mimeType: "image/png",
        role: "edit-target",
        bytes: reference
      }]
    };
    const generation = config.type === "codex-oauth"
        ? codexImageProvider.generate(input, config, apiKey)
        : config.type === "fal"
          ? falImageProvider.generate(input, config, apiKey)
          : config.type === "bailian"
            ? bailianImageProvider.generate(input, config, apiKey)
            : config.type === "ark"
              ? arkImageProvider.generate(input, config, apiKey)
              : compatibleImageProvider.generate(input, config as ProviderConfig, apiKey);
    const result = await new Promise<Awaited<typeof generation>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("图片模型编辑超过 120 秒未返回。")), 120_000);
      void generation.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
    const output = result.images[0]?.bytes;
    if (!output?.byteLength) throw new Error("图片模型没有返回修复结果。");
    return output;
  };
  const updatePlatform = process.platform === "win32" ? "win32" : "darwin";
  const update = new AppUpdateService({
    currentVersion: app.getVersion(),
    platform: updatePlatform,
    arch: process.arch === "arm64" ? "arm64" : "x64",
    apiClient: new GitHubUpdateApiClient((input, init) => net.fetch(input instanceof URL ? input.toString() : input, init)),
    driver: new DirectDownloadDriver({
      downloadDir: path.join(app.getPath("userData"), "updates"),
      platform: updatePlatform,
      deviceIdProvider: () => license.getDeviceId(),
      applicationPath: updatePlatform === "win32" ? process.execPath : path.resolve(process.execPath, "../../..")
    }),
    preferences: new UpdatePreferenceStore(dataDir),
    onQuitRequested: quitForUpdate
  });
  await Promise.all([
    historyReady,
    license.initialize().catch((error: unknown) => {
      console.warn("授权服务暂时不可用，将按本地授权状态启动。", error);
    }),
    update.initialize(),
    registerAssetProtocol(assets)
  ]);
  startupMark("core-services-ready");
  registerLicenseIpc(license);
  update.onStateChange((snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(UPDATE_STATE_CHANNEL, snapshot);
    }
  });
  registerUpdateIpc(update);
  // 开发模式下不做自动检查，手动“检查更新”入口仍可用。
  if (app.isPackaged) {
    // 不让更新服务的网络延迟阻塞首窗；状态返回后 UpdateManager 仍会立即执行强更门禁。
    void update.check("auto").catch((error) => console.warn("启动更新检查失败。", error));
    update.startAutoCheck();
  }

  // 一次性迁移：老用户也会补装演示画板，但不会改变其当前画板或重复恢复已删除的演示数据。
  const boardsBeforeDemoInstall = await boards.listBoards();
  try {
    const installed = await ensureInitialDemoBoard({
      assetsDirectory: app.isPackaged
        ? path.join(process.resourcesPath, "demo-assets")
        : path.join(app.getAppPath(), "demo-assets"),
      assets,
      boards,
      history,
      comments,
      assetMeta,
      createThumbnailDataUrl: (bytes) => {
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new Error("演示画板封面图片无效。");
        const thumbnail = image.resize({ width: 480, quality: "good" }).toJPEG(75);
        return `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
      }
    });
    if (installed?.isFirstBoard) {
      await history.assignJobsWithoutBoard(installed.board.id);
      await boards.setLastOpenedBoardId(installed.board.id);
    }
  } catch (error) {
    console.error("安装演示画板失败。", error);
    if (boardsBeforeDemoInstall.length === 0) {
      const initialBoard = (await boards.listBoards())[0] ?? (await boards.createBoard("画板 1"));
      await history.assignJobsWithoutBoard(initialBoard.id);
      await boards.setLastOpenedBoardId(initialBoard.id);
    }
  }
  const piAgentLogs = new PiAgentLogStore(app.getPath("logs"));
  await piAgentLogs.start();
  flushAgentLogs = () => piAgentLogs.flush();
  const piAgentEvolution = new PiAgentEvolutionStore(path.join(app.getPath("userData"), "pi-agent"));
  const masterGoBridge = new MasterGoBridge(
    path.join(app.getPath("userData"), "mastergo-workspace"),
    app.getVersion(),
    (entry) => piAgentLogs.record(entry),
    {
      getSize: async (sourcePath) => {
        const image = nativeImage.createFromPath(sourcePath);
        if (image.isEmpty()) throw new Error("无法读取待还原图片，请重新选择后再试。");
        return image.getSize();
      },
      crop: async (sourcePath, rect, options) => {
        const image = nativeImage.createFromPath(sourcePath);
        if (image.isEmpty()) throw new Error("无法读取待还原图片，请重新选择后再试。");
        const cropped = image.crop(rect);
        if (!options?.removeConnectedBackground) return cropped.toPNG();

        if (
          (options.segmentationMode === "foreground-instance" || options.segmentationMode === "person-instance")
          && process.platform === "darwin"
        ) {
          try {
            const isPerson = options.segmentationMode === "person-instance";
            const segmentedSource = isPerson ? cropped.toPNG() : image.toPNG();
            const segmentedFull = await segmentPhotoLayer(
              segmentedSource,
              photoLayerSegmenterPath(),
              isPerson ? "person" : "foreground",
              isPerson ? undefined : rect
            );
            let segmented = isPerson
              ? segmentedFull
              : nativeImage.createFromBuffer(segmentedFull).crop(rect).toPNG();
            let segmentedImage = nativeImage.createFromBuffer(segmented);
            if (segmentedImage.isEmpty()) throw new Error("照片主体分割结果无法读取。");
            let segmentedSize = segmentedImage.getSize();
            let segmentedPixels = segmentedImage.toBitmap({ scaleFactor: 1 });
            let opaqueFraction = measureOpaqueFraction(segmentedPixels, segmentedSize.width, segmentedSize.height);
            if (!isPerson && opaqueFraction < 0.02) {
              segmented = await segmentPhotoLayer(
                cropped.toPNG(),
                photoLayerSegmenterPath(),
                "foreground"
              );
              segmentedImage = nativeImage.createFromBuffer(segmented);
              if (segmentedImage.isEmpty()) throw new Error("照片主体分割结果无法读取。");
              segmentedSize = segmentedImage.getSize();
              segmentedPixels = segmentedImage.toBitmap({ scaleFactor: 1 });
              opaqueFraction = measureOpaqueFraction(segmentedPixels, segmentedSize.width, segmentedSize.height);
            }
            if (!isPerson) {
              const cropBgra = cropped.toBitmap({ scaleFactor: 1 });
              const cropRgba = new Uint8Array(cropBgra.byteLength);
              for (let offset = 0; offset < cropBgra.byteLength; offset += 4) {
                cropRgba[offset] = cropBgra[offset + 2];
                cropRgba[offset + 1] = cropBgra[offset + 1];
                cropRgba[offset + 2] = cropBgra[offset];
                cropRgba[offset + 3] = cropBgra[offset + 3];
              }
              const connectedBackgroundMask = extractConnectedPhotoSubject(
                cropBgra,
                segmentedSize.width,
                segmentedSize.height,
                {
                  top: rect.y === 0,
                  right: rect.x + rect.width === image.getSize().width,
                  bottom: rect.y + rect.height === image.getSize().height,
                  left: rect.x === 0
                }
              );
              segmentedPixels = Buffer.from(intersectPhotoLayerMask(
                segmentedPixels,
                connectedBackgroundMask,
                segmentedSize.width,
                segmentedSize.height
              ));
              segmentedImage = nativeImage.createFromBitmap(Buffer.from(segmentedPixels), {
                width: segmentedSize.width,
                height: segmentedSize.height,
                scaleFactor: 1
              });
              segmented = segmentedImage.toPNG();
              opaqueFraction = measureOpaqueFraction(segmentedPixels, segmentedSize.width, segmentedSize.height);

              try {
                const people = await segmentPhotoLayer(
                  image.toPNG(),
                  photoLayerSegmenterPath(),
                  "person"
                );
                const peopleInRect = nativeImage.createFromBuffer(people).crop(rect);
                const peopleSize = peopleInRect.getSize();
                if (peopleSize.width === segmentedSize.width && peopleSize.height === segmentedSize.height) {
                  const withoutPeople = subtractPhotoLayerMask(
                    segmentedPixels,
                    peopleInRect.toBitmap({ scaleFactor: 1 }),
                    segmentedSize.width,
                    segmentedSize.height
                  );
                  segmentedImage = nativeImage.createFromBitmap(Buffer.from(withoutPeople), {
                    width: segmentedSize.width,
                    height: segmentedSize.height,
                    scaleFactor: 1
                  });
                  segmented = segmentedImage.toPNG();
                  segmentedPixels = segmentedImage.toBitmap({ scaleFactor: 1 });
                  opaqueFraction = measureOpaqueFraction(segmentedPixels, segmentedSize.width, segmentedSize.height);
                }
              } catch {
                // Photos without people do not need an overlap mask.
              }
            }
            if (opaqueFraction < 0.02) {
              throw new Error(
                `识别到的主体仅占裁切框 ${(opaqueFraction * 100).toFixed(1)}%，请扩大裁切范围、让目标主体位于中心并保留更多上下文。`
              );
            }
            const edgeFractions = measureOpaqueEdgeFractions(
              segmentedPixels,
              segmentedSize.width,
              segmentedSize.height
            );
            const sourceSize = image.getSize();
            const clippedEdges = [
              rect.y > 0 && edgeFractions.top > 0.02 ? "上" : "",
              rect.x + rect.width < sourceSize.width && edgeFractions.right > 0.02 ? "右" : "",
              rect.y + rect.height < sourceSize.height && edgeFractions.bottom > 0.02 ? "下" : "",
              rect.x > 0 && edgeFractions.left > 0.02 ? "左" : ""
            ].filter(Boolean);
            if (clippedEdges.length > 0) {
              throw new Error(`主体像素触及裁切框${clippedEdges.join("、")}边，请扩大区域以保留完整轮廓。`);
            }
            return segmented;
          } catch (error) {
            if (options.segmentationMode === "person-instance") throw error;
          }
        }

        const size = cropped.getSize();
        const bgra = cropped.toBitmap({ scaleFactor: 1 });
        const rgba = new Uint8Array(bgra.byteLength);
        for (let offset = 0; offset < bgra.byteLength; offset += 4) {
          rgba[offset] = bgra[offset + 2];
          rgba[offset + 1] = bgra[offset + 1];
          rgba[offset + 2] = bgra[offset];
          rgba[offset + 3] = bgra[offset + 3];
        }
        let outputBgra = options.segmentationMode === "foreground-instance"
          ? Buffer.from(extractConnectedPhotoSubject(
              bgra,
              size.width,
              size.height,
              {
                top: rect.y === 0,
                right: rect.x + rect.width === image.getSize().width,
                bottom: rect.y + rect.height === image.getSize().height,
                left: rect.x === 0
              }
            ))
          : (() => {
              const removed = removeConnectedBackground(rgba, size.width, size.height);
              const converted = Buffer.allocUnsafe(removed.pixels.byteLength);
              for (let offset = 0; offset < removed.pixels.byteLength; offset += 4) {
                converted[offset] = removed.pixels[offset + 2];
                converted[offset + 1] = removed.pixels[offset + 1];
                converted[offset + 2] = removed.pixels[offset];
                converted[offset + 3] = removed.pixels[offset + 3];
              }
              return converted;
            })();
        if (options.segmentationMode === "foreground-instance" && options.fillSubjectInterior) {
          const connectedFraction = measureOpaqueFraction(outputBgra, size.width, size.height);
          if (connectedFraction < 0.02 || connectedFraction > 0.75) {
            const chromatic = extractChromaticPhotoSubject(
              bgra,
              size.width,
              size.height,
              {
                top: rect.y === 0,
                right: rect.x + rect.width === image.getSize().width,
                bottom: rect.y + rect.height === image.getSize().height,
                left: rect.x === 0
              }
            );
            const chromaticSolid = fillPhotoLayerInterior(
              chromatic,
              size.width,
              size.height,
              32,
              {
                top: rect.y === 0,
                right: rect.x + rect.width === image.getSize().width,
                bottom: rect.y + rect.height === image.getSize().height,
                left: rect.x === 0
              }
            );
            if (measureOpaqueFraction(chromaticSolid, size.width, size.height) >= 0.02) {
              outputBgra = Buffer.from(chromaticSolid);
            }
          }
        }
        let finalBgra: Uint8Array = options.fillSubjectInterior
          ? fillPhotoLayerInterior(outputBgra, size.width, size.height)
          : outputBgra;
        if (options.segmentationMode === "foreground-instance" && process.platform === "darwin") {
          try {
            const people = await segmentPhotoLayer(
              image.toPNG(),
              photoLayerSegmenterPath(),
              "person"
            );
            const peopleInRect = nativeImage.createFromBuffer(people).crop(rect);
            if (peopleInRect.getSize().width === size.width && peopleInRect.getSize().height === size.height) {
              finalBgra = subtractPhotoLayerMask(
                finalBgra,
                peopleInRect.toBitmap({ scaleFactor: 1 }),
                size.width,
                size.height
              );
            }
          } catch {
            // Photos without people do not need an overlap mask.
          }
        }
        const fallbackOpaqueFraction = measureOpaqueFraction(finalBgra, size.width, size.height);
        if (options.segmentationMode === "foreground-instance" && fallbackOpaqueFraction < 0.02) {
          throw new Error(
            `识别到的主体仅占裁切框 ${(fallbackOpaqueFraction * 100).toFixed(1)}%，无法生成完整独立图层。`
          );
        }
        return nativeImage.createFromBitmap(Buffer.from(finalBgra), {
          width: size.width,
          height: size.height,
          scaleFactor: 1
        }).toPNG();
      },
      repairSubject: async (sourcePath, region, extractedSource, localSegmentationSucceeded) => {
        const image = nativeImage.createFromPath(sourcePath);
        if (image.isEmpty()) throw new Error("无法读取待修复的照片主体。");
        const reference = image.crop({
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height
        }).toPNG();
        const generated = await editPhotoWithActiveProvider(
          reference,
          [
            `从参考图中精确提取整个“${region.description}”，目标是完整物体及其外轮廓，不是牌面里的数字、文字或图标。`,
            "完整修复被遮挡、断裂或缺失的边缘，但必须保持原物体的图案、文字、材质、颜色、视角和光照。",
            "只输出这一个物体，放在完全均匀的纯绿色 #00FF00 背景上；不要保留人物、天空、地面或其他物体。",
            "绿色背景不得有阴影、渐变、纹理、反射或景深；物体四周保留少量绿色边距，不要裁断主体。",
            "不得添加参考图里不存在的标志、文字、水印或装饰。"
          ].join("\n"),
          region.width,
          region.height
        );
        const normalized = normalizeGeneratedPhotoEdit(generated, region.width, region.height);
        const pixels = normalized.toBitmap({ scaleFactor: 1 });
        const extracted = extractConnectedPhotoSubject(pixels, region.width, region.height);
        const opaqueFraction = measureOpaqueFraction(extracted, region.width, region.height);
        const opaqueBounds = measureOpaqueBounds(extracted, region.width, region.height);
        const generatedEdges = measureOpaqueEdgeFractions(extracted, region.width, region.height);
        const isSign = /(?:sign|board|advert|poster|billboard|路牌|标牌|广告牌)/iu
          .test(`${region.name} ${region.description}`);
        const localImage = nativeImage.createFromBuffer(extractedSource);
        if (localImage.isEmpty()) throw new Error("无法读取本地主体结果。");
        const localPixels = localImage.toBitmap({ scaleFactor: 1 });
        const localFraction = measureOpaqueFraction(localPixels, region.width, region.height);
        const localEdges = measureOpaqueEdgeFractions(localPixels, region.width, region.height);
        if (opaqueFraction < (isSign ? 0.08 : 0.03) || opaqueFraction > 0.88) {
          throw new Error(`图片模型主体覆盖率异常：${(opaqueFraction * 100).toFixed(1)}%。`);
        }
        if (
          !opaqueBounds
          || (isSign && (opaqueBounds.widthFraction < 0.35 || opaqueBounds.heightFraction < 0.25))
        ) {
          throw new Error("图片模型只返回了牌面局部，没有生成完整广告牌主体。");
        }
        if (localSegmentationSucceeded && opaqueFraction < localFraction * 0.72) {
          throw new Error("图片模型遗漏了本地识别到的主体结构。");
        }
        const sourceSize = image.getSize();
        const lostSourceBoundary = hasLostProtectedOpaqueEdge(localEdges, generatedEdges, {
          top: region.y === 0,
          right: region.x + region.width === sourceSize.width,
          bottom: region.y + region.height === sourceSize.height,
          left: region.x === 0
        });
        if (lostSourceBoundary) {
          throw new Error("图片模型改变了贴边主体的原始构图，改用保留原几何的本地切图。");
        }
        return nativeImage.createFromBitmap(Buffer.from(extracted), {
          width: region.width,
          height: region.height,
          scaleFactor: 1
        }).toPNG();
      },
      cleanBackground: async (sourcePath, subjects) => {
        const image = nativeImage.createFromPath(sourcePath);
        if (image.isEmpty()) throw new Error("无法读取照片背景，请重新选择后再试。");
        const size = image.getSize();
        try {
          const generated = await editPhotoWithActiveProvider(
            image.toPNG(),
            [
              "生成这张照片的干净背景层。",
              `彻底移除并补全以下前景主体：${subjects.map((subject) => subject.description || subject.name).join("；")}。`,
              "移除后必须自然延续原有天空、墙面、地面、草木、电线、纹理、透视和光照，不得留下人物轮廓、路牌颜色、透明洞、模糊色块或复制痕迹。",
              "保持原图画幅、相机位置、构图和背景区域不变；不要添加任何新人物、物体、文字、标志或水印。",
              "输出必须是完整、不透明、无前景主体的背景照片。"
            ].join("\n"),
            size.width,
            size.height
          );
          const normalized = normalizeGeneratedPhotoEdit(generated, size.width, size.height);
          const pixels = normalized.toBitmap({ scaleFactor: 1 });
          if (measureOpaqueFraction(pixels, size.width, size.height, 250) < 0.995) {
            throw new Error("图片模型背景存在透明区域。");
          }
          return normalized.toPNG();
        } catch (error) {
          console.warn("图片模型背景补全失败，改用本地补全。", error);
        }
        const placements = subjects.map((subject) => {
          const mask = nativeImage.createFromBuffer(subject.bytes);
          if (mask.isEmpty()) throw new Error("照片主体蒙版无法读取。");
          const maskSize = mask.getSize();
          if (maskSize.width !== subject.width || maskSize.height !== subject.height) {
            throw new Error("照片主体蒙版尺寸与图层区域不一致。");
          }
          return {
            bgra: mask.toBitmap({ scaleFactor: 1 }),
            x: subject.x,
            y: subject.y,
            width: subject.width,
            height: subject.height
          };
        });
        const background = inpaintPhotoBackground(
          image.toBitmap({ scaleFactor: 1 }),
          size.width,
          size.height,
          placements
        );
        return nativeImage.createFromBitmap(Buffer.from(background), {
          width: size.width,
          height: size.height,
          scaleFactor: 1
        }).toPNG();
      }
    },
    piAgentEvolution
  );
  await masterGoBridge.start();
  const disposeIpcResources = registerIpc({
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
    provider: compatibleImageProvider,
    codexProvider: codexImageProvider,
    codexAuth,
    falProvider: falImageProvider,
    bailianProvider: bailianImageProvider,
    arkProvider: arkImageProvider,
    managerApiBaseUrl: manageApiBaseUrl
  });

  startupMark("ipc-ready");
  if (startupWindow.isDestroyed()) {
    await createWindow(appIcon, customAppIcons, settings.getSettings().theme);
  } else {
    await loadApplication(startupWindow, settings.getSettings().theme);
  }
  startupMark("application-document-loaded");
  if (isBrowserDev) {
    const { startDevBrowserBridge } = await import("./dev-browser-bridge.js");
    browserDevBridge = await startDevBrowserBridge(startupWindow, assets,
      process.env.ITERLAY_BROWSER_DEV_BRIDGE_CONFIG!, new URL(process.env.VITE_DEV_SERVER_URL!).origin);
    console.info("[browser-dev] 网页真实服务已就绪，桌面编辑器未启动。");
  }
  const disposeMcpBridge = await startMcpBridge(() => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null, app.getPath("userData"));

  if (settings.getSettings().memoryEnabled) {
    const maintenanceTimer = setTimeout(() => {
      void memories.organize().catch((error) => console.warn("整理助手记忆失败。", error));
    }, 2_000);
    maintenanceTimer.unref();
  }

  app.once("will-quit", () => {
    browserDevBridge?.close();
    mediaTools.cancel();
    disposeMediaToolsIpc();
    disposeMcpBridge();
    disposeIpcResources();
    videoSequenceScheduler.dispose();
    void masterGoBridge.stop();
    void piAgentLogs.flush();
    codexAuth.dispose();
  });

  app.on("activate", () => {
    if (isBrowserDev) return;
    if (BrowserWindow.getAllWindows().length === 0) {
      const current = settings.getSettings();
      void createWindow(current.appIcon ?? "default", current.customAppIcons ?? [], current.theme);
    }
  });
}).catch((error) => {
  console.error("Application startup failed", error);
  if (isBrowserDev && !browserDevBridge) {
    // No browser editor exists yet; let the development launcher report failure.
    void runtimeLog?.flush().finally(() => app.exit(1));
    if (!runtimeLog) app.exit(1);
    return;
  }
  dialog.showErrorBox("Iterlay 启动失败", error instanceof Error ? error.message : String(error));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
