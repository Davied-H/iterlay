import type { BoardConnection, BoardData, BoardNode, BoardSavePayload } from "./types.js";

function equal(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

/** Apply only local changes since the observed snapshot; preserve remote additions. */
function mergeItems<T extends { id: string }>(base: readonly T[], local: readonly T[], remote: readonly T[]): T[] {
  const original = new Map(base.map((item) => [item.id, item]));
  const incoming = new Map(local.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const item of remote) {
    const before = original.get(item.id);
    const current = incoming.get(item.id);
    if (!current) {
      // Local deletion removes an observed item; unseen remote additions survive.
      if (!before) result.push(item);
      continue;
    }
    incoming.delete(item.id);
    if (!before) { result.push(item); continue; }
    const merged = { ...item };
    for (const key of new Set([...Object.keys(before), ...Object.keys(current)]) as Set<keyof T>) {
      if (!equal(before[key], current[key])) merged[key] = current[key];
    }
    result.push(merged);
  }
  // Do not resurrect an observed node removed remotely; retain genuinely new nodes.
  for (const item of incoming.values()) if (!original.has(item.id)) result.push(item);
  return result;
}

export function rebaseBoardSnapshot(base: BoardData, local: BoardSavePayload, remote: BoardData): BoardSavePayload {
  const mediaKey = (node: BoardNode): string | null => "imagePath" in node && node.imagePath
    ? "image:" + node.jobId + ":" + node.imagePath
    : "videoPath" in node && node.videoPath ? "video:" + node.jobId + ":" + node.videoPath : null;
  const observedIds = new Set(base.nodes.map((node) => node.id));
  const observedMedia = new Set(base.nodes.map(mediaKey).filter(Boolean));
  const localOutputs = new Map<string, BoardNode[]>();
  for (const node of local.nodes ?? []) {
    const key = mediaKey(node);
    if (!key || observedIds.has(node.id) || observedMedia.has(key) || !("source" in node) || node.source !== "generated") continue;
    const candidates = localOutputs.get(key) ?? [];
    candidates.push(node);
    localOutputs.set(key, candidates);
  }
  const remappedIds = new Map<string, string>();
  const matchedOutputs = new Set<string>();
  const remoteNodes = remote.nodes.map((node) => {
    const key = mediaKey(node);
    if (!key || observedIds.has(node.id) || !("source" in node) || node.source !== "generated") return node;
    const counterpart = localOutputs.get(key)?.shift();
    if (!counterpart) return node;
    // Main-process persistence and renderer placeholders describe one generated output.
    remappedIds.set(node.id, counterpart.id);
    matchedOutputs.add(counterpart.id);
    return { ...node, ...Object.fromEntries(Object.entries(counterpart).filter(([, value]) => value !== undefined)) } as BoardNode;
  });
  const nodes = mergeItems<BoardNode>(base.nodes, local.nodes ?? base.nodes, remoteNodes);
  const ids = new Set(nodes.map((node) => node.id));
  const remoteConnections = (remote.connections ?? []).map((connection) => ({ ...connection,
    source: remappedIds.get(connection.source) ?? connection.source, target: remappedIds.get(connection.target) ?? connection.target
  }));
  const mergedConnections = mergeItems<BoardConnection>(base.connections ?? [], local.connections ?? base.connections ?? [], remoteConnections)
    .filter((connection) => ids.has(connection.source) && ids.has(connection.target));
  const connections: BoardConnection[] = [];
  const outputEdges = new Map<string, number>();
  const localEdgeIds = new Set((local.connections ?? []).map((edge) => edge.id));
  for (const connection of mergedConnections) {
    if (!matchedOutputs.has(connection.source) && !matchedOutputs.has(connection.target)) { connections.push(connection); continue; }
    // Renderer placeholders use system ports; persisted outputs use canvas ports.
    const sourceHandle = connection.sourceHandle === "system-output" ? "source-right" : connection.sourceHandle;
    const targetHandle = connection.targetHandle === "system-input" ? "target-left" : connection.targetHandle;
    const key = [connection.kind ?? "visual", connection.source, connection.target, sourceHandle ?? "", targetHandle ?? ""].join(":");
    const existing = outputEdges.get(key);
    if (existing !== undefined) { if (localEdgeIds.has(connection.id)) connections[existing] = connection; }
    else { outputEdges.set(key, connections.length); connections.push(connection); }
  }
  return {
    ...local, expectedRevision: remote.revision ?? 0, nodes, connections,
    name: local.name === base.name ? remote.name : local.name,
    viewport: equal(local.viewport, base.viewport) ? remote.viewport : local.viewport,
    thumbnailDataUrl: local.thumbnailDataUrl === base.thumbnailDataUrl ? remote.thumbnailDataUrl : local.thumbnailDataUrl
  };
}
