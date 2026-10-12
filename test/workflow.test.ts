import { describe, expect, it } from "vitest";
import {
  buildEnhanceMessages,
  buildPromptFromSpec,
  getDefaultQuality,
  getUseCasesForMode,
  parseGptImageSize,
  PROMPT_SPEC_EDIT_FIELDS,
  validateGptImageSize
} from "../shared/workflow.js";

describe("gpt-image2 workflow helpers", () => {
  it("filters use cases by workflow mode", () => {
    expect(getUseCasesForMode("generate").map((item) => item.slug)).toContain("ads-marketing");
    expect(getUseCasesForMode("generate").map((item) => item.slug)).not.toContain("compositing");

    expect(getUseCasesForMode("edit").map((item) => item.slug)).toContain("compositing");
    expect(getUseCasesForMode("edit").map((item) => item.slug)).not.toContain("ads-marketing");
  });

  it("builds labeled prompts and reinforces edit invariants", () => {
    const prompt = buildPromptFromSpec({
      mode: "edit",
      useCase: "precise-object-edit",
      assetType: "产品图修饰",
      primaryRequest: "把白色杯盖改成木质杯盖",
      inputImages: "Image 1: edit target",
      styleMedium: "photorealistic product photo",
      verbatimText: "KEEP CUP",
      constraints: "保留杯身标签和背景"
    });

    expect(prompt).toContain("Use case: precise-object-edit");
    expect(prompt).toContain("Asset type: 产品图修饰");
    expect(prompt).toContain('Text (verbatim): "KEEP CUP"');
    expect(prompt).toContain("change only the requested elements");
    expect(prompt).toContain("keep all unspecified details unchanged");
  });

  it("parses gpt-image2 size shortcuts, auto and 4K, rejects invalid custom sizes", () => {
    expect(parseGptImageSize("landscape")).toBe("1536x1024");
    expect(parseGptImageSize("2560x1440")).toBe("2560x1440");
    expect(parseGptImageSize("auto")).toBe("auto");
    expect(parseGptImageSize("AUTO")).toBe("auto");
    expect(parseGptImageSize("4k")).toBe("3840x2160");
    // 最长边 = 3840 应放行（规范"不超过 3840"）。
    expect(parseGptImageSize("3840x2160")).toBe("3840x2160");
    expect(parseGptImageSize("2160x3840")).toBe("2160x3840");
    expect(parseGptImageSize("2048x2048")).toBe("2048x2048");
    // 大写 X 不匹配、非 16 倍数、比例 >3、最长边超限、总像素超限均非法。
    expect(() => parseGptImageSize("1024X1024")).toThrow("invalid size");
    expect(() => parseGptImageSize("1000x1000")).toThrow("invalid size");
    expect(() => parseGptImageSize("3200x1024")).toThrow("invalid size");
    expect(() => parseGptImageSize("3856x2160")).toThrow("invalid size");
  });

  it("validateGptImageSize returns reasons and flags experimental sizes", () => {
    expect(validateGptImageSize(1024, 1024)).toEqual({ ok: true, experimental: false });
    // 2560×1440 = 3,686,400 恰为实验性边界（不含）。
    expect(validateGptImageSize(2560, 1440)).toEqual({ ok: true, experimental: false });
    expect(validateGptImageSize(2048, 2048)).toEqual({ ok: true, experimental: true });
    expect(validateGptImageSize(3840, 2160)).toEqual({ ok: true, experimental: true });
    expect(validateGptImageSize(1000, 1000).reason).toBe("宽高需为 16 的倍数");
    expect(validateGptImageSize(3856, 2160).reason).toBe("最长边不超过 3840px");
    expect(validateGptImageSize(3200, 1024).reason).toBe("长宽比不超过 3:1");
    expect(validateGptImageSize(512, 512).reason).toBe("总像素需在 65.5万~829万之间");
    expect(validateGptImageSize(0, 0).ok).toBe(false);
  });

  it("maps default quality from mode and use case", () => {
    expect(getDefaultQuality("edit", "compositing")).toBe("high");
    expect(getDefaultQuality("generate", "ads-marketing")).toBe("high");
    expect(getDefaultQuality("generate", "photorealistic-natural")).toBe("medium");
  });

  it("builds enhance chat messages carrying the user prompt and use-case bias", () => {
    const source = "任务：广告海报\n主体：【产品】";
    const messages = buildEnhanceMessages(source, "generate", "photorealistic-natural");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("真实摄影");
    // 简洁优先：默认自然语言短提示词，禁止术语堆砌；结构化输入仍逐行保留优化。
    expect(messages[0].content).toContain("约 120 字以内");
    expect(messages[0].content).toContain("禁止为了显得专业而堆砌");
    expect(messages[0].content).toContain("保留原有字段、顺序、换行和【占位符】");
    expect(messages[0].content).toContain("不要新增用户没有要求的字段");
    expect(messages[1]).toEqual({ role: "user", content: source });

    // 编辑模式强调"保持其余不变"。
    expect(buildEnhanceMessages("换背景", "edit").at(0)?.content).toContain("保持其余内容不变");
  });

  it("builds a template-fill request that resolves placeholders instead of preserving them", () => {
    const messages = buildEnhanceMessages(
      "夏季防晒霜，小红书首发",
      "generate",
      "ads-marketing",
      "宣传内容：【内容】\n商品主体：【商品主体】\n固定风格：简洁留白"
    );

    expect(messages[0].content).toContain("替换所有【占位符】");
    expect(messages[0].content).toContain("不得残留任何【】占位符");
    expect(messages[0].content).toContain("保持模板原有字段、顺序和换行");
    expect(messages[1].content).toContain("提示词模板：");
    expect(messages[1].content).toContain("本次需求：\n夏季防晒霜，小红书首发");
  });

  it("exposes editable prompt-spec fields including the negative-prompt avoid field", () => {
    const keys = PROMPT_SPEC_EDIT_FIELDS.map((field) => field.key);
    expect(keys).toContain("subject");
    expect(keys).toContain("avoid");
  });
});
