import type {
  FrozenImageSource,
  VideoGenerationJobV2,
  VideoSegmentConfig,
  VideoSegmentState,
  VideoSegmentTrim,
  VideoSegmentVersion,
  VideoSequence,
  VideoSequenceDefaults,
  VideoSequenceKeyframe,
  VideoSequenceSegment,
  VideoSequenceState,
  VideoSequenceTemplate
} from "./types.js";

export const VIDEO_SEQUENCE_EVENT_CHANNEL = "videoSequence:event";

const FPS_VALUES = new Set([24, 25, 30, 50, 60]);
const TASK_PENDING = new Set(["pending", "submitting"]);
const TASK_RUNNING = new Set([
  "remote_unknown",
  "queued",
  "generating",
  "downloading",
  "validating",
  "cancel_requested"
]);
const TASK_FAILED = new Set(["failed_retryable", "failed_terminal", "cancelled"]);

export function resolveSegmentConfig(
  defaults: VideoSequenceDefaults,
  override: VideoSegmentConfig
): Required<VideoSegmentConfig> {
  return {
    prompt: override.prompt,
    providerId: override.providerId ?? defaults.providerId ?? "",
    model: override.model ?? defaults.model,
    durationSeconds: override.durationSeconds ?? defaults.durationSeconds,
    aspectRatio: override.aspectRatio ?? defaults.aspectRatio,
    resolution: override.resolution ?? defaults.resolution,
    generateAudio: override.generateAudio ?? defaults.generateAudio,
    watermark: override.watermark ?? defaults.watermark
  };
}

export function buildSegmentFingerprint(input: {
  firstFrameSha256: string;
  lastFrameSha256: string;
  config: Required<VideoSegmentConfig>;
}): string {
  return sha256(stableJson({
    version: 1,
    firstFrameSha256: input.firstFrameSha256,
    lastFrameSha256: input.lastFrameSha256,
    config: input.config
  }));
}

export function buildExportFingerprint(input: {
  segmentVersionIds: string[];
  trims: VideoSegmentTrim[];
  width: number;
  height: number;
  fps: number;
  includeAudio?: boolean;
}): string {
  return sha256(stableJson({ version: 1, ...input }));
}

export function reconcileSequenceAdjacency(input: {
  previous: VideoSequence;
  orderedKeyframes: VideoSequenceKeyframe[];
  createSegmentId: () => string;
}): VideoSequenceSegment[] {
  const previousByPair = new Map(
    input.previous.segments.map((segment) => [adjacencyKey(segment.fromKeyframeId, segment.toKeyframeId), segment])
  );

  return input.orderedKeyframes.slice(0, -1).map((firstFrame, order) => {
    const lastFrame = input.orderedKeyframes[order + 1];
    const existing = previousByPair.get(adjacencyKey(firstFrame.id, lastFrame.id));
    if (!existing) {
      const config: VideoSegmentConfig = { prompt: "" };
      return {
        id: input.createSegmentId(),
        order,
        fromKeyframeId: firstFrame.id,
        toKeyframeId: lastFrame.id,
        config,
        trim: { inMs: 0 },
        desiredRevision: 1,
        inputFingerprint: fingerprintFor(input.previous.defaults, config, firstFrame.source, lastFrame.source),
        versions: []
      };
    }

    const inputFingerprint = fingerprintFor(
      input.previous.defaults,
      existing.config,
      firstFrame.source,
      lastFrame.source
    );
    return {
      ...existing,
      order,
      inputFingerprint,
      desiredRevision: inputFingerprint === existing.inputFingerprint
        ? existing.desiredRevision
        : existing.desiredRevision + 1
    };
  });
}

export function invalidateKeyframeNeighbors(input: {
  sequence: VideoSequence;
  keyframeId: string;
  replacement: FrozenImageSource;
}): VideoSequence {
  if (!input.sequence.keyframes.some((keyframe) => keyframe.id === input.keyframeId)) return input.sequence;
  const keyframes = input.sequence.keyframes.map((keyframe) =>
    keyframe.id === input.keyframeId ? { ...keyframe, source: input.replacement } : keyframe
  );
  const keyframeById = new Map(keyframes.map((keyframe) => [keyframe.id, keyframe]));
  const segments = input.sequence.segments.map((segment) => {
    if (segment.fromKeyframeId !== input.keyframeId && segment.toKeyframeId !== input.keyframeId) return segment;
    const firstFrame = keyframeById.get(segment.fromKeyframeId)!;
    const lastFrame = keyframeById.get(segment.toKeyframeId)!;
    const inputFingerprint = fingerprintFor(input.sequence.defaults, segment.config, firstFrame.source, lastFrame.source);
    return inputFingerprint === segment.inputFingerprint
      ? segment
      : { ...segment, desiredRevision: segment.desiredRevision + 1, inputFingerprint };
  });
  return { ...input.sequence, keyframes, segments };
}

