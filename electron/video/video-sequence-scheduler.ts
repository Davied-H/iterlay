import path from "node:path";
import type { AssetStore } from "../storage/asset-store.js";
import { mimeFromExtension } from "../storage/asset-store.js";
import type { VideoSequenceStore } from "../storage/video-sequence-store.js";
import type { VideoGenerationService } from "../video-generation-service.js";
import type { VideoProviderConfig, VideoRemoteTask } from "../providers/video-types.js";
import type { FfmpegService } from "../media/ffmpeg-service.js";
import type { VideoSequenceSegmentVersion, VideoSequenceTask } from "../video-sequence-types.js";

interface SchedulerDependencies {
  store: VideoSequenceStore;
  assets: Pick<AssetStore, "readManagedBytes" | "saveVideoOutput">;
  videoService: VideoGenerationService;
  ffmpeg: FfmpegService;
  resolveProvider: (task: VideoSequenceTask) => { config: VideoProviderConfig; providerName: string };
  onChange?: (task: VideoSequenceTask) => void;
  globalConcurrency?: number;
  providerConcurrency?: number;
}

export class VideoSequenceScheduler {
  private readonly queued = new Set<string>();
  private readonly running = new Map<string, { controller: AbortController; provider: string }>();
  private pumping = false;
  private disposed = false;
  private lastSequenceId: string | undefined;
  private readonly globalConcurrency: number;
  private readonly providerConcurrency: number;

  constructor(private readonly deps: SchedulerDependencies) {
    this.globalConcurrency = Math.max(1, deps.globalConcurrency ?? 3);
    this.providerConcurrency = Math.max(1, deps.providerConcurrency ?? 2);
  }

  async recover(): Promise<void> {
    const tasks = await this.deps.store.listTasks();
    for (const task of tasks) {
      if (task.status === "submitting" && !task.remoteTaskId) {
        await this.update(task.id, { status: "remote_unknown", error: "无法确认 Provider 是否已受理；为避免重复扣费，任务不会自动重提。" });
      } else if (["pending", "queued", "generating", "downloading", "validating"].includes(task.status)) {
        this.queued.add(task.id);
      }
    }
    void this.pump();
  }

  enqueue(taskIds: string[]): void {
    for (const id of taskIds) if (!this.running.has(id)) this.queued.add(id);
    void this.pump();
  }

  async cancel(taskId: string): Promise<{ supported: boolean; cancelled: boolean; job: VideoSequenceTask | null }> {
    const task = await this.deps.store.getTask(taskId);
    if (!task) return { supported: false, cancelled: false, job: null };
    this.queued.delete(taskId);
    const run = this.running.get(taskId);
    run?.controller.abort();
    if (!task.remoteTaskId) {
      return { supported: true, cancelled: true, job: await this.update(task.id, { status: "cancelled", error: undefined }) };
    }
    const job = await this.update(task.id, {
      status: "remote_unknown",
      error: "已停止本地等待，远端任务可能仍在运行并产生费用。"
    });
    return { supported: false, cancelled: false, job };
  }

  dispose(): void {
    this.disposed = true;
    for (const run of this.running.values()) run.controller.abort();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    try {
      while (!this.disposed && this.running.size < this.globalConcurrency) {
        const task = await this.nextRunnable();
        if (!task) break;
        this.queued.delete(task.id);
        const provider = task.remoteProviderType ?? task.input.providerId ?? "default";
        const controller = new AbortController();
        this.running.set(task.id, { controller, provider });
        void this.run(task, controller).finally(() => {
          this.running.delete(task.id);
          void this.pump();
        });
      }
    } finally { this.pumping = false; }
  }

  private async nextRunnable(): Promise<VideoSequenceTask | null> {
    const tasks = (await Promise.all([...this.queued].map((id) => this.deps.store.getTask(id))))
      .filter((task): task is VideoSequenceTask => Boolean(task));
    const seenSequences = new Set<string>();
    const ordered = tasks.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const sequenceIds = [...new Set(ordered.map((task) => task.sequenceId))];
    const lastIndex = this.lastSequenceId ? sequenceIds.indexOf(this.lastSequenceId) : -1;
    const rotatedIds = lastIndex < 0 ? sequenceIds : [...sequenceIds.slice(lastIndex + 1), ...sequenceIds.slice(0, lastIndex + 1)];
    const rank = new Map(rotatedIds.map((id, index) => [id, index]));
    ordered.sort((a, b) => (rank.get(a.sequenceId) ?? 0) - (rank.get(b.sequenceId) ?? 0) || a.segmentId.localeCompare(b.segmentId));
    for (const task of ordered) {
      if (seenSequences.has(task.sequenceId) || await this.deps.store.isPaused(task.sequenceId)) continue;
      seenSequences.add(task.sequenceId);
      const provider = task.remoteProviderType ?? task.input.providerId ?? "default";
      const count = [...this.running.values()].filter((run) => run.provider === provider).length;
      if (count < this.providerConcurrency) {
        this.lastSequenceId = task.sequenceId;
        return task;
      }
    }
    return null;
  }

