import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VideoGenerationJob } from "../../shared/types.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

export class VideoTaskStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: VideoGenerationJob[] | null = null;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "video-history.json");
  }

  async listJobs(): Promise<VideoGenerationJob[]> {
    await this.mutations.idle();
    return (await this.readJobs()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async listRecoverableJobs(): Promise<VideoGenerationJob[]> {
    return (await this.listJobs()).filter((job) => (
      ["queued", "generating", "post_processing", "recovering"].includes(job.status) && Boolean(job.remoteTaskId)
    ));
  }

  async getJob(id: string): Promise<VideoGenerationJob | null> {
    return (await this.listJobs()).find((job) => job.id === id) ?? null;
  }

  async addJob(job: VideoGenerationJob): Promise<void> {
    await this.importMany([job]);
  }

  async updateJob(job: VideoGenerationJob): Promise<void> {
    await this.addJob(job);
  }

  async importMany(incoming: VideoGenerationJob[]): Promise<void> {
    const valid = incoming.filter(isVideoGenerationJob);
    if (valid.length === 0) return;
    await this.mutations.run(async () => {
      const jobs = await this.readJobs();
      const indexes = new Map(jobs.map((job, index) => [job.id, index]));
      for (const job of valid) {
        const index = indexes.get(job.id);
        if (index === undefined) {
          indexes.set(job.id, jobs.length);
          jobs.push(structuredClone(job));
        } else {
          jobs[index] = structuredClone(job);
        }
      }
      await this.writeJobs(jobs);
    });
  }

  async removeJobsByBoard(boardId: string): Promise<void> {
    await this.mutations.run(async () => {
      const jobs = await this.readJobs();
      const remaining = jobs.filter((job) => job.input.boardId !== boardId);
      if (remaining.length !== jobs.length) await this.writeJobs(remaining);
    });
  }

  async clearJobsByBoard(boardId: string): Promise<number> {
    return this.mutations.run(async () => {
      const jobs = await this.readJobs();
      const remaining = jobs.filter((job) => job.input.boardId !== boardId);
      const removed = jobs.length - remaining.length;
      if (removed > 0) await this.writeJobs(remaining);
      return removed;
    });
  }

  private async readJobs(): Promise<VideoGenerationJob[]> {
    if (this.cache) return structuredClone(this.cache);
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      this.cache = Array.isArray(parsed)
        ? parsed.filter(isVideoGenerationJob).map(normalizeStoredVideoJob)
        : [];
      return structuredClone(this.cache);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeJobs(jobs: VideoGenerationJob[]): Promise<void> {
    await writeJsonAtomic(this.filePath, jobs);
    this.cache = structuredClone(jobs);
  }
}

function normalizeStoredVideoJob(job: VideoGenerationJob): VideoGenerationJob {
  const messages: Record<string, string> = {
    poll_failed: "官方视频上游状态查询连续失败，任务已结束并退还金豆。",
    missing_video_output: "官方视频任务未返回可用视频，任务已结束并退还金豆。",
    submit_failed: "官方视频任务提交失败，已退还金豆。",
    invalid_upstream_task: "官方视频服务未返回有效任务，已退还金豆。"
  };
  return job.error && messages[job.error] ? { ...job, error: messages[job.error] } : job;
}

function isVideoGenerationJob(value: unknown): value is VideoGenerationJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<VideoGenerationJob>;
  const input = job.input as Partial<VideoGenerationJob["input"]> | undefined;
  return typeof job.id === "string"
    && ["submitting", "queued", "generating", "post_processing", "recovering", "completed", "failed", "cancelled"].includes(job.status ?? "")
    && typeof job.createdAt === "string"
    && typeof job.model === "string"
    && Boolean(input)
    && typeof input?.prompt === "string"
    && typeof input?.model === "string"
    && typeof input?.aspectRatio === "string"
    && typeof input?.resolution === "string"
    && typeof input?.durationSeconds === "number"
    && Array.isArray(input?.referenceImagePaths);
}
