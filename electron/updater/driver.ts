import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { UpdateManifest, UpdatePlatform, UpdateProgress } from "../../shared/app-update.js";
import type { UpdateFetch } from "./api-client.js";

export interface UpdateDownloadOptions {
  onProgress?: (progress: UpdateProgress) => void;
  signal?: AbortSignal;
}

export interface UpdateInstallResult {
  /** 安装器已接管后续流程，应用应当退出。 */
  quitRequested: boolean;
}

/**
 * 下载与安装的驱动抽象。当前实现为自研直连下载（方案 C）；
 * 后续接入代码签名后，可用 electron-updater 实现同一接口平滑切换（方案 B）。
 */
export interface UpdateDriver {
  download(manifest: UpdateManifest, options?: UpdateDownloadOptions): Promise<string>;
  install(installerPath: string): Promise<UpdateInstallResult>;
}

export interface DirectDownloadDriverOptions {
  downloadDir: string;
  platform: UpdatePlatform;
  fetcher?: UpdateFetch;
  /** 下载时提供授权系统的匿名设备 ID，用于版本运营归因。 */
  deviceIdProvider?: () => Promise<string | undefined>;
  /** 当前已安装应用路径：macOS 为 .app，Windows 为 exe。 */
  applicationPath?: string;
  /** 测试/平台适配注入点：安排在当前进程退出后替换并重启应用。 */
  launchInstallerAfterExit?: (installerPath: string, processId: number, applicationPath: string) => Promise<void>;
}

export class DirectDownloadDriver implements UpdateDriver {
  private readonly fetcher: UpdateFetch;

  constructor(private readonly options: DirectDownloadDriverOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  async download(manifest: UpdateManifest, options: UpdateDownloadOptions = {}): Promise<string> {
    const { onProgress, signal } = options;
    await mkdir(this.options.downloadDir, { recursive: true });
    const installerPath = path.join(this.options.downloadDir, installerFileName(manifest));

    // 上次已下载且校验一致的安装包直接复用，避免重复流量。
    if (await this.matchesExistingFile(installerPath, manifest)) {
      const size = (await stat(installerPath)).size;
      onProgress?.({ transferredBytes: size, totalBytes: size, percent: 100 });
      return installerPath;
    }

    const headers = new Headers();
    const deviceId = await this.options.deviceIdProvider?.().catch(() => undefined);
    if (deviceId) headers.set("X-Iterlay-Device-ID", deviceId);
    const response = await this.fetcher(manifest.downloadUrl, { signal, headers });
    if (!response.ok) throw new Error(`安装包下载失败 (${response.status})`);
    if (!response.body) throw new Error("安装包下载失败：响应为空");

    const totalBytes = Number(response.headers.get("content-length")) || manifest.fileSize || undefined;
    const tempPath = `${installerPath}.download`;
    const hash = createHash("sha256");
    let transferredBytes = 0;

    try {
      const progressTap = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          transferredBytes += chunk.byteLength;
          onProgress?.(toProgress(transferredBytes, totalBytes));
          callback(null, chunk);
        }
      });
      await pipeline(
        Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
        progressTap,
        createWriteStream(tempPath),
        { signal }
      );

      if (manifest.sha256 && hash.digest("hex") !== manifest.sha256.toLowerCase()) {
        throw new Error("安装包校验失败，文件可能已损坏，请重新下载。");
      }

      await rm(installerPath, { force: true });
      await rename(tempPath, installerPath);
      onProgress?.({ transferredBytes, totalBytes: totalBytes ?? transferredBytes, percent: 100 });
      return installerPath;
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  async install(installerPath: string): Promise<UpdateInstallResult> {
    const exists = await stat(installerPath).then(() => true, () => false);
    if (!exists) throw new Error("安装包不存在，请重新下载。");

    const applicationPath = this.options.applicationPath ?? defaultApplicationPath(this.options.platform);
    await access(applicationPath);
    if (this.options.launchInstallerAfterExit) {
      await this.options.launchInstallerAfterExit(installerPath, process.pid, applicationPath);
      return { quitRequested: true };
    }

    if (this.options.platform === "win32") {
      await launchWindowsInstallerAfterExit(installerPath, process.pid, applicationPath);
    } else {
      await prepareMacApplication(installerPath, applicationPath);
      await replaceMacApplicationAfterExit(process.pid, applicationPath);
    }
    return { quitRequested: true };
  }

  private async matchesExistingFile(installerPath: string, manifest: UpdateManifest): Promise<boolean> {
    if (!manifest.sha256) return false;
    try {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(installerPath)) {
        hash.update(chunk as Buffer);
      }
      return hash.digest("hex") === manifest.sha256.toLowerCase();
    } catch {
      return false;
    }
  }
}

function defaultApplicationPath(platform: UpdatePlatform): string {
  return platform === "win32" ? process.execPath : path.resolve(process.execPath, "../../..");
}

