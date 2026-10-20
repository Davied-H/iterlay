import { createAssistantStreamHandlers } from "@/features/assistant/assistant-stream-handlers";
import type { useAssistantSessionState } from "@/features/assistant/use-assistant-session-state";
import type { useI18n } from "@/i18n";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import {
  buildPromptAssistantGreeting,
  settleFailedAssistantMessage
} from "@/lib/prompt-assistant";
import { startSceneCollaborationStream } from "@/lib/scene-collaboration-stream";
import { type SceneDefinition } from "@/lib/scene-library";
import { shouldOpenTextProviderSettings, type TextProviderReadinessStatus } from "@/lib/text-provider-readiness";
import {
  buildUiDesignAssistantInstruction
} from "@/lib/ui-design-workflow";
import type { ResolvedAppLocale } from "@shared/i18n";
import type {
  AssistantSurface,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GenerateImageInput,
  SceneAssistantReference,
  UiDesignBrief
} from "@shared/types";
import type { RefObject } from "react";
import { toast } from "sonner";

function dataUrlToAssistantReference(dataUrl: string, name: string): SceneAssistantReference | null {
  const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, dataBase64] = match;
  return mimeType && dataBase64 ? { name, mimeType, dataBase64 } : null;
}
type AssistantInstructionOptions = Pick<ReturnType<typeof useAssistantSessionState>,
  | "assistantStreaming"
  | "assistantActivity"
  | "assistantIntentSuggestionRequestRef"
  | "setAssistantIntentSuggestions"
  | "setAssistantIntentSuggestionsLoading"
  | "assistantRequestVersionRef"
  | "setAssistantInteraction"
  | "setAssistantMessages"
  | "setAssistantValue"
  | "assistantBackgroundRequestRef"
  | "setAssistantStreaming"
  | "setAssistantActivity"
  | "assistantClarificationRoundsRef"
  | "assistantMessages"
  | "assistantConversationId"
  | "assistantStreamRef"
  | "setAssistantHasUnreadResult"
> & {
  input: GenerateImageInput;
  supportsPromptEnhancement: boolean;
  promptEnhancementUnavailableMessage?: string;
  promptEnhancementUnavailableReason?: TextProviderReadinessStatus;
  onOpenSettings: () => void;
  boardId: string;
  assistantAgentModeEnabled?: boolean;
  onAssistantCreditsUsed?: () => void;
  editTarget: { path: string; dataUrl: string } | null;
  activeScene: SceneDefinition | null;
  locale: ResolvedAppLocale;
  promptDraftRef: RefObject<string>;
  isUiDesignMode: boolean;
  uiBriefPreview: { brief: UiDesignBrief } | null;
  fusionPromptContext: string | null;
  buildCurrentAssistantFields: () => CollaborateSceneRequest["currentFields"];
  maxImageCount: number;
  assistantSurface: AssistantSurface;
  assistantOpenRef: RefObject<boolean>;
  t: ReturnType<typeof useI18n>["t"];
  receivePromptAssistantResult: (result: CollaborateSceneResult, id: string, previous: {
    prompt: string;
    sceneId?: string;
    n: number;
  }) => void;
  receiveComicDramaAgentResult: (result: CollaborateSceneResult, id: string, instruction: string) => void;
};

