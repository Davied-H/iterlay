import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { isBoardImageNode, isBoardVideoNode, type FrozenVideoSource, type VideoProviderConfig } from "../../shared/types.js";
import { buildExportFingerprint, VIDEO_SEQUENCE_EVENT_CHANNEL } from "../../shared/video-sequence.js";
import type { BoardStore } from "../storage/board-store.js";
import type { AssetStore } from "../storage/asset-store.js";
import type { SettingsStore } from "../storage/settings-store.js";
import type { VideoSequenceStore } from "../storage/video-sequence-store.js";
import { freezeSequenceImage } from "../storage/video-sequence-store.js";
import type { VideoSequenceTemplateStore } from "../storage/video-sequence-template-store.js";
import type { FfmpegService } from "../media/ffmpeg-service.js";
import { paidVideoPricingKey, type PaidMediaQuoteMetadata, type PaidMediaQuoteService } from "../paid-media-quote.js";
import type { VideoSequenceScheduler } from "./video-sequence-scheduler.js";
import {
  effectiveSegmentConfig,
  type FrozenSequenceImage,
  type VideoSequence,
  type VideoSequenceExportJob,
  type VideoSequenceExportVersion,
  type VideoSequenceSegment,
  type VideoSequenceTask,
  type VideoSequenceTemplate
} from "../video-sequence-types.js";

interface Dependencies {
  store: VideoSequenceStore;
  templates: VideoSequenceTemplateStore;
  scheduler: VideoSequenceScheduler;
  ffmpeg: FfmpegService;
  boards: Pick<BoardStore, "getBoard" | "saveBoard">;
  assets: Pick<AssetStore, "readManagedBytes" | "toAssetUrl" | "exportAsset">;
  settings: Pick<SettingsStore, "getSettings">;
  paidMediaQuotes: PaidMediaQuoteService;
}

const CHANNELS = [
  "videoSequence:create", "videoSequence:createFromVideos", "videoSequence:get", "videoSequence:list", "videoSequence:rename", "videoSequence:delete",
  "videoSequence:replaceKeyframe", "videoSequence:reorderKeyframes", "videoSequence:reorderSegments", "videoSequence:removeKeyframe",
  "videoSequence:updateDefaults", "videoSequence:updateSegment", "videoSequence:selectSegmentVersion",
  "videoSequence:run", "videoSequence:retry", "videoSequence:pause", "videoSequence:resume", "videoSequence:cancelTask",
  "videoSequence:export", "videoSequence:getExport", "videoSequence:saveExport",
  "videoSequenceTemplate:list", "videoSequenceTemplate:create", "videoSequenceTemplate:update", "videoSequenceTemplate:delete",
  "videoSequenceTemplate:instantiate", "videoSequenceTemplate:export", "videoSequenceTemplate:import", "videoSequenceTemplate:importData"
] as const;

