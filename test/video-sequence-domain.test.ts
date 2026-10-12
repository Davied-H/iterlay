import { describe, expect, it } from "vitest";
import type {
  FrozenImageSource,
  VideoGenerationJobV2,
  VideoSegmentVersion,
  VideoSequence,
  VideoSequenceKeyframe,
  VideoSequenceSegment,
  VideoSequenceTemplate
} from "../shared/types.js";
import {
  buildExportFingerprint,
  buildSegmentFingerprint,
  deriveSegmentState,
  deriveSequenceState,
  invalidateKeyframeNeighbors,
  normalizeVideoSequence,
  normalizeVideoSequenceTemplate,
  reconcileSequenceAdjacency,
  resolveSegmentConfig,
  updateSegmentConfig,
  updateSegmentTrim,
  updateSequenceDefaults
} from "../shared/video-sequence.js";

const defaults: VideoSequence["defaults"] = {
  providerId: "provider",
  model: "model-a",
  aspectRatio: "16:9",
  resolution: "1080p",
  fps: 30,
  durationSeconds: 5,
  generateAudio: false,
  watermark: false
};

describe("video sequence domain", () => {
  it.each([
    [2, 1],
    [3, 2],
    [10, 9]
  ])("builds %i ordered keyframes into %i segments", (keyframeCount, segmentCount) => {
    const previous = sequence(keyframes(2), []);
    let id = 0;
    const reconciled = reconcileSequenceAdjacency({
      previous,
      orderedKeyframes: keyframes(keyframeCount),
      createSegmentId: () => `created-${id++}`
    });

    expect(reconciled).toHaveLength(segmentCount);
    expect(reconciled.map((segment) => [segment.fromKeyframeId, segment.toKeyframeId])).toEqual(
      Array.from({ length: segmentCount }, (_, index) => [`keyframe-${index}`, `keyframe-${index + 1}`])
    );
  });

  it("reuses unchanged adjacency and creates only new pairs after reordering", () => {
    const frames = keyframes(4);
    const original = withSegments(sequence(frames, []), frames);
    const reordered = [frames[0], frames[2], frames[1], frames[3]].map((frame, order) => ({ ...frame, order }));
    let created = 0;

    const reconciled = reconcileSequenceAdjacency({
      previous: original,
      orderedKeyframes: reordered,
      createSegmentId: () => `new-${created++}`
    });

    expect(reconciled.map((segment) => segment.id)).toEqual(["new-0", "new-1", "new-2"]);
    const restored = reconcileSequenceAdjacency({
      previous: original,
      orderedKeyframes: frames,
      createSegmentId: () => "unexpected"
    });
    expect(restored.map((segment) => segment.id)).toEqual(["segment-0", "segment-1", "segment-2"]);
    expect(restored[1].versions).toBe(original.segments[1].versions);
  });

  it("invalidates only both neighbors of a middle keyframe and one at an edge", () => {
    const frames = keyframes(4);
    const original = withSegments(sequence(frames, []), frames);
    const originalRevisions = original.segments.map((segment) => segment.desiredRevision);
    const middle = invalidateKeyframeNeighbors({
      sequence: original,
      keyframeId: "keyframe-1",
      replacement: source("replacement")
    });
    expect(middle.segments.map((segment) => segment.desiredRevision)).toEqual([
      originalRevisions[0] + 1,
      originalRevisions[1] + 1,
      originalRevisions[2]
    ]);

    const edge = invalidateKeyframeNeighbors({
      sequence: original,
      keyframeId: "keyframe-0",
      replacement: source("replacement")
    });
    expect(edge.segments.map((segment) => segment.desiredRevision)).toEqual([
      originalRevisions[0] + 1,
      originalRevisions[1],
      originalRevisions[2]
    ]);
  });

  it("changes only target generation revision while trim only expires export", () => {
    const frames = keyframes(3);
    const original = { ...withSegments(sequence(frames, []), frames), activeExportVersionId: "export-1" };
    const originalRevisions = original.segments.map((segment) => segment.desiredRevision);
    const configured = updateSegmentConfig({ sequence: original, segmentId: "segment-1", patch: { prompt: "新的运镜" } });
    expect(configured.segments.map((segment) => segment.desiredRevision)).toEqual([
      originalRevisions[0],
      originalRevisions[1] + 1
    ]);

    const before = configured.segments[1];
    const trimmed = updateSegmentTrim({ sequence: configured, segmentId: "segment-1", patch: { inMs: 500, outMs: 3500 } });
    expect(trimmed.segments[1]).toMatchObject({
      desiredRevision: before.desiredRevision,
      inputFingerprint: before.inputFingerprint,
      trim: { inMs: 500, outMs: 3500 }
    });
    expect(trimmed.activeExportVersionId).toBeUndefined();
  });

  it("invalidates only segments that inherit a changed default", () => {
    const frames = keyframes(3);
    const original = withSegments(sequence(frames, []), frames);
    const overridden = updateSegmentConfig({ sequence: original, segmentId: "segment-1", patch: { model: "fixed-model" } });
    const beforeDefaultChange = overridden.segments.map((segment) => segment.desiredRevision);
    const updated = updateSequenceDefaults({ sequence: overridden, patch: { model: "model-b" } });
    expect(updated.segments.map((segment) => segment.desiredRevision)).toEqual([
      beforeDefaultChange[0] + 1,
      beforeDefaultChange[1]
    ]);
    expect(updated.segments[1].inputFingerprint).toBe(overridden.segments[1].inputFingerprint);
  });

  it("uses stable SHA-256 fingerprints and excludes trim from generation", () => {
    const config = resolveSegmentConfig(defaults, { prompt: "镜头缓慢推进" });
    const first = buildSegmentFingerprint({ firstFrameSha256: "a", lastFrameSha256: "b", config });
    const second = buildSegmentFingerprint({ firstFrameSha256: "a", lastFrameSha256: "b", config: { ...config } });
    expect(first).toBe(second);
    expect(first).toBe("08b71fdba08caff664e23ba6923197cb8e8e664362ffb1607fb009de39cb56b8");
    expect(buildSegmentFingerprint({ firstFrameSha256: "a", lastFrameSha256: "c", config })).not.toBe(first);
    const exportFingerprint = buildExportFingerprint({ segmentVersionIds: ["v1"], trims: [{ inMs: 0 }], width: 1920, height: 1080, fps: 30, includeAudio: true });
    expect(exportFingerprint).not.toBe(buildExportFingerprint({ segmentVersionIds: ["v1"], trims: [{ inMs: 100 }], width: 1920, height: 1080, fps: 30, includeAudio: true }));
    expect(exportFingerprint).not.toBe(buildExportFingerprint({ segmentVersionIds: ["v1"], trims: [{ inMs: 0 }], width: 1920, height: 1080, fps: 30, includeAudio: false }));
  });

  it("derives ready, completed, stale, task and aggregate states", () => {
    const frames = keyframes(3);
    const ready = withSegments(sequence(frames, []), frames);
    expect(deriveSegmentState(ready.segments[0])).toBe("ready");
    expect(deriveSequenceState(ready, [])).toBe("ready");

    const completeSegments = ready.segments.map(completedSegment);
    const complete = { ...ready, segments: completeSegments };
    expect(deriveSegmentState(complete.segments[0])).toBe("completed");
    expect(deriveSequenceState(complete, [])).toBe("completed");

    const stale = updateSegmentConfig({ sequence: complete, segmentId: "segment-0", patch: { prompt: "change" } });
    expect(deriveSegmentState(stale.segments[0])).toBe("stale");
    expect(deriveSequenceState(stale, [])).toBe("partial");
    expect(deriveSegmentState(stale.segments[0], job(stale.segments[0], "pending"))).toBe("pending");
    expect(deriveSequenceState(stale, [job(stale.segments[0], "generating")])).toBe("running");
    expect(deriveSegmentState(stale.segments[0], job(stale.segments[0], "failed_retryable"))).toBe("failed");
  });

  it("normalizes valid data and rejects duplicate ids, dangling adjacency and malformed templates", () => {
    const frames = keyframes(3);
    const valid = withSegments(sequence(frames, []), frames);
    expect(normalizeVideoSequence(structuredClone(valid))).toEqual(valid);
    expect(normalizeVideoSequence({ ...valid, keyframes: [frames[0], frames[0], frames[2]] })).toBeNull();
    expect(normalizeVideoSequence({
      ...valid,
      segments: [{ ...valid.segments[0], toKeyframeId: "missing" }, valid.segments[1]]
    })).toBeNull();
    expect(normalizeVideoSequence({ ...valid, keyframes: keyframes(11) })).toBeNull();

    const template = templateFixture();
    expect(normalizeVideoSequenceTemplate(structuredClone(template))).toEqual(template);
    expect(normalizeVideoSequenceTemplate({
      ...template,
      segments: [{ ...template.segments[0], toSlotId: "missing" }]
    })).toBeNull();
  });
});

