import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";
import {
  DEFAULT_SEQUENCE_DEFAULTS,
  effectiveSegmentConfig,
  type FrozenSequenceImage,
  type VideoSequence,
  type VideoSequenceDefaults,
  type VideoSequenceSegmentVersion,
  type VideoSequenceExportVersion,
  type VideoSequenceSegment,
  type VideoSequenceSegmentConfig,
  type VideoSequenceTask
} from "../video-sequence-types.js";
import type { FrozenVideoSource } from "../../shared/types.js";

interface SequenceDatabase {
  version: 1;
  sequences: VideoSequence[];
  tasks: VideoSequenceTask[];
  pausedSequenceIds: string[];
}

const EMPTY: SequenceDatabase = { version: 1, sequences: [], tasks: [], pausedSequenceIds: [] };

export class VideoSequenceStore {
  private readonly filePath: string;
  private readonly mutations = new MutationQueue();
  private cache: SequenceDatabase | null = null;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "video-sequences.json");
  }

  async listSequences(boardId?: string): Promise<VideoSequence[]> {
    await this.mutations.idle();
    const items = (await this.read()).sequences;
    return structuredClone(boardId ? items.filter((item) => item.boardId === boardId) : items);
  }

  async getSequence(boardId: string, sequenceId: string): Promise<VideoSequence | null> {
    return (await this.listSequences(boardId)).find((item) => item.id === sequenceId) ?? null;
  }

  async createSequence(input: {
    boardId: string;
    name?: string;
    sources: FrozenSequenceImage[];
    defaults?: Partial<VideoSequenceDefaults>;
    templateSourceId?: string;
    segmentConfigs?: VideoSequenceSegmentConfig[];
  }): Promise<VideoSequence> {
    if (input.sources.length < 3 || input.sources.length > 10) throw new Error("视频序列需要 3 至 10 张关键帧。");
    return this.mutations.run(async () => {
      const db = await this.read();
      const now = new Date().toISOString();
      const keyframes = input.sources.map((source, order) => ({ id: crypto.randomUUID(), order, source }));
      const sequence: VideoSequence = {
        id: crypto.randomUUID(), boardId: input.boardId, name: input.name?.trim() || "未命名视频序列",
        revision: 1, createdAt: now, updatedAt: now,
        defaults: { ...DEFAULT_SEQUENCE_DEFAULTS, ...input.defaults }, keyframes, segments: [], exportVersions: [],
        ...(input.templateSourceId ? { templateSourceId: input.templateSourceId } : {})
      };
      sequence.segments = keyframes.slice(0, -1).map((frame, order) => makeSegment(
        sequence, frame.id, keyframes[order + 1].id, order, input.segmentConfigs?.[order]
      ));
      db.sequences.push(sequence);
      await this.write(db);
      return structuredClone(sequence);
    });
  }

  async createAssemblySequence(input: {
    boardId: string;
    name?: string;
    sources: FrozenVideoSource[];
    defaults?: Partial<VideoSequenceDefaults>;
  }): Promise<VideoSequence> {
    if (input.sources.length < 2 || input.sources.length > 10) throw new Error("合并视频需要 2 至 10 个已完成视频。");
    return this.mutations.run(async () => {
      const db = await this.read();
      const now = new Date().toISOString();
      const sequence: VideoSequence = {
        kind: "video-assembly",
        id: crypto.randomUUID(), boardId: input.boardId, name: input.name?.trim() || "未命名成片序列",
        revision: 1, createdAt: now, updatedAt: now,
        defaults: { ...DEFAULT_SEQUENCE_DEFAULTS, ...input.defaults }, keyframes: [], segments: [], exportVersions: []
      };
      sequence.segments = input.sources.map((source, order) => {
        const versionId = crypto.randomUUID();
        const version: VideoSequenceSegmentVersion = {
          id: versionId,
          taskId: `source-video:${source.versionId}`,
          segmentRevision: 1,
          inputFingerprint: source.sha256,
          inputSnapshot: { kind: "source-video", sourceVideo: structuredClone(source) },
          videoPath: source.videoPath,
          posterPath: source.posterPath,
          mimeType: source.mimeType,
          width: source.width,
          height: source.height,
          fps: source.fps,
          durationMs: source.durationMs,
          createdAt: now
        };
        return {
          kind: "source-video" as const,
          sourceVideo: structuredClone(source),
          id: crypto.randomUUID(), order, fromKeyframeId: "", toKeyframeId: "",
          config: { prompt: "" }, trim: { inMs: 0 }, desiredRevision: 1, renderedRevision: 1,
          inputFingerprint: source.sha256, versions: [version], activeVersionId: versionId
        };
      });
      db.sequences.push(sequence);
      await this.write(db);
      return structuredClone(sequence);
    });
  }

  /** 画板归档导入：序列 ID 在新 boardId 范围内保持不变，入口节点可直接重开。 */
  async importMany(sequences: VideoSequence[]): Promise<VideoSequence[]> {
    if (sequences.length === 0) return [];
    return this.mutations.run(async () => {
      const db = await this.read();
      const existing = new Set(db.sequences.map((sequence) => `${sequence.boardId}:${sequence.id}`));
      const imported: VideoSequence[] = [];
      for (const sequence of sequences) {
        if (!isSequence(sequence)) throw new Error("画板包包含无效的视频序列。");
        const key = `${sequence.boardId}:${sequence.id}`;
        if (existing.has(key)) continue;
        const copy = structuredClone(sequence);
        db.sequences.push(copy);
        imported.push(copy);
        existing.add(key);
      }
      if (imported.length > 0) await this.write(db);
      return structuredClone(imported);
    });
  }

  async mutateSequence(
    boardId: string,
    sequenceId: string,
    expectedRevision: number,
    mutate: (sequence: VideoSequence) => void
  ): Promise<VideoSequence> {
    return this.mutations.run(async () => {
      const db = await this.read();
      const index = db.sequences.findIndex((item) => item.boardId === boardId && item.id === sequenceId);
      if (index < 0) throw new Error("视频序列不存在。");
      const next = structuredClone(db.sequences[index]);
      if (next.revision !== expectedRevision) throw revisionError(next);
      mutate(next);
      next.revision += 1;
      next.updatedAt = new Date().toISOString();
      db.sequences[index] = next;
      await this.write(db);
      return structuredClone(next);
    });
  }

  async deleteSequence(boardId: string, sequenceId: string, expectedRevision: number): Promise<void> {
    await this.mutations.run(async () => {
      const db = await this.read();
      const target = db.sequences.find((item) => item.boardId === boardId && item.id === sequenceId);
      if (!target) throw new Error("视频序列不存在。");
      if (target.revision !== expectedRevision) throw revisionError(target);
      db.sequences = db.sequences.filter((item) => item.id !== sequenceId);
      db.pausedSequenceIds = db.pausedSequenceIds.filter((id) => id !== sequenceId);
      await this.write(db);
    });
  }

  async createTasks(tasks: VideoSequenceTask[]): Promise<VideoSequenceTask[]> {
    return this.mutations.run(async () => {
      const db = await this.read();
      const existingRequestIds = new Set(db.tasks.map((task) => task.clientRequestId));
      const activeKeys = new Set(db.tasks.filter((task) => !isTerminal(task.status)).map(taskKey));
      const added: VideoSequenceTask[] = [];
      for (const task of tasks) {
        if (existingRequestIds.has(task.clientRequestId) || activeKeys.has(taskKey(task))) continue;
        db.tasks.push(structuredClone(task));
        existingRequestIds.add(task.clientRequestId);
        activeKeys.add(taskKey(task));
        added.push(task);
      }
      await this.write(db);
      return structuredClone(added);
    });
  }

  async listTasks(sequenceId?: string): Promise<VideoSequenceTask[]> {
    await this.mutations.idle();
    const tasks = (await this.read()).tasks;
    return structuredClone(sequenceId ? tasks.filter((task) => task.sequenceId === sequenceId) : tasks);
  }

  async getTask(id: string): Promise<VideoSequenceTask | null> {
    return (await this.listTasks()).find((task) => task.id === id) ?? null;
  }

  async updateTask(id: string, patch: Partial<VideoSequenceTask>): Promise<VideoSequenceTask> {
    return this.mutations.run(async () => {
      const db = await this.read();
      const index = db.tasks.findIndex((task) => task.id === id);
      if (index < 0) throw new Error("视频序列任务不存在。");
      const next = { ...db.tasks[index], ...structuredClone(patch), id, updatedAt: new Date().toISOString() };
      db.tasks[index] = next;
      await this.write(db);
      return structuredClone(next);
    });
  }

  async attachSegmentVersion(task: VideoSequenceTask, version: VideoSequenceSegmentVersion): Promise<{ sequence: VideoSequence; activated: boolean }> {
    return this.mutations.run(async () => {
      const db = await this.read();
      const sequenceIndex = db.sequences.findIndex((item) => item.id === task.sequenceId && item.boardId === task.boardId);
      if (sequenceIndex < 0) throw new Error("任务对应的视频序列不存在。");
      const sequence = structuredClone(db.sequences[sequenceIndex]);
      const segment = sequence.segments.find((item) => item.id === task.segmentId);
      if (!segment) throw new Error("任务对应的视频片段不存在。");
      const duplicate = segment.versions.find((item) => item.taskId === task.id);
      const activated = segment.desiredRevision === task.segmentRevision && segment.inputFingerprint === task.inputFingerprint;
      if (!duplicate) segment.versions.push({ ...version, superseded: !activated || undefined });
      if (activated) {
        segment.activeVersionId = duplicate?.id ?? version.id;
        segment.renderedRevision = task.segmentRevision;
        segment.error = undefined;
      }
      sequence.revision += 1;
      sequence.updatedAt = new Date().toISOString();
      db.sequences[sequenceIndex] = sequence;
      await this.write(db);
      return { sequence: structuredClone(sequence), activated };
    });
  }

  async attachExport(boardId: string, sequenceId: string, version: VideoSequenceExportVersion): Promise<VideoSequence> {
    return this.mutations.run(async () => {
      const db = await this.read();
      const index = db.sequences.findIndex((item) => item.boardId === boardId && item.id === sequenceId);
      if (index < 0) throw new Error("视频序列不存在。");
      const sequence = structuredClone(db.sequences[index]);
      const existingIndex = sequence.exportVersions.findIndex((item) => item.exportFingerprint === version.exportFingerprint);
      if (existingIndex < 0) sequence.exportVersions.push(version);
      else if (sequence.exportVersions[existingIndex].fileName !== version.fileName) {
        sequence.exportVersions[existingIndex] = { ...sequence.exportVersions[existingIndex], fileName: version.fileName };
      }
      sequence.activeExportVersionId = sequence.exportVersions.find((item) => item.exportFingerprint === version.exportFingerprint)!.id;
      sequence.revision += 1;
      sequence.updatedAt = new Date().toISOString();
      db.sequences[index] = sequence;
      await this.write(db);
      return structuredClone(sequence);
    });
  }

  async setPaused(sequenceId: string, paused: boolean): Promise<void> {
    await this.mutations.run(async () => {
      const db = await this.read();
      const ids = new Set(db.pausedSequenceIds);
      if (paused) ids.add(sequenceId);
      else ids.delete(sequenceId);
      db.pausedSequenceIds = [...ids];
      await this.write(db);
    });
  }

  async isPaused(sequenceId: string): Promise<boolean> {
    await this.mutations.idle();
    return (await this.read()).pausedSequenceIds.includes(sequenceId);
  }

  private async read(): Promise<SequenceDatabase> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<SequenceDatabase>;
      this.cache = {
        version: 1,
        sequences: Array.isArray(parsed.sequences) ? parsed.sequences.map(normalizeStoredSequence).filter((item): item is VideoSequence => Boolean(item)) : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(isTask) : [],
        pausedSequenceIds: Array.isArray(parsed.pausedSequenceIds) ? parsed.pausedSequenceIds.filter((id): id is string => typeof id === "string") : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`视频序列数据库无法读取：${String(error)}`);
      this.cache = structuredClone(EMPTY);
    }
    return this.cache;
  }

  private async write(db: SequenceDatabase): Promise<void> {
    await writeJsonAtomic(this.filePath, db);
    this.cache = db;
  }
}