export function registerVideoSequenceIpc(deps: Dependencies): { dispose: () => void; exportJobs: Map<string, VideoSequenceExportJob> } {
  const exportJobs = new Map<string, VideoSequenceExportJob>();
  const emit = (event: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(VIDEO_SEQUENCE_EVENT_CHANNEL, event);
  };

  ipcMain.handle("videoSequence:create", async (_event, input: { boardId: string; name?: string; imageNodeIds: string[]; defaults?: VideoSequence["defaults"] }) => {
    const sources = await resolveImageSources(deps, input.boardId, input.imageNodeIds);
    const sequence = await deps.store.createSequence({ boardId: input.boardId, name: input.name, sources, defaults: input.defaults });
    try { await attachSequenceEntry(deps, sequence); }
    catch (error) { await deps.store.deleteSequence(sequence.boardId, sequence.id, sequence.revision); throw error; }
    emit(sequenceEvent(sequence));
    return decorateSequence(sequence, deps.assets);
  });
  ipcMain.handle("videoSequence:createFromVideos", async (_event, input: { boardId: string; name?: string; videoNodeIds: string[]; defaults?: VideoSequence["defaults"] }) => {
    const sources = await resolveVideoSources(deps, input.boardId, input.videoNodeIds);
    const sequence = await deps.store.createAssemblySequence({ boardId: input.boardId, name: input.name, sources, defaults: input.defaults });
    try { await attachSequenceEntry(deps, sequence); }
    catch (error) { await deps.store.deleteSequence(sequence.boardId, sequence.id, sequence.revision); throw error; }
    emit(sequenceEvent(sequence));
    return decorateSequence(sequence, deps.assets);
  });
  ipcMain.handle("videoSequence:get", async (_event, input: { boardId: string; sequenceId: string }) => {
    const sequence = await deps.store.getSequence(input.boardId, input.sequenceId);
    return sequence ? { ...await decorateSequence(sequence, deps.assets), sequenceTasks: await deps.store.listTasks(input.sequenceId) } : null;
  });
  ipcMain.handle("videoSequence:list", async (_event, input: { boardId: string }) => Promise.all((await deps.store.listSequences(input.boardId)).map((item) => decorateSequence(item, deps.assets))));
  ipcMain.handle("videoSequence:rename", async (_event, input: MutationInput & { name: string }) => mutate(deps, input, (sequence) => { sequence.name = input.name.trim() || sequence.name; }, emit));
  ipcMain.handle("videoSequence:delete", async (_event, input: MutationInput) => {
    await deps.store.deleteSequence(input.boardId, input.sequenceId, input.expectedRevision);
    emit({ type: "sequence-deleted", boardId: input.boardId, sequenceId: input.sequenceId });
    return { ok: true };
  });
  ipcMain.handle("videoSequence:replaceKeyframe", async (_event, input: MutationInput & { keyframeId: string; imageNodeId: string }) => {
    const [source] = await resolveImageSources(deps, input.boardId, [input.imageNodeId]);
    return mutate(deps, input, (sequence) => {
      const frame = sequence.keyframes.find((item) => item.id === input.keyframeId);
      if (!frame) throw new Error("关键帧不存在。");
      frame.source = source;
      refreshAdjacentFingerprints(sequence, input.keyframeId);
    }, emit);
  });
  ipcMain.handle("videoSequence:reorderKeyframes", async (_event, input: MutationInput & { keyframeIds: string[] }) => mutate(deps, input, (sequence) => {
    if (input.keyframeIds.length !== sequence.keyframes.length || new Set(input.keyframeIds).size !== input.keyframeIds.length) throw new Error("关键帧排序数据无效。");
    const byId = new Map(sequence.keyframes.map((item) => [item.id, item]));
    if (input.keyframeIds.some((id) => !byId.has(id))) throw new Error("关键帧排序数据无效。");
    sequence.keyframes = input.keyframeIds.map((id, order) => ({ ...byId.get(id)!, order }));
    sequence.segments = reconcileSegments(sequence);
  }, emit));
  ipcMain.handle("videoSequence:reorderSegments", async (_event, input: MutationInput & { segmentIds: string[] }) => mutate(deps, input, (sequence) => {
    if (sequence.kind !== "video-assembly") throw new Error("关键帧序列不能直接重排视频片段。");
    if (input.segmentIds.length !== sequence.segments.length || new Set(input.segmentIds).size !== input.segmentIds.length) throw new Error("视频片段排序数据无效。");
    const byId = new Map(sequence.segments.map((segment) => [segment.id, segment]));
    if (input.segmentIds.some((id) => !byId.has(id))) throw new Error("视频片段排序数据无效。");
    sequence.segments = input.segmentIds.map((id, order) => ({ ...byId.get(id)!, order }));
  }, emit));
  ipcMain.handle("videoSequence:removeKeyframe", async (_event, input: MutationInput & { keyframeId: string }) => mutate(deps, input, (sequence) => {
    if (sequence.keyframes.length <= 3) throw new Error("视频序列至少保留 3 张关键帧；如不再需要请删除整个序列。");
    sequence.keyframes = sequence.keyframes.filter((item) => item.id !== input.keyframeId).map((item, order) => ({ ...item, order }));
    sequence.segments = reconcileSegments(sequence);
  }, emit));
  ipcMain.handle("videoSequence:updateDefaults", async (_event, input: MutationInput & { patch: Partial<VideoSequence["defaults"]> }) => mutate(deps, input, (sequence) => {
    const before = sequence.defaults;
    sequence.defaults = { ...sequence.defaults, ...input.patch };
    for (const segment of sequence.segments) {
      const usesChangedDefault = Object.keys(input.patch).some((key) => key !== "fps" && segment.config[key as keyof typeof segment.config] === undefined);
      if (usesChangedDefault && JSON.stringify(before) !== JSON.stringify(sequence.defaults)) invalidateSegment(sequence, segment);
    }
  }, emit));
  ipcMain.handle("videoSequence:updateSegment", async (_event, input: MutationInput & { segmentId: string; configPatch?: Partial<VideoSequenceSegment["config"]>; trimPatch?: Partial<VideoSequenceSegment["trim"]> }) => mutate(deps, input, (sequence) => {
    const segment = sequence.segments.find((item) => item.id === input.segmentId);
    if (!segment) throw new Error("视频片段不存在。");
    if (input.configPatch && Object.keys(input.configPatch).length > 0) {
      segment.config = { ...segment.config, ...input.configPatch };
      invalidateSegment(sequence, segment);
    }
    if (input.trimPatch) segment.trim = validateTrim({ ...segment.trim, ...input.trimPatch });
  }, emit));
  ipcMain.handle("videoSequence:selectSegmentVersion", async (_event, input: MutationInput & { segmentId: string; versionId: string }) => mutate(deps, input, (sequence) => {
    const segment = sequence.segments.find((item) => item.id === input.segmentId);
    if (!segment?.versions.some((item) => item.id === input.versionId)) throw new Error("视频片段版本不存在。");
    segment.activeVersionId = input.versionId;
  }, emit));

  ipcMain.handle("videoSequence:run", async (_event, input: MutationInput & PaidMediaQuoteMetadata & { scope: "affected" | "all" | { segmentIds: string[] } }) => {
    const sequence = await requireSequence(deps.store, input.boardId, input.sequenceId);
    if (input.idempotencyKey) {
      const existing = (await deps.store.listTasks(sequence.id)).filter((task) => task.batchRequestId === input.idempotencyKey);
      if (existing.length > 0) {
        return { sequence: await decorateSequence(sequence, deps.assets), jobs: existing, estimate: estimateTasks(existing, deps.settings.getSettings().videoProviders) };
      }
    }
    if (sequence.kind === "video-assembly") throw new Error("成片合并序列不创建视频生成任务。");
    if (sequence.revision !== input.expectedRevision) throw revisionConflict(sequence);
    const selected = selectSegments(sequence, input.scope);
    const fingerprint = sequenceRunFingerprint(sequence, selected);
    await deps.ffmpeg.ensureReady();
    const settings = deps.settings.getSettings();
    const official = selected.map((segment) => effectiveSegmentConfig(sequence.defaults, segment.config))
      .filter((config) => settings.videoProviders.find((provider) => provider.id === (config.providerId ?? settings.activeVideoProviderId))?.type === "official");
    const createAndEnqueue = async (): Promise<VideoSequenceTask[]> => {
      const tasks = await createTasks(deps.store, sequence, selected, input);
      deps.scheduler.enqueue(tasks.map((task) => task.id));
      return tasks;
    };
    const tasks = official.length > 0
      ? await deps.paidMediaQuotes.consume(input, {
          clientRequestId: input.generationAttemptId ?? "",
          inputFingerprint: fingerprint,
          providerKey: official.map((config) => config.providerId ?? settings.activeVideoProviderId).sort().join(","),
          amount: input.priceSnapshot?.amount ?? Number.NaN,
          currency: "gold-bean",
          pricingKey: paidVideoPricingKey(official.map((config) => ({
            providerId: config.providerId ?? settings.activeVideoProviderId,
            model: config.model,
            durationSeconds: config.durationSeconds,
            resolution: config.resolution,
            generateAudio: config.generateAudio
          }))),
          boardId: input.boardId, requestScope: input.sequenceId, purpose: input.priceSnapshot?.stage ?? "", operation: "videoSequence:run"
        }, async () => {
          if (input.inputFingerprint !== fingerprint) throw new Error("批量视频报价与当前片段输入不匹配，请重新确认费用。");
          return createAndEnqueue();
        })
      : await createAndEnqueue();
    return { sequence: await decorateSequence(sequence, deps.assets), jobs: tasks, estimate: estimateTasks(tasks, settings.videoProviders) };
  });
  ipcMain.handle("videoSequence:retry", async (_event, input: PaidMediaQuoteMetadata & { boardId: string; sequenceId: string; segmentIds: string[] }) => {
    const sequence = await requireSequence(deps.store, input.boardId, input.sequenceId);
    const selected = sequence.segments.filter((item) => input.segmentIds.includes(item.id));
    const fingerprint = sequenceRunFingerprint(sequence, selected);
    if (input.idempotencyKey) {
      const existing = (await deps.store.listTasks(sequence.id)).filter((task) => task.batchRequestId === input.idempotencyKey);
      if (existing.length > 0) return { sequence: await decorateSequence(sequence, deps.assets), jobs: existing };
    }
    await deps.ffmpeg.ensureReady();
    const settings = deps.settings.getSettings();
    const official = selected.map((segment) => effectiveSegmentConfig(sequence.defaults, segment.config))
      .filter((config) => settings.videoProviders.find((provider) => provider.id === (config.providerId ?? settings.activeVideoProviderId))?.type === "official");
    const createAndEnqueue = async (): Promise<VideoSequenceTask[]> => {
      const tasks = await createTasks(deps.store, sequence, selected, input);
      deps.scheduler.enqueue(tasks.map((task) => task.id));
      return tasks;
    };
    const tasks = official.length > 0
      ? await deps.paidMediaQuotes.consume(input, {
          clientRequestId: input.generationAttemptId ?? "", inputFingerprint: fingerprint,
          providerKey: official.map((config) => config.providerId ?? settings.activeVideoProviderId).sort().join(","),
          amount: input.priceSnapshot?.amount ?? Number.NaN, currency: "gold-bean",
          pricingKey: paidVideoPricingKey(official.map((config) => ({
            providerId: config.providerId ?? settings.activeVideoProviderId,
            model: config.model,
            durationSeconds: config.durationSeconds,
            resolution: config.resolution,
            generateAudio: config.generateAudio
          }))),
          boardId: input.boardId, requestScope: input.sequenceId, purpose: input.priceSnapshot?.stage ?? "", operation: "videoSequence:retry"
        }, async () => {
          if (input.inputFingerprint !== fingerprint) throw new Error("批量视频报价与当前片段输入不匹配，请重新确认费用。");
          return createAndEnqueue();
        })
      : await createAndEnqueue();
    return { sequence: await decorateSequence(sequence, deps.assets), jobs: tasks };
  });
  ipcMain.handle("videoSequence:pause", async (_event, input: { boardId: string; sequenceId: string }) => {
    await requireSequence(deps.store, input.boardId, input.sequenceId);
    await deps.store.setPaused(input.sequenceId, true);
    return decorateSequence((await deps.store.getSequence(input.boardId, input.sequenceId))!, deps.assets);
  });
  ipcMain.handle("videoSequence:resume", async (_event, input: { boardId: string; sequenceId: string }) => {
    await deps.ffmpeg.ensureReady();
    await deps.store.setPaused(input.sequenceId, false);
    const tasks = (await deps.store.listTasks(input.sequenceId)).filter((task) => ["pending", "queued", "generating", "downloading", "validating"].includes(task.status));
    deps.scheduler.enqueue(tasks.map((task) => task.id));
    return { sequence: await decorateSequence(await requireSequence(deps.store, input.boardId, input.sequenceId), deps.assets), jobs: tasks };
  });
  ipcMain.handle("videoSequence:cancelTask", async (_event, input: { taskId: string }) => deps.scheduler.cancel(input.taskId));

  ipcMain.handle("videoSequence:export", async (_event, input: MutationInput & { fileName?: string; resolution?: string; fps?: number; includeAudio?: boolean }) => {
    const sequence = await requireSequence(deps.store, input.boardId, input.sequenceId);
    if (sequence.revision !== input.expectedRevision) throw revisionConflict(sequence);
    const active = sequence.segments.map((segment) => ({ segment, version: segment.versions.find((version) => version.id === segment.activeVersionId) }));
    if (active.some((item) => !item.version)) throw new Error("仍有片段没有可导出的视频版本。");
    await deps.ffmpeg.ensureReady();
    const resolution = input.resolution?.trim() || sequence.defaults.resolution;
    const fps = Number.isFinite(input.fps) ? Math.max(1, Math.round(input.fps!)) : sequence.defaults.fps;
    const includeAudio = input.includeAudio !== false;
    const dimensions = exportDimensions(resolution, sequence.defaults.aspectRatio);
    const fingerprint = buildExportFingerprint({
      segmentVersionIds: active.map(({ version }) => version!.id),
      trims: active.map(({ segment }) => segment.trim),
      width: dimensions.width, height: dimensions.height, fps, includeAudio
    });
    const cached = sequence.exportVersions.find((item) => item.exportFingerprint === fingerprint);
    if (cached) {
      const requestedFileName = safeFileName(input.fileName ?? sequence.name);
      const updated = await deps.store.attachExport(input.boardId, input.sequenceId, { ...cached, fileName: requestedFileName });
      const current = updated.exportVersions.find((item) => item.id === cached.id)!;
      await writeFile(`${current.videoPath}.manifest.json`, JSON.stringify(buildManifest(updated, current), null, 2), "utf8");
      return {
        id: cached.id, boardId: input.boardId, sequenceId: input.sequenceId,
        sequenceRevision: cached.sequenceRevision, exportFingerprint: cached.exportFingerprint,
        status: "completed", createdAt: cached.createdAt, updatedAt: cached.createdAt,
        progress: 1, outputVideoPath: cached.videoPath, exportVersionId: cached.id, fileName: requestedFileName
      } satisfies VideoSequenceExportJob;
    }
    const now = new Date().toISOString();
    const job: VideoSequenceExportJob = { id: crypto.randomUUID(), boardId: input.boardId, sequenceId: input.sequenceId, sequenceRevision: sequence.revision, exportFingerprint: fingerprint, status: "pending", createdAt: now, updatedAt: now };
    exportJobs.set(job.id, job);
    void (async () => {
      exportJobs.set(job.id, { ...job, status: "exporting", updatedAt: new Date().toISOString() });
      emit({ type: "export-changed", boardId: input.boardId, sequenceId: input.sequenceId, job: exportJobs.get(job.id) });
      try {
        const result = await deps.ffmpeg.exportSequence({
          sequence, exportFingerprint: fingerprint, resolution, fps, includeAudio,
          segments: active.map(({ segment, version }) => ({ videoPath: version!.videoPath, ...segment.trim })),
          onProgress: (progress) => {
            const current = exportJobs.get(job.id);
            if (!current || current.status !== "exporting") return;
            const next = { ...current, progress, updatedAt: new Date().toISOString() };
            exportJobs.set(job.id, next);
            emit({ type: "export-changed", boardId: input.boardId, sequenceId: input.sequenceId, job: next });
          }
        });
        const version: VideoSequenceExportVersion = {
          id: crypto.randomUUID(), sequenceRevision: sequence.revision, exportFingerprint: fingerprint,
          segmentVersionIds: active.map((item) => item.version!.id), videoPath: result.path,
          trims: active.map((item) => ({ segmentId: item.segment.id, ...item.segment.trim })),
          includeAudio, fileName: safeFileName(input.fileName ?? sequence.name),
          createdAt: new Date().toISOString(), ...result.media,
          mimeType: "video/mp4", fps: result.media.fps ?? fps
        };
        const updated = await deps.store.attachExport(input.boardId, input.sequenceId, version);
        await writeFile(`${result.path}.manifest.json`, JSON.stringify(buildManifest(updated, version), null, 2), "utf8");
        exportJobs.set(job.id, { ...job, status: "completed", updatedAt: new Date().toISOString(), progress: 1, outputVideoPath: result.path, exportVersionId: version.id, fileName: version.fileName });
        emit(sequenceEvent(updated));
      } catch (error) {
        exportJobs.set(job.id, { ...job, status: "failed", updatedAt: new Date().toISOString(), error: { code: "EXPORT_FAILED", message: error instanceof Error ? error.message : "导出失败。", retryable: true, stage: "export" } });
      }
      emit({ type: "export-changed", boardId: input.boardId, sequenceId: input.sequenceId, job: exportJobs.get(job.id) });
    })();
    return job;
  });
  ipcMain.handle("videoSequence:getExport", (_event, input: { exportJobId: string }) => exportJobs.get(input.exportJobId) ?? null);
  ipcMain.handle("videoSequence:saveExport", async (_event, input: { boardId: string; sequenceId: string; exportVersionId: string }) => {
    const sequence = await requireSequence(deps.store, input.boardId, input.sequenceId);
    const version = sequence.exportVersions.find((item) => item.id === input.exportVersionId);
    if (!version) throw new Error("导出版本不存在。");
    const result = await dialog.showSaveDialog({ defaultPath: `${safeFileName(version.fileName ?? sequence.name)}.mp4`, filters: [{ name: "MP4 视频", extensions: ["mp4"] }] });
    if (result.canceled || !result.filePath) return { ok: false };
    await deps.assets.exportAsset(version.videoPath, result.filePath);
    await copyFile(`${version.videoPath}.manifest.json`, `${result.filePath}.manifest.json`).catch(() => undefined);
    return { ok: true, path: result.filePath };
  });

  registerTemplateHandlers(deps, emit);
  return {
    exportJobs,
    dispose: () => { for (const channel of CHANNELS) ipcMain.removeHandler(channel); }
  };
}

