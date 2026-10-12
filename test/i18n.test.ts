import { describe, expect, it } from "vitest";
import { normalizeAppLanguage, resolveAppLocale } from "../shared/i18n.js";
import { localizeLegacyText } from "../src/i18n/legacy-messages.js";
import { enUS, zhCN } from "../src/i18n/messages.js";

describe("i18n", () => {
  it("normalizes persisted language preferences", () => {
    expect(normalizeAppLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeAppLanguage("en-US")).toBe("en-US");
    expect(normalizeAppLanguage("system")).toBe("system");
    expect(normalizeAppLanguage("fr-FR")).toBe("system");
  });

  it("resolves system language while respecting explicit choices", () => {
    expect(resolveAppLocale("system", ["en-US", "zh-CN"])).toBe("zh-CN");
    expect(resolveAppLocale("system", "en-US")).toBe("en-US");
    expect(resolveAppLocale("zh-CN", "en-US")).toBe("zh-CN");
  });

  it("localizes highlighted legacy and dynamic UI copy", () => {
    expect(localizeLegacyText("画板 AI", "en-US")).toBe("Board AI");
    expect(localizeLegacyText("3 条", "en-US")).toBe("3");
    expect(localizeLegacyText("2 个画板，按最近更新排序", "en-US"))
      .toBe("2 boards, sorted by recently updated");
    expect(localizeLegacyText("自动 · 1 张", "en-US")).toBe("Auto · 1 image");
    expect(localizeLegacyText("auto", "en-US")).toBe("Auto");
    expect(localizeLegacyText(" 张图片 · 更新 ", "en-US")).toBe(" images · Updated ");
    expect(localizeLegacyText("Inspiration", "zh-CN")).toBe("灵感");
    expect(localizeLegacyText("工作区暂时无法显示", "en-US"))
      .toBe("Workspace temporarily unavailable");
    expect(localizeLegacyText("问题编号", "en-US")).toBe("Error ID");
    expect(localizeLegacyText("空间", "en-US")).toBe("Storage");
  });

  it("provides prompt dock copy in both languages", () => {
    expect(zhCN["prompt.placeholder.generate"]).toContain("描述你想要的画面");
    expect(enUS["prompt.placeholder.generate"]).toBe(
      "Describe the image you want… (Enter to generate)"
    );
    expect(enUS["prompt.auto"]).toBe("Auto");
    expect(enUS["prompt.imageCount.maximum"]).toBe("Maximum {{max}}");
    expect(enUS["prompt.references.label"]).toBe("References");
    expect(enUS["prompt.references.clear"]).toBe("Clear all reference images");
    expect(enUS["prompt.smartSuggestions.loading"]).toBe("Generating smart suggestions…");
    expect(enUS["prompt.editBanner.title"]).toBe("Editing this image");
  });

  it("provides assistant copy in both languages", () => {
    expect(zhCN["assistant.title.board"]).toBe("画板 AI 助手");
    expect(enUS["assistant.title.board"]).toBe("Board AI Assistant");
    expect(enUS["assistant.suggestions.loading"]).toBe("Generating next-step suggestions…");
    expect(enUS["assistant.placeholder.board"]).toContain("refine the prompt");
  });
});
