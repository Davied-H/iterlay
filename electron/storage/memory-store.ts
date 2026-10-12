import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssistantMemoryContextItem,
  AssistantMemoryDetail,
  AssistantMemoryEvidence,
  AssistantMemoryKind,
  AssistantMemoryQuery,
  AssistantMemoryScope,
  AssistantMemoryStats,
  AssistantSurface,
  MemoryUsageLevel
} from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

export type MemoryEventType =
  | "prompt_draft"
  | "prompt_submitted"
  | "assistant_generated"
  | "assistant_conversation"
  | "comment_added"
  | "generation_succeeded"
  | "generation_failed";

export interface MemoryEventInput {
  type: MemoryEventType;
  surface: AssistantSurface | "comment" | "generation";
  content?: string;
  boardId?: string;
  sceneId?: string;
  assetPath?: string;
  jobId?: string;
  sourceId?: string;
  occurredAt?: string;
}

export interface ExtractedMemoryInput {
  kind: AssistantMemoryKind;
  scope: AssistantMemoryScope;
  content: string;
  confidence: number;
  sourceIds: string[];
}

interface MemoryEvent extends Omit<MemoryEventInput, "occurredAt"> {
  id: string;
  occurredAt: string;
}

interface StoredMemory {
  id: string;
  kind: AssistantMemoryKind;
  scope: AssistantMemoryScope;
  scopeId?: string;
  content: string;
  normalizedContent: string;
  confidence: number;
  salience: number;
  positiveSignals: number;
  negativeSignals: number;
  evidenceIds: string[];
  createdAt: string;
  lastReinforcedAt: string;
  expiresAt: string;
  status: "candidate" | "active" | "expired" | "rejected";
}

interface MemoryDatabase {
  version: 1;
  events: MemoryEvent[];
  memories: StoredMemory[];
  lastOrganizedAt?: string;
}

const MAX_EVENT_COUNT = 2_000;
const MAX_CONTENT_LENGTH = 12_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const RETRIEVAL_CONFIG: Record<MemoryUsageLevel, { days: number; limit: number; tokenBudget: number }> = {
  cautious: { days: 7, limit: 3, tokenBudget: 400 },
  balanced: { days: 90, limit: 6, tokenBudget: 800 },
  active: { days: 365, limit: 10, tokenBudget: 1_200 }
};

