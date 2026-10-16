import type {
  VideoProviderCapability,
  VideoProviderMode,
  VideoProviderModelOption
} from "./types.js";

export type VideoModelCapabilityState = "supported" | "unsupported" | "unknown";

const MODES = new Set<VideoProviderMode>([
  "text-to-video",
  "image-to-video",
  "first-last-frame",
  "multi-reference",
  "remix",
  "extend"
]);

export function normalizeVideoProviderModelOption(value: unknown): VideoProviderModelOption | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;
  const capability = normalizeVideoProviderCapability(value.capability);
  if (value.capability !== undefined && !capability) return null;
  const compatibleModes = normalizeModes(value.supportedModes);
  const supportedModes = capability?.modes ?? compatibleModes;
  const supportedDurations = Array.isArray(value.supportedDurations)
    && value.supportedDurations.length > 0
    && value.supportedDurations.every((duration) => typeof duration === "number" && Number.isFinite(duration) && duration > 0)
    ? [...new Set<number>(value.supportedDurations)].sort((a, b) => a - b) : undefined;
  const supportedRatios = normalizeStrings(value.supportedRatios);
  const supportedResolutions = normalizeStrings(value.supportedResolutions);
  return {
    id: value.id.trim(),
    ...(typeof value.requiresPrompt === "boolean" ? { requiresPrompt: value.requiresPrompt } : {}),
    ...(typeof value.supportsGeneratedAudio === "boolean" ? { supportsGeneratedAudio: value.supportsGeneratedAudio } : {}),
    ...(Array.isArray(value.supportedFrameImages) && value.supportedFrameImages.every((frame) => frame === "first_frame" || frame === "last_frame")
      ? { supportedFrameImages: [...new Set<"first_frame" | "last_frame">(value.supportedFrameImages)] } : {}),
    ...(supportedDurations ? { supportedDurations } : {}),
    ...(supportedRatios?.length ? { supportedRatios } : {}),
    ...(supportedResolutions?.length ? { supportedResolutions } : {}),
    ...(typeof value.ownedBy === "string" && value.ownedBy.trim() ? { ownedBy: value.ownedBy.trim() } : {}),
    ...(typeof value.pricingLabel === "string" && value.pricingLabel.trim() ? { pricingLabel: value.pricingLabel.trim() } : {}),
    ...(supportedModes ? { supportedModes } : {}),
    ...(capability ? { capability } : {})
  };
}

export function normalizeVideoProviderCapability(value: unknown): VideoProviderCapability | undefined {
  if (!isRecord(value)) return undefined;
  const modes = normalizeModes(value.modes);
  const maxInputs = value.maxInputs;
  const durationSeconds = value.durationSeconds;
  if (!modes || !isRecord(maxInputs) || !isRecord(durationSeconds)) return undefined;
  if (!nonNegative(maxInputs.images) || !nonNegative(maxInputs.videos) || !nonNegative(maxInputs.audios)) return undefined;
  if (!nonNegative(durationSeconds.min) || !nonNegative(durationSeconds.max) || durationSeconds.max < durationSeconds.min) return undefined;
  const booleans = [
    value.supportsCancel,
    value.supportsProgress,
    value.supportsGeneratedAudio,
    value.supportsWatermarkControl,
    durationSeconds.supportsAuto
  ];
  if (!booleans.every((item) => typeof item === "boolean")) return undefined;
  const [
    supportsCancel,
    supportsProgress,
    supportsGeneratedAudio,
    supportsWatermarkControl,
    supportsAuto
  ] = booleans as boolean[];
  const ratios = normalizeStrings(value.ratios);
  const resolutions = normalizeStrings(value.resolutions);
  if (!ratios || !resolutions) return undefined;
  return {
    modes,
    maxInputs: { images: maxInputs.images, videos: maxInputs.videos, audios: maxInputs.audios },
    supportsCancel,
    supportsProgress,
    supportsGeneratedAudio,
    supportsWatermarkControl,
    ratios,
    resolutions,
    durationSeconds: {
      min: durationSeconds.min,
      max: durationSeconds.max,
      supportsAuto
    }
  };
}

export function resolveVideoModelCapability(
  option: VideoProviderModelOption | undefined,
  mode: VideoProviderMode
): VideoModelCapabilityState {
  if (!option) return "unknown";
  const modes = option.capability?.modes ?? option.supportedModes;
  if (!modes) {
    if (mode === "first-last-frame" && option.supportedFrameImages) {
      return option.supportedFrameImages.includes("first_frame") && option.supportedFrameImages.includes("last_frame") ? "supported" : "unsupported";
    }
    return "unknown";
  }
  return modes.includes(mode) ? "supported" : "unsupported";
}