async function attachSequenceEntry(deps: Dependencies, sequence: VideoSequence): Promise<void> {
  const board = await deps.boards.getBoard(sequence.boardId);
  if (!board) throw new Error("画板不存在。");
  if (board.nodes.some((node) => node.type === "video-sequence-entry" && node.sequenceId === sequence.id)) return;
  const right = board.nodes.reduce((value, node) => Math.max(value, node.x + (node.displayWidth ?? 300)), 0);
  await deps.boards.saveBoard({
    id: board.id,
    nodes: [...board.nodes, {
      id: crypto.randomUUID(), type: "video-sequence-entry", x: right + 80, y: board.nodes.reduce((value, node) => Math.min(value, node.y), 0),
      sequenceId: sequence.id, name: sequence.name, segmentCount: sequence.segments.length,
      durationMs: sequence.segments.reduce((sum, segment) => sum + (segment.versions.find((version) => version.id === segment.activeVersionId)?.durationMs ?? 0), 0),
      exportStatus: "none"
    }],
    connections: board.connections ?? []
  });
}

interface MutationInput { boardId: string; sequenceId: string; expectedRevision: number }

async function mutate(deps: Dependencies, input: MutationInput, mutation: (sequence: VideoSequence) => void, emit: (event: unknown) => void) {
  const sequence = await deps.store.mutateSequence(input.boardId, input.sequenceId, input.expectedRevision, mutation);
  emit(sequenceEvent(sequence));
  return decorateSequence(sequence, deps.assets);
}

