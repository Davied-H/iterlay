import { isBoardVideoNode, type BoardConnection, type BoardNode } from "./types.js";

export function pendingVideoJobId(generationNodeId: string): string {
  return `pending-${generationNodeId}`;
}

/** Promote the immediate placeholder and repair duplicates left by older clients. */
export function reconcileVideoGenerationPlaceholder(
  nodes: BoardNode[],
  connections: BoardConnection[],
  generationNodeId: string,
  jobId: string
): { nodes: BoardNode[]; connections: BoardConnection[]; changed: boolean } {
  const outputId = `video-output-${jobId}`;
  const pendingJob = pendingVideoJobId(generationNodeId);
  const pendingId = `video-output-${pendingJob}`;
  const candidates = nodes.filter((node) => {
    if (!isBoardVideoNode(node)) return false;
    if (node.id === outputId) return true;
    if (jobId.startsWith("pending-") || node.videoPath) return false;
    const isPending = node.id === pendingId || node.id === "video-output-pending-"
      || node.jobId === pendingJob || node.jobId === "pending-";
    if (!isPending) return false;
    if (node.generationNodeId) return node.generationNodeId === generationNodeId;
    return node.id === pendingId || connections.some((connection) => (
      connection.source === generationNodeId && connection.target === node.id
    ));
  });
  if (candidates.length === 0) return { nodes, connections, changed: false };

  // A persisted result may arrive before the submit response. Keep its media,
  // versions and position when the temporary card catches up.
  const canonical = candidates.filter((node) => node.id === outputId);
  const retained = canonical.find((node) => isBoardVideoNode(node) && node.videoPath)
    ?? canonical[0] ?? candidates[0];
  const output = isBoardVideoNode(retained) && (retained.id !== outputId || retained.jobId !== jobId)
    ? { ...retained, id: outputId, jobId, generationNodeId }
    : retained;
  const candidateIds = new Set(candidates.map((node) => node.id));
  const candidateNodes = new Set(candidates);
  const nodesChanged = candidates.length > 1 || output !== retained;
  let nextNodes = nodes;
  if (nodesChanged) {
    let inserted = false;
    nextNodes = nodes.flatMap((node) => {
      if (!candidateNodes.has(node)) return [node];
      if (inserted) return [];
      inserted = true;
      return [output];
    });
  }

  let connectionsChanged = false;
  const seen = new Set<string>();
  const nextConnections = connections.flatMap((connection) => {
    if (!candidateIds.has(connection.source) && !candidateIds.has(connection.target)) return [connection];
    const source = candidateIds.has(connection.source) ? outputId : connection.source;
    const target = candidateIds.has(connection.target) ? outputId : connection.target;
    if (source === target && connection.source !== connection.target) {
      connectionsChanged = true;
      return [];
    }
    const key = JSON.stringify([
      source, target, connection.kind, connection.sourceHandle, connection.targetHandle, connection.versionBinding
    ]);
    if (seen.has(key)) {
      connectionsChanged = true;
      return [];
    }
    seen.add(key);
    if (source === connection.source && target === connection.target) return [connection];
    connectionsChanged = true;
    return [{ ...connection, source, target }];
  });
  return {
    nodes: nextNodes,
    connections: connectionsChanged ? nextConnections : connections,
    changed: nodesChanged || connectionsChanged
  };
}
