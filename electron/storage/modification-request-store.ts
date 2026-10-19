import { readFile } from "node:fs/promises";
import path from "node:path";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";
import type { ModificationRequest } from "../../shared/modification-requests.js";

/** Single main-process owner; claims and writes share the same durable mutation queue. */
export class ModificationRequestStore {
  private readonly mutations = new MutationQueue();
  private readonly file: string;
  constructor(dataDir: string) { this.file = path.join(dataDir,"modification-requests.json"); }
  private async read(): Promise<ModificationRequest[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.file,"utf8"));
      if (!Array.isArray(value)) throw new Error("修改请求文件格式无效。");
      return value as ModificationRequest[];
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async list(boardId?: string): Promise<ModificationRequest[]> {
    await this.mutations.idle();
    return (await this.read()).filter(item => !boardId || item.boardId === boardId);
  }
  async get(id: string): Promise<ModificationRequest> {
    const item = (await this.list()).find(item => item.id === id);
    if (!item) throw new Error("修改请求不存在。");
    return item;
  }
  async add(item: ModificationRequest): Promise<ModificationRequest> {
    return this.mutations.run(async () => {
      const items = await this.read();
      if (items.some(entry => entry.id === item.id)) throw new Error("修改请求已存在。");
      await writeJsonAtomic(this.file,[item,...items]); return item;
    });
  }
  async update(id: string, mutate: (current: ModificationRequest) => Promise<ModificationRequest> | ModificationRequest): Promise<ModificationRequest> {
    return this.mutations.run(async () => {
      const items = await this.read(), index = items.findIndex(item => item.id === id);
      if (index < 0) throw new Error("修改请求不存在。");
      const next = await mutate(items[index]);
      items[index] = { ...next, updatedAt: new Date().toISOString() };
      await writeJsonAtomic(this.file,items); return items[index];
    });
  }
}
