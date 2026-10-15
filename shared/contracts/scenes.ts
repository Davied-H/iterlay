import type { ImageWorkflowMode, GptImageUseCase } from "./generation.js";

export interface SceneCoverFocus {
  x: number;
  y: number;
}

export interface SceneMediaResult {
  id: string;
  jobId: string;
  sceneId: string;
  path: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
  providerId?: string;
  providerName?: string;
  model?: string;
}

export interface SceneCoverImage {
  id: string;
  sceneId: string;
  path: string;
  imageUrl: string;
  sourcePath: string;
  createdAt: string;
  focus: SceneCoverFocus;
}

export interface SceneMediaSummary {
  sceneId: string;
  results: SceneMediaResult[];
  covers: SceneCoverImage[];
}

export type UiMaterialRole = "prd" | "wireframe" | "visual" | "brand" | "content" | "reference";

export type TemplateExtractionScenario = "design-language" | "layout-skeleton" | "series-template" | "replica";

/** 模板工厂首轮由界面确定的工作路线；自由输入不强行归类。 */
export type TemplateAssistantEntryIntent = "build" | "extract" | "audit" | "validate";

export type SceneTemplateCategory =
  | "marketing"
  | "product"
  | "social"
  | "illustration"
  | "portrait"
  | "brand"
  | "concept"
  | "editing"
  | "other";

export interface SceneTemplateField {
  id: string;
  label: string;
  value: string;
}

export interface SceneTemplateConversationMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  tone?: "default" | "error";
  receipt?: {
    label: string;
  };
  /** 仅发送给后续模型轮次的完整上下文，不在气泡中展示。 */
  assistantContext?: string;
  /** 本轮实际生成的完整提示词，默认折叠供回顾与复用。 */
  generatedPrompt?: string;
}

/** 可跨进程传递并写入 .itt 文件的模板定义。 */
export interface SceneTemplateData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  previewImages?: string[];
  previewPrompts?: string[];
  category: SceneTemplateCategory;
  mode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  extractionScenario?: TemplateExtractionScenario;
  fields?: SceneTemplateField[];
  conversation?: SceneTemplateConversationMessage[];
  source: "preset" | "custom";
  createdAt?: string;
}

export interface SceneTemplateImportResult {
  scene: SceneTemplateData;
  instanceCount: number;
  coverCount: number;
}

export type TemplateSubmissionStatus = "pending" | "published" | "rejected" | "taken_down" | "withdrawn";

export interface TemplateSubmissionResult {
  id: string;
  slug: string;
  name: string;
  authorName: string;
  status: TemplateSubmissionStatus;
  reviewNote?: string;
  submittedAt: string;
  reviewedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
}

export interface UiDesignBrief {
  goal: string;
  surface: string;
  structure: string;
  visualDirection: string;
  constraints: string;
  /** 已融合用户需求、材料职责和可选模板规则，可直接交给图片模型。 */
  generationPrompt: string;
}
