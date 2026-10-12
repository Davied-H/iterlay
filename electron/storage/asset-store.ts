import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderImageResult, ReferenceImagePayload, StoredReferenceImage } from "../../shared/types.js";

export const ASSET_PROTOCOL = "iterlay-asset";
export const MAX_MANAGED_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_MANAGED_VIDEO_BYTES = 512 * 1024 * 1024;
export const MAX_MANAGED_AUDIO_BYTES = 15 * 1024 * 1024;

interface ReferenceImageBytes extends Omit<ReferenceImagePayload, "dataBase64"> {
  bytes: Buffer;
}

export class AssetStore {
  private readonly outputDir: string;
  private readonly referenceDir: string;
  private readonly derivedDir: string;
  private readonly thumbnailDir: string;
  private readonly videoOutputDir: string;
  private readonly videoUploadDir: string;
  private readonly audioUploadDir: string;
  private readonly assetUrlKey = randomBytes(32);
  private readonly thumbnailJobs = new Map<string, Promise<string>>();

  constructor(private readonly dataDir: string) {
    this.outputDir = path.join(dataDir, "outputs");
    this.referenceDir = path.join(dataDir, "references");
    this.derivedDir = path.join(dataDir, "derived");
    this.thumbnailDir = path.join(dataDir, "thumbnails");
    this.videoOutputDir = path.join(dataDir, "video-outputs");
    this.videoUploadDir = path.join(dataDir, "video-uploads");
    this.audioUploadDir = path.join(dataDir, "audio-uploads");
  }

  async saveReferenceImages(images: ReferenceImagePayload[]): Promise<StoredReferenceImage[]> {
    return this.saveReferenceImageBytes(images.map(({ dataBase64, ...image }) => ({
      ...image,
      bytes: decodeImageBase64(dataBase64)
    })));
  }

  async saveReferenceImageBytes(images: ReferenceImageBytes[]): Promise<StoredReferenceImage[]> {
    await mkdir(this.referenceDir, { recursive: true });
    return Promise.all(
      images.map(async (image) => {
        const extension = extensionFromMime(image.mimeType);
        const fileName = `${Date.now()}-${image.id || crypto.randomUUID()}${extension}`;
        const filePath = path.join(this.referenceDir, fileName);
        await writeFile(filePath, image.bytes);
        return {
          id: image.id,
          name: image.name,
          mimeType: image.mimeType,
          role: image.role,
          path: filePath
        };
      })
    );
  }

  async saveOutputs(jobId: string, images: ProviderImageResult[]): Promise<string[]> {
    await mkdir(this.outputDir, { recursive: true });
    return Promise.all(
      images.map(async (image, index) => {
        const extension = extensionFromMime(image.mimeType);
        const filePath = path.join(this.outputDir, `${jobId}-${index + 1}${extension}`);
        await writeFile(filePath, image.bytes);
        return filePath;
      })
    );
  }

  async saveDerivedPngs(operationId: string, images: Buffer[]): Promise<string[]> {
    await mkdir(this.derivedDir, { recursive: true });
    const safeId = operationId.replace(/[^a-zA-Z0-9-]/g, "");
    return Promise.all(
      images.map(async (bytes, index) => {
        const filePath = path.join(this.derivedDir, `${safeId}-${index + 1}.png`);
        await writeFile(filePath, bytes);
        return filePath;
      })
    );
  }

  async toDataUrl(filePath: string): Promise<string> {
    const bytes = await readFile(filePath);
    return `data:${mimeFromExtension(filePath)};base64,${bytes.toString("base64")}`;
  }

  async readManagedDataUrl(filePath: string): Promise<string> {
    const bytes = await this.readManagedBytes(filePath);
    return `data:${mimeFromExtension(filePath)};base64,${bytes.toString("base64")}`;
  }

  async readManagedBytes(filePath: string): Promise<Buffer> {
    const normalized = path.resolve(filePath);
    if (!this.isManagedPath(normalized)) throw new Error("不允许访问工作区之外的素材。");
    return readFile(normalized);
  }

