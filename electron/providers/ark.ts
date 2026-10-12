import type {
  GenerationResult,
  ProviderConfig,
  ProviderGenerateInput,
  ProviderImageResult,
  ProviderModelOption
} from "../../shared/types.js";
import { ProviderError } from "./errors.js";
import { Semaphore, mapWithConcurrency } from "./concurrency.js";

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_GENERATION_ENDPOINT = "/images/generations";
const networkSemaphore = new Semaphore(4);
/** Ark 图片 API 没有 n 参数；张数通过并行单张请求实现，单次上限与官方生成数量一致。 */
const MAX_IMAGE_COUNT = 4;
const DEFAULT_PIXEL_RANGE = { min: 921_600, max: 16_777_216 };
const MIN_ASPECT_RATIO = 1 / 16;
const MAX_ASPECT_RATIO = 16;

/**
 * 火山方舟 Seedream 图片供应商：
 * - POST {baseUrl}/images/generations（文生图 / 图生图 / 编辑）
 * - GET {baseUrl}/models 通过 endpoint + API Key 拉取模型列表
 */
export class ArkImageProvider {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60 * 1000
  ) {}

  async generate(input: ProviderGenerateInput, config: ProviderConfig, apiKey: string): Promise<GenerationResult> {
    assertApiKey(apiKey);
    if (!input.prompt.trim()) throw new ProviderError("INVALID_REQUEST", "请先输入提示词。");
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }
    if (input.referenceImages.length > 0 && !config.supportsReferenceImages) {
      throw new ProviderError("REFERENCE_UNSUPPORTED", "当前火山方舟配置未声明支持参考图。");
    }
    const model = (input.model || config.model).trim();
    if (!model) throw new ProviderError("INVALID_CONFIG", "请填写火山方舟图片模型。");
    const maxReferences = isSeedreamPro(model) ? 10 : 14;
    if (input.referenceImages.length > maxReferences) {
      throw new ProviderError(
        "TOO_MANY_REFERENCES",
        `模型 ${model} 最多支持 ${maxReferences} 张参考图。`
      );
    }

    const count = Math.max(1, Math.min(MAX_IMAGE_COUNT, Math.trunc(input.n) || 1));
    const settled = await mapWithConcurrency(
      Array.from({ length: count }, (_, index) => index),
      2,
      () => this.generateOne(input, config, apiKey, model)
    );

    const images: ProviderImageResult[] = [];
    let firstError: unknown;
    let hasError = false;
    for (const result of settled) {
      if (result.status === "fulfilled") images.push(result.value);
      else if (!hasError) {
        hasError = true;
        firstError = result.reason;
      }
    }
    if (images.length === 0) throw firstError;
    return images.length < count
      ? { images, warnings: [`请求 ${count} 张，火山方舟模型实际返回 ${images.length} 张。`] }
      : { images };
  }

  async testConnection(config: ProviderConfig, apiKey: string): Promise<void> {
    assertApiKey(apiKey);
    const response = await this.fetchWithTimeout(arkModelListUrl(config.baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` }
    }, 15_000);
    if (!response.ok) await throwArkError(response);
  }

  /** 通过 endpoint + API Key 拉取模型列表；优先保留图片相关模型。 */
  async listModels(config: ProviderConfig, apiKey: string): Promise<ProviderModelOption[]> {
    assertApiKey(apiKey);
    const response = await this.fetchWithTimeout(arkModelListUrl(config.baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` }
    }, 15_000);
    if (!response.ok) await throwArkError(response);

    const payload = (await response.json()) as JsonRecord;
    const all = parseArkModels(payload);
    const imageModels = all.filter(isImageModelOption);
    return imageModels.length > 0 ? imageModels : all;
  }

  private async generateOne(
    input: ProviderGenerateInput,
    config: ProviderConfig,
    apiKey: string,
    model: string
  ): Promise<ProviderImageResult> {
    const body: JsonRecord = {
      model,
      prompt: input.prompt.trim(),
      response_format: "b64_json",
      output_format: input.outputFormat ?? "png"
    };
    if (input.referenceImages.length > 0) {
      body.image = input.referenceImages.map(
        (image) => `data:${image.mimeType};base64,${image.bytes.toString("base64")}`
      );
    }
    const size = normalizeArkSize(input.size, model);
    if (size) body.size = size;
    // 透明背景仅 Seedream 5.0 pro 图生图支持，且输出必须是 png（本 Provider 固定请求 png）。
    if (input.background === "transparent" && isSeedreamPro(model) && input.referenceImages.length > 0) {
      body.background = "transparent";
    }
    // pro 不支持 sequential_image_generation；其余模型默认 disabled（单图模式）。
    if (!isSeedreamPro(model)) body.sequential_image_generation = "disabled";

    const response = await this.fetchWithTimeout(
      joinUrl(config.baseUrl || DEFAULT_BASE_URL, config.generationEndpoint || DEFAULT_GENERATION_ENDPOINT),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    if (!response.ok) await throwArkError(response);

    const payload = (await response.json()) as JsonRecord;
    if (payload.error) {
      throwArkPayloadError(payload.error);
    }
    const item = collectArkImages(payload)[0];
    if (!item) {
      throw new ProviderError("EMPTY_RESPONSE", "火山方舟模型未返回图片，请确认模型 ID 与调用配额。");
    }
    if (item.base64) {
      return { bytes: Buffer.from(item.base64, "base64"), mimeType: "image/png" };
    }
    if (item.url) return this.downloadImage(item.url);
    throw new ProviderError("EMPTY_RESPONSE", "火山方舟模型未返回可下载的图片。");
  }

  private async downloadImage(url: string): Promise<ProviderImageResult> {
    if (url.startsWith("data:")) return decodeDataUrl(url);
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) await throwArkError(response);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") || "image/png"
    };
  }

  private async fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<Response> {
    return networkSemaphore.run(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ProviderError("TIMEOUT", "火山方舟请求超时，请检查网络或稍后重试。");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}

function isSeedreamPro(model: string): boolean {
  return /doubao-seedream-5-0-pro/i.test(model);
}

/** 各 Seedream 档位的输出像素区间；未知模型按最宽的 4.0 口径处理。 */
function pixelRangeFor(model: string): { min: number; max: number } {
  if (/doubao-seedream-5-0-pro/i.test(model)) return { min: 921_600, max: 4_624_220 };
  if (/doubao-seedream-5-0/i.test(model) || /doubao-seedream-4-5/i.test(model)) {
    return { min: 3_686_400, max: 16_777_216 };
  }
  if (/doubao-seedream/i.test(model)) return DEFAULT_PIXEL_RANGE;
  return DEFAULT_PIXEL_RANGE;
}

/**
 * 把 UI 的 WxH 尺寸收敛到 Seedream 允许的像素区间与宽高比区间；
 * "auto" 或无法解析时返回 undefined（交由模型自选）。
 */
export function normalizeArkSize(size: string, model: string): string | undefined {
  const trimmed = size.trim().toLowerCase();
  if (!trimmed || trimmed === "auto") return undefined;
  const match = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(trimmed);
  if (!match) return undefined;
  let width = Number(match[1]);
  let height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;

  const ratio = width / height;
  if (ratio > MAX_ASPECT_RATIO) height = Math.max(1, Math.round(width / MAX_ASPECT_RATIO));
  else if (ratio < MIN_ASPECT_RATIO) width = Math.max(1, Math.round(height * MIN_ASPECT_RATIO));

  const { min, max } = pixelRangeFor(model);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pixels = width * height;
    if (pixels < min) {
      const scale = Math.sqrt(min / pixels);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    } else if (pixels > max) {
      const scale = Math.sqrt(max / pixels);
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
    } else break;
  }
  while (width * height < min) height += 1;
  while (width * height > max && height > 1) height -= 1;
  return `${width}x${height}`;
}

