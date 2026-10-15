import AdmZip from "adm-zip";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, constants, readFileSync } from "node:fs";
import { access, chmod, lstat, mkdir, mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaToolsManifest, MediaToolsPaths, MediaToolsState } from "../../shared/media-tools.js";

export interface MediaToolsManagerOptions {
  userDataPath: string;
  resourcesPath?: string;
  fetcher?: typeof fetch;
  manifest?: MediaToolsManifest;
  platform?: NodeJS.Platform;
  arch?: string;
  onStateChange?: (state: MediaToolsState) => void;
  allowSystemTools?: boolean;
}

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/i;

/** Only install() may access the network, after the user accepts the download. */
export class MediaToolsManager {
  private readonly manifest: MediaToolsManifest;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly cachePath: string;
  private state: MediaToolsState;
  private installation?: Promise<MediaToolsState>;
  private inspection?: Promise<MediaToolsState>;
  private controller?: AbortController;

  constructor(private readonly options: MediaToolsManagerOptions) {
    this.manifest = options.manifest ?? JSON.parse(readFileSync(
      new URL("../../shared/media-tools-manifest.json", import.meta.url), "utf8"
    )) as MediaToolsManifest;
    validateManifest(this.manifest);
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.cachePath = path.join(options.userDataPath, "tools", "ffmpeg", this.manifest.version, `${this.platform}-${this.arch}`);
    this.state = { status: "missing", version: this.manifest.version, downloadBytes: this.manifest.sizeBytes, transferredBytes: 0 };
  }

  getState(): Promise<MediaToolsState> {
    if (this.installation) return Promise.resolve({ ...this.state });
    if (this.inspection) return this.inspection;
    this.setState("checking");
    this.inspection = this.resolveExisting().then((resolved) => {
      this.setState(resolved ? "ready" : "missing", { transferredBytes: resolved ? this.manifest.sizeBytes : 0 });
      return { ...this.state };
    }).finally(() => { this.inspection = undefined; });
    return this.inspection;
  }

  async requireReady(): Promise<MediaToolsPaths> {
    const resolved = await this.resolveExisting();
    if (resolved) {
      if (!this.installation) this.setState("ready");
      return resolved;
    }
    if (!this.installation) this.setState("missing", { transferredBytes: 0 });
    throw new Error("MEDIA_TOOLS_REQUIRED: 此操作需要下载视频处理工具，请确认后重试。");
  }

  install(): Promise<MediaToolsState> {
    if (this.installation) return this.installation;
    this.controller = new AbortController();
    const timeout = setTimeout(() => {
      const error = new Error("视频工具下载超时，请检查网络后重试。");
      error.name = "TimeoutError";
      this.controller?.abort(error);
    }, INSTALL_TIMEOUT_MS);
    timeout.unref();
    this.installation = this.performInstall(this.controller.signal).catch((error: unknown) => {
      const reason: unknown = this.controller?.signal.reason;
      if (reason instanceof Error && reason.name === "TimeoutError") this.setState("error", { error: reason.message });
      else if (this.controller?.signal.aborted) this.setState("missing", { transferredBytes: 0 });
      else this.setState("error", { error: error instanceof Error ? error.message : String(error) });
      return { ...this.state };
    }).finally(() => { clearTimeout(timeout); this.installation = undefined; this.controller = undefined; });
    return this.installation;
  }

  cancel(): void {
    this.controller?.abort();
  }

  private setState(status: MediaToolsState["status"], patch: Partial<MediaToolsState> = {}, notify = true): void {
    this.state = { ...this.state, status, error: undefined, ...patch };
    if (notify) this.options.onStateChange?.({ ...this.state });
  }

  private async resolveExisting(): Promise<MediaToolsPaths | undefined> {
    const explicitFfmpeg = process.env.ITERLAY_FFMPEG_PATH?.trim() || undefined;
    const explicitFfprobe = process.env.ITERLAY_FFPROBE_PATH?.trim() || undefined;
    if (explicitFfmpeg || explicitFfprobe) {
      const ffmpeg = explicitFfmpeg ?? siblingTool(explicitFfprobe!, "ffmpeg", this.platform);
      const ffprobe = explicitFfprobe ?? siblingTool(explicitFfmpeg!, "ffprobe", this.platform);
      const explicit = { ffmpeg, ffprobe };
      if (await usableTools(explicit)) return explicit;
    }
    if (this.platform === this.manifest.platform && this.arch === this.manifest.arch) {
      try {
        await this.validateDirectory(this.cachePath);
        return toolPaths(this.cachePath, this.platform);
      } catch { /* Missing or damaged caches must be installed again explicitly. */ }
    }
    if (this.options.resourcesPath) {
      const bundled = toolPaths(path.join(this.options.resourcesPath, "ffmpeg"), this.platform);
      if (await usableTools(bundled)) return bundled;
    }
    if (this.options.allowSystemTools !== false) {
      const candidates = this.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
        : this.platform === "linux" ? ["/usr/local/bin", "/usr/bin"] : [];
      for (const directory of candidates) {
        const candidate = toolPaths(directory, this.platform);
        if (await usableTools(candidate)) return candidate;
      }
      const fromPath = await toolsFromPath(this.platform);
      if (fromPath && await usableTools(fromPath)) return fromPath;
    }
    return undefined;
  }

