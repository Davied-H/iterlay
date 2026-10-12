import type { AssistantConversationRecord } from "@shared/types";

export interface AssistantHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningSummary?: string;
  generatedPrompt?: string;
  attachments?: AssistantConversationRecord["attachments"];
  toolCalls?: AssistantConversationRecord["toolCalls"];
}

export interface AssistantHistoryConversation {
  id: string;
  boardId?: string;
  boardName?: string;
  title: string;
  preview: string;
  updatedAt: string;
  exchangeCount: number;
  messages: AssistantHistoryMessage[];
}

export function buildAssistantHistory(
  records: AssistantConversationRecord[],
  boardNameById: ReadonlyMap<string, string> = new Map()
): AssistantHistoryConversation[] {
  const groups = new Map<string, AssistantConversationRecord[]>();
  for (const record of records) {
    const conversationId = record.conversationId || record.id;
    const group = groups.get(conversationId) ?? [];
    group.push(record);
    groups.set(conversationId, group);
  }

  return [...groups.entries()]
    .map(([id, group]) => {
      const exchanges = [...group].sort(
        (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
      );
      const firstInstruction = exchanges.find((record) => record.instruction.trim())?.instruction.trim();
      const latest = exchanges.at(-1);
      const latestResponse = latest ? splitStoredAssistantResponse(latest) : null;
      const title = firstLine(firstInstruction || latestResponse?.content || "未命名对话");
      const preview = firstLine(latestResponse?.content || latest?.instruction || "");
      return {
        id,
        boardId: latest?.boardId,
        boardName: latest?.boardId ? boardNameById.get(latest.boardId) : undefined,
        title,
        preview,
        updatedAt: latest?.occurredAt ?? new Date(0).toISOString(),
        exchangeCount: exchanges.length,
        messages: exchanges.flatMap((record) => [
          ...(record.instruction.trim()
            ? [{ id: `${record.id}:user`, role: "user" as const, content: record.instruction.trim(), ...(record.attachments?.length ? { attachments: record.attachments } : {}) }]
            : []),
          ...(record.response.trim() || record.generatedPrompt?.trim()
            ? [{
                id: `${record.id}:assistant`,
                role: "assistant" as const,
                ...(record.reasoningSummary?.trim() ? { reasoningSummary: record.reasoningSummary } : {}),
                ...(record.toolCalls?.length ? { toolCalls: record.toolCalls } : {}),
                ...splitStoredAssistantResponse(record)
              }]
            : [])
        ])
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** 输入应已按当前画板、助手场景等范围过滤。 */
export function getLatestAssistantConversation(
  records: AssistantConversationRecord[]
): AssistantHistoryConversation | null {
  return buildAssistantHistory(records)[0] ?? null;
}

function splitStoredAssistantResponse(record: AssistantConversationRecord): {
  content: string;
  generatedPrompt?: string;
} {
  const content = record.response.trim();
  const generatedPrompt = record.generatedPrompt?.trim();
  if (generatedPrompt) return { content, generatedPrompt };

  // 旧版本把回复与提示词以空行拼接保存；按最后一个提示词字段兼容恢复。
  const legacyMatch = content.match(
    /^(?<message>[\s\S]*?)\n\n(?:(?:完整)?提示词|prompt|编辑指令)[：:]\s*(?<prompt>[\s\S]+)$/iu
  );
  const legacyMessage = legacyMatch?.groups?.message?.trim();
  const legacyPrompt = legacyMatch?.groups?.prompt?.trim();
  if (legacyMessage && legacyPrompt) {
    return { content: legacyMessage, generatedPrompt: legacyPrompt };
  }
  return { content };
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() || "未命名对话";
}
