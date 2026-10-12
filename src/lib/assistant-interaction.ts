import type {
  AssistantSurface,
  CollaborateSceneResult,
  SceneAssistantField,
  SceneAssistantInteraction
} from "@shared/types";

const ASSISTANT_SUPPLEMENT_KEY_PREFIX = "__assistant-supplement__:";

export interface AssistantConfirmationPreviewItem {
  label?: string;
  value: string;
}

export interface AssistantConfirmationPreview {
  title: string;
  items: AssistantConfirmationPreviewItem[];
}

export function buildAssistantConfirmationPreview(
  title: string,
  items: AssistantConfirmationPreviewItem[]
): AssistantConfirmationPreview | undefined {
  const normalizedItems = items
    .map((item) => ({
      ...(item.label?.trim() ? { label: item.label.trim() } : {}),
      value: item.value.trim()
    }))
    .filter((item) => item.value);
  return normalizedItems.length > 0 ? { title, items: normalizedItems } : undefined;
}

export function buildTemplateAssistantConfirmationPreview(
  result: CollaborateSceneResult,
  current?: {
    name?: string;
    description?: string;
    fields?: SceneAssistantField[];
  }
): AssistantConfirmationPreview | undefined {
  const normalizeLabel = (value: string): string => value.trim().replace(/\s+/g, "").toLocaleLowerCase();
  const currentFields = current?.fields
    ? new Map(current.fields.map((field) => [normalizeLabel(field.label), field.value.trim()]))
    : undefined;
  const changedFields = currentFields
    ? result.fields.filter((field) => currentFields.get(normalizeLabel(field.label)) !== field.value.trim())
    : result.fields;
  return buildAssistantConfirmationPreview("将更新的模板内容", [
    ...(!current?.name?.trim() && result.suggestedName
      ? [{ label: "模板名称", value: result.suggestedName }]
      : []),
    ...(!current?.description?.trim() && result.suggestedDescription
      ? [{ label: "模板说明", value: result.suggestedDescription }]
      : []),
    ...changedFields
  ]);
}

export function buildTemplateExampleReviewConfirmationPreview(
  result: CollaborateSceneResult,
  current: {
    name?: string;
    description?: string;
    fields?: SceneAssistantField[];
  }
): AssistantConfirmationPreview | undefined {
  const changes = buildTemplateAssistantConfirmationPreview(result, current);
  const explanation = result.message.trim();
  if (!changes) {
    return explanation
      ? buildAssistantConfirmationPreview("示例复盘结论", [
          { label: "为什么建议调整", value: explanation }
        ])
      : undefined;
  }
  return buildAssistantConfirmationPreview("示例复盘建议", [
    { label: "为什么建议调整", value: explanation },
    ...changes.items
  ]);
}

export function assistantInteractionSupplementKey(fieldId: string): string {
  return `${ASSISTANT_SUPPLEMENT_KEY_PREFIX}${fieldId}`;
}

export function resolveAssistantInteraction(
  result: CollaborateSceneResult,
  surface: AssistantSurface
): SceneAssistantInteraction | undefined {
  if (result.interaction) return result.interaction;
  // 画板场景默认直接应用（应用后可撤销），只有生成模板保留确认兜底。
  if (surface !== "scene-template") return undefined;
  if (result.fields.length === 0) return undefined;

  return {
    type: "confirm",
    title: "已经可以生成模板",
    description: "确认后才会更新当前内容。",
    confirmLabel: "生成模板",
    cancelLabel: "继续完善"
  };
}

/**
 * 覆盖保护：助手结果会替换用户手动编辑过的非空内容时，
 * 在前端合成一次底部确认，避免直接应用吃掉用户手写的提示词。
 */
export function buildOverwriteConfirmInteraction(
  surface: AssistantSurface
): Extract<SceneAssistantInteraction, { type: "confirm" }> {
  const isEdit = surface === "canvas-edit";
  return {
    type: "confirm",
    title: isEdit ? "覆盖当前编辑指令？" : "覆盖当前提示词？",
    description: "你手动编辑过当前内容，确认后才会替换；应用后仍可撤销。",
    confirmLabel: isEdit ? "应用编辑指令" : "应用提示词",
    cancelLabel: "保留我的版本"
  };
}

export interface AssistantActionConfirmationOptions {
  changesPrompt: boolean;
  hasCurrentPrompt: boolean;
  generationRequestCount?: number;
  generationImageCount?: number;
}

/**
 * 画板助手的执行闸门：应用提示词和提交生成都必须由用户明确确认。
 * 一个动作同时包含覆盖和生成时，用同一个面板把两项影响说明清楚。
 */
export function buildAssistantActionConfirmInteraction(
  surface: AssistantSurface,
  options: AssistantActionConfirmationOptions
): Extract<SceneAssistantInteraction, { type: "confirm" }> {
  const requestCount = Math.max(0, Math.trunc(options.generationRequestCount ?? 0));
  const imageCount = Math.max(requestCount, Math.trunc(options.generationImageCount ?? requestCount));
  const generates = requestCount > 0;
  const isEdit = surface === "canvas-edit";
  const contentLabel = isEdit ? "编辑指令" : "提示词";

  if (generates) {
    const generationSummary = requestCount > 1
      ? `${requestCount} 个方向（共 ${imageCount} 张图片）`
      : `${imageCount} 张图片`;
    if (options.changesPrompt) {
      return {
        type: "confirm",
        title: `${options.hasCurrentPrompt ? "覆盖" : "应用"}${contentLabel}并生成？`,
        description: `确认后会先${options.hasCurrentPrompt ? "覆盖当前" : "应用 AI 助手提供的"}${contentLabel}，再提交生成 ${generationSummary}。`,
        confirmLabel: "确认并生成",
        cancelLabel: "暂不生成"
      };
    }
    return {
      type: "confirm",
      title: requestCount > 1 ? `生成 ${requestCount} 个方向？` : `生成 ${imageCount} 张图片？`,
      description: `确认后才会提交生成 ${generationSummary}。`,
      confirmLabel: "确认生成",
      cancelLabel: "暂不生成"
    };
  }

  if (options.hasCurrentPrompt) return buildOverwriteConfirmInteraction(surface);
  return {
    type: "confirm",
    title: `应用 AI 助手的${contentLabel}？`,
    description: `确认后才会更新当前${contentLabel}；应用后仍可撤销。`,
    confirmLabel: isEdit ? "应用编辑指令" : "应用提示词",
    cancelLabel: "暂不应用"
  };
}

export function formatAssistantInteractionAnswers(
  interaction: Extract<SceneAssistantInteraction, { type: "form" }>,
  values: Record<string, string | string[]>
): string {
  const lines = interaction.fields.flatMap((field) => {
    const value = values[field.id];
    const formatted = Array.isArray(value) ? value.join("、") : value?.trim();
    const supplementValue = values[assistantInteractionSupplementKey(field.id)];
    const supplement = typeof supplementValue === "string" ? supplementValue.trim() : "";
    const answer = [formatted, supplement ? `补充：${supplement}` : ""].filter(Boolean).join("；");
    return answer ? [`- ${field.label}：${answer}`] : [];
  });
  return ["我补充了这些信息：", ...lines].join("\n");
}