async function resolveImageSources(deps: Dependencies, boardId: string, nodeIds: string[]): Promise<FrozenSequenceImage[]> {
  if (!Array.isArray(nodeIds) || nodeIds.length < 1 || new Set(nodeIds).size !== nodeIds.length) throw new Error("关键帧节点数据无效。");
  const board = await deps.boards.getBoard(boardId);
  if (!board) throw new Error("画板不存在。");
  return Promise.all(nodeIds.map(async (nodeId) => {
    const node = board.nodes.find((item) => item.id === nodeId);
    if (!node || !isBoardImageNode(node)) throw new Error("关键帧必须来自当前画板的图片节点。");
    await deps.assets.readManagedBytes(node.imagePath);
    return freezeSequenceImage({ nodeId, nodeVersionIndex: node.activeVersion, imagePath: node.imagePath, sha256: "", width: node.width, height: node.height });
  }));
}

async function resolveVideoSources(deps: Dependencies, boardId: string, nodeIds: string[]): Promise<FrozenVideoSource[]> {
  if (!Array.isArray(nodeIds) || nodeIds.length < 2 || nodeIds.length > 10 || new Set(nodeIds).size !== nodeIds.length) throw new Error("合并视频节点数据无效。");
  const board = await deps.boards.getBoard(boardId);
  if (!board) throw new Error("画板不存在。");
  return Promise.all(nodeIds.map(async (nodeId) => {
    const node = board.nodes.find((item) => item.id === nodeId);
    if (!node || !isBoardVideoNode(node)) throw new Error("只能合并当前画板的视频节点。");
    const versionIndex = Math.min(Math.max(0, node.activeVersion ?? (node.versions?.length ?? 1) - 1), Math.max(0, (node.versions?.length ?? 1) - 1));
    const version = node.versions?.[versionIndex];
    const videoPath = version?.videoPath ?? node.videoPath;
    const posterPath = version?.posterPath ?? node.posterPath;
    const width = version?.width ?? node.width;
    const height = version?.height ?? node.height;
    const durationMs = version?.durationMs ?? node.durationMs;
    if (!videoPath || !width || !height || !durationMs || (node.status && node.status !== "completed")) throw new Error("所选视频尚未完成或缺少媒体信息。");
    const bytes = await deps.assets.readManagedBytes(videoPath);
    if (posterPath) await deps.assets.readManagedBytes(posterPath);
    return {
      nodeId,
      nodeVersionIndex: versionIndex,
      versionId: version?.jobId ?? node.jobId,
      videoPath,
      ...(posterPath ? { posterPath } : {}),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mimeType: version?.mimeType ?? node.mimeType ?? "video/mp4",
      width,
      height,
      durationMs
    };
  }));
}

