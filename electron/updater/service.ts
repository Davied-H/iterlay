import {
  evaluateUpdateManifest,
  compareVersions,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  type UpdateArch,
  type UpdateChannel,
  type UpdatePlatform,
  type UpdateProgress,
  type UpdateStateSnapshot
} from "../../shared/app-update.js";
import type { UpdateApiClient } from "./api-client.js";
import type { UpdateDriver } from "./driver.js";
import type { UpdatePreferenceAccess } from "./store.js";

export type UpdateCheckSource = "auto" | "manual";

export interface AppUpdateServiceOptions {
  currentVersion: string;
  platform: UpdatePlatform;
  arch: UpdateArch;
  channel?: UpdateChannel;
  apiClient: UpdateApiClient;
  driver: UpdateDriver;
  preferences: UpdatePreferenceAccess;
  /** 透传给后台做灰度分桶的设备标识。 */
  deviceId?: string;
  /** 安装器接管后请求退出应用。 */
  onQuitRequested?: () => void;
  now?: () => Date;
}

const PROGRESS_EMIT_INTERVAL_MS = 300;

export class AppUpdateService {
  private state: UpdateStateSnapshot;
  private channel: UpdateChannel;
  private readonly listeners = new Set<(snapshot: UpdateStateSnapshot) => void>();
  private downloadAbort?: AbortController;
  private downloadPromise?: Promise<UpdateStateSnapshot>;
  private firstCheckTimer?: NodeJS.Timeout;
  private checkTimer?: NodeJS.Timeout;
  private lastProgressEmitAt = 0;

  constructor(private readonly options: AppUpdateServiceOptions) {
    this.channel = options.channel ?? "stable";
    this.state = {
      phase: "idle",
      currentVersion: options.currentVersion,
      channel: this.channel,
      forced: false
    };
  }

  /** 读取本地偏好（跳过的版本号、更新渠道）。应在注册 IPC 前调用。 */
  async initialize(): Promise<void> {
    const preferences = await this.options.preferences.read();
    this.channel = preferences.channel ?? this.channel;
    const installedRelease = preferences.pendingUpdate &&
      compareVersions(this.options.currentVersion, preferences.pendingUpdate.version) >= 0
      ? preferences.pendingUpdate
      : undefined;
    this.patch({ skippedVersion: preferences.skippedVersion, channel: this.channel, installedRelease });
  }

  getState(): UpdateStateSnapshot {
    return {
      ...this.state,
      manifest: this.state.manifest ? { ...this.state.manifest } : undefined,
      progress: this.state.progress ? { ...this.state.progress } : undefined,
      installedRelease: this.state.installedRelease ? { ...this.state.installedRelease } : undefined
    };
  }

