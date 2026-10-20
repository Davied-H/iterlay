import type { useI18n } from "@/i18n";
import { settleCancelledAssistantMessages, settleFailedAssistantMessage } from "@/lib/prompt-assistant";
import type { SceneCollaborationStreamHandlers } from "@/lib/scene-collaboration-stream";
import { mergeAssistantToolCall, settleAssistantToolCalls } from "@shared/assistant-display";
import type { CollaborateSceneResult } from "@shared/types";
import type { RefObject } from "react";
import type { useAssistantSessionState } from "./use-assistant-session-state";
type AssistantStreamOptions = Pick<ReturnType<typeof useAssistantSessionState>, "assistantRequestVersionRef" | "setAssistantMessages" | "setAssistantActivity" | "assistantBackgroundRequestRef" | "setAssistantHasUnreadResult" | "setAssistantInteraction" | "setAssistantValue" | "setAssistantStreaming" | "assistantStreamRef"> & {
  requestVersion: number;
  assistantMessageId: string;
  instruction: string;
  assistantOpenRef: RefObject<boolean>;
  onAssistantCreditsUsed?: () => void;
  t: ReturnType<typeof useI18n>["t"];
  onResult: (result: CollaborateSceneResult) => void;
};
export function createAssistantStreamHandlers({
  assistantRequestVersionRef,
  setAssistantMessages,
  setAssistantActivity,
  assistantBackgroundRequestRef,
  setAssistantHasUnreadResult,
  setAssistantInteraction,
  setAssistantValue,
  setAssistantStreaming,
  assistantStreamRef,
  requestVersion,
  assistantMessageId,
  instruction,
  assistantOpenRef,
  onAssistantCreditsUsed,
  t,
  onResult
}: AssistantStreamOptions): SceneCollaborationStreamHandlers {
  return {
    onReasoningSummary: (delta) => {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      setAssistantMessages((current) => current.map((message) => message.id === assistantMessageId
        ? { ...message, reasoningSummary: ((message.reasoningSummary ?? "") + delta).slice(0, 12_000) }
        : message));
    },
    onTool: (tool) => {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      setAssistantMessages((current) => current.map((message) => message.id === assistantMessageId
        ? { ...message, toolCalls: mergeAssistantToolCall(message.toolCalls, tool) } : message));
    },
    onDelta: (delta) => {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      setAssistantMessages((current) => current.map((message) => (
        message.id === assistantMessageId ? { ...message, content: message.content + delta } : message
      )));
    },
    onResult: (result) => {
      if (assistantRequestVersionRef.current === requestVersion) {
        // Progress labels (including result-repair activity) belong to the
        // finished request, not the confirmation it may create next.
        setAssistantActivity(null);
        onResult(result);
        assistantBackgroundRequestRef.current = false;
        if (!assistantOpenRef.current) setAssistantHasUnreadResult(true);
        onAssistantCreditsUsed?.();
      }
    },
    onActivity: (label) => {
      if (assistantRequestVersionRef.current === requestVersion) setAssistantActivity(label);
    },
    onInteraction: (interactionId, interaction) => {
      if (assistantRequestVersionRef.current !== requestVersion || !interaction) return;
      setAssistantActivity(null);
      setAssistantInteraction({
        state: { id: interactionId, interaction },
        agentInteractionId: interactionId
      });
    },
    onError: (message) => {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      setAssistantMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? {
            ...settleFailedAssistantMessage(item, message),
            toolCalls: settleAssistantToolCalls(item.toolCalls, "error"),
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
    },
    onCancelled: () => {
      if (assistantRequestVersionRef.current !== requestVersion) return;
      setAssistantActivity(null);
      setAssistantInteraction(null);
      setAssistantMessages((current) => settleCancelledAssistantMessages(current).map((message) => ({
        ...message, toolCalls: settleAssistantToolCalls(message.toolCalls, "cancelled")
      })));
      assistantBackgroundRequestRef.current = false;
      setAssistantStreaming(false);
      assistantStreamRef.current = null;
    }
  };
}