  /**
   * Returns an opaque renderer-safe URL. The URL contains no filesystem path and
   * can only resolve files explicitly registered by this AssetStore instance.
   */
  toAssetUrl(filePath: string): string {
    const normalized = path.resolve(filePath);
    if (!this.isManagedPath(normalized)) throw new Error("不允许访问工作区之外的素材。");
    const payload = Buffer.from(path.relative(path.resolve(this.dataDir), normalized), "utf8");
    const signature = createHmac("sha256", this.assetUrlKey).update(payload).digest().subarray(0, 16);
    const token = Buffer.concat([payload, Buffer.from([0]), signature]).toString("base64url");
    return `${ASSET_PROTOCOL}://local/${token}`;
  }

  resolveAssetUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== `${ASSET_PROTOCOL}:` || parsed.hostname !== "local") return null;
      const token = parsed.pathname.slice(1);
      const decoded = Buffer.from(token, "base64url");
      if (decoded.length <= 17 || decoded[decoded.length - 17] !== 0) return null;
      const payload = decoded.subarray(0, decoded.length - 17);
      const supplied = decoded.subarray(decoded.length - 16);
      const expected = createHmac("sha256", this.assetUrlKey).update(payload).digest().subarray(0, 16);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
      const relative = payload.toString("utf8");
      const resolved = path.resolve(this.dataDir, relative);
      return this.isManagedPath(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  async isReadable(filePath: string): Promise<boolean> {
    try {
      const info = await stat(filePath);
      return info.isFile();
    } catch {
      return false;
    }
  }

  /** Creates a small persistent PNG once per source-file revision. */
  async getThumbnailUrl(
    filePath: string,
    createThumbnail: (sourcePath: string) => Promise<Buffer>,
    cacheVariant = "default"
  ): Promise<string> {
    const source = path.resolve(filePath);
    if (!this.isManagedPath(source)) throw new Error("不允许访问工作区之外的素材。");
    const info = await stat(source);
    const key = createHash("sha256")
      .update(source)
      .update(String(info.mtimeMs))
      .update(String(info.size))
      .update(cacheVariant)
      .digest("hex");
    const thumbnailPath = path.join(this.thumbnailDir, `${key}.png`);
    if (await this.isReadable(thumbnailPath)) return this.toAssetUrl(thumbnailPath);

    let job = this.thumbnailJobs.get(key);
    if (!job) {
      job = (async () => {
        const bytes = await createThumbnail(source);
        await mkdir(this.thumbnailDir, { recursive: true });
        await writeFile(thumbnailPath, bytes);
        return thumbnailPath;
      })().finally(() => this.thumbnailJobs.delete(key));
      this.thumbnailJobs.set(key, job);
    }
    return this.toAssetUrl(await job);
  }

  /** 把拖入/粘贴的图片落盘，让它能被画板持久化引用。 */
  async saveUpload(dataUrl: string): Promise<string> {
    const decoded = decodeImageDataUrl(dataUrl);
    return this.saveUploadBytes(decoded.bytes, decoded.mimeType);
  }

  async saveUploadBytes(bytes: Buffer, mimeType: string): Promise<string> {
    if (bytes.length === 0 || bytes.length > MAX_MANAGED_IMAGE_BYTES) {
      throw new Error(`图片不能超过 ${Math.floor(MAX_MANAGED_IMAGE_BYTES / 1024 / 1024)} MB。`);
    }
    const uploadDir = path.join(this.dataDir, "uploads");
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${Date.now()}-${crypto.randomUUID()}${extensionFromMime(mimeType)}`);
    await writeFile(filePath, bytes);
    return filePath;
  }

  async saveVideoOutput(jobId: string, bytes: Buffer, mimeType: string): Promise<string> {
    validateVideoBytes(bytes, mimeType);
    await mkdir(this.videoOutputDir, { recursive: true });
    const safeJobId = jobId.replace(/[^a-zA-Z0-9-]/g, "") || crypto.randomUUID();
    const filePath = path.join(this.videoOutputDir, `${safeJobId}${videoExtensionFromMime(mimeType)}`);
    await writeFile(filePath, bytes);
    return filePath;
  }

  async saveVideoUploadBytes(bytes: Buffer, mimeType: string): Promise<string> {
    validateVideoBytes(bytes, mimeType);
    await mkdir(this.videoUploadDir, { recursive: true });
    const filePath = path.join(
      this.videoUploadDir,
      `${Date.now()}-${crypto.randomUUID()}${videoExtensionFromMime(mimeType)}`
    );
    await writeFile(filePath, bytes);
    return filePath;
  }

  async saveAudioUploadBytes(bytes: Buffer, mimeType: string): Promise<string> {
    validateAudioBytes(bytes, mimeType);
    await mkdir(this.audioUploadDir, { recursive: true });
    const filePath = path.join(
      this.audioUploadDir,
      `${Date.now()}-${crypto.randomUUID()}${audioExtensionFromMime(mimeType)}`
    );
    await writeFile(filePath, bytes);
    return filePath;
  }

  async importVideoFile(sourcePath: string): Promise<{ path: string; mimeType: string }> {
    const mimeType = videoMimeFromExtension(sourcePath);
    const info = await stat(sourcePath);
    if (!info.isFile() || info.size === 0 || info.size > MAX_MANAGED_VIDEO_BYTES) {
      throw new Error(`视频不能超过 ${Math.floor(MAX_MANAGED_VIDEO_BYTES / 1024 / 1024)} MB。`);
    }
    await mkdir(this.videoUploadDir, { recursive: true });
    const filePath = path.join(
      this.videoUploadDir,
      `${Date.now()}-${crypto.randomUUID()}${videoExtensionFromMime(mimeType)}`
    );
    await copyFile(sourcePath, filePath);
    return { path: filePath, mimeType };
  }

  async exportAsset(sourcePath: string, destinationPath: string): Promise<void> {
    await copyFile(sourcePath, destinationPath);
  }

  async deleteManagedAsset(filePath: string): Promise<boolean> {
    const normalized = path.resolve(filePath);
    if (!this.isAssetFilePath(normalized)) return false;
    const existed = await this.isReadable(normalized);
    if (existed) await rm(normalized, { force: true });
    return existed;
  }

  /** Conservatively removes old files under asset-only roots that have no persisted reference. */
  async collectGarbage(
    referencedPaths: ReadonlySet<string>,
    options: { minAgeMs?: number; now?: number } = {}
  ): Promise<string[]> {
    const now = options.now ?? Date.now();
    const minAgeMs = options.minAgeMs ?? 24 * 60 * 60 * 1_000;
    const referenced = new Set([...referencedPaths].map((item) => path.resolve(item)));
    const removed: string[] = [];
    for (const root of this.assetRoots()) {
      for (const filePath of await listFiles(root)) {
        if (referenced.has(filePath)) continue;
        try {
          const info = await stat(filePath);
          if (now - info.mtimeMs < minAgeMs) continue;
          await rm(filePath, { force: true });
          removed.push(filePath);
        } catch {
          // Concurrent deletion or unreadable orphan: leave it for a later pass.
        }
      }
    }
    return removed;
  }

  /** Thumbnails are reproducible; keep a bounded LRU while protecting recent active URLs. */
  async pruneThumbnailCache(maxBytes = 256 * 1024 * 1024, maxFiles = 2_000): Promise<number> {
    const entries = await Promise.all((await listFiles(this.thumbnailDir)).map(async (filePath) => {
      try {
        const info = await stat(filePath);
        return { filePath, size: info.size, mtimeMs: info.mtimeMs };
      } catch {
        return null;
      }
    }));
    const files = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => left.mtimeMs - right.mtimeMs);
    let totalBytes = files.reduce((total, entry) => total + entry.size, 0);
    let count = files.length;
    let removed = 0;
    const protectAfter = Date.now() - 60 * 60 * 1_000;
    for (const entry of files) {
      if (count <= maxFiles && totalBytes <= maxBytes) break;
      if (entry.mtimeMs >= protectAfter) continue;
      await rm(entry.filePath, { force: true });
      totalBytes -= entry.size;
      count -= 1;
      removed += 1;
    }
    return removed;
  }

  /** 导入画板包时把包内图片落到本机资产库（按新画板 id 分组）。 */
  async saveImportedImage(groupId: string, fileName: string, bytes: Buffer): Promise<string> {
    const dir = path.join(this.dataDir, "imported", groupId.replace(/[^a-zA-Z0-9-]/g, ""));
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, path.basename(fileName));
    await writeFile(filePath, bytes);
    return filePath;
  }

  private isManagedPath(filePath: string): boolean {
    const relative = path.relative(path.resolve(this.dataDir), filePath);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  private assetRoots(): string[] {
    return [
      this.outputDir,
      this.referenceDir,
      this.derivedDir,
      this.videoOutputDir,
      this.videoUploadDir,
      this.audioUploadDir,
      path.join(this.dataDir, "uploads"),
      path.join(this.dataDir, "imported")
    ].map((item) => path.resolve(item));
  }

  private isAssetFilePath(filePath: string): boolean {
    return this.assetRoots().some((root) => {
      const relative = path.relative(root, filePath);
      return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
  }
}

async function listFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const item = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(item) : entry.isFile() ? [path.resolve(item)] : [];
  }));
  return nested.flat();
}

export function decodeImageDataUrl(
  dataUrl: string,
  maxBytes = MAX_MANAGED_IMAGE_BYTES
): { mimeType: string; bytes: Buffer } {
  if (typeof dataUrl !== "string" || dataUrl.length > maxEncodedLength(maxBytes) + 128) {
    throw new Error(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB。`);
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !match[1].toLowerCase().startsWith("image/")) throw new Error("无法识别的图片数据。");
  return { mimeType: match[1], bytes: decodeImageBase64(match[2], maxBytes) };
}

