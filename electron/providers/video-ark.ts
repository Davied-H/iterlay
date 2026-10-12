import { ProviderError } from "./errors.js";
import type {
  ArkVideoProviderConfig,
  DownloadedVideo,
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

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_TIMEOUT_MS = 120_000;

export const ARK_VIDEO_CAPABILITY: VideoProviderCapability = {
  provider: "ark",
  modes: ["text-to-video", "image-to-video", "first-last-frame", "multi-reference", "remix", "extend"],
  maxInputs: { images: 9, videos: 3, audios: 3 },
  supportsCancel: false,
  supportsProgress: false,
  supportsGeneratedAudio: true,
  supportsWatermarkControl: true,
  ratios: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  resolutions: ["480p", "720p", "1080p"],
  durationSeconds: { min: 4, max: 15, supportsAuto: true }
};

export class ArkVideoProvider implements VideoProvider {
  readonly capability = ARK_VIDEO_CAPABILITY;
  readonly capabilityAppliesToAllModels = true;

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async submit(input: VideoSubmitInput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    const config = arkConfig(providerConfig);
    validateConfig(config);
    validateInput(input, this.capability);
    const model = (input.model || config.model).trim();
    if (!model) throw new ProviderError("INVALID_CONFIG", "请填写火山方舟视频模型。");

    const response = await this.request(tasksUrl(config), config, {
      method: "POST",
      headers: arkHeaders(config.apiKey, true),
      body: JSON.stringify(buildSubmitBody(input, model)),
      signal: options.signal
    });
    if (!response.ok) await throwArkError(response);
    const payload = unwrapPayload(await readJson(response));
    const id = stringValue(payload.id) || stringValue(payload.task_id);
    if (!id) throw new ProviderError("INVALID_RESPONSE", "火山方舟未返回视频任务 ID。");
    const now = new Date().toISOString();
    return {
      provider: "ark",
      id,
      model,
      status: normalizeStatus(stringValue(payload.status) || "queued"),
      submittedAt: now,
      updatedAt: now,
      rawStatus: stringValue(payload.status) || undefined
    };
  }

  async poll(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    const config = arkConfig(providerConfig);
    assertTask(task);
    validateConfig(config);
    if (isTerminal(task.status)) return task;
    const response = await this.request(`${tasksUrl(config)}/${encodeURIComponent(task.id)}`, config, {
      headers: arkHeaders(config.apiKey),
      signal: options.signal
    });
    if (!response.ok) await throwArkError(response);
    const payload = unwrapPayload(await readJson(response));
    const rawStatus = stringValue(payload.status) || task.rawStatus || "running";
    const status = normalizeStatus(rawStatus);
    const outputs = readOutputs(payload);
    const progress = numberValue(payload.progress);
    const error = readPayloadError(payload);
    return {
      ...task,
      status: outputs.some((item) => item.kind === "video") ? "succeeded" : status,
      updatedAt: new Date().toISOString(),
      rawStatus,
      ...(progress === undefined ? {} : { progress: Math.max(0, Math.min(100, progress)) }),
      ...(outputs.length ? { outputs } : {}),
      ...(error ? { error } : {})
    };
  }

  async cancel(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoCancelResult> {
    arkConfig(providerConfig);
    void options;
    assertTask(task);
    return {
      supported: false,
      cancelled: false,
      task,
      message: "火山方舟当前协议未提供可靠的远端取消接口；仅可停止本地等待，远端任务可能继续运行并计费。"
    };
  }

  async download(output: VideoRemoteOutput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<DownloadedVideo> {
    const config = arkConfig(providerConfig);
    if (output.kind !== "video" || !isHttpUrl(output.url)) {
      throw new ProviderError("INVALID_REQUEST", "视频结果地址无效。");
    }
    const response = await this.request(output.url, config, { signal: options.signal });
    if (!response.ok) await throwArkError(response, "DOWNLOAD_FAILED");
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || output.mimeType || "video/mp4";
    if (!mimeType.startsWith("video/") && mimeType !== "application/octet-stream") {
      throw new ProviderError("INVALID_RESPONSE", `下载结果不是视频文件（${mimeType}）。`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new ProviderError("EMPTY_RESPONSE", "下载的视频文件为空。");
    return { bytes, mimeType: mimeType === "application/octet-stream" ? "video/mp4" : mimeType, sourceUrl: output.url };
  }

  private async request(input: string, config: ArkVideoProviderConfig, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    const abort = () => controller.abort("caller");
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (init.signal?.aborted) throw new ProviderError("POLLING_STOPPED", "已停止本地等待；远端视频任务状态未改变。");
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "火山方舟请求超时，可稍后使用任务 ID 继续查询。");
      throw new ProviderError("NETWORK_ERROR", error instanceof Error ? error.message : "无法连接火山方舟，可稍后继续查询任务。");
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abort);
    }
  }
}

function arkConfig(config: VideoProviderConfig): ArkVideoProviderConfig {
  if (config.provider !== "ark") throw new ProviderError("INVALID_CONFIG", "视频 Provider 配置与火山方舟适配器不匹配。");
  return config;
}

export function buildSubmitBody(input: VideoSubmitInput, model: string): JsonRecord {
  const content: JsonRecord[] = [];
  if (input.prompt.trim()) content.push({ type: "text", text: input.prompt.trim() });
  for (const media of input.inputs || []) content.push(buildMediaContent(media));
  return {
    model,
    content,
    ratio: normalizeChoice(input.ratio, ARK_VIDEO_CAPABILITY.ratios, "adaptive"),
    resolution: normalizeChoice(input.resolution, ARK_VIDEO_CAPABILITY.resolutions, "720p"),
    duration: normalizeDuration(input.durationSeconds),
    generate_audio: input.generateAudio ?? false,
    watermark: input.watermark ?? false
  };
}

function buildMediaContent(media: VideoMediaInput): JsonRecord {
  const url = mediaUrl(media);
  if (media.kind === "image") return { type: "image_url", image_url: { url }, role: mediaRole(media) };
  if (media.kind === "video") return { type: "video_url", video_url: { url }, role: mediaRole(media) };
  return { type: "audio_url", audio_url: { url }, role: mediaRole(media) };
}

function mediaRole(media: VideoMediaInput): string {
  if (media.role === "first-frame") return "first_frame";
  if (media.role === "last-frame") return "last_frame";
  if (media.kind === "video") return "reference_video";
  if (media.kind === "audio") return "reference_audio";
  return "reference_image";
}

function mediaUrl(media: VideoMediaInput): string {
  if (media.url?.trim()) return media.url.trim();
  if (media.bytes?.length) return `data:${media.mimeType || "application/octet-stream"};base64,${media.bytes.toString("base64")}`;
  throw new ProviderError("INVALID_REQUEST", `${media.name || media.id} 缺少可读取的媒体内容。`);
}

function validateInput(input: VideoSubmitInput, capability: VideoProviderCapability): void {
  const items = input.inputs || [];
  if (!input.prompt.trim() && !items.some((item) => item.kind === "image" || item.kind === "video")) {
    throw new ProviderError("INVALID_REQUEST", "请输入视频描述，或提供图片/视频参考。");
  }
  const counts = {
    images: items.filter((item) => item.kind === "image").length,
    videos: items.filter((item) => item.kind === "video").length,
    audios: items.filter((item) => item.kind === "audio").length
  };
  if (counts.images > capability.maxInputs.images || counts.videos > capability.maxInputs.videos || counts.audios > capability.maxInputs.audios) {
    throw new ProviderError("TOO_MANY_REFERENCES", `最多支持 ${capability.maxInputs.images} 张图片、${capability.maxInputs.videos} 个视频和 ${capability.maxInputs.audios} 个音频参考。`);
  }
  const firstFrames = items.filter((item) => item.role === "first-frame");
  const lastFrames = items.filter((item) => item.role === "last-frame");
  if (firstFrames.length > 1 || lastFrames.length > 1) throw new ProviderError("INVALID_REQUEST", "首帧和尾帧各只能设置一张图片。");
  if ([...firstFrames, ...lastFrames].some((item) => item.kind !== "image")) throw new ProviderError("INVALID_REQUEST", "首帧和尾帧必须是图片。 ");
  if (lastFrames.length && !firstFrames.length) throw new ProviderError("INVALID_REQUEST", "设置尾帧时必须同时设置首帧。");
  if (items.some((item) => item.kind === "audio") && !items.some((item) => item.kind === "image" || item.kind === "video")) {
    throw new ProviderError("INVALID_REQUEST", "音频参考必须与图片或视频参考一起使用。");
  }
  if (items.some((item) => (
    (item.kind === "image" && !["first-frame", "last-frame", "reference-image"].includes(item.role))
    || (item.kind === "video" && item.role !== "reference-video")
    || (item.kind === "audio" && item.role !== "reference-audio")
  ))) {
    throw new ProviderError("INVALID_REQUEST", "媒体类型与视频参考角色不匹配。");
  }
  if ((input.mode === "remix" || input.mode === "extend") && !items.some((item) => item.kind === "video")) {
    throw new ProviderError("INVALID_REQUEST", `${input.mode === "remix" ? "Remix" : "Extend"} 模式必须提供源视频。`);
  }
}

function validateConfig(config: ArkVideoProviderConfig): void {
  if (!config.apiKey.trim()) throw new ProviderError("AUTH_ERROR", "请填写火山方舟 API Key。");
}

function assertTask(task: VideoRemoteTask): void {
  if (task.provider !== "ark" || !task.id) throw new ProviderError("INVALID_REQUEST", "视频任务快照无效。");
}

function tasksUrl(config: ArkVideoProviderConfig): string {
  const base = (config.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (/\/contents\/generations\/tasks$/i.test(base)) return base;
  return `${base}/contents/generations/tasks`;
}

function normalizeDuration(value: VideoSubmitInput["durationSeconds"]): number {
  if (value === "auto") return -1;
  const duration = Math.floor(Number(value) || 5);
  return Math.max(ARK_VIDEO_CAPABILITY.durationSeconds.min, Math.min(ARK_VIDEO_CAPABILITY.durationSeconds.max, duration));
}

function normalizeChoice(value: string | undefined, choices: string[], fallback: string): string {
  return value && choices.includes(value) ? value : fallback;
}

function normalizeStatus(value: string): VideoRemoteStatus {
  const status = value.toLowerCase();
  if (status === "succeeded" || status === "completed" || status === "success") return "succeeded";
  if (status === "failed" || status === "error") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "queued" || status === "pending" || status === "created") return "queued";
  return "running";
}

function readOutputs(payload: JsonRecord): VideoRemoteOutput[] {
  const content = isRecord(payload.content) ? payload.content : {};
  const videoUrl = [payload.video_url, payload.result_url, payload.url, content.video_url, content.url].find(isHttpUrl);
  const lastFrameUrl = [payload.last_frame_url, content.last_frame_url].find(isHttpUrl);
  return [
    ...(typeof videoUrl === "string" ? [{ kind: "video" as const, role: "result" as const, url: videoUrl, mimeType: "video/mp4" }] : []),
    ...(typeof lastFrameUrl === "string" ? [{ kind: "image" as const, role: "last-frame" as const, url: lastFrameUrl }] : [])
  ];
}

function readPayloadError(payload: JsonRecord): string {
  if (typeof payload.message === "string") return payload.message;
  if (isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  return "";
}

function unwrapPayload(payload: JsonRecord): JsonRecord {
  if (typeof payload.code === "number" && payload.code !== 0) throw new ProviderError(String(payload.code), readPayloadError(payload) || "火山方舟请求失败。");
  return isRecord(payload.data) ? payload.data : payload;
}

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const value = await response.json();
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new ProviderError("INVALID_RESPONSE", "火山方舟返回了无效 JSON。");
  }
}

async function throwArkError(response: Response, fallbackCode = "ARK_API_ERROR"): Promise<never> {
  const text = await response.text().catch(() => "");
  let detail = text || response.statusText || `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text) as JsonRecord;
    detail = readPayloadError(payload) || detail;
  } catch {
    // Preserve non-JSON response details.
  }
  if (response.status === 401 || response.status === 403) throw new ProviderError("AUTH_ERROR", "火山方舟 API Key 无效或没有该模型权限。", response.status);
  if (response.status === 429) throw new ProviderError("RATE_LIMITED", detail, response.status);
  if (response.status >= 500) throw new ProviderError("PROVIDER_UNAVAILABLE", detail, response.status);
  throw new ProviderError(fallbackCode, detail, response.status);
}

function arkHeaders(apiKey: string, json = false): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

function isTerminal(status: VideoRemoteStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired";
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}
