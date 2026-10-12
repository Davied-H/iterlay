import type {
  GenerationResult,
  ProviderConfig,
  ProviderGenerateInput
} from "../../shared/types.js";
import { ProviderError } from "./errors.js";
import { Semaphore } from "./concurrency.js";
import { Sub2ApiImageProvider } from "./sub2api.js";

type FetchLike = typeof fetch;

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com";
const DEFAULT_GENERATION_ENDPOINT = "/api/v1/services/aigc/multimodal-generation/generation";
const networkSemaphore = new Semaphore(4);

export class BailianImageProvider {
  private readonly compatibleProvider: Sub2ApiImageProvider;

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60 * 1000
  ) {
    this.compatibleProvider = new Sub2ApiImageProvider(fetchImpl, timeoutMs);
  }

  async generate(input: ProviderGenerateInput, config: ProviderConfig, apiKey: string): Promise<GenerationResult> {
    assertApiKey(apiKey);
    if (!input.prompt.trim()) throw new ProviderError("INVALID_REQUEST", "请先输入提示词。");
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }
    if (input.referenceImages.length > 0 && !config.supportsReferenceImages) {
      throw new ProviderError("REFERENCE_UNSUPPORTED", "当前百炼配置未声明支持参考图。");
    }

    const model = (input.model || config.model).trim();
    if (!model) throw new ProviderError("INVALID_CONFIG", "请填写百炼图片模型。");
    const maxReferences = model.startsWith("wan2.7-image") ? 9 : 3;
    if (input.referenceImages.length > maxReferences) {
      throw new ProviderError(
        "TOO_MANY_REFERENCES",
        `模型 ${model} 最多支持 ${maxReferences} 张参考图。`
      );
    }

    const response = await this.fetchWithTimeout(
      joinUrl(config.baseUrl || DEFAULT_BASE_URL, config.generationEndpoint || DEFAULT_GENERATION_ENDPOINT),
      {
        method: "POST",
        headers: bailianHeaders(apiKey),
        body: JSON.stringify(buildBailianBody(input, model))
      }
    );
    if (!response.ok) await throwBailianError(response);

    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload.code === "string" && payload.code) {
      throwBailianPayloadError(payload.code, payload.message);
    }
    const imageUrls = getBailianImageUrls(payload);
    if (imageUrls.length === 0) {
      throw new ProviderError("EMPTY_RESPONSE", "百炼模型未返回图片，请确认模型名称与调用地域。");
    }

    const images = await Promise.all(imageUrls.map((url) => this.downloadImage(url)));
    const requested = Math.max(1, input.n);
    return images.length < requested
      ? { images, warnings: [`请求 ${requested} 张，百炼模型实际返回 ${images.length} 张。`] }
      : { images };
  }

  async testConnection(config: ProviderConfig, apiKey: string): Promise<void> {
    assertApiKey(apiKey);
    const response = await this.fetchWithTimeout(joinUrl(config.baseUrl || DEFAULT_BASE_URL, "/compatible-mode/v1/models"), {
      headers: { Authorization: `Bearer ${apiKey}` }
    }, 15_000);
    if (!response.ok) await throwBailianError(response);
  }

  private async downloadImage(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
    if (url.startsWith("data:")) return decodeDataUrl(url);
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) await throwBailianError(response);
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
          throw new ProviderError("TIMEOUT", "百炼请求超时，请检查网络或稍后重试。");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}

