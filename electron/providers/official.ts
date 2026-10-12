import type {
  CreditLedgerEntry,
  CreditStatus,
  GenerationResult,
  ProviderConfig,
  ProviderGenerateInput
} from "../../shared/types.js";
import type { SignedRequestAuth } from "../../shared/licensing.js";
import type { LicenseService } from "../licensing/service.js";
import { OFFICIAL_MAX_IMAGE_COUNT } from "../../shared/types.js";
import { ProviderError } from "./errors.js";

type FetchLike = typeof fetch;

interface OfficialImageResponse {
  job?: {
    id?: string;
    status?: "running" | "succeeded" | "failed";
    images?: Array<{ mimeType?: string; dataBase64?: string }>;
    errorCode?: string;
  };
  credits?: CreditStatus["credits"];
}

interface OfficialTextResponse {
  content?: string;
  model?: string;
  credits?: CreditStatus["credits"];
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}

export class OfficialImageProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly license: LicenseService,
    apiBaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10 * 60 * 1000
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async getCreditStatus(): Promise<CreditStatus> {
    return this.postSigned<CreditStatus>("/credits/status", "credits.status", {});
  }

  async listCreditTransactions(limit = 30): Promise<CreditLedgerEntry[]> {
    const result = await this.postSigned<{ items?: CreditLedgerEntry[] }>(
      "/credits/transactions",
      "credits.transactions",
      { limit: Math.max(1, Math.min(Math.trunc(limit), 100)) }
    );
    return Array.isArray(result.items) ? result.items : [];
  }

  async generate(
    input: ProviderGenerateInput,
    _config: ProviderConfig,
    _apiKey: string,
    onAccepted?: (jobID: string) => Promise<void>
  ): Promise<GenerationResult> {
    void _config;
    void _apiKey;
    if (!Number.isInteger(input.n) || input.n < 1 || input.n > OFFICIAL_MAX_IMAGE_COUNT) {
      throw new ProviderError("INVALID_REQUEST", `官方 Provider 单次生成数量必须为 1–${OFFICIAL_MAX_IMAGE_COUNT} 张。`);
    }
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }
    const job = await this.submitGeneration(input);
    await onAccepted?.(job.id);
    const completed = job.status === "running" ? await this.waitForGeneration(job.id) : job;
    if (completed.status === "failed") throw new ProviderError("OFFICIAL_GENERATION_FAILED", "官方图片任务生成失败，请重试。");
    return this.toGenerationResult(completed, input.n);
  }

  async submitGeneration(input: ProviderGenerateInput): Promise<Required<OfficialImageResponse>["job"] & { id: string; status: "running" | "succeeded" | "failed" }> {
    if (!Number.isInteger(input.n) || input.n < 1 || input.n > OFFICIAL_MAX_IMAGE_COUNT) {
      throw new ProviderError("INVALID_REQUEST", `官方 Provider 单次生成数量必须为 1–${OFFICIAL_MAX_IMAGE_COUNT} 张。`);
    }
    if (input.workflowMode === "edit" && input.referenceImages.length === 0) {
      throw new ProviderError("EDIT_IMAGE_REQUIRED", "编辑模式至少需要上传 1 张源图。");
    }
    const payload: Record<string, unknown> = {
      clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
      operation: input.workflowMode,
      prompt: input.prompt,
      size: normalizeOfficialSize(input.size),
      n: input.n,
      quality: input.quality,
      style: input.style,
      referenceImages: input.referenceImages.map((image) => ({
        name: image.name,
        mimeType: image.mimeType,
        dataBase64: image.bytes.toString("base64")
      }))
    };
    const effectiveBackground = input.background === "transparent" ? "auto" : input.background;
    // Keep requests compatible with older management servers that reject
    // unknown JSON fields. These are the protocol defaults; only send them
    // when the user selected a non-default output option.
    if (effectiveBackground && effectiveBackground !== "auto") payload.background = effectiveBackground;
    if (input.outputFormat && input.outputFormat !== "png") payload.outputFormat = input.outputFormat;
    const response = await this.postSigned<OfficialImageResponse>(
      "/official/images/generate",
      "official.images.generate",
      payload,
      undefined,
      { "X-Iterlay-Async-Generation": "1" }
    );
    const job = response.job;
    if (!job?.id || !job.status) throw new ProviderError("INVALID_RESPONSE", "官方 Provider 未返回任务 ID。");
    return { ...job, id: job.id, status: job.status };
  }

  async getGenerationStatus(jobID: string, signal?: AbortSignal): Promise<Required<OfficialImageResponse>["job"] & { id: string; status: "running" | "succeeded" | "failed" }> {
    const response = await this.postSigned<OfficialImageResponse>("/official/images/status", "official.images.status", { jobId: jobID }, signal);
    const job = response.job;
    if (!job?.id || !job.status) throw new ProviderError("INVALID_RESPONSE", "官方 Provider 未返回任务状态。");
    return { ...job, id: job.id, status: job.status };
  }

  async waitForGeneration(jobID: string): Promise<Required<OfficialImageResponse>["job"] & { id: string; status: "running" | "succeeded" | "failed" }> {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const job = await this.getGenerationStatus(jobID);
      if (job.status !== "running") return job;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new ProviderError("TIMEOUT", "官方图片任务查询超时，请稍后在历史记录中恢复。");
  }

  private toGenerationResult(job: Required<OfficialImageResponse>["job"], requestedCount: number): GenerationResult {
    const images = (job.images ?? []).flatMap((image) => {
      if (!image.dataBase64 || !image.mimeType?.startsWith("image/")) return [];
      return [{ bytes: Buffer.from(image.dataBase64, "base64"), mimeType: image.mimeType }];
    });
    if (images.length === 0) throw new ProviderError("INVALID_RESPONSE", "官方 Provider 未返回可用图片。");
    return {
      images,
      ...(images.length < requestedCount ? { warnings: [`请求 ${requestedCount} 张，实际返回 ${images.length} 张，已按实际张数结算。`] } : {})
    };
  }

  async testConnection(..._args: unknown[]): Promise<void> {
    void _args;
    const status = await this.getCreditStatus();
    if (!status.providerAvailable) {
      throw new ProviderError("OFFICIAL_PROVIDER_UNAVAILABLE", "官方 Provider 暂时不可用，请稍后重试。");
    }
  }

  /** 官方文本助手：每次调用由后台扣 1 Credit，失败自动退款。供 OfficialTextTransport 使用。 */
  async completeText(
    messages: readonly unknown[],
    opts: { temperature?: number; maxTokens?: number } = {},
    signal?: AbortSignal
  ): Promise<{ content: string; credits?: CreditStatus["credits"] }> {
    const payload: Record<string, unknown> = {
      clientRequestId: crypto.randomUUID(),
      messages
    };
    if (opts.temperature !== undefined) payload.temperature = opts.temperature;
    if (opts.maxTokens) payload.maxTokens = opts.maxTokens;
    const response = await this.postSigned<OfficialTextResponse>(
      "/official/text/generate",
      "official.text.generate",
      payload,
      signal
    );
    const content = response.content?.trim();
    if (!content) throw new ProviderError("EMPTY_RESPONSE", "官方文本助手未返回内容，请稍后重试。");
    return { content, credits: response.credits };
  }

  private async postSigned<T>(
    path: string,
    purpose: string,
    payload: unknown,
    signal?: AbortSignal,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const serializedPayload = JSON.stringify(payload);
    const auth: SignedRequestAuth = await this.license.createSignedRequest(purpose, serializedPayload);
    const controller = new AbortController();
    const abortFromCaller = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", ...extraHeaders },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: controller.signal
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new ProviderError("REQUEST_CANCELLED", "已停止生成。");
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("TIMEOUT", "官方 Provider 请求超时，请稍后重试。");
      }
      throw new ProviderError("NETWORK_ERROR", "无法连接官方 Provider，请检查网络后重试。");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
    if (!response.ok) {
      const error = await toOfficialError(response);
      if (error.code === "invalid_credential") {
        this.license.markCredentialRejected(error.message);
      }
      throw error;
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderError("INVALID_RESPONSE", "官方 Provider 返回了无效数据。");
    }
  }
}

function normalizeOfficialSize(size: string): string {
  return ["auto", "1024x1024", "1536x1024", "1024x1536"].includes(size) ? size : "auto";
}

async function toOfficialError(response: Response): Promise<ProviderError> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = undefined;
  }
  const code = body?.code || `HTTP_${response.status}`;
  const defaults: Record<string, string> = {
    insufficient_credits: "Credit 余额不足，请激活授权或切换自定义 Provider。",
    official_provider_unavailable: "官方 Provider 暂时不可用，请稍后重试。",
    official_text_unavailable: "官方文本助手暂时不可用，请稍后重试或切换自定义 Provider。",
    generation_running: "这次生成仍在处理中，请稍后重试。",
    generation_result_expired: "生成结果已过期，请重新提交。",
    invalid_credential: "设备凭证已失效，请重新检查授权状态。",
    HTTP_413: "参考图分辨率或文件大小超过官方 Provider 限制，请缩小尺寸或切分图片后重试。"
  };
  return new ProviderError(code, defaults[code] || body?.message || `官方 Provider 请求失败 (${response.status})`, response.status);
}
