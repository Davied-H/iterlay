import { loadUiTextCatalog, setUiTextLocale, translateUiText } from "./ui-text";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeAppLanguage, resolveAppLocale, type AppLanguage, type ResolvedAppLocale } from "@shared/i18n";
import { enUS, zhCN, type MessageKey } from "./messages";

const LANGUAGE_STORAGE_KEY = "iterlay:language";

interface I18nContextValue {
  language: AppLanguage;
  locale: ResolvedAppLocale;
  setLanguage: (language: AppLanguage) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  catalogRevision: number;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "system";
  try { return normalizeAppLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)); } catch { return "system"; }
}

function systemLocales(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

export function I18nProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [language, setLanguageState] = useState<AppLanguage>(readInitialLanguage);
  const locale = resolveAppLocale(language, systemLocales());
  setUiTextLocale(locale);
  const [catalogRevision, setCatalogRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (locale === "en-US" || catalogRevision > 0) void loadUiTextCatalog().then(() => {
      if (active) setCatalogRevision(1);
    }).catch((error) => console.warn("界面语言词典加载失败", error));
    return () => { active = false; };
  }, [locale, catalogRevision]);

  const setLanguage = useCallback((next: AppLanguage): void => {
    setLanguageState(normalizeAppLanguage(next));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Preferences can still work in memory. */ }
  }, [language, locale]);

  const t = useCallback((key: MessageKey, values?: Record<string, string | number>): string => {
    const catalog = locale === "zh-CN" ? zhCN : enUS;
    const message = catalog[key] ?? zhCN[key];
    if (!values) return message;
    return Object.entries(values).reduce(
      (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
      message
    );
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ language, locale, setLanguage, t, catalogRevision }),
    [language, locale, setLanguage, t, catalogRevision]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export type { MessageKey };

/** Locale-aware reusable settings surfaces also render outside the full App. */
export function useUiLocale(): ResolvedAppLocale {
  const context = useContext(I18nContext);
  return context?.locale ?? (typeof document !== "undefined" && document.documentElement.lang.startsWith("en") ? "en-US" : "zh-CN");
}

/** Legacy literals are localized during React rendering, with no DOM observer. */
export function useUiText(): (text: string, values?: unknown[]) => string {
  const context = useContext(I18nContext);
  const fallback = typeof document !== "undefined" && document.documentElement.lang === "en-US" ? "en-US" : "zh-CN";
  return useCallback((text: string, values?: unknown[]) => translateUiText(text, context?.locale ?? fallback, values), [context, fallback]);
}