export class MemoryStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "assistant-memory.json");
  }

  async record(input: MemoryEventInput): Promise<void> {
    const content = normalizeContent(input.content ?? "");
    if (requiresContent(input.type) && !content) return;
    await this.mutations.run(async () => {
      const database = await this.read();
      const event: MemoryEvent = {
        ...input,
        content: content || undefined,
        id: crypto.randomUUID(),
        occurredAt: normalizeDate(input.occurredAt)
      };
      if (event.type === "prompt_draft") {
        database.events = database.events.filter((existing) => !(
          existing.type === "prompt_draft"
          && existing.surface === event.surface
          && existing.boardId === event.boardId
          && existing.sceneId === event.sceneId
        ));
        database.memories = database.memories.filter((memory) => !(
          memory.evidenceIds.some((id) => !database.events.some((existing) => existing.id === id))
        ));
      }
      database.events.push(event);
      prune(database, Date.parse(event.occurredAt));
      await this.write(database);
    });
  }

  async retrieve(
    query: AssistantMemoryQuery | undefined,
    usageLevel: MemoryUsageLevel,
    queryText: string
  ): Promise<AssistantMemoryContextItem[]> {
    await this.mutations.idle();
    const database = await this.read();
    const now = Date.now();
    const config = RETRIEVAL_CONFIG[usageLevel];
    const earliest = now - config.days * DAY_MS;
    const queryTerms = termsFor(queryText);
    const scored = database.memories.flatMap((memory) => {
      if (memory.status !== "active") return [];
      const reinforcedAt = Date.parse(memory.lastReinforcedAt);
      if (!Number.isFinite(reinforcedAt) || reinforcedAt < earliest || Date.parse(memory.expiresAt) <= now) return [];
      const scopeScore = scoreScope(memory, query, usageLevel);
      if (scopeScore < 0) return [];
      const memoryTerms = termsFor(memory.content);
      const overlap = queryTerms.size === 0 ? 0 : intersectionSize(queryTerms, memoryTerms) / queryTerms.size;
      const recency = Math.max(0, 1 - (now - reinforcedAt) / (config.days * DAY_MS));
      const reinforcement = Math.min(1, memory.positiveSignals / 4);
      const score = 0.35 * overlap
        + 0.25 * scopeScore
        + 0.20 * recency
        + 0.10 * reinforcement
        + 0.10 * memory.confidence
        - Math.min(0.5, memory.negativeSignals * 0.15);
      return [{ memory, score }];
    });

    const ranked = scored
      .sort((a, b) => b.score - a.score || Date.parse(b.memory.lastReinforcedAt) - Date.parse(a.memory.lastReinforcedAt))
      .slice(0, config.limit);
    let remainingTokens = config.tokenBudget;
    const results: AssistantMemoryContextItem[] = [];
    for (const { memory } of ranked) {
      const content = clipToTokenBudget(memory.content, remainingTokens);
      if (!content) break;
      remainingTokens -= estimateTokens(content);
      results.push({
        id: memory.id,
        kind: memory.kind,
        scope: memory.scope,
        content,
        confidence: memory.confidence,
        evidenceCount: memory.evidenceIds.length,
        lastReinforcedAt: memory.lastReinforcedAt
      });
      if (remainingTokens <= 0) break;
    }
    return results;
  }

  async organize(): Promise<AssistantMemoryStats> {
    return this.mutations.run(async () => {
      const database = await this.read();
      const now = Date.now();
      prune(database, now);
      database.lastOrganizedAt = new Date(now).toISOString();
      await this.write(database);
      return statsFromDatabase(database, now);
    });
  }

  async importEvents(inputs: MemoryEventInput[]): Promise<{ stats: AssistantMemoryStats; importedEventCount: number }> {
    return this.mutations.run(async () => {
      const database = await this.read();
      let importedEventCount = 0;
      const sorted = [...inputs].sort((a, b) => Date.parse(normalizeDate(a.occurredAt)) - Date.parse(normalizeDate(b.occurredAt)));
      for (const input of sorted) {
        const content = normalizeContent(input.content ?? "");
        if (requiresContent(input.type) && !content) continue;
        if (isImportedEventDuplicate(database.events, input, content)) continue;
        const event: MemoryEvent = {
          ...input,
          content: content || undefined,
          id: crypto.randomUUID(),
          occurredAt: normalizeDate(input.occurredAt)
        };
        database.events.push(event);
        organize(database, event);
        importedEventCount += 1;
      }
      const now = Date.now();
      prune(database, now);
      database.lastOrganizedAt = new Date(now).toISOString();
      await this.write(database);
      return { stats: statsFromDatabase(database, now), importedEventCount };
    });
  }

  async saveExtractedMemories(
    inputs: MemoryEventInput[],
    extracted: ExtractedMemoryInput[]
  ): Promise<{ stats: AssistantMemoryStats; importedEventCount: number; generatedMemoryCount: number }> {
    return this.mutations.run(async () => {
      const database = await this.read();
      let importedEventCount = 0;
      for (const input of inputs) {
        const content = normalizeContent(input.content ?? "");
        if (!content || isImportedEventDuplicate(database.events, input, content)) continue;
        database.events.push({
          ...input,
          content,
          id: crypto.randomUUID(),
          occurredAt: normalizeDate(input.occurredAt)
        });
        importedEventCount += 1;
      }

      const eventBySourceId = new Map(
        database.events.flatMap((event) => event.sourceId ? [[event.sourceId, event] as const] : [])
      );
      const rejected = database.memories.filter((memory) => memory.status === "rejected");
      const eventById = new Map(database.events.map((event) => [event.id, event]));
      const rejectedEvidenceSignatures = new Set(rejected.flatMap((memory) => {
        const sourceIds = memory.evidenceIds.flatMap((id) => {
          const sourceId = eventById.get(id)?.sourceId;
          return sourceId ? [sourceId] : [];
        });
        return sourceIds.length > 0 ? [evidenceSignature(sourceIds)] : [];
      }));
      const generatedMemories: StoredMemory[] = [];
      for (const item of extracted) {
        const content = normalizeContent(item.content);
        const normalizedContent = normalizeForMatch(content);
        const evidence = item.sourceIds.flatMap((sourceId) => {
          const event = eventBySourceId.get(sourceId);
          return event ? [event] : [];
        });
        if (!content || evidence.length === 0) continue;
        const resolvedScope = resolveExtractedScope(item.scope, evidence);
        if (rejectedEvidenceSignatures.has(evidenceSignature(item.sourceIds))) continue;
        if (rejected.some((memory) => memory.normalizedContent === normalizedContent
          && memory.scope === resolvedScope.scope && memory.scopeId === resolvedScope.scopeId)) continue;
        const occurredTimes = evidence.map((event) => Date.parse(event.occurredAt)).filter(Number.isFinite);
        const createdAt = new Date(Math.min(...occurredTimes)).toISOString();
        const lastReinforcedAt = new Date(Math.max(...occurredTimes)).toISOString();
        const ttlDays = item.kind === "procedural" ? 365 : item.kind === "semantic" ? 180 : 90;
        generatedMemories.push({
          id: crypto.randomUUID(),
          kind: item.kind,
          scope: resolvedScope.scope,
          ...(resolvedScope.scopeId ? { scopeId: resolvedScope.scopeId } : {}),
          content,
          normalizedContent,
          confidence: Math.min(0.95, Math.max(0.3, item.confidence)),
          salience: 0.75,
          positiveSignals: evidence.filter((event) => event.type === "generation_succeeded").length,
          negativeSignals: evidence.filter((event) => event.type === "generation_failed").length,
          evidenceIds: Array.from(new Set(evidence.map((event) => event.id))),
          createdAt,
          lastReinforcedAt,
          expiresAt: new Date(Date.parse(lastReinforcedAt) + ttlDays * DAY_MS).toISOString(),
          status: "active"
        });
      }
      if (generatedMemories.length > 0) database.memories = [...rejected, ...generatedMemories];
      const generatedMemoryCount = generatedMemories.length;
      const now = Date.now();
      prune(database, now);
      database.lastOrganizedAt = new Date(now).toISOString();
      await this.write(database);
      return { stats: statsFromDatabase(database, now), importedEventCount, generatedMemoryCount };
    });
  }

  async listMemories(): Promise<AssistantMemoryDetail[]> {
    await this.mutations.idle();
    const database = await this.read();
    const eventById = new Map(database.events.map((event) => [event.id, event]));
    const statusOrder: Record<AssistantMemoryDetail["status"], number> = { active: 0, candidate: 1, expired: 2 };
    return database.memories
      .filter((memory): memory is StoredMemory & { status: AssistantMemoryDetail["status"] } => memory.status !== "rejected")
      .map((memory) => {
        const evidence = memory.evidenceIds.flatMap((id): AssistantMemoryEvidence[] => {
          const event = eventById.get(id);
          if (!event) return [];
          return [{
            id: event.id,
            type: event.type,
            surface: event.surface,
            summary: evidenceSummary(event),
            occurredAt: event.occurredAt,
            boardId: event.boardId,
            sceneId: event.sceneId,
            assetPath: event.assetPath,
            jobId: event.jobId
          }];
        }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
        return {
          id: memory.id,
          kind: memory.kind,
          scope: memory.scope,
          content: memory.content,
          confidence: memory.confidence,
          evidenceCount: evidence.length,
          lastReinforcedAt: memory.lastReinforcedAt,
          status: memory.status,
          createdAt: memory.createdAt,
          expiresAt: memory.expiresAt,
          positiveSignals: memory.positiveSignals,
          negativeSignals: memory.negativeSignals,
          generationReason: generationReason(memory, evidence),
          evidence
        };
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]
        || Date.parse(b.lastReinforcedAt) - Date.parse(a.lastReinforcedAt));
  }

  async deleteMemory(id: string): Promise<boolean> {
    if (!id.trim()) return false;
    return this.mutations.run(async () => {
      const database = await this.read();
      const memory = database.memories.find((item) => item.id === id);
      if (!memory || memory.status === "rejected") return false;
      memory.status = "rejected";
      await this.write(database);
      return true;
    });
  }

  async removeBySource(sourceId: string): Promise<void> {
    if (!sourceId.trim()) return;
    await this.mutations.run(async () => {
      const database = await this.read();
      const removedIds = new Set(
        database.events.filter((event) => event.sourceId === sourceId).map((event) => event.id)
      );
      if (removedIds.size === 0) return;
      database.events = database.events.filter((event) => !removedIds.has(event.id));
      database.memories = database.memories.flatMap((memory) => {
        const evidenceIds = memory.evidenceIds.filter((id) => !removedIds.has(id));
        return evidenceIds.length > 0 ? [{ ...memory, evidenceIds }] : [];
      });
      await this.write(database);
    });
  }

  async removeScope(scope: Exclude<AssistantMemoryScope, "global">, scopeId: string): Promise<void> {
    if (!scopeId.trim()) return;
    await this.mutations.run(async () => {
      const database = await this.read();
      const matchesEvent = (event: MemoryEvent): boolean => (
        scope === "board" ? event.boardId === scopeId
          : scope === "scene" ? event.sceneId === scopeId
            : event.assetPath === scopeId
      );
      const removedIds = new Set(database.events.filter(matchesEvent).map((event) => event.id));
      database.events = database.events.filter((event) => !removedIds.has(event.id));
      database.memories = database.memories.flatMap((memory) => {
        if (memory.scope === scope && memory.scopeId === scopeId) return [];
        const evidenceIds = memory.evidenceIds.filter((id) => !removedIds.has(id));
        return evidenceIds.length > 0 ? [{ ...memory, evidenceIds }] : [];
      });
      await this.write(database);
    });
  }

  async getStats(): Promise<AssistantMemoryStats> {
    await this.mutations.idle();
    const database = await this.read();
    return statsFromDatabase(database, Date.now());
  }

  async getPendingEventCount(): Promise<number> {
    await this.mutations.idle();
    const database = await this.read();
    const referenced = new Set(database.memories.flatMap((memory) => memory.evidenceIds));
    return database.events.filter((event) => !referenced.has(event.id)).length;
  }

  async clear(): Promise<void> {
    await this.mutations.run(async () => this.write(emptyDatabase()));
  }

  private async read(): Promise<MemoryDatabase> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<MemoryDatabase>;
      return {
        version: 1,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        memories: Array.isArray(parsed.memories) ? parsed.memories : [],
        lastOrganizedAt: typeof parsed.lastOrganizedAt === "string" ? parsed.lastOrganizedAt : undefined
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDatabase();
      throw error;
    }
  }

  private async write(database: MemoryDatabase): Promise<void> {
    await writeJsonAtomic(this.filePath, database);
  }
}

