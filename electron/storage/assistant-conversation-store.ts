import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssistantConversationRecord,
  AssistantMemoryQuery,
  AssistantSurface
} from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

const MAX_CONVERSATION_COUNT = 500;
const MAX_MESSAGE_LENGTH = 12_000;

export class AssistantConversationStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "assistant-conversations.json");
  }

  async add(input: {
    surface: AssistantSurface;
    instruction: string;
    response: string;
    reasoningSummary?: string;
    generatedPrompt?: string;
    attachments?: AssistantConversationRecord["attachments"];
    toolCalls?: AssistantConversationRecord["toolCalls"];
    conversationId?: string;
    memoryQuery?: AssistantMemoryQuery;
  }): Promise<AssistantConversationRecord | null> {
    const instruction = normalizeMessage(input.instruction);
    const response = normalizeMessage(input.response);
    const generatedPrompt = normalizeMessage(input.generatedPrompt ?? "");
    if (!instruction && !response && !generatedPrompt) return null;
    return this.mutations.run(async () => {
      const records = await this.read();
      const id = crypto.randomUUID();
      const record: AssistantConversationRecord = {
        id,
        conversationId: normalizeConversationId(input.conversationId) || id,
        surface: input.surface,
        instruction,
        response,
        ...(input.reasoningSummary?.trim() ? { reasoningSummary: normalizeMessage(input.reasoningSummary) } : {}),
        ...(generatedPrompt ? { generatedPrompt } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.toolCalls?.length ? { toolCalls: input.toolCalls } : {}),
        occurredAt: new Date().toISOString(),
        boardId: input.memoryQuery?.boardId,
        sceneId: input.memoryQuery?.sceneId,
        assetPath: input.memoryQuery?.assetPath
      };
      records.push(record);
      await writeJsonAtomic(this.filePath, records.slice(-MAX_CONVERSATION_COUNT));
      return record;
    });
  }

  async list(): Promise<AssistantConversationRecord[]> {
    await this.mutations.idle();
    return (await this.read())
      .map((record, index) => ({ record, index }))
      .sort((a, b) => Date.parse(b.record.occurredAt) - Date.parse(a.record.occurredAt) || b.index - a.index)
      .map(({ record }) => record);
  }

  private async read(): Promise<AssistantConversationRecord[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as AssistantConversationRecord[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((record) => ({
        ...record,
        conversationId: normalizeConversationId(record.conversationId) || record.id,
        reasoningSummary: typeof record.reasoningSummary === "string" ? normalizeMessage(record.reasoningSummary) || undefined : undefined,
        ...(typeof record.generatedPrompt === "string" && normalizeMessage(record.generatedPrompt)
          ? { generatedPrompt: normalizeMessage(record.generatedPrompt) }
          : { generatedPrompt: undefined })
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

function normalizeMessage(value: string): string {
  return value.split("\u0000").join("").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeConversationId(value: string | undefined): string {
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}