export async function freezeSequenceImage(input: FrozenSequenceImage): Promise<FrozenSequenceImage> {
  const bytes = await readFile(input.imagePath);
  return { ...input, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function makeSegment(sequence: VideoSequence, from: string, to: string, order: number, config?: VideoSequenceSegmentConfig): VideoSequenceSegment {
  const segment: VideoSequenceSegment = {
    id: crypto.randomUUID(), order, fromKeyframeId: from, toKeyframeId: to,
    config: config ?? { prompt: "在首尾画面之间自然过渡，保持主体与场景一致。" },
    trim: { inMs: 0 }, desiredRevision: 1, inputFingerprint: "", versions: []
  };
  const first = sequence.keyframes.find((item) => item.id === from)!;
  const last = sequence.keyframes.find((item) => item.id === to)!;
  segment.inputFingerprint = createHash("sha256").update(JSON.stringify({
    first: first.source.sha256, last: last.source.sha256, config: effectiveSegmentConfig(sequence.defaults, segment.config)
  })).digest("hex");
  return segment;
}

function taskKey(task: VideoSequenceTask): string {
  return `${task.segmentId}:${task.segmentRevision}:${task.inputFingerprint}`;
}

function isTerminal(status: VideoSequenceTask["status"]): boolean {
  return ["completed", "failed_retryable", "failed_terminal", "cancelled"].includes(status);
}

function revisionError(sequence: VideoSequence): Error & { code: string; current: VideoSequence } {
  return Object.assign(new Error("视频序列已在其他窗口更新。"), { code: "REVISION_CONFLICT", current: structuredClone(sequence) });
}

function normalizeStoredSequence(value: unknown): VideoSequence | null {
  if (!isSequence(value)) return null;
  const sequence = structuredClone(value);
  sequence.kind = sequence.kind === "video-assembly" ? "video-assembly" : "keyframe-generation";
  sequence.segments = sequence.segments.map((segment) => ({
    ...segment,
    kind: segment.kind === "source-video" ? "source-video" : "keyframe-generation"
  }));
  if (sequence.kind === "video-assembly" && (sequence.keyframes.length !== 0 || sequence.segments.some((segment) => segment.kind !== "source-video" || !segment.sourceVideo))) return null;
  if (sequence.kind === "keyframe-generation" && sequence.segments.some((segment) => segment.kind === "source-video")) return null;
  return sequence;
}

function isSequence(value: unknown): value is VideoSequence {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VideoSequence>;
  return typeof item.id === "string" && typeof item.boardId === "string" && Array.isArray(item.keyframes) && Array.isArray(item.segments);
}

function isTask(value: unknown): value is VideoSequenceTask {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VideoSequenceTask>;
  return typeof item.id === "string" && typeof item.sequenceId === "string" && typeof item.segmentId === "string" && typeof item.clientRequestId === "string";
}