  private async performInstall(signal: AbortSignal): Promise<MediaToolsState> {
    // Let an in-flight inspection settle before publishing installation progress.
    await this.inspection;
    this.setState("checking", { transferredBytes: 0 });
    const existing = await this.resolveExisting();
    signal.throwIfAborted();
    if (existing) {
      this.setState("ready");
      return { ...this.state };
    }
    if (this.platform !== this.manifest.platform || this.arch !== this.manifest.arch) {
      throw new Error("当前视频工具下载仅支持 macOS Apple Silicon。");
    }
    const parent = path.dirname(this.cachePath);
    await mkdir(parent, { recursive: true });
    const temporary = await mkdtemp(path.join(parent, `${this.platform}-${this.arch}.install-`));
    try {
      const archivePath = path.join(temporary, "tools.zip.download");
      this.setState("downloading", { transferredBytes: 0 });
      await this.downloadArchive(archivePath, signal);
      signal.throwIfAborted();
      this.setState("verifying");
      const staged = path.join(temporary, "contents");
      await this.extractArchive(archivePath, staged, signal);
      await this.validateDirectory(staged, signal);
      signal.throwIfAborted();
      await rm(this.cachePath, { recursive: true, force: true });
      await rename(staged, this.cachePath);
      this.setState("ready", { transferredBytes: this.manifest.sizeBytes });
      return { ...this.state };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async downloadArchive(destination: string, signal: AbortSignal): Promise<void> {
    const response = await (this.options.fetcher ?? fetch)(this.manifest.url, { signal });
    if (!response.ok || !response.body) throw new Error(`视频工具下载失败（${response.status}），请重试。`);
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) !== this.manifest.sizeBytes) {
      await response.body.cancel();
      throw new Error("视频工具下载大小与固定版本不符。");
    }
    const reader = response.body.getReader();
    const handle = await open(destination, "wx");
    const hash = createHash("sha256");
    let received = 0;
    let lastProgressAt = 0;
    const abort = (): void => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        signal.throwIfAborted();
        if (next.done) break;
        received += next.value.byteLength;
        if (received > this.manifest.sizeBytes) throw new Error("视频工具下载超过预期大小。");
        hash.update(next.value);
        await handle.writeFile(next.value);
        const now = Date.now();
        const notify = now - lastProgressAt >= 100 || received === this.manifest.sizeBytes;
        this.setState("downloading", { transferredBytes: received }, notify);
        if (notify) lastProgressAt = now;
      }
      if (received !== this.manifest.sizeBytes || hash.digest("hex") !== this.manifest.sha256.toLowerCase()) {
        throw new Error("视频工具 SHA-256 校验失败，请重试。");
      }
    } finally {
      signal.removeEventListener("abort", abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      await handle.close();
    }
  }

  private async extractArchive(archivePath: string, directory: string, signal: AbortSignal): Promise<void> {
    const zip = new AdmZip(archivePath);
    const expected = new Map(this.manifest.files.map((entry) => [entry.path, entry]));
    const seen = new Set<string>();
    await mkdir(directory, { recursive: true });
    for (const entry of zip.getEntries()) {
      signal.throwIfAborted();
      const name = entry.entryName;
      if (entry.isDirectory) {
        if (!safeArchivePath(name.replace(/\/$/, "")) || ![...expected.keys()].some((file) => file.startsWith(name))) {
          throw new Error("视频工具压缩包包含非预期目录。");
        }
        continue;
      }
      const item = expected.get(name);
      const unixMode = (entry.attr >>> 16) & 0o170000;
      if (!item || seen.has(name) || !safeArchivePath(name) || (unixMode !== 0 && unixMode !== 0o100000)) {
        throw new Error("视频工具压缩包包含非预期文件或链接。");
      }
      if (entry.header.size !== item.sizeBytes) throw new Error("视频工具压缩包文件大小不符。");
      const bytes = entry.getData();
      if (bytes.byteLength !== item.sizeBytes || digest(bytes) !== item.sha256.toLowerCase()) {
        throw new Error("视频工具文件 SHA-256 校验失败。");
      }
      const target = path.join(directory, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx", mode: name === "ffmpeg" || name === "ffprobe" ? 0o755 : 0o644 });
      seen.add(name);
    }
    if (seen.size !== expected.size) throw new Error("视频工具压缩包缺少必需文件。");
    await Promise.all([chmod(path.join(directory, "ffmpeg"), 0o755), chmod(path.join(directory, "ffprobe"), 0o755)]);
  }

  private async validateDirectory(directory: string, signal?: AbortSignal): Promise<void> {
    for (const item of this.manifest.files) {
      signal?.throwIfAborted();
      const target = path.join(directory, item.path);
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== item.sizeBytes || await hashFile(target, signal) !== item.sha256.toLowerCase()) {
        throw new Error("视频工具缓存已损坏。");
      }
    }
    const resolved = toolPaths(directory, this.platform);
    for (const binary of Object.values(resolved)) {
      await access(binary, constants.X_OK);
      if (!await isMacArm64(binary)) throw new Error("视频工具架构与当前设备不符。");
    }
    const major = /^ffmpeg(\d+)/.exec(this.manifest.version)?.[1];
    if (!await usableTools(resolved, major, signal)) throw new Error("视频工具版本自检失败。");
  }
}