function source(id: string): FrozenImageSource {
  return { nodeId: `node-${id}`, nodeVersionIndex: 0, imagePath: `/managed/${id}.png`, sha256: `hash-${id}`, width: 1920, height: 1080 };
}

function keyframes(count: number): VideoSequenceKeyframe[] {
  return Array.from({ length: count }, (_, order) => ({ id: `keyframe-${order}`, order, source: source(String(order)) }));
}

function sequence(frames: VideoSequenceKeyframe[], segments: VideoSequenceSegment[]): VideoSequence {
  return {
    id: "sequence",
    boardId: "board",
    name: "镜头序列",
    revision: 1,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    defaults,
    keyframes: frames,
    segments,
    exportVersions: [{
      id: "export-1",
      sequenceRevision: 1,
      exportFingerprint: "export-fingerprint",
      segmentVersionIds: [],
      trims: [],
      videoPath: "/managed/export.mp4",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      fps: 30,
      durationMs: 10_000,
      includeAudio: false,
      fileName: "silent-export",
      createdAt: "2026-08-13T00:00:00.000Z"
    }]
  };
}

function withSegments(base: VideoSequence, frames: VideoSequenceKeyframe[]): VideoSequence {
  let id = 0;
  return {
    ...base,
    segments: reconcileSequenceAdjacency({
      previous: base,
      orderedKeyframes: frames,
      createSegmentId: () => `segment-${id++}`
    }).map((segment) => updateSegmentConfig({
      sequence: { ...base, segments: [segment] },
      segmentId: segment.id,
      patch: { prompt: `prompt-${segment.order}` }
    }).segments[0])
  };
}

