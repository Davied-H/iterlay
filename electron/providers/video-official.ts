import type { SignedRequestAuth } from "../../shared/licensing.js";
import type { CreditStatus } from "../../shared/types.js";
import type { LicenseService } from "../licensing/service.js";
import { ProviderError } from "./errors.js";
import type {
  DownloadedVideo,
  OfficialVideoProviderConfig,
  VideoCancelResult,
  VideoProvider,
  VideoProviderCapability,
  VideoProviderConfig,
  VideoRemoteOutput,
  VideoRemoteStatus,
  VideoRemoteTask,
  VideoRequestOptions,
  VideoSubmitInput
} from "./video-types.js";

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

interface OfficialVideoJob {
  id?: string;
  status?: string;
  model?: string;
  progress?: number;
  errorCode?: string;
  outputs?: Array<{ id?: string; kind?: "video" | "image"; role?: "result" | "last-frame"; mimeType?: string }>;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export const OFFICIAL_VIDEO_CAPABILITY: VideoProviderCapability = {
  provider: "official",
  modes: ["text-to-video", "image-to-video", "first-last-frame"],
  maxInputs: { images: 2, videos: 0, audios: 0 },
  supportsCancel: true,
  supportsProgress: true,
  supportsGeneratedAudio: true,
  supportsWatermarkControl: true,
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
  resolutions: ["480p", "720p", "1080p"],
  durationSeconds: { min: 1, max: 15, supportsAuto: false }
};

export class OfficialVideoProvider implements VideoProvider {
  readonly capability = OFFICIAL_VIDEO_CAPABILITY;
  readonly capabilityAppliesToAllModels = true;
  private readonly baseUrl: string;

