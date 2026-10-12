import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { UpdateManifest, UpdateProgress, UpdateStateSnapshot } from "../shared/app-update.js";
import { HttpUpdateApiClient, UpdateApiError } from "../electron/updater/api-client.js";
import { DirectDownloadDriver, type UpdateDriver } from "../electron/updater/driver.js";
import { AppUpdateService } from "../electron/updater/service.js";
import { UpdatePreferenceStore, type UpdatePreferenceAccess, type UpdatePreferences } from "../electron/updater/store.js";

function manifest(overrides: Partial<UpdateManifest> = {}): UpdateManifest {
  return {
    version: "0.2.0",
    platform: "darwin",
    arch: "arm64",
    downloadUrl: "https://example.com/Iterlay-0.2.0-arm64.dmg",
    releaseNotes: "修复若干问题",
    ...overrides
  };
}

class MemoryPreferences implements UpdatePreferenceAccess {
  data: UpdatePreferences = {};

  async read(): Promise<UpdatePreferences> {
    return { ...this.data };
  }

  async setSkippedVersion(version: string | undefined): Promise<void> {
    this.data = { ...this.data, skippedVersion: version };
  }

  async setChannel(channel: "stable" | "beta"): Promise<void> {
    this.data = { ...this.data, channel };
  }

  async setPendingUpdate(update: UpdatePreferences["pendingUpdate"]): Promise<void> {
    this.data = { ...this.data, pendingUpdate: update };
  }
}

function createService(options: {
  latest?: UpdateManifest | null;
  currentVersion?: string;
  driver?: Partial<UpdateDriver>;
  onQuitRequested?: () => void;
} = {}) {
  const preferences = new MemoryPreferences();
  const apiClient = { fetchLatest: vi.fn(async () => options.latest ?? null) };
  const driver: UpdateDriver = {
    download: vi.fn(async () => "/tmp/Iterlay-0.2.0-arm64.dmg"),
    install: vi.fn(async () => ({ quitRequested: false })),
    ...options.driver
  };
  const service = new AppUpdateService({
    currentVersion: options.currentVersion ?? "0.1.6",
    platform: "darwin",
    arch: "arm64",
    apiClient,
    driver,
    preferences,
    onQuitRequested: options.onQuitRequested,
    now: () => new Date("2026-07-16T00:00:00.000Z")
  });
  return { service, apiClient, driver, preferences };
}

describe("AppUpdateService.check", () => {
  it("exposes an available update and passes the client identity to the backend", async () => {
    const { service, apiClient } = createService({ latest: manifest() });
    const snapshot = await service.check("auto");
    expect(snapshot.phase).toBe("available");
    expect(snapshot.forced).toBe(false);
    expect(snapshot.manifest?.version).toBe("0.2.0");
    expect(snapshot.checkedAt).toBe("2026-07-16T00:00:00.000Z");
    expect(apiClient.fetchLatest).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" })
    );
  });

  it("reports up-to-date when the backend has nothing newer", async () => {
    const { service } = createService({ latest: manifest({ version: "0.1.6" }) });
    const snapshot = await service.check("auto");
    expect(snapshot.phase).toBe("up-to-date");
    expect(snapshot.manifest).toBeUndefined();
  });

  it("marks the update forced when the current version is below minSupportedVersion", async () => {
    const { service } = createService({ latest: manifest({ minSupportedVersion: "0.2.0" }) });
    const snapshot = await service.check("auto");
    expect(snapshot.phase).toBe("available");
    expect(snapshot.forced).toBe(true);
  });

  it("respects a skipped version for auto checks but not manual checks", async () => {
    const { service, preferences } = createService({ latest: manifest() });
    preferences.data.skippedVersion = "0.2.0";
    await service.initialize();
    expect((await service.check("auto")).phase).toBe("up-to-date");
    expect((await service.check("manual")).phase).toBe("available");
  });

  it("surfaces backend failures as an error state", async () => {
    const { service, apiClient } = createService();
    apiClient.fetchLatest.mockRejectedValueOnce(new Error("更新服务请求失败 (503)"));
    const snapshot = await service.check("manual");
    expect(snapshot.phase).toBe("error");
    expect(snapshot.error).toBe("更新服务请求失败 (503)");
  });
});

