import type {
  GenerationResult,
  ProviderConfig,
  ProviderGenerateInput,
  ProviderModelOption
} from "../../shared/types.js";
import type { CodexOAuthService } from "../auth/codex-oauth.js";
import { mapWithConcurrency, Semaphore } from "./concurrency.js";
import { ProviderError } from "./errors.js";
import { parseOpenAIImageResponse } from "./sub2api.js";
import type { TextCompletionOptions, TextTransport } from "./text-assistant.js";

type FetchLike = typeof fetch;

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models";
const CODEX_MAIN_MODEL = "gpt-5.4-mini";
const CODEX_VERSION = "0.144.1";
const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_VERSION} (Ubuntu 22.4.0; x86_64) xterm-256color`;
const networkSemaphore = new Semaphore(2);

export class CodexOAuthTextTransport implements TextTransport {
  constructor(
    private readonly auth: CodexOAuthService,
    private readonly providerId: string,
    private readonly model = CODEX_MAIN_MODEL,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60_000
  ) {}

  async complete(messages: readonly unknown[], opts: TextCompletionOptions, signal?: AbortSignal): Promise<string> {
    return this.completeStream(messages, opts, () => undefined, signal);
  }

  async completeStream(
    messages: readonly unknown[],
    opts: TextCompletionOptions,
    onRaw: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const firstAuth = await this.auth.getAccess(this.providerId);
    let response = await this.request(messages, opts, firstAuth.accessToken, firstAuth.accountId, signal);
    if (response.status === 401) {
      const refreshed = await this.auth.getAccess(this.providerId, true);
      response = await this.request(messages, opts, refreshed.accessToken, refreshed.accountId, signal);
      if (response.status === 401) this.auth.markReauthRequired(this.providerId);
    }
    if (!response.ok) await throwCodexError(response);
    return readCodexTextStream(response, onRaw, opts.onReasoningSummary, signal);
  }

  async testConnection(): Promise<void> {
    await this.auth.getAccess(this.providerId);
  }

  async listModels(): Promise<ProviderModelOption[]> {
    const firstAuth = await this.auth.getAccess(this.providerId);
    let response = await this.requestModels(firstAuth.accessToken, firstAuth.accountId);
    if (response.status === 401) {
      const refreshed = await this.auth.getAccess(this.providerId, true);
      response = await this.requestModels(refreshed.accessToken, refreshed.accountId);
      if (response.status === 401) this.auth.markReauthRequired(this.providerId);
    }
    if (!response.ok) await throwCodexError(response);
    return parseCodexModels(await response.json());
  }

  private requestModels(accessToken: string, accountId: string): Promise<Response> {
    const url = new URL(CODEX_MODELS_URL);
    url.searchParams.set("client_version", CODEX_VERSION);
    return this.fetchWithTimeout(url.toString(), {
      headers: {
        ...codexHeaders(accessToken, accountId),
        Accept: "application/json"
      }
    }, undefined, 15_000);
  }

  private async request(
    messages: readonly unknown[],
    opts: TextCompletionOptions,
    accessToken: string,
    accountId: string,
    signal?: AbortSignal
  ): Promise<Response> {
    return this.fetchWithTimeout(CODEX_RESPONSES_URL, {
      method: "POST",
      headers: codexHeaders(accessToken, accountId),
      body: JSON.stringify(buildCodexTextRequest(messages, this.model, opts))
    }, signal);
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    signal?: AbortSignal,
    timeoutMs = this.timeoutMs
  ): Promise<Response> {
    return networkSemaphore.run(async () => {
      const controller = new AbortController();
      const abortFromCaller = (): void => controller.abort();
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) {
          if (signal?.aborted) throw new ProviderError("REQUEST_CANCELLED", "已停止生成。");
          throw new ProviderError("TIMEOUT", "Codex 文本请求超时，请稍后重试。");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    });
  }
}

export function parseCodexModels(payload: unknown): ProviderModelOption[] {
  if (!payload || typeof payload !== "object") {
    throw new ProviderError("INVALID_RESPONSE", "Codex 未返回有效的模型目录。");
  }
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) {
    throw new ProviderError("INVALID_RESPONSE", "Codex 未返回有效的模型目录。");
  }

  const seen = new Set<string>();
  return models
    .flatMap((raw): Array<{ option: ProviderModelOption; priority: number }> => {
      if (!raw || typeof raw !== "object") return [];
      const model = raw as {
        slug?: unknown;
        display_name?: unknown;
        visibility?: unknown;
        supported_in_api?: unknown;
        priority?: unknown;
      };
      const id = typeof model.slug === "string" ? model.slug.trim() : "";
      if (!id || seen.has(id) || model.visibility === "hide" || model.supported_in_api === false) return [];
      seen.add(id);
      const displayName = typeof model.display_name === "string" ? model.display_name.trim() : "";
      return [{
        option: {
          id,
          ownedBy: displayName && displayName.toLocaleLowerCase() !== id.toLocaleLowerCase()
            ? `${displayName} · Codex / ChatGPT`
            : "Codex / ChatGPT"
        },
        priority: typeof model.priority === "number" ? model.priority : Number.MAX_SAFE_INTEGER
      }];
    })
    .sort((left, right) => left.priority - right.priority)
    .map(({ option }) => option);
}

export class CodexOAuthImageProvider {
  constructor(
    private readonly auth: CodexOAuthService,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60_000
  ) {}

  async generate(input: ProviderGenerateInput, config: ProviderConfig, _apiKey = ""): Promise<GenerationResult> {
    void _apiKey;
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }
    if (input.referenceImages.length > 0 && !config.supportsReferenceImages) {
      throw new ProviderError("REFERENCE_UNSUPPORTED", "当前 Provider 未声明支持参考图。");
    }

    const count = Math.max(1, input.n);
    const attempts = await mapWithConcurrency(
      Array.from({ length: count }, (_, index) => index),
      2,
      () => this.generateSingle(input, config)
    );
    const images: GenerationResult["images"] = [];
    const failures: unknown[] = [];
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") images.push(...attempt.value.images);
      else failures.push(attempt.reason);
    }

    if (images.length === 0) {
      throw failures[0] ?? new ProviderError("EMPTY_RESPONSE", "Codex 未返回图片。");
    }
    if (failures.length > 0) {
      return {
        images,
        warnings: [`请求 ${count} 张，其中 ${failures.length} 张生成失败：${describeFailure(failures[0])}`]
      };
    }
    return { images };
  }

  async testConnection(config: ProviderConfig, _apiKey = ""): Promise<void> {
    void _apiKey;
    await this.auth.getAccess(config.id);
  }

  async listModels(config: ProviderConfig, _apiKey = ""): Promise<ProviderModelOption[]> {
    void _apiKey;
    await this.auth.getAccess(config.id);
    return [{ id: "gpt-image-2", ownedBy: "Codex / ChatGPT" }];
  }

  private async generateSingle(input: ProviderGenerateInput, config: ProviderConfig): Promise<GenerationResult> {
    const firstAuth = await this.auth.getAccess(config.id);
    let response = await this.request(input, config, firstAuth.accessToken, firstAuth.accountId);
    if (response.status === 401) {
      const refreshed = await this.auth.getAccess(config.id, true);
      response = await this.request(input, config, refreshed.accessToken, refreshed.accountId);
      if (response.status === 401) this.auth.markReauthRequired(config.id);
    }
    if (!response.ok) await throwCodexError(response);
    return parseOpenAIImageResponse(response, (url, init) => this.fetchWithTimeout(url, init));
  }

  private async request(
    input: ProviderGenerateInput,
    config: ProviderConfig,
    accessToken: string,
    accountId: string
  ): Promise<Response> {
    return this.fetchWithTimeout(CODEX_RESPONSES_URL, {
      method: "POST",
      headers: {
        ...codexHeaders(accessToken, accountId)
      },
      body: JSON.stringify(buildCodexImageRequest(input, config))
    });
  }

  private async fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
    return networkSemaphore.run(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await this.fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ProviderError("TIMEOUT", "Codex 图片生成请求超时，请稍后重试。");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}

function codexHeaders(accessToken: string, accountId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "chatgpt-account-id": accountId,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses=experimental",
    originator: "codex_cli_rs",
    version: CODEX_VERSION,
    "User-Agent": CODEX_USER_AGENT
  };
}

export function buildCodexTextRequest(
  messages: readonly unknown[],
  model = CODEX_MAIN_MODEL,
  opts: TextCompletionOptions = {}
): Record<string, unknown> {
  const instructions: string[] = [];
  const input: Array<Record<string, unknown>> = [];
  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== "object") continue;
    const message = rawMessage as { role?: unknown; content?: unknown };
    const role = message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user";
    if (role === "system") {
      const text = textFromMessageContent(message.content);
      if (text) instructions.push(text);
      continue;
    }
    const content = responsesContent(message.content, role);
    if (content.length > 0) input.push({ type: "message", role, content });
  }
  return {
    instructions: instructions.join("\n\n"),
    stream: true,
    reasoning: { effort: "medium", summary: "auto" },
    include: ["reasoning.encrypted_content"],
    model: model.trim() || CODEX_MAIN_MODEL,
    store: false,
    ...(opts.maxTokens ? { max_output_tokens: opts.maxTokens } : {}),
    input
  };
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const value = (part as { text?: unknown }).text;
    return typeof value === "string" ? [value] : [];
  }).join("\n");
}

function responsesContent(content: unknown, role: "user" | "assistant"): Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return [{ type: role === "assistant" ? "output_text" : "input_text", text: content }];
  }
  if (!Array.isArray(content)) return [];
  return content.flatMap((part): Array<Record<string, unknown>> => {
    if (!part || typeof part !== "object") return [];
    const item = part as { type?: unknown; text?: unknown; image_url?: unknown };
    if ((item.type === "text" || item.type === "input_text") && typeof item.text === "string") {
      return [{ type: role === "assistant" ? "output_text" : "input_text", text: item.text }];
    }
    if (role === "user" && item.type === "image_url") {
      const imageUrl = typeof item.image_url === "string"
        ? item.image_url
        : item.image_url && typeof item.image_url === "object"
          ? (item.image_url as { url?: unknown }).url
          : undefined;
      return typeof imageUrl === "string" ? [{ type: "input_image", image_url: imageUrl }] : [];
    }
    return [];
  });
}

async function readCodexTextStream(
  response: Response,
  onRaw: (chunk: string) => void,
  onReasoningSummary?: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let content = "";
  let completedContent = "";
  const summaryParts = new Map<string, string>();
  const emitSummary = (key: string, text: string, delta: boolean): void => {
    if (!onReasoningSummary || !text || signal?.aborted) return;
    const previous = summaryParts.get(key) ?? "";
    const addition = delta ? text : text.startsWith(previous) ? text.slice(previous.length) : "";
    if (!addition) return;
    const separator = !summaryParts.has(key) && summaryParts.size > 0 ? "\n\n" : "";
    summaryParts.set(key, previous + addition);
    onReasoningSummary(separator + addition);
  };
  const consumeLine = (line: string): void => {
    if (signal?.aborted) return;
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    // Explicit summary events are displayable. Ignore reasoning_text and
    // encrypted_content, including those carried by output-item events.
    const summaryKey = `${event.item_id ?? event.output_index ?? "reasoning"}:${event.summary_index ?? 0}`;
    if (event.type === "response.reasoning_summary_text.delta" && typeof event.delta === "string") {
      emitSummary(summaryKey, event.delta, true);
      return;
    }
    if (event.type === "response.reasoning_summary_text.done" && typeof event.text === "string") {
      emitSummary(summaryKey, event.text, false);
      return;
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      content += event.delta;
      onRaw(event.delta);
      return;
    }
    if (event.type === "response.completed") {
      completedContent = extractCodexOutputText(event.response);
      if (summaryParts.size === 0 && event.response && typeof event.response === "object") {
        const output = (event.response as { output?: unknown }).output;
        if (Array.isArray(output)) output.forEach((item, index) => {
          if (!item || item.type !== "reasoning" || !Array.isArray(item.summary)) return;
          item.summary.forEach((part: { type?: unknown; text?: unknown }, partIndex: number) => {
            if (part?.type === "summary_text" && typeof part.text === "string") {
              emitSummary(`${index}:${partIndex}`, part.text, false);
            }
          });
        });
      }
    }
    if (event.type === "response.failed") {
      throw new ProviderError("PROVIDER_ERROR", extractCodexFailureMessage(event) || "Codex 文本请求失败。");
    }
  };

  if (!response.body) throw new ProviderError("EMPTY_RESPONSE", "Codex 文本模型未返回内容，请稍后重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline).replace(/\r$/, ""));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (buffer) consumeLine(buffer.replace(/\r$/, ""));
  const result = (content || completedContent).trim();
  if (!result) throw new ProviderError("EMPTY_RESPONSE", "Codex 文本模型未返回内容，请稍后重试。");
  if (!content && completedContent) onRaw(completedContent);
  return result;
}

function extractCodexOutputText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const text = (part as { type?: unknown; text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("");
}

function extractCodexFailureMessage(event: Record<string, unknown>): string {
  const response = event.response;
  if (!response || typeof response !== "object") return "";
  const error = (response as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function buildCodexImageRequest(
  input: ProviderGenerateInput,
  config: ProviderConfig
): Record<string, unknown> {
  const tool: Record<string, unknown> = {
    type: "image_generation",
    action: input.workflowMode === "edit" ? "edit" : "generate",
    model: input.model || config.model || "gpt-image-2"
  };
  if (input.size) tool.size = input.size;
  if (input.quality) tool.quality = input.quality;
  if (input.background && input.background !== "auto") tool.background = input.background;
  tool.output_format = input.outputFormat ?? "png";

  return {
    instructions: "",
    stream: true,
    reasoning: { effort: "medium", summary: "auto" },
    parallel_tool_calls: true,
    include: ["reasoning.encrypted_content"],
    model: CODEX_MAIN_MODEL,
    store: false,
    tool_choice: { type: "image_generation" },
    input: [{
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: input.prompt },
        ...input.referenceImages.map((image) => ({
          type: "input_image",
          image_url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`
        }))
      ]
    }],
    tools: [tool]
  };
}

function describeFailure(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason ?? "未知错误");
}

async function throwCodexError(response: Response): Promise<never> {
  const text = await response.text().catch(() => "");
  let message = text.trim();
  try {
    const payload = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
    message = typeof payload.error?.message === "string"
      ? payload.error.message
      : typeof payload.message === "string"
        ? payload.message
        : message;
  } catch {
    // 非 JSON 错误体直接使用原始文本。
  }
  if (response.status === 401) {
    throw new ProviderError("UNAUTHORIZED", "Codex 登录已失效，请重新授权。", response.status);
  }
  if (response.status === 403) {
    throw new ProviderError("UNAUTHORIZED", message || "当前 ChatGPT 账号没有使用该能力的权限。", response.status);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ProviderError("PROVIDER_UNAVAILABLE", message || "Codex 服务暂时不可用。", response.status);
  }
  throw new ProviderError("PROVIDER_ERROR", message || `Codex 请求失败（${response.status}）。`, response.status);
}