function emptyDatabase(): MemoryDatabase {
  return { version: 1, events: [], memories: [] };
}

function organize(database: MemoryDatabase, event: MemoryEvent): void {
  if (event.type === "generation_failed" && event.content) {
    const failedContent = normalizeForMatch(`最近实际使用的提示词：${event.content}`);
    const failed = database.memories.find((memory) => (
      memory.normalizedContent === failedContent
      && memory.scope === (event.boardId ? "board" : event.sceneId ? "scene" : "global")
      && memory.scopeId === (event.boardId ?? event.sceneId)
    ));
    if (failed) {
      failed.negativeSignals += 1;
      failed.evidenceIds.push(event.id);
    }
    return;
  }
  const descriptor = memoryDescriptor(event);
  if (!descriptor) return;
  const scopeId = descriptor.scope === "board" ? event.boardId
    : descriptor.scope === "scene" ? event.sceneId
      : descriptor.scope === "asset" ? event.assetPath
        : undefined;
  const normalizedContent = normalizeForMatch(descriptor.content);
  const rejected = database.memories.find((memory) => (
    memory.kind === descriptor.kind
    && memory.scope === descriptor.scope
    && memory.scopeId === scopeId
    && memory.normalizedContent === normalizedContent
    && memory.status === "rejected"
  ));
  if (rejected) {
    if (!rejected.evidenceIds.includes(event.id)) rejected.evidenceIds.push(event.id);
    return;
  }
  const existing = database.memories.find((memory) => (
    memory.kind === descriptor.kind
    && memory.scope === descriptor.scope
    && memory.scopeId === scopeId
    && memory.normalizedContent === normalizedContent
    && memory.status !== "rejected"
  ));
  if (existing) {
    existing.lastReinforcedAt = event.occurredAt;
    existing.expiresAt = new Date(Date.parse(event.occurredAt) + descriptor.ttlDays * DAY_MS).toISOString();
    const positive = event.type === "prompt_submitted" || event.type === "generation_succeeded";
    existing.positiveSignals += positive ? 1 : 0;
    existing.confidence = Math.min(0.95, existing.confidence + (positive ? 0.08 : 0.03));
    if (!existing.evidenceIds.includes(event.id)) existing.evidenceIds.push(event.id);
    if (event.type === "prompt_submitted") existing.status = "active";
    return;
  }
  database.memories.push({
    id: crypto.randomUUID(),
    kind: descriptor.kind,
    scope: descriptor.scope,
    ...(scopeId ? { scopeId } : {}),
    content: descriptor.content,
    normalizedContent,
    confidence: descriptor.confidence,
    salience: descriptor.salience,
    positiveSignals: event.type === "prompt_submitted" || event.type === "generation_succeeded" ? 1 : 0,
    negativeSignals: 0,
    evidenceIds: [event.id],
    createdAt: event.occurredAt,
    lastReinforcedAt: event.occurredAt,
    expiresAt: new Date(Date.parse(event.occurredAt) + descriptor.ttlDays * DAY_MS).toISOString(),
    status: descriptor.status
  });
}

