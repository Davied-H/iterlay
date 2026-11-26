import type { VideoProviderModelOption } from "@shared/types";

export function videoModelDisplayName(model: string): string {
  return model.replace(/^doubao-seedance-/i, "Seedance ")
    .replace(/-(\d{6,})$/, "")
    .replace(/^(?:bytedance|google|alibaba|minimax)\//i, "")
    .replace(/(\d+)-(\d+)(?=-|$)/g, "$1.$2")
    .replace(/-/g, " ");
}

/** Only estimate rates whose units can be multiplied by the requested duration. */
export function videoCostEstimate(option: VideoProviderModelOption | undefined, duration: number): string | undefined {
  const rates = option?.pricing;
  if (!rates?.length || rates.some((rate) => rate.unit !== "second")) return undefined;
  const min = Math.min(...rates.map((rate) => rate.minUsd)) * duration;
  const max = Math.max(...rates.map((rate) => rate.maxUsd)) * duration;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return undefined;
  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
  return `约 US$${number.format(min)}${max === min ? "" : `–${number.format(max)}`}`;
}

export type VideoImageRole = "start-frame" | "end-frame" | "reference";
export const VIDEO_IMAGE_ROLE_LABELS: Record<VideoImageRole, string> = {
  "start-frame": "首帧", "end-frame": "尾帧", reference: "参考图"
};