function validateManifest(manifest: MediaToolsManifest): void {
  const url = new URL(manifest.url);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(manifest.version) || manifest.platform !== "darwin" || manifest.arch !== "arm64"
    || url.protocol !== "https:" || !SHA256.test(manifest.sha256) || !Number.isSafeInteger(manifest.sizeBytes)
    || manifest.sizeBytes <= 0 || manifest.sizeBytes > MAX_ARCHIVE_BYTES || !Array.isArray(manifest.files)) {
    throw new Error("视频工具清单无效。");
  }
  const seen = new Set<string>();
  let total = 0;
  for (const file of manifest.files) {
    if (!safeArchivePath(file.path) || (file.path !== "ffmpeg" && file.path !== "ffprobe" && !file.path.startsWith("licenses/"))
      || seen.has(file.path) || !SHA256.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) {
      throw new Error("视频工具文件清单无效。");
    }
    total += file.sizeBytes;
    seen.add(file.path);
  }
  if (!seen.has("ffmpeg") || !seen.has("ffprobe") || total > MAX_EXTRACTED_BYTES) throw new Error("视频工具清单缺少程序或超过大小限制。");
}

function safeArchivePath(value: string): boolean {
  return Boolean(value) && !value.includes("\\") && !value.includes("\0") && !value.startsWith("/")
    && !value.split("/").some((part) => part === ".." || part === "." || part === "") && !/^[a-z]:/i.test(value);
}

function toolPaths(directory: string, platform: NodeJS.Platform): MediaToolsPaths {
  return { ffmpeg: path.join(directory, platform === "win32" ? "ffmpeg.exe" : "ffmpeg"), ffprobe: path.join(directory, platform === "win32" ? "ffprobe.exe" : "ffprobe") };
}

function siblingTool(binary: string, name: keyof MediaToolsPaths, platform: NodeJS.Platform): string {
  return toolPaths(path.dirname(binary), platform)[name];
}

async function toolsFromPath(platform: NodeJS.Platform): Promise<MediaToolsPaths | undefined> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = toolPaths(directory, platform);
    if (await Promise.all(Object.values(candidate).map((file) => access(file, constants.X_OK).then(() => true, () => false))).then((values) => values.every(Boolean))) return candidate;
  }
  return undefined;
}

async function usableTools(tools: MediaToolsPaths, major?: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await Promise.all(Object.entries(tools).map(async ([name, binary]) => {
      await access(binary, constants.X_OK);
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(binary, ["-version"], { timeout: 10_000, maxBuffer: 512 * 1024, signal }, (error, output) => error ? reject(error) : resolve(output));
      });
      const actual = new RegExp(`^${name} version (\\d+)`, "m").exec(stdout)?.[1];
      if (!actual || (major !== undefined && actual !== major)) throw new Error("版本不符");
    }));
    return true;
  } catch { return false; }
}

async function isMacArm64(binary: string): Promise<boolean> {
  const handle = await open(binary, "r");
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 8) return false;
    if (header.readUInt32LE(0) === 0xfeedfacf) return header.readUInt32LE(4) === 0x0100000c;
    const magic = header.readUInt32BE(0);
    if (magic !== 0xcafebabe && magic !== 0xcafebabf) return false;
    const count = header.readUInt32BE(4);
    const width = magic === 0xcafebabf ? 32 : 20;
    if (count === 0 || 8 + count * width > bytesRead) return false;
    for (let index = 0; index < count; index++) if (header.readUInt32BE(8 + index * width) === 0x0100000c) return true;
    return false;
  } finally { await handle.close(); }
}

function digest(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

async function hashFile(file: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { signal })) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest("hex");
}