function completedSegment(segment: VideoSequenceSegment): VideoSequenceSegment {
  const version: VideoSegmentVersion = {
    id: `version-${segment.id}`,
    taskId: `task-${segment.id}`,
    segmentRevision: segment.desiredRevision,
    inputFingerprint: segment.inputFingerprint,
    inputSnapshot: {
      firstFrame: source(segment.fromKeyframeId.replace("keyframe-", "")),
      lastFrame: source(segment.toKeyframeId.replace("keyframe-", "")),
      config: resolveSegmentConfig(defaults, segment.config)
    },
    videoPath: `/managed/${segment.id}.mp4`,
    mimeType: "video/mp4",
    width: 1920,
    height: 1080,
    durationMs: 5000,
    createdAt: "2026-08-13T00:00:00.000Z"
  };
  return { ...segment, versions: [version], activeVersionId: version.id, renderedRevision: segment.desiredRevision };
}

function job(segment: VideoSequenceSegment, taskStatus: VideoGenerationJobV2["taskStatus"]): VideoGenerationJobV2 {
  return {
    schemaVersion: 2,
    kind: "sequence-segment",
    id: `job-${taskStatus}`,
    clientRequestId: `request-${taskStatus}`,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:01.000Z",
    status: taskStatus === "completed" ? "completed" : "queued",
    taskStatus,
    attempt: 1,
    model: defaults.model,
    sequenceId: "sequence",
    segmentId: segment.id,
    segmentRevision: segment.desiredRevision,
    inputFingerprint: segment.inputFingerprint,
    input: {
      prompt: segment.config.prompt,
      model: defaults.model,
      aspectRatio: defaults.aspectRatio,
      resolution: defaults.resolution,
      durationSeconds: defaults.durationSeconds,
      referenceImagePaths: []
    }
  };
}

function templateFixture(): VideoSequenceTemplate {
  return {
    schemaVersion: 1,
    id: "template",
    name: "模板",
    description: "两镜头",
    version: 1,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    defaults,
    slots: [
      { id: "slot-a", label: "A", required: true },
      { id: "slot-b", label: "B", required: true }
    ],
    segments: [{ id: "template-segment", fromSlotId: "slot-a", toSlotId: "slot-b", config: { prompt: "推进" } }]
  };
}
