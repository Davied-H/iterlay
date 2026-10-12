import type {
  FalModelCategory,
  FalModelOption,
  FalModelPrice,
  GenerationResult,
  ProviderConfig,
  ProviderGenerateInput
} from "../../shared/types.js";
import { createHash } from "node:crypto";
import { ProviderError } from "./errors.js";

type FetchLike = typeof fetch;

interface FalQueueResponse {
  request_id?: string;
  status?: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
  error?: string;
  error_type?: string;
}

interface FalImageItem {
  url?: string;
  content_type?: string;
  data?: string;
}

const FAL_RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;
const FAL_MODELS_URL = "https://api.fal.ai/v1/models";
const FAL_PRICING_URL = "https://api.fal.ai/v1/models/pricing";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_MODEL_CACHE_ENTRIES = 50;
const MAX_PRICE_CACHE_ENTRIES = 500;

/** fal.ai 原生队列适配器。模型输入差异通过 ProviderConfig 中的 fal* 字段控制。 */
export class FalImageProvider {
  private readonly modelCache = new Map<string, { expiresAt: number; models: FalModelOption[] }>();
  private readonly priceCache = new Map<string, { expiresAt: number; price: FalModelPrice | null }>();

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60 * 1000,
    private readonly pollIntervalMs = 1000
  ) {}

  async generate(input: ProviderGenerateInput, config: ProviderConfig, apiKey: string): Promise<GenerationResult> {
    assertApiKey(apiKey);
    if (input.referenceImages.length > 0 && !config.supportsReferenceImages) {
      throw new ProviderError("REFERENCE_UNSUPPORTED", "当前 fal.ai Provider 未声明支持参考图。");
    }
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }

    const usesReferences = input.referenceImages.length > 0;
    const model = normalizeModelId(usesReferences ? config.referenceModel || config.model : config.model);
    const endpoint = joinFalUrl(config.baseUrl, model);
    const deadline = Date.now() + this.timeoutMs;
    const submitResponse = await this.fetchWithDeadline(
      endpoint,
      {
        method: "POST",
        headers: falHeaders(apiKey, true),
        body: JSON.stringify(buildFalInput(input, config))
      },
      deadline
    );
    if (!submitResponse.ok) await throwFalError(submitResponse);

    const submitted = (await submitResponse.json()) as FalQueueResponse & Record<string, unknown>;
    // 自定义 fal app 可能直接返回结果；标准 queue 响应则进入轮询。
    if (getFalImageItems(submitted).length > 0) {
      return this.downloadResult(submitted, input, config, deadline);
    }
    if (!submitted.request_id) {
      throw new ProviderError("INVALID_RESPONSE", "fal.ai 未返回 request_id。请检查模型 ID 与接口地址。");
    }

    const statusUrl = submitted.status_url || `${endpoint}/requests/${encodeURIComponent(submitted.request_id)}/status`;
    const resultUrl = submitted.response_url || `${endpoint}/requests/${encodeURIComponent(submitted.request_id)}`;
    while (true) {
      if (Date.now() >= deadline) {
        await this.cancelQuietly(submitted.cancel_url, apiKey);
        throw new ProviderError("TIMEOUT", "fal.ai 图片生成超时，已停止等待该队列任务。");
      }

      const statusResponse = await this.fetchWithDeadline(
        statusUrl,
        { headers: falHeaders(apiKey) },
        deadline
      );
      if (!statusResponse.ok) await throwFalError(statusResponse);
      const status = (await statusResponse.json()) as FalQueueResponse;
      if (status.status === "COMPLETED") {
        if (status.error) {
          throw new ProviderError(
            status.error_type || "FAL_GENERATION_FAILED",
            normalizeFalErrorMessage(status.error)
          );
        }
        break;
      }
      if (status.error) {
        throw new ProviderError(
          status.error_type || "FAL_GENERATION_FAILED",
          normalizeFalErrorMessage(status.error)
        );
      }
      if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
        throw new ProviderError("INVALID_RESPONSE", `fal.ai 返回了未知任务状态：${status.status || "空"}`);
      }
      await delay(this.pollIntervalMs);
    }

    const resultResponse = await this.fetchWithDeadline(resultUrl, { headers: falHeaders(apiKey) }, deadline);
    if (!resultResponse.ok) await throwFalError(resultResponse);
    const payload = (await resultResponse.json()) as Record<string, unknown>;
    return this.downloadResult(payload, input, config, deadline);
  }

  async testConnection(config: ProviderConfig, apiKey: string): Promise<void> {
    assertApiKey(apiKey);
    const model = normalizeModelId(config.model);
    // 查询一个必然不存在的任务即可验证 Key；404/422 表示鉴权已通过，且不会触发生图计费。
    const url = `${joinFalUrl(config.baseUrl, model)}/requests/iterlay-connection-test/status`;
    const response = await this.fetchWithDeadline(url, { headers: falHeaders(apiKey) }, Date.now() + 15_000);
    if (response.status === 401 || response.status === 403 || response.status >= 500) {
      await throwFalError(response);
    }
  }

  async listModels(category: FalModelCategory, query = "", apiKey = ""): Promise<FalModelOption[]> {
    pruneCache(this.modelCache, MAX_MODEL_CACHE_ENTRIES);
    pruneCache(this.priceCache, MAX_PRICE_CACHE_ENTRIES);
    const normalizedQuery = query.trim().slice(0, 100);
    const cacheKey = `${category}:${normalizedQuery.toLocaleLowerCase()}`;
    const cached = this.modelCache.get(cacheKey);
    let models: FalModelOption[];
    if (cached && cached.expiresAt > Date.now()) {
      this.modelCache.delete(cacheKey);
      this.modelCache.set(cacheKey, cached);
      models = cached.models;
    } else {
      const url = new URL(FAL_MODELS_URL);
      url.searchParams.set("category", category);
      url.searchParams.set("status", "active");
      url.searchParams.set("limit", "50");
      if (normalizedQuery) url.searchParams.set("q", normalizedQuery);
      const response = await this.fetchWithDeadline(url.toString(), {}, Date.now() + 15_000);
      if (!response.ok) await throwFalError(response);
      const payload = (await response.json()) as Record<string, unknown>;
      models = parseFalModels(payload, category);
      this.modelCache.set(cacheKey, { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, models });
      pruneCache(this.modelCache, MAX_MODEL_CACHE_ENTRIES);
    }

    if (!apiKey.trim() || models.length === 0) return cloneFalModels(models);
    try {
      return await this.attachPrices(models, apiKey.trim());
    } catch {
      // 价格接口需要有效 Key；报价失败不影响模型目录与选择。
      return cloneFalModels(models);
    }
  }

  private async attachPrices(models: FalModelOption[], apiKey: string): Promise<FalModelOption[]> {
    const fingerprint = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
    const now = Date.now();
    const missing = models
      .map((model) => model.endpointId)
      .filter((endpointId) => {
        const cached = this.priceCache.get(`${fingerprint}:${endpointId}`);
        return !cached || cached.expiresAt <= now;
      });

    if (missing.length > 0) {
      const url = new URL(FAL_PRICING_URL);
      missing.slice(0, 50).forEach((endpointId) => url.searchParams.append("endpoint_id", endpointId));
      const response = await this.fetchWithDeadline(
        url.toString(),
        { headers: falHeaders(apiKey) },
        Date.now() + 15_000
      );
      if (!response.ok) await throwFalError(response);
      const prices = parseFalPrices((await response.json()) as Record<string, unknown>);
      for (const endpointId of missing) {
        this.priceCache.set(`${fingerprint}:${endpointId}`, {
          expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
          price: prices.get(endpointId) ?? null
        });
      }
      pruneCache(this.priceCache, MAX_PRICE_CACHE_ENTRIES);
    }

    return models.map((model) => {
      const price = this.priceCache.get(`${fingerprint}:${model.endpointId}`)?.price;
      return { ...model, tags: model.tags ? [...model.tags] : undefined, price: price ? { ...price } : undefined };
    });
  }

  private async downloadResult(
    payload: Record<string, unknown>,
    input: ProviderGenerateInput,
    config: ProviderConfig,
    deadline: number
  ): Promise<GenerationResult> {
    const items = getFalImageItems(payload);
    if (items.length === 0) {
      throw new ProviderError("EMPTY_RESPONSE", "fal.ai 模型未返回图片。请确认该模型是图片生成模型。");
    }

    const images = await Promise.all(
      items.map(async (item) => {
        if (item.url?.startsWith("data:")) return decodeDataUrl(item.url);
        if (item.data) {
          return {
            bytes: Buffer.from(item.data, "base64"),
            mimeType: item.content_type || "image/png"
          };
        }
        if (!item.url) {
          throw new ProviderError("INVALID_RESPONSE", "fal.ai 返回了无法识别的图片格式。");
        }
        const response = await this.fetchWithDeadline(item.url, {}, deadline);
        if (!response.ok) await throwFalError(response);
        return {
          bytes: Buffer.from(await response.arrayBuffer()),
          mimeType: response.headers.get("content-type") || item.content_type || "image/png"
        };
      })
    );

    const warnings: string[] = [];
    if (images.length < Math.max(1, input.n)) {
      warnings.push(`请求 ${Math.max(1, input.n)} 张，fal.ai 模型实际返回 ${images.length} 张。`);
    }
    if (config.falReferenceInput === "image_url" && input.referenceImages.length > 1) {
      warnings.push("当前 fal.ai 参考图参数配置为 image_url，仅发送了第一张参考图。");
    }
    return warnings.length > 0 ? { images, warnings } : { images };
  }

  private async fetchWithDeadline(input: string, init: RequestInit, deadline: number): Promise<Response> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderError("TIMEOUT", "fal.ai 请求超时，请稍后重试。");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(30_000, remaining));
    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("TIMEOUT", "fal.ai 请求超时，请检查网络后重试。");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async cancelQuietly(cancelUrl: string | undefined, apiKey: string): Promise<void> {
    if (!cancelUrl) return;
    try {
      await this.fetchImpl(cancelUrl, { method: "PUT", headers: falHeaders(apiKey) });
    } catch {
      // 超时后的取消是 best-effort，不覆盖原始超时错误。
    }
  }
}

