import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderImageResult, SceneCoverFocus } from "../../shared/types.js";
import { writeJsonAtomic, MutationQueue } from "./atomic-json.js";
import { extensionFromMime } from "./asset-store.js";

export interface StoredSceneMediaResult {
  id: string;
  jobId: string;
  sceneId: string;
  path: string;
  prompt: string;
  createdAt: string;
  providerId?: string;
  providerName?: string;
  model?: string;
}

export interface StoredSceneCover {
  id: string;
  sceneId: string;
  path: string;
  sourcePath: string;
  createdAt: string;
  focus: SceneCoverFocus;
}

export interface StoredSceneMedia {
  sceneId: string;
  results: StoredSceneMediaResult[];
  covers: StoredSceneCover[];
}

interface SceneMediaDatabase {
  version: 1;
  scenes: Record<string, StoredSceneMedia>;
}

interface GenerationMetadata {
  jobId: string;
  prompt: string;
  createdAt: string;
  providerId?: string;
  providerName?: string;
  model?: string;
}

const EMPTY_DATABASE: SceneMediaDatabase = { version: 1, scenes: {} };

export class SceneMediaStore {
  private readonly rootDir: string;
  private readonly indexFile: string;
  private readonly mutations = new MutationQueue();
  private cache: SceneMediaDatabase | null = null;

  constructor(dataDir: string) {
    this.rootDir = path.join(dataDir, "scene-media");
    this.indexFile = path.join(this.rootDir, "index.json");
  }

  async list(): Promise<StoredSceneMedia[]> {
    await this.mutations.idle();
    return Object.values((await this.readDatabase()).scenes).map(cloneSceneMedia);
  }

