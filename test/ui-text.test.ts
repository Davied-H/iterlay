// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n, useUiText } from "../src/i18n";
import { loadUiTextCatalog, translateUiText } from "../src/i18n/ui-text";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); document.documentElement.lang = "zh-CN"; });
describe("React-owned UI localization", () => {
  it("translates numeric templates without translating interpolated user content", async () => {
    await loadUiTextCatalog();
    expect(translateUiText("{{ui:0}} 个画板，按最近更新排序", "en-US", [2])).toBe("2 boards, sorted by recently updated");
    const label = translateUiText("打开画板 {{ui:0}}", "en-US", ["画板库"]);
    expect(label).toContain("画板库");
    expect(label).not.toContain("Boards");
  });
  it("updates rendered labels while preserving user text and using no MutationObserver", async () => {
    await loadUiTextCatalog();
    localStorage.setItem("iterlay:language", "en-US");
    const observe = vi.spyOn(globalThis, "MutationObserver");
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    function Example() {
      const uiText = useUiText();
      const { setLanguage } = useI18n();
      return createElement("div", null,
        createElement("button", { onClick: () => setLanguage("zh-CN"), title: uiText("画板 AI") }, uiText("画板库")),
        createElement("p", { "data-user-content": true }, "画板库")
      );
    }
    try {
      await act(async () => { root.render(createElement(I18nProvider, null, createElement(Example))); });
      expect(element.querySelector("button")?.textContent).toBe("Boards");
      expect(element.querySelector("p")?.textContent).toBe("画板库");
      await act(async () => { element.querySelector("button")?.click(); });
      expect(element.querySelector("button")?.textContent).toBe("画板库");
      expect(element.querySelector("button")?.title).toBe("画板 AI");
      expect(observe).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); element.remove(); }
  });
});