function buildBailianBody(input: ProviderGenerateInput, model: string): Record<string, unknown> {
  const content = [
    ...input.referenceImages.map((image) => ({
      image: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`
    })),
    { text: input.prompt }
  ];
  const parameters: Record<string, unknown> = {
    n: supportedImageCount(model, input.n),
    watermark: false
  };
  const size = normalizeBailianSize(input.size, model, input.referenceImages.length > 0);
  if (size) parameters.size = size;
  if (!model.startsWith("wan2.7-image")) parameters.prompt_extend = true;

  return {
    model,
    input: { messages: [{ role: "user", content }] },
    parameters
  };
}

function supportedImageCount(model: string, requested: number): number {
  const count = Math.min(6, Math.max(1, requested));
  if (isFixedQwenGenerationModel(model)) return 1;
  if (model === "qwen-image-edit") return 1;
  return model.startsWith("wan2.7-image") ? Math.min(4, count) : count;
}

function normalizeBailianSize(value: string, model: string, hasReferences: boolean): string | undefined {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) return undefined;
  let width = Number(match[1]);
  let height = Number(match[2]);
  if (!width || !height) return undefined;

  if (isFixedQwenGenerationModel(model)) {
    return nearestFixedQwenSize(width, height);
  }

  const maxPixels = model === "wan2.7-image-pro" && !hasReferences ? 4096 ** 2 : 2048 ** 2;
  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width = Math.max(16, Math.floor((width * scale) / 16) * 16);
    height = Math.max(16, Math.floor((height * scale) / 16) * 16);
  }
  return `${width}*${height}`;
}

function isFixedQwenGenerationModel(model: string): boolean {
  return model === "qwen-image" || /^qwen-image-(?:plus|max)(?:-|$)/.test(model);
}

function nearestFixedQwenSize(width: number, height: number): string {
  const sizes = [
    [1664, 928],
    [1472, 1104],
    [1328, 1328],
    [1104, 1472],
    [928, 1664]
  ] as const;
  const ratio = width / height;
  const [targetWidth, targetHeight] = sizes.reduce((best, candidate) =>
    Math.abs(Math.log(candidate[0] / candidate[1] / ratio)) <
    Math.abs(Math.log(best[0] / best[1] / ratio))
      ? candidate
      : best
  );
  return `${targetWidth}*${targetHeight}`;
}

function getBailianImageUrls(payload: Record<string, unknown>): string[] {
  const output = isRecord(payload.output) ? payload.output : null;
  if (!output || !Array.isArray(output.choices)) return [];
  const urls: string[] = [];
  for (const choice of output.choices) {
    if (!isRecord(choice) || !isRecord(choice.message) || !Array.isArray(choice.message.content)) continue;
    for (const item of choice.message.content) {
      if (isRecord(item) && typeof item.image === "string" && item.image) urls.push(item.image);
    }
  }
  return urls;
}


function bailianHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function assertApiKey(apiKey: string): void {
  if (!apiKey.trim()) throw new ProviderError("AUTH_ERROR", "请先填写百炼 API Key。");
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function decodeDataUrl(value: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new ProviderError("INVALID_RESPONSE", "百炼返回了无效的图片 Data URL。");
  return {
    bytes: Buffer.from(decodeURIComponent(match[3]), match[2] ? "base64" : "utf8"),
    mimeType: match[1] || "image/png"
  };
}

async function throwBailianError(response: Response): Promise<never> {
  const text = await response.text().catch(() => "");
  let code = "";
  let message = text || response.statusText || `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    code = typeof payload.code === "string" ? payload.code : "";
    if (typeof payload.message === "string") message = payload.message;
    else if (isRecord(payload.error) && typeof payload.error.message === "string") message = payload.error.message;
  } catch {
    // 非 JSON 错误体保留原始文本。
  }
  if (response.status === 401 || response.status === 403 || /invalidapi|unauthori[sz]ed/i.test(`${code} ${message}`)) {
    throw new ProviderError("AUTH_ERROR", "百炼 API Key 无效、地域不匹配或无模型权限，请检查配置。", response.status);
  }
  if (/arrearage|balance|insufficient/i.test(`${code} ${message}`)) {
    throw new ProviderError("INSUFFICIENT_BALANCE", "百炼账户余额不足，请充值后重试。", response.status);
  }
  const errorCode = response.status === 429 || response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "BAILIAN_API_ERROR";
  throw new ProviderError(errorCode, message, response.status);
}

function throwBailianPayloadError(code: string, message: unknown): never {
  const detail = typeof message === "string" ? message : code;
  if (/invalidapi|unauthori[sz]ed/i.test(`${code} ${detail}`)) {
    throw new ProviderError("AUTH_ERROR", "百炼 API Key 无效、地域不匹配或无模型权限，请检查配置。");
  }
  if (/arrearage|balance|insufficient/i.test(`${code} ${detail}`)) {
    throw new ProviderError("INSUFFICIENT_BALANCE", "百炼账户余额不足，请充值后重试。");
  }
  throw new ProviderError(code || "BAILIAN_API_ERROR", detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
