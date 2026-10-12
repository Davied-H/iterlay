import { describe, expect, it } from "vitest";
import type { Connection, Edge, Node } from "@xyflow/react";

import {
  appendConnectionEdge,
  applyConnectionSelectionCommand,
  buildConnectionEdge,
  reconnectConnectionEdge,
  selectConnectionEdges
} from "@/components/canvas/connection-edge-commands";
import { VIDEO_GENERATION_NODE_HEIGHT } from "@/components/canvas/canvas-node-layout";

function node(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function connection(target = "target"): Connection {
  return {
    source: "source",
    target,
    sourceHandle: "source-right",
    targetHandle: "target-left"
  };
}

describe("connection edge commands", () => {
  it("uses one complete default rule for regular and pending-target connections", () => {
    const source = node("source", "imageNode");
    const regular = buildConnectionEdge(
      [source, node("target", "generationNode")],
      connection(),
      { id: "regular" }
    );
    const pending = buildConnectionEdge(
      [source],
      connection("pending"),
      { id: "pending-edge", targetNodeType: "generationNode" }
    );

    expect(regular).toMatchObject({
      ok: true,
      edge: {
        data: {
          kind: "reference",
          style: { dash: "dashed", endMarker: "arrow" },
          sourceAnchor: { side: "right", ratio: 0.5, mode: "auto" },
          targetAnchor: { side: "left", ratio: 0.5, mode: "auto" },
          routing: { mode: "auto", kind: "curved", waypoints: [] }
        }
      }
    });
    expect(pending).toMatchObject({
      ok: true,
      edge: { target: "pending", data: (regular as { ok: true; edge: Edge }).edge.data }
    });
  });

  it("marks setting, character, and segment inputs as version-following references", () => {
    for (const [sourceType, targetType] of [["textNode", "comicSettingNode"], ["imageNode", "comicCharacterNode"], ["comicCharacterNode", "comicSegmentNode"]]) {
      const result = buildConnectionEdge([node("source", sourceType), node("target", targetType)], connection());
      expect(result).toMatchObject({ ok: true, edge: { data: { kind: "reference", versionBinding: { mode: "follow-active" } } } });
    }
  });

  it("persists pinned endpoints supplied by a free connection gesture", () => {
    const result = buildConnectionEdge(
      [node("source", "imageNode"), node("target", "imageNode")],
      connection(),
      {
        id: "pinned",
        sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
        targetAnchor: { side: "left", ratio: 0.375, mode: "pinned" }
      }
    );

    expect(result).toMatchObject({
      ok: true,
      edge: {
        data: {
          sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
          targetAnchor: { side: "left", ratio: 0.375, mode: "pinned" }
        }
      }
    });
  });

  it.each([
    ["target-start-frame", 126 / VIDEO_GENERATION_NODE_HEIGHT, "首帧"],
    ["target-end-frame", 169 / VIDEO_GENERATION_NODE_HEIGHT, "尾帧"],
    ["target-reference", 212 / VIDEO_GENERATION_NODE_HEIGHT, "参考"],
    ["target-video-reference", 255 / VIDEO_GENERATION_NODE_HEIGHT, "参考视频"]
  ])("pins semantic video input %s to its rendered handle", (targetHandle, ratio, label) => {
    const sourceType = targetHandle === "target-video-reference" ? "videoNode" : "imageNode";
    const result = buildConnectionEdge(
      [node("source", sourceType), node("video-generation", "videoGenerationNode")],
      {
        source: "source",
        target: "video-generation",
        sourceHandle: "source-right",
        targetHandle
      }
    );

    expect(result).toMatchObject({
      ok: true,
      edge: {
        data: {
          label,
          targetAnchor: { side: "left", ratio, mode: "pinned" }
        }
      }
    });
  });

  it("rejects incomplete, self, missing, and incompatible connections", () => {
    const source = node("source", "imageNode");
    expect(buildConnectionEdge([source], {
      source: "",
      target: "",
      sourceHandle: null,
      targetHandle: null
    })).toEqual({ ok: false, reason: "incomplete" });
    expect(buildConnectionEdge([source], {
      source: "source",
      target: "source",
      sourceHandle: null,
      targetHandle: null
    })).toEqual({ ok: false, reason: "self" });
    expect(buildConnectionEdge([source], connection())).toEqual({ ok: false, reason: "missing-node" });
    expect(buildConnectionEdge([source, node("target", "textNode")], connection()))
      .toEqual({ ok: false, reason: "incompatible" });
  });

  it("deduplicates identical endpoints", () => {
    const built = buildConnectionEdge(
      [node("source", "imageNode"), node("target", "imageNode")],
      connection(),
      { id: "edge" }
    );
    if (!built.ok) throw new Error("expected a valid connection");
    const first = appendConnectionEdge([], built.edge);
    const duplicate = appendConnectionEdge(first.edges, { ...built.edge, id: "other-id" });

    expect(first.changed).toBe(true);
    expect(duplicate).toEqual({ edges: first.edges, changed: false });
  });

  it("resets only changed reconnect anchors and updates reference presentation", () => {
    const nodes = [
      node("source", "imageNode"),
      node("other-source", "imageNode"),
      node("target", "imageNode"),
      node("generation", "generationNode")
    ];
    const original: Edge = {
      id: "edge",
      source: "source",
      target: "target",
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
      data: {
        kind: "visual",
        style: { color: "#123456" },
        sourceAnchor: { side: "bottom", ratio: 0.25, mode: "pinned" },
        targetAnchor: { side: "top", ratio: 0.75, mode: "pinned" }
      }
    };
    const result = reconnectConnectionEdge(nodes, [original], original, {
      source: "source",
      target: "generation",
      sourceHandle: "source-bottom",
      targetHandle: "target-left"
    });

    expect(result.edges[0].id).toBe("edge");
    expect(result.edges[0].data).toMatchObject({
      kind: "reference",
      style: { color: "#123456", dash: "dashed", endMarker: "arrow" },
      sourceAnchor: { side: "bottom", ratio: 0.25, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "auto" }
    });
  });

  it("treats unchanged and duplicate reconnects as no-ops", () => {
    const nodes = [
      node("source", "imageNode"),
      node("target", "imageNode"),
      node("other", "imageNode")
    ];
    const original: Edge = {
      id: "original",
      source: "source",
      target: "target",
      sourceHandle: "source-right",
      targetHandle: "target-left"
    };
    const duplicate: Edge = {
      id: "duplicate",
      source: "source",
      target: "other",
      sourceHandle: "source-bottom",
      targetHandle: "target-top"
    };
    const edges = [original, duplicate];

    expect(reconnectConnectionEdge(nodes, edges, original, {
      source: "source",
      target: "target",
      sourceHandle: "source-right",
      targetHandle: "target-left"
    })).toEqual({ edges, changed: false });
    expect(reconnectConnectionEdge(nodes, edges, original, {
      source: "source",
      target: "other",
      sourceHandle: "source-bottom",
      targetHandle: "target-top"
    })).toEqual({ edges, changed: false });
  });

  it("removes only reference-forced style when reconnecting to a visual target", () => {
    const nodes = [
      node("source", "imageNode"),
      node("generation", "generationNode"),
      node("target", "imageNode")
    ];
    const original: Edge = {
      id: "edge",
      source: "source",
      target: "generation",
      sourceHandle: "source-right",
      targetHandle: "target-left",
      data: {
        kind: "reference",
        style: {
          color: "#123456",
          width: 3,
          dash: "dashed",
          endMarker: "arrow"
        }
      }
    };
    const result = reconnectConnectionEdge(nodes, [original], original, {
      source: "source",
      target: "target",
      sourceHandle: "source-right",
      targetHandle: "target-left"
    });

    expect(result.changed).toBe(true);
    expect(result.edges[0].data).toMatchObject({
      kind: "visual",
      style: { color: "#123456", width: 3 }
    });
    expect(result.edges[0].data?.style).not.toHaveProperty("dash");
    expect(result.edges[0].data?.style).not.toHaveProperty("endMarker");
  });

  it("applies selection and style commands without touching unrelated edges", () => {
    const edges: Edge[] = [
      { id: "first", source: "a", target: "b", selected: true, data: {} },
      { id: "second", source: "b", target: "c", selected: true, data: {} },
      { id: "third", source: "c", target: "d", data: {} }
    ];
    const styled = applyConnectionSelectionCommand(edges, "first", {
      type: "set-style",
      style: { color: "#2563eb" }
    });
    const selected = selectConnectionEdges(styled.edges, "third", false);

    expect(styled.edges.slice(0, 2).map((edge) => edge.data?.style)).toEqual([
      { color: "#2563eb" },
      { color: "#2563eb" }
    ]);
    expect(styled.edges[2]).toBe(edges[2]);
    expect(selected.edges.map((edge) => Boolean(edge.selected))).toEqual([false, false, true]);
  });
});
