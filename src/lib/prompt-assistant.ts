import type { ResolvedAppLocale } from "@shared/i18n";
import type { AssistantSurface, CollaborateSceneResult, SceneAssistantField } from "@shared/types";
import { hasStructuredPromptFields, parseStructuredPromptLines } from "@/lib/structured-prompt";
import { settleAssistantToolCalls, type AssistantToolCall } from "@shared/assistant-display";

export function settleFailedAssistantMessage<T extends { content: string; streaming?: boolean }>(
  message: T,
  error: string
): T & { tone: "error" } {
  const partial = message.content.trim();
  return {
    ...message,
    content: partial && partial !== error ? `${partial}\n\n${error}` : error,
    streaming: false,
    tone: "error"
  };
}

export function settleCancelledAssistantMessages<
  T extends { content: string; streaming?: boolean; toolCalls?: AssistantToolCall[]; reasoningSummary?: string }
>(messages: T[]): T[] {
  return messages.flatMap((message) => {
    if (!message.streaming) return [message];
    if (message.toolCalls?.length) return [{
      ...message, content: message.content || "已停止执行。",
      streaming: false, toolCalls: settleAssistantToolCalls(message.toolCalls, "cancelled")
    }];
    if (message.reasoningSummary?.trim()) return [{
      ...message, content: message.content || "已停止回复。", streaming: false
    }];
    if (!message.content.trim()) return [];
    return [{ ...message, streaming: false }];
  });
}

/**
 * 图片生成后输入框会被清空，但连续创作仍需把上一轮真正提交的提示词交给助手。
 * 当前输入始终优先；历史基线只用于画板生成，避免污染图片编辑任务。
 */
export function buildPromptAssistantCurrentFields(
  prompt: string,
  previousGeneratedPrompt: string,
  surface: AssistantSurface
): SceneAssistantField[] {
  const currentPrompt = prompt.trim();
  if (currentPrompt) {
    const structured = promptToAssistantFields(currentPrompt);
    if (surface === "canvas-prompt" && structured) return structured;
    return [{
      label: surface === "canvas-edit" ? "当前编辑指令" : "提示词",
      value: currentPrompt
    }];
  }

  const continuityPrompt = previousGeneratedPrompt.trim();
  if (surface === "canvas-prompt" && continuityPrompt) {
    const structured = promptToAssistantFields(continuityPrompt);
    if (structured) {
      return structured.map((field) => ({
        label: `上一轮结构字段·${field.label}`,
        value: field.value
      }));
    }
    return [{ label: "上一轮已生成提示词（连续创作基线）", value: continuityPrompt }];
  }
  return [];
}

function promptToAssistantFields(prompt: string): SceneAssistantField[] | null {
  if (!hasStructuredPromptFields(prompt)) return null;
  const fields: SceneAssistantField[] = [];
  for (const line of parseStructuredPromptLines(prompt)) {
    const label = line.label.trim();
    const content = line.content.trim();
    if (line.separator && label && content) {
      fields.push({ label, value: content });
      continue;
    }
    if (content && fields.length > 0) {
      fields[fields.length - 1].value += `\n${content}`;
    }
  }
  return fields.length >= 2 ? fields.slice(0, 16) : null;
}

export function buildPromptAssistantGreeting(
  prompt: string,
  options: { editing: boolean; referenceCount: number; templateName?: string },
  locale: ResolvedAppLocale = "zh-CN"
): string {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
  const hasPrompt = Boolean(normalizedPrompt);
  const promptPreview = normalizedPrompt.length > 48
    ? `${normalizedPrompt.slice(0, 48)}…`
    : normalizedPrompt;
  if (locale === "en-US") {
    const referenceNote = options.referenceCount > 0
      ? `, and I can see ${options.referenceCount} selected reference ${options.referenceCount === 1 ? "image" : "images"}`
      : "";
    if (options.editing) {
      return "Tell me what you’d like to change.";
    }
    if (hasPrompt) {
      return `I found the current prompt “${promptPreview}”${referenceNote}. I can expand it, tighten it, adjust the style, or organize it into a clearer generation structure.`;
    }
    if (options.referenceCount > 0) {
      return `I can see ${options.referenceCount} selected reference ${options.referenceCount === 1 ? "image" : "images"}. I’ll use them to understand the subject, style, and composition, then help you decide the next step.`;
    }
    if (options.templateName) {
      return `You have selected the “${options.templateName}” template. Tell me the subject or occasion, and I’ll help turn it into a fitting result while keeping the template’s visual direction.`;
    }
    return "Tell me what you want to create. I’ll turn your idea into a ready-to-use prompt and help you refine it along the way.";
  }
  const referenceNote = options.referenceCount > 0
    ? `，并注意到你已经选择了 ${options.referenceCount} 张参考图`
    : "";
  if (options.editing) {
    return "告诉我想修改的地方。";
  }
  if (hasPrompt) {
    return `我已经读到当前提示词「${promptPreview}」${referenceNote}。你可以让我扩写、压缩、调整风格，或把它整理成更清晰的生成结构。`;
  }
  if (options.referenceCount > 0) {
    return `我注意到你已经选择了 ${options.referenceCount} 张参考图。我会先结合这些引用理解主体、风格和构图，再和你确认下一步想怎么使用。`;
  }
  if (options.templateName) {
    return `你已选中「${options.templateName}」模板。告诉我想呈现的人物、主题或使用场景，我会保留模板的视觉方向，并推荐适合生成的内容。`;
  }
  return "告诉我你想生成什么画面，我会把想法整理成可直接使用的提示词，并随时帮你继续修改。";
}

export function sceneAssistantFieldsToPrompt(fields: SceneAssistantField[]): string {
  if (fields.length === 1 && /^(?:完整)?提示词|prompt$/i.test(fields[0].label.trim())) {
    return fields[0].value.trim();
  }
  return fields
    .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter((field) => field.label && field.value)
    .map((field) => `${field.label}：${field.value}`)
    .join("\n");
}

export function resolveAssistantGenerationCount(
  result: CollaborateSceneResult,
  maxCount: number
): number | undefined {
  const actionCount = result.actions?.find((action) => action.type === "set_generation_count");
  const requested = result.generationCount ?? (actionCount?.type === "set_generation_count" ? actionCount.count : undefined);
  if (!Number.isInteger(requested) || (requested ?? 0) < 1) return undefined;
  return Math.min(Math.max(1, Math.trunc(maxCount) || 1), requested as number);
}