  onStateChange(listener: (snapshot: UpdateStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async check(source: UpdateCheckSource = "auto"): Promise<UpdateStateSnapshot> {
    // 下载中或已就绪时不打断当前流程。
    if (this.state.phase === "downloading" || this.state.phase === "ready" || this.state.phase === "installing") {
      return this.getState();
    }

    this.patch({ phase: "checking", error: undefined });
    try {
      const manifest = await this.options.apiClient.fetchLatest({
        platform: this.options.platform,
        arch: this.options.arch,
        currentVersion: this.options.currentVersion,
        channel: this.channel,
        deviceId: this.options.deviceId
      });
      const evaluation = evaluateUpdateManifest(this.options.currentVersion, manifest);
      const checkedAt = (this.options.now?.() ?? new Date()).toISOString();

      if (evaluation.availability === "up-to-date") {
        this.patch({ phase: "up-to-date", forced: false, manifest: undefined, checkedAt });
      } else if (evaluation.availability === "forced") {
        this.patch({ phase: "available", forced: true, manifest: evaluation.manifest, checkedAt });
      } else if (source === "auto" && evaluation.manifest?.version === this.state.skippedVersion) {
        // 自动检查尊重「跳过此版本」；手动检查仍会提示。
        this.patch({ phase: "up-to-date", forced: false, manifest: undefined, checkedAt });
      } else {
        this.patch({ phase: "available", forced: false, manifest: evaluation.manifest, checkedAt });
      }
    } catch (error) {
      this.patch({ phase: "error", error: toErrorMessage(error, "检查更新失败，请稍后重试。") });
    }
    return this.getState();
  }

  async download(): Promise<UpdateStateSnapshot> {
    if (this.downloadPromise) return this.downloadPromise;
    if (this.state.phase === "ready" && this.state.installerPath) return this.getState();
    const manifest = this.state.manifest;
    if (!manifest) throw new Error("当前没有可下载的更新，请先检查更新。");

    const abort = new AbortController();
    this.downloadAbort = abort;
    this.lastProgressEmitAt = 0;
    this.patch({ phase: "downloading", error: undefined, installerPath: undefined, progress: { transferredBytes: 0 } });

    this.downloadPromise = this.options.driver
      .download(manifest, {
        signal: abort.signal,
        onProgress: (progress) => this.handleProgress(progress)
      })
      .then((installerPath) => {
        this.patch({ phase: "ready", installerPath });
        return this.getState();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) {
          this.patch({ phase: "available", progress: undefined });
        } else {
          this.patch({ phase: "error", progress: undefined, error: toErrorMessage(error, "下载更新失败，请稍后重试。") });
        }
        return this.getState();
      })
      .finally(() => {
        this.downloadAbort = undefined;
        this.downloadPromise = undefined;
      });
    return this.downloadPromise;
  }

  cancelDownload(): UpdateStateSnapshot {
    if (this.state.forced) return this.getState();
    this.downloadAbort?.abort();
    return this.getState();
  }

  async install(): Promise<UpdateStateSnapshot> {
    if (this.state.phase !== "ready" || !this.state.installerPath) {
      throw new Error("安装包尚未就绪，请先下载更新。");
    }
    const manifest = this.state.manifest;
    if (!manifest) throw new Error("缺少更新版本信息，请重新检查更新。");
    await this.options.preferences.setPendingUpdate({
      version: manifest.version,
      previousVersion: this.options.currentVersion,
      releaseNotes: manifest.releaseNotes,
      channel: manifest.channel
    });
    this.patch({ phase: "installing", error: undefined });
    try {
      const result = await this.options.driver.install(this.state.installerPath);
      if (result.quitRequested) this.options.onQuitRequested?.();
    } catch (error) {
      await this.options.preferences.setPendingUpdate(undefined).catch(() => undefined);
      this.patch({ phase: "error", error: toErrorMessage(error, "自动安装失败，请重试。") });
      throw error;
    }
    return this.getState();
  }

  /** 下载、校验后立即交给安装器；供用户点击一次完成整个更新流程。 */
  async downloadAndInstall(): Promise<UpdateStateSnapshot> {
    const downloaded = await this.download();
    if (downloaded.phase !== "ready") return downloaded;
    return this.install();
  }

  async dismissInstalledRelease(): Promise<UpdateStateSnapshot> {
    await this.options.preferences.setPendingUpdate(undefined);
    this.patch({ installedRelease: undefined });
    return this.getState();
  }

  async skipVersion(version: string): Promise<UpdateStateSnapshot> {
    if (this.state.forced) throw new Error("此更新为强制更新，无法跳过。");
    await this.options.preferences.setSkippedVersion(version);
    if (this.state.phase === "available" && this.state.manifest?.version === version) {
      this.patch({ skippedVersion: version, phase: "up-to-date", manifest: undefined, progress: undefined });
    } else {
      this.patch({ skippedVersion: version });
    }
    return this.getState();
  }

  /** 切换更新渠道（参与/退出开发者计划），随后立即按新渠道重新检查。 */
  async setChannel(channel: UpdateChannel): Promise<UpdateStateSnapshot> {
    if (channel !== "stable" && channel !== "beta") throw new Error("无效的更新渠道。");
    if (channel === this.channel) return this.getState();
    await this.options.preferences.setChannel(channel);
    this.channel = channel;
    this.patch({ channel });
    // 下载中或安装包已就绪时不打断当前流程，下一次检查自然生效。
    if (this.state.phase === "downloading" || this.state.phase === "ready" || this.state.phase === "installing") {
      return this.getState();
    }
    return this.check("auto");
  }

  startAutoCheck(intervalMs = UPDATE_CHECK_INTERVAL_MS, firstDelayMs = UPDATE_FIRST_CHECK_DELAY_MS): void {
    this.stopAutoCheck();
    const run = (): void => {
      void this.check("auto").catch(() => undefined);
    };
    this.firstCheckTimer = setTimeout(run, firstDelayMs);
    this.firstCheckTimer.unref?.();
    this.checkTimer = setInterval(run, intervalMs);
    this.checkTimer.unref?.();
  }

  stopAutoCheck(): void {
    if (this.firstCheckTimer) clearTimeout(this.firstCheckTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.firstCheckTimer = undefined;
    this.checkTimer = undefined;
  }

  private handleProgress(progress: UpdateProgress): void {
    const now = Date.now();
    const finished = progress.percent === 100;
    if (!finished && now - this.lastProgressEmitAt < PROGRESS_EMIT_INTERVAL_MS) {
      // 高频进度回调只更新内部状态，避免 IPC 风暴。
      this.state = { ...this.state, progress };
      return;
    }
    this.lastProgressEmitAt = now;
    this.patch({ progress });
  }

  private patch(partial: Partial<UpdateStateSnapshot>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // 监听器异常不影响更新流程。
      }
    }
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
