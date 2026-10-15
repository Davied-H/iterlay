import type { ResolvedAppLocale } from "@shared/i18n";

let translator: ((text: string, locale: ResolvedAppLocale) => string) | undefined;
let loading: Promise<void> | undefined;
let currentLocale: ResolvedAppLocale = "zh-CN";
export function setUiTextLocale(locale: ResolvedAppLocale): void { currentLocale = locale; }

export function loadUiTextCatalog(): Promise<void> {
  if (translator) return Promise.resolve();
  loading ??= import("./legacy-messages").then((module) => { translator = module.localizeLegacyText; }).catch((error) => { loading = undefined; throw error; });
  return loading;
}

/** Substitute user-controlled values after translating compiler-owned UI text. */
export function translateUiText(text: string, locale: ResolvedAppLocale, values: unknown[] = []): string {
  const numeric = text.replace(/\{\{ui:(\d+)\}\}/gu, (token, index: string) => {
    const value = values[Number(index)];
    return typeof value === "number" || typeof value === "string" && /^\d+(?:\.\d+)?$/u.test(value) ? String(value) : token;
  });
  const translated = translator ? translator(numeric, locale) : numeric;
  return translated.replace(/\{\{ui:(\d+)\}\}/gu, (_token, index: string) => String(values[Number(index)] ?? ""));
}

/** For compiler-owned notification text and class component fallbacks. */
export function translateSourceText(text: string, values?: unknown[]): string {
  return translateUiText(text, currentLocale, values);
}
