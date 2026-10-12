import type {
  CollaborateSceneResult,
  GptImageEditUseCase,
  GptImageGenerateUseCase,
  GptImageUseCase,
  ImageWorkflowMode,
  TemplateExtractionScenario
} from "@shared/types";
import { getDefaultUseCase } from "@shared/workflow";
import {
  parseSceneFields,
  serializeSceneFields,
  type NewSceneInput,
  type SceneCategory
} from "@/lib/scene-library";

export interface TemplateExtractionContext {
  sourcePrompt: string;
  workflowMode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  category?: SceneCategory;
  extractionScenario?: TemplateExtractionScenario;
}

export type { TemplateExtractionScenario } from "@shared/types";
export type TemplateExtractionCategory = "retained" | "variable" | "ignored";

export interface TemplateExtractionItem {
  id: string;
  label: string;
  value: string;
  category: TemplateExtractionCategory;
}

export interface TemplateExtractionResult {
  input: NewSceneInput;
  items: TemplateExtractionItem[];
}

const TEMPLATE_VARIABLE_PATTERN = /【[^】]+】/u;

export interface TemplatePromptVariation {
  id: string;
  title: string;
  prompt: string;
}

export interface TemplatePromptSet {
  basePrompt: string;
  variations: TemplatePromptVariation[];
}

export interface TemplateExampleReviewInstructionOptions {
  originalReferenceCount: number;
  generatedExampleCount: number;
  scenario?: TemplateExtractionScenario;
}

