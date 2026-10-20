// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FusionPromptConfirmation } from "../src/components/workbench/FusionPromptConfirmation";
import { I18nProvider, useI18n } from "../src/i18n";
import { loadUiTextCatalog } from "../src/i18n/ui-text";
import { localizeLegacyText } from "../src/i18n/legacy-messages";
import { buildAssistantActionConfirmInteraction, buildOverwriteConfirmInteraction, resolveAssistantInteraction } from "../src/lib/assistant-interaction";
import type { AiAssistantInteractionState } from "../src/components/assistant/AiAssistant";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { localStorage.clear(); document.documentElement.lang = "zh-CN"; });

describe("assistant interaction localization", () => {
  it("covers every app-owned apply, overwrite, edit and generation confirmation", () => {
    for (const surface of ["canvas-prompt", "canvas-edit"] as const) {
      for (const changesPrompt of [false, true]) for (const hasCurrentPrompt of [false, true]) {
        for (const [generationRequestCount, generationImageCount] of [[0, 0], [1, 1], [1, 4], [3, 6]]) {
          const interaction = buildAssistantActionConfirmInteraction(surface, { changesPrompt, hasCurrentPrompt, generationRequestCount, generationImageCount });
          for (const text of [interaction.title, interaction.description, interaction.confirmLabel, interaction.cancelLabel]) {
            expect(localizeLegacyText(text!, "en-US"), text).not.toMatch(/[\u4e00-\u9fff]/u);
          }
        }
      }
      expect(localizeLegacyText(buildOverwriteConfirmInteraction(surface).title, "en-US")).not.toMatch(/[\u4e00-\u9fff]/u);
    }
    const template = resolveAssistantInteraction({ message: "", fields: [{ label: "提示词", value: "内容" }] }, "scene-template")!;
    expect(localizeLegacyText(template.title, "en-US")).toBe("Ready to create the template");
  });

  it("switches an open confirmation between languages without translating its prompt or losing edits", async () => {
    await loadUiTextCatalog();
    localStorage.setItem("iterlay:language", "en-US");
    const state: AiAssistantInteractionState = {
      id: "locale-test",
      interaction: buildAssistantActionConfirmInteraction("canvas-prompt", { changesPrompt: true, hasCurrentPrompt: false, generationRequestCount: 1, generationImageCount: 1 }),
      confirmationPreview: { title: "将更新的模板内容", items: [{ label: "提示词", value: "中文水獭提示词，保持原文。" }] }
    };
    let switchLanguage: ReturnType<typeof useI18n>["setLanguage"];
    function Harness() { switchLanguage = useI18n().setLanguage; return createElement(FusionPromptConfirmation, { state, disabled: false, onApply: vi.fn(), onGenerate: vi.fn(), onDismiss: vi.fn(), onRefine: vi.fn() }); }
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(I18nProvider, null, createElement(Harness))));
      expect(container.querySelector("h3")?.textContent).toBe("Apply prompt and generate?");
      expect(container.textContent).toContain("generate 1 image.");
      expect(container.textContent).toContain("Confirm and generate");
      expect(container.textContent).toContain("中文水獭提示词，保持原文。");
      await act(async () => container.querySelector<HTMLButtonElement>(".fusion-confirmation-edit")!.click());
      const textarea = container.querySelector("textarea")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "继续保留用户修改");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => switchLanguage!("zh-CN"));
      expect(container.querySelector("h3")?.textContent).toBe("应用提示词并生成？");
      expect(container.textContent).toContain("确认并生成");
      expect(textarea.value).toBe("继续保留用户修改");
      await act(async () => switchLanguage!("en-US"));
      expect(container.querySelector("h3")?.textContent).toBe("Apply prompt and generate?");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
