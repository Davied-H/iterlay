import type { VideoProviderModelOption } from "../../shared/types.js";
import { normalizeVideoProviderModelOption } from "../../shared/video-provider-models.js";
import { ProviderError } from "./errors.js";
import type {
  DownloadedVideo,
  MiniMaxVideoProviderConfig,
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

const DEFAULT_BASE_URL = "https://api.minimax.io";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_PROMPT = "让画面自然动起来，保持主体、构图与场景一致，镜头运动平稳。";

export const MINIMAX_H3_CAPABILITY: VideoProviderCapability = {
  provider: "minimax",
  modes: ["text-to-video", "image-to-video", "first-last-frame", "multi-reference"],
  maxInputs: { images: 9, videos: 3, audios: 3 },
  supportsCancel: true,
  supportsProgress: false,
  supportsGeneratedAudio: false,
  supportsWatermarkControl: false,
  ratios: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  resolutions: ["768P", "2K"],
  durationSeconds: { min: 4, max: 15, supportsAuto: false }
};

export const MINIMAX_H3_MAX_CAPABILITY: VideoProviderCapability = {
  ...MINIMAX_H3_CAPABILITY,
  resolutions: ["480P", "768P"],
  durationSeconds: { min: 5, max: 15, supportsAuto: false }
};

export class MiniMaxVideoProvider implements VideoProvider {
  readonly capability = MINIMAX_H3_CAPABILITY;
  readonly capabilityAppliesToAllModels = false;

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async submit(input: VideoSubmitInput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    const config = minimaxConfig(providerConfig);
    validateConfig(config);
    const model = normalizeModel(input.model || config.model);
    const capability = capabilityForModel(model);
    validateInput(input, capability);
    const response = await this.request(`${baseUrl(config)}/v2/video_generation`, config, {
      method: "POST",
      headers: headers(config.apiKey, true),
      body: JSON.stringify(buildMiniMaxVideoInput(input, model)),
      signal: options.signal
    });
    if (!response.ok) await throwMiniMaxError(response);
    const payload = await readJson(response);
    const id = stringValue(payload.task_id);
    if (!id) throw new ProviderError("INVALID_RESPONSE", "MiniMax 未返回视频任务 ID。");
    const now = new Date().toISOString();
    return { provider: "minimax", id, model, status: "queued", submittedAt: now, updatedAt: now, rawStatus: "queued" };
  }

  async poll(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
    const config = minimaxConfig(providerConfig);
    validateConfig(config);
    assertTask(task);
    if (isTerminal(task.status)) return task;
    const response = await this.request(`${baseUrl(config)}/v2/query/video_generation/${encodeURIComponent(task.id)}`, config, {
      headers: headers(config.apiKey),
      signal: options.signal
    });
    if (!response.ok) await throwMiniMaxError(response);
    const payload = await readJson(response);
    const taskPayload = isRecord(payload.task) ? payload.task : payload;
    const rawStatus = stringValue(taskPayload.status) || task.rawStatus || "running";
    const status = normalizeStatus(rawStatus);
    const errorPayload = isRecord(taskPayload.error) ? taskPayload.error : {};
    return {
      ...task,
      status,
      rawStatus,
      updatedAt: new Date().toISOString(),
      error: stringValue(errorPayload.message) || undefined,
      outputs: readOutputs(taskPayload)
    };
  }

  async cancel(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoCancelResult> {
    const config = minimaxConfig(providerConfig);
    validateConfig(config);
    assertTask(task);
    const response = await this.request(`${baseUrl(config)}/v2/video_generation/${encodeURIComponent(task.id)}`, config, {
      method: "DELETE",
      headers: headers(config.apiKey),
      signal: options.signal
    });
    if (!response.ok) await throwMiniMaxError(response);
    return { supported: true, cancelled: true, task: { ...task, status: "cancelled", updatedAt: new Date().toISOString() } };
  }

  async download(output: VideoRemoteOutput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<DownloadedVideo> {
    const config = minimaxConfig(providerConfig);
    validateConfig(config);
    if (output.kind !== "video" || !/^https?:\/\//i.test(output.url)) {
      throw new ProviderError("INVALID_REQUEST", "MiniMax 视频结果地址无效。");
    }
    const response = await this.request(output.url, config, { signal: options.signal });
    if (!response.ok) await throwMiniMaxError(response);
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || output.mimeType || "video/mp4";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new ProviderError("EMPTY_RESPONSE", "下载的 MiniMax 视频为空。");
    return { bytes, mimeType: mimeType === "application/octet-stream" ? "video/mp4" : mimeType, sourceUrl: output.url };
  }

  async listModels(providerConfig: VideoProviderConfig, apiKeyOverride?: string): Promise<VideoProviderModelOption[]> {
    const config = minimaxConfig(providerConfig);
    const fallback = [
      modelOption("MiniMax-H3", MINIMAX_H3_CAPABILITY),
      modelOption("MiniMax-H3-Max", MINIMAX_H3_MAX_CAPABILITY)
    ];
    const apiKey = apiKeyOverride?.trim() || config.apiKey.trim();
    if (!apiKey) return fallback;
    try {
      const response = await this.request(`${baseUrl(config)}/v1/models`, config, {
        headers: headers(apiKey)
      });
      if (!response.ok) return fallback;
      const payload = await readJson(response);
      const remote = Array.isArray(payload.data)
        ? payload.data.flatMap((item) => {
            if (!isRecord(item)) return [];
            const id = stringValue(item.id);
            if (!/h3|hailuo/i.test(id)) return [];
            const capability = capabilityForModel(id);
            return [modelOption(id, capability)];
          })
        : [];
      const seen = new Set<string>();
      return [...remote, ...fallback].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    } catch {
      return fallback;
    }
  }

  private async request(input: string, config: MiniMaxVideoProviderConfig, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    const abort = () => controller.abort("caller");
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (init.signal?.aborted) throw new ProviderError("POLLING_STOPPED", "已停止本地等待；MiniMax 远端任务状态未改变。");
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "MiniMax 视频请求超时，可稍后继续查询任务。");
      throw new ProviderError("NETWORK_ERROR", error instanceof Error ? error.message : "无法连接 MiniMax。");
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abort);
    }
  }
}

