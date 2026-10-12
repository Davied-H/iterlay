import type { BoardConnection, BoardData, BoardNode, BoardNodeBase, VideoProviderModelOption } from "./types.js";
import { resolveVideoModelCapability } from "./video-provider-models.js";

export const COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL = "comicDrama:getBoardSnapshot";
export const COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL = "comicDrama:applyMutationPlan";

export type ComicDramaCardStatus = "draft" | "generating" | "review" | "adopted" | "failed" | "saved" | "ready" | "stale" | "blocked";
export type ComicDramaVersionBinding = { mode: "follow-active" } | { mode: "pinned"; versionId: string };
export type ComicDramaInvalidationScope = "segment-context" | "image" | "video";
export type ComicFrameRole = "first-frame" | "last-frame";
export type ComicProductionInvalidationTarget = ComicFrameRole | "video";
export interface ComicVersionReference { nodeId: string; versionId: string }
export interface ComicFrameContextSnapshot {
  role: ComicFrameRole;
  segmentNodeId: string;
  segmentScriptVersionId: string;
  characterVersions: ComicVersionReference[];
  sharedVisualVersions: ComicVersionReference[];
  adoptedFirstFrame?: ComicVersionReference;
}
export interface ComicVideoContextSnapshot {
  segmentNodeId: string;
  segmentScriptVersionId: string;
  characterVersions: ComicVersionReference[];
  sharedVisualVersions: ComicVersionReference[];
  adoptedFirstFrame: ComicVersionReference;
  adoptedLastFrame: ComicVersionReference;
}
export interface ComicGenerationCostItem {
  stage: ComicFrameRole | "character" | "video";
  amount: number;
  currency: string;
  authoritative: boolean;
}
export interface ComicVideoReadiness {
  status: "ready" | "blocked";
  reason?: "missing-first-frame" | "missing-last-frame" | "unsupported-provider" | "unknown-model-capability";
  action?: "adopt-first-frame" | "adopt-last-frame" | "switch-model" | "check-provider";
}

export interface ComicSettingFields {
  title: string;
  synopsis: string;
  genre: string;
  tone: string;
  worldRules: string[];
  visualStyle: string;
  constraints: string[];
  aspectRatio: string;
  targetDurationSeconds: number;
}
export interface ComicCharacterFields {
  role: string;
  profile: string;
  appearanceAnchors: string[];
  visualPrompt: string;
}
export interface ComicSegmentScriptFields {
  purpose: string;
  scene: string;
  action: string;
  dialogue: string;
  emotion: string;
  visualDirection: string;
  cameraDirection: string;
  durationSeconds: number;
}
export interface ComicSettingVersion { versionId: string; createdAt: string; fields: ComicSettingFields }
export interface ComicCharacterVersion { versionId: string; createdAt: string; fields: ComicCharacterFields }
export interface ComicSegmentScriptVersion { versionId: string; createdAt: string; fields: ComicSegmentScriptFields }
export type ComicDramaVersion = ComicSettingVersion | ComicCharacterVersion | ComicSegmentScriptVersion;

interface VersionedComicNode<T extends ComicDramaVersion> extends BoardNodeBase {
  status: ComicDramaCardStatus;
  generationError?: string;
  versions: T[];
  activeVersionId: string;
}
export interface ComicSettingNode extends VersionedComicNode<ComicSettingVersion> { type: "comic-setting" }
export interface ComicCharacterNode extends VersionedComicNode<ComicCharacterVersion> { type: "comic-character"; name: string }
export interface ComicSegmentScriptNode extends VersionedComicNode<ComicSegmentScriptVersion> {
  type: "comic-segment-script";
  order: number;
  title: string;
}
export type ComicDramaBoardNode = ComicSettingNode | ComicCharacterNode | ComicSegmentScriptNode;

/** 普通画板中的漫剧项目入口；具体制作节点保存在独立子画板中。 */
export interface BoardComicDramaEntryNode extends BoardNodeBase {
  type: "comic-drama-entry";
  childBoardId: string;
  name: string;
}

/** 已存在 Video Sequence 的普通画板入口，不属于漫剧语义卡。 */
export interface BoardVideoSequenceEntryNode extends BoardNodeBase {
  type: "video-sequence-entry";
  sequenceId: string;
  name: string;
  segmentCount: number;
  durationMs: number;
  exportStatus: "none" | "stale" | "exporting" | "completed" | "failed";
  lastExportedAt?: string;
  activeExportVersionId?: string;
}

