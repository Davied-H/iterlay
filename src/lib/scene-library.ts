import type {
  GptImageUseCase,
  ImageWorkflowMode,
  SceneTemplateConversationMessage,
  TemplateExtractionScenario
} from "@shared/types";
import { promptTemplates } from "@shared/workflow";
import { PRESET_SCENE_PREVIEW_PROMPTS } from "@/lib/scene-preview-prompts";

export type SceneCategory =
  | "marketing"
  | "product"
  | "social"
  | "illustration"
  | "portrait"
  | "brand"
  | "concept"
  | "editing"
  | "other";

export interface SceneField {
  id: string;
  label: string;
  value: string;
}

export interface SceneDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  previewImages?: string[];
  previewPrompts?: string[];
  category: SceneCategory;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  extractionScenario?: TemplateExtractionScenario;
  fields?: SceneField[];
  conversation?: SceneTemplateConversationMessage[];
  source: "preset" | "custom";
  createdAt?: string;
}

export interface NewSceneInput {
  name: string;
  description: string;
  prompt: string;
  category: SceneCategory;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  extractionScenario?: TemplateExtractionScenario;
  fields?: SceneField[];
  conversation?: SceneTemplateConversationMessage[];
}

export const SCENE_CATEGORY_LABELS: Record<SceneCategory, string> = {
  marketing: "广告营销",
  product: "产品商业",
  social: "社交内容",
  illustration: "插画叙事",
  portrait: "人物角色",
  brand: "品牌视觉",
  concept: "概念创作",
  editing: "图片编辑",
  other: "其他"
};

export const TEMPLATE_EXTRACTION_SCENARIO_LABELS: Record<TemplateExtractionScenario, string> = {
  "design-language": "设计语言",
  "layout-skeleton": "布局骨架",
  "series-template": "系列模板",
  replica: "高度还原"
};

export function getTemplateExtractionScenarioTemplateLabel(
  scenario: TemplateExtractionScenario
): string {
  const label = TEMPLATE_EXTRACTION_SCENARIO_LABELS[scenario];
  return label.endsWith("模板") ? label : `${label}模板`;
}

const PRESET_CATEGORIES: Record<string, SceneCategory> = {
  "ad-poster": "marketing",
  ecommerce: "product",
  social: "social",
  storybook: "illustration",
  avatar: "portrait",
  logo: "brand",
  concept: "concept",
  portrait: "portrait",
  "edit-object": "editing",
  "edit-style": "editing",
  "edit-bg": "editing",
  "edit-text": "editing"
};

