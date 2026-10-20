import type { ModelPriceRange } from "./contracts/providers.js";

/** OpenRouter video SKUs mix USD and cents. Only known output units are comparable. */
export function parseOpenRouterVideoPricing(value: unknown): ModelPriceRange[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const groups = new Map<ModelPriceRange["unit"], number[]>();
  for (const [sku, raw] of Object.entries(value)) {
    if ((typeof raw !== "string" && typeof raw !== "number") || String(raw).trim() === "") continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) continue;
    let unit: ModelPriceRange["unit"];
    let usd: number;
    if (/^cents_per_megapixel_second(?:_|$)/.test(sku)) {
      unit = "megapixel-second";
      usd = amount / 100;
    } else if (/^video_tokens(?:_|$)/.test(sku)) {
      unit = "million-video-tokens";
      usd = amount * 1_000_000;
    } else if (/^(?:duration_seconds|text_to_video_duration_seconds|image_to_video_duration_seconds)(?:_|$)/.test(sku)
      || sku === "per-video-second") {
      unit = "second";
      usd = amount;
    } else if (/^cents_per_(?:video_output_second|second_output|second_video_continuation)(?:_|$)/.test(sku)) {
      unit = "second";
      usd = amount / 100;
    } else {
      // Reference input charges and minimum charges are not output unit rates.
      continue;
    }
    if (!Number.isFinite(usd)) continue;
    const values = groups.get(unit) ?? [];
    values.push(usd);
    groups.set(unit, values);
  }
  const pricing = [...groups].map(([unit, amounts]) => ({ unit, minUsd: Math.min(...amounts), maxUsd: Math.max(...amounts) }));
  return pricing.length ? pricing : undefined;
}

export function normalizeModelPricing(value: unknown): ModelPriceRange[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pricing = value.filter((item): item is ModelPriceRange => {
    if (!item || typeof item !== "object") return false;
    return ["second", "million-video-tokens", "megapixel-second"].includes(item.unit)
      && typeof item.minUsd === "number" && Number.isFinite(item.minUsd) && item.minUsd >= 0
      && typeof item.maxUsd === "number" && Number.isFinite(item.maxUsd) && item.maxUsd >= item.minUsd;
  }).map(({ unit, minUsd, maxUsd }) => ({ unit, minUsd, maxUsd }));
  return pricing.length ? pricing : undefined;
}

export const USD_TO_CNY = 7;

export function formatModelPricing(pricing: readonly ModelPriceRange[] | undefined, locale: "zh-CN" | "en-US") {
  const normalized = normalizeModelPricing(pricing);
  if (!normalized) return undefined;
  const zh = locale === "zh-CN";
  const units = {
    second: zh ? "秒" : "s",
    "million-video-tokens": zh ? "百万视频 Token" : "1M video tokens",
    "megapixel-second": zh ? "百万像素·秒" : "MP·s"
  };
  const number = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 });
  const format = (rate: ModelPriceRange, multiplier: number, symbol: string) => {
    const min = number.format(rate.minUsd * multiplier);
    const max = number.format(rate.maxUsd * multiplier);
    return `${symbol}${min}${rate.minUsd === rate.maxUsd ? "" : `–${max}`} / ${units[rate.unit]}`;
  };
  return {
    usd: normalized.map((rate) => format(rate, 1, "US$")).join(" · "),
    cny: zh ? normalized.map((rate) => `≈${format(rate, USD_TO_CNY, "¥")}`).join(" · ") : undefined
  };
}