function statsFromDatabase(database: MemoryDatabase, now: number): AssistantMemoryStats {
  return {
    eventCount: database.events.length,
    activeMemoryCount: database.memories.filter((memory) => (
      memory.status === "active" && Date.parse(memory.expiresAt) > now
    )).length,
    candidateMemoryCount: database.memories.filter((memory) => memory.status === "candidate").length,
    lastOrganizedAt: database.lastOrganizedAt
  };
}

function evidenceSummary(event: MemoryEvent): string {
  const content = event.content?.replace(/\s+/g, " ").trim();
  const preview = content && content.length > 180 ? `${content.slice(0, 180)}…` : content;
  if (event.type === "prompt_draft") return preview ? `输入停顿后保存的提示词草稿：${preview}` : "输入停顿后保存的提示词草稿";
  if (event.type === "prompt_submitted") return preview ? `实际提交用于生成：${preview}` : "实际提交用于生成";
  if (event.type === "assistant_generated") return preview ? `AI 助手生成的候选内容：${preview}` : "AI 助手生成的候选内容";
  if (event.type === "assistant_conversation") return preview ? `与 AI 助手的对话：${preview}` : "与 AI 助手的对话";
  if (event.type === "comment_added") return preview ? `添加作品评论：${preview}` : "添加作品评论";
  if (event.type === "generation_succeeded") {
    return preview ? `图片生成成功，使用的提示词：${preview}` : "对应图片生成成功，强化了这条记忆";
  }
  return preview ? `图片生成失败，使用的提示词：${preview}` : "对应图片生成失败，降低了这条记忆的优先级";
}