export function updateSegmentConfig(input: {
  sequence: VideoSequence;
  segmentId: string;
  patch: Partial<VideoSegmentConfig>;
}): VideoSequence {
  const keyframeById = new Map(input.sequence.keyframes.map((keyframe) => [keyframe.id, keyframe]));
  let changed = false;
  const segments = input.sequence.segments.map((segment) => {
    if (segment.id !== input.segmentId) return segment;
    const config = { ...segment.config };
    for (const [key, value] of Object.entries(input.patch) as Array<[keyof VideoSegmentConfig, VideoSegmentConfig[keyof VideoSegmentConfig]]>) {
      if (value === undefined) delete config[key];
      else Object.assign(config, { [key]: value });
    }
    const firstFrame = keyframeById.get(segment.fromKeyframeId);
    const lastFrame = keyframeById.get(segment.toKeyframeId);
    if (!firstFrame || !lastFrame) return segment;
    const inputFingerprint = fingerprintFor(input.sequence.defaults, config, firstFrame.source, lastFrame.source);
    if (inputFingerprint === segment.inputFingerprint) {
      if (stableJson(config) === stableJson(segment.config)) return segment;
      changed = true;
      return { ...segment, config };
    }
    changed = true;
    return { ...segment, config, desiredRevision: segment.desiredRevision + 1, inputFingerprint };
  });
  return changed ? { ...input.sequence, segments } : input.sequence;
}

export function updateSequenceDefaults(input: {
  sequence: VideoSequence;
  patch: Partial<VideoSequenceDefaults>;
}): VideoSequence {
  const defaults = { ...input.sequence.defaults, ...input.patch };
  if (stableJson(defaults) === stableJson(input.sequence.defaults)) return input.sequence;
  const keyframeById = new Map(input.sequence.keyframes.map((keyframe) => [keyframe.id, keyframe]));
  const changedKeys = Object.keys(input.patch).filter((key) =>
    input.sequence.defaults[key as keyof VideoSequenceDefaults] !== defaults[key as keyof VideoSequenceDefaults]
  ) as Array<keyof VideoSequenceDefaults>;
  const segments = input.sequence.segments.map((segment) => {
    const inheritsChangedValue = changedKeys.some((key) => key !== "fps" && segment.config[key as keyof VideoSegmentConfig] === undefined);
    if (!inheritsChangedValue) return segment;
    const firstFrame = keyframeById.get(segment.fromKeyframeId)!;
    const lastFrame = keyframeById.get(segment.toKeyframeId)!;
    const inputFingerprint = fingerprintFor(defaults, segment.config, firstFrame.source, lastFrame.source);
    return inputFingerprint === segment.inputFingerprint
      ? segment
      : { ...segment, desiredRevision: segment.desiredRevision + 1, inputFingerprint };
  });
  return { ...input.sequence, defaults, segments };
}

export function updateSegmentTrim(input: {
  sequence: VideoSequence;
  segmentId: string;
  patch: Partial<VideoSegmentTrim>;
}): VideoSequence {
  let changed = false;
  const segments = input.sequence.segments.map((segment) => {
    if (segment.id !== input.segmentId) return segment;
    const trim = { ...segment.trim, ...input.patch };
    if (stableJson(trim) === stableJson(segment.trim)) return segment;
    changed = true;
    return { ...segment, trim };
  });
  if (!changed) return input.sequence;
  return { ...input.sequence, segments, activeExportVersionId: undefined };
}

export function deriveSegmentState(
  segment: VideoSequenceSegment,
  task?: VideoGenerationJobV2
): VideoSegmentState {
  if (!segment.fromKeyframeId || !segment.toKeyframeId || !segment.config.prompt.trim() || !segment.inputFingerprint) {
    return "blocked";
  }
  if (task && task.segmentId === segment.id) {
    if (TASK_PENDING.has(task.taskStatus)) return "pending";
    if (TASK_RUNNING.has(task.taskStatus)) return "running";
    if (TASK_FAILED.has(task.taskStatus)) return "failed";
  }
  const active = segment.versions.find((version) => version.id === segment.activeVersionId);
  if (!active) return "ready";
  if (
    active.superseded
    || active.segmentRevision !== segment.desiredRevision
    || active.inputFingerprint !== segment.inputFingerprint
    || segment.renderedRevision !== segment.desiredRevision
  ) return "stale";
  return "completed";
}