async function createTasks(store: VideoSequenceStore, sequence: VideoSequence, segments: VideoSequenceSegment[], metadata: PaidMediaQuoteMetadata = {}): Promise<VideoSequenceTask[]> {
  const prior = await store.listTasks(sequence.id);
  const now = new Date().toISOString();
  const tasks = segments.map((segment): VideoSequenceTask => {
    const first = sequence.keyframes.find((item) => item.id === segment.fromKeyframeId)!;
    const last = sequence.keyframes.find((item) => item.id === segment.toKeyframeId)!;
    const config = effectiveSegmentConfig(sequence.defaults, segment.config);
    const attempt = prior.filter((task) => task.segmentId === segment.id).length + 1;
    return {
      schemaVersion: 1, id: crypto.randomUUID(), clientRequestId: metadata.generationAttemptId ? `${metadata.generationAttemptId}:${segment.id}` : crypto.randomUUID(),
      batchRequestId: metadata.idempotencyKey, boardId: sequence.boardId,
      sequenceId: sequence.id, segmentId: segment.id, segmentRevision: segment.desiredRevision,
      inputFingerprint: segment.inputFingerprint, attempt, status: "pending", createdAt: now, updatedAt: now,
      input: {
        mode: "generate", prompt: config.prompt, model: config.model, aspectRatio: config.aspectRatio,
        resolution: config.resolution, durationSeconds: config.durationSeconds, referenceImagePaths: [],
        firstFramePath: first.source.imagePath, lastFramePath: last.source.imagePath,
        generateAudio: config.generateAudio, watermark: config.watermark, providerId: config.providerId,
        boardId: sequence.boardId,
        generationAttemptId: metadata.generationAttemptId, inputFingerprint: metadata.inputFingerprint,
        quoteId: metadata.quoteId, quoteExpiresAt: metadata.quoteExpiresAt,
        idempotencyKey: metadata.idempotencyKey, priceSnapshot: metadata.priceSnapshot
      },
      inputSnapshot: {
        firstFrame: structuredClone(first.source), lastFrame: structuredClone(last.source),
        config: {
          prompt: config.prompt, providerId: config.providerId ?? "", model: config.model,
          durationSeconds: config.durationSeconds, aspectRatio: config.aspectRatio,
          resolution: config.resolution, generateAudio: config.generateAudio, watermark: config.watermark
        }
      }
    };
  });
  return store.createTasks(tasks);
}