export function findVideoProviderModelOption(
  options: readonly VideoProviderModelOption[] | undefined,
  model: string
): VideoProviderModelOption | undefined {
  const id = model.trim();
  return options?.find((option) => option.id === id);
}

export function videoProviderModelOptionFromCapability(
  id: string,
  capability: unknown,
  ownedBy?: string
): VideoProviderModelOption {
  const normalized = normalizeVideoProviderCapability(capability);
  if (!normalized) throw new Error("视频 Provider 返回了无效能力。");
  return {
    id: id.trim(),
    ...(ownedBy?.trim() ? { ownedBy: ownedBy.trim() } : {}),
    capability: normalized,
    supportedModes: [...normalized.modes]
  };
}

function normalizeModes(value: unknown): VideoProviderMode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const modes = Array.from(new Set(value.filter((item): item is VideoProviderMode => (
    typeof item === "string" && MODES.has(item as VideoProviderMode)
  ))));
  return modes.length === value.length ? modes : undefined;
}

function normalizeStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 统一消费模型目录中的约束，不根据模型名称推断能力。 */
export function resolveVideoParameters(option: VideoProviderModelOption | undefined) {
  const capability = option?.capability;
  const range = capability?.durationSeconds;
  return {
    requiresPrompt: option?.requiresPrompt !== false,
    durations: option?.supportedDurations,
    durationRange: range,
    ratios: option?.supportedRatios ?? (capability?.ratios.length ? capability.ratios : undefined),
    resolutions: option?.supportedResolutions ?? (capability?.resolutions.length ? capability.resolutions : undefined),
    supportsGeneratedAudio: option?.supportsGeneratedAudio ?? capability?.supportsGeneratedAudio,
    supportedFrameImages: option?.supportedFrameImages,
    maxInputs: capability?.maxInputs,
    modes: capability?.modes ?? option?.supportedModes
  };
}

export interface VideoParameterInput {
  prompt: string;
  durationSeconds?: number | "auto";
  aspectRatio?: string;
  resolution?: string;
  generateAudio?: boolean;
  firstFrame?: boolean;
  lastFrame?: boolean;
  images?: number;
  videos?: number;
  audios?: number;
  mode?: VideoProviderMode;
}

/** 返回第一项校验错误；UI、IPC 和其他调用入口共享同一套规则。 */
export function validateVideoParameters(input: VideoParameterInput, option: VideoProviderModelOption | undefined): string | undefined {
  const constraints = resolveVideoParameters(option);
  if (constraints.requiresPrompt && !input.prompt.trim()) return "当前模型需要视频描述，请填写后再生成。";
  const duration = input.durationSeconds;
  if (duration !== undefined) {
    if (duration === "auto") {
      if (constraints.durationRange && !constraints.durationRange.supportsAuto) return "当前模型不支持自动时长。";
    } else {
      if (!Number.isFinite(duration) || duration <= 0) return "视频时长必须大于 0。";
      if (constraints.durations && !constraints.durations.includes(duration)) return "视频时长不在当前模型支持的范围内。";
      if (constraints.durationRange && (duration < constraints.durationRange.min || duration > constraints.durationRange.max)) return "视频时长不在当前模型支持的范围内。";
    }
  }
  if (input.aspectRatio && constraints.ratios && !constraints.ratios.includes(input.aspectRatio)) return "当前模型不支持所选画幅。";
  if (input.resolution && constraints.resolutions && !constraints.resolutions.includes(input.resolution)) return "当前模型不支持所选清晰度。";
  if (input.generateAudio && constraints.supportsGeneratedAudio === false) return "当前模型不支持生成声音。";
  if (input.firstFrame && constraints.supportedFrameImages && !constraints.supportedFrameImages.includes("first_frame")) return "当前模型不支持首帧输入。";
  if (input.lastFrame && constraints.supportedFrameImages && !constraints.supportedFrameImages.includes("last_frame")) return "当前模型不支持尾帧输入。";
  if (input.mode && constraints.modes && !constraints.modes.includes(input.mode)) return "当前模型不支持所选生成模式。";
  if (constraints.maxInputs && ((input.images ?? 0) > constraints.maxInputs.images || (input.videos ?? 0) > constraints.maxInputs.videos || (input.audios ?? 0) > constraints.maxInputs.audios)) return "参考素材数量超出当前模型支持的上限。";
  return undefined;
}