export function buildMiniMaxVideoInput(input: VideoSubmitInput, model: string): JsonRecord {
  const items: JsonRecord[] = [{ type: "text", text: input.prompt.trim() || DEFAULT_PROMPT }];
  let hasFrame = false;
  for (const media of input.inputs ?? []) {
    if (media.role === "first-frame" || media.role === "last-frame") hasFrame = true;
    items.push(buildContentItem(media));
  }
  return {
    model,
    content: items,
    resolution: normalizeResolution(input.resolution, model),
    duration: normalizeDuration(input.durationSeconds, model),
    ratio: hasFrame ? "adaptive" : normalizeRatio(input.ratio)
  };
}

function buildContentItem(media: VideoMediaInput): JsonRecord {
  const url = mediaUrl(media);
  if (media.kind === "image") return { type: "image_url", image_url: { url }, role: media.role.replace("-", "_") };
  if (media.kind === "video") return { type: "video_url", video_url: { url }, role: "reference_video" };
  return { type: "audio_url", audio_url: { url }, role: "reference_audio" };
}

function validateInput(input: VideoSubmitInput, capability: VideoProviderCapability): void {
  if (input.mode === "remix" || input.mode === "extend") {
    throw new ProviderError("UNSUPPORTED_VIDEO_MODE", "MiniMax 当前不支持 Remix 或 Extend。");
  }
  const inputs = input.inputs ?? [];
  const hasFrameInput = inputs.some((item) => item.role === "first-frame" || item.role === "last-frame");
  const hasReferenceInput = inputs.some((item) => (
    item.role === "reference-image" || item.role === "reference-video" || item.role === "reference-audio"
  ));
  if (hasFrameInput && hasReferenceInput) {
    throw new ProviderError("INVALID_REQUEST", "MiniMax 首尾帧输入不能与参考素材混用。");
  }
  const counts = {
    images: inputs.filter((item) => item.kind === "image").length,
    videos: inputs.filter((item) => item.kind === "video").length,
    audios: inputs.filter((item) => item.kind === "audio").length
  };
  if (counts.images > capability.maxInputs.images || counts.videos > capability.maxInputs.videos || counts.audios > capability.maxInputs.audios) {
    throw new ProviderError("TOO_MANY_REFERENCES", "MiniMax 参考素材数量超出限制。");
  }
  if (inputs.some((item) => !mediaUrlAvailable(item))) {
    throw new ProviderError("INVALID_REQUEST", "MiniMax 参考素材缺少可读取内容。");
  }
  if (inputs.some((item) => (item.role === "first-frame" || item.role === "last-frame") && item.kind !== "image")) {
    throw new ProviderError("INVALID_REQUEST", "MiniMax 首帧和尾帧必须是图片。");
  }
  if (inputs.filter((item) => item.role === "first-frame").length > 1 || inputs.filter((item) => item.role === "last-frame").length > 1) {
    throw new ProviderError("INVALID_REQUEST", "MiniMax 首帧和尾帧各只能设置一张图片。");
  }
  if (inputs.some((item) => item.role === "last-frame") && !inputs.some((item) => item.role === "first-frame")) {
    throw new ProviderError("INVALID_REQUEST", "MiniMax 设置尾帧时必须同时设置首帧。");
  }
}