describe("AppUpdateService.download / install", () => {
  it("downloads through the driver and lands in the ready state with progress relayed", async () => {
    const events: UpdateStateSnapshot[] = [];
    const { service } = createService({
      latest: manifest(),
      driver: {
        download: vi.fn(async (_manifest, options) => {
          options?.onProgress?.({ transferredBytes: 100, totalBytes: 100, percent: 100 });
          return "/tmp/Iterlay-0.2.0-arm64.dmg";
        })
      }
    });
    service.onStateChange((snapshot) => events.push(snapshot));
    await service.check("manual");
    const snapshot = await service.download();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.installerPath).toBe("/tmp/Iterlay-0.2.0-arm64.dmg");
    expect(events.some((event) => event.phase === "downloading")).toBe(true);
    expect(events.some((event) => event.progress?.percent === 100)).toBe(true);
  });

  it("refuses to download before a manifest is known", async () => {
    const { service } = createService();
    await expect(service.download()).rejects.toThrow("请先检查更新");
  });

  it("returns to the available state when the download is cancelled", async () => {
    const { service } = createService({
      latest: manifest(),
      driver: {
        download: vi.fn(
          (_manifest, options) =>
            new Promise<string>((_resolve, reject) => {
              options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            })
        )
      }
    });
    await service.check("manual");
    const pending = service.download();
    service.cancelDownload();
    const snapshot = await pending;
    expect(snapshot.phase).toBe("available");
    expect(snapshot.error).toBeUndefined();
  });

  it("does not cancel a forced update download", async () => {
    let resolveDownload: ((path: string) => void) | undefined;
    const { service } = createService({
      latest: manifest({ forced: true }),
      driver: {
        download: vi.fn(
          () => new Promise<string>((resolve) => {
            resolveDownload = resolve;
          })
        )
      }
    });
    await service.check("auto");
    const pending = service.download();
    expect(service.cancelDownload()).toMatchObject({ phase: "downloading", forced: true });
    resolveDownload?.("/tmp/Iterlay-0.2.0-arm64.dmg");
    await expect(pending).resolves.toMatchObject({ phase: "ready", forced: true });
  });

  it("keeps the manifest and reports an error when the download fails", async () => {
    const { service } = createService({
      latest: manifest(),
      driver: { download: vi.fn(async () => Promise.reject(new Error("安装包校验失败"))) }
    });
    await service.check("manual");
    const snapshot = await service.download();
    expect(snapshot.phase).toBe("error");
    expect(snapshot.error).toBe("安装包校验失败");
    expect(snapshot.manifest?.version).toBe("0.2.0");
  });

  it("installs only when ready and quits when the installer takes over", async () => {
    const phases: UpdateStateSnapshot["phase"][] = [];
    const onQuitRequested = vi.fn();
    const install = vi.fn(async () => ({ quitRequested: true }));
    const { service } = createService({ latest: manifest(), driver: { install }, onQuitRequested });
    service.onStateChange((snapshot) => phases.push(snapshot.phase));
    await expect(service.install()).rejects.toThrow("尚未就绪");
    await service.check("manual");
    await service.download();
    await service.install();
    expect(install).toHaveBeenCalledWith("/tmp/Iterlay-0.2.0-arm64.dmg");
    expect(phases.at(-1)).toBe("installing");
    expect(onQuitRequested).toHaveBeenCalledTimes(1);
  });

  it("downloads, installs, and persists release notes in one update action", async () => {
    const onQuitRequested = vi.fn();
    const { service, driver, preferences } = createService({
      latest: manifest({ releaseNotes: "新增自动更新" }),
      driver: { install: vi.fn(async () => ({ quitRequested: true })) },
      onQuitRequested
    });
    await service.check("manual");
    const snapshot = await service.downloadAndInstall();
    expect(driver.download).toHaveBeenCalledTimes(1);
    expect(driver.install).toHaveBeenCalledTimes(1);
    expect(snapshot.phase).toBe("installing");
    expect(preferences.data.pendingUpdate).toEqual({
      version: "0.2.0",
      previousVersion: "0.1.6",
      releaseNotes: "新增自动更新",
      channel: undefined
    });
    expect(onQuitRequested).toHaveBeenCalledTimes(1);
  });

  it("clears the pending release marker when launching the installer fails", async () => {
    const { service, preferences } = createService({
      latest: manifest(),
      driver: { install: vi.fn(async () => Promise.reject(new Error("helper failed"))) }
    });
    await service.check("manual");
    await service.download();
    await expect(service.install()).rejects.toThrow("helper failed");
    expect(service.getState()).toMatchObject({ phase: "error", error: "helper failed" });
    expect(preferences.data.pendingUpdate).toBeUndefined();
  });
});