function generationReason(memory: StoredMemory, evidence: AssistantMemoryEvidence[]): string {
  const types = new Set(evidence.map((item) => item.type));
  if (types.has("comment_added")) return "根据你对作品的评论提炼；评论会作为创作取舍的反馈证据。";
  if (types.has("prompt_submitted")) {
    return types.has("generation_succeeded")
      ? "根据你实际提交的提示词提炼，并因图片成功产出而得到强化。"
      : "根据你实际提交用于图片生成的提示词提炼。";
  }
  if (types.has("prompt_draft")) return "根据输入停顿 5 秒后的最新草稿检查点生成，默认只短期保留。";
  if (types.has("assistant_generated")) return "根据 AI 助手生成的候选内容创建；实际使用前保持候选状态。";
  if (types.has("assistant_conversation")) return "根据你与 AI 助手的近期对话提炼，用于延续创作意图和上下文。";
  if (types.has("generation_succeeded")) return "根据成功生成图片所使用的历史提示词提炼，并由实际产出结果支持。";
  if (types.has("generation_failed")) return "根据历史生成尝试提炼；失败结果会降低这条经验的可信度。";
  return memory.kind === "procedural" ? "根据多次创作操作归纳生成。" : "根据近期创作事件整理生成。";
}

function resolveExtractedScope(
  requested: AssistantMemoryScope,
  evidence: MemoryEvent[]
): { scope: AssistantMemoryScope; scopeId?: string } {
  if (requested === "global") return { scope: "global" };
  const values = new Set(evidence.flatMap((event) => {
    const value = requested === "asset" ? event.assetPath
      : requested === "board" ? event.boardId
        : event.sceneId;
    return value ? [value] : [];
  }));
  if (values.size !== 1) return { scope: "global" };
  return { scope: requested, scopeId: values.values().next().value };
}