function minimaxConfig(config: VideoProviderConfig): MiniMaxVideoProviderConfig {
  if (config.provider !== "minimax") throw new ProviderError("INVALID_CONFIG", "视频 Provider 配置与 MiniMax 适配器不匹配。");
  return config;
}

function validateConfig(config: MiniMaxVideoProviderConfig): void {
  if (!config.apiKey.trim()) throw new ProviderError("AUTH_ERROR", "请填写 MiniMax API Key。");
}

function assertTask(task: VideoRemoteTask): void {
  if (task.provider !== "minimax" || !task.id) throw new ProviderError("INVALID_REQUEST", "MiniMax 视频任务快照无效。");
}

function capabilityForModel(model: string): VideoProviderCapability {
  return model.toLowerCase() === "minimax-h3-max" ? MINIMAX_H3_MAX_CAPABILITY : MINIMAX_H3_CAPABILITY;
}

function modelOption(id: string, capability: VideoProviderCapability): VideoProviderModelOption {
  return normalizeVideoProviderModelOption({
    id,
    supportedModes: capability.modes,
    capability,
    pricingLabel: id.toLowerCase() === "minimax-h3-max" ? "¥0.34–¥0.54 / 秒" : "¥0.54–¥0.88 / 秒"
  })!;
}

function normalizeModel(model: string): string {
  const value = model.trim();
  if (value.toLowerCase() === "minimax-h3") return "MiniMax-H3";
  if (value.toLowerCase() === "minimax-h3-max") return "MiniMax-H3-Max";
  return value;
}

function normalizeResolution(value: string | undefined, model: string): string {
  const h3Max = model.toLowerCase() === "minimax-h3-max";
  const normalized = (value || "").toUpperCase();
  if (normalized === "480P" || normalized === "480") return "480P";
  if (normalized === "2K" || normalized === "1080P" || normalized === "1080") return h3Max ? "768P" : "2K";
  return h3Max ? "768P" : "768P";
}

function normalizeDuration(value: VideoSubmitInput["durationSeconds"], model: string): number {
  const minimum = model.toLowerCase() === "minimax-h3-max" ? 5 : 4;
  const seconds = value === "auto" ? minimum : Math.floor(Number(value) || minimum);
  return Math.max(minimum, Math.min(15, seconds));
}

function normalizeRatio(value: string | undefined): string {
  return ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(value || "") ? value! : "16:9";
}

function mediaUrl(media: VideoMediaInput): string {
  if (media.url?.trim()) return media.url.trim();
  if (media.bytes?.length) return `data:${media.mimeType || "application/octet-stream"};base64,${media.bytes.toString("base64")}`;
  throw new ProviderError("INVALID_REQUEST", `${media.name || media.id} 缺少可读取的媒体内容。`);
}

function mediaUrlAvailable(media: VideoMediaInput): boolean {
  return Boolean(media.url?.trim() || media.bytes?.length);
}

function readOutputs(payload: JsonRecord): VideoRemoteOutput[] {
  const content = isRecord(payload.content) ? payload.content : {};
  const url = stringValue(content.url);
  return isHttpUrl(url) ? [{ kind: "video", role: "result", url, mimeType: "video/mp4" }] : [];
}

function normalizeStatus(value: string): VideoRemoteStatus {
  const status = value.toLowerCase();
  if (status === "succeeded" || status === "success" || status === "completed") return "succeeded";
  if (status === "failed" || status === "error") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "queued" || status === "pending") return "queued";
  return "running";
}

function isTerminal(status: VideoRemoteStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired";
}

function baseUrl(config: MiniMaxVideoProviderConfig): string {
  return (config.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function headers(apiKey: string, json = false): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function readJson(response: Response): Promise<JsonRecord> {
  const value = await response.json().catch(() => null);
  if (!isRecord(value)) throw new ProviderError("INVALID_RESPONSE", "MiniMax 返回了无效 JSON。");
  return value;
}

async function throwMiniMaxError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  const nested = isRecord(payload.error) ? payload.error : {};
  const detail = stringValue(nested.message) || stringValue(payload.message) || `MiniMax 请求失败（HTTP ${response.status}）。`;
  const code = response.status === 401 || response.status === 403
    ? "AUTH_ERROR"
    : response.status === 429
      ? "RATE_LIMITED"
      : response.status >= 500
        ? "PROVIDER_UNAVAILABLE"
        : "MINIMAX_API_ERROR";
  throw new ProviderError(code, detail, response.status);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
