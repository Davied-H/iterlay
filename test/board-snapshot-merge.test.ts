import { describe, expect, it } from "vitest";
import type { BoardData, BoardNodeSnapshot } from "../shared/types";
import { rebaseBoardSnapshot } from "../shared/board-snapshot-merge";
const node = (id: string, x = 0): BoardNodeSnapshot => ({ id, type: "image", imagePath: id + ".png", jobId: id, source: "generated", x, y: 0 });
const board = (nodes: BoardNodeSnapshot[], revision = 1): BoardData & { nodes: BoardNodeSnapshot[] } => ({ id: "board", schemaVersion: 3, revision, name: "Board", createdAt: "", updatedAt: "", nodes });
describe("concurrent renderer and agent board changes", () => {
  it("keeps generated nodes and unrelated remote edits while applying local layout", () => {
    const base = board([node("one"), node("two")]);
    const local = { id: "board", nodes: [node("one", 100), node("two")] };
    const remote = board([node("one"), node("two", 200), node("output")], 2);
    const rebased = rebaseBoardSnapshot(base, local, remote);
    expect(rebased.expectedRevision).toBe(2);
    expect(rebased.nodes?.map((n) => [n.id, n.x])).toEqual([["one", 100], ["two", 200], ["output", 0]]);
  });
  it("retains local deletions without resurrecting remote deletions", () => {
    const base = board([node("one"), node("two")]);
    const remote = board([node("two"), node("remote")], 2);
    const rebased = rebaseBoardSnapshot(base, { id: "board", nodes: [node("one"), node("local")] }, remote);
    expect(rebased.nodes?.map((n) => n.id)).toEqual(["remote", "local"]);
  });
  it("reconciles a main-process output with its renderer placeholder identity", () => {
    const base = board([node("generation")]);
    const client = { ...node("client-output", 200), imagePath: "result.png", jobId: "new-job" };
    const server = { ...node("server-output", 100), imagePath: "result.png", jobId: "new-job" };
    const local = { id: "board", nodes: [...base.nodes, client], connections: [{ id: "client-edge", source: "generation", target: client.id, sourceHandle: "system-output", targetHandle: "system-input" }] };
    const remote = { ...board([...base.nodes, server], 2), connections: [{ id: "server-edge", source: "generation", target: server.id, sourceHandle: "source-right", targetHandle: "target-left" }] };
    const merged = rebaseBoardSnapshot(base, local, remote);
    expect(merged.nodes?.map((n) => n.id)).toEqual(["generation", "client-output"]);
    expect(merged.connections).toHaveLength(1);
    expect(merged.connections?.[0].target).toBe("client-output");
  });
  it("preserves intentional independent copies of an already observed image", () => {
    const original = node("original");
    const base = board([original]);
    const local = { id: "board", nodes: [original, { ...original, id: "local-copy" }] };
    const remote = board([original, { ...original, id: "remote-copy" }], 2);
    expect(rebaseBoardSnapshot(base, local, remote).nodes).toHaveLength(3);
  });

});