function sequenceRunFingerprint(sequence: VideoSequence, segments: VideoSequenceSegment[]): string {
  return createHash("sha256").update(JSON.stringify(segments.map((segment) => {
    const config = effectiveSegmentConfig(sequence.defaults, segment.config);
    return {
      id: segment.id,
      segmentRevision: segment.desiredRevision,
      inputFingerprint: segment.inputFingerprint,
      providerId: config.providerId,
      durationSeconds: config.durationSeconds
    };
  }))).digest("hex");
}
function selectSegments(sequence: VideoSequence, scope: "affected" | "all" | { segmentIds: string[] }): VideoSequenceSegment[] {
  if (scope === "all") return sequence.segments;
  if (scope === "affected") return sequence.segments.filter((item) => item.renderedRevision !== item.desiredRevision || !item.activeVersionId);
  return sequence.segments.filter((item) => scope.segmentIds.includes(item.id));
}

function reconcileSegments(sequence: VideoSequence): VideoSequenceSegment[] {
  const existing = new Map(sequence.segments.map((segment) => [`${segment.fromKeyframeId}:${segment.toKeyframeId}`, segment]));
  return sequence.keyframes.slice(0, -1).map((frame, order) => {
    const to = sequence.keyframes[order + 1];
    const reused = existing.get(`${frame.id}:${to.id}`);
    if (reused) return { ...reused, order };
    const segment: VideoSequenceSegment = {
      id: crypto.randomUUID(), order, fromKeyframeId: frame.id, toKeyframeId: to.id,
      config: { prompt: "在首尾画面之间自然过渡，保持主体与场景一致。" }, trim: { inMs: 0 },
      desiredRevision: 1, inputFingerprint: "", versions: []
    };
    segment.inputFingerprint = fingerprint(sequence, segment);
    return segment;
  });
}

