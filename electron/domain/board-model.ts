import path from "node:path";
import {
  isBoardImageNode,
  isBoardGenerationNode,
  isBoardVideoGenerationNode,
  isBoardVideoNode,
  normalizeBoardConnection,
  normalizeBoardNode,
  type BoardConnection,
  type BoardData,
  type BoardNode,
  type BoardNodeSnapshot,
  type BoardVideoNode,
  type BoardVideoVersion,
  type BoardSummary,
  type BoardTrashRetentionDays,
  type TrashedBoardSummary
} from "../../shared/types.js";
import {
  isBoardComicDramaEntryNode,
  isBoardVideoSequenceEntryNode,
  isComicDramaNode,
  normalizeBoardGroup,
  normalizeComicDramaNode,
  type BoardMutationPlan,
  type ComicDramaBoardNode,
  type ComicDramaBoardSnapshot
} from "../../shared/comic-drama.js";

import { layoutGenerationOutputColumn } from "../../shared/generation-output-layout.js";

export const DEFAULT_IMAGE_NODE_WIDTH = 264;

export interface TrashedBoardRecord {
  board: BoardData;
  deletedAt: string;
}

export function sanitizeBoardId(id: string): string {
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,200}$/u.test(id)) throw new Error("画板 ID 无效。");
  return id;
}

export function appendVideoNodeVersions(node: BoardVideoNode, versions: BoardVideoVersion[]): BoardVideoNode {
  const base: BoardVideoVersion[] = node.versions ?? [{
    videoPath: node.videoPath,
    posterPath: node.posterPath,
    jobId: node.jobId,
    mimeType: node.mimeType,
    width: node.width,
    height: node.height,
    durationMs: node.durationMs
  }];
  const seenJobIds = new Set(base.map((version) => version.jobId));
  const seenPaths = new Set(base.map((version) => version.videoPath));
  const additions = versions.filter((version) => {
    if (seenJobIds.has(version.jobId) || seenPaths.has(version.videoPath)) return false;
    seenJobIds.add(version.jobId);
    seenPaths.add(version.videoPath);
    return true;
  });
  if (additions.length === 0) return node;
  const all = [...base, ...additions];
  const active = all[all.length - 1];
  return {
    ...node,
    videoPath: active.videoPath,
    posterPath: active.posterPath,
    jobId: active.jobId,
    mimeType: active.mimeType,
    width: active.width,
    height: active.height,
    durationMs: active.durationMs,
    versions: all,
    activeVersion: all.length - 1
  };
}

export function isManagedBoardNode(node: BoardNode): node is ComicDramaBoardSnapshot["nodes"][number] {
  return isComicDramaNode(node) || isBoardVideoSequenceEntryNode(node);
}

export function isPreservedWorkflowNode(node: BoardNode): boolean {
  return isManagedBoardNode(node) || isBoardComicDramaEntryNode(node);
}

export function mergeManagedNodes(current: BoardNode[], incoming: BoardNode[], replaceManagedNodes = false): BoardNode[] {
  if (replaceManagedNodes || incoming.some(isPreservedWorkflowNode)) return incoming;
  return [...incoming, ...current.filter(isPreservedWorkflowNode)];
}

export function mergeManagedConnections(currentNodes: BoardNode[], current: BoardConnection[], incoming: BoardConnection[], replaceManagedNodes = false): BoardConnection[] {
  if (replaceManagedNodes || incoming.some((connection) => connection.versionBinding)) return incoming;
  const managedIds = new Set(currentNodes.filter(isPreservedWorkflowNode).map((node) => node.id));
  const retained = current.filter((connection) => managedIds.has(connection.source) || managedIds.has(connection.target));
  const incomingIds = new Set(incoming.map((connection) => connection.id));
  return [...incoming, ...retained.filter((connection) => !incomingIds.has(connection.id))];
}

export function boardConnectionKey(connection: BoardConnection): string {
  return `${connection.kind ?? "visual"}:${connection.source}:${connection.target}:${connection.sourceHandle ?? ""}:${connection.targetHandle ?? ""}`;
}

