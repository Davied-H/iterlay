import type { ProviderConfig } from "@shared/types";

export interface ProviderImageSizeOption {
  value: string;
  ratio: string;
}

const STANDARD_IMAGE_SIZES: readonly ProviderImageSizeOption[] = [
  { value: "auto", ratio: "自动" },
  { value: "1024x1024", ratio: "1:1 · 方形" },
  { value: "1536x1024", ratio: "3:2 · 横图" },
  { value: "1024x1536", ratio: "2:3 · 竖图" }
];

const EXTENDED_IMAGE_SIZES: readonly ProviderImageSizeOption[] = [
  ...STANDARD_IMAGE_SIZES,
  { value: "2048x2048", ratio: "1:1 · 2K 方形" },
  { value: "2048x1152", ratio: "16:9 · 2K 横图" },
  { value: "3840x2160", ratio: "16:9 · 4K 横图" },
  { value: "2160x3840", ratio: "9:16 · 4K 竖图" }
];

/** 返回当前图片 Provider 可在生成界面直接选择的尺寸。 */
export function getProviderImageSizeOptions(
  provider?: Pick<ProviderConfig, "type">
): readonly ProviderImageSizeOption[] {
  return provider?.type === "official" ? STANDARD_IMAGE_SIZES : EXTENDED_IMAGE_SIZES;
}

export function providerSupportsCustomImageSize(
  provider?: Pick<ProviderConfig, "type">
): boolean {
  return provider?.type !== "official";
}
