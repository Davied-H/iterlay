export type AppLanguage = "system" | "zh-CN" | "en-US";
export type ResolvedAppLocale = Exclude<AppLanguage, "system">;

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === "zh-CN" || value === "en-US" || value === "system" ? value : "system";
}

export function resolveAppLocale(
  language: AppLanguage,
  systemLocale: string | readonly string[] | undefined
): ResolvedAppLocale {
  if (language !== "system") return language;
  const locales = Array.isArray(systemLocale) ? systemLocale : [systemLocale ?? ""];
  return locales.some((locale) => locale.toLowerCase().startsWith("zh")) ? "zh-CN" : "en-US";
}