export function assertAcyclicReferenceConnections(connections: BoardConnection[]): void {
  const outgoing = new Map<string, string[]>();
  for (const connection of connections) {
    if (connection.kind !== "reference") continue;
    outgoing.set(connection.source, [...(outgoing.get(connection.source) ?? []), connection.target]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new Error("引用连接不能形成环。");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) visit(target);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of outgoing.keys()) visit(nodeId);
}

export function prepareBoardMutationPlan(plan: BoardMutationPlan, board: BoardData): {
  nodes: BoardNode[];
  updatedNodes: ComicDramaBoardNode[];
  connections: BoardConnection[];
  groups: NonNullable<BoardData["groups"]>;
} {
  if (!plan || typeof plan.planId !== "string" || !plan.planId.trim() || plan.boardId !== board.id || !plan.additions) {
    throw new Error("漫剧助手计划无效。");
  }
  const rawNodes = Array.isArray(plan.additions.nodes) ? plan.additions.nodes : [];
  const nodes = rawNodes.map(normalizeBoardNode);
  if (nodes.some((node) => !node)) throw new Error("计划包含无效节点。");
  const normalizedNodes = nodes as BoardNode[];
  const updatedNodes = (Array.isArray(plan.updates?.nodes) ? plan.updates.nodes : []).map(normalizeComicDramaNode);
  if (updatedNodes.some((node) => !node)) throw new Error("计划包含无效的节点更新。");
  const normalizedUpdatedNodes = updatedNodes as ComicDramaBoardNode[];
  const connections = (Array.isArray(plan.additions.connections) ? plan.additions.connections : []).map(normalizeBoardConnection);
  if (connections.some((connection) => !connection)) throw new Error("计划包含无效连接。");
  const normalizedConnections = connections as BoardConnection[];
  const groups = (Array.isArray(plan.additions.groups) ? plan.additions.groups : []).map(normalizeBoardGroup);
  if (groups.some((group) => !group)) throw new Error("计划包含无效片段分组。");
  const normalizedGroups = groups as NonNullable<BoardData["groups"]>;
  const nodeIds = new Set(board.nodes.map((node) => node.id));
  const currentNodes = new Map(board.nodes.map((node) => [node.id, node]));
  const connectionIds = new Set((board.connections ?? []).map((connection) => connection.id));
  const connectionKeys = new Set((board.connections ?? []).map(boardConnectionKey));
  const groupIds = new Set((board.groups ?? []).map((group) => group.id));
  for (const node of normalizedNodes) {
    if (nodeIds.has(node.id)) throw new Error(`节点 ID 已存在：${node.id}`);
    nodeIds.add(node.id);
  }
  const updatedNodeIds = new Set<string>();
  for (const node of normalizedUpdatedNodes) {
    const currentNode = currentNodes.get(node.id);
    if (!currentNode || !isComicDramaNode(currentNode) || currentNode.type !== node.type) {
      throw new Error(`要更新的漫剧节点不存在或类型不匹配：${node.id}`);
    }
    if (updatedNodeIds.has(node.id)) throw new Error(`重复更新节点：${node.id}`);
    updatedNodeIds.add(node.id);
  }
  for (const connection of normalizedConnections) {
    if (connectionIds.has(connection.id)) throw new Error(`连接 ID 已存在：${connection.id}`);
    if (!nodeIds.has(connection.source) || !nodeIds.has(connection.target)) throw new Error(`连接端点不存在：${connection.id}`);
    const connectionKey = boardConnectionKey(connection);
    if (connectionKeys.has(connectionKey)) throw new Error(`重复连接：${connection.id}`);
    if (connection.source === connection.target) throw new Error(`禁止节点自连：${connection.id}`);
    connectionIds.add(connection.id);
    connectionKeys.add(connectionKey);
  }
  const allNodes = new Map([...board.nodes, ...normalizedNodes].map((node) => [node.id, node]));
  for (const connection of normalizedConnections) {
    const binding = connection.versionBinding;
    if (connection.kind !== "reference" || binding?.mode !== "pinned") continue;
    const source = allNodes.get(connection.source);
    if (source && isComicDramaNode(source)
      && !source.versions.some((version) => version.versionId === binding.versionId)) {
      throw new Error(`固定版本缺失：${connection.source}/${binding.versionId}`);
    }
  }
  assertAcyclicReferenceConnections([...(board.connections ?? []), ...normalizedConnections]);
  for (const group of normalizedGroups) {
    if (groupIds.has(group.id)) throw new Error(`片段分组 ID 已存在：${group.id}`);
    if (group.nodeIds.some((nodeId) => !nodeIds.has(nodeId))) throw new Error(`片段分组包含不存在的节点：${group.id}`);
    groupIds.add(group.id);
  }
  if (!plan.preview || plan.preview.additions.nodes !== normalizedNodes.length
    || plan.preview.additions.connections !== normalizedConnections.length
    || plan.preview.additions.groups !== normalizedGroups.length
    || (plan.preview.updates?.nodes ?? 0) !== normalizedUpdatedNodes.length) throw new Error("预览数量与计划内容不一致。");
  return {
    nodes: normalizedNodes,
    updatedNodes: normalizedUpdatedNodes,
    connections: normalizedConnections,
    groups: normalizedGroups
  };
}

