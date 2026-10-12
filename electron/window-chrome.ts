import type { BrowserWindowConstructorOptions, TitleBarOverlay } from "electron";
import type { AppSettings } from "../shared/types.js";

export const WINDOWS_TITLE_BAR_HEIGHT = 48;

type WindowTheme = AppSettings["theme"];

type WindowFrameOptions = Pick<
  BrowserWindowConstructorOptions,
  "autoHideMenuBar" | "titleBarOverlay" | "titleBarStyle" | "trafficLightPosition"
>;

export function resolveWindowsTitleBarOverlay(
  theme: WindowTheme,
  systemUsesDarkColors: boolean
): TitleBarOverlay {
  const dark = theme === "dark" || (theme === "system" && systemUsesDarkColors);
  return {
    color: dark ? "#22252c" : "#fafafa",
    symbolColor: dark ? "#f1f2f4" : "#171717",
    height: WINDOWS_TITLE_BAR_HEIGHT
  };
}

export function resolveWindowFrameOptions(
  platform: NodeJS.Platform,
  theme: WindowTheme,
  systemUsesDarkColors: boolean
): WindowFrameOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 }
    };
  }

  if (platform === "win32") {
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: resolveWindowsTitleBarOverlay(theme, systemUsesDarkColors),
      autoHideMenuBar: true
    };
  }

  return {};
}
