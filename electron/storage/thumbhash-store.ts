import { readFile } from "node:fs/promises";
import path from "node:path";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

/** 单张素材的 ThumbHash 记录：hash 为 base64，width/height 为源图原始尺寸。 */
export interface ThumbHashEntry {
  imagePath: string;
  hash: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

interface ThumbHashFile {
  /** 编码算法/参数版本；将来升级算法时 bump 并按 v 失效旧条目。 */
  v: 1;
  entries: ThumbHashEntry[];
}

/**
 * ThumbHash 落盘存储：按 imagePath 索引的单 JSON 文件。
 * 素材文件按约定不可变（生成/上传/切图都是新文件名），故无需 mtime 失效逻辑。
 * 带内存缓存：素材库每页分页都要整表查询，不能每次重读磁盘。
 */
export class ThumbHashStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: Map<string, ThumbHashEntry> | null = null;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "thumbhash.json");
  }

  async getMap(): Promise<ReadonlyMap<string, ThumbHashEntry>> {
    await this.mutations.idle();
    return this.load();
  }

  async get(imagePath: string): Promise<ThumbHashEntry | undefined> {
    return (await this.getMap()).get(imagePath);
  }

  async put(entry: ThumbHashEntry): Promise<void> {
    await this.putMany([entry]);
  }

  /** 批量写入（同 imagePath 覆盖），一批一次原子落盘。 */
  async putMany(entries: ThumbHashEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.mutations.run(async () => {
      const map = await this.load();
      for (const entry of entries) map.set(entry.imagePath, entry);
      await writeJsonAtomic(this.filePath, {
        v: 1,
        entries: [...map.values()]
      } satisfies ThumbHashFile);
    });
  }

  private async load(): Promise<Map<string, ThumbHashEntry>> {
    if (this.cache) return this.cache;
    let entries: ThumbHashEntry[] = [];
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as ThumbHashFile;
      if (Array.isArray(parsed?.entries)) entries = parsed.entries;
    } catch {
      // 文件不存在或损坏：这是纯缓存数据，直接从空表重建即可。
    }
    this.cache = new Map(
      entries
        .filter((entry) => entry && typeof entry.imagePath === "string" && typeof entry.hash === "string")
        .map((entry) => [entry.imagePath, entry])
    );
    return this.cache;
  }
}
