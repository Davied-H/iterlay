import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  applyCanvasCommand,
  applyCanvasCommands,
  type CanvasCommandState
} from "@/components/canvas/canvas-commands";

function node(id: string, selected = false): Node {
  return { id, position: { x: 0, y: 0 }, data: { label: id }, selected };
}

function edge(id: string, source: string, target: string, selected = false): Edge {
  return { id, source, target, selected };
}

describe("canvas commands", () => {
  it("adds and updates a node without mutating the previous state", () => {
    const initial: CanvasCommandState = { nodes: [node("a")], edges: [] };
    const result = applyCanvasCommands(initial, [
      { type: "add", node: node("b") },
      { type: "update", id: "b", patch: { position: { x: 20, y: 30 }, data: { title: "B" } } }
    ]);

    expect(initial.nodes).toHaveLength(1);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({
      id: "b",
      position: { x: 20, y: 30 },
      data: { label: "b", title: "B" }
    });
  });

  it("deletes incident edges with their nodes", () => {
    const initial = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("ab", "a", "b"), edge("bc", "b", "c")]
    };

    expect(applyCanvasCommand(initial, { type: "delete", ids: ["b"] })).toEqual({
      nodes: [node("a"), node("c")],
      edges: []
    });
  });

  it("only connects existing distinct nodes and rejects duplicate endpoints", () => {
    const initial = { nodes: [node("a"), node("b")], edges: [] };
    const connected = applyCanvasCommand(initial, {
      type: "connect",
      edge: edge("ab", "a", "b")
    });

    expect(connected.edges).toEqual([edge("ab", "a", "b")]);
    expect(applyCanvasCommand(connected, {
      type: "connect",
      edge: edge("duplicate", "a", "b")
    })).toBe(connected);
    const nullableHandleDuplicate = applyCanvasCommand({
      ...connected,
      edges: [{ ...connected.edges[0], sourceHandle: undefined, targetHandle: undefined }]
    }, {
      type: "connect",
      edge: { ...edge("nullable-duplicate", "a", "b"), sourceHandle: null, targetHandle: null }
    });
    expect(nullableHandleDuplicate.edges).toHaveLength(1);
    expect(applyCanvasCommand(initial, {
      type: "connect",
      edge: edge("missing", "a", "missing")
    })).toBe(initial);
  });

  it("supports replace, additive and toggle selection", () => {
    const initial = {
      nodes: [node("a", true), node("b")],
      edges: [edge("ab", "a", "b", true)]
    };
    const replaced = applyCanvasCommand(initial, {
      type: "select",
      nodeIds: ["b"]
    });
    expect(replaced.nodes.map((item) => item.selected)).toEqual([false, true]);
    expect(replaced.edges[0]?.selected).toBe(false);

    const added = applyCanvasCommand(replaced, {
      type: "select",
      nodeIds: ["a"],
      edgeIds: ["ab"],
      mode: "add"
    });
    expect(added.nodes.map((item) => item.selected)).toEqual([true, true]);
    expect(added.edges[0]?.selected).toBe(true);

    const toggled = applyCanvasCommand(added, {
      type: "select",
      nodeIds: ["b"],
      edgeIds: ["ab"],
      mode: "toggle"
    });
    expect(toggled.nodes.map((item) => item.selected)).toEqual([true, false]);
    expect(toggled.edges[0]?.selected).toBe(false);
  });
});
