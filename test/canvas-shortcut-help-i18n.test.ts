// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CanvasShortcutHelpDialog } from "../src/components/canvas/CanvasShortcutHelpDialog";
import { I18nProvider, useI18n } from "../src/i18n";
import { loadUiTextCatalog } from "../src/i18n/ui-text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("board shortcut help localization", () => {
  it("localizes every group, action, key description and footer, including when switching while open", async () => {
    await loadUiTextCatalog();
    localStorage.setItem("iterlay:language", "en-US");
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    let setLanguage: ReturnType<typeof useI18n>["setLanguage"];
    function Harness() {
      setLanguage = useI18n().setLanguage;
      return createElement(CanvasShortcutHelpDialog, { open: true, onOpenChange: vi.fn(), commentsEnabled: true, galleryEnabled: true });
    }
    try {
      await act(async () => root.render(createElement(I18nProvider, null, createElement(Harness))));
      const dialog = document.querySelector('[role="dialog"]')!;
      expect(dialog.textContent).toContain("Board shortcuts");
      expect(dialog.textContent).toContain("Selection and canvas");
      expect(dialog.textContent).toContain("Navigation and views");
      expect(dialog.textContent).toContain("Enter edit mode");
      expect(dialog.textContent).toContain("Download original / Remove background");
      expect(dialog.textContent).toContain("Shift click");
      expect(dialog.textContent).toContain("Comment mode");
      expect(dialog.textContent).toContain("Single-letter shortcuts work only when the board is active and you are not typing.");
      expect(dialog.textContent).not.toMatch(/[\u4e00-\u9fff]/u);
      const keys = [...dialog.querySelectorAll("kbd")].map((key) => key.textContent);
      await act(async () => setLanguage!("zh-CN"));
      expect(dialog.textContent).toContain("画板快捷键");
      expect(dialog.textContent).toContain("Shift 点击");
      expect(dialog.textContent).toContain("单字母快捷键仅在画板前景且未输入文字时生效。");
      expect([...dialog.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual(keys.map((key) => key === "Shift click" ? "Shift 点击" : key));
      await act(async () => setLanguage!("en-US"));
      expect(dialog.textContent).not.toMatch(/[\u4e00-\u9fff]/u);
    } finally {
      await act(async () => root.unmount()); container.remove(); localStorage.clear(); document.documentElement.lang = "zh-CN";
    }
  });
});