/** 官方 endpoint 为 /api/v3 时直连 /models；其他兼容地址按 OpenAI 惯例推断。 */
export function arkModelListUrl(baseUrl: string): string {
  const trimmedBase = (baseUrl.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  try {
    const url = new URL(trimmedBase);
    if (/\/api\/v3$|\/v1$/.test(url.pathname)) return `${trimmedBase}/models`;
    return `${trimmedBase}/v1/models`;
  } catch {
    return `${trimmedBase}/models`;
  }
}

function isImageModelOption(option: ProviderModelOption): boolean {
  return /seedream|seededit|image/i.test(option.id);
}

function parseArkModels(payload: JsonRecord): ProviderModelOption[] {
  const raw = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : [];
  const seen = new Set<string>();
  const models: ProviderModelOption[] = [];
  for (const item of raw) {
    const id = typeof item === "string"
      ? item.trim()
      : item && typeof item === "object"
        ? String((item as { id?: unknown; model?: unknown }).id ?? (item as { model?: unknown }).model ?? "").trim()
        : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ownedBy = item && typeof item === "object" && typeof (item as { owned_by?: unknown }).owned_by === "string"
      ? (item as { owned_by: string }).owned_by.trim() || undefined
      : undefined;
    models.push({ id, ownedBy });
  }
  return models;
}

interface ArkImageItem {
  url?: string;
  base64?: string;
}

function collectArkImages(payload: JsonRecord): ArkImageItem[] {
  if (!Array.isArray(payload.data)) return [];
  const items: ArkImageItem[] = [];
  for (const entry of payload.data) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as JsonRecord;
    const url = typeof record.url === "string" && record.url ? record.url : undefined;
    const base64 = typeof record.b64_json === "string" && record.b64_json
      ? record.b64_json
      : typeof record.base64 === "string" && record.base64
        ? record.base64
        : undefined;
    if (url || base64) items.push({ url, base64 });
  }
  return items;
}