function refreshAdjacentFingerprints(sequence: VideoSequence, keyframeId: string): void {
  for (const segment of sequence.segments.filter((item) => item.fromKeyframeId === keyframeId || item.toKeyframeId === keyframeId)) invalidateSegment(sequence, segment);
}
function invalidateSegment(sequence: VideoSequence, segment: VideoSequenceSegment): void {
  segment.desiredRevision += 1;
  segment.inputFingerprint = fingerprint(sequence, segment);
  segment.error = undefined;
}
function fingerprint(sequence: VideoSequence, segment: VideoSequenceSegment): string {
  const first = sequence.keyframes.find((item) => item.id === segment.fromKeyframeId)!;
  const last = sequence.keyframes.find((item) => item.id === segment.toKeyframeId)!;
  return createHash("sha256").update(JSON.stringify({ first: first.source.sha256, last: last.source.sha256, config: effectiveSegmentConfig(sequence.defaults, segment.config) })).digest("hex");
}
function validateTrim(trim: { inMs: number; outMs?: number; muted?: boolean }) {
  const next = { inMs: Math.max(0, Math.round(trim.inMs)), ...(trim.outMs === undefined ? {} : { outMs: Math.round(trim.outMs) }), ...(trim.muted === undefined ? {} : { muted: trim.muted }) };
  if (next.outMs !== undefined && next.outMs <= next.inMs) throw new Error("片段结束时间必须晚于开始时间。");
  return next;
}
async function decorateSequence(sequence: VideoSequence, assets: Pick<AssetStore, "toAssetUrl" | "readManagedBytes">) {
  const decorated = structuredClone(sequence);
  if (decorated.kind === "video-assembly") {
    await Promise.all(decorated.segments.map(async (segment) => {
      if (!segment.sourceVideo) return;
      try { await assets.readManagedBytes(segment.sourceVideo.videoPath); }
      catch { segment.error = { code: "MISSING_SOURCE_VIDEO", message: "源视频文件缺失，无法预览或导出。", retryable: false, stage: "validate" }; }
    }));
  }
  const keyframeEntries = decorated.keyframes.map((keyframe) => [
    keyframe.source.imagePath,
    assets.toAssetUrl(keyframe.source.imagePath)
  ] as const);
  const versionEntries = decorated.segments.flatMap((segment) => segment.versions.flatMap((version) => [
    [version.videoPath, assets.toAssetUrl(version.videoPath)] as const,
    ...(version.posterPath ? [[version.posterPath, assets.toAssetUrl(version.posterPath)] as const] : [])
  ]));
  const exportEntries = decorated.exportVersions.map((version) => [version.videoPath, assets.toAssetUrl(version.videoPath)] as const);
  return {
    ...decorated,
    mediaUrls: Object.fromEntries([...keyframeEntries, ...versionEntries, ...exportEntries])
  };
}
async function requireSequence(store: VideoSequenceStore, boardId: string, sequenceId: string): Promise<VideoSequence> {
  const sequence = await store.getSequence(boardId, sequenceId);
  if (!sequence) throw new Error("视频序列不存在。");
  return sequence;
}
function sequenceEvent(sequence: VideoSequence) { return { type: "sequence-changed", boardId: sequence.boardId, sequenceId: sequence.id, revision: sequence.revision }; }
function revisionConflict(sequence: VideoSequence) { return Object.assign(new Error("视频序列已在其他窗口更新。"), { code: "REVISION_CONFLICT", current: sequence }); }
function safeFileName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "视频序列"; }
function exportDimensions(resolution: string, ratio: string): { width: number; height: number } {
  const short = resolution === "1080p" ? 1080 : resolution === "480p" ? 480 : 720;
  const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
  if (!ratioWidth || !ratioHeight) return { width: Math.round(short * 16 / 9), height: short };
  const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);
  return ratioWidth >= ratioHeight
    ? { width: even(short * ratioWidth / ratioHeight), height: short }
    : { width: short, height: even(short * ratioHeight / ratioWidth) };
}
function estimateTasks(tasks: VideoSequenceTask[], providers: VideoProviderConfig[]) {
  void providers;
  return tasks.length ? { currency: "credit" as const, total: tasks.length, authoritative: false } : undefined;
}
function buildManifest(sequence: VideoSequence, version: VideoSequenceExportVersion) {
  return { format: "iterlay-video-sequence", formatVersion: 1, exportedAt: new Date().toISOString(), sequenceId: sequence.id, name: sequence.name, defaults: sequence.defaults, export: version, segments: sequence.segments.map((item) => ({ id: item.id, fromKeyframeId: item.fromKeyframeId, toKeyframeId: item.toKeyframeId, config: item.config, trim: item.trim, activeVersionId: item.activeVersionId })) };
}