export function deriveSequenceState(
  sequence: VideoSequence,
  jobs: VideoGenerationJobV2[]
): VideoSequenceState {
  if (sequence.segments.some((segment) => segment.error?.stage === "export")) return "export_failed";
  if (sequence.segments.length === 0) return "blocked";
  const latestTaskBySegment = latestTasks(jobs);
  const states = sequence.segments.map((segment) => deriveSegmentState(segment, latestTaskBySegment.get(segment.id)));
  if (states.includes("running") || states.includes("pending")) return "running";
  const completed = states.filter((state) => state === "completed").length;
  if (completed === states.length) return "completed";
  if (states.every((state) => state === "stale")) return "stale";
  if (completed > 0 || states.includes("stale") || states.includes("failed")) return "partial";
  if (states.includes("blocked")) return "blocked";
  return "ready";
}

export function normalizeVideoSequence(value: unknown): VideoSequence | null {
  if (!isRecord(value)) return null;
  const defaults = normalizeDefaults(value.defaults);
  if (
    !defaults
    || !isString(value.id)
    || !isString(value.boardId)
    || !isString(value.name)
    || !isNonNegativeInteger(value.revision)
    || !isString(value.createdAt)
    || !isString(value.updatedAt)
    || !Array.isArray(value.keyframes)
    || !Array.isArray(value.segments)
    || !Array.isArray(value.exportVersions)
  ) return null;

  const keyframes = value.keyframes.map(normalizeKeyframe);
  if (keyframes.some((keyframe) => !keyframe)) return null;
  const typedKeyframes = keyframes as VideoSequenceKeyframe[];
  if (typedKeyframes.length < 2 || typedKeyframes.length > 10 || !hasUniqueIds(typedKeyframes)) return null;
  if (!hasContiguousOrder(typedKeyframes)) return null;

  const segments = value.segments.map((segment) => normalizeSegment(segment));
  if (segments.some((segment) => !segment)) return null;
  const typedSegments = segments as VideoSequenceSegment[];
  if (typedSegments.length !== typedKeyframes.length - 1 || !hasUniqueIds(typedSegments) || !hasContiguousOrder(typedSegments)) return null;
  const orderedKeyframes = [...typedKeyframes].sort((left, right) => left.order - right.order);
  const orderedSegments = [...typedSegments].sort((left, right) => left.order - right.order);
  if (orderedSegments.some((segment, index) =>
    segment.fromKeyframeId !== orderedKeyframes[index].id
    || segment.toKeyframeId !== orderedKeyframes[index + 1].id
    || segment.inputFingerprint !== fingerprintFor(
      defaults,
      segment.config,
      orderedKeyframes[index].source,
      orderedKeyframes[index + 1].source
    )
  )) return null;

  const exportVersions = value.exportVersions.map(normalizeExportVersion);
  if (exportVersions.some((version) => !version)) return null;
  const typedExports = exportVersions as VideoSequence["exportVersions"];
  if (!hasUniqueIds(typedExports)) return null;
  if (value.activeExportVersionId !== undefined && (
    !isString(value.activeExportVersionId)
    || !typedExports.some((version) => version.id === value.activeExportVersionId)
  )) return null;

  return {
    id: value.id,
    boardId: value.boardId,
    name: value.name,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    defaults,
    keyframes: orderedKeyframes,
    segments: orderedSegments,
    exportVersions: typedExports,
    ...(isString(value.activeExportVersionId) ? { activeExportVersionId: value.activeExportVersionId } : {}),
    ...(isString(value.templateSourceId) ? { templateSourceId: value.templateSourceId } : {})
  };
}

