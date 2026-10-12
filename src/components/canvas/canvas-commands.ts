import type { Edge, Node } from "@xyflow/react";

export interface CanvasCommandState {
  nodes: Node[];
  edges: Edge[];
}

export type CanvasSelectionMode = "replace" | "add" | "toggle";

export type CanvasCommand =
  | { type: "add"; node: Node }
  | { type: "update"; id: string; patch: Partial<Omit<Node, "id">> }
  | { type: "delete"; ids: readonly string[] }
  | { type: "connect"; edge: Edge }
  | {
      type: "select";
      nodeIds: readonly string[];
      edgeIds?: readonly string[];
      mode?: CanvasSelectionMode;
    };

/** Applies one canvas mutation without mutating the supplied state. */
export function applyCanvasCommand(
  state: CanvasCommandState,
  command: CanvasCommand
): CanvasCommandState {
  switch (command.type) {
    case "add":
      if (state.nodes.some((node) => node.id === command.node.id)) return state;
      return { ...state, nodes: [...state.nodes, command.node] };
    case "update":
      return updateNode(state, command.id, command.patch);
    case "delete":
      return deleteNodes(state, command.ids);
    case "connect":
      return connectNodes(state, command.edge);
    case "select":
      return selectCanvasItems(state, command);
  }
}

export function applyCanvasCommands(
  state: CanvasCommandState,
  commands: readonly CanvasCommand[]
): CanvasCommandState {
  return commands.reduce(applyCanvasCommand, state);
}

function updateNode(
  state: CanvasCommandState,
  id: string,
  patch: Partial<Omit<Node, "id">>
): CanvasCommandState {
  const index = state.nodes.findIndex((node) => node.id === id);
  if (index < 0) return state;
  const current = state.nodes[index];
  const next = {
    ...current,
    ...patch,
    ...(patch.data ? { data: { ...current.data, ...patch.data } } : {})
  } as Node;
  const nodes = state.nodes.slice();
  nodes[index] = next;
  return { ...state, nodes };
}

function deleteNodes(state: CanvasCommandState, ids: readonly string[]): CanvasCommandState {
  const targets = new Set(ids);
  if (!targets.size || !state.nodes.some((node) => targets.has(node.id))) return state;
  return {
    nodes: state.nodes.filter((node) => !targets.has(node.id)),
    edges: state.edges.filter(
      (edge) => !targets.has(edge.source) && !targets.has(edge.target)
    )
  };
}

function connectNodes(state: CanvasCommandState, edge: Edge): CanvasCommandState {
  if (
    edge.source === edge.target
    || !state.nodes.some((node) => node.id === edge.source)
    || !state.nodes.some((node) => node.id === edge.target)
    || state.edges.some((existing) => existing.id === edge.id || sameEndpoints(existing, edge))
  ) return state;
  return { ...state, edges: [...state.edges, edge] };
}

function sameEndpoints(left: Edge, right: Edge): boolean {
  return left.source === right.source
    && left.target === right.target
    && (left.sourceHandle ?? null) === (right.sourceHandle ?? null)
    && (left.targetHandle ?? null) === (right.targetHandle ?? null);
}

function selectCanvasItems(
  state: CanvasCommandState,
  command: Extract<CanvasCommand, { type: "select" }>
): CanvasCommandState {
  const nodeIds = new Set(command.nodeIds);
  const edgeIds = new Set(command.edgeIds ?? []);
  const mode = command.mode ?? "replace";
  let changed = false;

  const nodes = state.nodes.map((node) => {
    const selected = nextSelected(Boolean(node.selected), nodeIds.has(node.id), mode);
    if (selected === Boolean(node.selected)) return node;
    changed = true;
    return { ...node, selected };
  });
  const edges = state.edges.map((edge) => {
    const selected = nextSelected(Boolean(edge.selected), edgeIds.has(edge.id), mode);
    if (selected === Boolean(edge.selected)) return edge;
    changed = true;
    return { ...edge, selected };
  });
  return changed ? { nodes, edges } : state;
}

function nextSelected(current: boolean, targeted: boolean, mode: CanvasSelectionMode): boolean {
  if (mode === "add") return current || targeted;
  if (mode === "toggle") return targeted ? !current : current;
  return targeted;
}
