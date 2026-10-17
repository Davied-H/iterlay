import { describe, expect, it } from "vitest";
import type { BoardConnection, BoardNode, BoardVideoNode } from "../shared/types.js";
import {
  pendingVideoJobId,
  reconcileVideoGenerationPlaceholder
} from "../shared/video-generation-placeholder.js";

describe("video generation placeholders", () => {
  it("gives each generator its own pending identity and transfers every connected endpoint", () => {
    const pendingJobId = pendingVideoJobId("generation");
    expect(pendingJobId).toBe("pending-generation");
    expect(pendingJobId).not.toBe(pendingVideoJobId("other-generation"));
    const pending = video(`video-output-${pendingJobId}`, pendingJobId, {
      generationNodeId: "generation",
      x: 520,
      y: 180
    });
    const nodes: BoardNode[] = [generator("generation"), pending, generator("downstream")];
    const connections: BoardConnection[] = [
      resultConnection("original-result", "generation", pending.id),
      { id: "downstream-reference", source: pending.id, target: "downstream", kind: "reference", targetHandle: "target-video-reference" }
    ];

    const result = reconcileVideoGenerationPlaceholder(nodes, connections, "generation", "job");

    expect(result.changed).toBe(true);
    expect(result.nodes.filter((node) => node.type === "video")).toEqual([
      expect.objectContaining({
        id: "video-output-job",
        jobId: "job",
        generationNodeId: "generation",
        x: 520,
        y: 180
      })
    ]);
    expect(result.connections).toEqual([
      { ...connections[0], target: "video-output-job" },
      { ...connections[1], source: "video-output-job" }
    ]);
    expect(nodes[1]).toBe(pending);
    expect(pending.id).toBe("video-output-pending-generation");

    const again = reconcileVideoGenerationPlaceholder(result.nodes, result.connections, "generation", "job");
    expect(again.changed).toBe(false);
    expect(again.nodes).toBe(result.nodes);
    expect(again.connections).toBe(result.connections);
  });

  it("merges a renderer/backend race without losing completed media, layout or original connections", () => {
    const pending = video("video-output-pending-generation", "pending-generation", {
      generationNodeId: "generation",
      x: 900,
      y: 900
    });
    const canonical = video("video-output-job", "job", {
      generationNodeId: "generation",
      videoPath: "/outputs/completed.mp4",
      posterPath: "/outputs/completed.jpg",
      status: "completed",
      x: 540,
      y: 160,
      versions: [{ jobId: "job", videoPath: "/outputs/completed.mp4" }],
      activeVersion: 0
    });
    const nodes: BoardNode[] = [generator("generation"), pending, canonical, { ...canonical }, generator("downstream")];
    const original = {
      ...resultConnection("original-result", "generation", pending.id),
      labelProgress: 0.7,
      routing: { mode: "manual", kind: "curved", waypoints: [{ id: "manual-bend", x: 400, y: 100 }] }
    } satisfies BoardConnection;
    const connections: BoardConnection[] = [
      original,
      resultConnection("backend-result", "generation", canonical.id),
      { id: "downstream-reference", source: pending.id, target: "downstream", kind: "reference", targetHandle: "target-video-reference" },
      { id: "canonical-downstream", source: canonical.id, target: "downstream", kind: "reference", targetHandle: "target-start-frame" },
      { id: "between-duplicates", source: pending.id, target: canonical.id, kind: "reference" }
    ];

    const result = reconcileVideoGenerationPlaceholder(nodes, connections, "generation", "job");

    expect(result.changed).toBe(true);
    expect(result.nodes.filter((node) => node.type === "video")).toEqual([canonical]);
    expect(result.connections).toEqual([
      { ...original, target: canonical.id },
      { ...connections[2], source: canonical.id },
      connections[3]
    ]);
    expect(canonical.videoPath).toBe("/outputs/completed.mp4");
  });

  it("leaves other generators, historical outputs and unowned legacy placeholders intact", () => {
    const nodes: BoardNode[] = [
      generator("generation"),
      generator("other-generation"),
      video("video-output-pending-other-generation", "pending-other-generation", { generationNodeId: "other-generation" }),
      video("video-output-old-job", "old-job", { generationNodeId: "generation", videoPath: "/outputs/old.mp4", status: "completed" }),
      video("video-output-empty-old-job", "empty-old-job", { generationNodeId: "generation" }),
      video("video-output-pending-", "pending-")
    ];
    const connections: BoardConnection[] = [
      resultConnection("other-result", "other-generation", "video-output-pending-other-generation"),
      resultConnection("historical-result", "generation", "video-output-old-job"),
      resultConnection("historical-empty-result", "generation", "video-output-empty-old-job")
    ];

    const result = reconcileVideoGenerationPlaceholder(nodes, connections, "generation", "job");

    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
    expect(result.connections).toBe(connections);
  });

  it.each(["node", "connection"] as const)("repairs a legacy generic placeholder when its %s proves ownership", (ownership) => {
    const pending = video("video-output-pending-", "pending-", {
      ...(ownership === "node" ? { generationNodeId: "generation" } : {})
    });
    const nodes: BoardNode[] = [generator("generation"), pending];
    const connections = ownership === "connection"
      ? [resultConnection("legacy-result", "generation", pending.id)]
      : [];

    const result = reconcileVideoGenerationPlaceholder(nodes, connections, "generation", "job");

    expect(result.changed).toBe(true);
    expect(result.nodes.filter((node) => node.type === "video")).toEqual([
      expect.objectContaining({ id: "video-output-job", jobId: "job", generationNodeId: "generation" })
    ]);
    if (ownership === "connection") {
      expect(result.connections).toEqual([{ ...connections[0], target: "video-output-job" }]);
    }
  });

  it("deduplicates the optimistic output without treating a pending job as a real submission", () => {
    const pendingJobId = pendingVideoJobId("generation");
    const pending = video(`video-output-${pendingJobId}`, pendingJobId, { generationNodeId: "generation" });
    const nodes: BoardNode[] = [generator("generation"), pending, { ...pending }];
    const connections = [
      resultConnection("first-result", "generation", pending.id),
      resultConnection("duplicate-result", "generation", pending.id)
    ];

    const result = reconcileVideoGenerationPlaceholder(nodes, connections, "generation", pendingJobId);

    expect(result.changed).toBe(true);
    expect(result.nodes.filter((node) => node.type === "video")).toEqual([pending]);
    expect(result.connections).toEqual([connections[0]]);
    const again = reconcileVideoGenerationPlaceholder(result.nodes, result.connections, "generation", pendingJobId);
    expect(again.changed).toBe(false);
    expect(again.nodes).toBe(result.nodes);
    expect(again.connections).toBe(result.connections);
  });
});

function generator(id: string): BoardNode {
  return { id, type: "video-generation", x: 0, y: 0 };
}

function video(id: string, jobId: string, overrides: Partial<BoardVideoNode> = {}): BoardVideoNode {
  return { id, type: "video", jobId, videoPath: "", source: "generated", status: "submitting", x: 0, y: 0, ...overrides };
}

function resultConnection(id: string, source: string, target: string): BoardConnection {
  return { id, source, target, sourceHandle: "source-right", targetHandle: "target-left", kind: "visual", label: "生成结果" };
}
