import type {
  GptImageEditUseCase,
  GptImageGenerateUseCase,
  GptImageUseCase,
  ImageQuality,
  ImageWorkflowMode,
  PromptSpec
} from "./types.js";

export interface GptImageUseCaseOption {
  slug: GptImageUseCase;
  mode: ImageWorkflowMode;
  label: string;
  description: string;
}

export interface PromptBuildInput extends PromptSpec {
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
}

const generateUseCases: GptImageUseCaseOption[] = [
  ["photorealistic-natural", "真实摄影", "纪实、生活方式、自然照片"],
  ["product-mockup", "产品样机", "产品、包装、目录、商品图"],
  ["ui-mockup", "UI Mockup", "App、网页界面、线框或高保真 UI"],
  ["infographic-diagram", "信息图/图解", "流程、结构、带标签的图示"],
  ["logo-brand", "Logo/品牌", "标志、字标、品牌符号"],
  ["illustration-story", "叙事插画", "漫画、儿童书、故事场景"],
  ["stylized-concept", "风格概念", "概念图、3D、绘画风格"],
  ["historical-scene", "历史场景", "特定时代、地点、服饰道具"],
  ["ads-marketing", "广告营销", "海报、Banner、社媒封面"],
  ["other", "其他", "无法归入固定类型的生成任务"]
].map(([slug, label, description]) => ({
  slug: slug as GptImageGenerateUseCase,
  mode: "generate" as const,
  label,
  description
}));

const editUseCases: GptImageUseCaseOption[] = [
  ["text-localization", "文字替换", "翻译或替换图中文字"],
  ["identity-preserve", "身份保持", "换装、人物保持、主体身份保留"],
  ["precise-object-edit", "精准物体编辑", "替换、移除或改动指定物体"],
  ["lighting-weather", "光线/天气", "季节、时间、氛围、降水"],
  ["background-extraction", "背景抠图", "透明背景、干净 cutout"],
  ["style-transfer", "风格迁移", "参考图风格迁移到主体/场景"],
  ["compositing", "多图合成", "插入、融合、匹配光线透视"],
  ["sketch-to-render", "草图渲染", "线稿、草图转写实或成品图"],
  ["other", "其他", "无法归入固定类型的编辑任务"]
].map(([slug, label, description]) => ({
  slug: slug as GptImageEditUseCase,
  mode: "edit" as const,
  label,
  description
}));

export const gptImageUseCases = [...generateUseCases, ...editUseCases];

/** 用例 slug → 中文标签（供 UI 选择器直接取用，避免重复维护）。 */
export function getUseCaseLabel(useCase?: GptImageUseCase): string {
  return gptImageUseCases.find((item) => item.slug === useCase)?.label ?? "";
}

/**
 * 结构化提示词的可编辑字段（单一真源）：AdvancedPanel 的构建器与
 * AssetDetail 的只读展示都从这里取顺序与中文标签。key 对应 PromptSpec 字段。
 */
export const PROMPT_SPEC_EDIT_FIELDS: Array<{
  key: keyof PromptSpec;
  label: string;
  placeholder: string;
}> = [
  { key: "subject", label: "主体", placeholder: "画面主角，如 一只橘猫" },
  { key: "styleMedium", label: "风格 / 媒介", placeholder: "如 电影感摄影 / 3D 渲染 / 水彩" },
  { key: "sceneBackdrop", label: "场景 / 背景", placeholder: "环境、地点、背景" },
  { key: "compositionFraming", label: "构图 / 取景", placeholder: "如 特写 / 广角 / 居中" },
  { key: "lightingMood", label: "光线 / 氛围", placeholder: "如 黄昏暖光 / 柔和棚拍" },
  { key: "colorPalette", label: "色彩", placeholder: "主色调、饱和度" },
  { key: "materialsTextures", label: "材质", placeholder: "表面质感、材料" },
  { key: "verbatimText", label: "画面文字", placeholder: "需要原样出现在图中的文字" },
  { key: "constraints", label: "约束", placeholder: "必须遵守的要求" },
  { key: "avoid", label: "避免出现", placeholder: "如 文字, 水印, 多余的手" }
];

export interface EnhanceChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * 构造"一键润色扩写"的对话消息：把用户的描述完善成可直接用于
 * 图像模型的简洁提示词。保持用户原文语言；按当前模式/用例微调侧重点。
 */