export function composeTemplateVariationPrompt(basePrompt: string, variationPrompt: string): string {
  return [basePrompt.trim(), variationPrompt.trim() ? `本张变化：${variationPrompt.trim()}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

const GENERATE_USE_CASE_BY_EDIT_USE_CASE: Record<GptImageEditUseCase, GptImageGenerateUseCase> = {
  "text-localization": "ads-marketing",
  "identity-preserve": "photorealistic-natural",
  "precise-object-edit": "other",
  "lighting-weather": "photorealistic-natural",
  "background-extraction": "product-mockup",
  "style-transfer": "stylized-concept",
  compositing: "stylized-concept",
  "sketch-to-render": "illustration-story",
  other: "other"
};

export function retargetTemplateExtractionContext(
  context: TemplateExtractionContext,
  workflowMode: ImageWorkflowMode
): TemplateExtractionContext {
  if (context.workflowMode === workflowMode) return context;
  const useCase = workflowMode === "generate"
    ? GENERATE_USE_CASE_BY_EDIT_USE_CASE[context.useCase as GptImageEditUseCase] ?? getDefaultUseCase("generate")
    : getDefaultUseCase("edit");
  return {
    sourcePrompt: context.sourcePrompt,
    workflowMode,
    useCase,
    ...(context.extractionScenario ? { extractionScenario: context.extractionScenario } : {})
  };
}

export function sceneCategoryForUseCase(useCase: GptImageUseCase): SceneCategory {
  if (useCase === "ads-marketing") return "marketing";
  if (useCase === "product-mockup") return "product";
  if (useCase === "logo-brand") return "brand";
  if (useCase === "illustration-story") return "illustration";
  if (useCase === "stylized-concept" || useCase === "historical-scene") return "concept";
  if (useCase === "photorealistic-natural") return "portrait";
  if (
    useCase === "text-localization" ||
    useCase === "identity-preserve" ||
    useCase === "precise-object-edit" ||
    useCase === "lighting-weather" ||
    useCase === "background-extraction" ||
    useCase === "style-transfer" ||
    useCase === "compositing" ||
    useCase === "sketch-to-render"
  ) return "editing";
  return "other";
}

export function buildTemplateExtractionInstruction(
  workflowMode: ImageWorkflowMode,
  hasSourcePrompt = true,
  scenario: TemplateExtractionScenario = "series-template"
): string {
  const workflowInstruction = workflowMode === "edit"
    ? "最终要保存的是图片编辑模板：每次复用时会提供一张已有图片，字段应说明编辑目标、修改范围和必须保持不变的内容。"
    : "最终要保存的是图片创建模板：每次复用时从文字需求创建一张新图片，不依赖已有图片。不要把字段写成编辑目标、修改范围、保留原图内容或其他图片编辑指令。";
  const scenarioInstruction: Record<TemplateExtractionScenario, string> = {
    "design-language": [
      "提取场景为“设计语言”：目标是让完全不同的页面或内容仍呈现同一套视觉身份，不保留原图的页面结构和业务模块。",
      "必须深入覆盖可见的色彩角色、字体层级、形状与圆角、描边与阴影、间距与视觉密度、通用组件构造、图标或插画语言、材质与光效、信息强调机制。",
      "至少返回 6 个保留项。规则必须说明作用对象、视觉关系和使用边界，禁止只写“科技感、年轻化、大圆角、柔和阴影”等宽泛形容词。",
      "只设置一个“本次创作需求”可变项；原图布局、人物、文案、数值、品牌和特定素材归入忽略项。"
    ].join("\n"),
    "layout-skeleton": [
      "提取场景为“布局骨架”：目标是在不同视觉风格和不同内容下复用构图与信息组织方式。",
      "必须深入覆盖画布比例、区域划分、主次占比、对齐基线、留白与间距节奏、阅读顺序、焦点位置和内容伸缩规律。",
      "至少返回 5 个保留项。不要把具体颜色、字体、材质、品牌资产或原文案固化为规则。主体、文案、数据、图片和列表内容写成可变项。"
    ].join("\n"),
    "series-template": [
      "提取场景为“系列模板”：目标是持续生成同系列作品，保留可跨内容复用的设计语言、信息层级、布局骨架和通用组件形态。",
      "必须同时覆盖视觉系统、空间结构、信息层级、组件构造、图形或影像语言以及关键生成约束，至少返回 6 个保留项。",
      "具体人物、品牌、文案、数字、日期、任务、商品和一次性装饰物必须改成可变项或归入忽略项。"
    ].join("\n"),
    replica: [
      "提取场景为“高度还原”：目标是在替换实例内容后仍最大程度复现原图的页面或画面。",
      "可以保留原图的画布比例、区域位置、模块数量、组件组合、内容类型、视觉系统和相对尺寸，但不要写死不可泛化的像素坐标。",
      "人物身份、品牌、原文案、具体数字日期和受版权保护的素材仍必须改成变量或归入忽略项。"
    ].join("\n")
  };
  return [
    "这是一次把画板图片沉淀为可复用模板的任务。",
    workflowInstruction,
    scenarioInstruction[scenario],
    hasSourcePrompt
      ? "请结合参考图和当前生成提示词，提取真正应该复用的构图、视觉语言、光线、材质和约束；不要机械复制本次作品中的品牌名、产品名、具体文案或一次性内容。"
      : "当前图片没有原始生成提示词，请直接根据参考图提取真正应该复用的构图、视觉语言、光线、材质和约束；不要编造图片中不可见的信息，也不要机械复制品牌名、产品名、具体文案或一次性内容。",
    "fields 必须把分析结果显式分成三类，每个 label 必须严格使用“保留·字段名”“可变·字段名”或“忽略·字段名”前缀。不要返回没有分类前缀的字段。",
    "“保留”只写可直接保存的通用规则；“可变”的 value 必须使用【变量名】占位符，可在占位符后补充通用约束；“忽略”写明从原图识别到但不应进入模板的专有名词、原文案、具体数值日期、人物身份、品牌或一次性装饰细节。至少返回一个可变项；只有原图确实存在一次性细节时才返回忽略项，不得编造。",
    "不要把忽略项换一种说法塞回保留项，也不要在保留项中复述原图的具体文字、数字、人名、品牌名或角色名。",
    "suggestedName 返回简短模板名，suggestedDescription 说明适用场景，不要使用“来自画板”“我的模板”等无信息名称。",
    "不要提问，不要返回确认表单，不要发起生成，不要给多个方向。message 只需简要说明提取了哪些可复用规则。"
  ].join("\n");
}

export function buildTemplatePreviewInstruction(
  referenceCount: number,
  variationCount = 1,
  scenario?: TemplateExtractionScenario
): string {
  const referenceInstruction = referenceCount > 0
    ? `请读取随请求提供的 ${referenceCount} 张参考图，把其中可见的主体、构图、风格和关键细节与模板规则结合；不要编造图片中不存在的内容。`
    : "本次没有参考图，请只根据模板规则和本次需求补全提示词。";
  const normalizedVariationCount = Math.max(1, Math.min(3, Math.trunc(variationCount) || 1));
  const outputInstruction = normalizedVariationCount > 1
    ? [
        `本次要生成 ${normalizedVariationCount} 张同系列图片。fields 只返回一条“母提示词”，包含所有图片必须共享的主体身份、视觉风格、材质、色彩、背景约束和输出要求。`,
        `同时返回恰好 ${normalizedVariationCount} 个 directions。每个 direction 的 prompt 只写该张图片独有的动作、姿态、取景、构图或细节变化，不要重复母提示词；各子提示词必须有清晰可见的差异。`,
        "母提示词与任一子提示词拼接后必须能直接用于图片生成，所有提示词都不得残留【】占位符。"
      ].join("\n")
    : "fields 只返回最终可直接使用的完整提示词；不得残留任何【】占位符。";
  const scenarioInstruction: Partial<Record<TemplateExtractionScenario, string>> = {
    "design-language": "这是设计语言模板：完整保留色彩角色、字体层级、形状、组件、图形与光效规则，但根据本次需求重新组织内容和布局，不要复刻原页面结构。",
    "layout-skeleton": "这是布局骨架模板：保留区域比例、对齐、阅读顺序和伸缩规则，但视觉风格、颜色、字体与材质服从本次需求。",
    "series-template": "这是系列模板：同时保持设计语言、布局骨架和系列一致性，只替换本次业务内容。",
    replica: "这是高度还原模板：保持模块组合、数量、相对位置和视觉系统，只替换各变量槽位中的实例内容。"
  };
  return [
    "请把当前模板、本次需求和参考图整理成可供用户预览的图片提示词。",
    "模板中的固定规则必须保留，并替换所有【占位符】。",
    scenario ? scenarioInstruction[scenario] ?? "" : "",
    referenceInstruction,
    outputInstruction,
    "信息不足时使用克制、合理的默认值，不要提问，不要返回确认框，不要发起图片生成。",
    "message 简要说明已生成预览，用户仍可继续修正。"
  ].join("\n");
}

export function buildTemplateExampleRecommendationInstruction(
  scenario?: TemplateExtractionScenario
): string {
  const scenarioInstruction: Partial<Record<TemplateExtractionScenario, string>> = {
    "design-language": "选择与原图业务内容和页面结构明显不同的需求，用来验证色彩、字体、组件、图形和光效规则能否跨页面成立。",
    "layout-skeleton": "选择内容类型和视觉风格明显不同、且包含长短不一信息的需求，用来验证区域比例、对齐和内容伸缩能力。",
    "series-template": "选择同一系列中具有代表性但内容不同的需求，用来验证视觉和布局是否稳定一致。",
    replica: "选择能替换主要人物、文案、数值或商品槽位的需求，用来验证结构还原与内容替换是否同时成立。"
  };
  return [
    "请为当前模板推荐一条最适合暴露模板问题的真实示例需求。",
    scenario ? scenarioInstruction[scenario] ?? "" : "",
    "这条需求应具体到主体、用途或关键信息，但不要重复模板里的固定视觉规则，也不要替用户写最终图片提示词。",
    "只返回一个 fields 项，label 必须为“示例需求”，value 是一条可直接填入示例输入框的简短中文需求；不要提问，不要返回 interaction，不要修改模板字段。",
    "message 用一句话说明为什么这条需求适合验证当前模板。"
  ].join("\n");
}

export function extractTemplateExampleRecommendation(result: CollaborateSceneResult): string {
  const recommendation = result.fields.find((field) => /示例(?:需求|描述)|测试需求/u.test(field.label));
  return recommendation?.value.trim() || result.detailedPrompt?.trim() || "";
}

export function buildTemplateGenerationBriefRecommendationInstruction(
  scenario?: TemplateExtractionScenario,
  hasExistingBrief = false
): string {
  const scenarioInstruction: Partial<Record<TemplateExtractionScenario, string>> = {
    "design-language": "选择能充分展示这套色彩、字体、组件、图形和光效语言的内容，不要照搬模板当前示例的页面结构。",
    "layout-skeleton": "选择适合当前区域比例、信息层级和内容槽位的需求，并给出足以支撑布局的主体与关键信息。",
    "series-template": "选择同一系列中有代表性、同时与模板当前示例内容不同的需求。",
    replica: "给出可以明确替换模板中主体、文案、数值或商品槽位的具体需求。"
  };
  return [
    "请根据当前模板推荐一条适合直接生成图片的真实创作需求。",
    scenario ? scenarioInstruction[scenario] ?? "" : "",
    hasExistingBrief ? "currentFields 中包含用户当前填写的需求，请推荐一个不同且更有新意的方向，不要只是改写原句。" : "",
    "需求要具体到主体、用途和最关键的内容信息，但不要重复模板中的固定视觉规则，也不要写成最终图片提示词。",
    "只返回一个 fields 项，label 必须为“生成需求”，value 是一条可直接填入输入框的简短中文需求；不要提问，不要返回 interaction，不要修改模板字段，也不要发起图片生成。",
    "message 只需简要说明推荐理由。"
  ].filter(Boolean).join("\n");
}

export function extractTemplateGenerationBriefRecommendation(result: CollaborateSceneResult): string {
  const recommendation = result.fields.find((field) => /(?:生成|创作|本次)(?:需求|描述)|想生成什么/u.test(field.label));
  return recommendation?.value.trim() || result.detailedPrompt?.trim() || "";
}

export function buildTemplateExampleReviewInstruction({
  originalReferenceCount,
  generatedExampleCount,
  scenario
}: TemplateExampleReviewInstructionOptions): string {
  const sourceRule = originalReferenceCount > 0
    ? `随请求提供的前 ${originalReferenceCount} 张图片名称以“原始参考图”开头，之后 ${generatedExampleCount} 张名称以“生成示例”开头。请逐项比较主体表达、构图、视觉语言、光线、材质和关键约束。`
    : `本次没有原始参考图，随请求提供的 ${generatedExampleCount} 张图片均为“生成示例”。请依据模板字段、示例需求和实际结果检查偏差。`;
  const scenarioInstruction: Partial<Record<TemplateExtractionScenario, string>> = {
    "design-language": "按设计语言复盘：检查色彩角色、字体层级、形状、组件构造、空间密度、图形语言、材质光效和强调机制是否稳定；不要求生成图复现原页面布局。改进后保持 6 到 10 个职责清晰的规则字段。",
    "layout-skeleton": "按布局骨架复盘：重点检查区域比例、对齐、阅读顺序、焦点位置和长短内容伸缩；不要因为生成图风格不同而把颜色、字体或材质写成固定规则。改进后保持 5 到 8 个布局字段。",
    "series-template": "按系列模板复盘：同时检查视觉身份、布局骨架、组件构造和可变内容是否在不同实例中保持一致。改进后保持 5 到 10 个职责清晰的字段。",
    replica: "按高度还原模板复盘：检查模块组合、数量、相对位置、内容类型和视觉系统是否稳定，同时确认人物、品牌、文案和数值仍是变量。改进后保持 5 到 10 个职责清晰的字段。"
  };
  return [
    "这是一次示例生成完成后的自动模板复盘。不要再次生成图片。",
    sourceRule,
    scenario ? scenarioInstruction[scenario] ?? "" : "",
    "currentFields 中的“本次示例需求”和“本次实际生成提示词”只用于复盘，不是模板字段，禁止原样返回到 fields。",
    "找出生成结果相对参考目标和模板意图的稳定偏差，只把能提高后续复用稳定性的规则写回模板；不要把本次示例中的品牌名、产品名、具体文案或一次性主体固化进模板。",
    "fields 必须返回改进后的完整模板字段，而不是只返回修改项；保留合理的【变量】占位符，并遵守当前模板场景要求的字段数量和职责边界。",
    "message 使用两段简短纯文本，不要使用 Markdown：先写“复核发现：”，引用至少一项生成示例中可见的具体偏差；再写“调整原因：”，说明该偏差与哪些现有模板规则有关、为什么建议这样调整，以及调整后会改善哪类后续复用问题。",
    "不要只说“已完成复核”“建议优化”或直接复述新的完整模板提示词。通过 interaction.type=confirm 让用户决定是否应用，不要声称已经修改模板。",
    "不要提问，不要返回生成动作。"
  ].join("\n");
}

export function createTemplatePromptSet(
  result: CollaborateSceneResult,
  variationCount: number
): TemplatePromptSet {
  const normalizedVariationCount = Math.max(1, Math.min(3, Math.trunc(variationCount) || 1));
  const basePrompt = resultPrompt(result) || result.detailedPrompt?.trim() || "";
  if (!basePrompt) throw new Error("模型没有返回可用的母提示词。");
  if (normalizedVariationCount === 1) return { basePrompt, variations: [] };

  const variations = (result.directions ?? [])
    .map((direction) => ({
      id: direction.id.trim(),
      title: direction.title.trim(),
      prompt: direction.prompt.trim()
    }))
    .filter((direction) => direction.id && direction.title && direction.prompt)
    .slice(0, normalizedVariationCount);
  if (variations.length !== normalizedVariationCount) {
    throw new Error(`模型只返回了 ${variations.length} 个有效子提示词，请重新生成。`);
  }
  return { basePrompt, variations };
}

function resultPrompt(result: CollaborateSceneResult): string {
  const fields = result.fields
    .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter((field) => field.value);
  if (fields.length === 1 && /^(?:完整)?提示词|prompt$/iu.test(fields[0].label)) {
    return fields[0].value;
  }
  return serializeSceneFields(fields.map((field, index) => ({
    id: `field-${index + 1}`,
    label: field.label,
    value: field.value
  })));
}

const EXTRACTION_LABEL_PATTERN = /^(?:[【[])?(保留|固定|可变|变量|忽略|排除)(?:[】\]])?[·:：\-\s]+(.*)$/u;

function extractionCategoryForField(label: string, value: string): {
  category: TemplateExtractionCategory;
  label: string;
} {
  const match = EXTRACTION_LABEL_PATTERN.exec(label.trim());
  if (match) {
    const category = match[1] === "保留" || match[1] === "固定"
      ? "retained"
      : match[1] === "可变" || match[1] === "变量"
        ? "variable"
        : "ignored";
    return { category, label: match[2].trim() || "生成规则" };
  }
  return {
    category: TEMPLATE_VARIABLE_PATTERN.test(value) ? "variable" : "retained",
    label: label.trim() || "生成规则"
  };
}

function variableValueForItem(item: TemplateExtractionItem): string {
  if (TEMPLATE_VARIABLE_PATTERN.test(item.value)) return item.value.trim();
  return `【${item.label.trim() || "可变内容"}】`;
}

export function buildTemplatePromptFromExtractionItems(items: TemplateExtractionItem[]): string {
  const fields = items
    .filter((item) => item.category !== "ignored")
    .map((item, index) => ({
      id: `field-${index + 1}`,
      label: item.label.trim(),
      value: item.category === "variable" ? variableValueForItem(item) : item.value.trim()
    }))
    .filter((field) => field.value);
  return ensureTemplateVariable(serializeSceneFields(fields));
}

export function parseTemplateExtractionItems(result: CollaborateSceneResult): TemplateExtractionItem[] {
  return result.fields
    .map((field, index) => {
      const normalized = extractionCategoryForField(field.label, field.value);
      return {
        id: `extraction-${index + 1}`,
        label: normalized.label,
        value: field.value.trim(),
        category: normalized.category
      } satisfies TemplateExtractionItem;
    })
    .filter((item) => item.value);
}

export function findTemplateDetailWarnings(
  items: TemplateExtractionItem[],
  prompt: string
): string[] {
  const normalizedPrompt = prompt.replace(/\s+/gu, "").toLocaleLowerCase();
  const warnings = items.flatMap((item) => {
    if (item.category === "ignored") {
      const detailCandidates = item.value
        .split(/[，,、；;。\n]|(?:\s+[·|/]\s+)/u)
        .map((detail) => detail.replace(/\s+/gu, "").toLocaleLowerCase())
        .filter((detail) => detail.length >= 3);
      if (detailCandidates.some((detail) => normalizedPrompt.includes(detail))) return [item.label];
      return [];
    }
    if (item.category !== "retained") return [];
    const sourceSpecificPattern = /(?:https?:\/\/|@[\w.-]+|\d+(?:\.\d+)?%|\d{1,2}[/-]\d{1,2}|[“"'][^”"']{2,}[”"'])/iu;
    return sourceSpecificPattern.test(item.value) ? [item.label] : [];
  });
  return [...new Set(warnings)];
}

export function ensureTemplateVariable(prompt: string): string {
  const normalized = prompt.trim();
  if (TEMPLATE_VARIABLE_PATTERN.test(normalized)) return normalized;
  return ["本次需求：【本次创作需求】", normalized].filter(Boolean).join("\n");
}

export function createTemplateDraftFromAssistant(
  result: CollaborateSceneResult,
  context: TemplateExtractionContext
): NewSceneInput {
  return createTemplateExtractionFromAssistant(result, context).input;
}

export function createTemplateExtractionFromAssistant(
  result: CollaborateSceneResult,
  context: TemplateExtractionContext
): TemplateExtractionResult {
  const items = parseTemplateExtractionItems(result);
  const classifiedPrompt = buildTemplatePromptFromExtractionItems(items);
  const fallbackPrompt = resultPrompt(result) || result.detailedPrompt?.trim() || context.sourcePrompt.trim();
  const prompt = items.length > 0 ? classifiedPrompt : ensureTemplateVariable(fallbackPrompt);
  return {
    input: {
      name: result.suggestedName?.trim() || "可复用创作模板",
      description: result.suggestedDescription?.trim() || "复用本次创作的视觉规则和生成约束",
      prompt,
      fields: parseSceneFields(prompt),
      category: context.category ?? sceneCategoryForUseCase(context.useCase),
      mode: context.workflowMode,
      useCase: context.useCase,
      extractionScenario: context.extractionScenario
    },
    items
  };
}
