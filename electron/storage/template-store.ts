import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { SceneTemplateData } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

const categories = ["marketing", "product", "social", "illustration", "portrait", "brand", "concept", "editing", "other"];
const useCases = ["photorealistic-natural", "product-mockup", "ui-mockup", "infographic-diagram", "logo-brand", "illustration-story", "stylized-concept", "historical-scene", "ads-marketing", "other", "text-localization", "identity-preserve", "precise-object-edit", "lighting-weather", "background-extraction", "style-transfer", "compositing", "sketch-to-render"];
function validate(value: SceneTemplateData): SceneTemplateData {
  if (!value || typeof value !== "object" || ![value.id, value.name, value.prompt].every(v => typeof v === "string" && v.trim() && v.length <= 100_000)
    || typeof value.description !== "string" || !categories.includes(value.category) || !["generate", "edit"].includes(value.mode)
    || !useCases.includes(value.useCase) || value.source !== "custom") throw new Error("模板字段无效：需要名称、规则、有效分类和创作模式。");
  if (value.fields !== undefined && (!Array.isArray(value.fields) || value.fields.some(f => !f || ![f.id, f.label, f.value].every(v => typeof v === "string")))) throw new Error("模板 fields 无效。");
  if (value.extractionScenario !== undefined && !["design-language", "layout-skeleton", "series-template", "replica"].includes(value.extractionScenario)) throw new Error("模板提取场景无效。");
  return value;
}
export class TemplateStore {
  private queue = new MutationQueue();
  constructor(private file: string) {}
  private async read(): Promise<SceneTemplateData[]> {
    try {
      const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (!Array.isArray(data)) throw new Error("模板库格式无效。");
      return data.map(validate);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async list(): Promise<SceneTemplateData[]> { await this.queue.idle(); return this.read(); }
  async get(id: string): Promise<SceneTemplateData> {
    const template = (await this.list()).find(t => t.id === id);
    if (!template) throw new Error("模板不存在。");
    return template;
  }
  create(input: Partial<SceneTemplateData>): Promise<SceneTemplateData> {
    return this.queue.run(async () => {
      const template = validate({ description: "", category: "other", mode: "generate", useCase: "other", ...input,
        id: `custom:${randomUUID()}`, source: "custom", createdAt: new Date().toISOString() } as SceneTemplateData);
      await writeJsonAtomic(this.file, [template, ...await this.read()]);
      return template;
    });
  }
  update(id: string, patch: Partial<SceneTemplateData>, expectedPrompt?: string): Promise<SceneTemplateData> {
    return this.queue.run(async () => {
      const templates = await this.read(); const current = templates.find(t => t.id === id);
      if (!current) throw new Error("模板不存在。");
      if (expectedPrompt !== undefined && current.prompt !== expectedPrompt) throw new Error("模板已更新，请重新读取后修改。");
      const next = validate({ ...current, ...patch, id: current.id, source: "custom", createdAt: current.createdAt });
      // Structured fields must never describe the previous prompt after a CLI edit.
      if (patch.prompt !== undefined && patch.fields === undefined) delete next.fields;
      await writeJsonAtomic(this.file, templates.map(t => t.id === id ? next : t)); return next;
    });
  }
  /** Merge only renderer changes; reject stale writes rather than overwrite CLI edits. */
  sync(previous: SceneTemplateData[], next: SceneTemplateData[], migrate = false): Promise<SceneTemplateData[]> {
    return this.queue.run(async () => {
      if (!Array.isArray(previous) || !Array.isArray(next)) throw new Error("模板同步参数无效。");
      previous.forEach(validate); next.forEach(validate);
      const stored = await this.read(); const result = new Map(stored.map(t => [t.id, t]));
      for (const id of new Set([...previous, ...next].map(t => t.id))) {
        const before = previous.find(t => t.id === id), after = next.find(t => t.id === id), current = result.get(id);
        if (migrate) { if (!current && after) result.set(id, after); continue; }
        if (JSON.stringify(before) === JSON.stringify(after) || JSON.stringify(current) === JSON.stringify(after)) continue;
        if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error("模板已在其他位置更新，请刷新模板库后重试。");
        if (after) result.set(id, after); else result.delete(id);
      }
      const values = [...result.values()]; await writeJsonAtomic(this.file, values); return values;
    });
  }
}