export function buildEnhanceMessages(
  prompt: string,
  mode: ImageWorkflowMode,
  useCase?: GptImageUseCase,
  templatePrompt?: string
): EnhanceChatMessage[] {
  const useCaseLabel = getUseCaseLabel(useCase);
  const focus =
    mode === "edit"
      ? "这是一次图像编辑指令：清晰描述要改动的部分，并强调保持其余内容不变。"
      : "这是一次图像生成提示词：只补全缺失且对画面有实际影响的要素，让主体和场景清楚成立。";
  const template = templatePrompt?.trim() ?? "";
  const templateRules = template
    ? [
        "你正在根据一个提示词模板生成本次可直接使用的完整提示词。",
        "模板中的固定内容是约束，必须保留；结合用户本次需求替换所有【占位符】，最终结果不得残留任何【】占位符。",
        "用户未明确但模板必需的信息，请根据语境使用克制、合理的默认值补全，不要提问，不要解释。",
        "保持模板原有字段、顺序和换行；只输出填充后的完整模板。"
      ]
    : [];
  const system = [
    "你是资深 AI 图像提示词工程师。",
    "把用户输入完善成清楚、克制、可直接喂给图像生成模型的提示词。",
    focus,
    useCaseLabel ? `目标类型：${useCaseLabel}，请贴合该类型的专业表达。` : "",
    ...templateRules,
    "严格保持用户原文的语言（中文输入则用中文输出）。",
    template
      ? "不要为了显得专业而堆砌模板以外的摄影术语，也不要新增用户没有要求的字段。"
      : "保持简洁：默认输出 2 到 4 句、约 120 字以内的自然语言，不要拆成多行字段；禁止为了显得专业而堆砌构图、镜头、光线、材质、氛围等摄影术语，只有用户已经提到或对结果确有必要时才补充对应要素。",
    template
      ? ""
      : "如果输入已是“字段：内容”的多行结构，保留原有字段、顺序、换行和【占位符】，逐行精炼优化；不要新增用户没有要求的字段，也不要合并成长段落。",
    "只输出最终提示词本身：不要解释、不要前后缀、不要 Markdown 标题或列表符号、不要加引号。"
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: template
        ? `提示词模板：\n${template}\n\n本次需求：\n${prompt.trim()}`
        : prompt.trim()
    }
  ];
}

export interface PromptTemplate {
  id: string;
  mode: ImageWorkflowMode;
  label: string;
  description: string;
  /** Prefilled prompt; bracketed 【…】 spots hint what the user should replace. */
  prompt: string;
  useCase: GptImageUseCase;
}

