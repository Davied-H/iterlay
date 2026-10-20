import sources from "../shared/inspiration-sources.json" with { type: "json" };
import type { InspirationSource } from "../shared/inspiration-sources.js";

/** Bundled catalogue copied from the deployed NAS service; never contacts Manager. */
export class LocalInspirationClient {
  async list(): Promise<InspirationSource[]> {
    return sources.filter((source) => source.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((source) => ({ ...source }));
  }

  async urlFor(id: string): Promise<string> {
    const source = (await this.list()).find((item) => item.id === id);
    if (!source) throw new Error("该灵感来源不存在或已停用。");
    return source.url;
  }
}
