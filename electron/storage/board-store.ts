import { readdir, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  isBoardImageNode,
  isBoardGenerationNode,
  isBoardVideoGenerationNode,
  isBoardVideoNode,
  normalizeBoardConnection,
  normalizeBoardNode,
  type BoardConnection,
  type BoardComicDramaEntryNode,
  type BoardData,
  type BoardNode,
  type BoardNodeSnapshot,
  type BoardNodeVersion,
  type BoardVideoNode,
  type BoardVideoVersion,
  type BoardSavePayload,
  type BoardSummary,
  type BoardTrashRetentionDays,
  type ComicDramaProjectCreateInput,
  type ComicDramaProjectCreateResult,
  type TrashedBoardSummary,
  type UnpositionedBoardNode
} from "../../shared/types.js";
import {
  isBoardComicDramaEntryNode,
  isBoardVideoSequenceEntryNode,
  isComicDramaNode,
  normalizeBoardGroup,
  normalizeComicDramaNode,
  type BoardMutationPlan,
  type BoardMutationResult,
  type ComicDramaMutationReceipt,
  type ComicDramaBoardNode,
  type ComicDramaBoardSnapshot
} from "../../shared/comic-drama.js";
import { sortBoardsByRecentUse } from "../../shared/board-order.js";
import { arrangeImageNodes, type ImageNodeLayoutMode } from "../../shared/image-node-layout.js";
import {
  GENERATION_OUTPUT_HORIZONTAL_GAP,
  layoutGenerationOutputColumn
} from "../../shared/generation-output-layout.js";
import { MutationQueue, writeJsonAtomic } from "./atomic-json.js";

interface BoardsState {
  lastOpenedBoardId?: string;
  installedDemoBoardVersion?: number;
}

const STATE_FILE = "state.json";
const DEFAULT_IMAGE_NODE_WIDTH = 264;
const DUPLICATE_IMAGE_OFFSET = 24;
const IMAGE_DIMENSIONS_CACHE_LIMIT = 512;
const IMAGE_DIMENSIONS_CACHE_TTL_MS = 5 * 60_000;
const IMAGE_DIMENSIONS_PENDING_TTL_MS = 30_000;
const STORAGE_BYTES_CACHE_TTL_MS = 30_000;

interface TrashedBoardRecord {
  board: BoardData;
  deletedAt: string;
}

interface ComicDramaMutationRecord {
  receipt: ComicDramaMutationReceipt;
  result: Omit<BoardMutationResult, "receipt">;
  before: BoardData;
}

export interface BoardImageDimensions {
  width: number;
  height: number;
}

export type BoardImageDimensionsResolver = (
  imagePath: string
) => Promise<BoardImageDimensions | null>;

interface ImageDimensionsCacheEntry {
  promise: Promise<BoardImageDimensions | null>;
  pending: boolean;
  expiresAt: number;
}

interface BoardStorageCacheEntry {
  fingerprint: string;
  storageBytes: number;
  expiresAt: number;
}

export class BoardStore {
  private readonly boardsDir: string;
  private readonly trashDir: string;
  private readonly comicDramaReceiptsDir: string;
  private readonly mutations = new MutationQueue();
  private readonly cache = new Map<string, BoardData>();
  private readonly imageDimensions = new Map<string, ImageDimensionsCacheEntry>();
  private readonly storageBytes = new Map<string, BoardStorageCacheEntry>();
  private loadedAll = false;

  constructor(
    dataDir: string,
    private readonly resolveImageDimensions?: BoardImageDimensionsResolver
  ) {
    this.boardsDir = path.join(dataDir, "boards");
    this.trashDir = path.join(dataDir, "board-trash");
    this.comicDramaReceiptsDir = path.join(dataDir, "comic-drama-receipts");
  }

  async listBoards(): Promise<BoardData[]> {
    await this.mutations.idle();
    return this.readBoards();
  }

  private async readBoards(): Promise<BoardData[]> {
    if (this.loadedAll) return sortBoardsByRecentUse([...this.cache.values()].map(cloneBoard));
    let files: string[];
    try {
      files = await readdir(this.boardsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.loadedAll = true;
        return [];
      }
      throw error;
    }

    const boardFiles = files.filter((file) => file.endsWith(".json") && file !== STATE_FILE);
    const boards = (await Promise.all(
      boardFiles.map((file) => this.readBoardFile(path.join(this.boardsDir, file)))
    )).filter((board): board is BoardData => board !== null);
    this.loadedAll = true;
    return sortBoardsByRecentUse(boards);
  }

  async listSummaries(): Promise<BoardSummary[]> {
    const boards = await this.listBoards();
    const sizeByPath = new Map<string, Promise<number>>();
    return Promise.all(boards.map(async (board) => toSummary(
      board,
      await this.storageBytesFor(board, sizeByPath)
    )));
  }

  async summarize(board: BoardData): Promise<BoardSummary> {
    return toSummary(board, await this.storageBytesFor(board));
  }

