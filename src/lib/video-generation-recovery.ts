import {
  isBoardVideoGenerationNode,
  isBoardVideoNode,
  type BoardConnection,
  type BoardNode,
  type BoardVideoNode,
  type VideoGenerationJob
} from "@shared/types";
import { GENERATION_OUTPUT_HORIZONTAL_GAP } from "@shared/generation-output-layout";
import { reconcileVideoGenerationPlaceholder } from "@shared/video-generation-placeholder";

const ACTIVE_VIDEO_JOB_STATUSES = new Set<VideoGenerationJob["status"]>([
  "submitting",
  "queued",
  "generating",
  "post_processing",
  "recovering"
]);

export interface RecoveredVideoCanvas {
  nodes: BoardNode[];
  connections: BoardConnection[];
  changed: boolean;
}

export function reconcileRecoveredVideoCanvas(
  nodes: BoardNode[],
  connections: BoardConnection[],
  jobs: VideoGenerationJob[],
  boardId: string
): RecoveredVideoCanvas {
  let nextNodes = nodes;
  let nextConnections = connections;
  let changed = false;

  for (const job of jobs) {
    const generationNodeId = job.input.generationNodeId;
    if (
      job.input.boardId !== boardId
      || !generationNodeId
      || job.input.mode === "remix"
    ) continue;

    const generation = nextNodes.find((node) => (
      node.id === generationNodeId && isBoardVideoGenerationNode(node)
    ));
    if (!generation || !isBoardVideoGenerationNode(generation)) continue;
    if (generation.lastGenerationId && generation.lastGenerationId !== job.id) continue;

    const reconciled = reconcileVideoGenerationPlaceholder(nextNodes, nextConnections, generationNodeId, job.id);
    nextNodes = reconciled.nodes;
    nextConnections = reconciled.connections;
    changed ||= reconciled.changed;

    const generationStatus = job.status;
    if (
      generation.status !== generationStatus
      || generation.lastGenerationId !== job.id
      || generation.error !== job.error
    ) {
      nextNodes = nextNodes.map((node) => node.id === generationNodeId && isBoardVideoGenerationNode(node)
        ? { ...node, status: generationStatus, lastGenerationId: job.id, error: job.error }
        : node);
      changed = true;
    }

    let output = nextNodes.find((node) => (
      isBoardVideoNode(node) && (node.jobId === job.id || node.id === `video-output-${job.id}`)
    ));
    const shouldCreateOutput = ACTIVE_VIDEO_JOB_STATUSES.has(job.status)
      || job.status === "failed"
      || job.status === "cancelled"
      || (job.status === "completed" && Boolean(job.outputVideoPath));
    if (!output && shouldCreateOutput) {
      output = {
        id: `video-output-${job.id}`,
        type: "video",
        videoPath: job.outputVideoPath ?? "",
        posterPath: job.outputPosterPath,
        jobId: job.id,
        source: "generated",
        generationNodeId,
        aspectRatio: generation.aspectRatio ?? job.input.aspectRatio ?? "16:9",
        status: job.status,
        error: job.error,
        x: generation.x + Math.max(1, generation.displayWidth ?? 340)
          + GENERATION_OUTPUT_HORIZONTAL_GAP,
        y: generation.y
      } satisfies BoardVideoNode;
      nextNodes = [...nextNodes, output];
      changed = true;
    } else if (output && isBoardVideoNode(output)) {
      const nextOutput: BoardVideoNode = {
        ...output,
        status: job.status,
        error: job.error,
        videoPath: job.outputVideoPath ?? output.videoPath,
        posterPath: job.outputPosterPath ?? output.posterPath
      };
      if (
        nextOutput.status !== output.status
        || nextOutput.error !== output.error
        || nextOutput.videoPath !== output.videoPath
        || nextOutput.posterPath !== output.posterPath
      ) {
        nextNodes = nextNodes.map((node) => node.id === output!.id ? nextOutput : node);
        output = nextOutput;
        changed = true;
      }
    }

    if (output && !nextConnections.some((connection) => (
      connection.source === generationNodeId && connection.target === output!.id
    ))) {
      nextConnections = [...nextConnections, {
        id: crypto.randomUUID(),
        source: generationNodeId,
        target: output.id,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        kind: "visual",
        label: "生成结果",
        sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
        targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
        routing: { mode: "auto", kind: "curved", waypoints: [] }
      }];
      changed = true;
    }
  }

  return { nodes: nextNodes, connections: nextConnections, changed };
}
