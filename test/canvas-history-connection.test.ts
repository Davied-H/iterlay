import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { boardConnectionFromEdge } from "@/components/canvas/canvas-history";
import { edgeFromConnection } from "@/components/canvas/ConnectionController";

function edgeWithData(data: Record<string, unknown>): Edge {
  return {
    id: "edge-history",
    source: "source",
    target: "target",
    data
  };
}

describe("connection history persistence boundary", () => {
  it("renders locked comic dependencies as curved non-deletable edges", () => {
    const edge = edgeFromConnection({
      id: "setting-character",
      source: "setting",
      target: "character",
      kind: "reference",
      versionBinding: { mode: "pinned", versionId: "setting-v1" },
      label: "由此设定派生",
      locked: true,
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    });
    expect(edge).toMatchObject({
      selectable: false,
      deletable: false,
      reconnectable: false,
      data: {
        routing: { mode: "auto", kind: "curved" }
      }
    });
    expect(boardConnectionFromEdge(edge)).toMatchObject({
      locked: true,
      routing: { mode: "auto", kind: "curved" }
    });
  });

  it("keeps reference semantics through connection, edge data, and history roundtrip", () => {
    const edge = edgeFromConnection({
      id: "reference-edge",
      source: "text-node",
      target: "generation-node",
      kind: "reference",
      versionBinding: { mode: "follow-active" }
    });

    expect(edge).toMatchObject({ kind: "reference", data: { kind: "reference" } });
    expect(boardConnectionFromEdge(edge)).toMatchObject({
      id: "reference-edge",
      source: "text-node",
      target: "generation-node",
      kind: "reference",
      versionBinding: { mode: "follow-active" }
    });
  });

  it("treats legacy edges without semantic data as visual connections", () => {
    expect(boardConnectionFromEdge(edgeWithData({})).kind).toBe("visual");
  });

  it("repairs a partial legacy routing object instead of crashing the snapshot", () => {
    const connection = boardConnectionFromEdge(edgeWithData({
      routing: { mode: "manual", kind: "orthogonal" }
    }));

    expect(connection.routing).toEqual({
      mode: "manual",
      kind: "orthogonal",
      waypoints: []
    });
  });

  it("drops non-finite anchors and label coordinates before save/undo", () => {
    const connection = boardConnectionFromEdge(edgeWithData({
      sourceAnchor: Number.NaN,
      targetAnchor: { side: "left", ratio: Number.NaN, mode: "pinned" },
      labelProgress: Number.POSITIVE_INFINITY,
      labelAnchor: { segmentId: "segment-a", progress: Number.NaN, globalProgress: Number.POSITIVE_INFINITY },
      labelPosition: { x: 20, y: Number.NaN },
      routeCoordinate: Number.NEGATIVE_INFINITY,
      style: {
        color: "#2563eb",
        width: Number.NaN,
        dash: "broken",
        startMarker: "triangle",
        endMarker: "arrow",
        lineJumps: false
      }
    }));

    expect(connection).toMatchObject({
      sourceAnchor: undefined,
      targetAnchor: undefined,
      labelProgress: undefined,
      labelAnchor: undefined,
      labelPosition: undefined,
      routeCoordinate: undefined,
      style: { color: "#2563eb", endMarker: "arrow", lineJumps: false }
    });
    expect(connection.style).toEqual({ color: "#2563eb", endMarker: "arrow", lineJumps: false });
  });

  it("persists arrow size within the supported range", () => {
    const small = boardConnectionFromEdge(edgeWithData({ style: { endMarker: "arrow", markerSize: 2 } }));
    const large = boardConnectionFromEdge(edgeWithData({ style: { endMarker: "arrow", markerSize: 28 } }));
    const custom = boardConnectionFromEdge(edgeWithData({ style: { endMarker: "arrow", markerSize: 14 } }));

    expect(small.style?.markerSize).toBe(6);
    expect(large.style?.markerSize).toBe(20);
    expect(custom.style?.markerSize).toBe(14);
  });
});
