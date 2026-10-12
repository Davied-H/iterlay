import { describe, expect, it } from "vitest";
import {
  WINDOWS_TITLE_BAR_HEIGHT,
  resolveWindowFrameOptions,
  resolveWindowsTitleBarOverlay
} from "../electron/window-chrome";

describe("window chrome", () => {
  it("preserves the existing macOS hidden inset title bar", () => {
    expect(resolveWindowFrameOptions("darwin", "dark", true)).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 }
    });
  });

  it("uses the native Windows controls overlay without a persistent menu row", () => {
    expect(resolveWindowFrameOptions("win32", "light", false)).toEqual({
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#fafafa",
        symbolColor: "#171717",
        height: WINDOWS_TITLE_BAR_HEIGHT
      },
      autoHideMenuBar: true
    });
  });

  it("matches explicit and system dark themes", () => {
    expect(resolveWindowsTitleBarOverlay("dark", false)).toMatchObject({
      color: "#22252c",
      symbolColor: "#f1f2f4"
    });
    expect(resolveWindowsTitleBarOverlay("system", true)).toMatchObject({
      color: "#22252c",
      symbolColor: "#f1f2f4"
    });
  });

  it("does not change unsupported desktop platforms", () => {
    expect(resolveWindowFrameOptions("linux", "light", false)).toEqual({});
  });
});