export function decodeImageBase64(dataBase64: string, maxBytes = MAX_MANAGED_IMAGE_BYTES): Buffer {
  if (!dataBase64 || dataBase64.length > maxEncodedLength(maxBytes)) {
    throw new Error(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB。`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64) || dataBase64.length % 4 === 1) {
    throw new Error("图片包含无效的 base64 数据。");
  }
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new Error(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB。`);
  }
  return bytes;
}

function maxEncodedLength(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4;
}

export function extensionFromMime(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  return ".png";
}

export function mimeFromExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

export function videoMimeFromExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".m4v") return "video/x-m4v";
  if (extension === ".mp4") return "video/mp4";
  throw new Error("仅支持 MP4、WebM、MOV 或 M4V 视频。");
}

export function videoExtensionFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";", 1)[0].trim();
  if (normalized === "video/webm") return ".webm";
  if (normalized === "video/quicktime") return ".mov";
  if (normalized === "video/x-m4v") return ".m4v";
  if (normalized === "video/mp4" || normalized === "application/octet-stream") return ".mp4";
  throw new Error("仅支持 MP4、WebM、MOV 或 M4V 视频。");
}

export function audioExtensionFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return ".mp3";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return ".wav";
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") return ".m4a";
  if (normalized === "audio/aac") return ".aac";
  if (normalized === "audio/ogg") return ".ogg";
  throw new Error("仅支持 MP3、WAV、M4A、AAC 或 OGG 音频。");
}

export function audioMimeFromExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".aac") return "audio/aac";
  if (extension === ".ogg") return "audio/ogg";
  throw new Error("仅支持 MP3、WAV、M4A、AAC 或 OGG 音频。");
}

export function managedAssetMimeFromExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(extension)) return videoMimeFromExtension(filePath);
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(extension)) return audioMimeFromExtension(filePath);
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return mimeFromExtension(filePath);
  return "application/octet-stream";
}

function validateVideoBytes(bytes: Buffer, mimeType: string): void {
  videoExtensionFromMime(mimeType);
  if (bytes.length === 0 || bytes.length > MAX_MANAGED_VIDEO_BYTES) {
    throw new Error(`视频不能超过 ${Math.floor(MAX_MANAGED_VIDEO_BYTES / 1024 / 1024)} MB。`);
  }
}

function validateAudioBytes(bytes: Buffer, mimeType: string): void {
  if (bytes.length === 0 || bytes.length > MAX_MANAGED_AUDIO_BYTES) {
    throw new Error(`音频不能超过 ${Math.floor(MAX_MANAGED_AUDIO_BYTES / 1024 / 1024)} MB。`);
  }
  audioExtensionFromMime(mimeType);
}
