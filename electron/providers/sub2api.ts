import type {
  GenerationResult,
  ProviderConfig,
  ProviderGenerateInput,
  ProviderModelOption
} from "../../shared/types.js";
import { ProviderError } from "./errors.js";
import { mapWithConcurrency, Semaphore } from "./concurrency.js";

type FetchLike = typeof fetch;

interface OpenAIImageItem {
  b64_json?: string;
  url?: string;
}

interface OpenAIResponsesOutputItem {
  type?: string;
  result?: string;
}

interface OpenAIResponsePayload {
  data?: OpenAIImageItem[];
  output?: OpenAIResponsesOutputItem[];
  result?: string;
}

interface OpenAIModelsPayload {
  data?: unknown;
  models?: unknown;
}

const networkSemaphore = new Semaphore(4);

export class Sub2ApiImageProvider {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60 * 1000
  ) {}

  async generate(input: ProviderGenerateInput, config: ProviderConfig, apiKey: string): Promise<GenerationResult> {
    if (input.referenceImages.length > 0) {
      if (!config.supportsReferenceImages) {
        throw new ProviderError("REFERENCE_UNSUPPORTED", "当前 Provider 未声明支持参考图。");
      }

      if (usesJsonImagesApi(config)) {
        return this.generateWithJsonImages(input, config, apiKey);
      }

      if (usesResponsesApi(config)) {
        return this.generateWithResponses(input, config, apiKey);
      }

      if (input.workflowMode === "generate") {
        throw new ProviderError(
          "REFERENCE_GENERATION_UNSUPPORTED",
          "Images API 生成模式不支持参考图。请切到 Responses 模式，或切到编辑模式使用 /v1/images/edits。"
        );
      }

      return this.generateWithReferences(input, config, apiKey);
    }

    if (input.workflowMode === "edit") {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }

    if (usesResponsesApi(config)) {
      return this.generateWithResponses(input, config, apiKey);
    }

    const response = await this.fetchWithTimeout(joinUrl(config.baseUrl, config.generationEndpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: input.prompt,
        model: input.model || config.model,
        size: input.size,
        n: input.n,
        quality: input.quality || undefined,
        style: input.style || undefined,
        background: input.background === "auto" ? undefined : input.background,
        output_format: input.outputFormat ?? "png",
        response_format: config.compatResponseFormat || undefined
      })
    });

    return withRequestedCountWarning(await this.parseResponse(response), input.n);
  }

  async testConnection(config: ProviderConfig, apiKey: string): Promise<void> {
    if (!apiKey.trim()) throw new ProviderError("UNAUTHORIZED", "请先填写 API Key。");
    if (config.type === "openrouter" || config.type === "poe") {
      const endpoint = config.type === "openrouter" ? "/v1/key" : "/usage/current_balance";
      const response = await this.fetchWithTimeout(joinUrl(config.baseUrl, endpoint), {
        headers: { Authorization: `Bearer ${apiKey}` }
      }, 15_000);
      if (!response.ok) await throwProviderError(response);
      return;
    }

    // Responses 路线不能带 image_generation 工具探测：那是一次真实生图，
    // 服务器要等整张图生成完才返回（30 秒起步），15 秒限时必然误报超时。
    // 改发 max_output_tokens 最小值的纯文本请求，几秒内即可验证 URL + Key + 模型。
    const body = usesResponsesApi(config)
      ? {
          model: config.model,
          input: "connection test",
          max_output_tokens: 16
        }
      : {
          prompt: "connection test",
          model: config.model,
          size: "1024x1024",
          n: 1,
          response_format: config.compatResponseFormat || undefined
        };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await this.fetchImpl(joinUrl(config.baseUrl, config.generationEndpoint), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("TIMEOUT", "连接超时（15 秒无响应）。请检查 Base URL 与网络。");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok && response.status !== 400) {
      await throwProviderError(response);
    }
  }

  async listModels(config: ProviderConfig, apiKey: string): Promise<ProviderModelOption[]> {
    if (!config.baseUrl.trim()) throw new ProviderError("INVALID_CONFIG", "请先填写 Base URL。");
    if (!apiKey.trim()) throw new ProviderError("UNAUTHORIZED", "请先填写 API Key。");

    const response = await this.fetchWithTimeout(modelListUrl(config.baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` }
    }, 15_000);
    if (!response.ok) await throwProviderError(response);

    const payload = (await response.json()) as OpenAIModelsPayload;
    return parseProviderModels(payload);
  }

  private async generateWithReferences(
    input: ProviderGenerateInput,
    config: ProviderConfig,
    apiKey: string
  ): Promise<GenerationResult> {
    const endpoint = config.referenceEndpoint || "/v1/images/edits";
    const form = new FormData();
    form.append("prompt", input.prompt);
    form.append("model", input.model || config.model);
    form.append("size", input.size);
    form.append("n", String(input.n));
    if (config.compatResponseFormat) form.append("response_format", config.compatResponseFormat);
    if (input.quality) form.append("quality", input.quality);
    if (input.style) form.append("style", input.style);
    if (input.background && input.background !== "auto") form.append("background", input.background);
    form.append("output_format", input.outputFormat ?? "png");

    for (const [index, image] of input.referenceImages.entries()) {
      const blob = new Blob([new Uint8Array(image.bytes)], { type: image.mimeType });
      form.append(input.referenceImages.length === 1 ? "image" : `image[${index}]`, blob, image.name);
    }

    const response = await this.fetchWithTimeout(joinUrl(config.baseUrl, endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    return withRequestedCountWarning(await this.parseResponse(response), input.n);
  }

  private async generateWithJsonImages(
    input: ProviderGenerateInput,
    config: ProviderConfig,
    apiKey: string
  ): Promise<GenerationResult> {
    const response = await this.fetchWithTimeout(joinUrl(config.baseUrl, config.generationEndpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: input.prompt,
        model: input.model || config.model,
        size: input.size,
        n: input.n,
        quality: input.quality || undefined,
        background: input.background === "auto" ? undefined : input.background,
        output_format: input.outputFormat ?? "png",
        input_references: input.referenceImages.map((image) => ({
          type: "image_url",
          image_url: { url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}` }
        }))
      })
    });
    return withRequestedCountWarning(await this.parseResponse(response), input.n);
  }

  // Responses API 一次请求只产一张图：并行发 n 个请求，容忍部分失败——
  // 只要有成功的图就返回（失败原因转为 warning），全部失败才抛错。
  private async generateWithResponses(
    input: ProviderGenerateInput,
    config: ProviderConfig,
    apiKey: string
  ): Promise<GenerationResult> {
    const count = Math.max(1, input.n);
    const attempts = await mapWithConcurrency(
      Array.from({ length: count }, (_, index) => index),
      2,
      () => this.requestResponsesImage(input, config, apiKey)
    );

    const images: GenerationResult["images"] = [];
    const failures: unknown[] = [];
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") images.push(...attempt.value.images);
      else failures.push(attempt.reason);
    }

    if (images.length === 0) {
      throw failures[0] ?? new ProviderError("EMPTY_RESPONSE", "Provider 未返回图片。");
    }

    if (failures.length > 0) {
      return {
        images,
        warnings: [`请求 ${count} 张，其中 ${failures.length} 张生成失败：${describeFailure(failures[0])}`]
      };
    }

    return { images };
  }

  private async requestResponsesImage(
    input: ProviderGenerateInput,
    config: ProviderConfig,
    apiKey: string
  ): Promise<GenerationResult> {
    const response = await this.fetchWithTimeout(joinUrl(config.baseUrl, config.generationEndpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildResponsesRequestBody(input, config))
    });
    return this.parseResponse(response);
  }

  private async parseResponse(response: Response): Promise<GenerationResult> {
    return parseOpenAIImageResponse(response, (input, init) => this.fetchWithTimeout(input, init));
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit = {},
    timeoutMs = this.timeoutMs
  ): Promise<Response> {
    return networkSemaphore.run(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ProviderError("TIMEOUT", "图片生成请求超时，请稍后重试。");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}

export async function parseOpenAIImageResponse(
  response: Response,
  fetchImage: (input: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<GenerationResult> {
    if (!response.ok) {
      await throwProviderError(response);
    }

    const payload = await readResponsePayload(response);
    const imageItems = getImageItems(payload);
    if (imageItems.length === 0) {
      throw new ProviderError("EMPTY_RESPONSE", "Provider 未返回图片。");
    }

    const images = await Promise.all(
      imageItems.map(async (item): Promise<{ bytes: Buffer; mimeType: string }> => {
        if (item.b64_json) {
          return {
            bytes: Buffer.from(item.b64_json, "base64"),
            mimeType: "image/png"
          };
        }

        if (item.url) {
          if (item.url.startsWith("data:")) return decodeDataUrl(item.url);
          const imageResponse = await fetchImage(item.url);
          if (!imageResponse.ok) {
            await throwProviderError(imageResponse);
          }
          const buffer = Buffer.from(await imageResponse.arrayBuffer());
          return {
            bytes: buffer,
            mimeType: imageResponse.headers.get("content-type") || "image/png"
          };
        }

        throw new ProviderError("INVALID_RESPONSE", "Provider 返回了无法识别的图片格式。");
      })
    );

    return { images };
}

// 一些中转站会忽略/不支持 n>1，只回 1 张——补一条警告让 UI 能解释占位符为什么消失。
function withRequestedCountWarning(result: GenerationResult, requested: number): GenerationResult {
  const count = Math.max(1, requested);
  if (result.images.length >= count) return result;
  return {
    ...result,
    warnings: [
      ...(result.warnings || []),
      `请求 ${count} 张，Provider 实际返回 ${result.images.length} 张（该端点可能不支持一次生成多张）。`
    ]
  };
}

function describeFailure(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason ?? "未知错误");
}

function usesResponsesApi(config: ProviderConfig): boolean {
  return config.apiMode === "responses" || /\/responses\/?$/.test(config.generationEndpoint);
}

function usesJsonImagesApi(config: ProviderConfig): boolean {
  return config.type === "openrouter";
}

function buildResponsesRequestBody(input: ProviderGenerateInput, config: ProviderConfig): Record<string, unknown> {
  const tool: Record<string, string> = { type: "image_generation" };
  if (input.size) tool.size = input.size;
  if (input.quality) tool.quality = input.quality;
  if (input.background && input.background !== "auto") tool.background = input.background;
  tool.output_format = input.outputFormat ?? "png";

  return {
    model: input.model || config.model,
    input: buildResponsesInput(input),
    tools: [tool]
  };
}

function buildResponsesInput(input: ProviderGenerateInput): string | Array<Record<string, unknown>> {
  if (input.referenceImages.length === 0) {
    // 纯文本生成才补比例提示：许多"OpenAI 兼容"中转会忽略 image_generation 的 size，
    // 这类模型往往能从提示词里读到目标比例/朝向。编辑与参考图不加，避免与源图/参考图冲突。
    const hint = buildResponsesSizeHint(input);
    return hint ? `${input.prompt}\n\n${hint}` : input.prompt;
  }

  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: input.prompt },
        ...input.referenceImages.map((image) => ({
          type: "input_image",
          image_url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`
        }))
      ]
    }
  ];
}

/** 目标比例/朝向/尺寸提示：作为 size 参数被上游忽略时的兜底（仅生成模式）。 */
function buildResponsesSizeHint(input: ProviderGenerateInput): string | null {
  if (input.workflowMode !== "generate") return null;
  const match = /^(\d+)x(\d+)$/i.exec((input.size || "").trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  const divisor = gcd(width, height);
  const ratio = `${width / divisor}:${height / divisor}`;
  const orientation = width === height ? "square" : width > height ? "landscape" : "portrait";
  return `Target aspect ratio ${ratio} (${orientation}), output resolution ${width}x${height}. Compose and render the entire image at exactly this aspect ratio.`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function getImageItems(payload: OpenAIResponsePayload): OpenAIImageItem[] {
  const imageItems = payload.data || [];
  const responseImageItems =
    payload.output
      ?.filter((item) => item.type === "image_generation_call" && item.result)
      .map((item) => ({ b64_json: item.result })) || [];
  const resultImageItems = payload.result ? [{ b64_json: payload.result }] : [];

  return [...imageItems, ...responseImageItems, ...resultImageItems];
}

async function readResponsePayload(response: Response): Promise<OpenAIResponsePayload> {
  const contentType = response.headers?.get("content-type")?.toLowerCase() || "";
  if (contentType.includes("text/event-stream")) {
    return parseEventStreamPayload(await response.text());
  }

  // 部分兼容端点漏写 SSE Content-Type。原生 Response 可提前 clone，JSON 解析失败后再回退读取流文本。
  const fallback = typeof response.clone === "function" ? response.clone() : null;
  try {
    return (await response.json()) as OpenAIResponsePayload;
  } catch (error) {
    if (!fallback) throw error;
    const text = await fallback.text();
    if (/^\s*(?:event|data):/m.test(text)) return parseEventStreamPayload(text);
    throw error;
  }
}

function parseEventStreamPayload(stream: string): OpenAIResponsePayload {
  let imagePayload: OpenAIResponsePayload | null = null;
  let eventError = "";
  let dataLines: string[] = [];

  const consumeEvent = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;

    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    for (const candidate of getEventPayloadCandidates(event)) {
      if (getImageItems(candidate).length > 0) imagePayload = candidate;
    }
    eventError = extractEventError(event) || eventError;
  };

  for (const line of stream.split(/\r?\n/)) {
    if (line === "") {
      consumeEvent();
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  consumeEvent();

  if (imagePayload) return imagePayload;
  if (eventError) throw new ProviderError("PROVIDER_ERROR", eventError);
  throw new ProviderError("EMPTY_RESPONSE", "Provider 的流式响应未返回图片。");
}

function getEventPayloadCandidates(event: unknown): OpenAIResponsePayload[] {
  if (!event || typeof event !== "object") return [];
  const record = event as Record<string, unknown>;
  const candidates: OpenAIResponsePayload[] = [record as OpenAIResponsePayload];
  if (record.response && typeof record.response === "object") {
    candidates.push(record.response as OpenAIResponsePayload);
  }
  for (const key of ["item", "output_item"] as const) {
    const item = record[key];
    if (item && typeof item === "object") {
      candidates.push({ output: [item as OpenAIResponsesOutputItem] });
    }
  }
  return candidates;
}

function extractEventError(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const record = event as Record<string, unknown>;
  const direct = extractErrorValue(record.error);
  if (direct) return direct;
  if (record.response && typeof record.response === "object") {
    return extractErrorValue((record.response as Record<string, unknown>).error);
  }
  return "";
}

function extractErrorValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const message = (value as Record<string, unknown>).message;
  return typeof message === "string" ? message : "";
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${trimmedBase}${normalizedEndpoint}`;
}

function modelListUrl(baseUrl: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmedBase);
    return joinUrl(trimmedBase, /\/v1$/.test(url.pathname) ? "/models" : "/v1/models");
  } catch {
    return joinUrl(trimmedBase, "/v1/models");
  }
}

function parseProviderModels(payload: OpenAIModelsPayload): ProviderModelOption[] {
  const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
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

  return models.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}

function decodeDataUrl(value: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new ProviderError("INVALID_RESPONSE", "Provider 返回了无效的图片 Data URL。");
  return {
    bytes: Buffer.from(decodeURIComponent(match[3]), match[2] ? "base64" : "utf8"),
    mimeType: match[1] || "image/png"
  };
}

async function throwProviderError(response: Response): Promise<never> {
  const text = await response.text().catch(() => "");
  const message = extractErrorMessage(text) || response.statusText || "Provider request failed";
  if (message.includes("Images API is not supported for this platform")) {
    throw new ProviderError(
      "IMAGES_API_UNSUPPORTED",
      "当前 Provider 暂不支持 Images API，请切到 Responses 模式或更换支持 /v1/images 的端点。",
      response.status
    );
  }
  if (isUnsupportedImageGenerationToolError(message)) {
    throw new ProviderError(
      "UNSUPPORTED_IMAGE_GENERATION_TOOL",
      "当前 Provider 的 Responses API 不支持 OpenAI image_generation 图像工具。请换用支持该工具的 OpenAI 兼容端点，或切到 Images API 并使用 gpt-image-1/gpt-image-1.5。",
      response.status
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("UNAUTHORIZED", "Provider 鉴权失败，请检查 API Key。", response.status);
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", message, response.status);
  }
  throw new ProviderError("PROVIDER_ERROR", message, response.status);
}

function extractErrorMessage(text: string): string {
  if (!text) return "";

  try {
    const payload = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
    if (typeof payload.error?.message === "string") return payload.error.message;
    if (typeof payload.message === "string") return payload.message;
  } catch {
    return text;
  }

  return text;
}

function isUnsupportedImageGenerationToolError(message: string): boolean {
  return (
    message.includes("image_generation") &&
    (message.includes("does not match any of the expected tags") || message.includes("expected tags"))
  );
}