function evidenceSignature(sourceIds: string[]): string {
  return Array.from(new Set(sourceIds)).sort().join("\u0000");
}

function memoryDescriptor(event: MemoryEvent): {
  kind: AssistantMemoryKind;
  scope: AssistantMemoryScope;
  content: string;
  confidence: number;
  salience: number;
  ttlDays: number;
  status: StoredMemory["status"];
} | null {
  const content = event.content?.trim();
  if (!content) return null;
  const scope: AssistantMemoryScope = event.assetPath ? "asset" : event.boardId ? "board" : event.sceneId ? "scene" : "global";
  if (event.type === "prompt_draft") {
    return { kind: "episodic", scope, content: `最近正在构思：${content}`, confidence: 0.55, salience: 0.4, ttlDays: 7, status: "active" };
  }
  if (event.type === "prompt_submitted" || event.type === "generation_succeeded") {
    return { kind: "episodic", scope, content: `最近实际使用的提示词：${content}`, confidence: 0.72, salience: 0.75, ttlDays: 90, status: "active" };
  }
  if (event.type === "assistant_generated") {
    return { kind: "episodic", scope, content: `助手最近生成的候选内容：${content}`, confidence: 0.5, salience: 0.35, ttlDays: 30, status: "candidate" };
  }
  if (event.type === "assistant_conversation") {
    return { kind: "episodic", scope, content: `最近与助手讨论：${content}`, confidence: 0.62, salience: 0.6, ttlDays: 90, status: "active" };
  }
  if (event.type === "comment_added") {
    return { kind: "semantic", scope, content: `用户对作品的反馈：${content}`, confidence: 0.78, salience: 0.85, ttlDays: 180, status: "active" };
  }
  return null;
}

