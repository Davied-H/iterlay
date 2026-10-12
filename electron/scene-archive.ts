import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SceneTemplateData, TemplateExtractionScenario } from "../shared/types.js";
import { buildArchiveInWorker, parseArchiveInWorker } from "./archive-worker-client.js";
import type { StoredSceneMedia } from "./storage/scene-media-store.js";

export const SCENE_ARCHIVE_FORMAT = "iterlay-template";
export const SCENE_ARCHIVE_VERSION = 1;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

export interface SceneArchiveManifest {
  format: string;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
}

export interface ParsedSceneArchive {
  manifest: SceneArchiveManifest;
  scene: SceneTemplateData;
  media: StoredSceneMedia;
  /** 包内相对路径 -> 图片字节。 */
  images: Map<string, Buffer>;
}

/** 打包模板定义、独立生成实例和封面为 .itt（标准 zip）。 */
export async function buildSceneArchive(
  scene: SceneTemplateData,
  media: StoredSceneMedia | undefined,
  appVersion: string
): Promise<Buffer> {
  const entries: Array<[string, Uint8Array]> = [];
  const pathMap = new Map<string, string>();
  const archivedByHash = new Map<string, { relativePath: string; bytes: Buffer }>();
  const usedNames = new Set<string>();

  async function addImage(filePath: string, directory: "results" | "covers"): Promise<void> {
    if (pathMap.has(filePath)) return;
    try {
      const bytes = await readFile(filePath);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const existing = archivedByHash.get(hash);
      if (existing && existing.bytes.equals(bytes)) {
        pathMap.set(filePath, existing.relativePath);
        return;
      }
      const relativePath = `media/${directory}/${uniqueName(path.basename(filePath), usedNames)}`;
      entries.push([relativePath, bytes]);
      pathMap.set(filePath, relativePath);
      archivedByHash.set(hash, { relativePath, bytes });
    } catch {
      // 丢失的媒体不写入元数据，确保导入后不会留下失效引用。
    }
  }

  const results = media?.results ?? [];
  // 新模板不再单独维护封面；没有遗留封面时，首张示例图就是封面。
  const covers = media?.covers.length
    ? media.covers
    : results.slice(0, 1).map((result) => ({
        id: `default-cover:${result.id}`,
        sceneId: scene.id,
        path: result.path,
        sourcePath: result.path,
        createdAt: result.createdAt,
        focus: { x: 0.5, y: 0.5 }
      }));

  for (const result of results) await addImage(result.path, "results");
  for (const cover of covers) await addImage(cover.path, "covers");

  const exportedMedia: StoredSceneMedia = {
    sceneId: scene.id,
    results: results
      .filter((result) => pathMap.has(result.path))
      .map((result) => ({ ...result, path: pathMap.get(result.path)! })),
    covers: covers
      .filter((cover) => pathMap.has(cover.path))
      .map((cover) => ({
        ...cover,
        path: pathMap.get(cover.path)!,
        sourcePath: pathMap.get(cover.sourcePath) ?? pathMap.get(cover.path)!
      }))
  };
  const manifest: SceneArchiveManifest = {
    format: SCENE_ARCHIVE_FORMAT,
    formatVersion: SCENE_ARCHIVE_VERSION,
    appVersion,
    exportedAt: new Date().toISOString()
  };

  entries.push(
    ["manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8")],
    ["template.json", Buffer.from(JSON.stringify(scene, null, 2), "utf8")],
    ["media.json", Buffer.from(JSON.stringify(exportedMedia, null, 2), "utf8")]
  );
  return buildArchiveInWorker(entries);
}

export async function parseSceneArchive(buffer: Buffer): Promise<ParsedSceneArchive> {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error("模板包压缩文件过大（最多 512 MB）。");
  let archiveEntries: Array<[string, Uint8Array]>;
  try {
    archiveEntries = await parseArchiveInWorker(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replaceAll("画板包", "模板包"));
  }
  const entryMap = new Map(archiveEntries);
  const manifest = readJsonEntry<SceneArchiveManifest>(entryMap, "manifest.json");
  if (!manifest) throw new Error("模板包缺少 manifest.json。");
  if (manifest.format !== SCENE_ARCHIVE_FORMAT) throw new Error("这不是 Iterlay 模板文件。");
  if (typeof manifest.formatVersion !== "number" || manifest.formatVersion > SCENE_ARCHIVE_VERSION) {
    throw new Error("模板包版本过高，请升级应用后再导入。");
  }

  const scene = readJsonEntry<SceneTemplateData>(entryMap, "template.json");
  if (!isSceneTemplateData(scene)) throw new Error("模板包缺少有效的 template.json。");
  const rawMedia = readJsonEntry<StoredSceneMedia>(entryMap, "media.json");
  const media: StoredSceneMedia = {
    sceneId: scene.id,
    results: Array.isArray(rawMedia?.results) ? rawMedia.results : [],
    covers: Array.isArray(rawMedia?.covers) ? rawMedia.covers : []
  };

  const images = new Map<string, Buffer>();
  for (const [name, bytes] of entryMap) {
    if (!name.startsWith("media/")) continue;
    images.set(name, Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength));
  }
  media.results = media.results.filter((result) => isStoredResult(result) && images.has(result.path));
  media.covers = media.covers.filter((cover) => isStoredCover(cover) && images.has(cover.path));

  return { manifest, scene, media, images };
}

function readJsonEntry<T>(entries: Map<string, Uint8Array>, entryName: string): T | null {
  const bytes = entries.get(entryName);
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function isSceneTemplateData(value: unknown): value is SceneTemplateData {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<SceneTemplateData>;
  return Boolean(
    typeof scene.id === "string" &&
    typeof scene.name === "string" && scene.name.trim() &&
    typeof scene.description === "string" &&
    typeof scene.prompt === "string" && scene.prompt.trim() &&
    typeof scene.category === "string" &&
    (scene.mode === "generate" || scene.mode === "edit") &&
    typeof scene.useCase === "string" &&
    (
      scene.extractionScenario === undefined ||
      isTemplateExtractionScenario(scene.extractionScenario)
    ) &&
    (scene.source === "preset" || scene.source === "custom")
  );
}

function isTemplateExtractionScenario(value: unknown): value is TemplateExtractionScenario {
  return value === "design-language" || value === "layout-skeleton" || value === "series-template" || value === "replica";
}

function isStoredResult(value: unknown): value is StoredSceneMedia["results"][number] {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<StoredSceneMedia["results"][number]>;
  return typeof result.id === "string" && typeof result.path === "string" && typeof result.prompt === "string" &&
    typeof result.createdAt === "string";
}

function isStoredCover(value: unknown): value is StoredSceneMedia["covers"][number] {
  if (!value || typeof value !== "object") return false;
  const cover = value as Partial<StoredSceneMedia["covers"][number]>;
  return typeof cover.id === "string" && typeof cover.path === "string" && typeof cover.createdAt === "string" &&
    typeof cover.focus?.x === "number" && typeof cover.focus?.y === "number";
}

function uniqueName(baseName: string, used: Set<string>): string {
  let name = baseName || "image.png";
  let index = 1;
  while (used.has(name)) {
    const extension = path.extname(baseName);
    name = `${path.basename(baseName, extension) || "image"}-${index}${extension}`;
    index += 1;
  }
  used.add(name);
  return name;
}
