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
  return {
    id: value.id.trim(),
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
  if (!modes) return "unknown";
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