  async saveGeneration(
    sceneId: string,
    metadata: GenerationMetadata,
    images: ProviderImageResult[]
  ): Promise<StoredSceneMediaResult[]> {
    return this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      const directory = path.join(this.rootDir, "results", sceneDirectory(sceneId));
      await mkdir(directory, { recursive: true });
      const results = await Promise.all(
        images.map(async (image, index) => {
          const id = `${metadata.jobId}-${index + 1}`;
          const filePath = path.join(directory, `${id}${extensionFromMime(image.mimeType)}`);
          await writeFile(filePath, image.bytes);
          return {
            id,
            jobId: metadata.jobId,
            sceneId,
            path: filePath,
            prompt: metadata.prompt,
            createdAt: metadata.createdAt,
            providerId: metadata.providerId,
            providerName: metadata.providerName,
            model: metadata.model
          } satisfies StoredSceneMediaResult;
        })
      );
      database.scenes[sceneId] = { ...current, results: [...results, ...current.results] };
      await this.writeDatabase(database);
      return results.map((result) => ({ ...result }));
    });
  }

  /** 将模板包中的实例和封面写入一个全新的模板命名空间。 */
  async importScene(
    sceneId: string,
    media: StoredSceneMedia,
    images: Map<string, Buffer>
  ): Promise<StoredSceneMedia> {
    return this.mutations.run(async () => {
      const database = await this.readDatabase();
      if (database.scenes[sceneId]) throw new Error("模板媒体已存在，请重新导入。");

      const resultDirectory = path.join(this.rootDir, "results", sceneDirectory(sceneId));
      const coverDirectory = path.join(this.rootDir, "covers", sceneDirectory(sceneId));
      await Promise.all([
        mkdir(resultDirectory, { recursive: true }),
        mkdir(coverDirectory, { recursive: true })
      ]);

      const importedPathMap = new Map<string, string>();
      const results: StoredSceneMediaResult[] = [];
      for (const result of media.results) {
        const bytes = images.get(result.path);
        if (!bytes) continue;
        const id = crypto.randomUUID();
        const filePath = path.join(resultDirectory, `${id}${safeMediaExtension(result.path)}`);
        await writeFile(filePath, bytes);
        importedPathMap.set(result.path, filePath);
        results.push({
          ...result,
          id,
          jobId: crypto.randomUUID(),
          sceneId,
          path: filePath
        });
      }

      const covers: StoredSceneCover[] = [];
      for (const cover of media.covers) {
        const bytes = images.get(cover.path);
        if (!bytes) continue;
        const id = crypto.randomUUID();
        const filePath = path.join(coverDirectory, `${id}${safeMediaExtension(cover.path)}`);
        await writeFile(filePath, bytes);
        const sourcePath = importedPathMap.get(cover.sourcePath) ?? filePath;
        importedPathMap.set(cover.path, filePath);
        covers.push({
          ...cover,
          id,
          sceneId,
          path: filePath,
          sourcePath,
          focus: { x: clampFocus(cover.focus.x), y: clampFocus(cover.focus.y) }
        });
      }

      const imported = { sceneId, results, covers };
      database.scenes[sceneId] = imported;
      await this.writeDatabase(database);
      return cloneSceneMedia(imported);
    });
  }

  async deleteResult(sceneId: string, resultId: string): Promise<boolean> {
    return this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      const target = current.results.find((result) => result.id === resultId);
      if (!target) return false;
      database.scenes[sceneId] = {
        ...current,
        results: current.results.filter((result) => result.id !== resultId)
      };
      await this.writeDatabase(database);
      await rm(target.path, { force: true });
      return true;
    });
  }

  async reorderResults(sceneId: string, resultIds: string[]): Promise<void> {
    await this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      if (
        resultIds.length !== current.results.length ||
        new Set(resultIds).size !== resultIds.length ||
        resultIds.some((id) => !current.results.some((result) => result.id === id))
      ) {
        throw new Error("示例图排序数据无效。");
      }
      const byId = new Map(current.results.map((result) => [result.id, result]));
      database.scenes[sceneId] = { ...current, results: resultIds.map((id) => byId.get(id)!) };
      await this.writeDatabase(database);
    });
  }

  async addCover(
    sceneId: string,
    sourcePath: string,
    bytes: Buffer,
    mimeType: string,
    replaceCoverId?: string
  ): Promise<StoredSceneCover> {
    return this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      const duplicate = current.covers.find((cover) => cover.sourcePath === sourcePath);
      if (duplicate) return { ...duplicate, focus: { ...duplicate.focus } };
      if (current.covers.length >= 3 && !replaceCoverId) {
        throw new Error("封面已满 3 张，请选择要替换的封面。");
      }

      const replacementIndex = replaceCoverId
        ? current.covers.findIndex((cover) => cover.id === replaceCoverId)
        : -1;
      if (replaceCoverId && replacementIndex < 0) throw new Error("找不到要替换的封面。");

      const id = crypto.randomUUID();
      const directory = path.join(this.rootDir, "covers", sceneDirectory(sceneId));
      await mkdir(directory, { recursive: true });
      const filePath = path.join(directory, `${id}${extensionFromMime(mimeType)}`);
      await writeFile(filePath, bytes);
      const cover: StoredSceneCover = {
        id,
        sceneId,
        path: filePath,
        sourcePath,
        createdAt: new Date().toISOString(),
        focus: { x: 0.5, y: 0.5 }
      };
      const covers = [...current.covers];
      const replaced = replacementIndex >= 0 ? covers[replacementIndex] : undefined;
      if (replacementIndex >= 0) covers[replacementIndex] = cover;
      else covers.push(cover);
      database.scenes[sceneId] = { ...current, covers };
      await this.writeDatabase(database);
      if (replaced) await rm(replaced.path, { force: true });
      return { ...cover, focus: { ...cover.focus } };
    });
  }

  async removeCover(sceneId: string, coverId: string): Promise<boolean> {
    return this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      const target = current.covers.find((cover) => cover.id === coverId);
      if (!target) return false;
      database.scenes[sceneId] = { ...current, covers: current.covers.filter((cover) => cover.id !== coverId) };
      await this.writeDatabase(database);
      await rm(target.path, { force: true });
      return true;
    });
  }

  async clearCovers(sceneId: string): Promise<number> {
    return this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      if (current.covers.length === 0) return 0;
      database.scenes[sceneId] = { ...current, covers: [] };
      await this.writeDatabase(database);
      await Promise.all(current.covers.map((cover) => rm(cover.path, { force: true })));
      return current.covers.length;
    });
  }

  async reorderCovers(sceneId: string, coverIds: string[]): Promise<void> {
    await this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      if (
        coverIds.length !== current.covers.length ||
        new Set(coverIds).size !== coverIds.length ||
        coverIds.some((id) => !current.covers.some((cover) => cover.id === id))
      ) {
        throw new Error("封面排序数据无效。");
      }
      const byId = new Map(current.covers.map((cover) => [cover.id, cover]));
      database.scenes[sceneId] = { ...current, covers: coverIds.map((id) => byId.get(id)!) };
      await this.writeDatabase(database);
    });
  }

  async updateCoverFocus(sceneId: string, coverId: string, focus: SceneCoverFocus): Promise<void> {
    await this.mutations.run(async () => {
      const database = await this.readDatabase();
      const current = getScene(database, sceneId);
      if (!current.covers.some((cover) => cover.id === coverId)) throw new Error("找不到要调整的封面。");
      const normalized = { x: clampFocus(focus.x), y: clampFocus(focus.y) };
      database.scenes[sceneId] = {
        ...current,
        covers: current.covers.map((cover) => (cover.id === coverId ? { ...cover, focus: normalized } : cover))
      };
      await this.writeDatabase(database);
    });
  }

  async deleteScene(sceneId: string): Promise<void> {
    await this.mutations.run(async () => {
      const database = await this.readDatabase();
      delete database.scenes[sceneId];
      await this.writeDatabase(database);
      await rm(path.join(this.rootDir, "results", sceneDirectory(sceneId)), { recursive: true, force: true });
      await rm(path.join(this.rootDir, "covers", sceneDirectory(sceneId)), { recursive: true, force: true });
    });
  }

  private async readDatabase(): Promise<SceneMediaDatabase> {
    if (this.cache) return structuredClone(this.cache);
    try {
      const parsed = JSON.parse(await readFile(this.indexFile, "utf8")) as Partial<SceneMediaDatabase>;
      this.cache = parsed.version === 1 && parsed.scenes && typeof parsed.scenes === "object"
        ? { version: 1, scenes: parsed.scenes as Record<string, StoredSceneMedia> }
        : structuredClone(EMPTY_DATABASE);
      return structuredClone(this.cache);
    } catch {
      this.cache = structuredClone(EMPTY_DATABASE);
      return structuredClone(this.cache);
    }
  }

  private async writeDatabase(database: SceneMediaDatabase): Promise<void> {
    await writeJsonAtomic(this.indexFile, database);
    this.cache = structuredClone(database);
  }
}

function getScene(database: SceneMediaDatabase, sceneId: string): StoredSceneMedia {
  const current = database.scenes[sceneId];
  return current
    ? cloneSceneMedia(current)
    : { sceneId, results: [], covers: [] };
}

function cloneSceneMedia(media: StoredSceneMedia): StoredSceneMedia {
  return {
    sceneId: media.sceneId,
    results: media.results.map((result) => ({ ...result })),
    covers: media.covers.map((cover) => ({ ...cover, focus: { ...cover.focus } }))
  };
}

function sceneDirectory(sceneId: string): string {
  return Buffer.from(sceneId).toString("base64url");
}

function clampFocus(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function safeMediaExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(extension) ? extension : ".png";
}