export function normalizeVideoSequenceTemplate(value: unknown): VideoSequenceTemplate | null {
  if (!isRecord(value)) return null;
  const defaults = normalizeDefaults(value.defaults);
  if (
    value.schemaVersion !== 1
    || !defaults
    || !isString(value.id)
    || !isString(value.name)
    || !isString(value.description)
    || !isPositiveInteger(value.version)
    || !isString(value.createdAt)
    || !isString(value.updatedAt)
    || !Array.isArray(value.slots)
    || !Array.isArray(value.segments)
  ) return null;
  const slots = value.slots.map((slot) => isRecord(slot) && isString(slot.id) && isString(slot.label) && typeof slot.required === "boolean"
    ? { id: slot.id, label: slot.label, required: slot.required }
    : null);
  if (slots.length < 2 || slots.length > 10 || slots.some((slot) => !slot) || !hasUniqueIds(slots as Array<{ id: string }>)) return null;
  const slotIds = new Set((slots as Array<{ id: string }>).map((slot) => slot.id));
  const segments = value.segments.map((segment) => {
    if (!isRecord(segment) || !isString(segment.id) || !isString(segment.fromSlotId) || !isString(segment.toSlotId)) return null;
    const config = normalizeSegmentConfig(segment.config);
    return config ? { id: segment.id, fromSlotId: segment.fromSlotId, toSlotId: segment.toSlotId, config } : null;
  });
  if (segments.length !== slots.length - 1 || segments.some((segment) => !segment) || !hasUniqueIds(segments as Array<{ id: string }>)) return null;
  if ((segments as VideoSequenceTemplate["segments"]).some((segment, index) =>
    !slotIds.has(segment.fromSlotId)
    || !slotIds.has(segment.toSlotId)
    || segment.fromSlotId !== slots[index]!.id
    || segment.toSlotId !== slots[index + 1]!.id
  )) return null;
  return {
    schemaVersion: 1,
    id: value.id,
    name: value.name,
    description: value.description,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    defaults,
    slots: slots as VideoSequenceTemplate["slots"],
    segments: segments as VideoSequenceTemplate["segments"]
  };
}

function fingerprintFor(
  defaults: VideoSequenceDefaults,
  config: VideoSegmentConfig,
  firstFrame: FrozenImageSource,
  lastFrame: FrozenImageSource
): string {
  return buildSegmentFingerprint({
    firstFrameSha256: firstFrame.sha256,
    lastFrameSha256: lastFrame.sha256,
    config: resolveSegmentConfig(defaults, config)
  });
}

function latestTasks(jobs: VideoGenerationJobV2[]): Map<string, VideoGenerationJobV2> {
  const bySegment = new Map<string, VideoGenerationJobV2>();
  for (const job of jobs) {
    if (!job.segmentId) continue;
    const current = bySegment.get(job.segmentId);
    if (!current || current.updatedAt.localeCompare(job.updatedAt) <= 0) bySegment.set(job.segmentId, job);
  }
  return bySegment;
}

function normalizeDefaults(value: unknown): VideoSequenceDefaults | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.model)
    || !isString(value.aspectRatio)
    || !isString(value.resolution)
    || !FPS_VALUES.has(value.fps as number)
    || !isPositiveNumber(value.durationSeconds)
    || typeof value.generateAudio !== "boolean"
    || typeof value.watermark !== "boolean"
    || (value.providerId !== undefined && !isString(value.providerId))
  ) return null;
  return {
    ...(isString(value.providerId) ? { providerId: value.providerId } : {}),
    model: value.model,
    aspectRatio: value.aspectRatio,
    resolution: value.resolution,
    fps: value.fps as VideoSequenceDefaults["fps"],
    durationSeconds: value.durationSeconds,
    generateAudio: value.generateAudio,
    watermark: value.watermark
  };
}

function normalizeFrozenSource(value: unknown): FrozenImageSource | null {
  if (!isRecord(value) || !isString(value.imagePath) || !isString(value.sha256)) return null;
  if (value.nodeId !== undefined && !isString(value.nodeId)) return null;
  if (value.nodeVersionIndex !== undefined && !isNonNegativeInteger(value.nodeVersionIndex)) return null;
  if (value.width !== undefined && !isPositiveNumber(value.width)) return null;
  if (value.height !== undefined && !isPositiveNumber(value.height)) return null;
  return {
    ...(isString(value.nodeId) ? { nodeId: value.nodeId } : {}),
    ...(isNonNegativeInteger(value.nodeVersionIndex) ? { nodeVersionIndex: value.nodeVersionIndex } : {}),
    imagePath: value.imagePath,
    sha256: value.sha256,
    ...(isPositiveNumber(value.width) ? { width: value.width } : {}),
    ...(isPositiveNumber(value.height) ? { height: value.height } : {})
  };
}

function normalizeKeyframe(value: unknown): VideoSequenceKeyframe | null {
  if (!isRecord(value) || !isString(value.id) || !isNonNegativeInteger(value.order)) return null;
  const source = normalizeFrozenSource(value.source);
  if (!source || (value.label !== undefined && !isString(value.label))) return null;
  return { id: value.id, order: value.order, ...(isString(value.label) ? { label: value.label } : {}), source };
}

