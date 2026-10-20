import type { CollaborateSceneRequest, AssistantConversationMessage, TemplateExtractionScenario } from "../../shared/types.js";
import { MAX_MANAGED_IMAGE_BYTES } from "../storage/asset-store.js";
import { ProviderError } from "../providers/errors.js";

const MAX_SCENE_REFERENCE_COUNT = 4;
const MAX_SCENE_REFERENCE_BYTES = MAX_MANAGED_IMAGE_BYTES;
const MAX_SCENE_CONVERSATION_MESSAGES = 20;
const MAX_SCENE_CONVERSATION_MESSAGE_LENGTH = 12_000;
const SCENE_REFERENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function normalizeTemplateExtractionScenario(value: unknown): TemplateExtractionScenario | undefined {
  return value === "design-language" || value === "layout-skeleton" || value === "series-template" || value === "replica"
    ? value
    : undefined;
}

export function validateSceneCollaborationRequest(input: unknown): CollaborateSceneRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProviderError("INVALID_REQUEST", "图片场景大师请求格式无效。");
  }
  const request = input as Record<string, unknown>;
  if (request.locale !== undefined && request.locale !== "en-US" && request.locale !== "zh-CN") {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的界面语言。");
  }
  if (typeof request.instruction !== "string") {
    throw new ProviderError("INVALID_REQUEST", "图片场景大师缺少有效的创作要求。");
  }
  if (request.workflowMode !== "generate" && request.workflowMode !== "edit") {
    throw new ProviderError("INVALID_REQUEST", "图片场景大师收到不支持的工作流模式。");
  }
  if (!Array.isArray(request.referenceImages) || !Array.isArray(request.currentFields)) {
    throw new ProviderError("INVALID_REQUEST", "图片场景大师请求中的图片或场景字段格式无效。");
  }
  if (request.referenceImages.length > MAX_SCENE_REFERENCE_COUNT) {
    throw new ProviderError("TOO_MANY_REFERENCES", `图片场景大师一次最多分析 ${MAX_SCENE_REFERENCE_COUNT} 张参考图。`);
  }
  if (request.currentFields.length > 16) {
    throw new ProviderError("INVALID_REQUEST", "图片场景大师一次最多接收 16 个当前场景字段。");
  }
  if (request.textProviderId !== undefined && typeof request.textProviderId !== "string") {
    throw new ProviderError("INVALID_REQUEST", "图片场景大师收到无效的 Provider ID。");
  }
  if (request.agentMode !== undefined && typeof request.agentMode !== "boolean") {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的 Agent 模式设置。");
  }
  if (
    request.assistantSurface !== undefined &&
    request.assistantSurface !== "scene-template" &&
    request.assistantSurface !== "canvas-prompt" &&
    request.assistantSurface !== "canvas-edit" &&
    request.assistantSurface !== "gallery-review" &&
    request.assistantSurface !== "comic-drama" &&
    request.assistantSurface !== "video"
  ) {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的使用场景。");
  }
  if (
    request.assistantScenario !== undefined &&
    request.assistantScenario !== "ui-design" &&
    request.assistantScenario !== "video"
  ) {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的 Skill 场景。");
  }
  if (
    request.templateWorkflow !== undefined &&
    request.templateWorkflow !== "create" &&
    request.templateWorkflow !== "use"
  ) {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的模板工作流。");
  }
  if (request.conversation !== undefined && !Array.isArray(request.conversation)) {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的对话记录。");
  }
  if (request.conversationId !== undefined && typeof request.conversationId !== "string") {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的会话 ID。");
  }
  if (request.recordInHistory !== undefined && typeof request.recordInHistory !== "boolean") {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的历史记录设置。");
  }
  let memoryQuery: CollaborateSceneRequest["memoryQuery"];
  if (request.memoryQuery !== undefined) {
    if (!request.memoryQuery || typeof request.memoryQuery !== "object" || Array.isArray(request.memoryQuery)) {
      throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的记忆范围。");
    }
    const rawQuery = request.memoryQuery as Record<string, unknown>;
    const boardId = normalizeMemoryQueryValue(rawQuery.boardId);
    const sceneId = normalizeMemoryQueryValue(rawQuery.sceneId);
    const assetPath = normalizeMemoryQueryValue(rawQuery.assetPath);
    memoryQuery = {
      ...(boardId ? { boardId } : {}),
      ...(sceneId ? { sceneId } : {}),
      ...(assetPath ? { assetPath } : {})
    };
  }
  let generationSettings: CollaborateSceneRequest["generationSettings"];
  if (request.generationSettings !== undefined) {
    if (!request.generationSettings || typeof request.generationSettings !== "object" || Array.isArray(request.generationSettings)) {
      throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的生成数量设置。");
    }
    const settings = request.generationSettings as Record<string, unknown>;
    if (!Number.isInteger(settings.count) || !Number.isInteger(settings.maxCount)) {
      throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的生成数量设置。");
    }
    const count = settings.count as number;
    const maxCount = settings.maxCount as number;
    if (count < 1 || maxCount < 1 || count > maxCount || maxCount > 99) {
      throw new ProviderError("INVALID_REQUEST", "AI 助手收到超出范围的生成数量设置。");
    }
    generationSettings = { count, maxCount };
  }
  const clarificationRounds = Number.isInteger(request.clarificationRounds)
    ? Math.min(10, Math.max(0, request.clarificationRounds as number))
    : 0;

  const currentFields = request.currentFields.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 个场景字段格式无效。`);
    }
    const field = item as Record<string, unknown>;
    const label = typeof field.label === "string" ? field.label.trim() : "";
    const value = typeof field.value === "string" ? field.value.trim() : "";
    const allowsEmptyTemplateValue = request.assistantSurface === "scene-template";
    if (!label || (!value && !allowsEmptyTemplateValue)) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 个场景字段的名称和内容不能为空。`);
    }
    return { label, value };
  });

  const referenceImages = request.referenceImages.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 张参考图格式无效。`);
    }
    const image = item as Record<string, unknown>;
    const name = typeof image.name === "string" ? image.name.trim() : "";
    const mimeType = typeof image.mimeType === "string" ? image.mimeType.trim().toLowerCase() : "";
    const dataBase64 = typeof image.dataBase64 === "string" ? image.dataBase64.trim() : "";
    if (!name) throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 张参考图缺少文件名。`);
    if (!SCENE_REFERENCE_MIME_TYPES.has(mimeType)) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 张参考图格式不受支持，请使用 JPEG、PNG、WebP 或 GIF。`);
    }
    assertSceneReferenceBase64(dataBase64, index);
    return { name, mimeType, dataBase64 };
  });

  const instruction = request.instruction.trim();
  const templateScenario = normalizeTemplateExtractionScenario(request.templateScenario);
  const conversation = (request.conversation ?? []).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 条对话记录格式无效。`);
    }
    const message = item as Record<string, unknown>;
    const role: AssistantConversationMessage["role"] | null =
      message.role === "user" || message.role === "assistant" ? message.role : null;
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!role || !content) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 条对话记录内容无效。`);
    }
    if (content.length > MAX_SCENE_CONVERSATION_MESSAGE_LENGTH) {
      throw new ProviderError("INVALID_REQUEST", `第 ${index + 1} 条对话记录过长。`);
    }
    return { role, content };
  });
  if (conversation.length > MAX_SCENE_CONVERSATION_MESSAGES) {
    throw new ProviderError(
      "INVALID_REQUEST",
      `AI 助手最多保留最近 ${MAX_SCENE_CONVERSATION_MESSAGES} 条对话记录。`
    );
  }
  if (!instruction && referenceImages.length === 0 && currentFields.length === 0) {
    throw new ProviderError("INVALID_REQUEST", "请输入创作要求、上传参考图，或先填写场景字段。");
  }
  return {
    instruction,
    locale: request.locale === "en-US" ? "en-US" : "zh-CN",
    referenceImages,
    currentFields,
    ...(request.templateWorkflow === "create" || request.templateWorkflow === "use"
      ? { templateWorkflow: request.templateWorkflow }
      : {}),
    ...(templateScenario ? { templateScenario } : {}),
    ...(generationSettings ? { generationSettings } : {}),
    ...(clarificationRounds > 0 ? { clarificationRounds } : {}),
    ...(conversation.length > 0 ? { conversation } : {}),
    ...(typeof request.conversationId === "string" && request.conversationId.trim()
      ? { conversationId: request.conversationId.trim().slice(0, 128) }
      : {}),
    ...(request.recordInHistory === false ? { recordInHistory: false } : {}),
    ...(memoryQuery && Object.keys(memoryQuery).length > 0 ? { memoryQuery } : {}),
    ...(
      request.assistantSurface === "scene-template" ||
      request.assistantSurface === "canvas-prompt" ||
      request.assistantSurface === "canvas-edit" ||
      request.assistantSurface === "gallery-review" ||
      request.assistantSurface === "comic-drama" ||
      request.assistantSurface === "video"
      ? { assistantSurface: request.assistantSurface }
      : {}),
    ...(request.assistantScenario === "ui-design" || request.assistantScenario === "video"
      ? { assistantScenario: request.assistantScenario }
      : {}),
    workflowMode: request.workflowMode,
    ...(typeof request.useCase === "string" ? { useCase: request.useCase as CollaborateSceneRequest["useCase"] } : {}),
    ...(typeof request.textProviderId === "string" && request.textProviderId.trim()
      ? { textProviderId: request.textProviderId.trim() }
      : {}),
    ...(request.agentMode === true ? { agentMode: true } : {})
  };
}

function assertSceneReferenceBase64(value: string, index: number): void {
  const number = index + 1;
  const maxEncodedLength = Math.ceil(MAX_SCENE_REFERENCE_BYTES / 3) * 4;
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ProviderError("INVALID_REQUEST", `第 ${number} 张参考图包含无效的 base64 数据。`);
  }
  if (value.length > maxEncodedLength) {
    throw new ProviderError("REFERENCE_TOO_LARGE", `第 ${number} 张参考图超过 25MB，请缩小尺寸或切分图片后重试。`);
  }
  if (value.length % 4 === 1 || (value.includes("=") && value.length % 4 !== 0)) {
    throw new ProviderError("INVALID_REQUEST", `第 ${number} 张参考图包含无效的 base64 数据。`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
    throw new ProviderError("INVALID_REQUEST", `第 ${number} 张参考图包含无效的 base64 数据。`);
  }
  if (bytes.length > MAX_SCENE_REFERENCE_BYTES) {
    throw new ProviderError("REFERENCE_TOO_LARGE", `第 ${number} 张参考图超过 25MB，请缩小尺寸或切分图片后重试。`);
  }
}

export function normalizeMemoryQueryValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到无效的记忆范围标识。");
  }
  const normalized = value.trim();
  if (normalized.length > 2_048) {
    throw new ProviderError("INVALID_REQUEST", "AI 助手收到过长的记忆范围标识。");
  }
  return normalized || undefined;
}

