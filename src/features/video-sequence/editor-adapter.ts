import type { VideoSequence as PersistedVideoSequence, VideoSequenceTask } from "@shared/types";
import type { VideoSequence as EditorVideoSequence, VideoSequenceTaskState } from "@/components/video-sequence";

export function editorTaskState(status: VideoSequenceTask["status"]): VideoSequenceTaskState {
  if (status === "pending" || status === "submitting") return "submitting";
  if (status === "queued") return "queued";
  if (status === "generating") return "generating";
  if (status === "downloading" || status === "validating") return "post_processing";
  if (status === "remote_unknown") return "recovering";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

export function toEditorVideoSequence(
  sequence: PersistedVideoSequence & { sequenceTasks?: VideoSequenceTask[] },
  boardName?: string
): EditorVideoSequence {
  return {
    kind: sequence.kind ?? "keyframe-generation",
    id: sequence.id,
    boardId: sequence.boardId,
    boardName,
    name: sequence.name,
    revision: sequence.revision,
    updatedAt: sequence.updatedAt,
    defaults: sequence.defaults,
    keyframes: sequence.keyframes.map((frame) => ({
      id: frame.id,
      order: frame.order,
      label: frame.label,
      imagePath: frame.source.imagePath,
      nodeId: frame.source.nodeId
    })),
    segments: sequence.segments.map((segment) => {
      const task = [...(sequence.sequenceTasks ?? [])].reverse().find((candidate) => candidate.segmentId === segment.id
        && candidate.segmentRevision === segment.desiredRevision
        && candidate.inputFingerprint === segment.inputFingerprint);
      const active = segment.versions.find((version) => version.id === segment.activeVersionId);
      const state = segment.error
        ? "incompatible" as const
        : !segment.activeVersionId
          ? (segment.config.prompt.trim() ? "configured" as const : "empty" as const)
          : segment.renderedRevision !== segment.desiredRevision
            ? "stale" as const
            : "valid" as const;
      return {
        id: segment.id,
        order: segment.order,
        fromKeyframeId: segment.fromKeyframeId,
        toKeyframeId: segment.toKeyframeId,
        prompt: segment.config.prompt,
        providerId: segment.config.providerId,
        model: segment.config.model,
        durationSeconds: segment.config.durationSeconds,
        aspectRatio: segment.config.aspectRatio,
        resolution: segment.config.resolution,
        generateAudio: segment.config.generateAudio,
        watermark: segment.config.watermark,
        trimInMs: segment.trim.inMs,
        trimOutMs: segment.trim.outMs,
        muted: segment.trim.muted,
        state,
        taskState: task ? editorTaskState(task.status) : segment.error ? "failed" as const : undefined,
        error: segment.error?.message,
        versions: segment.versions.map((version) => ({
          id: version.id,
          videoPath: version.videoPath,
          posterPath: version.posterPath,
          durationMs: version.durationMs,
          width: version.width,
          height: version.height,
          createdAt: version.createdAt,
          model: "config" in version.inputSnapshot ? version.inputSnapshot.config.model : undefined
        })),
        activeVersionId: active?.id ?? segment.activeVersionId
      };
    })
  };
}