export function createAssistantInstructionSender({
  assistantStreaming,
  assistantActivity,
  assistantIntentSuggestionRequestRef,
  setAssistantIntentSuggestions,
  setAssistantIntentSuggestionsLoading,
  assistantRequestVersionRef,
  setAssistantInteraction,
  setAssistantMessages,
  setAssistantValue,
  assistantBackgroundRequestRef,
  setAssistantStreaming,
  setAssistantActivity,
  assistantClarificationRoundsRef,
  assistantMessages,
  assistantConversationId,
  assistantStreamRef,
  setAssistantHasUnreadResult,
  input,
  supportsPromptEnhancement,
  promptEnhancementUnavailableMessage,
  promptEnhancementUnavailableReason,
  onOpenSettings,
  boardId,
  assistantAgentModeEnabled,
  onAssistantCreditsUsed,
  editTarget,
  activeScene,
  locale,
  promptDraftRef,
  isUiDesignMode,
  uiBriefPreview,
  fusionPromptContext,
  buildCurrentAssistantFields,
  maxImageCount,
  assistantSurface,
  assistantOpenRef,
  t,
  receivePromptAssistantResult,
  receiveComicDramaAgentResult
}: AssistantInstructionOptions) {
  return async function sendAssistantInstruction(
    instructionValue: string,
    displayContent = instructionValue,
    clearComposer = true,
    showUserMessage = true,
    background = false
  ): Promise<void> {
    const instruction = instructionValue.trim();
    if (!instruction || assistantStreaming || assistantActivity) return;
    if (!supportsPromptEnhancement) {
      const message = promptEnhancementUnavailableMessage || "请先在设置中配置文本 Provider。";
      if (promptEnhancementUnavailableReason === "checking") toast.info(message);
      else toast.error(message);
      if (shouldOpenTextProviderSettings(promptEnhancementUnavailableReason)) {
        onOpenSettings();
      }
      return;
    }

    assistantIntentSuggestionRequestRef.current += 1;
    setAssistantIntentSuggestions([]);
    setAssistantIntentSuggestionsLoading(false);

    const requestVersion = assistantRequestVersionRef.current + 1;
    assistantRequestVersionRef.current = requestVersion;
    const assistantMessageId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const previous = { prompt: promptDraftRef.current, sceneId: input.sceneId, n: input.n };
    setAssistantInteraction(null);
    setAssistantMessages((current) => [
      ...current,
      ...(current.length === 0 ? [{
        id: "fusion-greeting", role: "assistant" as const,
        content: buildPromptAssistantGreeting(promptDraftRef.current, {
          editing: editTarget !== null, referenceCount: input.referenceImages.length, templateName: activeScene?.name
        }, locale)
      }] : []),
      ...(showUserMessage
        ? [{ id: userMessageId, role: "user" as const, content: displayContent }]
        : []),
      { id: assistantMessageId, role: "assistant", content: "", streaming: true }
    ]);
    if (clearComposer) setAssistantValue("");
    assistantBackgroundRequestRef.current = background;
    setAssistantStreaming(true);
    setAssistantActivity("正在准备你的请求…");

    try {
      let referenceImages: SceneAssistantReference[];
      if (assistantSurface === "canvas-edit") {
        if (!editTarget?.path) throw new Error("当前编辑图片不可用，请退出编辑模式后重试。");
        let targetDataUrl: string;
        try {
          targetDataUrl = editTarget.dataUrl.startsWith("data:")
            ? editTarget.dataUrl
            : await getImageWorkbenchApi().readAssetDataUrl(editTarget.path);
        } catch {
          throw new Error("无法读取当前编辑图片，请重新打开图片后重试。");
        }
        if (assistantRequestVersionRef.current !== requestVersion) return;
        const targetReference = dataUrlToAssistantReference(targetDataUrl, "当前编辑目标图");
        if (!targetReference) throw new Error("无法读取当前编辑图片，请重新打开图片后重试。");
        referenceImages = [
          targetReference,
          ...input.referenceImages.slice(0, 3).map(({ name, mimeType, dataBase64 }) => ({
            name,
            mimeType,
            dataBase64
          }))
        ];
      } else {
        referenceImages = input.referenceImages.slice(0, 4).map(({ name, mimeType, dataBase64 }) => ({
          name,
          mimeType,
          dataBase64
        }));
      }

      if (showUserMessage) {
        const attachments = referenceImages.map((image, index) => ({
          id: `${userMessageId}:${index}`, name: image.name,
          src: `data:${image.mimeType};base64,${image.dataBase64}`,
          role: assistantSurface === "canvas-edit" && index === 0 ? "edit-target" as const : "reference" as const
        }));
        setAssistantMessages((current) => current.map((message) => message.id === userMessageId ? { ...message, attachments } : message));
      }
      const request = {
        instruction: isUiDesignMode
          ? buildUiDesignAssistantInstruction(instruction, Boolean(uiBriefPreview))
          : instruction,
        locale,
        referenceImages,
        currentFields: [
          ...buildCurrentAssistantFields(),
          ...(fusionPromptContext ? [{ label: "当前提示词上下文", value: fusionPromptContext }] : [])
        ],
        generationSettings: {
          count: input.n,
          maxCount: maxImageCount
        },
        clarificationRounds: assistantClarificationRoundsRef.current,
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-16)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        conversationId: assistantConversationId,
        recordInHistory: showUserMessage,
        assistantSurface,
        ...(isUiDesignMode ? { assistantScenario: "ui-design" as const } : {}),
        memoryQuery: {
          ...(boardId ? { boardId } : {}),
          ...(editTarget?.path ? { assetPath: editTarget.path } : {}),
          ...(input.sceneId ? { sceneId: input.sceneId } : {})
        },
        workflowMode: assistantSurface === "canvas-edit" ? "edit" : input.workflowMode,
        agentMode: assistantSurface === "comic-drama"
          || (assistantAgentModeEnabled && assistantSurface === "canvas-prompt")
      } satisfies CollaborateSceneRequest;

      assistantStreamRef.current = startSceneCollaborationStream(request, createAssistantStreamHandlers({
        assistantRequestVersionRef, setAssistantMessages, setAssistantActivity, assistantBackgroundRequestRef, setAssistantHasUnreadResult, setAssistantInteraction, setAssistantValue, setAssistantStreaming, assistantStreamRef, requestVersion, assistantMessageId, instruction, assistantOpenRef, onAssistantCreditsUsed, t, onResult: (result) => {
          if (assistantSurface === "comic-drama") receiveComicDramaAgentResult(result, assistantMessageId, instruction);
          else receivePromptAssistantResult(result, assistantMessageId, previous);
        }
      }));
    } catch (error) {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      const message = getWorkbenchErrorMessage(
        error,
        assistantSurface === "canvas-edit"
          ? "无法读取当前编辑图片，请重新打开图片后重试。"
          : "AI 助手暂时不可用。"
      );
      setAssistantMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? {
            ...settleFailedAssistantMessage(item, message),
            receipt: {
              label: t("assistant.retry.checkState"),
              actions: [{
                label: t("assistant.retry.edit"),
                onAction: () => setAssistantValue((current) => current.trim() ? current : instruction)
              }]
            }
          }
          : item
      )));
      setAssistantInteraction(null);
      setAssistantActivity(null);
      assistantBackgroundRequestRef.current = false;
      setAssistantStreaming(false);
      assistantStreamRef.current = null;
    }
  };
}
