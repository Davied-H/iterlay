import { readFile, rename } from "node:fs/promises";
import path from "node:path";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";
import type { VideoSequenceTemplate } from "../video-sequence-types.js";

interface TemplateDatabase { version: 1; templates: VideoSequenceTemplate[] }

export class VideoSequenceTemplateStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: TemplateDatabase | null = null;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "video-sequence-templates", "index.json");
  }

  async list(): Promise<VideoSequenceTemplate[]> {
    await this.mutations.idle();
    return structuredClone((await this.read()).templates);
  }

  async create(input: Omit<VideoSequenceTemplate, "schemaVersion" | "id" | "version" | "createdAt" | "updatedAt">): Promise<VideoSequenceTemplate> {
    return this.mutations.run(async () => {
      validateTemplate(input);
      const db = await this.read();
      const now = new Date().toISOString();
      const template: VideoSequenceTemplate = { ...structuredClone(input), schemaVersion: 1, id: crypto.randomUUID(), version: 1, createdAt: now, updatedAt: now };
      db.templates.push(template);
      await this.write(db);
      return structuredClone(template);
    });
  }

  async update(template: VideoSequenceTemplate, expectedVersion: number): Promise<VideoSequenceTemplate> {
    return this.mutations.run(async () => {
      validateTemplate(template);
      const db = await this.read();
      const index = db.templates.findIndex((item) => item.id === template.id);
      if (index < 0) throw new Error("视频序列模板不存在。");
      if (db.templates[index].version !== expectedVersion) throw Object.assign(new Error("模板已被更新。"), { code: "REVISION_CONFLICT" });
      const next = { ...structuredClone(template), version: expectedVersion + 1, updatedAt: new Date().toISOString() };
      db.templates[index] = next;
      await this.write(db);
      return structuredClone(next);
    });
  }

  async delete(id: string, expectedVersion: number): Promise<void> {
    await this.mutations.run(async () => {
      const db = await this.read();
      const target = db.templates.find((item) => item.id === id);
      if (!target) throw new Error("视频序列模板不存在。");
      if (target.version !== expectedVersion) throw Object.assign(new Error("模板已被更新。"), { code: "REVISION_CONFLICT" });
      db.templates = db.templates.filter((item) => item.id !== id);
      await this.write(db);
    });
  }

  async import(template: VideoSequenceTemplate): Promise<VideoSequenceTemplate> {
    validateTemplate(template);
    return this.create({ ...template, name: template.name, description: template.description, defaults: template.defaults, slots: template.slots, segments: template.segments });
  }

  private async read(): Promise<TemplateDatabase> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<TemplateDatabase>;
      this.cache = { version: 1, templates: Array.isArray(parsed.templates) ? parsed.templates.filter(isTemplate) : [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const corrupt = `${this.filePath}.corrupt-${Date.now()}`;
        await rename(this.filePath, corrupt).catch(() => undefined);
        throw new Error(`视频序列模板库已损坏，原文件已保留：${corrupt}`);
      }
      this.cache = { version: 1, templates: [] };
    }
    return this.cache;
  }

  private async write(db: TemplateDatabase): Promise<void> {
    await writeJsonAtomic(this.filePath, db);
    this.cache = db;
  }
}

function validateTemplate(value: Pick<VideoSequenceTemplate, "name" | "slots" | "segments">): void {
  if (!value.name.trim()) throw new Error("模板名称不能为空。");
  if (value.slots.length < 3 || value.slots.length > 10) throw new Error("模板需要 3 至 10 个关键帧槽位。");
  const ids = new Set(value.slots.map((slot) => slot.id));
  if (ids.size !== value.slots.length) throw new Error("模板槽位 ID 不能重复。");
  if (value.segments.length !== value.slots.length - 1 || value.segments.some((segment) => !ids.has(segment.fromSlotId) || !ids.has(segment.toSlotId))) {
    throw new Error("模板片段邻接关系无效。");
  }
}

function isTemplate(value: unknown): value is VideoSequenceTemplate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VideoSequenceTemplate>;
  return item.schemaVersion === 1 && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.slots) && Array.isArray(item.segments);
}
