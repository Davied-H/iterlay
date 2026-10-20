import type { VideoProviderMode, VideoProviderModelOption } from "../../shared/types.js";
import type {
  DownloadedVideo,
  OpenRouterVideoProviderConfig,
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
import { normalizeVideoProviderModelOption } from "../../shared/video-provider-models.js";
import { parseOpenRouterVideoPricing } from "../../shared/model-pricing.js";
import { ProviderError } from "./errors.js";
const DEFAULT_BASE_URL = "https://openrouter.ai/api";
const DEFAULT_TIMEOUT_MS = 120_000;
export const OPENROUTER_VIDEO_CAPABILITY: VideoProviderCapability = {
    provider: "openrouter",
    modes: ["text-to-video", "image-to-video", "first-last-frame", "multi-reference"],
    maxInputs: { images: 9, videos: 0, audios: 0 },
    supportsCancel: false,
    supportsProgress: false,
    supportsGeneratedAudio: true,
    supportsWatermarkControl: false,
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"],
    resolutions: ["480p", "720p", "768p", "1080p", "1K", "2K", "4K"],
    durationSeconds: { min: 1, max: 60, supportsAuto: false }
};
export class OpenRouterVideoProvider implements VideoProvider {
    private readonly fetchImpl: typeof fetch;
    capability = OPENROUTER_VIDEO_CAPABILITY;
    capabilityAppliesToAllModels = false;
    constructor(fetchImpl: typeof fetch = fetch) {
        this.fetchImpl = fetchImpl;
    }
    async submit(input: VideoSubmitInput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
        const config = openRouterConfig(providerConfig);
        validateConfig(config);
        const model = (input.model || config.model).trim();
        if (!model)
            throw new ProviderError("INVALID_CONFIG", "请填写 OpenRouter 视频模型 ID。");
        const response = await this.request(`${apiRoot(config)}/videos`, config, {
            method: "POST",
            headers: headers(config.apiKey, true),
            body: JSON.stringify(buildOpenRouterVideoInput(input, model)),
            signal: options.signal
        });
        if (!response.ok)
            await throwOpenRouterError(response);
        const payload = await readJson(response);
        const id = stringValue(payload.id);
        const pollingUrl = resolveApiUrl(stringValue(payload.polling_url), config);
        if (!id || !pollingUrl)
            throw new ProviderError("INVALID_RESPONSE", "OpenRouter 未返回有效的视频任务 ID 或轮询地址。");
        return taskFromPayload(payload, model, new Date().toISOString(), config);
    }
    async poll(task: VideoRemoteTask, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<VideoRemoteTask> {
        const config = openRouterConfig(providerConfig);
        validateConfig(config);
        assertTask(task);
        if (isTerminal(task.status))
            return task;
        const endpoint = task.statusUrl || `${apiRoot(config)}/videos/${encodeURIComponent(task.id)}`;
        const response = await this.request(endpoint, config, { headers: headers(config.apiKey), signal: options.signal });
        if (!response.ok)
            await throwOpenRouterError(response);
        return taskFromPayload(await readJson(response), task.model, task.submittedAt, config, task);
    }
    async cancel(task: VideoRemoteTask, providerConfig: VideoProviderConfig): Promise<VideoCancelResult> {
        openRouterConfig(providerConfig);
        assertTask(task);
        return {
            supported: false,
            cancelled: false,
            task,
            message: "OpenRouter 当前视频生成协议未提供远端取消接口；仅可停止本地等待，远端任务可能继续运行并计费。"
        };
    }
    async download(output: VideoRemoteOutput, providerConfig: VideoProviderConfig, options: VideoRequestOptions = {}): Promise<DownloadedVideo> {
        const config = openRouterConfig(providerConfig);
        validateConfig(config);
        if (output.kind !== "video" || !/^https?:\/\//i.test(output.url)) {
            throw new ProviderError("INVALID_REQUEST", "OpenRouter 视频结果地址无效。");
        }
        const response = await this.request(output.url, config, {
            headers: isOpenRouterApiUrl(output.url, config) ? headers(config.apiKey) : undefined,
            signal: options.signal
        });
        if (!response.ok)
            await throwOpenRouterError(response);
        const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || output.mimeType || "video/mp4";
        if (!mimeType.startsWith("video/") && mimeType !== "application/octet-stream") {
            throw new ProviderError("INVALID_RESPONSE", `OpenRouter 下载结果不是视频文件（${mimeType}）。`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length)
            throw new ProviderError("EMPTY_RESPONSE", "OpenRouter 下载的视频文件为空。");
        return { bytes, mimeType: mimeType === "application/octet-stream" ? "video/mp4" : mimeType, sourceUrl: output.url };
    }
    async listModels(providerConfig: VideoProviderConfig, apiKeyOverride?: string): Promise<VideoProviderModelOption[]> {
        const original = openRouterConfig(providerConfig);
        const config = { ...original, apiKey: apiKeyOverride?.trim() || original.apiKey };
        const response = await this.request(`${apiRoot(config)}/videos/models`, config, {
            headers: config.apiKey.trim() ? headers(config.apiKey) : undefined
        });
        if (!response.ok)
            await throwOpenRouterError(response);
        const payload = await readJson(response);
        if (!Array.isArray(payload.data))
            throw new ProviderError("INVALID_RESPONSE", "OpenRouter 视频模型列表格式无效。");
        const seen = new Set<string>();
        return payload.data.flatMap((value) => {
            if (!isRecord(value))
                return [];
            const id = stringValue(value.id).trim();
            if (!id || seen.has(id))
                return [];
            seen.add(id);
            const capabilities = isRecord(value.capabilities) ? value.capabilities : undefined;
            const supportedModes = explicitModes(value, capabilities);
            const option = normalizeVideoProviderModelOption({
                id,
                ownedBy: id.split("/")[0] || undefined,
                pricing: parseOpenRouterVideoPricing(value.pricing_skus),
                requiresPrompt: typeof value.prompt_required === "boolean" ? value.prompt_required : undefined,
                supportsGeneratedAudio: typeof value.generate_audio === "boolean" ? value.generate_audio : undefined,
                supportedFrameImages: value.supported_frame_images,
                supportedDurations: value.supported_durations,
                supportedRatios: value.supported_aspect_ratios,
                supportedResolutions: value.supported_resolutions,
                ...(isRecord(value.capability) ? { capability: value.capability } : {}),
                ...(supportedModes ? { supportedModes } : {})
            });
            return option ? [option] : [];
        });
    }
    private async request(input: string, config: OpenRouterVideoProviderConfig, init: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort("timeout"), config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
        const abort = () => controller.abort("caller");
        init.signal?.addEventListener("abort", abort, { once: true });
        try {
            return await this.fetchImpl(input, { ...init, signal: controller.signal });
        }
        catch (error) {
            if (init.signal?.aborted)
                throw new ProviderError("POLLING_STOPPED", "已停止本地等待；OpenRouter 远端任务状态未改变。");
            if (controller.signal.aborted)
                throw new ProviderError("TIMEOUT", "OpenRouter 视频请求超时，可稍后继续查询任务。");
            throw new ProviderError("NETWORK_ERROR", error instanceof Error ? error.message : "无法连接 OpenRouter。");
        }
        finally {
            clearTimeout(timeout);
            init.signal?.removeEventListener("abort", abort);
        }
    }
}
export function buildOpenRouterVideoInput(input: VideoSubmitInput, model: string): Record<string, unknown> {
    const inputs = input.inputs || [];
    if (input.mode === "remix" || input.mode === "extend" || inputs.some((media) => media.kind !== "image")) {
        throw new ProviderError("INVALID_REQUEST", "OpenRouter 当前视频生成协议仅支持文本和图片参考，不支持视频或音频参考、Remix 或 Extend。");
    }
    const frameImages = inputs.filter((media) => media.role === "first-frame" || media.role === "last-frame");
    const inputReferences = inputs.filter((media) => !frameImages.includes(media));
    return {
        model,
        ...(input.prompt.trim() ? { prompt: input.prompt.trim() } : {}),
        ...(input.ratio ? { aspect_ratio: input.ratio } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.durationSeconds && input.durationSeconds !== "auto" ? { duration: Math.max(1, Math.floor(input.durationSeconds)) } : {}),
        ...(input.generateAudio !== undefined ? { generate_audio: input.generateAudio } : {}),
        ...(frameImages.length ? { frame_images: frameImages.map(buildFrameImage) } : {}),
        ...(inputReferences.length ? { input_references: inputReferences.map(buildInputReference) } : {})
    };
}
function buildFrameImage(media: VideoMediaInput): Record<string, unknown> {
    return {
        type: "image_url",
        image_url: { url: mediaUrl(media) },
        frame_type: media.role === "last-frame" ? "last_frame" : "first_frame"
    };
}
function buildInputReference(media: VideoMediaInput): Record<string, unknown> {
    return { type: "image_url", image_url: { url: mediaUrl(media) } };
}
function taskFromPayload(payload: Record<string, unknown>, model: string, submittedAt: string, config: OpenRouterVideoProviderConfig, previous?: VideoRemoteTask): VideoRemoteTask {
    const id = stringValue(payload.id) || previous?.id || "";
    if (!id)
        throw new ProviderError("INVALID_RESPONSE", "OpenRouter 视频任务响应缺少 ID。");
    const rawStatus = stringValue(payload.status) || previous?.rawStatus || "pending";
    const status = normalizeStatus(rawStatus);
    const unsignedUrl = Array.isArray(payload.unsigned_urls) ? payload.unsigned_urls.find(isHttpUrl) : undefined;
    const outputUrl = unsignedUrl || (status === "succeeded" ? `${apiRoot(config)}/videos/${encodeURIComponent(id)}/content?index=0` : undefined);
    return {
        ...(previous || {}),
        provider: "openrouter",
        id,
        model,
        status,
        submittedAt,
        updatedAt: new Date().toISOString(),
        rawStatus,
        statusUrl: resolveApiUrl(stringValue(payload.polling_url), config) || previous?.statusUrl || `${apiRoot(config)}/videos/${encodeURIComponent(id)}`,
        ...(stringValue(payload.error) ? { error: stringValue(payload.error) } : {}),
        ...(outputUrl ? { outputs: [{ kind: "video", role: "result", url: outputUrl, mimeType: "video/mp4" }] } : {})
    };
}
function openRouterConfig(config: VideoProviderConfig): OpenRouterVideoProviderConfig {
    if (config.provider !== "openrouter")
        throw new ProviderError("INVALID_CONFIG", "视频 Provider 配置与 OpenRouter 适配器不匹配。");
    return config;
}
function validateConfig(config: OpenRouterVideoProviderConfig): void {
    if (!config.apiKey.trim())
        throw new ProviderError("AUTH_ERROR", "请填写 OpenRouter API Key。");
}
function assertTask(task: VideoRemoteTask): void {
    if (task.provider !== "openrouter" || !task.id)
        throw new ProviderError("INVALID_REQUEST", "OpenRouter 视频任务快照无效。");
}
export function openRouterVideoApiRoot(baseUrl = DEFAULT_BASE_URL): string {
    const base = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
    if (/\/api\/v1$/i.test(base) || /\/v1$/i.test(base))
        return base;
    return `${base}/v1`;
}
function apiRoot(config: OpenRouterVideoProviderConfig): string { return openRouterVideoApiRoot(config.baseUrl); }
function resolveApiUrl(value: string, config: OpenRouterVideoProviderConfig): string | undefined {
    if (/^https?:\/\//i.test(value))
        return value;
    if (!value.startsWith("/"))
        return undefined;
    return new URL(value, `${new URL(apiRoot(config)).origin}/`).toString();
}
function isOpenRouterApiUrl(value: string, config: OpenRouterVideoProviderConfig): boolean {
    try {
        const url = new URL(value);
        const root = new URL(apiRoot(config));
        return url.origin === root.origin && url.pathname.startsWith(`${root.pathname}/videos/`);
    }
    catch {
        return false;
    }
}
function mediaUrl(media: VideoMediaInput): string {
    if (media.url?.trim())
        return media.url.trim();
    if (media.bytes?.length)
        return `data:${media.mimeType || "application/octet-stream"};base64,${media.bytes.toString("base64")}`;
    throw new ProviderError("INVALID_REQUEST", `${media.name || media.id} 缺少可读取的媒体内容。`);
}
function headers(apiKey: string, json = false): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}
function normalizeStatus(value: string): VideoRemoteStatus {
    const status = value.toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success")
        return "succeeded";
    if (status === "failed" || status === "error")
        return "failed";
    if (status === "cancelled" || status === "canceled")
        return "cancelled";
    if (status === "expired")
        return "expired";
    if (status === "pending" || status === "queued" || status === "created")
        return "queued";
    return "running";
}
function isTerminal(status: VideoRemoteStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired";
}
async function readJson(response: Response): Promise<Record<string, unknown>> {
    const value = await response.json().catch(() => null);
    if (!isRecord(value))
        throw new ProviderError("INVALID_RESPONSE", "OpenRouter 返回了无效 JSON。");
    return value;
}
async function throwOpenRouterError(response: Response): Promise<never> {
    const payload = await response.json().catch(() => ({}));
    const nested = isRecord(payload.error) ? payload.error : {};
    const detail = stringValue(nested.message) || stringValue(payload.error) || stringValue(payload.message) || `OpenRouter 请求失败（HTTP ${response.status}）。`;
    const code = response.status === 401 || response.status === 403
        ? "AUTH_ERROR"
        : response.status === 402
            ? "INSUFFICIENT_CREDITS"
            : response.status === 429
                ? "RATE_LIMITED"
                : response.status >= 500
                    ? "PROVIDER_UNAVAILABLE"
                    : "OPENROUTER_API_ERROR";
    throw new ProviderError(code, detail, response.status);
}
function explicitModes(value: Record<string, unknown>, capabilities: Record<string, unknown> | undefined): VideoProviderMode[] | undefined {
    const candidate = value.supportedModes ?? value.supported_modes ?? capabilities?.modes ?? capabilities?.supportedModes ?? capabilities?.supported_modes;
    return Array.isArray(candidate) ? candidate.filter((mode): mode is VideoProviderMode => typeof mode === "string") : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function isHttpUrl(value: unknown): value is string { return typeof value === "string" && /^https?:\/\//i.test(value); }
