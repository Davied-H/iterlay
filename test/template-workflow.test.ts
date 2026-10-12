import { describe, expect, it } from "vitest";
import type { CollaborateSceneResult } from "../shared/types";
import {
  buildTemplateExampleRecommendationInstruction,
  buildTemplateExampleReviewInstruction,
  buildTemplateExtractionInstruction,
  buildTemplateGenerationBriefRecommendationInstruction,
  buildTemplatePromptFromExtractionItems,
  buildTemplatePreviewInstruction,
  composeTemplateVariationPrompt,
  createTemplateExtractionFromAssistant,
  createTemplatePromptSet,
  createTemplateDraftFromAssistant,
  ensureTemplateVariable,
  extractTemplateExampleRecommendation,
  extractTemplateGenerationBriefRecommendation,
  findTemplateDetailWarnings,
  parseTemplateExtractionItems,
  retargetTemplateExtractionContext,
  sceneCategoryForUseCase
} from "../src/lib/template-workflow";

describe("template workflow", () => {
  it("requires reusable placeholders in the extraction instruction", () => {
    const instruction = buildTemplateExtractionInstruction("generate");
    expect(instruction).toContain("可变·字段名");
    expect(instruction).toContain("忽略·字段名");
    expect(instruction).toContain("不要提问");
    expect(instruction).toContain("不依赖已有图片");
    expect(instruction).toContain("不要把字段写成编辑目标");
  });

  it("changes extraction rules with the selected extraction scenario", () => {
    const designLanguage = buildTemplateExtractionInstruction("generate", true, "design-language");
    expect(designLanguage).toContain("完全不同的页面或内容");
    expect(designLanguage).toContain("至少返回 6 个保留项");
    expect(designLanguage).toContain("色彩角色、字体层级");

    expect(buildTemplateExtractionInstruction("generate", true, "layout-skeleton")).toContain("区域划分");
    expect(buildTemplateExtractionInstruction("generate", true, "series-template")).toContain("持续生成同系列作品");
    expect(buildTemplateExtractionInstruction("generate", true, "replica")).toContain("模块数量");
  });

  it("extracts edit templates as reusable image changes", () => {
    const instruction = buildTemplateExtractionInstruction("edit");
    expect(instruction).toContain("图片编辑模板");
    expect(instruction).toContain("必须保持不变的内容");
  });

  it("supports extracting a template from an image without generation history", () => {
    const instruction = buildTemplateExtractionInstruction("generate", false);
    expect(instruction).toContain("没有原始生成提示词");
    expect(instruction).toContain("直接根据参考图提取");
    expect(instruction).toContain("不要编造图片中不可见的信息");
  });

  it("builds a non-generating template preview instruction with image context", () => {
    const instruction = buildTemplatePreviewInstruction(2, 1, "design-language");
    expect(instruction).toContain("2 张参考图");
    expect(instruction).toContain("替换所有【占位符】");
    expect(instruction).toContain("根据本次需求重新组织内容和布局");
    expect(instruction).toContain("不要发起图片生成");
    expect(instruction).toContain("用户仍可继续修正");
  });

  it("asks the assistant for one directly usable example brief", () => {
    const instruction = buildTemplateExampleRecommendationInstruction("design-language");
    expect(instruction).toContain("最适合暴露模板问题");
    expect(instruction).toContain("页面结构明显不同");
    expect(instruction).toContain("label 必须为“示例需求”");
    expect(instruction).toContain("不要修改模板字段");
    expect(extractTemplateExampleRecommendation({
      message: "建议测试一个真实场景",
      fields: [{ label: "示例需求", value: "一款透明玻璃香水瓶，七夕新品首发" }]
    })).toBe("一款透明玻璃香水瓶，七夕新品首发");
  });

  it("recommends a generation brief without turning it into a final prompt", () => {
    const instruction = buildTemplateGenerationBriefRecommendationInstruction("layout-skeleton", true);
    expect(instruction).toContain("适合直接生成图片");
    expect(instruction).toContain("区域比例、信息层级和内容槽位");
    expect(instruction).toContain("不同且更有新意的方向");
    expect(instruction).toContain("label 必须为“生成需求”");
    expect(instruction).toContain("不要写成最终图片提示词");
    expect(extractTemplateGenerationBriefRecommendation({
      message: "这个方向能充分利用模板的信息层级",
      fields: [{ label: "生成需求", value: "一场城市夜跑活动海报，包含路线、时间与报名信息" }]
    })).toBe("一场城市夜跑活动海报，包含路线、时间与报名信息");
  });

  it("builds a post-generation review that compares labeled references", () => {
    const instruction = buildTemplateExampleReviewInstruction({
      originalReferenceCount: 2,
      generatedExampleCount: 2,
      scenario: "layout-skeleton"
    });
    expect(instruction).toContain("前 2 张");
    expect(instruction).toContain("之后 2 张");
    expect(instruction).toContain("完整模板字段");
    expect(instruction).toContain("只用于复盘，不是模板字段");
    expect(instruction).toContain("interaction.type=confirm");
    expect(instruction).toContain("不要再次生成图片");
    expect(instruction).toContain("长短内容伸缩");
    expect(instruction).toContain("不要因为生成图风格不同");
    expect(instruction).toContain("复核发现：");
    expect(instruction).toContain("调整原因：");
    expect(instruction).toContain("具体偏差");
    expect(instruction).toContain("改善哪类后续复用问题");
    expect(instruction).toContain("不要使用 Markdown");
    expect(instruction).toContain("不要只说");
  });

  it("requests one shared prompt and an exact set of variations for batch previews", () => {
    const instruction = buildTemplatePreviewInstruction(0, 3);
    expect(instruction).toContain("3 张同系列图片");
    expect(instruction).toContain("一条“母提示词”");
    expect(instruction).toContain("恰好 3 个 directions");
    expect(instruction).toContain("不要重复母提示词");
  });

  it("normalizes a shared prompt and distinct child prompts", () => {
    const promptSet = createTemplatePromptSet({
      message: "已生成",
      fields: [{ label: "母提示词", value: "黑色毛绒怪物，统一白底与黑白配色" }],
      directions: [
        { id: "front", title: "正面", prompt: "正面半身，半眯眼看向镜头" },
        { id: "side", title: "侧身", prompt: "侧身行走，低机位全身构图" },
        { id: "close", title: "特写", prompt: "面部超近景，突出蓬松毛发" }
      ]
    }, 3);

    expect(promptSet.basePrompt).toContain("统一白底");
    expect(promptSet.variations.map((variation) => variation.title)).toEqual(["正面", "侧身", "特写"]);
  });

  it("combines the shared prompt with one child prompt for generation", () => {
    expect(composeTemplateVariationPrompt("共同风格", "正面近景")).toBe("共同风格\n\n本张变化：正面近景");
  });

  it("rejects incomplete child prompt sets", () => {
    expect(() => createTemplatePromptSet({
      message: "只返回一个",
      fields: [{ label: "母提示词", value: "共同风格" }],
      directions: [{ id: "one", title: "方向一", prompt: "正面构图" }]
    }, 3)).toThrow("只返回了 1 个有效子提示词");
  });

  it("keeps an existing template variable", () => {
    expect(ensureTemplateVariable("主体：【产品】\n构图：居中")).toBe("主体：【产品】\n构图：居中");
  });

  it("adds a general variable when the model only returns fixed rules", () => {
    expect(ensureTemplateVariable("构图：居中\n光线：柔和侧光")).toBe(
      "本次需求：【本次创作需求】\n构图：居中\n光线：柔和侧光"
    );
  });

  it("normalizes an assistant result into an existing scene input", () => {
    const result: CollaborateSceneResult = {
      message: "已提取",
      suggestedName: "清爽产品主视觉",
      suggestedDescription: "适合饮品与日化新品",
      fields: [
        { label: "主体", value: "【产品主体】" },
        { label: "构图", value: "产品居中，预留标题区" }
      ]
    };
    const draft = createTemplateDraftFromAssistant(result, {
      sourcePrompt: "一瓶气泡水",
      workflowMode: "generate",
      useCase: "ads-marketing"
    });

    expect(draft.name).toBe("清爽产品主视觉");
    expect(draft.category).toBe("marketing");
    expect(draft.prompt).toContain("主体：【产品主体】");
    expect(draft.fields).toHaveLength(2);
  });

  it("classifies extraction fields and excludes source details from the saved prompt", () => {
    const result: CollaborateSceneResult = {
      message: "已提取",
      suggestedName: "深色数据主页",
      fields: [
        { label: "保留·视觉风格", value: "深色背景，荧光绿作为强调色" },
        { label: "可变·用户信息", value: "【头像、昵称和关键指标】" },
        { label: "忽略·原图身份", value: "Mr.Bobrovsky，Level 8，70%" }
      ]
    };

    const extraction = createTemplateExtractionFromAssistant(result, {
      sourcePrompt: "",
      workflowMode: "generate",
      useCase: "other",
      extractionScenario: "design-language"
    });

    expect(extraction.items.map((item) => item.category)).toEqual(["retained", "variable", "ignored"]);
    expect(extraction.input.prompt).toContain("视觉风格：深色背景");
    expect(extraction.input.prompt).toContain("用户信息：【头像、昵称和关键指标】");
    expect(extraction.input.prompt).not.toContain("Mr.Bobrovsky");
    expect(extraction.input.extractionScenario).toBe("design-language");
  });

  it("falls back to placeholder detection when a model omits category prefixes", () => {
    const items = parseTemplateExtractionItems({
      message: "已提取",
      fields: [
        { label: "主体", value: "【产品】" },
        { label: "构图", value: "主体居中" }
      ]
    });
    expect(items.map((item) => item.category)).toEqual(["variable", "retained"]);
  });

  it("rebuilds the prompt after a review item is reclassified", () => {
    const prompt = buildTemplatePromptFromExtractionItems([
      { id: "1", label: "视觉风格", value: "深色高对比", category: "retained" },
      { id: "2", label: "昵称", value: "Mr.Bobrovsky", category: "variable" },
      { id: "3", label: "原图数字", value: "70%", category: "ignored" }
    ]);
    expect(prompt).toContain("昵称：【昵称】");
    expect(prompt).not.toContain("70%");
  });

  it("warns when retained rules contain likely source-specific values", () => {
    const items = [
      { id: "1", label: "数据", value: "胜率 70%", category: "retained" as const },
      { id: "2", label: "昵称", value: "Mr.Bobrovsky", category: "ignored" as const }
    ];
    expect(findTemplateDetailWarnings(items, "数据：胜率 70%\n昵称：Mr.Bobrovsky")).toEqual(["数据", "昵称"]);
  });

  it("maps edit use cases to the editing category", () => {
    expect(sceneCategoryForUseCase("style-transfer")).toBe("editing");
  });

  it("retargets a sketch edit as an illustration creation template", () => {
    expect(retargetTemplateExtractionContext({
      sourcePrompt: "给四格线稿上色",
      workflowMode: "edit",
      useCase: "sketch-to-render",
      category: "editing"
    }, "generate")).toEqual({
      sourcePrompt: "给四格线稿上色",
      workflowMode: "generate",
      useCase: "illustration-story"
    });
  });
});