  private async run(initial: VideoSequenceTask, controller: AbortController): Promise<void> {
    let task = initial;
    try {
      const resolved = this.deps.resolveProvider(task);
      let remote: VideoRemoteTask;
      if (task.remoteTaskId) {
        remote = remoteFromTask(task, resolved.config.provider);
      } else {
        const remoteProviderType = supportedRemoteProvider(resolved.config.provider);
        task = await this.update(task.id, { status: "submitting", providerName: resolved.providerName, remoteProviderType });
        const frames = await Promise.all([
          { imagePath: task.input.firstFramePath!, role: "first-frame" as const },
          { imagePath: task.input.lastFramePath!, role: "last-frame" as const }
        ].map(async (frame, index) => ({
          id: `frame-${index + 1}`, kind: "image" as const, role: frame.role,
          mimeType: mimeFromExtension(frame.imagePath), name: path.basename(frame.imagePath),
          bytes: await this.deps.assets.readManagedBytes(frame.imagePath)
        })));
        remote = await this.deps.videoService.submit({
          clientRequestId: task.clientRequestId, prompt: task.input.prompt, mode: "generate", model: task.input.model,
          ratio: task.input.aspectRatio, resolution: task.input.resolution,
          durationSeconds: task.input.durationSeconds, generateAudio: task.input.generateAudio,
          watermark: task.input.watermark, inputs: frames
        }, resolved.config, controller.signal);
        task = await this.update(task.id, remotePatch(remote));
      }
      if (task.processingCheckpoint !== "remote-complete" && !task.remoteOutputs) {
        task = await this.update(task.id, { status: remote.status === "queued" ? "queued" : "generating" });
        remote = await this.deps.videoService.waitForCompletion(remote, resolved.config, {
          signal: controller.signal,
          onUpdate: (snapshot) => { void this.update(task.id, { status: snapshot.status === "queued" ? "queued" : "generating", ...remotePatch(snapshot) }); }
        });
        if (remote.status !== "succeeded") throw new Error(remote.error || "视频生成失败。");
        task = await this.update(task.id, { status: "downloading", processingCheckpoint: "remote-complete", remoteOutputs: remote.outputs });
      }
      const output = task.remoteOutputs?.find((item) => item.kind === "video");
      if (!output) throw new Error("Provider 没有返回视频地址。");
      if (!task.outputVideoPath) {
        const downloaded = await this.deps.videoService.download(remoteFromTask(task, resolved.config.provider), output, resolved.config, controller.signal);
        const outputVideoPath = await this.deps.assets.saveVideoOutput(task.id, downloaded.bytes, downloaded.mimeType);
        task = await this.update(task.id, { status: "validating", processingCheckpoint: "downloaded", outputVideoPath });
      }
      const media = await this.deps.ffmpeg.probe(task.outputVideoPath!);
      task = await this.update(task.id, { status: "validating", processingCheckpoint: "validated", media });
      const snapshot = task.inputSnapshot;
      if (!snapshot) throw new Error("任务缺少提交时冻结的首尾帧快照，无法发布结果。");
      const version: VideoSequenceSegmentVersion = {
        id: crypto.randomUUID(), taskId: task.id, segmentRevision: task.segmentRevision,
        inputFingerprint: task.inputFingerprint,
        inputSnapshot: { ...structuredClone(snapshot), providerName: task.providerName },
        videoPath: task.outputVideoPath!, createdAt: new Date().toISOString(), ...media
      };
      await this.deps.store.attachSegmentVersion(task, version);
      await this.update(task.id, { status: "completed", processingCheckpoint: "published", error: undefined });
    } catch (error) {
      if (controller.signal.aborted && !task.remoteTaskId) await this.update(task.id, { status: "cancelled", error: undefined });
      else if (controller.signal.aborted) await this.update(task.id, { status: "remote_unknown", error: "已停止本地等待，远端任务可能仍在运行并产生费用。" });
      else await this.update(task.id, { status: "failed_retryable", error: error instanceof Error ? error.message : "视频任务失败。" });
    }
  }

  private async update(id: string, patch: Partial<VideoSequenceTask>): Promise<VideoSequenceTask> {
    const task = await this.deps.store.updateTask(id, patch);
    this.deps.onChange?.(task);
    return task;
  }
}

function supportedRemoteProvider(provider: VideoRemoteTask["provider"]): VideoSequenceTask["remoteProviderType"] {
  if (provider === "official" || provider === "ark" || provider === "fal" || provider === "minimax") return provider;
  throw new Error("当前视频序列任务暂不支持 OpenRouter Provider。");
}

function remotePatch(task: VideoRemoteTask): Partial<VideoSequenceTask> {
  return { remoteTaskId: task.id, remoteStatusUrl: task.statusUrl, remoteResponseUrl: task.responseUrl, remoteCancelUrl: task.cancelUrl };
}

function remoteFromTask(task: VideoSequenceTask, provider: VideoRemoteTask["provider"]): VideoRemoteTask {
  if (!task.remoteTaskId) throw new Error("任务没有可恢复的远端 ID。");
  return {
    provider, id: task.remoteTaskId, model: task.input.model,
    status: task.remoteOutputs ? "succeeded" : task.status === "queued" ? "queued" : "running",
    submittedAt: task.createdAt, updatedAt: task.updatedAt,
    statusUrl: task.remoteStatusUrl, responseUrl: task.remoteResponseUrl, cancelUrl: task.remoteCancelUrl,
    outputs: task.remoteOutputs
  };
}