function normalizeSegmentConfig(value: unknown): VideoSegmentConfig | null {
  if (!isRecord(value) || !isString(value.prompt)) return null;
  const stringKeys = ["providerId", "model", "aspectRatio", "resolution"] as const;
  if (stringKeys.some((key) => value[key] !== undefined && !isString(value[key]))) return null;
  if (value.durationSeconds !== undefined && !isPositiveNumber(value.durationSeconds)) return null;
  if (value.generateAudio !== undefined && typeof value.generateAudio !== "boolean") return null;
  if (value.watermark !== undefined && typeof value.watermark !== "boolean") return null;
  return {
    prompt: value.prompt,
    ...(isString(value.providerId) ? { providerId: value.providerId } : {}),
    ...(isString(value.model) ? { model: value.model } : {}),
    ...(isPositiveNumber(value.durationSeconds) ? { durationSeconds: value.durationSeconds } : {}),
    ...(isString(value.aspectRatio) ? { aspectRatio: value.aspectRatio } : {}),
    ...(isString(value.resolution) ? { resolution: value.resolution } : {}),
    ...(typeof value.generateAudio === "boolean" ? { generateAudio: value.generateAudio } : {}),
    ...(typeof value.watermark === "boolean" ? { watermark: value.watermark } : {})
  };
}

function normalizeTrim(value: unknown): VideoSegmentTrim | null {
  if (!isRecord(value) || !isNonNegativeNumber(value.inMs)) return null;
  if (value.outMs !== undefined && (!isPositiveNumber(value.outMs) || value.outMs <= value.inMs)) return null;
  return { inMs: value.inMs, ...(isPositiveNumber(value.outMs) ? { outMs: value.outMs } : {}) };
}

function normalizeSegment(value: unknown): VideoSequenceSegment | null {
  if (!isRecord(value)) return null;
  const config = normalizeSegmentConfig(value.config);
  const trim = normalizeTrim(value.trim);
  if (
    !config || !trim
    || !isString(value.id)
    || !isNonNegativeInteger(value.order)
    || !isString(value.fromKeyframeId)
    || !isString(value.toKeyframeId)
    || !isPositiveInteger(value.desiredRevision)
    || (value.renderedRevision !== undefined && !isPositiveInteger(value.renderedRevision))
    || !isString(value.inputFingerprint)
    || !Array.isArray(value.versions)
  ) return null;
  const versions = value.versions.map(normalizeSegmentVersion);
  if (versions.some((version) => !version) || !hasUniqueIds(versions as VideoSegmentVersion[])) return null;
  if (value.activeVersionId !== undefined && (
    !isString(value.activeVersionId)
    || !(versions as VideoSegmentVersion[]).some((version) => version.id === value.activeVersionId)
  )) return null;
  return {
    id: value.id,
    order: value.order,
    fromKeyframeId: value.fromKeyframeId,
    toKeyframeId: value.toKeyframeId,
    config,
    trim,
    desiredRevision: value.desiredRevision,
    ...(isPositiveInteger(value.renderedRevision) ? { renderedRevision: value.renderedRevision } : {}),
    inputFingerprint: value.inputFingerprint,
    versions: versions as VideoSegmentVersion[],
    ...(isString(value.activeVersionId) ? { activeVersionId: value.activeVersionId } : {}),
    ...(isString(value.lastTaskId) ? { lastTaskId: value.lastTaskId } : {}),
    ...(normalizeTaskError(value.error) ? { error: normalizeTaskError(value.error)! } : {})
  };
}