/** 片段分组只保存布局，不参与节点连接和上下文解析。 */
export interface BoardGroup {
  id: string;
  title: string;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ComicCharacterDraft {
  id: string;
  name: string;
  role: string;
  profile: string;
  appearanceAnchors: string[];
  visualPrompt: string;
  visualDescription: string;
  required: boolean;
  imageCount: number;
  estimatedCost: number;
}
export type ComicDramaAction =
  | { kind: "create-setting" }
  | { kind: "update-setting"; settingNodeId: string }
  | { kind: "update-character"; characterNodeId: string }
  | { kind: "update-segment"; segmentNodeId: string }
  | { kind: "propose-characters"; characterDrafts: ComicCharacterDraft[] }
  | { kind: "create-characters"; characterDraftIds: string[] }
  | { kind: "create-character"; characterDraftIds: [string] }
  | { kind: "create-segment"; segmentNodeId?: string };
export interface BoardMutationPlan {
  planId: string;
  boardId: string;
  baseRevision: number;
  action?: ComicDramaAction;
  preview: {
    title: string;
    additions: { nodes: number; connections: number; groups: number };
    updates?: { nodes: number };
    details?: Array<{ label: string; value: string }>;
    impact: string;
    cost: string;
    costItems?: ComicGenerationCostItem[];
  };
  additions: { nodes: BoardNode[]; connections: BoardConnection[]; groups: BoardGroup[] };
  updates?: { nodes: ComicDramaBoardNode[] };
}
export interface BoardMutationResult {
  boardId: string;
  revision: number;
  addedNodeIds: string[];
  addedConnectionIds: string[];
  addedGroupIds: string[];
  updatedNodeIds?: string[];
  receipt?: ComicDramaMutationReceipt;
}
export interface ComicDramaMutationReceipt {
  transactionId: string;
  boardId: string;
  toolName: string;
  idempotencyKey: string;
  inputHash: string;
  beforeRevision: number;
  afterRevision: number;
  addedNodeIds: string[];
  updatedNodeIds: string[];
  createdAt: string;
}
export interface ComicDramaBoardSnapshot {
  boardId: string;
  revision: number;
  nodes: Array<ComicDramaBoardNode | BoardVideoSequenceEntryNode>;
  connections: BoardConnection[];
  groups: BoardGroup[];
}
export interface ComicDramaContextSourceSnapshot {
  nodeId: string;
  nodeType: ComicDramaBoardNode["type"];
  binding: ComicDramaVersionBinding;
  versionId: string;
  version: ComicDramaVersion;
}
export interface ComicDramaContextSnapshot {
  boardId: string;
  boardRevision: number;
  targetNodeId: string;
  createdAt: string;
  sources: ComicDramaContextSourceSnapshot[];
}

export function isComicDramaNode(node: BoardNode): node is ComicDramaBoardNode {
  return node.type === "comic-setting" || node.type === "comic-character" || node.type === "comic-segment-script";
}
export function isBoardComicDramaEntryNode(node: BoardNode): node is BoardComicDramaEntryNode {
  return node.type === "comic-drama-entry";
}
export function isBoardVideoSequenceEntryNode(node: BoardNode): node is BoardVideoSequenceEntryNode {
  return node.type === "video-sequence-entry";
}

export function normalizeComicDramaNode(value: unknown): ComicDramaBoardNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const base = normalizeNodeBase(node);
  const activeVersionId = cleanRequiredString(node.activeVersionId);
  if (!base || !activeVersionId || !Array.isArray(node.versions)) return null;
  const status = normalizeStatus(node.status);
  const generationError = cleanRequiredString(node.generationError) ?? undefined;
  const generationState = generationError ? { generationError } : {};
  if (node.type === "comic-setting") {
    const versions = normalizeVersions(node.versions, normalizeSettingFields);
    return hasActiveVersion(versions, activeVersionId) ? { ...base, ...generationState, type: "comic-setting", status, versions, activeVersionId } : null;
  }
  if (node.type === "comic-character") {
    const name = cleanRequiredString(node.name);
    const versions = normalizeVersions(node.versions, normalizeCharacterFields);
    return name && hasActiveVersion(versions, activeVersionId)
      ? { ...base, ...generationState, type: "comic-character", name, status, versions, activeVersionId }
      : null;
  }
  if (node.type === "comic-segment-script") {
    const title = cleanRequiredString(node.title);
    const order = positiveInteger(node.order);
    const versions = normalizeVersions(node.versions, normalizeSegmentFields);
    return title && order && hasActiveVersion(versions, activeVersionId)
      ? { ...base, ...generationState, type: "comic-segment-script", order, title, status, versions, activeVersionId }
      : null;
  }
  return null;
}