function prune(database: MemoryDatabase, now: number): void {
  const draftExpiry = now - 7 * DAY_MS;
  const generalExpiry = now - 365 * DAY_MS;
  database.events = database.events.filter((event) => (
    Date.parse(event.occurredAt) >= (event.type === "prompt_draft" ? draftExpiry : generalExpiry)
  ));
  if (database.events.length > MAX_EVENT_COUNT) {
    database.events = database.events.slice(-MAX_EVENT_COUNT);
  }
  const evidenceIds = new Set(database.events.map((event) => event.id));
  database.memories = database.memories.flatMap((memory) => {
    const validEvidence = memory.evidenceIds.filter((id) => evidenceIds.has(id));
    if (memory.status === "rejected") {
      const rejectedRetention = now - Date.parse(memory.lastReinforcedAt);
      return rejectedRetention <= 365 * DAY_MS
        ? [{ ...memory, evidenceIds: validEvidence, status: "rejected" as const }]
        : [];
    }
    if (validEvidence.length === 0) return [];
    if (Date.parse(memory.expiresAt) <= now) {
      if (now - Date.parse(memory.expiresAt) > 30 * DAY_MS) return [];
      return [{ ...memory, evidenceIds: validEvidence, status: "expired" as const }];
    }
    return [{ ...memory, evidenceIds: validEvidence }];
  });
}

function scoreScope(memory: StoredMemory, query: AssistantMemoryQuery | undefined, level: MemoryUsageLevel): number {
  if (memory.scope === "asset") {
    if (query?.assetPath === memory.scopeId) return 1;
    return level === "active" ? 0.1 : -1;
  }
  if (memory.scope === "board") {
    if (query?.boardId === memory.scopeId) return 0.9;
    return level === "active" ? 0.15 : -1;
  }
  if (memory.scope === "scene") {
    if (query?.sceneId === memory.scopeId) return 0.85;
    return level === "active" ? 0.2 : -1;
  }
  return level === "cautious" ? -1 : 0.45;
}

function requiresContent(type: MemoryEventType): boolean {
  return type === "prompt_draft"
    || type === "prompt_submitted"
    || type === "assistant_generated"
    || type === "assistant_conversation"
    || type === "comment_added"
    || type === "generation_succeeded"
    || type === "generation_failed";
}

function isImportedEventDuplicate(events: MemoryEvent[], input: MemoryEventInput, content: string): boolean {
  return events.some((event) => {
    if (event.type !== input.type) return false;
    if (input.sourceId && event.sourceId === input.sourceId) return true;
    if (input.jobId && event.jobId === input.jobId) return true;
    return event.surface === input.surface
      && event.boardId === input.boardId
      && event.sceneId === input.sceneId
      && event.assetPath === input.assetPath
      && normalizeContent(event.content ?? "") === content
      && event.occurredAt === normalizeDate(input.occurredAt);
  });
}

function normalizeContent(value: string): string {
  return value.split("\u0000").join("").replace(/[ \t]+/g, " ").trim().slice(0, MAX_CONTENT_LENGTH);
}

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function termsFor(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const terms = new Set(normalized.split(/\s+/).filter((term) => term.length > 1));
  const compact = normalized.replace(/\s+/g, "");
  for (let index = 0; index < compact.length - 1 && index < 160; index += 1) {
    terms.add(compact.slice(index, index + 2));
  }
  return terms;
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function estimateTokens(value: string): number {
  let tokens = 0;
  let latinRun = 0;
  const flushLatin = (): void => {
    tokens += Math.ceil(latinRun / 4);
    latinRun = 0;
  };
  for (const character of value) {
    if (/\p{Script=Han}/u.test(character)) {
      flushLatin();
      tokens += 1;
    } else {
      latinRun += 1;
    }
  }
  flushLatin();
  return tokens;
}

function clipToTokenBudget(value: string, budget: number): string {
  if (budget <= 0) return "";
  if (estimateTokens(value) <= budget) return value;
  let clipped = "";
  let used = 0;
  for (const character of value) {
    const cost = /\p{Script=Han}/u.test(character) ? 1 : 0.25;
    if (Math.ceil(used + cost + 1) > budget) break;
    clipped += character;
    used += cost;
  }
  return clipped.trim() ? `${clipped.trimEnd()}…` : "";
}