  constructor(
    private readonly license: LicenseService,
    apiBaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 120_000
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async submit(input: VideoSubmitInput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    officialConfig(providerConfig);
    validateInput(input);
    const payload = {
      clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
      prompt: input.prompt.trim(),
      model: input.model?.trim() || undefined,
      mode: "generate",
      ratio: input.ratio || "16:9",
      resolution: input.resolution || "720p",
      durationSeconds: input.durationSeconds === "auto" ? 5 : input.durationSeconds || 5,
      generateAudio: input.generateAudio ?? false,
      watermark: input.watermark ?? false,
      inputs: (input.inputs ?? []).map((media) => ({
        id: media.id,
        kind: media.kind,
        role: media.role,
        name: media.name,
        mimeType: media.mimeType,
        dataBase64: media.bytes?.toString("base64")
      }))
    };
    const result = await this.postSignedJson<{ job?: OfficialVideoJob }>(
      "/official/videos/generate", "official.videos.generate", payload, options.signal
    );
    return taskFromJob(result.job, "官方视频模型");
  }

  async poll(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    officialConfig(providerConfig);
    assertTask(task);
    if (isTerminal(task.status)) return task;
    const result = await this.postSignedJson<{ job?: OfficialVideoJob }>(
      "/official/videos/status", "official.videos.status", { jobId: task.id }, options.signal
    );
    return taskFromJob(result.job, task.model, task.submittedAt);
  }

  async cancel(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoCancelResult> {
    officialConfig(providerConfig);
    assertTask(task);
    const result = await this.postSignedJson<{ job?: OfficialVideoJob; cancelled?: boolean; supported?: boolean; message?: string }>(
      "/official/videos/cancel", "official.videos.cancel", { jobId: task.id }, options.signal
    );
    return {
      supported: result.supported !== false,
      cancelled: result.cancelled === true,
      task: taskFromJob(result.job, task.model, task.submittedAt),
      message: result.message
    };
  }

  async download(output: VideoRemoteOutput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<DownloadedVideo> {
    officialConfig(providerConfig);
    const match = /^official-output:([^:]+):([^:]+)$/.exec(output.url);
    if (output.kind !== "video" || !match) throw new ProviderError("INVALID_REQUEST", "官方视频结果标识无效。");
    const payload = { jobId: match[1], outputId: match[2] };
    const response = await this.postSigned("/official/videos/download", "official.videos.download", payload, options.signal);
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || output.mimeType || "video/mp4";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new ProviderError("EMPTY_RESPONSE", "下载的官方视频为空。");
    return { bytes, mimeType, sourceUrl: output.url };
  }

  async testConnection(signal?: AbortSignal): Promise<void> {
    const status = await this.postSignedJson<CreditStatus>("/credits/status", "credits.status", {}, signal);
    if (!status.videoAvailable) throw new ProviderError("OFFICIAL_VIDEO_UNAVAILABLE", "官方视频服务暂不可用，请稍后重试。");
  }

  private async postSignedJson<T>(path: string, purpose: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.postSigned(path, purpose, payload, signal);
    try { return await response.json() as T; }
    catch { throw new ProviderError("INVALID_RESPONSE", "官方视频服务返回了无效数据。"); }
  }

  private async postSigned(path: string, purpose: string, payload: unknown, signal?: AbortSignal): Promise<Response> {
    const serializedPayload = JSON.stringify(payload);
    const auth: SignedRequestAuth = await this.license.createSignedRequest(purpose, serializedPayload);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: controller.signal
      });
      if (!response.ok) {
        const error = await officialError(response);
        if (response.status === 401) this.license.markCredentialRejected(error.message);
        throw error;
      }
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal?.aborted) throw new ProviderError("POLLING_STOPPED", "已停止本地等待；官方视频任务仍可能继续运行。");
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "官方视频服务请求超时，可稍后继续查询任务。");
      throw new ProviderError("NETWORK_ERROR", "无法连接官方视频服务，请检查网络后重试。");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function validateInput(input: VideoSubmitInput): void {
  if (input.mode === "remix" || input.mode === "extend") throw new ProviderError("UNSUPPORTED_VIDEO_MODE", "官方视频首版暂不支持续写或重混。");
  const inputs = input.inputs ?? [];
  if (inputs.some((media) => media.kind !== "image")) throw new ProviderError("INVALID_REQUEST", "官方视频首版仅支持图片首尾帧参考。");
  if (inputs.length > 2) throw new ProviderError("TOO_MANY_REFERENCES", "官方视频最多支持首帧和尾帧各一张图片。");
  if (inputs.some((media) => !media.bytes?.length)) throw new ProviderError("INVALID_REQUEST", "官方视频参考图片缺少可读取内容。");
}

function taskFromJob(job: OfficialVideoJob | undefined, fallbackModel: string, fallbackSubmittedAt?: string): VideoRemoteTask {
  if (!job?.id || !job.status) throw new ProviderError("INVALID_RESPONSE", "官方视频服务未返回任务 ID 或状态。");
  const submittedAt = job.createdAt || fallbackSubmittedAt || new Date().toISOString();
  const status = normalizeOfficialStatus(job.status);
  return {
    provider: "official",
    id: job.id,
    model: job.model || fallbackModel,
    status,
    submittedAt,
    updatedAt: job.updatedAt || job.completedAt || submittedAt,
    progress: job.progress,
    error: officialVideoErrorMessage(job.errorCode),
    rawStatus: job.status,
    outputs: job.outputs?.flatMap((output) => output.id && output.kind && output.role ? [{
      kind: output.kind,
      role: output.role,
      url: `official-output:${job.id}:${output.id}`,
      mimeType: output.mimeType
    }] : [])
  };
}

function officialVideoErrorMessage(code: string | undefined): string | undefined {
  const messages: Record<string, string> = {
    poll_failed: "官方视频上游状态查询连续失败，任务已结束并退还金豆。",
    missing_video_output: "官方视频任务未返回可用视频，任务已结束并退还金豆。",
    submit_failed: "官方视频任务提交失败，已退还金豆。",
    invalid_upstream_task: "官方视频服务未返回有效任务，已退还金豆。"
  };
  return code ? messages[code] ?? code : undefined;
}

function normalizeOfficialStatus(value: string): VideoRemoteStatus {
  const status = value.trim().toLowerCase().replaceAll("-", "_");
  if (["queued", "pending", "submitted", "created", "waiting"].includes(status)) return "queued";
  if (["running", "processing", "in_progress", "generating"].includes(status)) return "running";
  if (["succeeded", "success", "completed", "complete", "done"].includes(status)) return "succeeded";
  if (["failed", "failure", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (status === "expired") return "expired";
  throw new ProviderError("INVALID_RESPONSE", `官方视频服务返回了未知任务状态：${value}`);
}

function officialConfig(config: VideoProviderConfig): OfficialVideoProviderConfig {
  if (config.provider !== "official") throw new ProviderError("INVALID_CONFIG", "视频 Provider 配置与官方适配器不匹配。");
  return config;
}
function assertTask(task: VideoRemoteTask): void { if (task.provider !== "official" || !task.id) throw new ProviderError("INVALID_REQUEST", "官方视频任务快照无效。"); }
function isTerminal(status: VideoRemoteStatus): boolean { return ["succeeded", "failed", "cancelled", "expired"].includes(status); }
async function officialError(response: Response): Promise<ProviderError> {
  const body = await response.json().catch(() => ({})) as JsonRecord;
  const code = typeof body.code === "string" ? body.code : `HTTP_${response.status}`;
  const defaults: Record<string, string> = {
    insufficient_gold_beans: "金豆余额不足，请联系管理员添加金豆，或切换自定义视频 Provider。",
    // 兼容尚未升级错误码的服务端，但不再把官方视频余额描述为 Credit。
    insufficient_credits: "金豆余额不足，请联系管理员添加金豆，或切换自定义视频 Provider。",
    official_video_unavailable: "官方视频服务暂不可用，请稍后重试。",
    invalid_credential: "设备凭证已失效，请重新检查授权状态。",
    video_result_expired: "官方视频结果已过期，请重新生成。",
    HTTP_413: "视频参考图片自动缩小后仍超过官方服务限制，请更换图片后重试。"
  };
  const message = defaults[code] || (typeof body.message === "string" ? body.message : `官方视频请求失败（HTTP ${response.status}）。`);
  return new ProviderError(code, message, response.status);
}