export function cloneBoard(board: BoardData): BoardData {
  return structuredClone(board);
}

export function uniqueNodeIds(nodeIds: string[]): string[] {
  return [...new Set(nodeIds.filter((nodeId) => typeof nodeId === "string" && Boolean(nodeId.trim())))];
}

export function requireImageNode(nodes: BoardNode[], nodeId: string): BoardNodeSnapshot {
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) throw new Error(`画板中不存在图片节点：${nodeId}`);
  if (!isBoardImageNode(target)) throw new Error(`指定节点不是图片节点：${nodeId}`);
  return target;
}

export function renderedImageHeight(node: BoardNodeSnapshot): number {
  const displayWidth = node.displayWidth ?? DEFAULT_IMAGE_NODE_WIDTH;
  return node.width && node.height ? displayWidth * node.height / node.width : displayWidth;
}

export function reflowGenerationOutputNodes(
  nodes: readonly BoardNode[],
  connections: readonly BoardConnection[],
  generationNodeId: string
): BoardNode[] {
  const generation = nodes.find((node) => node.id === generationNodeId);
  if (!generation || (!isBoardGenerationNode(generation) && !isBoardVideoGenerationNode(generation))) {
    return nodes as BoardNode[];
  }
  const outputIds = new Set(
    connections
      .filter((connection) => connection.source === generationNodeId)
      .map((connection) => connection.target)
  );
  const outputs = nodes.filter((node): node is BoardNodeSnapshot | BoardVideoNode => (
    outputIds.has(node.id) && (isBoardImageNode(node) || isBoardVideoNode(node))
  ));
  const positions = layoutGenerationOutputColumn(
    {
      x: generation.x,
      y: generation.y,
      width: generation.displayWidth ?? 340,
      height: generation.displayHeight ?? (isBoardVideoGenerationNode(generation) ? 636 : 320)
    },
    outputs.map((node) => ({ id: node.id, height: renderedOutputHeight(node) }))
  );
  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, ...position } : node;
  });
}

export function renderedOutputHeight(node: BoardNodeSnapshot | BoardVideoNode): number {
  if (isBoardImageNode(node)) return renderedImageHeight(node);
  const displayWidth = node.displayWidth ?? 360;
  if (node.width && node.height && node.width > 0 && node.height > 0) {
    return displayWidth * node.height / node.width;
  }
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(node.aspectRatio?.trim() ?? "");
  if (!match) return displayWidth * 9 / 16;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? displayWidth * height / width : displayWidth * 9 / 16;
}

export function normalizeStoredBoard(value: unknown): BoardData | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<BoardData>;
  if (!parsed.id || !parsed.name) return null;
  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    revision: Number.isInteger(parsed.revision) && (parsed.revision ?? 0) >= 0 ? parsed.revision : 0,
    id: parsed.id,
    name: parsed.name,
    kind: parsed.kind === "comic-drama" ? "comic-drama" : "standard",
    parentBoardId: typeof parsed.parentBoardId === "string" && parsed.parentBoardId.trim() ? parsed.parentBoardId : undefined,
    createdAt: parsed.createdAt || now,
    updatedAt: parsed.updatedAt || now,
    nodes: Array.isArray(parsed.nodes)
      ? parsed.nodes.map(normalizeBoardNode).filter((node): node is BoardNode => node !== null)
      : [],
    connections: Array.isArray(parsed.connections)
      ? parsed.connections
          .map(normalizeBoardConnection)
          .filter((connection): connection is BoardConnection => connection !== null)
      : [],
    groups: Array.isArray(parsed.groups)
      ? parsed.groups.map(normalizeBoardGroup).filter((group): group is NonNullable<BoardData["groups"]>[number] => group !== null)
      : [],
    viewport: parsed.viewport,
    thumbnailDataUrl: parsed.thumbnailDataUrl,
    videoSequences: Array.isArray(parsed.videoSequences) ? structuredClone(parsed.videoSequences) : [],
    deliveryRecipes: Array.isArray(parsed.deliveryRecipes) ? structuredClone(parsed.deliveryRecipes) : []
  };
}

