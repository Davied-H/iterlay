import { describe, expect, it, vi } from "vitest";
import type { BoardNode, VideoGenerationJob } from "../shared/types.js";
import { reconcileRecoveredVideoCanvas } from "../src/lib/video-generation-recovery.js";

describe("video generation recovery", () => {
  it("recreates a missing active output card and result connection", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "connection-id" });
    const nodes: BoardNode[] = [{
      id: "generation",
      type: "video-generation",
      status: "queued",
      lastGenerationId: "job",
      x: 100,
      y: 200,
      displayWidth: 340
    }];

    const result = reconcileRecoveredVideoCanvas(nodes, [], [job()], "board");

    expect(result.changed).toBe(true);
    expect(result.nodes).toContainEqual(expect.objectContaining({
      id: "video-output-job",
      type: "video",
      status: "recovering",
      jobId: "job",
      generationNodeId: "generation",
      x: 632,
      y: 200
    }));
    expect(result.connections).toEqual([expect.objectContaining({
      source: "generation",
      target: "video-output-job",
      label: "生成结果"
    })]);
    vi.unstubAllGlobals();
  });

  it("does not let an older recovered attempt replace a newer generation", () => {
    const nodes: BoardNode[] = [{
      id: "generation",
      type: "video-generation",
      status: "generating",
      lastGenerationId: "new-job",
      x: 0,
      y: 0
    }];

    const result = reconcileRecoveredVideoCanvas(nodes, [], [job()], "board");

    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
  });

  it("recreates the output card for an extending task", () => {
    const nodes: BoardNode[] = [{
      id: "generation",
      type: "video-generation",
      mode: "extend",
      status: "queued",
      lastGenerationId: "job",
      x: 0,
      y: 0
    }];

    const result = reconcileRecoveredVideoCanvas(nodes, [], [{
      ...job(),
      input: { ...job().input, mode: "extend" }
    }], "board");

    expect(result.nodes).toContainEqual(expect.objectContaining({
      id: "video-output-job",
      status: "recovering"
    }));
  });

  it("recreates a missing failed output card after recovery", () => {
    const nodes: BoardNode[] = [{
      id: "generation",
      type: "video-generation",
      status: "failed",
      lastGenerationId: "job",
      x: 0,
      y: 0
    }];

    const result = reconcileRecoveredVideoCanvas(nodes, [], [{
      ...job(),
      status: "failed",
      error: "任务失败"
    }], "board");

    expect(result.nodes).toContainEqual(expect.objectContaining({
      id: "video-output-job",
      status: "failed",
      error: "任务失败"
    }));
    expect(result.connections).toHaveLength(1);
  });
});

function job(): VideoGenerationJob {
  return {
    id: "job",
    status: "recovering",
    createdAt: "2026-08-21T08:09:31.722Z",
    providerId: "iterlay-official-video",
    model: "官方视频模型",
    remoteTaskId: "remote-job",
    input: {
      prompt: "move",
      model: "官方视频模型",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      referenceImagePaths: [],
      boardId: "board",
      generationNodeId: "generation"
    }
  };
}