describe("AppUpdateService installed release", () => {
  it("shows persisted release notes only after the target version starts and clears them on dismissal", async () => {
    const { service, preferences } = createService({ currentVersion: "0.2.0" });
    preferences.data.pendingUpdate = {
      version: "0.2.0",
      previousVersion: "0.1.6",
      releaseNotes: "新增自动更新"
    };
    await service.initialize();
    expect(service.getState().installedRelease?.releaseNotes).toBe("新增自动更新");
    await service.dismissInstalledRelease();
    expect(service.getState().installedRelease).toBeUndefined();
    expect(preferences.data.pendingUpdate).toBeUndefined();
  });

  it("does not announce an update when the old version starts again", async () => {
    const { service, preferences } = createService({ currentVersion: "0.1.6" });
    preferences.data.pendingUpdate = { version: "0.2.0", previousVersion: "0.1.6" };
    await service.initialize();
    expect(service.getState().installedRelease).toBeUndefined();
  });
});

describe("AppUpdateService.skipVersion", () => {
  it("persists the skipped version and clears the prompt", async () => {
    const { service, preferences } = createService({ latest: manifest() });
    await service.check("auto");
    const snapshot = await service.skipVersion("0.2.0");
    expect(preferences.data.skippedVersion).toBe("0.2.0");
    expect(snapshot.phase).toBe("up-to-date");
    expect(snapshot.manifest).toBeUndefined();
  });

  it("refuses to skip a forced update", async () => {
    const { service } = createService({ latest: manifest({ forced: true }) });
    await service.check("auto");
    await expect(service.skipVersion("0.2.0")).rejects.toThrow("强制更新");
  });
});