function normalizeSegmentVersion(value: unknown): VideoSegmentVersion | null {
  if (!isRecord(value) || !isRecord(value.inputSnapshot)) return null;
  const firstFrame = normalizeFrozenSource(value.inputSnapshot.firstFrame);
  const lastFrame = normalizeFrozenSource(value.inputSnapshot.lastFrame);
  const config = normalizeRequiredConfig(value.inputSnapshot.config);
  if (
    !firstFrame || !lastFrame || !config
    || !isString(value.id) || !isString(value.taskId)
    || !isPositiveInteger(value.segmentRevision) || !isString(value.inputFingerprint)
    || !isString(value.videoPath) || !isString(value.mimeType)
    || !isPositiveNumber(value.width) || !isPositiveNumber(value.height)
    || !isPositiveNumber(value.durationMs) || !isString(value.createdAt)
  ) return null;
  return {
    id: value.id,
    taskId: value.taskId,
    segmentRevision: value.segmentRevision,
    inputFingerprint: value.inputFingerprint,
    inputSnapshot: {
      firstFrame,
      lastFrame,
      config,
      ...(isString(value.inputSnapshot.providerName) ? { providerName: value.inputSnapshot.providerName } : {})
    },
    videoPath: value.videoPath,
    ...(isString(value.posterPath) ? { posterPath: value.posterPath } : {}),
    mimeType: value.mimeType,
    ...(isString(value.videoCodec) ? { videoCodec: value.videoCodec } : {}),
    ...(isString(value.audioCodec) ? { audioCodec: value.audioCodec } : {}),
    width: value.width,
    height: value.height,
    ...(isPositiveNumber(value.fps) ? { fps: value.fps } : {}),
    durationMs: value.durationMs,
    createdAt: value.createdAt,
    ...(typeof value.superseded === "boolean" ? { superseded: value.superseded } : {})
  };
}

function normalizeRequiredConfig(value: unknown): Required<VideoSegmentConfig> | null {
  const config = normalizeSegmentConfig(value);
  if (!config || !isRecord(value)) return null;
  if (!isString(value.providerId) || !isString(value.model) || !isPositiveNumber(value.durationSeconds)
    || !isString(value.aspectRatio) || !isString(value.resolution)
    || typeof value.generateAudio !== "boolean" || typeof value.watermark !== "boolean") return null;
  return config as Required<VideoSegmentConfig>;
}

function normalizeExportVersion(value: unknown): VideoSequence["exportVersions"][number] | null {
  if (!isRecord(value) || !Array.isArray(value.segmentVersionIds) || !Array.isArray(value.trims)) return null;
  if (
    !isString(value.id) || !isNonNegativeInteger(value.sequenceRevision) || !isString(value.exportFingerprint)
    || value.segmentVersionIds.some((id) => !isString(id))
    || !isString(value.videoPath) || value.mimeType !== "video/mp4"
    || !isPositiveNumber(value.width) || !isPositiveNumber(value.height) || !isPositiveNumber(value.fps)
    || !isPositiveNumber(value.durationMs) || !isString(value.createdAt)
  ) return null;
  const trims = value.trims.map((trim) => {
    if (!isRecord(trim) || !isString(trim.segmentId)) return null;
    const normalized = normalizeTrim(trim);
    return normalized ? { segmentId: trim.segmentId, ...normalized } : null;
  });
  if (trims.some((trim) => !trim)) return null;
  return {
    id: value.id,
    sequenceRevision: value.sequenceRevision,
    exportFingerprint: value.exportFingerprint,
    segmentVersionIds: value.segmentVersionIds as string[],
    trims: trims as Array<{ segmentId: string; inMs: number; outMs?: number }>,
    videoPath: value.videoPath,
    mimeType: "video/mp4",
    width: value.width,
    height: value.height,
    fps: value.fps,
    ...(typeof value.includeAudio === "boolean" ? { includeAudio: value.includeAudio } : {}),
    ...(isString(value.fileName) ? { fileName: value.fileName } : {}),
    durationMs: value.durationMs,
    createdAt: value.createdAt
  };
}

function normalizeTaskError(value: unknown): VideoSequenceSegment["error"] | null {
  if (!isRecord(value) || !isString(value.code) || !isString(value.message) || typeof value.retryable !== "boolean") return null;
  if (!["submit", "poll", "download", "validate", "persist", "export"].includes(String(value.stage))) return null;
  return value as unknown as NonNullable<VideoSequenceSegment["error"]>;
}

function adjacencyKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function hasUniqueIds(values: Array<{ id: string }>): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function hasContiguousOrder(values: Array<{ order: number }>): boolean {
  return [...values].sort((left, right) => left.order - right.order).every((value, index) => value.order === index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
  ).join(",")}}`;
}

// Synchronous SHA-256 keeps fingerprints identical in renderer, Electron and tests.
function sha256(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const k = SHA256_CONSTANTS;
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = rotateRight(w[index - 15], 7) ^ rotateRight(w[index - 15], 18) ^ (w[index - 15] >>> 3);
      const b = rotateRight(w[index - 2], 17) ^ rotateRight(w[index - 2], 19) ^ (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + a + w[index - 7] + b) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const choice = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + sum1 + choice + k[index] + w[index]) >>> 0;
      const sum0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (sum0 + majority) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((part) => part.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
