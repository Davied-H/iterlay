import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssistantConversationRecord,
  AssistantMemoryQuery,
  AssistantSurface
} from "../../shared/types.js";
import type { CreationArtifact, CreationSession } from "../../shared/creation-session.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

const MAX_CONVERSATION_COUNT = 500;
const MAX_MESSAGE_LENGTH = 12_000;

export class AssistantConversationStore {
  private readonly filePath: string;
  private readonly creationFilePath: string;
  private readonly mutations = new MutationQueue();

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "assistant-conversations.json");
    this.creationFilePath = path.join(dataDir, "creation-sessions.json");
  }

  async listCreationSessions(): Promise<CreationSession[]> {
    await this.mutations.idle();
    try {
      const parsed = JSON.parse(await readFile(this.creationFilePath, "utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isCreationSession).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async saveCreationSession(input: CreationSession): Promise<CreationSession> {
    const session = normalizeCreationSession(input);
    return this.mutations.run(async () => {
      let existing: CreationSession[] = [];
      try {
        const parsed = JSON.parse(await readFile(this.creationFilePath, "utf8"));
        if (Array.isArray(parsed)) existing = parsed.filter(isCreationSession);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const next = [session, ...existing.filter((item) => item.id !== session.id)]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 200);
      await writeJsonAtomic(this.creationFilePath, next);
      return session;
    });
  }

  async addCreationArtifact(conversationId: string, artifact: CreationArtifact): Promise<CreationSession> {
    return this.mutations.run(async () => {
      const parsed = JSON.parse(await readFile(this.creationFilePath, "utf8"));
      if (!Array.isArray(parsed)) throw new Error("创作会话不存在。");
      const existing = parsed.filter(isCreationSession) as CreationSession[];
      const session = existing.find((item) => item.id === conversationId);
      if (!session) throw new Error("创作会话不存在。");
      const updated = normalizeCreationSession({ ...session,
        artifacts: [...session.artifacts.filter((item) => item.id !== artifact.id), artifact],
        events: [...session.events, { id: crypto.randomUUID(), kind: "artifact", runId: `plugin:${artifact.pluginId}`,
          artifactId: artifact.id, at: new Date().toISOString() }]
      });
      await writeJsonAtomic(this.creationFilePath, [updated, ...existing.filter((item) => item.id !== conversationId)]);
      return updated;
    });
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

function isCreationSession(value: unknown): value is CreationSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<CreationSession>;
  return typeof session.id === "string" && typeof session.title === "string"
    && Array.isArray(session.messages) && Array.isArray(session.events)
    && Array.isArray(session.artifacts) && Array.isArray(session.references);
}

function normalizeCreationSession(input: CreationSession): CreationSession {
  if (!isCreationSession(input) || !/^[a-f\d-]{8,64}$/i.test(input.id)) throw new Error("无效的创作会话。");
  const text = (value: unknown, length: number): string => typeof value === "string" ? value.trim().slice(0, length) : "";
  return {
    ...input,
    title: text(input.title, 160) || "未命名创作",
    projectId: text(input.projectId, 64) || undefined,
    draft: text(input.draft, 12000),
    queued: (input.queued ?? []).slice(0, 30).map((value) => text(value, 12000)).filter(Boolean),
    references: input.references.slice(0, 24).map((reference) => {
      const safe = { ...reference };
      delete safe.dataBase64;
      delete safe.previewUrl;
      return { ...safe, name: text(reference.name, 200), imagePath: text(reference.imagePath, 1000) || undefined };
    }),
    messages: input.messages.slice(-300).map((message) => ({ ...message,
      content: text(message.content, 12000), prompt: text(message.prompt, 12000) || undefined,
      reasoningSummary: text(message.reasoningSummary, 24000) || undefined,
      activitySteps: Array.isArray(message.activitySteps) ? message.activitySteps.slice(-100).map((step) => text(step, 2000)).filter(Boolean) : undefined,
      toolCalls: message.toolCalls?.slice(-100)
    })),
    events: input.events.slice(-1000),
    artifacts: input.artifacts.slice(-300).map((artifact) => ({ ...artifact, path: text(artifact.path, 1000) || undefined })),
    updatedAt: new Date().toISOString()
  };
}

function normalizeMessage(value: string): string {
  return value.split("\u0000").join("").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeConversationId(value: string | undefined): string {
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}
