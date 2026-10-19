import { access, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { OFFICIAL_PROVIDER_ID, type GenerationJob } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

interface JournalEntry { version: 1; upsert?: GenerationJob[]; remove?: string[] }
export interface HistoryPage { items: GenerationJob[]; total: number; nextCursor?: string }

/** Incremental durable writes with an occasional backwards-readable checkpoint. */
export class HistoryStore {
  private readonly filePath: string;
  private readonly journalPath: string;
  private readonly mutations = new MutationQueue();
  private cache: Map<string, GenerationJob> | null = null;
  private sorted: GenerationJob[] | null = null;
  private readonly idempotency = new Map<string, string>();
  private journalEntries = 0;
  private loading: Promise<Map<string, GenerationJob>> | null = null;
  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "history.json");
    this.journalPath = path.join(dataDir, "history-journal.jsonl");
  }

  async listJobs(boardId?: string): Promise<GenerationJob[]> {
    await this.mutations.idle();
    return structuredClone(await this.ordered(boardId));
  }
  async listSceneJobs(): Promise<GenerationJob[]> {
    await this.mutations.idle();
    return structuredClone((await this.ordered()).filter((job) => job.input?.sceneId));
  }
  async getJob(id: string): Promise<GenerationJob | null> {
    await this.mutations.idle();
    const job = (await this.readJobs()).get(id);
    return job ? structuredClone(job) : null;
  }
  async findByIdempotencyKey(key: string): Promise<GenerationJob | null> {
    await this.mutations.idle();
    const jobs = await this.readJobs();
    const id = this.idempotency.get(key);
    const job = id ? jobs.get(id) : undefined;
    return job ? structuredClone(job) : null;
  }
  async listPage(boardId?: string, cursor?: string, limit = 100): Promise<HistoryPage> {
    await this.mutations.idle();
    if (!Number.isFinite(limit)) throw new Error("历史分页数量无效。");
    const jobs = await this.ordered(boardId);
    const offset = cursor ? jobs.findIndex((job) => job.id === cursor) + 1 : 0;
    if (cursor && offset === 0) throw new Error("历史记录游标已过期，请重新加载。");
    const items = jobs.slice(offset, offset + Math.max(1, Math.min(500, Math.trunc(limit))));
    return { items: structuredClone(items), total: jobs.length, nextCursor: offset + items.length < jobs.length ? items.at(-1)?.id : undefined };
  }
  async addJob(job: GenerationJob): Promise<void> { await this.importMany([job]); }
  async updateJob(job: GenerationJob): Promise<void> { await this.addJob(job); }

  async failInterruptedJobs(completedAt = new Date().toISOString()): Promise<number> {
    return this.mutations.run(async () => {
      const changed = [...(await this.readJobs()).values()].filter((job) =>
        (job.status === "running" || job.status === "queued") && !(job.providerId === OFFICIAL_PROVIDER_ID && job.remoteJobId)
      ).map((job): GenerationJob => job.status === "queued"
        ? { ...job, status: "cancelled", completedAt, error: "应用在任务提交前重启，排队任务已取消，未发送到 Provider。" }
        : { ...job, status: "unknown", completedAt, error: "应用在任务完成前重启，远端结果与费用状态待确认。请先检查 Provider 和历史，避免重复提交。" });
      await this.commit({ version: 1, upsert: changed });
      return changed.length;
    });
  }
  async importMany(incoming: GenerationJob[]): Promise<void> {
    if (!incoming.length) return;
    await this.mutations.run(() => this.commit({ version: 1, upsert: incoming }));
  }
  async assignJobsWithoutBoard(boardId: string): Promise<void> {
    await this.mutations.run(async () => {
      const changed = [...(await this.readJobs()).values()].filter((job) => !job.boardId).map((job) => ({ ...job, boardId }));
      await this.commit({ version: 1, upsert: changed });
    });
  }
  async removeJobsByBoard(boardId: string): Promise<void> { await this.clearJobsByBoard(boardId); }
  async clearJobsByBoard(boardId: string): Promise<number> {
    return this.mutations.run(async () => {
      const remove = [...(await this.readJobs()).values()].filter((job) => job.boardId === boardId).map((job) => job.id);
      await this.commit({ version: 1, remove });
      return remove.length;
    });
  }
  async flush(): Promise<void> {
    await this.mutations.run(async () => {
      const jobs = await this.readJobs();
      if (this.journalEntries) await this.checkpoint(jobs);
    });
  }
  private async checkpoint(jobs: Map<string, GenerationJob>): Promise<void> {
    await writeJsonAtomic(this.filePath, [...jobs.values()]);
    await writeFile(this.journalPath, "", { mode: 0o600 });
    this.journalEntries = 0;
  }

  private async ordered(boardId?: string): Promise<GenerationJob[]> {
    const jobs = await this.readJobs();
    if (!this.sorted) this.sorted = [...jobs.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
    return boardId ? this.sorted.filter((job) => job.boardId === boardId) : this.sorted;
  }
  private async readJobs(): Promise<Map<string, GenerationJob>> {
    if (this.cache) return this.cache;
    if (this.loading) return this.loading;
    const loading = this.loadJobs();
    this.loading = loading;
    try { return await loading; }
    finally { if (this.loading === loading) this.loading = null; }
  }
  private async loadJobs(): Promise<Map<string, GenerationJob>> {
    const jobs = new Map<string, GenerationJob>();
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!Array.isArray(parsed)) throw new Error("历史记录快照格式无效。");
      for (const job of parsed as GenerationJob[]) {
        if (!job || typeof job.id !== "string") throw new Error("历史记录缺少任务 ID。");
        jobs.set(job.id, job);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try {
      const raw = await readFile(this.journalPath, "utf8");
      const complete = raw.slice(0, raw.lastIndexOf("\n") + 1);
      for (const line of complete.split("\n").filter(Boolean)) {
        const entry = JSON.parse(line) as JournalEntry;
        if (entry.version !== 1 || entry.upsert && !Array.isArray(entry.upsert) || entry.remove && !Array.isArray(entry.remove)) throw new Error("历史记录增量格式无效。");
        for (const job of entry.upsert ?? []) {
          if (!job || typeof job.id !== "string") throw new Error("历史记录缺少任务 ID。");
          jobs.set(job.id, job);
        }
        for (const id of entry.remove ?? []) jobs.delete(id);
        this.journalEntries++;
      }
      // A crash can leave only the final record incomplete. Preserve every complete commit.
      if (complete !== raw) {
        const handle = await open(this.journalPath, "r+");
        try { await handle.truncate(Buffer.byteLength(complete)); await handle.sync(); }
        finally { await handle.close(); }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.idempotency.clear();
    for (const job of jobs.values()) if (job.input?.idempotencyKey) this.idempotency.set(job.input.idempotencyKey, job.id);
    this.cache = jobs;
    return jobs;
  }
  private async commit(entry: JournalEntry): Promise<void> {
    const jobs = await this.readJobs();
    if (!entry.upsert?.length && !entry.remove?.length) return;
    // Initial checkpoint creates the workspace and leaves the old path readable.
    if (this.journalEntries === 0) {
      try { await access(this.filePath); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await writeJsonAtomic(this.filePath, [...jobs.values()]);
      }
    }
    const handle = await open(this.journalPath, "a", 0o600);
    try { await handle.writeFile(JSON.stringify(entry) + "\n", "utf8"); await handle.sync(); }
    catch (error) { this.cache = null; this.sorted = null; this.journalEntries = 0; throw error; }
    finally { await handle.close(); }
    for (const job of entry.upsert ?? []) {
      const oldKey = jobs.get(job.id)?.input?.idempotencyKey;
      if (oldKey && this.idempotency.get(oldKey) === job.id) this.idempotency.delete(oldKey);
      jobs.set(job.id, structuredClone(job));
      if (job.input?.idempotencyKey) this.idempotency.set(job.input.idempotencyKey, job.id);
    }
    for (const id of entry.remove ?? []) {
      const key = jobs.get(id)?.input?.idempotencyKey;
      if (key && this.idempotency.get(key) === id) this.idempotency.delete(key);
      jobs.delete(id);
    }
    this.sorted = null;
    this.journalEntries++;
    if (this.journalEntries >= 200) {
      await this.checkpoint(jobs);
    }
  }
}
