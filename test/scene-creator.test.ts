import { describe, expect, it } from "vitest";
import {
  applySceneFieldSuggestion,
  buildSceneAssistantGreeting,
  buildSceneFieldSuggestions,
  compactSceneFields,
  createSceneDraft,
  createSceneDraftFromScene,
  isDefaultEmptySceneFields,
  readSceneCreatorDraft,
  resolveSceneAssistantInstruction,
  routeTemplateAssistantIntent,
  sceneDraftCompletion,
  templateAssistantReferenceSuggestions,
  templateAssistantStarterSuggestions,
  writeSceneCreatorDraft
} from "../src/lib/scene-creator";

describe("scene creator", () => {
  it("starts with a concise set of essential fields", () => {
    const generateDraft = createSceneDraft("", "generate");
    const editDraft = createSceneDraft("", "edit");

    expect(generateDraft.fields.map((field) => field.label)).toEqual([
      "任务",
      "主体",
      "场景 / 背景",
      "构图 / 镜头",
      "视觉风格",
      "约束"
    ]);
    expect(editDraft.fields.map((field) => field.label)).toEqual([
      "修改目标",
      "修改内容",
      "保持不变",
      "视觉融合",
      "约束"
    ]);
    expect(isDefaultEmptySceneFields(generateDraft.fields, "generate")).toBe(true);
    generateDraft.fields[0].value = "礼品卡";
    expect(isDefaultEmptySceneFields(generateDraft.fields, "generate")).toBe(false);
  });

  it("creates a structured draft from the current prompt", () => {
    const draft = createSceneDraft("任务：广告海报\n主体：【产品】", "generate", "ads-marketing");
    expect(draft.fields.map((field) => [field.label, field.value])).toEqual([
      ["任务", "广告海报"],
      ["主体", "【产品】"]
    ]);
    expect(sceneDraftCompletion(draft)).toEqual({ filled: 2, total: 2 });
  });

  it("prefills an editable draft from an existing template", () => {
    const draft = createSceneDraftFromScene({
      id: "preset:ad-poster",
      name: "广告海报",
      description: "商业广告模板",
      prompt: "任务：商业广告海报\n主体：【产品或主题】",
      category: "marketing",
      mode: "generate",
      useCase: "ads-marketing",
      extractionScenario: "series-template",
      source: "preset"
    });

    expect(draft).toMatchObject({
      name: "广告海报",
      description: "商业广告模板",
      category: "marketing",
      mode: "generate",
      useCase: "ads-marketing",
      extractionScenario: "series-template"
    });
    expect(draft.fields.map(({ label, value }) => [label, value])).toEqual([
      ["任务", "商业广告海报"],
      ["主体", "【产品或主题】"]
    ]);
  });

  it("builds field diffs and applies both updates and additions", () => {
    const draft = createSceneDraft("任务：室内摄影\n光线：自然光", "generate");
    const suggestions = buildSceneFieldSuggestions(draft.fields, [
      { label: " 光 线 ", value: "柔和侧光" },
      { label: "材质", value: "木质与亚麻" }
    ]);
    const updated = suggestions.reduce(applySceneFieldSuggestion, draft.fields);

    expect(suggestions).toHaveLength(2);
    expect(updated.find((field) => field.label === "光线")?.value).toBe("柔和侧光");
    expect(updated.find((field) => field.label === "材质")?.value).toBe("木质与亚麻");
  });

  it("round-trips a versioned local draft", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const draft = createSceneDraft("", "edit", "precise-object-edit");
    writeSceneCreatorDraft(draft, storage);
    expect(readSceneCreatorDraft(storage)).toEqual(draft);
  });

  it("builds a contextual assistant greeting from the current draft", () => {
    const draft = createSceneDraft("主体：护肤产品\n视觉风格：克制留白", "generate");
    draft.name = "极简护肤产品主图";

    expect(buildSceneAssistantGreeting(draft)).toContain("极简护肤产品主图");
    expect(buildSceneAssistantGreeting(draft)).toContain("主体、视觉风格");
    expect(buildSceneAssistantGreeting(createSceneDraft("", "generate"))).toContain("创作任务");
  });

  it("adapts the template assistant greeting and shortcuts to the extraction scenario", () => {
    const draft = createSceneDraft("色彩角色：近黑背景与荧光绿强调", "generate");
    draft.name = "暗色荧光设计语言";
    draft.extractionScenario = "design-language";

    expect(buildSceneAssistantGreeting(draft)).toContain("设计语言模板");
    draft.extractionScenario = "series-template";
    expect(buildSceneAssistantGreeting(draft)).toContain("一个系列模板");
    expect(buildSceneAssistantGreeting(draft)).not.toContain("系列模板模板");
    expect(templateAssistantStarterSuggestions("design-language")).toEqual([
      "检查设计规则覆盖是否完整",
      "找出仍然宽泛或互相冲突的规则",
      "推荐一个跨页面示例验证设计语言"
    ]);
    expect(templateAssistantReferenceSuggestions("layout-skeleton")).toContain("提取对齐和阅读顺序");
  });

  it("routes explicit template entry actions without classifying free-form input", () => {
    expect(routeTemplateAssistantIntent("帮我设计一个可复用模板骨架", 0)).toEqual({ intent: "build" });
    expect(routeTemplateAssistantIntent("我有参考图，帮我提取可复用规则", 0)).toEqual({ intent: "extract" });
    expect(routeTemplateAssistantIntent("检查当前模板哪些规则还不清楚", 0)).toEqual({ intent: "audit" });
    expect(routeTemplateAssistantIntent("推荐一条示例需求来验证模板", 0)).toEqual({
      intent: "validate",
      useExampleRecommendation: true
    });
    expect(routeTemplateAssistantIntent("我想做一个适合春季活动的模板", 0)).toBeUndefined();
  });

  it("allows a reference-only assistant turn with a useful default instruction", () => {
    expect(resolveSceneAssistantInstruction("  保留留白风格  ", 2)).toBe("保留留白风格");
    expect(resolveSceneAssistantInstruction("", 2)).toContain("分析这些参考图");
    expect(resolveSceneAssistantInstruction("", 0)).toBe("");
  });

  it("removes empty prompt fields before saving a template", () => {
    expect(compactSceneFields([
      { id: "1", label: " 主体 ", value: " 礼品卡 " },
      { id: "2", label: "背景", value: "   " },
      { id: "3", label: "", value: " 品牌色克制 " }
    ])).toEqual([
      { id: "1", label: "主体", value: "礼品卡" },
      { id: "3", label: "", value: "品牌色克制" }
    ]);
  });
});