export function normalizeComicDramaEntryNode(value: unknown): BoardComicDramaEntryNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const base = normalizeNodeBase(node);
  const childBoardId = cleanRequiredString(node.childBoardId);
  const name = cleanRequiredString(node.name);
  return base && childBoardId && name
    ? { ...base, type: "comic-drama-entry", childBoardId, name }
    : null;
}

export function normalizeVideoSequenceEntryNode(value: unknown): BoardVideoSequenceEntryNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const base = normalizeNodeBase(node);
  const sequenceId = cleanRequiredString(node.sequenceId);
  const name = cleanRequiredString(node.name);
  const segmentCount = nonNegativeInteger(node.segmentCount);
  const durationMs = nonNegativeInteger(node.durationMs);
  const statuses = new Set(["none", "stale", "exporting", "completed", "failed"]);
  if (!base || !sequenceId || !name || segmentCount === null || durationMs === null || !statuses.has(String(node.exportStatus))) return null;
  return {
    ...base, type: "video-sequence-entry", sequenceId, name, segmentCount, durationMs,
    exportStatus: node.exportStatus as BoardVideoSequenceEntryNode["exportStatus"],
    ...(typeof node.lastExportedAt === "string" ? { lastExportedAt: node.lastExportedAt } : {}),
    ...(typeof node.activeExportVersionId === "string" ? { activeExportVersionId: node.activeExportVersionId } : {})
  };
}

export function normalizeBoardGroup(value: unknown): BoardGroup | null {
  if (!value || typeof value !== "object") return null;
  const group = value as Record<string, unknown>;
  const id = cleanRequiredString(group.id);
  const title = cleanRequiredString(group.title);
  const nodeIds = cleanStringList(group.nodeIds);
  if (!id || !title || !nodeIds.length || !finite(group.x) || !finite(group.y) || !finite(group.width) || !finite(group.height)) return null;
  if ((group.width as number) <= 0 || (group.height as number) <= 0) return null;
  return { id, title, nodeIds, x: group.x as number, y: group.y as number, width: group.width as number, height: group.height as number };
}

export function normalizeComicDramaVersionBinding(value: unknown): ComicDramaVersionBinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const binding = value as Record<string, unknown>;
  if (binding.mode === "follow-active") return { mode: "follow-active" };
  const versionId = cleanRequiredString(binding.versionId);
  return binding.mode === "pinned" && versionId ? { mode: "pinned", versionId } : undefined;
}

export function createComicDramaContextSnapshot(board: BoardData, targetNodeId: string, createdAt = new Date().toISOString()): ComicDramaContextSnapshot {
  const nodes = new Map(board.nodes.filter(isComicDramaNode).map((node) => [node.id, node]));
  const sources = (board.connections ?? []).flatMap((connection): ComicDramaContextSourceSnapshot[] => {
    if (connection.kind !== "reference" || connection.target !== targetNodeId) return [];
    const node = nodes.get(connection.source);
    if (!node) return [];
    const binding = connection.versionBinding ?? { mode: "follow-active" as const };
    const versionId = binding.mode === "pinned" ? binding.versionId : node.activeVersionId;
    const version = node.versions.find((candidate) => candidate.versionId === versionId);
    if (!version) throw new Error(`固定版本缺失：${node.id}/${versionId}`);
    return [{ nodeId: node.id, nodeType: node.type, binding, versionId, version }];
  }).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  return { boardId: board.id, boardRevision: board.revision ?? 0, targetNodeId, createdAt, sources };
}

export function evaluateComicDramaContextSnapshot(snapshot: ComicDramaContextSnapshot, board: BoardData): {
  status: "current" | "stale" | "blocked";
  changedSourceNodeIds: string[];
  missingVersionSourceNodeIds: string[];
} {
  const nodes = new Map(board.nodes.filter(isComicDramaNode).map((node) => [node.id, node]));
  const changedSourceNodeIds: string[] = [];
  const missingVersionSourceNodeIds: string[] = [];
  for (const source of snapshot.sources) {
    const node = nodes.get(source.nodeId);
    if (!node || !node.versions.some((version) => version.versionId === source.versionId)) {
      missingVersionSourceNodeIds.push(source.nodeId);
    } else if (source.binding.mode === "follow-active" && node.activeVersionId !== source.versionId) {
      changedSourceNodeIds.push(source.nodeId);
    }
  }
  return {
    status: missingVersionSourceNodeIds.length ? "blocked" : changedSourceNodeIds.length ? "stale" : "current",
    changedSourceNodeIds,
    missingVersionSourceNodeIds
  };
}

