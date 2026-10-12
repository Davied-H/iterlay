import type { InspirationSource } from "../shared/inspiration-sources.js";

type FetchLike = typeof fetch;

export class ManagerInspirationClient {
  private readonly baseUrl: string;
  private cached: { expiresAt: number; sources: InspirationSource[] } | undefined;

  constructor(apiBaseUrl: string, private readonly fetchImpl: FetchLike = fetch) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async list(force = false): Promise<InspirationSource[]> {
    if (!force && this.cached && this.cached.expiresAt > Date.now()) return this.cached.sources.map((source) => ({ ...source }));
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/inspiration-sources`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new Error("暂时无法读取灵感来源，请检查网络后重试。", { cause: error });
    }
    if (!response.ok) throw new Error(`灵感来源请求失败 (${response.status})。`);
    const value = await response.json().catch(() => undefined);
    if (!Array.isArray(value) || !value.every(isInspirationSource)) throw new Error("Manager 返回了无效的灵感来源。");
    const sources = value.filter((source) => source.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
    this.cached = { sources, expiresAt: Date.now() + 60_000 };
    return sources.map((source) => ({ ...source }));
  }

  async urlFor(id: string): Promise<string> {
    const source = (await this.list(true)).find((item) => item.id === id);
    if (!source) throw new Error("该灵感来源已下线或不可用。");
    return source.url;
  }
}

function isInspirationSource(value: unknown): value is InspirationSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<InspirationSource>;
  return typeof source.id === "string" && typeof source.name === "string" && typeof source.category === "string" &&
    typeof source.description === "string" && typeof source.enabled === "boolean" && Number.isInteger(source.sortOrder) &&
    typeof source.url === "string" && /^https:\/\//i.test(source.url) &&
    (source.iconUrl === undefined || source.iconUrl === "" || (typeof source.iconUrl === "string" && /^https:\/\//i.test(source.iconUrl)));
}
