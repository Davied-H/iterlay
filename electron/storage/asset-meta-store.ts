import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AssetTagInfo } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

/** 素材收藏与标签的落盘存储：按图片文件 imagePath 归属，与评论/历史平级的一个 JSON 文件。 */
export class AssetMetaStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: AssetTagInfo[] | null = null;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, "asset-meta.json");
  }

  async get(imagePath: string): Promise<AssetTagInfo> {
    await this.mutations.idle();
    const all = await this.read();
    return all.find((item) => item.imagePath === imagePath) ?? { imagePath, favorite: false, tags: [] };
  }

  async list(): Promise<AssetTagInfo[]> {
    await this.mutations.idle();
    return this.read();
  }

  async toggleFavorite(imagePath: string): Promise<AssetTagInfo> {
    return this.mutations.run(async () => {
      const all = await this.read();
      const existing = all.find((item) => item.imagePath === imagePath);
      if (existing) existing.favorite = !existing.favorite;
      else all.push({ imagePath, favorite: true, tags: [] });
      await this.write(all);
      return all.find((item) => item.imagePath === imagePath)!;
    });
  }

  async setTags(imagePath: string, tags: string[]): Promise<AssetTagInfo> {
    return this.mutations.run(async () => {
      const cleaned = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
      const all = await this.read();
      const existing = all.find((item) => item.imagePath === imagePath);
      if (existing) existing.tags = cleaned;
      else all.push({ imagePath, favorite: false, tags: cleaned });
      await this.write(all);
      return all.find((item) => item.imagePath === imagePath)!;
    });
  }

  /** 导入画板包时批量落库收藏/标签：按 imagePath 合并（收藏取或、标签取并集），不覆盖本地已有。 */
  async importMany(infos: AssetTagInfo[]): Promise<void> {
    if (infos.length === 0) return;
    await this.mutations.run(async () => {
      const all = await this.read();
      for (const info of infos) {
        const cleanedTags = [...new Set((info.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
        const existing = all.find((item) => item.imagePath === info.imagePath);
        if (existing) {
          existing.favorite = existing.favorite || Boolean(info.favorite);
          existing.tags = [...new Set([...existing.tags, ...cleanedTags])];
        } else {
          all.push({ imagePath: info.imagePath, favorite: Boolean(info.favorite), tags: cleanedTags });
        }
      }
      await this.write(all);
    });
  }

  private async read(): Promise<AssetTagInfo[]> {
    if (this.cache) return structuredClone(this.cache);
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as AssetTagInfo[];
      this.cache = Array.isArray(parsed) ? parsed : [];
      return structuredClone(this.cache);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async write(entries: AssetTagInfo[]): Promise<void> {
    await writeJsonAtomic(this.filePath, entries);
    this.cache = structuredClone(entries);
  }
}