export function getComicDramaVersionChangeScopes(before: ComicDramaVersion, after: ComicDramaVersion): ComicDramaInvalidationScope[] {
  const beforeFields = before.fields as unknown as Record<string, unknown>;
  const afterFields = after.fields as unknown as Record<string, unknown>;
  const changed = new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)].filter((key) =>
    JSON.stringify(beforeFields[key]) !== JSON.stringify(afterFields[key])
  ));
  if (!changed.size) return [];
  if ("worldRules" in beforeFields) {
    if (["visualStyle", "constraints", "aspectRatio"].some((field) => changed.has(field))) return ["image", "video"];
    return ["segment-context"];
  }
  if ("appearanceAnchors" in beforeFields) return ["segment-context", "image", "video"];
  const scopes: ComicDramaInvalidationScope[] = [];
  if (["purpose", "scene", "emotion", "visualDirection", "cameraDirection"].some((field) => changed.has(field))) scopes.push("image", "video");
  else if (["action", "dialogue", "durationSeconds"].some((field) => changed.has(field))) scopes.push("video");
  return scopes;
}

export function createComicFrameContextSnapshot(input: ComicFrameContextSnapshot): ComicFrameContextSnapshot {
  const segmentNodeId = cleanRequiredString(input.segmentNodeId);
  const segmentScriptVersionId = cleanRequiredString(input.segmentScriptVersionId);
  if (!segmentNodeId || !segmentScriptVersionId) throw new Error("片段脚本版本快照无效。");
  const normalizeReferences = (items: ComicVersionReference[]): ComicVersionReference[] => {
    const byNodeId = new Map<string, ComicVersionReference>();
    for (const item of items) {
      const nodeId = cleanRequiredString(item.nodeId);
      const versionId = cleanRequiredString(item.versionId);
      if (nodeId && versionId) byNodeId.set(nodeId, { nodeId, versionId });
    }
    return [...byNodeId.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  };
  const firstFrame = input.adoptedFirstFrame
    ? normalizeReferences([input.adoptedFirstFrame])[0]
    : undefined;
  if (input.role === "last-frame" && !firstFrame) throw new Error("尾帧生成必须绑定已采用首帧版本。");
  return {
    role: input.role,
    segmentNodeId,
    segmentScriptVersionId,
    characterVersions: normalizeReferences(input.characterVersions),
    sharedVisualVersions: normalizeReferences(input.sharedVisualVersions),
    ...(firstFrame ? { adoptedFirstFrame: firstFrame } : {})
  };
}

export function createComicVideoContextSnapshot(input: ComicVideoContextSnapshot): ComicVideoContextSnapshot {
  const tailContext = createComicFrameContextSnapshot({ ...input, role: "last-frame" });
  const lastFrame = input.adoptedLastFrame && cleanRequiredString(input.adoptedLastFrame.nodeId)
    && cleanRequiredString(input.adoptedLastFrame.versionId)
    ? { nodeId: input.adoptedLastFrame.nodeId.trim(), versionId: input.adoptedLastFrame.versionId.trim() }
    : undefined;
  if (!lastFrame) throw new Error("视频生成必须绑定已采用尾帧版本。");
  return {
    segmentNodeId: tailContext.segmentNodeId,
    segmentScriptVersionId: tailContext.segmentScriptVersionId,
    characterVersions: tailContext.characterVersions,
    sharedVisualVersions: tailContext.sharedVisualVersions,
    adoptedFirstFrame: tailContext.adoptedFirstFrame!,
    adoptedLastFrame: lastFrame
  };
}

export function getComicDramaProductionInvalidationTargets(
  change: "script" | "character" | "shared-visual" | ComicFrameRole
): ComicProductionInvalidationTarget[] {
  if (change === "first-frame") return ["last-frame", "video"];
  if (change === "last-frame") return ["video"];
  return ["first-frame", "last-frame", "video"];
}

export function getComicVideoReadiness(input: {
  adoptedFirstFrameVersionId?: string;
  adoptedLastFrameVersionId?: string;
  modelOption?: VideoProviderModelOption;
  /** 旧调用方的显式能力字段；缺省不得推断。 */
  providerModes?: string[];
}): ComicVideoReadiness {
  if (!cleanRequiredString(input.adoptedFirstFrameVersionId)) {
    return { status: "blocked", reason: "missing-first-frame", action: "adopt-first-frame" };
  }
  if (!cleanRequiredString(input.adoptedLastFrameVersionId)) {
    return { status: "blocked", reason: "missing-last-frame", action: "adopt-last-frame" };
  }
  const capability = input.modelOption
    ? resolveVideoModelCapability(input.modelOption, "first-last-frame")
    : input.providerModes
      ? input.providerModes.includes("first-last-frame") ? "supported" : "unsupported"
      : "unknown";
  if (capability === "unknown") {
    return { status: "blocked", reason: "unknown-model-capability", action: "check-provider" };
  }
  if (capability === "unsupported") {
    return { status: "blocked", reason: "unsupported-provider", action: "switch-model" };
  }
  return { status: "ready" };
}

export async function fingerprintComicDramaContext(value: ComicDramaContextSnapshot | ComicFrameContextSnapshot | ComicVideoContextSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeNodeBase(node: Record<string, unknown>): BoardNodeBase | null {
  const id = cleanRequiredString(node.id);
  if (!id || !finite(node.x) || !finite(node.y)) return null;
  return {
    id, x: node.x as number, y: node.y as number,
    ...(typeof node.title === "string" ? { title: node.title.trim() } : {}),
    ...(typeof node.locked === "boolean" ? { locked: node.locked } : {}),
    ...(finite(node.zIndex) ? { zIndex: node.zIndex as number } : {}),
    ...(finite(node.displayWidth) ? { displayWidth: node.displayWidth as number } : {}),
    ...(finite(node.displayHeight) ? { displayHeight: node.displayHeight as number } : {})
  };
}
function normalizeVersions<T>(values: unknown[], fields: (value: unknown) => T | null): Array<{ versionId: string; createdAt: string; fields: T }> {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const candidate = value as Record<string, unknown>;
    const versionId = cleanRequiredString(candidate.versionId);
    const createdAt = cleanRequiredString(candidate.createdAt);
    const normalizedFields = fields(candidate.fields);
    if (!versionId || !createdAt || !normalizedFields || seen.has(versionId)) return [];
    seen.add(versionId);
    return [{ versionId, createdAt, fields: normalizedFields }];
  });
}
function normalizeSettingFields(value: unknown): ComicSettingFields | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  const duration = positiveInteger(fields.targetDurationSeconds);
  return duration ? {
    title: cleanString(fields.title), synopsis: cleanString(fields.synopsis), genre: cleanString(fields.genre), tone: cleanString(fields.tone),
    worldRules: cleanStringList(fields.worldRules), visualStyle: cleanString(fields.visualStyle), constraints: cleanStringList(fields.constraints),
    aspectRatio: cleanString(fields.aspectRatio) || "9:16", targetDurationSeconds: duration
  } : null;
}
function normalizeCharacterFields(value: unknown): ComicCharacterFields | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  return { role: cleanString(fields.role), profile: cleanString(fields.profile), appearanceAnchors: cleanStringList(fields.appearanceAnchors), visualPrompt: cleanString(fields.visualPrompt) };
}
function normalizeSegmentFields(value: unknown): ComicSegmentScriptFields | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  const duration = positiveInteger(fields.durationSeconds);
  return duration ? {
    purpose: cleanString(fields.purpose), scene: cleanString(fields.scene), action: cleanString(fields.action), dialogue: cleanString(fields.dialogue),
    emotion: cleanString(fields.emotion), visualDirection: cleanString(fields.visualDirection), cameraDirection: cleanString(fields.cameraDirection), durationSeconds: duration
  } : null;
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const cleanRequiredString = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const cleanString = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const cleanStringList = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.map(cleanString).filter(Boolean))] : [];
const positiveInteger = (value: unknown): number | null => finite(value) && value > 0 ? Math.max(1, Math.round(value)) : null;
const nonNegativeInteger = (value: unknown): number | null => finite(value) && value >= 0 ? Math.round(value) : null;
const hasActiveVersion = (versions: Array<{ versionId: string }>, activeVersionId: string): boolean => versions.some((version) => version.versionId === activeVersionId);
const normalizeStatus = (value: unknown): ComicDramaCardStatus =>
  value === "generating" || value === "review" || value === "adopted" || value === "failed" || value === "saved" || value === "ready" || value === "stale" || value === "blocked" ? value : "draft";
