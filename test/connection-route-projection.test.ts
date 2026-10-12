import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import {
  buildConnectionRouteDescriptors,
  migrateLegacyConnectionEdges,
  projectConnectionEdges
} from "@/components/canvas/connection-route-projection";
import type { ConnectionRouteDescriptor } from "@/components/canvas/ConnectionController";

function node(id: string, x: number, y = 0): Node {
  return {
    id,
    type: "imageNode",
    position: { x, y },
    width: 264,
    height: 160,
    data: {}
  };
}

function edge(id: string, source = "source", target = "target"): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: "source-right",
    targetHandle: "target-left",
    data: {
      sourceAnchor: { side: "right", ratio: 0.5, mode: "auto" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "auto" },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    }
  };
}

function descriptors(
  nodes: readonly Node[],
  edges: readonly Edge[],
  draggingNodeIds: ReadonlySet<string> = new Set(),
  settledDescriptors: ReadonlyMap<string, ConnectionRouteDescriptor> = new Map(),
  zoom = 1
): ConnectionRouteDescriptor[] {
  return buildConnectionRouteDescriptors({ nodes, edges, zoom, draggingNodeIds, settledDescriptors });
}

describe("connection route projection", () => {
  it("omits connections with missing endpoints and keeps endpoints on node edges", () => {
    const result = descriptors(
      [node("source", 20), node("target", 500)],
      [edge("valid"), edge("missing", "source", "unknown")]
    );

    expect(result).toHaveLength(1);
    expect(result[0].source).toMatchObject({ x: 284, side: "right" });
    expect(result[0].target).toMatchObject({ x: 500, side: "left" });
  });

  it.each([
    ["target-start-frame", 126],
    ["target-end-frame", 169],
    ["target-reference", 212],
    ["target-video-reference", 255]
  ])("routes %s to the exact video generation handle", (targetHandle, offsetY) => {
    const sourceType = targetHandle === "target-video-reference" ? "videoNode" : "imageNode";
    const source: Node = { ...node("source", 20), type: sourceType };
    const target: Node = {
      id: "target",
      type: "videoGenerationNode",
      position: { x: 500, y: 40 },
      width: 340,
      height: 596,
      data: {}
    };
    const semanticEdge = edge("semantic");
    semanticEdge.targetHandle = targetHandle;
    semanticEdge.data = {
      ...semanticEdge.data,
      kind: "reference",
      targetAnchor: { side: "top", ratio: 0.5, mode: "auto" }
    };

    const [descriptor] = descriptors([source, target], [semanticEdge]);

    expect(descriptor.target).toMatchObject({ x: 500, y: 40 + offsetY, side: "left" });
  });

  it("includes obstacle topology only for automatic orthogonal routes", () => {
    const source = node("source", 0);
    const target = node("target", 700);
    const blocker = node("blocker", 350, 260);
    const orthogonal = edge("orthogonal");
    orthogonal.data = {
      ...orthogonal.data,
      routing: { mode: "auto", kind: "orthogonal", waypoints: [] }
    };
    const curved = edge("curved");
    const initial = descriptors([source, target, blocker], [orthogonal, curved]);
    const moved = descriptors([{ ...blocker, position: { x: 360, y: 260 } }, source, target], [orthogonal, curved]);

    expect(moved[0].signature).not.toBe(initial[0].signature);
    expect(moved[1].signature).toBe(initial[1].signature);
  });

  it("fans automatic reference targets out deterministically without persisting anchors", () => {
    const first = edge("reference-a");
    const second = edge("reference-b");
    first.data = { ...first.data, kind: "reference" };
    second.data = { ...second.data, kind: "reference" };
    const nodes = [node("source", 0), node("target", 700)];

    const ordered = descriptors(nodes, [first, second]);
    const reversed = descriptors(nodes, [second, first]);
    const orderedTargets = new Map(ordered.map((descriptor) => [descriptor.edge.id, descriptor.target]));
    const reversedTargets = new Map(reversed.map((descriptor) => [descriptor.edge.id, descriptor.target]));

    expect(orderedTargets.get("reference-a")?.y).toBe(71);
    expect(orderedTargets.get("reference-b")?.y).toBe(89);
    expect(reversedTargets).toEqual(orderedTargets);
    expect(Math.abs(ordered[1].target.y - ordered[0].target.y)).toBeGreaterThanOrEqual(18);
    expect(first.data?.targetAnchor).toMatchObject({ ratio: 0.5, mode: "auto" });
    expect(second.data?.targetAnchor).toMatchObject({ ratio: 0.5, mode: "auto" });
  });

  it.each([0.5, 1, 2])("keeps automatic reference fan-out at 18 screen pixels at %sx zoom", (zoom) => {
    const first = edge("reference-a");
    const second = edge("reference-b");
    first.data = { ...first.data, kind: "reference" };
    second.data = { ...second.data, kind: "reference" };

    const result = descriptors(
      [node("source", 0), node("target", 700)],
      [first, second],
      new Set(),
      new Map(),
      zoom
    );
    expect(Math.abs(result[1].target.y - result[0].target.y) * zoom).toBeCloseTo(18, 5);
  });

  it.each([0.5, 1, 2])("fans an automatic target away from a pinned manual target at %sx zoom", (zoom) => {
    const automatic = edge("automatic");
    const fixed = edge("fixed");
    automatic.data = { ...automatic.data, kind: "reference" };
    fixed.data = {
      ...fixed.data,
      kind: "reference",
      targetAnchor: { side: "left", ratio: 0.52, mode: "pinned" },
      routing: { mode: "manual", kind: "curved", waypoints: [{ id: "bend", x: 500, y: 80 }] }
    };
    const nodes = [node("source", 0), node("target", 700)];

    const projected = descriptors(nodes, [automatic, fixed], new Set(), new Map(), zoom);
    const reversed = descriptors(nodes, [fixed, automatic], new Set(), new Map(), zoom);
    const targetById = new Map(projected.map((descriptor) => [descriptor.edge.id, descriptor.target]));
    const reversedTargetById = new Map(reversed.map((descriptor) => [descriptor.edge.id, descriptor.target]));

    expect(targetById.get("fixed")).toMatchObject({ x: 700, y: 83.2 });
    expect(targetById.get("automatic")?.x).toBe(700);
    expect(Math.abs(targetById.get("automatic")!.y - targetById.get("fixed")!.y) * zoom).toBeCloseTo(18, 5);
    expect(reversedTargetById).toEqual(targetById);
    expect(fixed.data?.targetAnchor).toMatchObject({ ratio: 0.52, mode: "pinned" });
    expect(fixed.data?.routing).toMatchObject({ mode: "manual", waypoints: [{ id: "bend", x: 500, y: 80 }] });
  });

  it("keeps fan-out coordinates inside a short target side at minimum zoom", () => {
    const first = edge("reference-a");
    const second = edge("reference-b");
    first.data = { ...first.data, kind: "reference" };
    second.data = { ...second.data, kind: "reference" };

    const result = descriptors(
      [node("source", 0), { ...node("target", 700), height: 20 }],
      [first, second],
      new Set(),
      new Map(),
      0.05
    );

    expect(result.map((descriptor) => descriptor.target.y)).toEqual([10, 10]);
  });

  it("keeps pinned and manually routed targets fixed when no automatic target can move", () => {
    const pinned = edge("pinned");
    const manual = edge("manual");
    pinned.data = {
      ...pinned.data,
      kind: "reference",
      targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" }
    };
    manual.data = {
      ...manual.data,
      kind: "reference",
      routing: { mode: "manual", kind: "curved", waypoints: [{ id: "bend", x: 500, y: 80 }] }
    };

    const result = descriptors([node("source", 0), node("target", 700)], [pinned, manual]);
    expect(result.map((descriptor) => descriptor.target.y)).toEqual([80, 80]);
  });

  it("reuses settled descriptors for connections unrelated to an active node drag", () => {
    const nodes = [node("source", 0), node("target", 700), node("dragged", 350, 300)];
    const connection = edge("connection");
    const settled = descriptors(nodes, [connection])[0];
    const movedNodes = nodes.map((item) => item.id === "source"
      ? { ...item, position: { x: 40, y: 0 } }
      : item
    );
    const result = descriptors(
      movedNodes,
      [connection],
      new Set(["dragged"]),
      new Map([[connection.id, settled]])
    );

    expect(result[0].source).toEqual(settled.source);
    expect(result[0].route).toBe(settled.route);
    expect(result[0].edge).toBe(connection);
  });

  it("migrates legacy routing and labels once", () => {
    const legacy = edge("legacy");
    legacy.data = {
      routeCoordinate: 300,
      label: "Legacy",
      labelPosition: { x: 390, y: 80 }
    };
    const routeDescriptors = descriptors([node("source", 0), node("target", 700)], [legacy]);
    const first = migrateLegacyConnectionEdges([legacy], routeDescriptors);

    expect(first.changed).toBe(true);
    expect(first.edges[0].data).toMatchObject({
      routing: expect.objectContaining({ waypoints: expect.any(Array) }),
      labelAnchor: expect.objectContaining({ progress: expect.any(Number) })
    });
    expect(first.edges[0].data?.routeCoordinate).toBeUndefined();
    expect(first.edges[0].data?.labelPosition).toBeUndefined();

    const secondDescriptors = descriptors([node("source", 0), node("target", 700)], first.edges);
    const second = migrateLegacyConnectionEdges(first.edges, secondDescriptors);
    expect(second).toEqual({ edges: first.edges, changed: false });
  });

  it("pins existing automatic endpoints at their current visible positions", () => {
    const source = node("source", 0, 0);
    const target = node("target", 700, 20);
    const connection = edge("existing");
    const routeDescriptors = descriptors([source, target], [connection]);
    const migrated = migrateLegacyConnectionEdges(
      [connection],
      routeDescriptors,
      [source, target]
    );

    expect(routeDescriptors[0].source.y).toBe(80);
    expect(routeDescriptors[0].target.y).toBe(80);
    expect(migrated.changed).toBe(true);
    expect(migrated.edges[0].data).toMatchObject({
      sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.375, mode: "pinned" }
    });

    const pinnedDescriptors = descriptors([source, target], migrated.edges);
    expect(pinnedDescriptors[0].source).toMatchObject({ x: 264, y: 80 });
    expect(pinnedDescriptors[0].target).toMatchObject({ x: 700, y: 80 });
  });

  it("injects presentation data without mutating persisted edges", () => {
    const first = edge("first");
    const selected = { ...edge("selected"), selected: true };
    const alsoSelected = { ...edge("also-selected"), selected: true };
    const edges = [first, selected, alsoSelected];
    const routeDescriptors = descriptors([node("source", 0), node("target", 700)], edges);
    const originalData = edges.map((item) => item.data);
    const rendered = projectConnectionEdges({
      edges,
      descriptors: routeDescriptors,
      lineJumps: new Map()
    });

    expect(rendered[1].data).toMatchObject({ toolbarOwner: true, lineJumps: [] });
    expect(rendered[2].data).toMatchObject({ toolbarOwner: false, lineJumps: [] });
    expect(rendered[0].data).toHaveProperty("resolvedRoute");
    expect(edges.map((item) => item.data)).toEqual(originalData);
    expect(edges[0].data).not.toHaveProperty("resolvedRoute");
  });

  it("reuses projected edge objects until data or presentation changes", () => {
    const first = edge("first");
    const second = edge("second", "other-source", "other-target");
    const routeNodes = [
      node("source", 0),
      node("target", 700),
      node("other-source", 0, 400),
      node("other-target", 700, 400)
    ];
    const initialDescriptors = descriptors(routeNodes, [first, second]);
    const initial = projectConnectionEdges({
      edges: [first, second],
      descriptors: initialDescriptors,
      lineJumps: new Map()
    });
    const unchanged = projectConnectionEdges({
      edges: [first, second],
      descriptors: initialDescriptors,
      lineJumps: new Map(),
      previousEdges: initial
    });

    expect(unchanged[0]).toBe(initial[0]);
    expect(unchanged[1]).toBe(initial[1]);

    const movedNodes = routeNodes.map((item) => item.id === "source"
      ? { ...item, position: { x: 40, y: 0 } }
      : item);
    const movedDescriptors = descriptors(
      movedNodes,
      [first, second],
      new Set(["source"]),
      new Map(initialDescriptors.map((descriptor) => [descriptor.edge.id, descriptor]))
    );
    const moved = projectConnectionEdges({
      edges: [first, second],
      descriptors: movedDescriptors,
      lineJumps: new Map(),
      previousEdges: unchanged
    });

    expect(moved[0]).not.toBe(unchanged[0]);
    expect(moved[1]).toBe(unchanged[1]);

    const changedData = { ...second, data: { ...second.data, label: "Changed" } };
    const dataChanged = projectConnectionEdges({
      edges: [first, changedData],
      descriptors: movedDescriptors,
      lineJumps: new Map(),
      previousEdges: moved
    });
    expect(dataChanged[0]).toBe(moved[0]);
    expect(dataChanged[1]).not.toBe(moved[1]);
  });

  it.each([100, 500, 1_000])("reuses every unchanged projection across %i connected nodes", (count) => {
    const routeNodes = Array.from({ length: count }, (_, index) => (
      node("node-" + index, index * 400, (index % 5) * 200)
    ));
    const routeEdges = Array.from({ length: count - 1 }, (_, index) => (
      edge("edge-" + index, "node-" + index, "node-" + (index + 1))
    ));
    const routeDescriptors = descriptors(routeNodes, routeEdges);
    const initial = projectConnectionEdges({
      edges: routeEdges,
      descriptors: routeDescriptors,
      lineJumps: new Map()
    });
    const unchanged = projectConnectionEdges({
      edges: routeEdges,
      descriptors: routeDescriptors,
      lineJumps: new Map(),
      previousEdges: initial
    });

    expect(unchanged).toHaveLength(count - 1);
    expect(unchanged.every((projected, index) => projected === initial[index])).toBe(true);
  });

  it("updates line jumps and toolbar ownership without reallocating unrelated edges", () => {
    const first = edge("first");
    const selected = { ...edge("selected"), selected: true };
    const routeDescriptors = descriptors([node("source", 0), node("target", 700)], [first, selected]);
    const initial = projectConnectionEdges({ edges: [first, selected], descriptors: routeDescriptors, lineJumps: new Map() });
    const withJump = projectConnectionEdges({
      edges: [first, selected],
      descriptors: routeDescriptors,
      lineJumps: new Map([[first.id, [{
        id: "jump",
        point: { x: 200, y: 80 },
        orientation: "horizontal" as const
      }]]]),
      previousEdges: initial
    });

    expect(withJump[0]).not.toBe(initial[0]);
    expect(withJump[1]).toBe(initial[1]);
    expect(withJump[0].data?.lineJumps).toHaveLength(1);

    first.selected = true;
    selected.selected = false;
    const ownerChanged = projectConnectionEdges({
      edges: [first, selected],
      descriptors: routeDescriptors,
      lineJumps: new Map([[first.id, withJump[0].data?.lineJumps as never]]),
      previousEdges: withJump
    });
    expect(ownerChanged[0]).not.toBe(withJump[0]);
    expect(ownerChanged[1]).not.toBe(withJump[1]);
    expect(ownerChanged[0].data?.toolbarOwner).toBe(true);
    expect(ownerChanged[1].data?.toolbarOwner).toBe(false);
  });

  it("reuses an unchanged projected legacy label migration", () => {
    const legacy = edge("legacy");
    legacy.data = { label: "Legacy", labelPosition: { x: 390, y: 80 } };
    const routeDescriptors = descriptors([node("source", 0), node("target", 700)], [legacy]);
    const initial = projectConnectionEdges({ edges: [legacy], descriptors: routeDescriptors, lineJumps: new Map() });
    const unchanged = projectConnectionEdges({
      edges: [legacy],
      descriptors: routeDescriptors,
      lineJumps: new Map(),
      previousEdges: initial
    });

    expect(initial[0].data?.labelAnchor).toEqual(expect.objectContaining({ progress: expect.any(Number) }));
    expect(unchanged[0]).toBe(initial[0]);
    expect(legacy.data).not.toHaveProperty("labelAnchor");
  });
});