function pruneCache<T>(cache: Map<string, { expiresAt: number } & T>, maximum: number): void {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function buildFalInput(input: ProviderGenerateInput, config: ProviderConfig): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    num_images: Math.min(4, Math.max(1, input.n)),
    output_format: "png"
  };
  const size = parseSize(input.size);
  const sizeMode = config.falSizeMode || "image_size";
  if (size) {
    if (sizeMode === "image_size") {
      body.image_size = { width: size.width, height: size.height };
    } else {
      body.aspect_ratio = nearestFalRatio(size.width, size.height);
      if (sizeMode === "aspect_ratio_and_resolution") body.resolution = falResolution(size.width, size.height);
    }
  }

  if (input.referenceImages.length > 0) {
    const urls = input.referenceImages.map(
      (image) => `data:${image.mimeType};base64,${image.bytes.toString("base64")}`
    );
    if (config.falReferenceInput === "image_url") body.image_url = urls[0];
    else body.image_urls = urls;
  }
  return body;
}

function parseSize(value: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function nearestFalRatio(width: number, height: number): string {
  const target = width / height;
  return FAL_RATIOS.reduce((best, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split(":").map(Number);
    const [bestWidth, bestHeight] = best.split(":").map(Number);
    return Math.abs(Math.log(candidateWidth / candidateHeight / target)) <
      Math.abs(Math.log(bestWidth / bestHeight / target))
      ? candidate
      : best;
  });
}

function falResolution(width: number, height: number): "1K" | "2K" | "4K" {
  const edge = Math.max(width, height);
  if (edge > 2560) return "4K";
  if (edge > 1280) return "2K";
  return "1K";
}

function getFalImageItems(payload: Record<string, unknown>): FalImageItem[] {
  const candidates = [
    payload,
    isRecord(payload.data) ? payload.data : null,
    isRecord(payload.output) ? payload.output : null
  ].filter((value): value is Record<string, unknown> => Boolean(value));
  for (const candidate of candidates) {
    if (Array.isArray(candidate.images)) {
      return candidate.images.map(toFalImageItem).filter((item): item is FalImageItem => Boolean(item));
    }
    const single = toFalImageItem(candidate.image);
    if (single) return [single];
  }
  return [];
}

function parseFalModels(payload: Record<string, unknown>, category: FalModelCategory): FalModelOption[] {
  if (!Array.isArray(payload.models)) {
    throw new ProviderError("INVALID_RESPONSE", "fal.ai 模型目录返回格式无效。");
  }
  const seen = new Set<string>();
  const models: FalModelOption[] = [];
  for (const item of payload.models) {
    if (!isRecord(item) || typeof item.endpoint_id !== "string" || seen.has(item.endpoint_id)) continue;
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const itemCategory = toFalModelCategory(metadata.category);
    if (!itemCategory) continue;
    if (itemCategory !== category) continue;
    seen.add(item.endpoint_id);
    models.push({
      endpointId: item.endpoint_id,
      displayName:
        typeof metadata.display_name === "string" && metadata.display_name.trim()
          ? metadata.display_name.trim()
          : item.endpoint_id,
      category: itemCategory,
      description: typeof metadata.description === "string" ? metadata.description.trim() : undefined,
      tags: Array.isArray(metadata.tags)
        ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined
    });
  }
  return models;
}

function toFalModelCategory(value: unknown): FalModelCategory | null {
  if (
    value === "text-to-image"
    || value === "image-to-image"
    || value === "text-to-video"
    || value === "image-to-video"
  ) return value;
  return null;
}

function parseFalPrices(payload: Record<string, unknown>): Map<string, FalModelPrice> {
  if (!Array.isArray(payload.prices)) {
    throw new ProviderError("INVALID_RESPONSE", "fal.ai 价格目录返回格式无效。");
  }
  const prices = new Map<string, FalModelPrice>();
  for (const item of payload.prices) {
    if (
      !isRecord(item) ||
      typeof item.endpoint_id !== "string" ||
      typeof item.unit_price !== "number" ||
      typeof item.unit !== "string" ||
      typeof item.currency !== "string"
    ) {
      continue;
    }
    prices.set(item.endpoint_id, {
      unitPrice: item.unit_price,
      unit: item.unit,
      currency: item.currency.toUpperCase()
    });
  }
  return prices;
}

function cloneFalModels(models: FalModelOption[]): FalModelOption[] {
  return models.map((model) => ({
    ...model,
    tags: model.tags ? [...model.tags] : undefined,
    price: model.price ? { ...model.price } : undefined
  }));
}

function toFalImageItem(value: unknown): FalImageItem | null {
  if (typeof value === "string") return { url: value };
  if (!isRecord(value)) return null;
  return {
    url: typeof value.url === "string" ? value.url : undefined,
    content_type: typeof value.content_type === "string" ? value.content_type : undefined,
    data: typeof value.data === "string" ? value.data : undefined
  };
}

function decodeDataUrl(value: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new ProviderError("INVALID_RESPONSE", "fal.ai 返回了无效的图片 Data URL。");
  return {
    bytes: Buffer.from(decodeURIComponent(match[3]), match[2] ? "base64" : "utf8"),
    mimeType: match[1] || "image/png"
  };
}

function normalizeModelId(value: string): string {
  const model = value.trim().replace(/^\/+|\/+$/g, "");
  if (!model) throw new ProviderError("INVALID_CONFIG", "请填写 fal.ai 模型 ID。");
  return model;
}

function joinFalUrl(baseUrl: string, model: string): string {
  const base = (baseUrl.trim() || "https://queue.fal.run").replace(/\/+$/, "");
  return `${base}/${model}`;
}

function falHeaders(apiKey: string, json = false): Record<string, string> {
  return {
    Authorization: `Key ${apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

function assertApiKey(apiKey: string): void {
  if (!apiKey.trim()) throw new ProviderError("AUTH_ERROR", "请先填写 fal.ai API Key。");
}

async function throwFalError(response: Response): Promise<never> {
  let message = `fal.ai 请求失败（HTTP ${response.status}）。`;
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const detail = payload.detail;
    if (typeof payload.error === "string") message = payload.error;
    else if (typeof payload.message === "string") message = payload.message;
    else if (typeof detail === "string") message = detail;
    else if (isRecord(payload.error) && typeof payload.error.message === "string") message = payload.error.message;
    else if (Array.isArray(detail)) {
      const issues = detail
        .map((item) => (isRecord(item) && typeof item.msg === "string" ? item.msg : ""))
        .filter(Boolean);
      if (issues.length > 0) message = issues.join("；");
    }
  } catch {
    // 非 JSON 错误体保留 HTTP 状态提示。
  }
  const code = response.status === 401 || response.status === 403 ? "AUTH_ERROR" : "FAL_API_ERROR";
  throw new ProviderError(code, normalizeFalErrorMessage(message), response.status);
}

function normalizeFalErrorMessage(message: string): string {
  if (/exhausted balance|user is locked[\s\S]*balance/i.test(message)) {
    return "fal.ai 账户余额不足，请前往 https://fal.ai/dashboard/billing 充值后重试。";
  }
  if (/invalid (?:credentials|api key)|unauthori[sz]ed/i.test(message)) {
    return "fal.ai API Key 无效或无权访问，请检查后重试。";
  }
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
