import type { VideoProviderModelOption } from "../shared/types.js";
import {
findVideoProviderModelOption,
videoProviderModelOptionFromCapability
} from "../shared/video-provider-models.js";
import { ProviderError,normalizeProviderError } from "./providers/errors.js";
import { ArkVideoProvider } from "./providers/video-ark.js";
import { FalVideoProvider } from "./providers/video-fal.js";
import { MiniMaxVideoProvider } from "./providers/video-minimax.js";
import { OpenRouterVideoProvider } from "./providers/video-openrouter.js";
import type {
DownloadedVideo,
VideoCancelResult,
VideoProvider,
VideoProviderConfig,
VideoRemoteOutput,
VideoRemoteTask,
VideoSubmitInput
} from "./providers/video-types.js";

export interface WaitForVideoOptions {
  signal?: AbortSignal;
  pollIntervalMs?: number;
  onUpdate?: (task: VideoRemoteTask) => void;
}

export type VideoSubmitInputNormalizer = (
  input: VideoSubmitInput,
  config: VideoProviderConfig
) => Promise<VideoSubmitInput> | VideoSubmitInput;

export class VideoTaskServiceError extends ProviderError {
  constructor(
    code: string,
    message: string,
    public readonly task: VideoRemoteTask,
    public readonly recoverable: boolean,
    status?: number
  ) {
    super(code, message, status);
    this.name = "VideoTaskServiceError";
  }
}

/** Stateless orchestration around serializable remote task snapshots. */
export class VideoGenerationService {
  private readonly providers: Map<VideoRemoteTask["provider"], VideoProvider>;

  constructor(
    providers: VideoProvider[] = [new ArkVideoProvider(), new FalVideoProvider(), new OpenRouterVideoProvider(), new MiniMaxVideoProvider()],
    private readonly normalizeSubmitInput: VideoSubmitInputNormalizer = (input) => input
  ) {
    this.providers = new Map(providers.map((provider) => [provider.capability.provider, provider]));
  }

  capability(provider: VideoRemoteTask["provider"] = "ark") {
    return this.provider(provider).capability;
  }

  async listModels(config: VideoProviderConfig, apiKeyOverride?: string): Promise<VideoProviderModelOption[]> {
    const provider = this.provider(config.provider);
    if (provider.listModels) return provider.listModels(config, apiKeyOverride);
    return provider.capabilityAppliesToAllModels
      ? [videoProviderModelOptionFromCapability(config.model, provider.capability)]
      : [{ id: config.model }];
  }

  async modelOption(config: VideoProviderConfig): Promise<VideoProviderModelOption | undefined> {
    const provider = this.provider(config.provider);
    if (provider.capabilityAppliesToAllModels) {
      return videoProviderModelOptionFromCapability(config.model, provider.capability);
    }
    return findVideoProviderModelOption(await this.listModels(config), config.model);
  }

  async submit(input: VideoSubmitInput, config: VideoProviderConfig, signal?: AbortSignal): Promise<VideoRemoteTask> {
    const normalized = await this.normalizeSubmitInput(input, config);
    return this.provider(config.provider).submit(normalized, config, { signal });
  }

  async poll(task: VideoRemoteTask, config: VideoProviderConfig, signal?: AbortSignal): Promise<VideoRemoteTask> {
    try {
      return await this.provider(task.provider).poll(task, config, { signal });
    } catch (error) {
      throw taskError(error, task);
    }
  }

  async waitForCompletion(task: VideoRemoteTask, config: VideoProviderConfig, options: WaitForVideoOptions = {}): Promise<VideoRemoteTask> {
    let current = task;
    while (!isTerminal(current)) {
      if (options.signal?.aborted) {
        throw new VideoTaskServiceError("POLLING_STOPPED", "已停止本地等待；可使用任务快照继续查询远端状态。", current, true);
      }
      current = await this.poll(current, config, options.signal);
      options.onUpdate?.(current);
      if (!isTerminal(current)) await abortableDelay(options.pollIntervalMs ?? 5_000, options.signal, current);
    }
    return current;
  }

  async cancel(task: VideoRemoteTask, config: VideoProviderConfig, signal?: AbortSignal): Promise<VideoCancelResult> {
    return this.provider(task.provider).cancel(task, config, { signal });
  }

  async download(task: VideoRemoteTask, output: VideoRemoteOutput, config: VideoProviderConfig, signal?: AbortSignal): Promise<DownloadedVideo> {
    try {
      return await this.provider(task.provider).download(output, config, { signal });
    } catch (error) {
      throw taskError(error, task, true);
    }
  }

  private provider(id: VideoRemoteTask["provider"]): VideoProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new ProviderError("INVALID_CONFIG", `未注册视频 Provider：${id}`);
    return provider;
  }
}

export function defaultVideoProviders(): VideoProvider[] {
  return [new ArkVideoProvider(), new FalVideoProvider(), new OpenRouterVideoProvider(), new MiniMaxVideoProvider()];
}

function taskError(error: unknown, task: VideoRemoteTask, forceRecoverable = false): VideoTaskServiceError {
  if (error instanceof VideoTaskServiceError) return error;
  const normalized = normalizeProviderError(error);
  const recoverable = forceRecoverable || ["NETWORK_ERROR", "TIMEOUT", "PROVIDER_UNAVAILABLE", "POLLING_STOPPED", "DOWNLOAD_FAILED"].includes(normalized.code);
  return new VideoTaskServiceError(normalized.code, normalized.message, task, recoverable, normalized.status);
}

function isTerminal(task: VideoRemoteTask): boolean {
  return task.status === "succeeded" || task.status === "failed" || task.status === "cancelled" || task.status === "expired";
}

function abortableDelay(delayMs: number, signal: AbortSignal | undefined, task: VideoRemoteTask): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VideoTaskServiceError("POLLING_STOPPED", "已停止本地等待；可使用任务快照继续查询远端状态。", task, true));
      return;
    }
    const timer = setTimeout(done, Math.max(0, delayMs));
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new VideoTaskServiceError("POLLING_STOPPED", "已停止本地等待；可使用任务快照继续查询远端状态。", task, true));
    };
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}