function assertApiKey(apiKey: string): void {
  if (!apiKey.trim()) throw new ProviderError("AUTH_ERROR", "请先填写火山方舟 API Key。");
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = (baseUrl.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function decodeDataUrl(value: string): ProviderImageResult {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new ProviderError("INVALID_RESPONSE", "火山方舟返回了无效的图片 Data URL。");
  return {
    bytes: Buffer.from(decodeURIComponent(match[3]), match[2] ? "base64" : "utf8"),
    mimeType: match[1] || "image/png"
  };
}

function errorDetail(payload: JsonRecord): { code: string; message: string } {
  const error = payload.error && typeof payload.error === "object" ? payload.error as JsonRecord : payload;
  const code = typeof error.code === "string" ? error.code : typeof payload.code === "string" ? payload.code : "";
  const message = typeof error.message === "string"
    ? error.message
    : typeof payload.message === "string"
      ? payload.message
      : "";
  return { code, message };
}

async function throwArkError(response: Response): Promise<never> {
  const text = await response.text().catch(() => "");
  let code = "";
  let message = text || response.statusText || `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text) as JsonRecord;
    const detail = errorDetail(parsed);
    code = detail.code;
    if (detail.message) message = detail.message;
  } catch {
    // 非 JSON 错误体保留原始文本。
  }
  throwArkFailure(response.status, code, message);
}

function throwArkPayloadError(error: unknown): never {
  const detail = errorDetail({ error });
  throwArkFailure(undefined, detail.code, detail.message || detail.code || "火山方舟调用失败。");
}

function throwArkFailure(status: number | undefined, code: string, message: string): never {
  const haystack = `${code} ${message}`;
  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid.*api|apikey.*invalid/i.test(haystack)) {
    throw new ProviderError("AUTH_ERROR", "火山方舟 API Key 无效或无该模型权限，请检查配置。", status);
  }
  if (/arrearage|insufficient|balance/i.test(haystack)) {
    throw new ProviderError("INSUFFICIENT_BALANCE", "火山方舟账户余额不足，请充值后重试。", status);
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", message, status);
  }
  throw new ProviderError(code || "ARK_API_ERROR", message, status);
}
