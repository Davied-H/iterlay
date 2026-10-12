import type {
  GptImageUseCase,
  ImageWorkflowMode,
  TemplateAssistantEntryIntent,
  TemplateExtractionScenario
} from "@shared/types";
import { getDefaultUseCase } from "@shared/workflow";
import {
  getTemplateExtractionScenarioTemplateLabel,
  parseSceneFields,
  TEMPLATE_EXTRACTION_SCENARIO_LABELS,
  type SceneCategory,
  type SceneDefinition,
  type SceneField
} from "@/lib/scene-library";

export interface SceneDraft {
  name: string;
  description: string;
  category: SceneCategory;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  extractionScenario?: TemplateExtractionScenario;
  fields: SceneField[];
  revision: number;
}

export interface SceneFieldSuggestion {
  id: string;
  fieldId?: string;
  label: string;
  before: string;
  after: string;
  status: "pending" | "accepted" | "ignored";
}

export interface AssistantSceneField {
  label: string;
  value: string;
}

export const SCENE_CREATOR_MAX_REFERENCE_COUNT = 4;

export interface TemplateAssistantRoute {
  intent: TemplateAssistantEntryIntent;
  /** 验证模板进入专用示例需求流程，而不是普通对话。 */
  useExampleRecommendation?: boolean;
}

/**
 * 仅为模板工厂的明确入口语句分流。自由输入保留给模型的常规意图判断，
 * 避免因为关键词而错误覆盖用户的真实要求。
 */
export function routeTemplateAssistantIntent(
  instruction: string,
  referenceCount: number
): TemplateAssistantRoute | undefined {
  const value = instruction.trim();
  if (!value && referenceCount > 0) return { intent: "extract" };
  if (/(?:推荐|给出).*(?:示例|样例).*(?:验证|检验)|(?:验证|检验).*模板/u.test(value)) {
    return { intent: "validate", useExampleRecommendation: true };
  }
  if (/(?:提取|拆解|分析).*(?:参考图|图片)|(?:参考图|图片).*(?:提取|拆解|分析)/u.test(value)) {
    return { intent: "extract" };
  }
  if (/^(?:检查|找出|审查|补全).*(?:规则|覆盖|冲突|一致性|比例|对齐|阅读顺序|模块|固定|可变)/u.test(value)) {
    return { intent: "audit" };
  }
  if (/^(?:帮我)?(?:补全所有字段|把当前内容整理成可复用模板|设计一个可复用模板骨架)/u.test(value)) {
    return { intent: "build" };
  }
  return undefined;
}

export function resolveSceneAssistantInstruction(value: string, referenceCount: number): string {
  const instruction = value.trim();
  if (instruction) return instruction;
  return referenceCount > 0
    ? "请分析这些参考图，提取可复用的主体、构图、视觉风格与约束，并整理成模板字段。"
    : "";
}

export const SCENE_CREATOR_DRAFT_KEY = "iterlay.sceneCreatorDraft.v1";
const GENERATE_FIELD_LABELS = [
  "任务",
  "主体",
  "场景 / 背景",
  "构图 / 镜头",
  "视觉风格",
  "约束"
] as const;

const EDIT_FIELD_LABELS = [
  "修改目标",
  "修改内容",
  "保持不变",
  "视觉融合",
  "约束"
] as const;

export function createEmptySceneFields(mode: ImageWorkflowMode): SceneField[] {
  const labels = mode === "edit" ? EDIT_FIELD_LABELS : GENERATE_FIELD_LABELS;
  return labels.map((label) => ({ id: crypto.randomUUID(), label, value: "" }));
}

export function isDefaultEmptySceneFields(fields: SceneField[], mode: ImageWorkflowMode): boolean {
  const labels = mode === "edit" ? EDIT_FIELD_LABELS : GENERATE_FIELD_LABELS;
  return fields.length === labels.length && fields.every((field, index) => (
    field.label.trim() === labels[index] && !field.value.trim()
  ));
}

export function compactSceneFields(fields: SceneField[]): SceneField[] {
  return fields
    .map((field) => ({ ...field, label: field.label.trim(), value: field.value.trim() }))
    .filter((field) => field.value.length > 0);
}

export function createSceneDraft(
  prompt: string,
  mode: ImageWorkflowMode,
  useCase?: GptImageUseCase
): SceneDraft {
  const parsed = parseSceneFields(prompt);
  const fields = parsed.length >= 2
    ? parsed.map((field) => ({ ...field, id: crypto.randomUUID() }))
    : createEmptySceneFields(mode);
  if (parsed.length === 1 && fields[0]) fields[0] = { ...fields[0], value: parsed[0].value };
  return {
    name: "",
    description: "",
    category: mode === "edit" ? "editing" : "other",
    mode,
    useCase: useCase ?? getDefaultUseCase(mode),
    fields,
    revision: 0
  };
}

export function createSceneDraftFromScene(scene: SceneDefinition): SceneDraft {
  const sourceFields = scene.fields?.length ? scene.fields : parseSceneFields(scene.prompt);
  return {
    name: scene.name,
    description: scene.description,
    category: scene.category,
    mode: scene.mode,
    useCase: scene.useCase,
    extractionScenario: scene.extractionScenario,
    fields: sourceFields.map((field) => ({ ...field, id: crypto.randomUUID() })),
    revision: 0
  };
}

