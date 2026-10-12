import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BoardNodeSnapshot, BoardTrashRetentionDays, TrashedBoardImage } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

const MAX_TRASHED_IMAGES = 1_000;

type StoredTrashedBoardImage = Omit<TrashedBoardImage, "expiresAt" | "previewUrl">;

/** 持久化画板内图片的回收站记录；图片文件继续保留在资产目录。 */
export class BoardImageTrashStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "board-image-trash.json");
  }

  async add(boardId: string, boardName: string, nodes: BoardNodeSnapshot[]): Promise<StoredTrashedBoardImage[]> {
    if (nodes.length === 0) return [];
    return this.mutations.run(async () => {
      const records = await this.read();
      const deletedAt = new Date().toISOString();
      const additions = nodes.map((node) => ({
        id: crypto.randomUUID(),
        boardId,
        boardName,
        node: structuredClone(node),
        deletedAt
      }));
      await this.write([...records, ...additions].slice(-MAX_TRASHED_IMAGES));
      return additions;
    });
  }

  async list(retentionDays: BoardTrashRetentionDays): Promise<TrashedBoardImage[]> {
    await this.mutations.idle();
    return (await this.read())
      .map((record) => ({
        ...record,
        ...(retentionDays === 0 ? {} : {
          expiresAt: new Date(Date.parse(record.deletedAt) + retentionDays * 24 * 60 * 60 * 1_000).toISOString()
        })
      }))
      .sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt));
  }

  async take(id: string): Promise<StoredTrashedBoardImage | null> {
    return this.mutations.run(async () => {
      const records = await this.read();
      const record = records.find((item) => item.id === id) ?? null;
      if (!record) return null;
      await this.write(records.filter((item) => item.id !== id));
      return record;
    });
  }

  async get(id: string): Promise<StoredTrashedBoardImage | null> {
    await this.mutations.idle();
    return (await this.read()).find((item) => item.id === id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    return this.mutations.run(async () => {
      const records = await this.read();
      if (!records.some((item) => item.id === id)) return false;
      await this.write(records.filter((item) => item.id !== id));
      return true;
    });
  }

  async empty(): Promise<StoredTrashedBoardImage[]> {
    return this.mutations.run(async () => {
      const records = await this.read();
      await this.write([]);
      return records;
    });
  }

  async purgeExpired(retentionDays: BoardTrashRetentionDays, now = Date.now()): Promise<StoredTrashedBoardImage[]> {
    if (retentionDays === 0) return [];
    return this.mutations.run(async () => {
      const records = await this.read();
      const cutoff = now - retentionDays * 24 * 60 * 60 * 1_000;
      const expired = records.filter((item) => Date.parse(item.deletedAt) <= cutoff);
      if (expired.length === 0) return [];
      await this.write(records.filter((item) => Date.parse(item.deletedAt) > cutoff));
      return expired;
    });
  }

  async referencedAssetPaths(): Promise<Set<string>> {
    await this.mutations.idle();
    const paths = new Set<string>();
    for (const record of await this.read()) {
      paths.add(path.resolve(record.node.imagePath));
      if (record.node.derivation?.sourceImagePath) paths.add(path.resolve(record.node.derivation.sourceImagePath));
      for (const version of record.node.versions ?? []) paths.add(path.resolve(version.imagePath));
    }
    return paths;
  }

  private async read(): Promise<StoredTrashedBoardImage[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as StoredTrashedBoardImage[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => (
        typeof item?.id === "string"
        && typeof item.boardId === "string"
        && typeof item.boardName === "string"
        && typeof item.deletedAt === "string"
        && typeof item.node?.id === "string"
        && typeof item.node.imagePath === "string"
      ));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async write(records: StoredTrashedBoardImage[]): Promise<void> {
    await writeJsonAtomic(this.filePath, records);
  }
}
