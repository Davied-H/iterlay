import type {
  CollaborateSceneResult,
  SceneAssistantField,
  UiDesignBrief,
  UiMaterialRole
} from "@shared/types";
import type { ResolvedAppLocale } from "@shared/i18n";

export interface UiDesignMaterialDescriptor {
  name: string;
  role: UiMaterialRole;
}

const UI_MATERIAL_NAME_PATTERNS: Array<[UiMaterialRole, RegExp]> = [
  ["prd", /(?:^|[\s._-])(prd|需求|产品文档)(?:$|[\s._-])/iu],
  ["wireframe", /(?:原型|线框|wireframe|prototype|flow|流程)/iu],
  ["brand", /(?:品牌|brand|logo|标志|规范|guideline)/iu],
  ["content", /(?:文案|copy|content|内容|数据)/iu],
  ["visual", /(?:视觉|设计稿|ui|mockup|效果图|高保真|design)/iu]
];

export function inferUiMaterialRole(name: string): UiMaterialRole {
  const normalized = name.trim().toLocaleLowerCase();
  return UI_MATERIAL_NAME_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "reference";
}

export function buildUiDesignBriefInstruction(
  materials: UiDesignMaterialDescriptor[],
  hasTemplate: boolean
): string {
  const materialIndex = materials.length > 0
    ? materials.map((material, index) => `${index + 1}. ${material.name}：${material.role}`).join("\n")
    : "无参考材料";
  return [
    "你正在执行 UI 设计模式。请先整理结构化 UI Brief，不要发起图片生成。",
    "把参考材料视为不同职责的输入：prd 提供需求与规则，wireframe 提供结构和流程，visual 提供视觉方向，brand 提供品牌约束，content 提供真实内容，reference 仅作补充参考。",
    "不同材料冲突时，需求与明确约束优先；不要照抄示例内容，也不要把模板或参考图误当成用户的新需求。",
    hasTemplate
      ? "currentFields 中包含模板规则。模板只提供布局、视觉规则和兼容约束，不得改变用户目标。"
      : "当前没有模板，请根据需求和材料建立清晰、可生成的界面结构。",
    `参考材料顺序与职责：\n${materialIndex}`,
    "信息不足时使用适合专业桌面产品的克制默认值，不要继续提问。",
    "fields 必须恰好返回以下 6 项：产品目标、界面载体、信息结构、视觉方向、关键约束、最终提示词。",
    "“最终提示词”必须是一段可直接交给图片模型的自包含 UI 图生成指令，明确界面类型、内容层级、关键组件、布局关系、视觉语言和需要避免的偏差。",
    "message 只简短说明 Brief 已整理完成；intent=direct，goal=create，commitment=prepare_only；不要返回 interaction、directions 或 generate 动作。"
  ].join("\n");
}

function readBriefField(
  result: CollaborateSceneResult,
  patterns: RegExp[],
  fallback: string
): string {
  const value = result.fields.find((field) => patterns.some((pattern) => pattern.test(field.label)))?.value.trim();
  return value || fallback;
}

export function createUiDesignBrief(result: CollaborateSceneResult): UiDesignBrief {
  const goal = readBriefField(result, [/产品目标/u, /目标|用途/u], "生成一张可评审的产品界面设计图");
  const surface = readBriefField(result, [/界面载体/u, /页面|平台|端/u], "桌面端产品界面");
  const structure = readBriefField(result, [/信息结构/u, /结构|布局/u], "按核心任务组织清晰的信息层级和操作路径");
  const visualDirection = readBriefField(result, [/视觉方向/u, /视觉|风格/u], "克制、专业、清晰的产品界面");
  const constraints = readBriefField(result, [/关键约束/u, /约束|保留|避免/u], "保持信息可读、组件对齐和真实产品密度");
  const generationPrompt = readBriefField(
    result,
    [/最终提示词/u, /生成提示词|提示词/u],
    result.detailedPrompt?.trim()
      || [
        `设计目标：${goal}`,
        `界面载体：${surface}`,
        `信息结构：${structure}`,
        `视觉方向：${visualDirection}`,
        `关键约束：${constraints}`
      ].join("\n")
  );

  return { goal, surface, structure, visualDirection, constraints, generationPrompt };
}

