import { useUiText } from "@/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BoardMutationResult, CollaborateSceneRequest, ComicDramaBoardSnapshot } from "@shared/types";
import {
  AiAssistant,
  type AiAssistantInteractionState,
  type AiAssistantInteractionValues,
  type AiAssistantMessage
} from "@/components/assistant/AiAssistant";
import { comicDramaAssistantContext, comicDramaAssistantGuide } from "@/lib/comic-drama-assistant";
import { formatAssistantInteractionAnswers, resolveAssistantInteraction } from "@/lib/assistant-interaction";
import { startSceneCollaborationStream, type SceneCollaborationStreamHandle } from "@/lib/scene-collaboration-stream";
import { useI18n } from "@/i18n";
import "./ComicDramaWorkspace.css";

interface ComicDramaWorkspaceProps {
  children: ReactNode;
  snapshot: ComicDramaBoardSnapshot;
  selectedNodeIds: readonly string[];
  onBack: () => void;
  onBeforeAgentRequest?: () => Promise<void>;
  onAgentMutation?: (result: BoardMutationResult) => Promise<void>;
}

function guideMessage(snapshot: ComicDramaBoardSnapshot, selectedNodeIds: readonly string[]): AiAssistantMessage {
  const guide = comicDramaAssistantGuide(snapshot, selectedNodeIds);
  return {
    id: `guide:${snapshot.boardId}:${guide.stage}`,
    role: "assistant",
    content: guide.message
  };
}