describe("UpdatePreferenceStore", () => {
  it("keeps skipped version and channel independent across writes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-update-prefs-"));
    try {
      const store = new UpdatePreferenceStore(dir);
      await store.setSkippedVersion("0.2.0");
      await store.setChannel("beta");
      expect(await store.read()).toEqual({ skippedVersion: "0.2.0", channel: "beta" });
      expect(await new UpdatePreferenceStore(dir).read()).toEqual({ skippedVersion: "0.2.0", channel: "beta" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("AppUpdateService.setChannel", () => {
  it("defaults to the stable channel", async () => {
    const { service, apiClient } = createService({ latest: manifest() });
    expect(service.getState().channel).toBe("stable");
    await service.check("auto");
    expect(apiClient.fetchLatest).toHaveBeenCalledWith(expect.objectContaining({ channel: "stable" }));
  });

  it("persists the channel and immediately re-checks against it", async () => {
    const { service, apiClient, preferences } = createService({
      latest: manifest({ version: "0.3.0-beta.1", channel: "beta" })
    });
    const snapshot = await service.setChannel("beta");
    expect(preferences.data.channel).toBe("beta");
    expect(apiClient.fetchLatest).toHaveBeenCalledWith(expect.objectContaining({ channel: "beta" }));
    expect(snapshot.channel).toBe("beta");
    expect(snapshot.phase).toBe("available");
    expect(snapshot.manifest?.version).toBe("0.3.0-beta.1");
  });

  it("detects the next beta release while the developer channel remains enabled", async () => {
    const { service, apiClient } = createService({
      currentVersion: "0.2.0-beta.1",
      latest: manifest({ version: "0.2.0-beta.2", channel: "beta" })
    });
    await service.setChannel("beta");
    const snapshot = await service.check("auto");
    expect(apiClient.fetchLatest).toHaveBeenLastCalledWith(expect.objectContaining({ channel: "beta" }));
    expect(snapshot).toMatchObject({ phase: "available", channel: "beta", forced: false });
    expect(snapshot.manifest?.version).toBe("0.2.0-beta.2");
  });

  it("returns to stable update checks after leaving the developer channel", async () => {
    const { service, apiClient, preferences } = createService({ latest: manifest({ channel: "stable" }) });
    await service.setChannel("beta");
    apiClient.fetchLatest.mockClear();
    const snapshot = await service.setChannel("stable");
    expect(preferences.data.channel).toBe("stable");
    expect(apiClient.fetchLatest).toHaveBeenCalledWith(expect.objectContaining({ channel: "stable" }));
    expect(snapshot.channel).toBe("stable");
  });

  it("restores the persisted channel on initialize", async () => {
    const { service, preferences } = createService();
    preferences.data.channel = "beta";
    await service.initialize();
    expect(service.getState().channel).toBe("beta");
  });

  it("ignores a no-op switch and rejects unknown channels", async () => {
    const { service, apiClient } = createService({ latest: manifest() });
    await service.setChannel("stable");
    expect(apiClient.fetchLatest).not.toHaveBeenCalled();
    await expect(service.setChannel("nightly" as never)).rejects.toThrow("无效的更新渠道");
  });
});

describe("HttpUpdateApiClient", () => {
  it("queries the latest endpoint with the client identity", async () => {
    const payload = manifest();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const client = new HttpUpdateApiClient("https://api.example.com/v1/", fetcher);
    const result = await client.fetchLatest({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" });
    expect(result).toEqual(payload);
    const requested = String((fetcher.mock.calls[0] as unknown[])[0]);
    expect(requested).toContain("https://api.example.com/v1/releases/latest?");
    expect(requested).toContain("platform=darwin");
    expect(requested).toContain("arch=arm64");
    expect(requested).toContain("appVersion=0.1.6");
  });

  it("treats 204/404 and empty bodies as no release", async () => {
    const client204 = new HttpUpdateApiClient("https://api.example.com", async () => new Response(null, { status: 204 }));
    expect(await client204.fetchLatest({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" })).toBeNull();
    const client404 = new HttpUpdateApiClient("https://api.example.com", async () => new Response("", { status: 404 }));
    expect(await client404.fetchLatest({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" })).toBeNull();
    const clientNull = new HttpUpdateApiClient("https://api.example.com", async () => new Response("null", { status: 200 }));
    expect(await clientNull.fetchLatest({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" })).toBeNull();
  });

  it("throws a typed error for backend failures and malformed payloads", async () => {
    const failing = new HttpUpdateApiClient(
      "https://api.example.com",
      async () => new Response(JSON.stringify({ code: "MAINTENANCE", message: "维护中" }), { status: 503 })
    );
    await expect(failing.fetchLatest({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" })).rejects.toThrow(
      "维护中"
    );
    const malformed = new HttpUpdateApiClient(
      "https://api.example.com",
      async () => new Response(JSON.stringify({ version: 42 }), { status: 200 })
    );
    await expect(
      malformed.fetchLatest({ platform: "darwin", arch: "arm64", currentVersion: "0.1.6" })
    ).rejects.toThrow(UpdateApiError);
  });
});

describe("DirectDownloadDriver", () => {
  async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-update-"));
    try {
      await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("streams the installer to disk and verifies its sha256", async () => {
    await withTempDir(async (dir) => {
      const payload = Buffer.from("iterlay-installer-bytes");
      const sha256 = createHash("sha256").update(payload).digest("hex");
      const fetcher = vi.fn(
        async () => new Response(payload, { status: 200, headers: { "content-length": String(payload.length) } })
      );
      const driver = new DirectDownloadDriver({ downloadDir: dir, platform: "darwin", fetcher });
      const progress: UpdateProgress[] = [];
      const installerPath = await driver.download(manifest({ sha256 }), {
        onProgress: (event) => progress.push(event)
      });
      expect(path.basename(installerPath)).toBe("Iterlay-0.2.0-arm64.dmg");
      expect(await readFile(installerPath)).toEqual(payload);
      expect(progress.at(-1)?.percent).toBe(100);
    });
  });

  it("adds the existing anonymous device id to update downloads", async () => {
    await withTempDir(async (dir) => {
      const payload = Buffer.from("identified-installer");
      const fetcher = vi.fn(async () => new Response(payload, { status: 200 }));
      const driver = new DirectDownloadDriver({
        downloadDir: dir,
        platform: "darwin",
        fetcher,
        deviceIdProvider: async () => "dfp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      });
      await driver.download(manifest());
      const init = (fetcher.mock.calls[0] as unknown[])[1] as RequestInit;
      expect(new Headers(init.headers).get("X-Iterlay-Device-ID")).toBe(
        "dfp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      );
    });
  });

  it("rejects and cleans up when the sha256 does not match", async () => {
    await withTempDir(async (dir) => {
      const fetcher = vi.fn(async () => new Response(Buffer.from("tampered"), { status: 200 }));
      const driver = new DirectDownloadDriver({ downloadDir: dir, platform: "darwin", fetcher });
      await expect(driver.download(manifest({ sha256: "0".repeat(64) }))).rejects.toThrow("校验失败");
      expect(await readdir(dir)).toEqual([]);
    });
  });

  it("reuses a previously downloaded installer that still matches", async () => {
    await withTempDir(async (dir) => {
      const payload = Buffer.from("cached-installer");
      const sha256 = createHash("sha256").update(payload).digest("hex");
      await writeFile(path.join(dir, "Iterlay-0.2.0-arm64.dmg"), payload);
      const fetcher = vi.fn(async () => {
        throw new Error("不应重新下载");
      });
      const driver = new DirectDownloadDriver({ downloadDir: dir, platform: "darwin", fetcher });
      const installerPath = await driver.download(manifest({ sha256 }));
      expect(path.basename(installerPath)).toBe("Iterlay-0.2.0-arm64.dmg");
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  it("derives the file name from the download url", async () => {
    await withTempDir(async (dir) => {
      const payload = Buffer.from("windows-installer");
      const fetcher = vi.fn(async () => new Response(payload, { status: 200 }));
      const driver = new DirectDownloadDriver({ downloadDir: dir, platform: "win32", fetcher });
      const installerPath = await driver.download(
        manifest({ platform: "win32", downloadUrl: "https://example.com/files/Iterlay%20Setup-0.2.0.exe" })
      );
      expect(path.basename(installerPath)).toBe("Iterlay Setup-0.2.0.exe");
    });
  });

  it("schedules the Windows installer after exit and requests app quit", async () => {
    await withTempDir(async (dir) => {
      const installerPath = path.join(dir, "Iterlay Setup-0.2.0.exe");
      const applicationPath = path.join(dir, "Iterlay.exe");
      await writeFile(installerPath, "exe");
      await writeFile(applicationPath, "app");
      const launchInstallerAfterExit = vi.fn(async () => undefined);
      const driver = new DirectDownloadDriver({
        downloadDir: dir,
        platform: "win32",
        applicationPath,
        launchInstallerAfterExit
      });
      const result = await driver.install(installerPath);
      expect(launchInstallerAfterExit).toHaveBeenCalledWith(installerPath, process.pid, applicationPath);
      expect(result.quitRequested).toBe(true);
    });
  });

  it("opens the dmg after the macOS app exits and requests app quit", async () => {
    await withTempDir(async (dir) => {
      const installerPath = path.join(dir, "Iterlay-0.2.0-arm64.dmg");
      const applicationPath = path.join(dir, "Iterlay.app");
      await writeFile(installerPath, "dmg");
      await writeFile(applicationPath, "app");
      const launchInstallerAfterExit = vi.fn(async () => undefined);
      const driver = new DirectDownloadDriver({
        downloadDir: dir,
        platform: "darwin",
        applicationPath,
        launchInstallerAfterExit
      });
      expect((await driver.install(installerPath)).quitRequested).toBe(true);
      expect(launchInstallerAfterExit).toHaveBeenCalledWith(installerPath, process.pid, applicationPath);

      const failing = new DirectDownloadDriver({
        downloadDir: dir,
        platform: "darwin",
        applicationPath,
        launchInstallerAfterExit: async () => Promise.reject(new Error("无法启动更新辅助进程"))
      });
      await expect(failing.install(installerPath)).rejects.toThrow("无法启动更新辅助进程");
      await expect(driver.install(path.join(dir, "missing.dmg"))).rejects.toThrow("安装包不存在");
    });
  });
});