export const promptTemplates: PromptTemplate[] = [
  {
    id: "ad-poster",
    mode: "generate",
    label: "广告海报",
    description: "海报 / Banner / 促销",
    useCase: "ads-marketing",
    prompt:
      "任务：商业广告海报\n主体：【产品或主题】\n核心表达：突出一个清晰卖点，视觉焦点明确\n构图与版式：简洁现代，层级清楚，保留文案空间\n风格与质感：高级商业视觉，细节精致\n光线：柔和商业布光，主体轮廓清晰\n输出用途：适合社交媒体投放"
  },
  {
    id: "ecommerce",
    mode: "generate",
    label: "电商产品图",
    description: "白底 / 商品 / 样机",
    useCase: "product-mockup",
    prompt:
      "任务：电商产品图\n主体：【产品】\n背景：纯白或浅灰，无杂物干扰\n构图：居中陈列，产品完整可见，比例准确\n光线：柔和均匀的棚拍布光，阴影自然\n材质与细节：真实呈现表面纹理与边缘细节\n风格：专业商业摄影，适合商品详情页"
  },
  {
    id: "social",
    mode: "generate",
    label: "社媒配图",
    description: "竖屏 / 年轻化 / 吸睛",
    useCase: "ads-marketing",
    prompt:
      "任务：社交媒体配图\n主题：【内容】\n构图：视觉焦点突出，竖屏 9:16 友好\n色彩：明快活泼，对比清晰\n风格：年轻、轻盈、有传播感\n版式：为标题与账号信息保留安全区域"
  },
  {
    id: "storybook",
    mode: "generate",
    label: "儿童插画",
    description: "绘本 / 水彩 / 温馨",
    useCase: "illustration-story",
    prompt:
      "任务：儿童绘本插画\n故事场景：【故事场景】\n角色：造型可爱友好，表情清晰自然\n媒介：柔和水彩质感，圆润线条\n色彩与氛围：明亮温馨，低冲突配色\n构图：叙事关系清楚，适合儿童阅读"
  },
  {
    id: "avatar",
    mode: "generate",
    label: "角色头像",
    description: "半身 / 特写 / 干净背景",
    useCase: "other",
    prompt:
      "任务：角色头像\n角色设定：【角色描述】\n取景：居中半身特写，面部完整可见\n背景：干净柔和，不抢主体\n光线：面部明暗关系清晰，轮廓自然\n风格与细节：精致插画质感，五官与发丝清楚"
  },
  {
    id: "logo",
    mode: "generate",
    label: "Logo / 图标",
    description: "矢量 / 扁平 / 品牌",
    useCase: "logo-brand",
    prompt:
      "任务：品牌 Logo / 图标\n品牌或概念：【品牌或概念】\n造型：简洁几何，轮廓清晰，识别度高\n风格：现代扁平矢量设计\n色彩：单色或双色，保证缩小后仍清晰\n背景：纯色，无 mockup 与装饰元素"
  },
  {
    id: "concept",
    mode: "generate",
    label: "概念场景",
    description: "电影感 / 氛围 / 绘景",
    useCase: "stylized-concept",
    prompt:
      "任务：电影感概念场景\n环境设定：【场景】\n空间与构图：层次深远，尺度关系明确\n光线：戏剧性主光，方向与明暗逻辑统一\n氛围：宏大、有叙事张力\n细节与风格：丰富环境细节，高质量数字绘景"
  },
  {
    id: "portrait",
    mode: "generate",
    label: "写实人像",
    description: "摄影 / 自然光 / 浅景深",
    useCase: "photorealistic-natural",
    prompt:
      "任务：写实人像摄影\n人物设定：【人物描述】\n取景：自然的人像构图，主体姿态放松\n光线：自然柔和，面部曝光准确\n景深与背景：浅景深，背景简洁虚化\n质感：真实皮肤纹理，避免过度磨皮"
  },
  {
    id: "edit-object",
    mode: "edit",
    label: "局部修改",
    description: "只改指定部分",
    useCase: "precise-object-edit",
    prompt:
      "任务：局部精准修改\n修改内容：【要改动的部分】\n作用范围：仅影响用户指定区域\n保持不变：主体身份、构图、背景、光线与未指定细节\n融合要求：边缘、材质、透视与原图自然一致"
  },
  {
    id: "edit-style",
    mode: "edit",
    label: "风格迁移",
    description: "转换整体风格",
    useCase: "style-transfer",
    prompt:
      "任务：风格迁移\n目标风格：【目标风格】\n保持不变：主体身份、结构、姿态与原始构图\n迁移范围：色彩、笔触、材质与整体视觉语言\n一致性：细节自然统一，避免结构变形"
  },
  {
    id: "edit-bg",
    mode: "edit",
    label: "背景抠图",
    description: "透明背景 cutout",
    useCase: "background-extraction",
    prompt:
      "任务：背景抠除\n保留内容：完整主体及必要的半透明细节\n移除内容：全部背景与背景残留\n边缘要求：轮廓干净自然，无白边、黑边或锯齿\n输出：透明背景 PNG cutout"
  },
  {
    id: "edit-text",
    mode: "edit",
    label: "文字替换",
    description: "替换图中文字",
    useCase: "text-localization",
    prompt:
      "任务：图片文字替换\n替换文字：【新文字】\n保持不变：原有字体风格、字号层级、排版与位置\n融合要求：透视、颜色、纹理与背景自然一致\n约束：除目标文字外不修改其他画面内容"
  }
];

export function getTemplatesForMode(mode: ImageWorkflowMode): PromptTemplate[] {
  return promptTemplates.filter((template) => template.mode === mode);
}

export const gptImageSizeShortcuts: Record<string, string> = {
  "1k": "1024x1024",
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
  "2k": "2560x1440",
  wide: "2560x1440",
  tall: "1440x2560",
  "4k": "3840x2160"
};

