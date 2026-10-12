import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  canvasRelationshipClass,
  resolveCanvasRelationshipHighlight
} from "@/components/canvas/canvas-relationship-highlight";

const nodes = ["a", "b", "c", "d"].map((id): Node => ({ id, position: { x: 0, y: 0 }, data: {} }));
const edges: Edge[] = [
  { id: "ab", source: "a", target: "b" },
  { id: "bc", source: "b", target: "c" },
  { id: "cd", source: "c", target: "d" }
];

describe("canvas relationship highlight", () => {
  it("includes only the active node and its one-hop neighbors", () => {
    const result = resolveCanvasRelationshipHighlight("b", nodes, edges);
    expect([...result.nodeIds]).toEqual(["b", "a", "c"]);
    expect([...result.edgeIds]).toEqual(["ab", "bc"]);
  });

  it("returns an empty highlight for a missing active node", () => {
    const result = resolveCanvasRelationshipHighlight("missing", nodes, edges);
    expect(result.nodeIds.size).toBe(0);
    expect(result.edgeIds.size).toBe(0);
  });

  it("keeps a selected connection visible while another relationship is active", () => {
    const result = resolveCanvasRelationshipHighlight("a", nodes, edges);
    expect(canvasRelationshipClass("cd", result.edgeIds, true)).toBe("canvas-relationship-dimmed");
    expect(canvasRelationshipClass("cd", result.edgeIds, true, true)).toBeUndefined();
  });
});
