import type {
  VideoSequence,
  VideoSequenceSegment,
  VideoSequenceSegmentVersion
} from "@/components/video-sequence/types";

export function orderedKeyframes(sequence: VideoSequence) {
  return [...sequence.keyframes].sort((a, b) => a.order - b.order);
}

export function orderedSegments(sequence: VideoSequence) {
  return [...sequence.segments].sort((a, b) => a.order - b.order);
}

export function activeSegmentVersion(segment: VideoSequenceSegment): VideoSequenceSegmentVersion | undefined {
  return segment.versions.find((version) => version.id === segment.activeVersionId) ?? segment.versions.at(-1);
}

export function effectiveSegmentDurationMs(segment: VideoSequenceSegment, fallbackSeconds: number): number {
  const versionDuration = activeSegmentVersion(segment)?.durationMs;
  const generatedDuration = versionDuration ?? (segment.durationSeconds ?? fallbackSeconds) * 1_000;
  const out = segment.trimOutMs ?? generatedDuration;
  return Math.max(0, Math.min(out, generatedDuration) - Math.max(0, segment.trimInMs));
}

export function sequenceDurationMs(sequence: VideoSequence): number {
  return orderedSegments(sequence).reduce(
    (sum, segment) => sum + effectiveSegmentDurationMs(segment, sequence.defaults.durationSeconds), 0
  );
}

export function segmentNeedsGeneration(segment: VideoSequenceSegment): boolean {
  return ["empty", "configured", "stale"].includes(segment.state) || segment.taskState === "failed";
}

export function segmentIsBlocked(segment: VideoSequenceSegment): boolean {
  return segment.state === "missing_input" || segment.state === "incompatible";
}

export function reorderSequenceKeyframe(sequence: VideoSequence, keyframeId: string, targetIndex: number): VideoSequence {
  const keyframes = orderedKeyframes(sequence);
  const from = keyframes.findIndex((item) => item.id === keyframeId);
  if (from < 0) return sequence;
  const bounded = Math.min(Math.max(0, targetIndex), keyframes.length - 1);
  const [moved] = keyframes.splice(from, 1);
  keyframes.splice(bounded, 0, moved);
  const nextFrames = keyframes.map((item, order) => ({ ...item, order }));
  const existing = new Map(sequence.segments.map((segment) => [`${segment.fromKeyframeId}:${segment.toKeyframeId}`, segment]));
  const nextSegments: VideoSequenceSegment[] = [];
  for (let order = 0; order < nextFrames.length - 1; order += 1) {
    const fromFrame = nextFrames[order];
    const toFrame = nextFrames[order + 1];
    const preserved = existing.get(`${fromFrame.id}:${toFrame.id}`);
    nextSegments.push(preserved ? { ...preserved, order } : {
      id: crypto.randomUUID(), order, fromKeyframeId: fromFrame.id, toKeyframeId: toFrame.id,
      prompt: "", trimInMs: 0, state: "configured", versions: []
    });
  }
  return { ...sequence, revision: sequence.revision + 1, keyframes: nextFrames, segments: nextSegments };
}

export function reorderSequenceSegment(sequence: VideoSequence, segmentId: string, targetIndex: number): VideoSequence {
  const segments = orderedSegments(sequence);
  const from = segments.findIndex((item) => item.id === segmentId);
  if (from < 0) return sequence;
  const bounded = Math.min(Math.max(0, targetIndex), segments.length - 1);
  const [moved] = segments.splice(from, 1);
  segments.splice(bounded, 0, moved);
  return { ...sequence, revision: sequence.revision + 1, segments: segments.map((item, order) => ({ ...item, order })) };
}

export function removeSequenceKeyframe(sequence: VideoSequence, keyframeId: string): VideoSequence {
  const keyframes = orderedKeyframes(sequence).filter((item) => item.id !== keyframeId);
  if (keyframes.length < 2 || keyframes.length === sequence.keyframes.length) return sequence;
  const existing = new Map(sequence.segments.map((segment) => [`${segment.fromKeyframeId}:${segment.toKeyframeId}`, segment]));
  const normalizedFrames = keyframes.map((item, order) => ({ ...item, order }));
  const segments: VideoSequenceSegment[] = normalizedFrames.slice(0, -1).map((fromFrame, order) => {
    const toFrame = normalizedFrames[order + 1];
    const preserved = existing.get(`${fromFrame.id}:${toFrame.id}`);
    return preserved ? { ...preserved, order } : {
      id: crypto.randomUUID(), order, fromKeyframeId: fromFrame.id, toKeyframeId: toFrame.id,
      prompt: "", trimInMs: 0, state: "configured", versions: []
    };
  });
  return { ...sequence, revision: sequence.revision + 1, keyframes: normalizedFrames, segments };
}

export function updateSequenceSegment(
  sequence: VideoSequence,
  segmentId: string,
  patch: Partial<VideoSequenceSegment>
): VideoSequence {
  return {
    ...sequence,
    revision: sequence.revision + 1,
    segments: sequence.segments.map((segment) => segment.id === segmentId
      ? { ...segment, ...patch, state: patch.state ?? (segment.versions.length ? "stale" : "configured") }
      : segment)
  };
}
