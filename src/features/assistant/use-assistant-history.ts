import { buildAssistantHistory, type AssistantHistoryConversation } from "@/lib/assistant-history";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import type { AssistantSurface } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { useAssistantSessionState } from "./use-assistant-session-state";
type HistorySession = Pick<ReturnType<typeof useAssistantSessionState>, "assistantIntentSuggestionRequestRef"
  | "assistantRequestVersionRef"
  | "assistantStreamRef"
  | "assistantClarificationRoundsRef"
  | "assistantIntentSuggestionHistoryRef"
  | "setAssistantConversationId"
  | "setAssistantMessages"
  | "setAssistantValue"
  | "setAssistantInteraction"
  | "setAssistantStreaming"
  | "setAssistantActivity"
  | "setAssistantIntentSuggestions"
  | "setAssistantIntentSuggestionsLoading">;
interface AssistantHistoryOptions { session: HistorySession;
  boardId: string;
  boardNameById?: ReadonlyMap<string, string>;
  assistantSurface: AssistantSurface;
  assetPath?: string;
  onOpenAssistantConversation?: (conversationId: string, boardId?: string) => void;
  }
export function useAssistantHistory({ session, boardId, boardNameById, assistantSurface, assetPath, onOpenAssistantConversation }: AssistantHistoryOptions) {
  const {
    assistantIntentSuggestionRequestRef,
    assistantRequestVersionRef,
    assistantStreamRef,
    assistantClarificationRoundsRef,
    assistantIntentSuggestionHistoryRef,
    setAssistantConversationId,
    setAssistantMessages,
    setAssistantValue,
    setAssistantInteraction,
    setAssistantStreaming,
    setAssistantActivity,
    setAssistantIntentSuggestions,
    setAssistantIntentSuggestionsLoading
  } = session;
  const [assistantHistory, setAssistantHistory] = useState<AssistantHistoryConversation[]>([]);
  const [assistantHistoryLoading, setAssistantHistoryLoading] = useState(false);
  const [assistantHistoryScope, setAssistantHistoryScope] = useState<"board" | "all">("board");
  const historyRequestVersionRef = useRef(0);
  useEffect(() => {
    historyRequestVersionRef.current += 1;
    setAssistantHistory([]);
    setAssistantHistoryLoading(false);
    return () => { historyRequestVersionRef.current += 1; };
  }, [boardId, assistantSurface, assetPath]);

  async function loadAssistantHistory(scope = assistantHistoryScope): Promise<void> {
    const requestVersion = ++historyRequestVersionRef.current;
    setAssistantHistoryLoading(true);
    try {
      const records = await getImageWorkbenchApi().listAssistantConversations({
        ...(scope === "board" && boardId ? { boardId } : {}),
        surface: assistantSurface,
        ...(assetPath ? { assetPath: assetPath } : {})
      });
      if (historyRequestVersionRef.current !== requestVersion) return;
      setAssistantHistory(buildAssistantHistory(records, boardNameById));
    } catch (error) {
      if (historyRequestVersionRef.current !== requestVersion) return;
      toast.error(getWorkbenchErrorMessage(error, "无法读取对话历史。"));
      setAssistantHistory([]);
    } finally {
      if (historyRequestVersionRef.current === requestVersion) setAssistantHistoryLoading(false);
    }
  }
  function restoreAssistantConversation(conversation: AssistantHistoryConversation): void {
    assistantRequestVersionRef.current += 1;
    assistantIntentSuggestionRequestRef.current += 1;
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    assistantClarificationRoundsRef.current = 0;
    assistantIntentSuggestionHistoryRef.current = [];
    setAssistantConversationId(conversation.id);
    setAssistantMessages(conversation.messages);
    setAssistantValue("");
    setAssistantInteraction(null);
    setAssistantStreaming(false);
    setAssistantActivity(null);
    setAssistantIntentSuggestions([]);
    setAssistantIntentSuggestionsLoading(false);
  }
  function selectAssistantHistory(conversation: AssistantHistoryConversation): void {
    if (conversation.boardId && conversation.boardId !== boardId && onOpenAssistantConversation) {
      onOpenAssistantConversation(conversation.id, conversation.boardId);
      return;
    }
    restoreAssistantConversation(conversation);
  }
  function changeAssistantHistoryScope(scope: "board" | "all"): void {
    if (scope === assistantHistoryScope) return;
    setAssistantHistoryScope(scope);
    void loadAssistantHistory(scope);
  }
  return {
    setAssistantHistory,
    assistantHistory,
    assistantHistoryLoading,
    assistantHistoryScope,
    loadAssistantHistory,
    restoreAssistantConversation,
    selectAssistantHistory,
    changeAssistantHistoryScope
  };
}
