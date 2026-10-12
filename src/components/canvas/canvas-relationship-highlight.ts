import type { Edge, Node } from "@xyflow/react";

export interface CanvasRelationshipHighlight {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

export function canvasRelationshipClass(
  id: string,
  relatedIds: ReadonlySet<string>,
  enabled: boolean,
  preserve = false
): "canvas-relationship-highlighted" | "canvas-relationship-dimmed" | undefined {
  if (!enabled || preserve) return undefined;
  return relatedIds.has(id) ? "canvas-relationship-highlighted" : "canvas-relationship-dimmed";
}

/** Returns the active node and its directly connected upstream/downstream neighborhood. */
export function resolveCanvasRelationshipHighlight(
  activeNodeId: string | null | undefined,
  nodes: readonly Node[],
  edges: readonly Edge[]
): CanvasRelationshipHighlight {
  if (!activeNodeId || !nodes.some((node) => node.id === activeNodeId)) {
    return { nodeIds: new Set(), edgeIds: new Set() };
  }
  const nodeIds = new Set([activeNodeId]);
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.source !== activeNodeId && edge.target !== activeNodeId) continue;
    edgeIds.add(edge.id);
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }
  return { nodeIds, edgeIds };
}
