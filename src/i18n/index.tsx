import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  normalizeAppLanguage,
  resolveAppLocale,
  type AppLanguage,
  type ResolvedAppLocale
} from "@shared/i18n";
import { enUS, zhCN, type MessageKey } from "./messages";

const LANGUAGE_STORAGE_KEY = "iterlay:language";

interface I18nContextValue {
  language: AppLanguage;
  locale: ResolvedAppLocale;
  setLanguage: (language: AppLanguage) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "system";
  return normalizeAppLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

function systemLocales(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

export function I18nProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [language, setLanguageState] = useState<AppLanguage>(readInitialLanguage);
  const locale = resolveAppLocale(language, systemLocales());

  const setLanguage = useCallback((next: AppLanguage): void => {
    setLanguageState(normalizeAppLanguage(next));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
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
    () => ({ language, locale, setLanguage, t }),
    [language, locale, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export type { MessageKey };
