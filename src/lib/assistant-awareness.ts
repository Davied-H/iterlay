import type { AssistantSurface } from "@shared/types";

export const ASSISTANT_PROMPT_IDLE_MS = 2_800;

export function buildAssistantContextSignature(options: {
  surface: AssistantSurface;
  editTargetSignature: string;
  prompt: string;
  referenceSignature: string;
  /** 当前已应用模板的身份与规则；模板变化也必须触发重新理解。 */
  templateSignature?: string;
}): string {
  return [
    options.surface,
    options.editTargetSignature,
    options.prompt.trim(),
    options.referenceSignature,
    options.templateSignature ?? ""
  ].join("\u0000");
}

export function shouldScheduleAssistantPromptAnalysis(options: {
  supportsPromptEnhancement: boolean;
  prompt: string;
  working: boolean;
  contextSignature: string;
  analyzedContextSignature: string;
  submittedContextSignature: string;
}): boolean {
  return Boolean(
    options.supportsPromptEnhancement
    && options.prompt.trim()
    && !options.working
    && options.analyzedContextSignature !== options.contextSignature
    && options.submittedContextSignature !== options.contextSignature
  );
}

export function getAssistantAwarenessCopy(options: {
  visible: boolean;
  working: boolean;
  unread: boolean;
}): { toolbarLabel: string; buttonLabel: string; liveStatus: string } {
  const toolbarLabel = "AI";
  const buttonLabel = options.visible
    ? options.working ? "隐藏 AI 助手，当前正在理解" : "隐藏 AI 助手"
    : options.working
      ? "打开 AI 助手，当前正在理解"
      : options.unread ? "打开 AI 助手，已有新建议" : "打开 AI 助手";
  const liveStatus = options.working
    ? "AI 助手正在理解当前内容"
    : options.unread ? "AI 助手已有新建议" : "";
  return { toolbarLabel, buttonLabel, liveStatus };
}