async function prepareMacApplication(installerPath: string, applicationPath: string): Promise<void> {
  const mountDir = await mkdtemp(path.join(os.tmpdir(), "iterlay-update-"));
  const stagedApp = `${applicationPath}.update`;
  const backupApp = `${applicationPath}.previous`;
  let mounted = false;
  try {
    await runCommand("/usr/bin/hdiutil", [
      "attach",
      installerPath,
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountDir,
      "-quiet"
    ]);
    mounted = true;
    const entries = await readdir(mountDir, { withFileTypes: true });
    const sourceApp = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (!sourceApp) throw new Error("安装包中未找到 Iterlay 应用，请重新下载。");

    await rm(stagedApp, { recursive: true, force: true });
    await rm(backupApp, { recursive: true, force: true });
    await runCommand("/usr/bin/ditto", [path.join(mountDir, sourceApp.name), stagedApp]);
    await runCommand("/usr/bin/xattr", ["-dr", "com.apple.quarantine", stagedApp]).catch(() => undefined);
  } catch (error) {
    await rm(stagedApp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    if (mounted) {
      await runCommand("/usr/bin/hdiutil", ["detach", mountDir, "-quiet"]).catch(() => undefined);
    }
    await rm(mountDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function replaceMacApplicationAfterExit(processId: number, applicationPath: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const script = [
    "set -eu",
    'parent_pid="$1"',
    'target_app="$2"',
    'while /bin/kill -0 "$parent_pid" 2>/dev/null; do /bin/sleep 0.1; done',
    'staged_app="${target_app}.update"',
    'backup_app="${target_app}.previous"',
    '[ -d "$staged_app" ] || exit 1',
    '/bin/rm -rf "$backup_app"',
    '/bin/mv "$target_app" "$backup_app"',
    "if /bin/mv \"$staged_app\" \"$target_app\"; then",
    '  /bin/rm -rf "$backup_app"',
    "else",
    '  /bin/mv "$backup_app" "$target_app"',
    "  exit 1",
    "fi",
    '/usr/bin/open "$target_app"'
  ].join("\n");

  await new Promise<void>((resolve, reject) => {
    const helper = spawn(
      "/bin/sh",
      ["-c", script, "iterlay-updater", String(processId), applicationPath],
      { detached: true, stdio: "ignore" }
    );
    helper.once("error", reject);
    helper.once("spawn", () => {
      helper.unref();
      resolve();
    });
  });
}

async function runCommand(command: string, args: string[]): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `更新命令执行失败 (${code ?? "unknown"})`));
    });
  });
}

async function launchWindowsInstallerAfterExit(
  installerPath: string,
  processId: number,
  applicationPath: string
): Promise<void> {
  const { spawn } = await import("node:child_process");
  const helperPath = path.join(path.dirname(installerPath), `install-${processId}.ps1`);
  const script = [
    "param([int]$ParentPid, [string]$InstallerPath, [string]$ApplicationPath, [string]$HelperPath)",
    "$ErrorActionPreference = 'Stop'",
    "try { Wait-Process -Id $ParentPid -ErrorAction SilentlyContinue } catch {}",
    "$process = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -Wait -PassThru",
    "if ($process.ExitCode -ne 0) { exit $process.ExitCode }",
    "Start-Process -FilePath $ApplicationPath",
    "Remove-Item -LiteralPath $HelperPath -Force -ErrorAction SilentlyContinue"
  ].join("\r\n");
  await writeFile(helperPath, script, "utf8");

  await new Promise<void>((resolve, reject) => {
    const helper = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-ParentPid",
        String(processId),
        "-InstallerPath",
        installerPath,
        "-ApplicationPath",
        applicationPath,
        "-HelperPath",
        helperPath
      ],
      { detached: true, stdio: "ignore" }
    );
    helper.once("error", reject);
    helper.once("spawn", () => {
      helper.unref();
      resolve();
    });
  });
}

function installerFileName(manifest: UpdateManifest): string {
  try {
    const basename = decodeURIComponent(path.posix.basename(new URL(manifest.downloadUrl).pathname));
    if (/\.(dmg|exe)$/i.test(basename)) return sanitizeFileName(basename);
  } catch {
    // URL 异常时退回默认命名。
  }
  const extension = manifest.platform === "win32" ? "exe" : "dmg";
  const arch = manifest.arch ? `-${manifest.arch}` : "";
  return `Iterlay-${manifest.version}${arch}.${extension}`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

function toProgress(transferredBytes: number, totalBytes?: number): UpdateProgress {
  if (!totalBytes || totalBytes <= 0) return { transferredBytes };
  return {
    transferredBytes,
    totalBytes,
    percent: Math.min(100, Math.round((transferredBytes / totalBytes) * 100))
  };
}
