import { useCallback, useEffect } from "react";
import { usePluginContext } from "../../../packages/plugin-sdk/src";
import { localizeLegacyText } from "../../../src/i18n/legacy-messages";

/** Plugin frames have their own React root and receive their locale from the host. */
export function useUiText(): (text: string, values?: unknown[]) => string {
  const context = usePluginContext();
  const locale = context?.locale === "en-US" ? "en-US" : "zh-CN";
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return useCallback((text: string, values: unknown[] = []) => {
    const translated = localizeLegacyText(text, locale);
    return translated.replace(/\{\{ui:(\d+)\}\}/gu, (_token, index: string) => String(values[Number(index)] ?? ""));
  }, [locale]);
}