export function toSummary(board: BoardData, storageBytes?: number): BoardSummary {
  return {
    id: board.id,
    name: board.name,
    kind: board.kind ?? "standard",
    parentBoardId: board.parentBoardId,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    imageCount: board.nodes.filter(isBoardImageNode).length,
    storageBytes,
    thumbnailDataUrl: board.thumbnailDataUrl
  };
}

export function boardStorageFingerprint(board: BoardData): string {
  return JSON.stringify(boardStoragePaths(board));
}

export function boardAssetCatalogFingerprint(board: BoardData): string {
  const assets = board.nodes.flatMap<Record<string, unknown>>((node) => {
    if (isBoardImageNode(node)) {
      return [{
        type: "image",
        id: node.id,
        imagePath: node.imagePath,
        jobId: node.jobId,
        source: node.source,
        width: node.width,
        height: node.height,
        activeVersion: node.activeVersion,
        versions: node.versions,
        derivation: node.derivation
      }];
    }
    if (isBoardVideoNode(node)) {
      return [{
        type: "video",
        id: node.id,
        videoPath: node.videoPath,
        posterPath: node.posterPath,
        jobId: node.jobId,
        source: node.source,
        width: node.width,
        height: node.height,
        durationMs: node.durationMs,
        mimeType: node.mimeType,
        title: node.title,
        activeVersion: node.activeVersion,
        versions: node.versions
      }];
    }
    if (isBoardVideoGenerationNode(node)) {
      return [{
        type: "video-generation-inputs",
        id: node.id,
        sourceVideoPath: node.sourceVideoPath,
        referenceVideoPaths: node.referenceVideoPaths,
        referenceAudioPaths: node.referenceAudioPaths
      }];
    }
    return [];
  });
  return JSON.stringify({ name: board.name, assets });
}

export function boardStoragePaths(board: BoardData): string[] {
  const mediaPaths = new Set<string>();
  const addMediaPath = (mediaPath: string | undefined): void => {
    if (mediaPath) mediaPaths.add(path.resolve(mediaPath));
  };
  for (const node of board.nodes) {
    if (isBoardImageNode(node)) {
      addMediaPath(node.imagePath);
      for (const version of node.versions ?? []) addMediaPath(version.imagePath);
      addMediaPath(node.finalVersion?.imagePath);
    } else if (isBoardVideoNode(node)) {
      addMediaPath(node.videoPath);
      addMediaPath(node.posterPath);
      for (const version of node.versions ?? []) {
        addMediaPath(version.videoPath);
        addMediaPath(version.posterPath);
      }
    }
  }
  for (const recipe of board.deliveryRecipes ?? []) for (const item of recipe.items) addMediaPath(item.sourceVersion.imagePath);
  return [...mediaPaths].sort();
}

export function toTrashedSummary(
  record: TrashedBoardRecord,
  retentionDays: BoardTrashRetentionDays
): TrashedBoardSummary {
  return {
    ...toSummary(record.board),
    deletedAt: record.deletedAt,
    expiresAt: retentionDays === 0
      ? undefined
      : new Date(Date.parse(record.deletedAt) + retentionDays * 24 * 60 * 60 * 1_000).toISOString()
  };
}

export function nextDefaultName(existing: readonly Pick<BoardData, "name">[]): string {
  const used = new Set(existing.map((board) => board.name));
  let index = existing.length + 1;
  let name = `画板 ${index}`;
  while (used.has(name)) {
    index += 1;
    name = `画板 ${index}`;
  }
  return name;
}