export function buildScenePreviewImagePath(id: string, index: number, baseUrl = import.meta.env.BASE_URL): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}scene-previews/${id}/${index}.webp`;
}

const PRESET_PREVIEW_IMAGES: Record<string, string[]> = Object.fromEntries(
  Object.keys(PRESET_CATEGORIES).map((id) => [
    id,
    [1, 2, 3].map((index) => buildScenePreviewImagePath(id, index))
  ])
);

export const PRESET_SCENES: SceneDefinition[] = promptTemplates.map((template) => ({
  id: `preset:${template.id}`,
  name: template.label,
  description: template.description,
  prompt: template.prompt,
  previewImages: PRESET_PREVIEW_IMAGES[template.id],
  previewPrompts: [...(PRESET_SCENE_PREVIEW_PROMPTS[template.id] ?? [])],
  category: PRESET_CATEGORIES[template.id] ?? "other",
  mode: template.mode,
  useCase: template.useCase,
  fields: parseSceneFields(template.prompt),
  source: "preset"
}));

export const CUSTOM_SCENES_STORAGE_KEY = "iterlay.customScenes";
export const FAVORITE_SCENE_IDS_STORAGE_KEY = "iterlay.favoriteSceneIds";
export const DEFAULT_FAVORITE_SCENE_IDS: string[] = [];
export const QUICK_PRESET_SCENE_COUNT = 3;

export function findSceneForMode(
  scenes: SceneDefinition[],
  sceneId: string | undefined,
  mode: ImageWorkflowMode
): SceneDefinition | undefined {
  if (!sceneId) return undefined;
  return scenes.find((scene) => scene.id === sceneId && scene.mode === mode);
}

function isSceneCategory(value: unknown): value is SceneCategory {
  return typeof value === "string" && value in SCENE_CATEGORY_LABELS;
}

function isImageWorkflowMode(value: unknown): value is ImageWorkflowMode {
  return value === "generate" || value === "edit";
}

function isTemplateExtractionScenario(value: unknown): value is TemplateExtractionScenario {
  return value === "design-language" || value === "layout-skeleton" || value === "series-template" || value === "replica";
}

function isCustomScene(value: unknown): value is SceneDefinition {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<SceneDefinition>;
  return (
    typeof scene.id === "string" &&
    typeof scene.name === "string" &&
    typeof scene.description === "string" &&
    typeof scene.prompt === "string" &&
    scene.prompt.trim().length > 0 &&
    isSceneCategory(scene.category) &&
    isImageWorkflowMode(scene.mode) &&
    typeof scene.useCase === "string" &&
    (scene.extractionScenario === undefined || isTemplateExtractionScenario(scene.extractionScenario)) &&
    scene.source === "custom"
  );
}

function isSceneField(value: unknown): value is SceneField {
  if (!value || typeof value !== "object") return false;
  const field = value as Partial<SceneField>;
  return typeof field.id === "string" && typeof field.label === "string" && typeof field.value === "string";
}

function isSceneConversationMessage(value: unknown): value is SceneTemplateConversationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<SceneTemplateConversationMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "assistant" || message.role === "user") &&
    typeof message.content === "string"
  );
}

export function normalizeSceneConversation(value: unknown): SceneTemplateConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSceneConversationMessage)
    .map((message) => ({
      id: message.id.trim(),
      role: message.role,
      content: message.content,
      ...(message.tone === "default" || message.tone === "error" ? { tone: message.tone } : {}),
      ...(message.receipt && typeof message.receipt.label === "string"
        ? { receipt: { label: message.receipt.label } }
        : {}),
      ...(typeof message.assistantContext === "string"
        ? { assistantContext: message.assistantContext }
        : {}),
      ...(typeof message.generatedPrompt === "string"
        ? { generatedPrompt: message.generatedPrompt }
        : {})
    }))
    .filter((message) => message.id.length > 0 && message.content.trim().length > 0);
}

export function parseSceneFields(prompt: string): SceneField[] {
  return prompt
    .split(/\r?\n/)
    .map((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return null;
      const match = /^([^：:\n]+?)[：:]\s*(.*)$/.exec(line);
      return match
        ? { id: `field-${index + 1}`, label: match[1].trim(), value: match[2].trim() }
        : { id: `field-${index + 1}`, label: "", value: line };
    })
    .filter((field): field is SceneField => field !== null);
}

export function serializeSceneFields(fields: SceneField[]): string {
  return fields
    .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter((field) => field.value.length > 0)
    .map((field) => (field.label ? `${field.label}：${field.value}` : field.value))
    .join("\n");
}

function normalizeSceneFields(fields: unknown, fallbackPrompt: string): SceneField[] {
  const source = Array.isArray(fields) ? fields.filter(isSceneField) : [];
  const normalized = source
    .map((field, index) => ({
      id: field.id.trim() || `field-${index + 1}`,
      label: field.label.trim(),
      value: field.value.trim()
    }))
    .filter((field) => field.label || field.value);
  return normalized.length > 0 ? normalized : parseSceneFields(fallbackPrompt);
}

export function readCustomScenes(storage?: Pick<Storage, "getItem">): SceneDefinition[] {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return [];
    const raw = target.getItem(CUSTOM_SCENES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter(isCustomScene)
          .map((scene) => {
            const conversation = normalizeSceneConversation(scene.conversation);
            const sceneWithoutConversation = { ...scene };
            delete sceneWithoutConversation.conversation;
            return {
              ...sceneWithoutConversation,
              fields: normalizeSceneFields(scene.fields, scene.prompt),
              ...(conversation.length > 0 ? { conversation } : {})
            };
          })
      : [];
  } catch {
    return [];
  }
}

export function writeCustomScenes(
  scenes: SceneDefinition[],
  storage?: Pick<Storage, "setItem">
): void {
  const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!target) return;
  target.setItem(CUSTOM_SCENES_STORAGE_KEY, JSON.stringify(scenes.filter((scene) => scene.source === "custom")));
}

export function readFavoriteSceneIds(storage?: Pick<Storage, "getItem">): string[] {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return [...DEFAULT_FAVORITE_SCENE_IDS];
    const raw = target.getItem(FAVORITE_SCENE_IDS_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_FAVORITE_SCENE_IDS];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [...DEFAULT_FAVORITE_SCENE_IDS];
  } catch {
    return [...DEFAULT_FAVORITE_SCENE_IDS];
  }
}

export function writeFavoriteSceneIds(
  ids: string[],
  storage?: Pick<Storage, "setItem">
): void {
  const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!target) return;
  target.setItem(FAVORITE_SCENE_IDS_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}

export function sortScenesForLibrary(scenes: SceneDefinition[]): SceneDefinition[] {
  return scenes
    .map((scene, index) => ({ scene, index }))
    .sort((left, right) => {
      if (left.scene.source !== right.scene.source) {
        return left.scene.source === "custom" ? -1 : 1;
      }
      if (left.scene.source !== "custom") return left.index - right.index;

      const leftCreatedAt = left.scene.createdAt ? Date.parse(left.scene.createdAt) : Number.NaN;
      const rightCreatedAt = right.scene.createdAt ? Date.parse(right.scene.createdAt) : Number.NaN;
      const leftHasCreatedAt = Number.isFinite(leftCreatedAt);
      const rightHasCreatedAt = Number.isFinite(rightCreatedAt);
      if (leftHasCreatedAt !== rightHasCreatedAt) return leftHasCreatedAt ? -1 : 1;
      if (leftHasCreatedAt && rightHasCreatedAt && leftCreatedAt !== rightCreatedAt) {
        return rightCreatedAt - leftCreatedAt;
      }
      return left.index - right.index;
    })
    .map(({ scene }) => scene);
}

export function getQuickScenes(
  scenes: SceneDefinition[],
  favoriteSceneIds: string[],
  mode: ImageWorkflowMode,
  _editing: boolean,
  random: () => number = Math.random
): SceneDefinition[] {
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const favorites = favoriteSceneIds
    .map((id) => scenesById.get(id))
    .filter((scene): scene is SceneDefinition => scene?.mode === mode);
  const displayedIds = new Set(favorites.map((scene) => scene.id));
  const presetPool = scenes.filter(
    (scene) => scene.mode === mode && scene.source === "preset" && !displayedIds.has(scene.id)
  );

  for (let index = 0; index < Math.min(QUICK_PRESET_SCENE_COUNT, presetPool.length); index += 1) {
    const remaining = presetPool.length - index;
    const randomIndex = index + Math.floor(random() * remaining);
    [presetPool[index], presetPool[randomIndex]] = [presetPool[randomIndex], presetPool[index]];
  }

  return [...favorites, ...presetPool.slice(0, QUICK_PRESET_SCENE_COUNT)];
}

export function createCustomScene(input: NewSceneInput, id: string = crypto.randomUUID()): SceneDefinition {
  const fields = normalizeSceneFields(input.fields, input.prompt);
  const conversation = normalizeSceneConversation(input.conversation);
  return {
    id: `custom:${id}`,
    name: input.name.trim(),
    description: input.description.trim(),
    prompt: serializeSceneFields(fields) || input.prompt.trim(),
    category: input.category,
    mode: input.mode,
    useCase: input.useCase,
    extractionScenario: input.extractionScenario,
    fields,
    ...(conversation.length > 0 ? { conversation } : {}),
    source: "custom",
    createdAt: new Date().toISOString()
  };
}

export function createCustomSceneFromScene(
  scene: SceneDefinition,
  input: NewSceneInput,
  id?: string
): SceneDefinition {
  return {
    ...createCustomScene(input, id),
    previewImages: scene.previewImages ? [...scene.previewImages] : undefined,
    previewPrompts: scene.previewPrompts ? [...scene.previewPrompts] : undefined
  };
}

export function updateCustomScene(scene: SceneDefinition, input: NewSceneInput): SceneDefinition {
  const fields = normalizeSceneFields(input.fields, input.prompt);
  const conversation = normalizeSceneConversation(input.conversation ?? scene.conversation);
  const sceneWithoutConversation = { ...scene };
  delete sceneWithoutConversation.conversation;
  return {
    ...sceneWithoutConversation,
    name: input.name.trim(),
    description: input.description.trim(),
    prompt: serializeSceneFields(fields) || input.prompt.trim(),
    category: input.category,
    mode: input.mode,
    useCase: input.useCase,
    extractionScenario: input.extractionScenario,
    fields,
    ...(conversation.length > 0 ? { conversation } : {}),
    source: "custom"
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sceneMatchesGeneration(
  scene: SceneDefinition,
  prompt: string,
  sceneId?: string
): boolean {
  if (sceneId === scene.id) return true;
  if (prompt.trim() === scene.prompt.trim()) return true;

  const chunks = scene.prompt.split(/【[^】]+】/g).map(escapeRegExp);
  if (chunks.length < 2) return false;
  return new RegExp(`^${chunks.join(".+?")}$`, "s").test(prompt.trim());
}