export function uiDesignBriefToFields(
  brief: UiDesignBrief,
  request = ""
): SceneAssistantField[] {
  return [
    ...(request.trim() ? [{ label: "用户原始需求", value: request.trim() }] : []),
    { label: "产品目标", value: brief.goal },
    { label: "界面载体", value: brief.surface },
    { label: "信息结构", value: brief.structure },
    { label: "视觉方向", value: brief.visualDirection },
    { label: "关键约束", value: brief.constraints },
    { label: "最终提示词", value: brief.generationPrompt }
  ];
}

export function hasUiDesignBriefFields(result: CollaborateSceneResult): boolean {
  const labels = result.fields.map((field) => field.label.trim());
  const expectedPatterns = [
    /产品目标/u,
    /界面载体/u,
    /信息结构/u,
    /视觉方向/u,
    /关键约束/u,
    /最终提示词/u
  ];
  return expectedPatterns.filter((pattern) => labels.some((label) => pattern.test(label))).length >= 4;
}

export function buildUiDesignAssistantInstruction(
  instruction: string,
  hasBrief: boolean
): string {
  return [
    "你正在画板的 UI 设计模式中作为可持续对话的 UI 设计助手。",
    hasBrief
      ? "currentFields 中包含当前 UI Brief。请基于它回应本轮反馈，不要退回到泛化的图片提示词助手。"
      : "currentFields 中包含用户原始需求和材料职责。先帮助用户形成可评审、可生成的 UI 设计方案。",
    "如果用户在咨询、比较或追问原因，只用 message 回答，intent=chat，fields=[]，不要修改 Brief。",
    "如果用户要求新增、删除或调整设计要求，message 简短说明本轮改了什么，并返回更新后的完整 Brief。",
    "更新 Brief 时 fields 必须恰好包含：产品目标、界面载体、信息结构、视觉方向、关键约束、最终提示词。",
    "“最终提示词”必须是融合全部上下文、可直接交给图片模型的自包含 UI 图生成指令。",
    "不要发起图片生成，不要返回 actions、directions 或 generate 动作；修改时 intent=direct，goal=create，commitment=prepare_only。",
    `用户本轮消息：${instruction}`
  ].join("\n");
}

export function buildUiDesignAssistantGreeting(
  brief: UiDesignBrief | null,
  materialCount: number,
  locale: ResolvedAppLocale = "zh-CN"
): string {
  if (locale === "en-US") {
    if (brief) {
      return `I’ve organized the UI Brief for ${brief.surface}. Tell me what feels off, what to keep, or what direction to try next. I’ll update the Brief before anything is generated.`;
    }
    if (materialCount > 0) {
      return `I can see ${materialCount} UI design ${materialCount === 1 ? "material" : "materials"}. Tell me the product goal or the part you want to work through first, and I’ll turn the discussion into a UI Brief.`;
    }
    return "Tell me what interface you want to design. We can work through the product goal, structure, visual direction, and constraints before generating anything.";
  }
  if (brief) {
    return `我已经整理好「${brief.surface}」的 UI Brief。你可以直接告诉我哪里不对、哪些必须保留，或想尝试什么方向；我会先更新 Brief，再进入生成。`;
  }
  if (materialCount > 0) {
    return `我已经看到 ${materialCount} 份 UI 设计材料。你可以先说产品目标，或指出最想讨论的页面问题，我会把对话逐步整理成 UI Brief。`;
  }
  return "告诉我想设计什么界面。我们可以先讨论产品目标、信息结构、视觉方向和约束，再决定什么时候生成。";
}
