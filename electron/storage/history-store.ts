import { readFile } from "node:fs/promises";
import path from "node:path";
import { OFFICIAL_PROVIDER_ID, type GenerationJob } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

export class HistoryStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: GenerationJob[] | null = null;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, "history.json");
  }

  async listJobs(): Promise<GenerationJob[]> {
    await this.mutations.idle();
    const jobs = await this.readJobs();
    return jobs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async addJob(job: GenerationJob): Promise<void> {
    await this.importMany([job]);
  }

  async updateJob(job: GenerationJob): Promise<void> {
    await this.addJob(job);
  }

  /** 主进程退出后任务不可能继续，把上次会话遗留的非终态记录收敛为可重试的失败态。 */
  async failInterruptedJobs(completedAt = new Date().toISOString()): Promise<number> {
    return this.mutations.run(async () => {
      const jobs = await this.readJobs();
      let interrupted = 0;
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        if (job.status !== "running" && job.status !== "queued") continue;
        // 官方任务已在服务端持久化，下一次启动会轮询恢复；其他 Provider 无法查询。
        if (job.providerId === OFFICIAL_PROVIDER_ID && job.remoteJobId) continue;
        jobs[index] = {
          ...job,
          status: "failed",
          completedAt,
          error: "应用在任务完成前重启，生成已中断，请重试。"
        };
        interrupted += 1;
      }
      if (interrupted > 0) await this.writeJobs(jobs);
      return interrupted;
    });
  }

  async importMany(incoming: GenerationJob[]): Promise<void> {
    if (incoming.length === 0) return;
    await this.mutations.run(async () => {
      const jobs = await this.readJobs();
      const indexes = new Map(jobs.map((job, index) => [job.id, index]));
      for (const job of incoming) {
        const index = indexes.get(job.id);
        if (index === undefined) {
          indexes.set(job.id, jobs.length);
          jobs.push(job);
        } else {
          jobs[index] = job;
        }
      }
      await this.writeJobs(jobs);
    });
  }

  /** 首次画板迁移：把没有 boardId 的存量记录统一挂到默认画板。 */
  async assignJobsWithoutBoard(boardId: string): Promise<void> {
    await this.mutations.run(async () => {
      const jobs = await this.readJobs();
      let changed = false;
      for (const job of jobs) {
        if (!job.boardId) {
          job.boardId = boardId;
          changed = true;
        }
      }
      if (changed) await this.writeJobs(jobs);
    });
  }

  /** 删除画板时连同其历史记录一起清理。 */
  async removeJobsByBoard(boardId: string): Promise<void> {
    await this.mutations.run(async () => {
      const jobs = await this.readJobs();
      const remaining = jobs.filter((job) => job.boardId !== boardId);
      if (remaining.length !== jobs.length) await this.writeJobs(remaining);
    });
  }

  /** 只清空指定画板的生成记录，不删除画布节点或图片文件。 */
  async clearJobsByBoard(boardId: string): Promise<number> {
    return this.mutations.run(async () => {
      const jobs = await this.readJobs();
      const remaining = jobs.filter((job) => job.boardId !== boardId);
      const removed = jobs.length - remaining.length;
      if (removed > 0) await this.writeJobs(remaining);
      return removed;
    });
  }

  private async readJobs(): Promise<GenerationJob[]> {
    if (this.cache) return structuredClone(this.cache);
    try {
      const raw = await readFile(this.filePath, "utf8");
      const jobs = JSON.parse(raw) as GenerationJob[];
      this.cache = Array.isArray(jobs) ? jobs : [];
      return structuredClone(this.cache);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeJobs(jobs: GenerationJob[]): Promise<void> {
    await writeJsonAtomic(this.filePath, jobs);
    this.cache = structuredClone(jobs);
  }
}
