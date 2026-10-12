import { ProviderError } from "./errors.js";
import type {
  DownloadedVideo,
  FalVideoProviderConfig,
  VideoCancelResult,
  VideoMediaInput,
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

const DEFAULT_BASE_URL = "https://queue.fal.run";
const DEFAULT_TIMEOUT_MS = 120_000;
export const SEEDANCE_2_DEFAULT_IMAGE_PROMPT = "在首尾画面之间自然过渡，保持主体与场景一致。";

export const FAL_VIDEO_CAPABILITY: VideoProviderCapability = {
  provider: "fal",
  modes: ["text-to-video", "image-to-video", "first-last-frame", "remix", "extend"],
  maxInputs: { images: 2, videos: 1, audios: 0 },
  supportsCancel: true,
  supportsProgress: true,
  supportsGeneratedAudio: true,
  supportsWatermarkControl: false,
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
  resolutions: ["480p", "720p", "1080p"],
  durationSeconds: { min: 1, max: 15, supportsAuto: false }
};

export class FalVideoProvider implements VideoProvider {
  readonly capability = FAL_VIDEO_CAPABILITY;
  readonly capabilityAppliesToAllModels = true;

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async submit(input: VideoSubmitInput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    const config = falConfig(providerConfig);
    validateConfig(config);
    const model = (input.model || config.model).trim().replace(/^\/+|\/+$/g, "");
    if (!model) throw new ProviderError("INVALID_CONFIG", "请填写 fal.ai 视频模型 ID。");
    const endpoint = `${baseUrl(config)}/${model}`;
    const response = await this.request(endpoint, config, {
      method: "POST",
      headers: falHeaders(config.apiKey, true),
      body: JSON.stringify(buildFalVideoInput(input, model)),
      signal: options.signal
    });
    if (!response.ok) await throwFalError(response);
    const payload = await readJson(response);
    const requestId = stringValue(payload.request_id);
    if (!requestId) throw new ProviderError("INVALID_RESPONSE", "fal.ai 未返回 request_id，请检查视频模型 ID。");
    const now = new Date().toISOString();
    return {
      provider: "fal",
      id: requestId,
      model,
      status: normalizeFalStatus(stringValue(payload.status) || "IN_QUEUE"),
      submittedAt: now,
      updatedAt: now,
      rawStatus: stringValue(payload.status) || undefined,
      statusUrl: httpUrl(payload.status_url),
      responseUrl: httpUrl(payload.response_url),
      cancelUrl: httpUrl(payload.cancel_url)
    };
  }

  async poll(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    const config = falConfig(providerConfig);
    assertTask(task);
    const endpoint = `${baseUrl(config)}/${task.model}/requests/${encodeURIComponent(task.id)}`;
    const statusResponse = await this.request(task.statusUrl || `${endpoint}/status`, config, { headers: falHeaders(config.apiKey), signal: options.signal });
    if (!statusResponse.ok) await throwFalError(statusResponse);
    const statusPayload = await readJson(statusResponse);
    const rawStatus = stringValue(statusPayload.status) || task.rawStatus || "IN_PROGRESS";
    const status = normalizeFalStatus(rawStatus);
    if (status !== "succeeded") {
      return {
        ...task,
        status,
        rawStatus,
        updatedAt: new Date().toISOString(),
        ...(numberValue(statusPayload.progress) === undefined ? {} : { progress: numberValue(statusPayload.progress) })
      };
    }
    const resultResponse = await this.request(task.responseUrl || endpoint, config, { headers: falHeaders(config.apiKey), signal: options.signal });
    if (!resultResponse.ok) await throwFalError(resultResponse);
    const result = await readJson(resultResponse);
    const outputs = readFalOutputs(result);
    if (!outputs.some((output) => output.kind === "video")) throw new ProviderError("INVALID_RESPONSE", "fal.ai 任务完成但未返回视频地址。");
    return { ...task, status: "succeeded", rawStatus, outputs, updatedAt: new Date().toISOString(), progress: 100 };
  }

  async cancel(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoCancelResult> {
    const config = falConfig(providerConfig);
    assertTask(task);
    const url = task.cancelUrl || `${baseUrl(config)}/${task.model}/requests/${encodeURIComponent(task.id)}/cancel`;
    const response = await this.request(url, config, { method: "PUT", headers: falHeaders(config.apiKey), signal: options.signal });
    if (!response.ok) await throwFalError(response);
    return { supported: true, cancelled: true, task: { ...task, status: "cancelled", updatedAt: new Date().toISOString() } };
  }

  async download(output: VideoRemoteOutput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<DownloadedVideo> {
    const config = falConfig(providerConfig);
    if (output.kind !== "video" || !/^https?:\/\//i.test(output.url)) throw new ProviderError("INVALID_REQUEST", "fal.ai 视频结果地址无效。");
    const response = await this.request(output.url, config, { signal: options.signal });
    if (!response.ok) await throwFalError(response);
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || output.mimeType || "video/mp4";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new ProviderError("EMPTY_RESPONSE", "下载的 fal.ai 视频为空。");
    return { bytes, mimeType: mimeType === "application/octet-stream" ? "video/mp4" : mimeType, sourceUrl: output.url };
  }

  private async request(input: string, config: FalVideoProviderConfig, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    const abort = () => controller.abort("caller");
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (init.signal?.aborted) throw new ProviderError("POLLING_STOPPED", "已停止本地等待；fal.ai 远端任务状态未改变。");
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "fal.ai 视频请求超时，可稍后继续查询任务。");
      throw new ProviderError("NETWORK_ERROR", error instanceof Error ? error.message : "无法连接 fal.ai。");
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abort);
    }
  }
}

export function buildFalVideoInput(input: VideoSubmitInput, model = ""): JsonRecord {
  const firstFrame = findMedia(input.inputs, "first-frame") || findMedia(input.inputs, "reference-image");
  const lastFrame = findMedia(input.inputs, "last-frame");
  const sourceVideo = findMedia(input.inputs, "reference-video");
  return {
    prompt: normalizeFalVideoPrompt(input.prompt, model, Boolean(firstFrame || lastFrame)),
    ...(firstFrame ? { image_url: mediaUrl(firstFrame) } : {}),
    ...(lastFrame ? { end_image_url: mediaUrl(lastFrame) } : {}),
    ...(sourceVideo ? { video_url: mediaUrl(sourceVideo) } : {}),
    ...(input.ratio ? { aspect_ratio: input.ratio } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.durationSeconds && input.durationSeconds !== "auto"
      ? { duration: seedance2Model(model) ? String(input.durationSeconds) : input.durationSeconds }
      : {}),
    ...(input.generateAudio !== undefined ? { generate_audio: input.generateAudio } : {})
  };
}

export function normalizeFalVideoPrompt(prompt: string, model: string, hasImageInput: boolean): string {
  const trimmed = prompt.trim();
  if (trimmed || !seedance2Model(model) || !hasImageInput) return trimmed;
  return SEEDANCE_2_DEFAULT_IMAGE_PROMPT;
}

function findMedia(inputs: VideoMediaInput[] | undefined, role: VideoMediaInput["role"]): VideoMediaInput | undefined {
  return inputs?.find((input) => input.role === role);
}

function mediaUrl(media: VideoMediaInput): string {
  if (media.url?.trim()) return media.url.trim();
  if (media.bytes?.length) return `data:${media.mimeType || "application/octet-stream"};base64,${media.bytes.toString("base64")}`;
  throw new ProviderError("INVALID_REQUEST", `${media.name || media.id} 缺少可读取的媒体内容。`);
}

function readFalOutputs(payload: JsonRecord): VideoRemoteOutput[] {
  const video = isRecord(payload.video) ? payload.video : {};
  const output = isRecord(payload.output) ? payload.output : {};
  const videoUrl = [video.url, output.url, payload.video_url, payload.url].find(isHttpUrl);
  const imageUrl = [payload.last_frame_url, payload.end_image_url].find(isHttpUrl);
  return [
    ...(typeof videoUrl === "string" ? [{ kind: "video" as const, role: "result" as const, url: videoUrl, mimeType: stringValue(video.content_type) || "video/mp4" }] : []),
    ...(typeof imageUrl === "string" ? [{ kind: "image" as const, role: "last-frame" as const, url: imageUrl }] : [])
  ];
}

function falConfig(config: VideoProviderConfig): FalVideoProviderConfig {
  if (config.provider !== "fal") throw new ProviderError("INVALID_CONFIG", "视频 Provider 配置与 fal.ai 适配器不匹配。");
  return config;
}
function validateConfig(config: FalVideoProviderConfig): void {
  if (!config.apiKey.trim()) throw new ProviderError("AUTH_ERROR", "请填写 fal.ai API Key。");
}
function assertTask(task: VideoRemoteTask): void {
  if (task.provider !== "fal" || !task.id || !task.model) throw new ProviderError("INVALID_REQUEST", "fal.ai 视频任务快照无效。");
}
function baseUrl(config: FalVideoProviderConfig): string { return (config.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, ""); }
function falHeaders(apiKey: string, json = false): Record<string, string> { return { Authorization: `Key ${apiKey}`, ...(json ? { "Content-Type": "application/json" } : {}) }; }
function normalizeFalStatus(value: string): VideoRemoteStatus {
  if (value === "COMPLETED") return "succeeded";
  if (value === "IN_QUEUE") return "queued";
  if (value === "IN_PROGRESS") return "running";
  if (value === "CANCELLED" || value === "CANCELED") return "cancelled";
  if (value === "FAILED") return "failed";
  return "running";
}
async function readJson(response: Response): Promise<JsonRecord> {
  const value = await response.json().catch(() => null);
  if (!isRecord(value)) throw new ProviderError("INVALID_RESPONSE", "fal.ai 返回了无效 JSON。");
  return value;
}
async function throwFalError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  const detail = falErrorDetail(payload) || `fal.ai 请求失败（HTTP ${response.status}）。`;
  const code = response.status === 401 || response.status === 403 ? "AUTH_ERROR" : response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "FAL_API_ERROR";
  throw new ProviderError(code, detail, response.status);
}
function seedance2Model(model: string): boolean { return /(?:^|\/)seedance-2\.0(?:\/|$)/i.test(model); }
function falErrorDetail(payload: JsonRecord): string {
  const direct = stringValue(payload.error) || stringValue(payload.message) || stringValue(payload.detail);
  if (direct) return direct;
  if (!Array.isArray(payload.detail)) return "";
  return payload.detail.map((issue) => {
    if (!isRecord(issue)) return "";
    const message = stringValue(issue.msg) || stringValue(issue.message);
    if (!message) return "";
    const location = Array.isArray(issue.loc)
      ? issue.loc.filter((part) => typeof part === "string" || typeof part === "number").join(".")
      : "";
    return location ? `${location}: ${message}` : message;
  }).filter(Boolean).join("；");
}
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isHttpUrl(value: unknown): value is string { return typeof value === "string" && /^https?:\/\//i.test(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined; }
function httpUrl(value: unknown): string | undefined { return typeof value === "string" && /^https:\/\//i.test(value) ? value : undefined; }