function registerTemplateHandlers(deps: Dependencies, emit: (event: unknown) => void): void {
  ipcMain.handle("videoSequenceTemplate:list", () => deps.templates.list());
  ipcMain.handle("videoSequenceTemplate:create", async (_event, input: { sequence: VideoSequence; name: string; description: string }) => deps.templates.create({
    name: input.name, description: input.description, defaults: input.sequence.defaults,
    slots: input.sequence.keyframes.map((_, index) => ({ id: `slot-${index + 1}`, label: `关键帧 ${index + 1}`, required: true })),
    segments: input.sequence.segments.map((segment, index) => ({ id: `segment-${index + 1}`, fromSlotId: `slot-${index + 1}`, toSlotId: `slot-${index + 2}`, config: segment.config }))
  }));
  ipcMain.handle("videoSequenceTemplate:update", (_event, input: { template: VideoSequenceTemplate; expectedVersion: number }) => deps.templates.update(input.template, input.expectedVersion));
  ipcMain.handle("videoSequenceTemplate:delete", async (_event, input: { templateId: string; expectedVersion: number }) => { await deps.templates.delete(input.templateId, input.expectedVersion); return { ok: true }; });
  ipcMain.handle("videoSequenceTemplate:instantiate", async (_event, input: { boardId: string; templateId: string; imageNodeIds: string[] }) => {
    const template = (await deps.templates.list()).find((item) => item.id === input.templateId);
    if (!template || template.slots.length !== input.imageNodeIds.length) throw new Error("模板或关键帧数量无效。");
    const sources = await resolveImageSources(deps, input.boardId, input.imageNodeIds);
    const sequence = await deps.store.createSequence({ boardId: input.boardId, name: template.name, sources, defaults: template.defaults, templateSourceId: template.id, segmentConfigs: template.segments.map((item) => item.config) });
    emit(sequenceEvent(sequence));
    return decorateSequence(sequence, deps.assets);
  });
  ipcMain.handle("videoSequenceTemplate:export", async (_event, input: { templateId: string }) => {
    const template = (await deps.templates.list()).find((item) => item.id === input.templateId);
    if (!template) throw new Error("视频序列模板不存在。");
    const result = await dialog.showSaveDialog({ defaultPath: `${safeFileName(template.name)}.its.json`, filters: [{ name: "Iterlay 视频序列模板", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return { ok: false };
    await writeFile(result.filePath, JSON.stringify(template, null, 2), "utf8");
    return { ok: true, path: result.filePath };
  });
  const importBytes = async (bytes: Buffer) => deps.templates.import(JSON.parse(bytes.toString("utf8")) as VideoSequenceTemplate);
  ipcMain.handle("videoSequenceTemplate:import", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Iterlay 视频序列模板", extensions: ["json"] }] });
    return result.canceled || !result.filePaths[0] ? null : importBytes(await readFile(result.filePaths[0]));
  });
  ipcMain.handle("videoSequenceTemplate:importData", (_event, data: ArrayBuffer) => importBytes(Buffer.from(data)));
}