  async listTrashedBoards(retentionDays: BoardTrashRetentionDays): Promise<TrashedBoardSummary[]> {
    await this.mutations.idle();
    const records = await this.readTrashedBoards();
    return records
      .sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt))
      .map((record) => toTrashedSummary(record, retentionDays));
  }

  /** 素材回收必须同时保护回收站内画板引用的图片。 */
  async listAllBoards(): Promise<BoardData[]> {
    await this.mutations.idle();
    const [active, trashed] = await Promise.all([this.readBoards(), this.readTrashedBoards()]);
    return [...active, ...trashed.map((record) => cloneBoard(record.board))];
  }

  async getBoard(id: string): Promise<BoardData | null> {
    await this.mutations.idle();
    return this.readBoardFile(this.boardFile(id));
  }

  /** 读取画板前以物理文件为准修正所有图片尺寸，兼容旧数据和异常恢复记录。 */
  async getBoardWithVerifiedImageDimensions(id: string): Promise<BoardData | null> {
    if (!this.resolveImageDimensions) return this.getBoard(id);
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return null;
      const reconciled = await this.reconcileImageDimensions(current.nodes);
      if (!reconciled.changed) return current;
      return this.saveBoardUnlocked({ id, nodes: reconciled.nodes });
    });
  }

  async createBoard(name?: string): Promise<BoardData> {
    return this.mutations.run(async () => {
      const existing = await this.readBoards();
      const now = new Date().toISOString();
      const board: BoardData = {
        schemaVersion: 3,
        revision: 0,
        id: crypto.randomUUID(),
        name: name?.trim() || nextDefaultName(existing),
        kind: "standard",
        createdAt: now,
        updatedAt: now,
        nodes: []
      };
      await this.writeBoard(board);
      return board;
    });
  }

  async createComicDramaProject(input: ComicDramaProjectCreateInput): Promise<ComicDramaProjectCreateResult> {
    return this.mutations.run(async () => {
      const parentBoardId = input?.parentBoardId?.trim();
      if (!parentBoardId) throw new Error("缺少父画板 ID。");
      const parent = await this.readBoardFile(this.boardFile(parentBoardId));
      if (!parent) throw new Error("父画板不存在或已移入回收站。");
      if (!Number.isFinite(input.position?.x) || !Number.isFinite(input.position?.y)) {
        throw new Error("漫剧项目入口位置无效。");
      }
      const now = new Date().toISOString();
      const name = input.name?.trim() || "未命名漫剧";
      const childBoardId = crypto.randomUUID();
      const settingVersionId = crypto.randomUUID();
      const childBoard: BoardData = {
        schemaVersion: 3,
        revision: 0,
        id: childBoardId,
        name,
        kind: "comic-drama",
        parentBoardId: parent.id,
        createdAt: now,
        updatedAt: now,
        nodes: [{
          id: crypto.randomUUID(),
          type: "comic-setting",
          x: 80,
          y: 80,
          status: "draft",
          activeVersionId: settingVersionId,
          versions: [{
            versionId: settingVersionId,
            createdAt: now,
            fields: {
              title: name,
              synopsis: "",
              genre: "",
              tone: "",
              worldRules: [],
              visualStyle: "",
              constraints: [],
              aspectRatio: "9:16",
              targetDurationSeconds: 30
            }
          }]
        }]
      };
      const entryNode: BoardComicDramaEntryNode = {
        id: crypto.randomUUID(),
        type: "comic-drama-entry",
        x: input.position.x,
        y: input.position.y,
        childBoardId,
        name
      };
      const parentBoard: BoardData = {
        ...parent,
        revision: (parent.revision ?? 0) + 1,
        updatedAt: now,
        nodes: [...parent.nodes, entryNode]
      };
      await this.writeBoard(childBoard);
      await this.writeBoard(parentBoard);
      return {
        parentBoard: cloneBoard(parentBoard),
        childBoard: cloneBoard(childBoard),
        entryNode: structuredClone(entryNode)
      };
    });
  }

  /** 增量合并保存：payload 里未提供的字段保留原值。画板不存在时按给定 id 新建。 */
  async saveBoard(payload: BoardSavePayload): Promise<BoardData> {
    return this.mutations.run(() => this.saveBoardUnlocked(payload));
  }

  async saveBoardWithSummary(
    payload: BoardSavePayload
  ): Promise<{ summary: BoardSummary; assetCatalogChanged: boolean }> {
    const { board, assetCatalogChanged } = await this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(payload.id));
      const previousFingerprint = current ? boardAssetCatalogFingerprint(current) : null;
      const board = await this.saveBoardUnlocked(payload);
      return {
        board,
        assetCatalogChanged: previousFingerprint !== boardAssetCatalogFingerprint(board)
      };
    });
    return { summary: await this.summarize(board), assetCatalogChanged };
  }

  async getComicDramaBoardSnapshot(id: string): Promise<ComicDramaBoardSnapshot> {
    await this.mutations.idle();
    const board = await this.readBoardFile(this.boardFile(id));
    if (!board) throw new Error("画板不存在或已移入回收站。");
    const managedIds = new Set(board.nodes.filter(isManagedBoardNode).map((node) => node.id));
    return {
      boardId: board.id,
      revision: board.revision ?? 0,
      nodes: structuredClone(board.nodes.filter(isManagedBoardNode)),
      connections: structuredClone((board.connections ?? []).filter((connection) => (
        connection.kind === "reference" && (managedIds.has(connection.source) || managedIds.has(connection.target))
      ))),
      groups: structuredClone(board.groups ?? [])
    };
  }

  async applyMutationPlan(plan: BoardMutationPlan): Promise<BoardMutationResult> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(plan?.boardId ?? ""));
      if (!current) throw new Error("画板不存在或已移入回收站。");
      const currentRevision = current.revision ?? 0;
      if (!Number.isInteger(plan.baseRevision) || plan.baseRevision !== currentRevision) {
        throw Object.assign(new Error("画板内容已更新，请重新预览。"), {
          code: "BOARD_REVISION_CONFLICT", currentRevision
        });
      }
      const prepared = prepareBoardMutationPlan(plan, current);
      const revision = currentRevision + 1;
      const updatedNodeById = new Map(prepared.updatedNodes.map((node) => [node.id, node]));
      await this.writeBoard({
        ...current,
        revision,
        updatedAt: new Date().toISOString(),
        nodes: [...current.nodes.map((node) => updatedNodeById.get(node.id) ?? node), ...prepared.nodes],
        connections: [...(current.connections ?? []), ...prepared.connections],
        groups: [...(current.groups ?? []), ...prepared.groups]
      });
      return {
        boardId: current.id,
        revision,
        addedNodeIds: prepared.nodes.map((node) => node.id),
        addedConnectionIds: prepared.connections.map((connection) => connection.id),
        addedGroupIds: prepared.groups.map((group) => group.id),
        ...(prepared.updatedNodes.length
          ? { updatedNodeIds: prepared.updatedNodes.map((node) => node.id) }
          : {})
      };
    });
  }

  async applyComicDramaAgentMutation(input: {
    toolName: string;
    idempotencyKey: string;
    inputHash: string;
    plan: BoardMutationPlan;
  }): Promise<BoardMutationResult> {
    return this.mutations.run(async () => {
      const receiptFile = this.comicDramaReceiptFile(
        input.plan.boardId,
        input.toolName,
        input.idempotencyKey
      );
      const existing = await readOptionalJson<ComicDramaMutationRecord>(receiptFile);
      if (existing) {
        if (existing.receipt.inputHash !== input.inputHash) {
          throw Object.assign(new Error("相同幂等键不能用于不同的漫剧操作。"), {
            code: "IDEMPOTENCY_INPUT_MISMATCH"
          });
        }
        return { ...structuredClone(existing.result), receipt: structuredClone(existing.receipt) };
      }

      const current = await this.readBoardFile(this.boardFile(input.plan?.boardId ?? ""));
      if (!current) throw new Error("画板不存在或已移入回收站。");
      if (current.kind !== "comic-drama") throw new Error("指定画板不是漫剧子画板。");
      const currentRevision = current.revision ?? 0;
      if (!Number.isInteger(input.plan.baseRevision) || input.plan.baseRevision !== currentRevision) {
        throw Object.assign(new Error("画板内容已更新，请重新读取状态后重试。"), {
          code: "BOARD_REVISION_CONFLICT",
          currentRevision
        });
      }

      const prepared = prepareBoardMutationPlan(input.plan, current);
      const revision = currentRevision + 1;
      const updatedNodeById = new Map(prepared.updatedNodes.map((node) => [node.id, node]));
      const nextBoard: BoardData = {
        ...current,
        revision,
        updatedAt: new Date().toISOString(),
        nodes: [...current.nodes.map((node) => updatedNodeById.get(node.id) ?? node), ...prepared.nodes],
        connections: [...(current.connections ?? []), ...prepared.connections],
        groups: [...(current.groups ?? []), ...prepared.groups]
      };
      const result: Omit<BoardMutationResult, "receipt"> = {
        boardId: current.id,
        revision,
        addedNodeIds: prepared.nodes.map((node) => node.id),
        addedConnectionIds: prepared.connections.map((connection) => connection.id),
        addedGroupIds: prepared.groups.map((group) => group.id),
        ...(prepared.updatedNodes.length
          ? { updatedNodeIds: prepared.updatedNodes.map((node) => node.id) }
          : {})
      };
      const receipt: ComicDramaMutationReceipt = {
        transactionId: crypto.randomUUID(),
        boardId: current.id,
        toolName: input.toolName,
        idempotencyKey: input.idempotencyKey,
        inputHash: input.inputHash,
        beforeRevision: currentRevision,
        afterRevision: revision,
        addedNodeIds: result.addedNodeIds,
        updatedNodeIds: result.updatedNodeIds ?? [],
        createdAt: new Date().toISOString()
      };
      await this.writeBoard(nextBoard);
      await writeJsonAtomic(receiptFile, {
        receipt,
        result,
        before: current
      } satisfies ComicDramaMutationRecord);
      return { ...result, receipt };
    });
  }

  async moveImageNode(
    id: string,
    nodeId: string,
    position: { x: number; y: number }
  ): Promise<{ previous: { x: number; y: number }; node: BoardNodeSnapshot }> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) throw new Error("画板不存在或已移入回收站。");
      const target = current.nodes.find((node) => node.id === nodeId);
      if (!target) throw new Error("画板中不存在指定节点。");
      if (!isBoardImageNode(target)) throw new Error("指定节点不是图片节点。");
      const previous = { x: target.x, y: target.y };
      const moved = { ...target, ...position };
      await this.saveBoardUnlocked({
        id,
        nodes: current.nodes.map((node) => node.id === nodeId ? moved : node)
      });
      return { previous, node: moved };
    });
  }

  async resizeImageNode(
    id: string,
    nodeId: string,
    displayWidth: number
  ): Promise<{ previousWidth: number; displayWidth: number; displayHeight: number }> {
    return this.mutations.run(async () => {
      const current = await this.requireBoard(id);
      const target = requireImageNode(current.nodes, nodeId);
      const previousWidth = target.displayWidth ?? DEFAULT_IMAGE_NODE_WIDTH;
      const resized = { ...target, displayWidth };
      await this.saveBoardUnlocked({
        id,
        nodes: current.nodes.map((node) => node.id === nodeId ? resized : node)
      });
      return { previousWidth, displayWidth, displayHeight: renderedImageHeight(resized) };
    });
  }

  async arrangeImageNodes(
    id: string,
    nodeIds: string[],
    mode: ImageNodeLayoutMode,
    gap: number
  ): Promise<Array<{ nodeId: string; x: number; y: number }>> {
    return this.mutations.run(async () => {
      const current = await this.requireBoard(id);
      const targets = uniqueNodeIds(nodeIds).map((nodeId) => requireImageNode(current.nodes, nodeId));
      if (targets.length < 2) throw new Error("至少需要两个图片节点才能排列。");
      const positions = arrangeImageNodes(targets.map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.displayWidth ?? DEFAULT_IMAGE_NODE_WIDTH,
        height: renderedImageHeight(node)
      })), mode, gap);
      await this.saveBoardUnlocked({
        id,
        nodes: current.nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, ...position } : node;
        })
      });
      return targets.map((node) => ({ nodeId: node.id, ...positions.get(node.id)! }));
    });
  }

  async duplicateImageNodes(
    id: string,
    nodeIds: string[],
    offset = DUPLICATE_IMAGE_OFFSET
  ): Promise<Array<{ sourceNodeId: string; node: BoardNodeSnapshot }>> {
    return this.mutations.run(async () => {
      const current = await this.requireBoard(id);
      const targets = uniqueNodeIds(nodeIds).map((nodeId) => requireImageNode(current.nodes, nodeId));
      if (targets.length === 0) throw new Error("至少需要一个图片节点才能复制。");
      const copies = targets.map((node) => ({
        sourceNodeId: node.id,
        node: { ...structuredClone(node), id: crypto.randomUUID(), x: node.x + offset, y: node.y + offset }
      }));
      await this.saveBoardUnlocked({ id, nodes: [...current.nodes, ...copies.map((copy) => copy.node)] });
      return copies;
    });
  }

  async setImageNodeVersion(
    id: string,
    nodeId: string,
    versionIndex: number
  ): Promise<{ previousVersionIndex: number; versionIndex: number; versionCount: number; node: BoardNodeSnapshot }> {
    return this.mutations.run(async () => {
      const current = await this.requireBoard(id);
      const target = requireImageNode(current.nodes, nodeId);
      const versions = target.versions ?? [{
        imagePath: target.imagePath,
        jobId: target.jobId,
        width: target.width,
        height: target.height
      }];
      if (!Number.isInteger(versionIndex) || versionIndex < 0 || versionIndex >= versions.length) {
        throw new Error(`图片版本索引超出范围，可用范围为 0-${versions.length - 1}。`);
      }
      const previousVersionIndex = target.activeVersion ?? versions.length - 1;
      const selected = versions[versionIndex];
      const updated: BoardNodeSnapshot = {
        ...target,
        imagePath: selected.imagePath,
        jobId: selected.jobId,
        width: selected.width,
        height: selected.height,
        activeVersion: target.versions ? versionIndex : undefined
      };
      await this.saveBoardUnlocked({
        id,
        nodes: current.nodes.map((node) => node.id === nodeId ? updated : node)
      });
      return { previousVersionIndex, versionIndex, versionCount: versions.length, node: updated };
    });
  }

  private async saveBoardUnlocked(payload: BoardSavePayload): Promise<BoardData> {
    const current = await this.readBoardFile(this.boardFile(payload.id));
    const now = new Date().toISOString();
    const normalizedNodes = payload.nodes
      ? payload.nodes.map(normalizeBoardNode).filter((node): node is BoardNode => node !== null)
      : current?.nodes ?? [];
    const reconciled = await this.reconcileImageDimensions(normalizedNodes);
    const board: BoardData = {
      schemaVersion: 3,
      revision: (current?.revision ?? -1) + 1,
      id: payload.id,
      name: payload.name?.trim() || current?.name || "未命名画板",
      kind: payload.kind ?? current?.kind ?? "standard",
      parentBoardId: payload.parentBoardId ?? current?.parentBoardId,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      nodes: mergeManagedNodes(current?.nodes ?? [], reconciled.nodes, payload.replaceManagedNodes),
      connections: payload.connections
        ? mergeManagedConnections(
            current?.nodes ?? [],
            current?.connections ?? [],
            payload.connections.map(normalizeBoardConnection).filter((connection): connection is BoardConnection => connection !== null),
            payload.replaceManagedNodes
          )
        : current?.connections ?? [],
      viewport: payload.viewport ?? current?.viewport,
      groups: payload.groups
        ? payload.groups.map(normalizeBoardGroup).filter((group): group is NonNullable<BoardData["groups"]>[number] => group !== null)
        : current?.groups ?? [],
      thumbnailDataUrl: payload.thumbnailDataUrl ?? current?.thumbnailDataUrl,
      videoSequences: payload.videoSequences ?? current?.videoSequences ?? []
    };
    await this.writeBoard(board);
    return board;
  }

  async renameBoard(id: string, name: string): Promise<BoardData | null> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return null;
      const board: BoardData = {
        ...current,
        revision: (current.revision ?? 0) + 1,
        name: name.trim() || current.name,
        updatedAt: new Date().toISOString()
      };
      await this.writeBoard(board);
      if (board.parentBoardId) {
        const parent = await this.readBoardFile(this.boardFile(board.parentBoardId));
        if (parent) {
          const nodes = parent.nodes.map((node) => (
            isBoardComicDramaEntryNode(node) && node.childBoardId === board.id
              ? { ...node, name: board.name }
              : node
          ));
          await this.writeBoard({
            ...parent,
            revision: (parent.revision ?? 0) + 1,
            updatedAt: board.updatedAt,
            nodes
          });
        }
      }
      return board;
    });
  }

  async duplicateBoard(id: string): Promise<BoardData | null> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return null;
      const now = new Date().toISOString();
      const nodeIds = new Map(current.nodes.map((node) => [node.id, crypto.randomUUID()]));
      const copy: BoardData = {
        ...current,
        id: crypto.randomUUID(),
        revision: 0,
        name: `${current.name} 副本`,
        createdAt: now,
        updatedAt: now,
        nodes: current.nodes.map((node) => {
          const copy = { ...node, id: nodeIds.get(node.id)! };
          if (!isBoardImageNode(node)) return copy;
          return {
            ...copy,
            derivation: node.derivation
              ? {
                  ...node.derivation,
                  sourceNodeId: nodeIds.get(node.derivation.sourceNodeId) ?? node.derivation.sourceNodeId
                }
              : undefined
          };
        }),
        connections: current.connections?.flatMap((connection) => {
          const source = nodeIds.get(connection.source);
          const target = nodeIds.get(connection.target);
          if (!source || !target) return [];
          return [{
            ...structuredClone(connection),
            id: crypto.randomUUID(),
            source,
            target
          }];
        }),
        groups: current.groups?.map((group) => ({
          ...group,
          id: crypto.randomUUID(),
          nodeIds: group.nodeIds.flatMap((nodeId) => nodeIds.get(nodeId) ?? [])
        })),
      };
      await this.writeBoard(copy);
      return copy;
    });
  }

  async trashBoard(id: string): Promise<boolean> {
    return this.mutations.run(async () => {
      const board = await this.readBoardFile(this.boardFile(id));
      if (!board) return false;
      const children = (await this.readBoards()).filter((candidate) => candidate.parentBoardId === id);
      const deletedAt = new Date().toISOString();
      for (const candidate of [board, ...children]) {
        const record: TrashedBoardRecord = { board: candidate, deletedAt };
        await writeJsonAtomic(this.trashFile(candidate.id), record);
        await rm(this.boardFile(candidate.id), { force: true });
        this.cache.delete(candidate.id);
        this.storageBytes.delete(candidate.id);
      }
      return true;
    });
  }

  async restoreBoard(id: string): Promise<BoardData | null> {
    return this.mutations.run(async () => {
      const record = await this.readTrashedBoardFile(this.trashFile(id));
      if (!record) return null;
      const childRecords = (await this.readTrashedBoards()).filter((candidate) => candidate.board.parentBoardId === id);
      for (const candidate of [record, ...childRecords]) {
        this.storageBytes.delete(candidate.board.id);
        await this.writeBoard(candidate.board);
        await rm(this.trashFile(candidate.board.id), { force: true });
      }
      return cloneBoard(record.board);
    });
  }

  async deleteTrashedBoard(id: string): Promise<boolean> {
    return this.mutations.run(async () => {
      const record = await this.readTrashedBoardFile(this.trashFile(id));
      if (!record) return false;
      const childRecords = (await this.readTrashedBoards()).filter((candidate) => candidate.board.parentBoardId === id);
      for (const candidate of [record, ...childRecords]) {
        await rm(this.trashFile(candidate.board.id), { force: true });
        this.storageBytes.delete(candidate.board.id);
      }
      return true;
    });
  }

  async emptyTrash(): Promise<string[]> {
    return this.mutations.run(async () => {
      const records = await this.readTrashedBoards();
      await Promise.all(records.map((record) => rm(this.trashFile(record.board.id), { force: true })));
      for (const record of records) this.storageBytes.delete(record.board.id);
      return records.map((record) => record.board.id);
    });
  }

  async purgeExpiredTrashedBoards(
    retentionDays: BoardTrashRetentionDays,
    now = Date.now()
  ): Promise<string[]> {
    if (retentionDays === 0) return [];
    return this.mutations.run(async () => {
      const records = await this.readTrashedBoards();
      const cutoff = now - retentionDays * 24 * 60 * 60 * 1_000;
      const expired = records.filter((record) => Date.parse(record.deletedAt) <= cutoff);
      await Promise.all(expired.map((record) => rm(this.trashFile(record.board.id), { force: true })));
      for (const record of expired) this.storageBytes.delete(record.board.id);
      return expired.map((record) => record.board.id);
    });
  }

  /** 兼容内部脚本中明确需要直接移除活跃画板的旧调用。 */
  async deleteBoard(id: string): Promise<void> {
    await this.mutations.run(async () => {
      const children = (await this.readBoards()).filter((candidate) => candidate.parentBoardId === id);
      for (const boardId of [id, ...children.map((child) => child.id)]) {
        await rm(this.boardFile(boardId), { force: true });
        this.cache.delete(boardId);
        this.storageBytes.delete(boardId);
      }
    });
  }

  /** 把新生成的节点追加到画板文件（用于生成完成时用户已切走的场景），摆在现有内容右侧且不遮挡已有节点。 */
  async appendNodes(id: string, nodes: UnpositionedBoardNode[]): Promise<void> {
    if (nodes.length === 0) return;
    await this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return;
      const nodeWidth = 264;
      const gap = 40;
      const baseX = current.nodes.length > 0
        ? Math.max(...current.nodes.map((node) => node.x + Math.max(1, node.displayWidth ?? nodeWidth))) + gap
        : 0;
      const baseY = current.nodes.length > 0 ? Math.min(...current.nodes.map((node) => node.y)) : 0;
      let nextX = baseX;
      const placed: BoardNode[] = nodes.map((node) => {
        const placedNode = { ...node, x: nextX, y: baseY };
        nextX += Math.max(1, node.displayWidth ?? nodeWidth) + gap;
        return placedNode;
      });
      await this.saveBoardUnlocked({ id, nodes: [...current.nodes, ...placed] });
    });
  }

  /**
   * 原子落盘生成节点的终态和输出。渲染层可能在 Provider 返回前重载，
   * 因此不能依赖它收到 IPC 结果后再分别保存节点与图片。
   */
  async finishGenerationNode(
    id: string,
    generationNodeId: string,
    result: { jobId?: string; nodes?: UnpositionedBoardNode[]; error?: string }
  ): Promise<boolean> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return false;
      const generationNode = current.nodes.find((node) => (
        node.id === generationNodeId && isBoardGenerationNode(node)
      ));
      if (!generationNode) return false;

      const existingImagePaths = new Set(
        current.nodes.filter(isBoardImageNode).map((node) => node.imagePath)
      );
      const recoveredImageByPath = new Map(
        (result.nodes ?? []).flatMap((node) => (
          "imagePath" in node ? [[node.imagePath, node] as const] : []
        ))
      );
      const additions = (result.nodes ?? []).filter((node) => (
        !("imagePath" in node) || !existingImagePaths.has(node.imagePath)
      ));
      const nodeWidth = 264;
      const horizontalGap = GENERATION_OUTPUT_HORIZONTAL_GAP;
      const verticalGap = 40;
      const nextX = generationNode.x + Math.max(1, generationNode.displayWidth ?? 340) + horizontalGap;
      let nextY = generationNode.y;
      const placed: BoardNode[] = additions.map((node) => {
        const displayWidth = Math.max(1, node.displayWidth ?? nodeWidth);
        const displayHeight = "width" in node && "height" in node && node.width && node.height
          ? displayWidth * node.height / node.width
          : displayWidth;
        const placedNode = { ...node, x: nextX, y: nextY } as BoardNode;
        nextY += displayHeight + verticalGap;
        return placedNode;
      });
      const succeeded = Boolean(result.jobId) && !result.error;
      const updatedNodes = current.nodes.map((node) => {
        if (node.id === generationNodeId && isBoardGenerationNode(node)) {
          return {
            ...node,
            status: succeeded ? "succeeded" as const : "failed" as const,
            lastGenerationId: succeeded ? result.jobId : node.lastGenerationId,
            error: result.error
          };
        }
        if (isBoardImageNode(node)) {
          const recovered = recoveredImageByPath.get(node.imagePath);
          if (recovered) {
            return {
              ...node,
              width: recovered.width,
              height: recovered.height
            };
          }
        }
        return node;
      });
      const connections = [...(current.connections ?? [])];
      for (const node of placed) {
        if (!isBoardImageNode(node)) continue;
        if (connections.some((connection) => connection.source === generationNodeId && connection.target === node.id)) continue;
        connections.push({
          id: crypto.randomUUID(),
          source: generationNodeId,
          target: node.id,
          sourceHandle: "source-right",
          targetHandle: "target-left",
          kind: "visual",
          label: "生成结果",
          sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
          targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
          routing: { mode: "auto", kind: "curved", waypoints: [] }
        });
      }
      const nodes = reflowGenerationOutputNodes(
        [...updatedNodes, ...placed],
        connections,
        generationNodeId
      );
      await this.saveBoardUnlocked({ id, nodes, connections });
      return true;
    });
  }

  /** 原子落盘视频生成节点终态、视频结果节点和结果连线。 */
  async startVideoGenerationNode(
    id: string,
    generationNodeId: string,
    attempt: { jobId: string; status: "submitting" | "queued" | "generating" }
  ): Promise<boolean> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return false;
      const generation = current.nodes.find((node) => node.id === generationNodeId && isBoardVideoGenerationNode(node));
      if (!generation || !isBoardVideoGenerationNode(generation)) return false;
      const placeholderId = `video-output-${attempt.jobId}`;
      const pendingPlaceholderId = `video-output-pending-${generationNodeId}`;
      const existing = current.nodes.find((node) => (
        (node.id === placeholderId || node.id === pendingPlaceholderId) && isBoardVideoNode(node)
      ));
      const ownsGeneration = generation.status === "submitting"
        || !generation.lastGenerationId
        || generation.lastGenerationId === attempt.jobId;
      const x = generation.x + Math.max(1, generation.displayWidth ?? 340)
        + GENERATION_OUTPUT_HORIZONTAL_GAP;
      const placeholder: BoardVideoNode = existing && isBoardVideoNode(existing) && existing.status === "completed" ? existing
        : existing && isBoardVideoNode(existing) ? {
        ...existing,
        id: placeholderId,
        jobId: attempt.jobId,
        aspectRatio: existing.aspectRatio ?? generation.aspectRatio ?? "16:9",
        status: attempt.status,
        error: undefined
      } : {
        id: placeholderId,
        type: "video",
        videoPath: "",
        jobId: attempt.jobId,
        source: "generated",
        generationNodeId,
        aspectRatio: generation.aspectRatio ?? "16:9",
        status: attempt.status,
        x,
        y: generation.y
      };
      const nodes = current.nodes.map((node) => {
        if (ownsGeneration && node.id === generationNodeId && isBoardVideoGenerationNode(node)) {
          return { ...node, status: attempt.status, lastGenerationId: attempt.jobId, error: undefined };
        }
        return node.id === existing?.id ? placeholder : node;
      });
      if (!existing) nodes.push(placeholder);
      const connections = (current.connections ?? []).map((connection) => (
        connection.source === generationNodeId
          && (connection.target === placeholderId || connection.target === pendingPlaceholderId)
          ? {
              ...connection,
              target: placeholderId,
              sourceAnchor: { side: "right" as const, ratio: 0.5, mode: "pinned" as const },
              targetAnchor: { side: "left" as const, ratio: 0.5, mode: "pinned" as const },
              routing: { mode: "auto" as const, kind: "curved" as const, waypoints: [] }
            }
          : connection
      ));
      if (!connections.some((connection) => connection.source === generationNodeId && connection.target === placeholderId)) {
        connections.push({
          id: crypto.randomUUID(), source: generationNodeId, target: placeholderId,
          sourceHandle: "source-right", targetHandle: "target-left", kind: "visual", label: "生成结果",
          sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
          targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
          routing: { mode: "auto", kind: "curved", waypoints: [] }
        });
      }
      await this.saveBoardUnlocked({
        id,
        nodes: reflowGenerationOutputNodes(nodes, connections, generationNodeId),
        connections
      });
      return true;
    });
  }

  /** 原子落盘视频生成节点终态、视频结果节点和结果连线。 */
  async finishVideoGenerationNode(
    id: string,
    generationNodeId: string,
    result: { jobId?: string; node?: Omit<BoardVideoNode, "x" | "y">; error?: string }
  ): Promise<boolean> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return false;
      if (!current.nodes.some((node) => node.id === generationNodeId && isBoardVideoGenerationNode(node))) {
        return false;
      }

      const placeholder = result.jobId
        ? current.nodes.find((node) => isBoardVideoNode(node) && node.jobId === result.jobId)
        : current.nodes.find((node) => isBoardVideoNode(node) && node.generationNodeId === generationNodeId && !node.videoPath);
      const duplicate = result.node
        ? current.nodes.find((node) => isBoardVideoNode(node) && Boolean(node.videoPath) && node.videoPath === result.node!.videoPath)
        : undefined;
      const succeeded = Boolean(result.jobId) && Boolean(result.node || duplicate) && !result.error;
      const generation = current.nodes.find((node): node is Extract<BoardNode, { type: "video-generation" }> => (
        node.id === generationNodeId && isBoardVideoGenerationNode(node)
      ));
      const ownsGeneration = Boolean(generation) && (
        !generation?.lastGenerationId || !result.jobId || generation.lastGenerationId === result.jobId
      );
      const nodes = current.nodes.map((node) => (
        ownsGeneration && node.id === generationNodeId && isBoardVideoGenerationNode(node)
          ? {
              ...node,
              status: succeeded ? "completed" as const : "failed" as const,
              lastGenerationId: result.jobId ?? node.lastGenerationId,
              error: result.error
            }
          : node
      ));

      let outputNode = duplicate || placeholder;
      if (result.node && placeholder && isBoardVideoNode(placeholder)) {
        outputNode = { ...placeholder, ...result.node, id: placeholder.id, status: "completed", error: undefined };
        const index = nodes.findIndex((node) => node.id === placeholder.id);
        if (index >= 0) nodes[index] = outputNode;
      } else if (result.node && !duplicate) {
        const gap = 40;
        const x = current.nodes.length > 0
          ? Math.max(...current.nodes.map((node) => node.x + Math.max(1, node.displayWidth ?? 264))) + gap
          : 0;
        const y = current.nodes.length > 0 ? Math.min(...current.nodes.map((node) => node.y)) : 0;
        outputNode = { ...result.node, x, y };
        nodes.push(outputNode);
      } else if (!result.node && placeholder && isBoardVideoNode(placeholder)) {
        outputNode = { ...placeholder, status: "failed", error: result.error };
        const index = nodes.findIndex((node) => node.id === placeholder.id);
        if (index >= 0) nodes[index] = outputNode;
      }

      const connections = [...(current.connections ?? [])];
      if (outputNode && !connections.some((connection) => (
        connection.source === generationNodeId && connection.target === outputNode!.id
      ))) {
        connections.push({
          id: crypto.randomUUID(),
          source: generationNodeId,
          target: outputNode.id,
          sourceHandle: "source-right",
          targetHandle: "target-left",
          kind: "visual",
          label: "生成结果",
          sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
          targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
          routing: { mode: "auto", kind: "curved", waypoints: [] }
        });
      }
      await this.saveBoardUnlocked({
        id,
        nodes: reflowGenerationOutputNodes(nodes, connections, generationNodeId),
        connections
      });
      return true;
    });
  }

  /** 原子追加视频版本并激活最新版；重复恢复同一 job 或文件不会产生重复版本。 */
  async appendVideoVersions(id: string, nodeId: string, versions: BoardVideoVersion[]): Promise<boolean> {
    if (versions.length === 0) return false;
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return false;
      const target = current.nodes.find((node) => node.id === nodeId && isBoardVideoNode(node));
      if (!target || !isBoardVideoNode(target)) return false;

      const updated = appendVideoNodeVersions(target, versions);
      if (updated === target) return true;
      const nodes = current.nodes.map((node) => node.id === nodeId && isBoardVideoNode(node)
        ? updated
        : node);
      await this.saveBoardUnlocked({ id, nodes });
      return true;
    });
  }

  /** remix 完成时，原子追加目标视频版本并更新生成节点终态。 */
  async finishVideoGenerationNodeVersion(
    id: string,
    generationNodeId: string,
    targetVideoNodeId: string,
    result: { jobId?: string; version?: BoardVideoVersion; error?: string }
  ): Promise<boolean> {
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return false;
      const generationNode = current.nodes.find((node): node is Extract<BoardNode, { type: "video-generation" }> => (
        node.id === generationNodeId && isBoardVideoGenerationNode(node)
      ));
      if (!generationNode) return false;
      const target = current.nodes.find((node) => node.id === targetVideoNodeId && isBoardVideoNode(node));
      if (result.version && (!target || !isBoardVideoNode(target))) return false;

      const succeeded = Boolean(result.jobId) && Boolean(result.version) && Boolean(target) && !result.error;
      const ownsGeneration = !generationNode.lastGenerationId
        || !result.jobId
        || generationNode.lastGenerationId === result.jobId;
      const updatedTarget = result.version && target && isBoardVideoNode(target)
        ? appendVideoNodeVersions(target, [result.version])
        : target;
      const nodes = current.nodes.map((node) => {
        if (ownsGeneration && node.id === generationNodeId && isBoardVideoGenerationNode(node)) {
          return {
            ...node,
            status: succeeded ? "completed" as const : "failed" as const,
            lastGenerationId: succeeded ? result.jobId : node.lastGenerationId,
            error: result.error
          };
        }
        return node.id === targetVideoNodeId && updatedTarget ? updatedTarget : node;
      });
      await this.saveBoardUnlocked({ id, nodes });
      return true;
    });
  }

  /** 编辑完成时用户已切走画板：把新版本直接写进画板文件并激活最新版。 */
  async appendVersions(id: string, nodeId: string, versions: BoardNodeVersion[]): Promise<void> {
    if (versions.length === 0) return;
    await this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return;
      const nodes = current.nodes.map((node) => {
        if (node.id !== nodeId || !isBoardImageNode(node)) return node;
        const base: BoardNodeVersion[] = node.versions ?? [
          { imagePath: node.imagePath, jobId: node.jobId, width: node.width, height: node.height }
        ];
        const all = [...base, ...versions];
        const newest = all[all.length - 1];
        return { ...node, versions: all, activeVersion: all.length - 1, imagePath: newest.imagePath,
          jobId: newest.jobId, width: newest.width, height: newest.height };
      });
      await this.saveBoardUnlocked({ id, nodes });
    });
  }

  async removeNodes(id: string, nodeIds: string[]): Promise<BoardNodeSnapshot[]> {
    if (nodeIds.length === 0) return [];
    const targetIds = new Set(nodeIds);
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return [];
      const removed = current.nodes.filter((node) => targetIds.has(node.id));
      if (removed.length === 0) return [];
      await this.saveBoardUnlocked({
        id,
        nodes: current.nodes.filter((node) => !targetIds.has(node.id)),
        connections: (current.connections ?? []).filter((connection) => (
          !targetIds.has(connection.source) && !targetIds.has(connection.target)
        ))
      });
      return structuredClone(removed.filter(isBoardImageNode));
    });
  }

  async restoreNodes(id: string, nodes: BoardNodeSnapshot[]): Promise<boolean> {
    if (nodes.length === 0) return false;
    return this.mutations.run(async () => {
      const current = await this.readBoardFile(this.boardFile(id));
      if (!current) return false;
      const existing = new Set(current.nodes.map((node) => node.id));
      const additions = nodes.filter((node) => !existing.has(node.id));
      if (additions.length > 0) await this.saveBoardUnlocked({ id, nodes: [...current.nodes, ...additions] });
      return additions.length > 0;
    });
  }

  async getLastOpenedBoardId(): Promise<string | undefined> {
    await this.mutations.idle();
    return (await this.readState()).lastOpenedBoardId;
  }

  async setLastOpenedBoardId(id: string): Promise<void> {
    await this.mutations.run(async () => {
      const state = await this.readState();
      const board = await this.readBoardFile(this.boardFile(id));
      if (board) await this.writeBoard({ ...board, updatedAt: new Date().toISOString() });
      await writeJsonAtomic(path.join(this.boardsDir, STATE_FILE), { ...state, lastOpenedBoardId: id } satisfies BoardsState);
    });
  }

  private async requireBoard(id: string): Promise<BoardData> {
    const board = await this.readBoardFile(this.boardFile(id));
    if (!board) throw new Error("画板不存在或已移入回收站。");
    return board;
  }

  async getInstalledDemoBoardVersion(): Promise<number> {
    await this.mutations.idle();
    return (await this.readState()).installedDemoBoardVersion ?? 0;
  }

  async setInstalledDemoBoardVersion(version: number): Promise<void> {
    await this.mutations.run(async () => {
      const state = await this.readState();
      await writeJsonAtomic(path.join(this.boardsDir, STATE_FILE), {
        ...state,
        installedDemoBoardVersion: version
      } satisfies BoardsState);
    });
  }

  private async readState(): Promise<BoardsState> {
    try {
      const raw = await readFile(path.join(this.boardsDir, STATE_FILE), "utf8");
      return JSON.parse(raw) as BoardsState;
    } catch {
      return {};
    }
  }

  private boardFile(id: string): string {
    // id 是本应用生成的 uuid；仍做一次白名单过滤，防止路径穿越。
    return path.join(this.boardsDir, `${id.replace(/[^a-zA-Z0-9-]/g, "")}.json`);
  }

  private trashFile(id: string): string {
    return path.join(this.trashDir, `${sanitizeBoardId(id)}.json`);
  }

  private comicDramaReceiptFile(boardId: string, toolName: string, idempotencyKey: string): string {
    const digest = createHash("sha256")
      .update(boardId)
      .update("\0")
      .update(toolName)
      .update("\0")
      .update(idempotencyKey)
      .digest("hex");
    return path.join(this.comicDramaReceiptsDir, `${digest}.json`);
  }

  private async readTrashedBoards(): Promise<TrashedBoardRecord[]> {
    let files: string[];
    try {
      files = await readdir(this.trashDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records = await Promise.all(
      files.filter((file) => file.endsWith(".json")).map((file) => this.readTrashedBoardFile(path.join(this.trashDir, file)))
    );
    return records.filter((record): record is TrashedBoardRecord => record !== null);
  }

  private async readTrashedBoardFile(filePath: string): Promise<TrashedBoardRecord | null> {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<TrashedBoardRecord>;
      const board = normalizeStoredBoard(parsed.board);
      if (!board || !parsed.deletedAt) return null;
      return { board, deletedAt: parsed.deletedAt };
    } catch {
      return null;
    }
  }

  private async readBoardFile(filePath: string): Promise<BoardData | null> {
    const id = path.basename(filePath, ".json");
    const cached = this.cache.get(id);
    if (cached) return cloneBoard(cached);
    try {
      const raw = await readFile(filePath, "utf8");
      const board = normalizeStoredBoard(JSON.parse(raw));
      if (!board) return null;
      this.cache.set(board.id, board);
      return cloneBoard(board);
    } catch {
      return null;
    }
  }

  private async writeBoard(board: BoardData): Promise<void> {
    await writeJsonAtomic(this.boardFile(board.id), board);
    this.cache.set(board.id, cloneBoard(board));
  }

  private async reconcileImageDimensions(
    nodes: BoardNode[]
  ): Promise<{ nodes: BoardNode[]; changed: boolean }> {
    if (!this.resolveImageDimensions) return { nodes, changed: false };
    let changed = false;
    const reconciled: BoardNode[] = [];
    for (const node of nodes) {
      if (!isBoardImageNode(node)) {
        reconciled.push(node);
        continue;
      }
      const dimensions = await this.imageDimensionsFor(node.imagePath);
      let versionsChanged = false;
      const versions = node.versions
        ? await Promise.all(node.versions.map(async (version) => {
            const versionDimensions = await this.imageDimensionsFor(version.imagePath);
            if (!versionDimensions || (
              version.width === versionDimensions.width && version.height === versionDimensions.height
            )) return version;
            changed = true;
            versionsChanged = true;
            return { ...version, ...versionDimensions };
          }))
        : undefined;
      const dimensionsChanged = Boolean(dimensions) && (
        node.width !== dimensions!.width || node.height !== dimensions!.height
      );
      if (!dimensionsChanged && !versionsChanged) {
        reconciled.push(node);
        continue;
      }
      changed = true;
      reconciled.push({
        ...node,
        ...(dimensions ?? {}),
        ...(versionsChanged ? { versions } : {})
      });
    }
    return { nodes: reconciled, changed };
  }

  private imageDimensionsFor(imagePath: string): Promise<BoardImageDimensions | null> {
    const cached = this.imageDimensions.get(imagePath);
    if (cached) {
      if (cached.expiresAt <= Date.now()) {
        this.imageDimensions.delete(imagePath);
      } else {
        if (!cached.pending) {
          this.imageDimensions.delete(imagePath);
          this.imageDimensions.set(imagePath, cached);
        }
        return cached.promise;
      }
    }
    const entry: ImageDimensionsCacheEntry = {
      pending: true,
      expiresAt: Date.now() + IMAGE_DIMENSIONS_PENDING_TTL_MS,
      promise: Promise.resolve(null)
    };
    entry.promise = Promise.resolve(this.resolveImageDimensions?.(imagePath) ?? null)
      .catch(() => null)
      .then((dimensions) => {
        entry.pending = false;
        entry.expiresAt = Date.now() + IMAGE_DIMENSIONS_CACHE_TTL_MS;
        if (this.imageDimensions.get(imagePath) === entry) {
          this.imageDimensions.delete(imagePath);
          this.imageDimensions.set(imagePath, entry);
          this.trimImageDimensionsCache();
        }
        return dimensions;
    });
    this.imageDimensions.set(imagePath, entry);
    this.trimImageDimensionsCache();
    return entry.promise;
  }

  private trimImageDimensionsCache(): void {
    for (const [imagePath, entry] of this.imageDimensions) {
      if (this.imageDimensions.size <= IMAGE_DIMENSIONS_CACHE_LIMIT) return;
      if (!entry.pending) this.imageDimensions.delete(imagePath);
    }
    while (this.imageDimensions.size > IMAGE_DIMENSIONS_CACHE_LIMIT) {
      const oldest = this.imageDimensions.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.imageDimensions.delete(oldest);
    }
  }

  private async storageBytesFor(
    board: BoardData,
    sizeByPath: Map<string, Promise<number>> = new Map()
  ): Promise<number> {
    const fingerprint = boardStorageFingerprint(board);
    const cached = this.storageBytes.get(board.id);
    if (cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) return cached.storageBytes;
    const storageBytes = await boardStorageBytes(board, sizeByPath);
    this.storageBytes.set(board.id, {
      fingerprint,
      storageBytes,
      expiresAt: Date.now() + STORAGE_BYTES_CACHE_TTL_MS
    });
    return storageBytes;
  }
}