export function isSceneDraft(value: unknown): value is SceneDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<SceneDraft>;
  return (
    typeof draft.name === "string" &&
    typeof draft.description === "string" &&
    typeof draft.category === "string" &&
    (draft.mode === "generate" || draft.mode === "edit") &&
    typeof draft.useCase === "string" &&
    (
      draft.extractionScenario === undefined ||
      (typeof draft.extractionScenario === "string" && draft.extractionScenario in TEMPLATE_EXTRACTION_SCENARIO_LABELS)
    ) &&
    typeof draft.revision === "number" &&
    Array.isArray(draft.fields) &&
    draft.fields.every(
      (field) =>
        field &&
        typeof field === "object" &&
        typeof (field as SceneField).id === "string" &&
        typeof (field as SceneField).label === "string" &&
        typeof (field as SceneField).value === "string"
    )
  );
}

export function readSceneCreatorDraft(storage?: Pick<Storage, "getItem">): SceneDraft | null {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return null;
    const raw = target.getItem(SCENE_CREATOR_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSceneDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSceneCreatorDraft(
  draft: SceneDraft,
  storage?: Pick<Storage, "setItem">
): void {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    target?.setItem(SCENE_CREATOR_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Draft persistence is best-effort. */
  }
}

export function clearSceneCreatorDraft(storage?: Pick<Storage, "removeItem">): void {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    target?.removeItem(SCENE_CREATOR_DRAFT_KEY);
  } catch {
    /* Draft persistence is best-effort. */
  }
}

function normalizeFieldLabel(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase();
}

export function buildSceneFieldSuggestions(
  currentFields: SceneField[],
  proposedFields: AssistantSceneField[]
): SceneFieldSuggestion[] {
  const currentByLabel = new Map(
    currentFields.map((field) => [normalizeFieldLabel(field.label), field] as const)
  );
  return proposedFields
    .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter((field) => field.label && field.value)
    .flatMap((field) => {
      const current = currentByLabel.get(normalizeFieldLabel(field.label));
      if (current?.value.trim() === field.value) return [];
      return [{
        id: crypto.randomUUID(),
        fieldId: current?.id,
        label: field.label,
        before: current?.value ?? "",
        after: field.value,
        status: "pending" as const
      }];
    });
}

export function applySceneFieldSuggestion(
  fields: SceneField[],
  suggestion: SceneFieldSuggestion
): SceneField[] {
  if (suggestion.fieldId && fields.some((field) => field.id === suggestion.fieldId)) {
    return fields.map((field) =>
      field.id === suggestion.fieldId
        ? { ...field, value: suggestion.after }
        : field
    );
  }
  return [...fields, { id: crypto.randomUUID(), label: suggestion.label, value: suggestion.after }];
}

export function sceneDraftCompletion(draft: SceneDraft): { filled: number; total: number } {
  return {
    filled: draft.fields.filter((field) => field.value.trim()).length,
    total: draft.fields.length
  };
}

export function buildSceneAssistantGreeting(draft: SceneDraft): string {
  const name = draft.name.trim();
  const scenarioLabel = draft.extractionScenario
    ? getTemplateExtractionScenarioTemplateLabel(draft.extractionScenario)
    : "";
  const filledLabels = draft.fields
    .filter((field) => field.value.trim())
    .map((field) => field.label.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (name && filledLabels.length > 0) {
    return `我看到你正在创建${scenarioLabel ? `一个${scenarioLabel}` : "模板"}「${name}」，已经填写了${filledLabels.join("、")}。我可以继续补全其他字段，或按你的要求调整现有内容。`;
  }
  if (name) {
    return `我看到你正在创建「${name}」。告诉我它要解决什么创作任务，我会整理成完整、可编辑的提示词字段。`;
  }
  if (filledLabels.length > 0) {
    return `我已经读到当前的${filledLabels.join("、")}内容。你可以继续描述目标，我会补全模板名称、说明和其他提示词字段。`;
  }
  return "告诉我这个模板要解决什么创作任务，我会和你一起整理名称、说明和可复用的提示词字段。";
}

export function templateAssistantStarterSuggestions(
  scenario?: TemplateExtractionScenario
): string[] {
  if (scenario === "design-language") {
    return [
      "检查设计规则覆盖是否完整",
      "找出仍然宽泛或互相冲突的规则",
      "推荐一个跨页面示例验证设计语言"
    ];
  }
  if (scenario === "layout-skeleton") {
    return [
      "检查布局骨架是否足够通用",
      "补全对齐、比例和内容伸缩规则",
      "推荐一个不同内容的布局验证示例"
    ];
  }
  if (scenario === "replica") {
    return [
      "检查还原规则是否遗漏关键模块",
      "把原图实例内容改成可替换字段",
      "推荐一个替换内容后的验证示例"
    ];
  }
  if (scenario === "series-template") {
    return [
      "检查系列一致性规则是否完整",
      "区分固定设计与可变业务内容",
      "推荐一条示例需求来验证模板"
    ];
  }
  return [
    "帮我设计一个可复用模板骨架",
    "我有参考图，帮我提取可复用规则",
    "推荐一条示例需求来验证模板"
  ];
}

export function templateAssistantReferenceSuggestions(
  scenario?: TemplateExtractionScenario
): string[] {
  if (scenario === "design-language") {
    return ["提取参考图的设计规则", "补全图形、材质与强调机制", "检查参考图中的实例细节是否泄漏"];
  }
  if (scenario === "layout-skeleton") {
    return ["拆解参考图的区域与比例", "提取对齐和阅读顺序", "把具体内容改成布局槽位"];
  }
  if (scenario === "replica") {
    return ["补全参考图的模块结构", "检查关键比例与位置", "标记需要替换的实例内容"];
  }
  return ["提取参考图的视觉风格", "拆解参考图的构图与镜头", "把参考图整理成可复用模板"];
}