export function getUseCasesForMode(mode: ImageWorkflowMode): GptImageUseCaseOption[] {
  return gptImageUseCases.filter((item) => item.mode === mode);
}

export function getDefaultUseCase(mode: ImageWorkflowMode): GptImageUseCase {
  return mode === "edit" ? "precise-object-edit" : "ads-marketing";
}

export function getDefaultQuality(mode: ImageWorkflowMode, useCase?: GptImageUseCase): ImageQuality {
  if (mode === "edit") return "high";
  if (!useCase) return "medium";
  if (
    useCase.endsWith("-mockup") ||
    useCase === "logo-brand" ||
    useCase === "infographic-diagram" ||
    useCase === "ads-marketing"
  ) {
    return "high";
  }
  if (useCase === "other") return "medium";
  return "medium";
}

/** gpt-image-2 自定义尺寸约束（单一真实源，供 parseGptImageSize 与 UI 复用）。 */
export const GPT_IMAGE_MAX_EDGE = 3840;
export const GPT_IMAGE_MIN_PIXELS = 655360;
export const GPT_IMAGE_MAX_PIXELS = 8294400;
/** 超过 2560×1440 总量属于实验性支持（允许应用，仅提示）。 */
export const GPT_IMAGE_EXPERIMENTAL_PIXELS = 2560 * 1440;

export interface SizeValidation {
  ok: boolean;
  reason?: string;
  experimental?: boolean;
}

export function validateGptImageSize(width: number, height: number): SizeValidation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false };
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    return { ok: false, reason: "宽高需为 16 的倍数" };
  }
  if (Math.max(width, height) > GPT_IMAGE_MAX_EDGE) {
    return { ok: false, reason: `最长边不超过 ${GPT_IMAGE_MAX_EDGE}px` };
  }
  if (Math.max(width, height) / Math.min(width, height) > 3) {
    return { ok: false, reason: "长宽比不超过 3:1" };
  }
  const pixels = width * height;
  if (pixels < GPT_IMAGE_MIN_PIXELS || pixels > GPT_IMAGE_MAX_PIXELS) {
    return { ok: false, reason: "总像素需在 65.5万~829万之间" };
  }
  return { ok: true, experimental: pixels > GPT_IMAGE_EXPERIMENTAL_PIXELS };
}

export function parseGptImageSize(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "auto") return "auto";

  const shortcut = gptImageSizeShortcuts[trimmed.toLowerCase()];
  if (shortcut) return shortcut;

  if (!/^\d+x\d+$/.test(trimmed)) {
    throw new Error(`invalid size ${value}`);
  }

  const [widthText, heightText] = trimmed.split("x");
  const width = Number(widthText);
  const height = Number(heightText);

  if (!validateGptImageSize(width, height).ok) {
    throw new Error(`invalid size ${value}`);
  }

  return `${width}x${height}`;
}

export function buildPromptFromSpec(input: PromptBuildInput): string {
  const lines = [
    labeledLine("Use case", input.useCase),
    labeledLine("Asset type", input.assetType),
    labeledLine("Primary request", input.primaryRequest),
    labeledLine("Input images", input.inputImages),
    labeledLine("Scene/backdrop", input.sceneBackdrop),
    labeledLine("Subject", input.subject),
    labeledLine("Style/medium", input.styleMedium),
    labeledLine("Composition/framing", input.compositionFraming),
    labeledLine("Lighting/mood", input.lightingMood),
    labeledLine("Color palette", input.colorPalette),
    labeledLine("Materials/textures", input.materialsTextures),
    input.verbatimText?.trim() ? `Text (verbatim): "${input.verbatimText.trim()}"` : "",
    labeledLine("Constraints", normalizeConstraints(input.mode, input.constraints)),
    labeledLine("Avoid", input.avoid)
  ];

  return lines.filter(Boolean).join("\n");
}

function labeledLine(label: string, value?: string): string {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : "";
}

function normalizeConstraints(mode: ImageWorkflowMode, constraints?: string): string {
  const trimmed = constraints?.trim() || "";
  if (mode !== "edit") return trimmed;

  const invariant = "change only the requested elements; keep all unspecified details unchanged";
  if (!trimmed) return invariant;
  const lower = trimmed.toLowerCase();
  if (lower.includes("change only") && lower.includes("keep")) return trimmed;
  return `${trimmed}; ${invariant}`;
}