export function ComicDramaWorkspace({
  children,
  snapshot,
  selectedNodeIds,
  onBack,
  onBeforeAgentRequest,
  onAgentMutation
}: ComicDramaWorkspaceProps): React.ReactElement {
  const uiText = useUiText();

  const { locale } = useI18n();
  const guide = useMemo(
    () => comicDramaAssistantGuide(snapshot, selectedNodeIds),
    [selectedNodeIds, snapshot]
  );
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<AiAssistantMessage[]>(() => [guideMessage(snapshot, selectedNodeIds)]);
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<(AiAssistantInteractionState & { agentInteractionId?: string }) | null>(null);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const snapshotRef = useRef(snapshot);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const messagesRef = useRef(messages);
  const streamRef = useRef<SceneCollaborationStreamHandle | null>(null);
  snapshotRef.current = snapshot;
  selectedNodeIdsRef.current = selectedNodeIds;
  messagesRef.current = messages;

  useEffect(() => {
    const next = guideMessage(snapshot, selectedNodeIds);
    setMessages((current) => current.some((message) => message.id === next.id) ? current : [...current, next]);
  }, [guide.stage, selectedNodeIds, snapshot]);

  useEffect(() => () => streamRef.current?.dispose(), []);

  function buildCurrentFields(currentSnapshot: ComicDramaBoardSnapshot, currentSelectedNodeIds: readonly string[]) {
    const context = comicDramaAssistantContext(currentSnapshot, currentSelectedNodeIds);
    const currentGuide = comicDramaAssistantGuide(currentSnapshot, currentSelectedNodeIds);
    const selected = currentSnapshot.nodes.filter((node) => currentSelectedNodeIds.includes(node.id));
    return [
      { label: "漫剧上下文", value: context },
      { label: "当前阶段", value: `${currentGuide.stage}：${currentGuide.message}` },
      { label: "画板 revision", value: String(currentSnapshot.revision) },
      { label: "完整漫剧节点快照", value: JSON.stringify(currentSnapshot.nodes) },
      { label: "选中节点快照", value: JSON.stringify(selected) },
      {
        label: "引用连接与分组摘要",
        value: JSON.stringify({
          connections: currentSnapshot.connections,
          groups: currentSnapshot.groups
        })
      }
    ];
  }

  async function submit(instruction = value, fromInteraction = false): Promise<void> {
    const normalized = instruction.trim();
    if (!normalized || streaming || activity || (!fromInteraction && interaction)) return;
    try {
      await onBeforeAgentRequest?.();
    } catch (reason) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reason instanceof Error ? reason.message : "保存当前画板失败，暂未启动 Agent。",
        tone: "error"
      }]);
      return;
    }
    const currentSnapshot = snapshotRef.current;
    const currentSelectedNodeIds = selectedNodeIdsRef.current;
    const userMessage: AiAssistantMessage = { id: crypto.randomUUID(), role: "user", content: normalized };
    const assistantMessageId = crypto.randomUUID();
    const conversation = messagesRef.current
      .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
      .slice(-16)
      .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content }));
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantMessageId, role: "assistant", content: "", streaming: true }
    ]);
    setValue("");
    setStreaming(true);
    setActivity("正在读取漫剧画板");

    const request: CollaborateSceneRequest = {
      instruction: normalized,
      locale,
      referenceImages: [],
      currentFields: buildCurrentFields(currentSnapshot, currentSelectedNodeIds),
      conversation,
      conversationId,
      recordInHistory: true,
      assistantSurface: "comic-drama",
      memoryQuery: { boardId: currentSnapshot.boardId },
      workflowMode: "generate",
      agentMode: true
    };
    streamRef.current?.dispose();
    try {
      streamRef.current = startSceneCollaborationStream(request, {
        onDelta: (delta) => {
          setActivity(null);
          setMessages((current) => current.map((message) => message.id === assistantMessageId
            ? { ...message, content: message.content + delta }
            : message));
        },
        onActivity: setActivity,
        onInteraction: (interactionId, nextInteraction) => {
          if (!nextInteraction) return;
          setActivity(null);
          setInteraction({
            id: interactionId,
            agentInteractionId: interactionId,
            interaction: nextInteraction
          });
        },
        onComicMutation: (result) => {
          void onAgentMutation?.(result);
        },
        onResult: (result) => {
          setMessages((current) => current.map((message) => message.id === assistantMessageId
            ? { ...message, content: result.message, streaming: false }
            : message));
          setStreaming(false);
          setActivity(null);
          streamRef.current = null;
          const nextInteraction = resolveAssistantInteraction(result, "comic-drama");
          if (nextInteraction) {
            setInteraction({
              id: crypto.randomUUID(),
              interaction: nextInteraction
            });
            return;
          }
          setInteraction(null);
        },
        onError: (message) => {
          setMessages((current) => current.map((item) => item.id === assistantMessageId
            ? { ...item, content: item.content.trim() || message, streaming: false, tone: "error" }
            : item));
          setStreaming(false);
          setActivity(null);
          setInteraction(null);
          streamRef.current = null;
        },
        onCancelled: () => {
          setMessages((current) => current.map((item) => item.id === assistantMessageId && item.streaming
            ? { ...item, content: item.content.trim() || "已停止本次请求。", streaming: false }
            : item));
          setStreaming(false);
          setActivity(null);
          setInteraction(null);
          streamRef.current = null;
        }
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "AI 助手暂时不可用。";
      setMessages((current) => current.map((item) => item.id === assistantMessageId
        ? { ...item, content: message, streaming: false, tone: "error" }
        : item));
      setStreaming(false);
      setActivity(null);
      streamRef.current = null;
    }
  }

  function stop(): void {
    streamRef.current?.cancel();
  }

  function submitInteraction(values: AiAssistantInteractionValues): void {
    if (!interaction) return;
    if (interaction.agentInteractionId) {
      setActivity("Pi Agent 正在继续处理");
      streamRef.current?.respondToInteraction(interaction.agentInteractionId, "submit", values);
      setInteraction(null);
      return;
    }
    if (interaction.interaction.type === "form") {
      const answers = formatAssistantInteractionAnswers(interaction.interaction, values);
      setInteraction(null);
      void submit(answers, true);
      return;
    }
    setInteraction(null);
  }

  function dismissInteraction(): void {
    if (!interaction) return;
    if (interaction.agentInteractionId) {
      setActivity("Pi Agent 正在继续处理");
      streamRef.current?.respondToInteraction(interaction.agentInteractionId, "dismiss");
    } else {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: "先不补充这些信息。" }
      ]);
    }
    setInteraction(null);
  }

  function startNewConversation(): void {
    streamRef.current?.cancel();
    setStreaming(false);
    setActivity(null);
    setInteraction(null);
    setConversationId(crypto.randomUUID());
    setMessages([guideMessage(snapshotRef.current, selectedNodeIdsRef.current)]);
    setValue("");
  }

  return (
    <main className="comic-drama-workspace">
      <button type="button" className="comic-drama-workspace__back" onClick={onBack}>
        {uiText("← 返回主画板")}</button>
      <section className="comic-drama-workspace__canvas" aria-label={uiText("漫剧制作画板")}>
        {children}
      </section>
      <aside className="comic-drama-workspace__assistant">
        <AiAssistant
          variant="docked"
          dockSide="right"
          title={uiText("AI 助手")}
          subtitle={`漫剧制作 · ${comicDramaAssistantContext(snapshot, selectedNodeIds)}`}
          compact
          messages={messages}
          value={value}
          placeholder={uiText("描述你想创作或修改的内容…")}
          streaming={streaming}
          activityLabel={activity ?? undefined}
          interaction={interaction}
          intentSuggestionsEnabled
          intentSuggestions={guide.suggestions}
          composerAutoFocus
          expandableComposer
          onIntentSuggestionSelect={(suggestion) => void submit(suggestion)}
          onValueChange={setValue}
          onSubmit={() => void submit()}
          onStop={stop}
          onInteractionSubmit={submitInteraction}
          onInteractionDismiss={dismissInteraction}
          onInteractionRefine={(nextValue) => {
            dismissInteraction();
            setValue(nextValue);
          }}
          onNewConversation={startNewConversation}
        />
      </aside>
    </main>
  );
}