function sanitizeBoardId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "");
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function appendVideoNodeVersions(node: BoardVideoNode, versions: BoardVideoVersion[]): BoardVideoNode {
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

function isManagedBoardNode(node: BoardNode): node is ComicDramaBoardSnapshot["nodes"][number] {
  return isComicDramaNode(node) || isBoardVideoSequenceEntryNode(node);
}

function isPreservedWorkflowNode(node: BoardNode): boolean {
  return isManagedBoardNode(node) || isBoardComicDramaEntryNode(node);
}

function mergeManagedNodes(current: BoardNode[], incoming: BoardNode[], replaceManagedNodes = false): BoardNode[] {
  if (replaceManagedNodes || incoming.some(isPreservedWorkflowNode)) return incoming;
  return [...incoming, ...current.filter(isPreservedWorkflowNode)];
}

function mergeManagedConnections(currentNodes: BoardNode[], current: BoardConnection[], incoming: BoardConnection[], replaceManagedNodes = false): BoardConnection[] {
  if (replaceManagedNodes || incoming.some((connection) => connection.versionBinding)) return incoming;
  const managedIds = new Set(currentNodes.filter(isPreservedWorkflowNode).map((node) => node.id));
  const retained = current.filter((connection) => managedIds.has(connection.source) || managedIds.has(connection.target));
  const incomingIds = new Set(incoming.map((connection) => connection.id));
  return [...incoming, ...retained.filter((connection) => !incomingIds.has(connection.id))];
}

function boardConnectionKey(connection: BoardConnection): string {
  return `${connection.kind ?? "visual"}:${connection.source}:${connection.target}:${connection.sourceHandle ?? ""}:${connection.targetHandle ?? ""}`;
}

function assertAcyclicReferenceConnections(connections: BoardConnection[]): void {
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

function prepareBoardMutationPlan(plan: BoardMutationPlan, board: BoardData): {
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

function cloneBoard(board: BoardData): BoardData {
  return structuredClone(board);
}

function uniqueNodeIds(nodeIds: string[]): string[] {
  return [...new Set(nodeIds.filter((nodeId) => typeof nodeId === "string" && Boolean(nodeId.trim())))];
}

function requireImageNode(nodes: BoardNode[], nodeId: string): BoardNodeSnapshot {
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) throw new Error(`画板中不存在图片节点：${nodeId}`);
  if (!isBoardImageNode(target)) throw new Error(`指定节点不是图片节点：${nodeId}`);
  return target;
}

function renderedImageHeight(node: BoardNodeSnapshot): number {
  const displayWidth = node.displayWidth ?? DEFAULT_IMAGE_NODE_WIDTH;
  return node.width && node.height ? displayWidth * node.height / node.width : displayWidth;
}

function reflowGenerationOutputNodes(
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

function renderedOutputHeight(node: BoardNodeSnapshot | BoardVideoNode): number {
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

function normalizeStoredBoard(value: unknown): BoardData | null {
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
    videoSequences: Array.isArray(parsed.videoSequences) ? structuredClone(parsed.videoSequences) : []
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

function boardStoragePaths(board: BoardData): string[] {
  const mediaPaths = new Set<string>();
  const addMediaPath = (mediaPath: string | undefined): void => {
    if (mediaPath) mediaPaths.add(path.resolve(mediaPath));
  };
  for (const node of board.nodes) {
    if (isBoardImageNode(node)) {
      addMediaPath(node.imagePath);
      for (const version of node.versions ?? []) addMediaPath(version.imagePath);
    } else if (isBoardVideoNode(node)) {
      addMediaPath(node.videoPath);
      addMediaPath(node.posterPath);
      for (const version of node.versions ?? []) {
        addMediaPath(version.videoPath);
        addMediaPath(version.posterPath);
      }
    }
  }
  return [...mediaPaths].sort();
}

async function boardStorageBytes(
  board: BoardData,
  sizeByPath: Map<string, Promise<number>> = new Map()
): Promise<number> {
  const sizes = await Promise.all(boardStoragePaths(board).map((imagePath) => {
    let size = sizeByPath.get(imagePath);
    if (!size) {
      size = stat(imagePath)
        .then((info) => info.isFile() ? info.size : 0)
        .catch(() => 0);
      sizeByPath.set(imagePath, size);
    }
    return size;
  }));
  return sizes.reduce((total, size) => total + size, 0);
}

function toTrashedSummary(
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

function nextDefaultName(existing: BoardData[]): string {
  const used = new Set(existing.map((board) => board.name));
  let index = existing.length + 1;
  let name = `画板 ${index}`;
  while (used.has(name)) {
    index += 1;
    name = `画板 ${index}`;
  }
  return name;
}
