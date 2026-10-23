import type { CanvasNodeWriteInput } from "../shared/contracts/board.js";
import { ipcMain } from "electron";
import {
  isBoardImageNode,
  isBoardVideoGenerationNode,
  isBoardVideoNode,
  type BoardDetail,
  type BoardNode,
  type BoardNodeVersion,
  type BoardSavePayload,
  type RestoreTrashedBoardImageResult,
  type UnpositionedBoardNode
} from "../shared/types.js";
import { AssetStore } from "./storage/asset-store.js";
import { BoardImageTrashStore } from "./storage/board-image-trash-store.js";
import { BoardStore } from "./storage/board-store.js";
import { SettingsStore } from "./storage/settings-store.js";
import { VideoTaskStore } from "./storage/video-task-store.js";

interface BoardIpcDependencies {
  assets: Pick<AssetStore, "isReadable" | "toAssetUrl">;
  boards: BoardStore;
  boardImageTrash: BoardImageTrashStore;
  settings: Pick<SettingsStore, "getSettings">;
  videoIpc: { stopBoard: (boardId: string) => Promise<void> };
  videoTasks: Pick<VideoTaskStore, "removeJobsByBoard">;
  invalidateAssetCatalog: () => void;
  purgeExpiredBoardTrash: () => Promise<number>;
  removeBoardAssociations: (boardIds: string[]) => Promise<void>;
  scheduleAssetGarbageCollection: () => void;
  trackBoardOpened: () => void;
  trackBoardCreated: () => void;
}

export function registerBoardIpc({
  assets,
  boards,
  boardImageTrash,
  settings,
  videoIpc,
  videoTasks,
  invalidateAssetCatalog,
  purgeExpiredBoardTrash,
  removeBoardAssociations,
  scheduleAssetGarbageCollection,
  trackBoardOpened,
  trackBoardCreated
}: BoardIpcDependencies): void {
  ipcMain.handle("boards:list", async () => {
    await purgeExpiredBoardTrash();
    return boards.listSummaries();
  });

  ipcMain.handle("boards:get", async (_event, id: string): Promise<BoardDetail | null> => {
    const board = await boards.getBoardWithVerifiedImageDimensions(id);
    if (!board) return null;
    const paths = new Set<string>();
    for (const node of board.nodes) {
      if (isBoardImageNode(node)) {
        paths.add(node.imagePath);
        for (const version of node.versions ?? []) paths.add(version.imagePath);
      } else if (isBoardVideoNode(node)) {
        paths.add(node.videoPath);
        if (node.posterPath) paths.add(node.posterPath);
        for (const version of node.versions ?? []) {
          paths.add(version.videoPath);
          if (version.posterPath) paths.add(version.posterPath);
        }
      } else if (isBoardVideoGenerationNode(node)) {
        if (node.sourceVideoPath) paths.add(node.sourceVideoPath);
        for (const value of node.referenceVideoPaths ?? []) paths.add(value);
        for (const value of node.referenceAudioPaths ?? []) paths.add(value);
      }
    }
    const readableByPath = new Map(
      await Promise.all(
        [...paths].map(async (imagePath) => {
          try {
            return [imagePath, await assets.isReadable(imagePath)] as const;
          } catch {
            return [imagePath, false] as const;
          }
        })
      )
    );
    const images: Record<string, string> = {};
    const media: Record<string, string> = {};
    const readableNodes: BoardNode[] = [];
    for (const node of board.nodes) {
      if (isBoardVideoNode(node)) {
        if (node.videoPath && !readableByPath.get(node.videoPath)) continue;
        if (node.videoPath) media[node.videoPath] ||= assets.toAssetUrl(node.videoPath);
        if (node.posterPath && readableByPath.get(node.posterPath)) media[node.posterPath] ||= assets.toAssetUrl(node.posterPath);
        for (const version of node.versions ?? []) {
          if (readableByPath.get(version.videoPath)) media[version.videoPath] ||= assets.toAssetUrl(version.videoPath);
          if (version.posterPath && readableByPath.get(version.posterPath)) media[version.posterPath] ||= assets.toAssetUrl(version.posterPath);
        }
        readableNodes.push(node);
        continue;
      }
      if (isBoardVideoGenerationNode(node)) {
        const mediaPaths = [node.sourceVideoPath, ...(node.referenceVideoPaths ?? []), ...(node.referenceAudioPaths ?? [])]
          .filter((value): value is string => Boolean(value));
        for (const mediaPath of mediaPaths) {
          if (readableByPath.get(mediaPath)) media[mediaPath] ||= assets.toAssetUrl(mediaPath);
        }
        readableNodes.push(node);
        continue;
      }
      if (!isBoardImageNode(node)) {
        readableNodes.push(node);
        continue;
      }
      try {
        if (!readableByPath.get(node.imagePath)) continue;
        images[node.imagePath] ||= assets.toAssetUrl(node.imagePath);
        readableNodes.push(node);
      } catch {
        // 资产文件丢失：跳过该节点，画板其余内容照常打开。
        continue;
      }
      // 版本链的图片也一并附上（个别版本文件丢失不影响节点本身）。
      for (const version of node.versions ?? []) {
        try {
          if (readableByPath.get(version.imagePath)) {
            images[version.imagePath] ||= assets.toAssetUrl(version.imagePath);
          }
        } catch {
          /* 忽略丢失的版本 */
        }
      }
    }
    trackBoardOpened();
    return { ...board, nodes: readableNodes, images, media };
  });

  ipcMain.handle("boards:create", async (_event, name?: string) => {
    const board = await boards.createBoard(name);
    invalidateAssetCatalog();
    trackBoardCreated();
    return board;
  });

  ipcMain.handle("boards:createComicDramaProject", async (_event, input) => {
    const result = await boards.createComicDramaProject(input);
    invalidateAssetCatalog();
    trackBoardCreated();
    return result;
  });

  ipcMain.handle("boards:save", async (_event, payload: BoardSavePayload) => {
    const { summary, assetCatalogChanged } = await boards.saveBoardWithSummary(payload);
    if (assetCatalogChanged) invalidateAssetCatalog();
    return summary;
  });

  ipcMain.handle("boards:images:move", async (_event, boardId: unknown, nodeId: unknown, x: unknown, y: unknown) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。");
    if (typeof nodeId !== "string" || !nodeId.trim()) throw new Error("缺少图片节点 ID。");
    if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
      throw new Error("图片坐标必须是有限数字。");
    }
    const result = await boards.moveImageNode(boardId, nodeId, { x, y });
    return {
      boardId,
      nodeId,
      previous: result.previous,
      position: { x: result.node.x, y: result.node.y }
    };
  });

  ipcMain.handle("boards:images:resize", async (_event, boardId: unknown, nodeId: unknown, displayWidth: unknown) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。");
    if (typeof nodeId !== "string" || !nodeId.trim()) throw new Error("缺少图片节点 ID。");
    if (typeof displayWidth !== "number" || !Number.isFinite(displayWidth) || displayWidth < 120 || displayWidth > 600) {
      throw new Error("图片展示宽度必须在 120-600 之间。");
    }
    return { boardId, nodeId, ...(await boards.resizeImageNode(boardId, nodeId, displayWidth)) };
  });

  ipcMain.handle("boards:images:arrange", async (
    _event,
    boardId: unknown,
    rawNodeIds: unknown,
    mode: unknown,
    rawGap: unknown
  ) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。");
    if (!Array.isArray(rawNodeIds)) throw new Error("缺少要排列的图片节点。");
    if (mode !== "horizontal" && mode !== "vertical" && mode !== "grid") throw new Error("不支持的图片排列方式。");
    const nodeIds = [...new Set(rawNodeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
    const gap = rawGap === undefined ? 40 : rawGap;
    if (typeof gap !== "number" || !Number.isFinite(gap) || gap < 0 || gap > 1_000) {
      throw new Error("图片间距必须在 0-1000 之间。");
    }
    return { boardId, mode, gap, positions: await boards.arrangeImageNodes(boardId, nodeIds, mode, gap) };
  });

  ipcMain.handle("boards:images:duplicate", async (
    _event,
    boardId: unknown,
    rawNodeIds: unknown,
    rawOffset: unknown
  ) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。");
    if (!Array.isArray(rawNodeIds)) throw new Error("缺少要复制的图片节点。");
    const nodeIds = [...new Set(rawNodeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
    const offset = rawOffset === undefined ? 24 : rawOffset;
    if (typeof offset !== "number" || !Number.isFinite(offset) || Math.abs(offset) > 10_000) {
      throw new Error("图片复制偏移必须是 -10000 到 10000 之间的数字。");
    }
    const copies = await boards.duplicateImageNodes(boardId, nodeIds, offset);
    invalidateAssetCatalog();
    return {
      boardId,
      copies: copies.map((copy) => ({
        sourceNodeId: copy.sourceNodeId,
        nodeId: copy.node.id,
        x: copy.node.x,
        y: copy.node.y
      }))
    };
  });

  ipcMain.handle("boards:images:setVersion", async (
    _event,
    boardId: unknown,
    nodeId: unknown,
    versionIndex: unknown
  ) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。");
    if (typeof nodeId !== "string" || !nodeId.trim()) throw new Error("缺少图片节点 ID。");
    if (typeof versionIndex !== "number" || !Number.isInteger(versionIndex)) throw new Error("图片版本索引必须是整数。");
    const result = await boards.setImageNodeVersion(boardId, nodeId, versionIndex);
    if (result.previousVersionIndex !== result.versionIndex) invalidateAssetCatalog();
    return {
      boardId,
      nodeId,
      previousVersionIndex: result.previousVersionIndex,
      versionIndex: result.versionIndex,
      versionCount: result.versionCount,
      imagePath: result.node.imagePath
    };
  });

  ipcMain.handle("boards:rename", async (_event, id: string, name: string) => {
    const board = await boards.renameBoard(id, name);
    invalidateAssetCatalog();
    return board ? boards.summarize(board) : null;
  });

  ipcMain.handle("boards:duplicate", async (_event, id: string) => {
    const board = await boards.duplicateBoard(id);
    invalidateAssetCatalog();
    return board ? boards.summarize(board) : null;
  });

  ipcMain.handle("boards:delete", async (_event, id: string) => {
    const moved = await boards.trashBoard(id);
    if (moved) {
      await videoIpc.stopBoard(id);
      await videoTasks.removeJobsByBoard(id);
    }
    invalidateAssetCatalog();
    return { ok: moved };
  });

  ipcMain.handle("boards:trash:list", async () => {
    await purgeExpiredBoardTrash();
    const retentionDays = settings.getSettings().boardTrashRetentionDays ?? 3;
    return boards.listTrashedBoards(retentionDays);
  });

  ipcMain.handle("boards:trash:restore", async (_event, id: string) => {
    const board = await boards.restoreBoard(id);
    if (!board) return null;
    invalidateAssetCatalog();
    return boards.summarize(board);
  });

  ipcMain.handle("boards:trash:delete", async (_event, id: string) => {
    const deleted = await boards.deleteTrashedBoard(id);
    if (deleted) await removeBoardAssociations([id]);
    return { ok: deleted };
  });

  ipcMain.handle("boards:trash:empty", async () => {
    const deletedIds = await boards.emptyTrash();
    await removeBoardAssociations(deletedIds);
    return { ok: true, count: deletedIds.length };
  });

  // ---------- 画板内图片回收站 ----------

  ipcMain.handle("boards:images:trash:list", async () => {
    await purgeExpiredBoardTrash();
    const retentionDays = settings.getSettings().boardTrashRetentionDays ?? 3;
    const records = await boardImageTrash.list(retentionDays);
    return Promise.all(records.map(async (record) => ({
      ...record,
      ...(await assets.isReadable(record.node.imagePath)
        ? { previewUrl: assets.toAssetUrl(record.node.imagePath) }
        : {})
    })));
  });

  ipcMain.handle("boards:images:trash:move", async (_event, boardId: unknown, rawNodeIds: unknown) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。 ");
    if (!Array.isArray(rawNodeIds)) throw new Error("缺少要移除的图片。");
    const nodeIds = [...new Set(rawNodeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))];
    const board = await boards.getBoard(boardId);
    if (!board) throw new Error("画板不存在或已移入回收站。 ");
    const nodes = board.nodes.filter(isBoardImageNode).filter((node) => nodeIds.includes(node.id));
    if (nodes.length === 0) return { count: 0 };
    const trashed = await boardImageTrash.add(board.id, board.name, nodes);
    const removed = await boards.removeNodes(board.id, nodes.map((node) => node.id));
    invalidateAssetCatalog();
    return {
      count: removed.length,
      items: trashed.map((item) => ({ trashId: item.id, nodeId: item.node.id }))
    };
  });

  ipcMain.handle("boards:images:trash:restore", async (_event, id: unknown): Promise<RestoreTrashedBoardImageResult | null> => {
    if (typeof id !== "string" || !id.trim()) throw new Error("缺少回收站图片 ID。 ");
    const record = await boardImageTrash.get(id);
    if (!record) return null;
    if (!(await assets.isReadable(record.node.imagePath))) {
      throw new Error("图片文件已丢失，无法恢复。 ");
    }
    const restored = await boards.restoreNodes(record.boardId, [record.node]);
    if (!restored) throw new Error("来源画板不存在，或图片已经恢复。 ");
    await boardImageTrash.delete(id);
    invalidateAssetCatalog();
    const paths = [record.node.imagePath, ...(record.node.versions ?? []).map((version) => version.imagePath)];
    const imageUrls: Record<string, string> = {};
    for (const imagePath of paths) {
      if (await assets.isReadable(imagePath)) imageUrls[imagePath] = assets.toAssetUrl(imagePath);
    }
    return { item: record, imageUrls };
  });

  ipcMain.handle("boards:images:trash:delete", async (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim()) throw new Error("缺少回收站图片 ID。 ");
    const deleted = await boardImageTrash.delete(id);
    if (deleted) scheduleAssetGarbageCollection();
    return { ok: deleted };
  });

  ipcMain.handle("boards:images:trash:empty", async () => {
    const deleted = await boardImageTrash.empty();
    if (deleted.length > 0) scheduleAssetGarbageCollection();
    return { ok: true, count: deleted.length };
  });

  ipcMain.handle("boards:canvas:write", async (_event, input: CanvasNodeWriteInput) => boards.writeCanvasNode(input));

  ipcMain.handle(
    "boards:appendNodes",
    async (_event, id: string, nodes: UnpositionedBoardNode[]) => {
      await boards.appendNodes(id, nodes);
      invalidateAssetCatalog();
      return { ok: true };
    }
  );

  ipcMain.handle(
    "boards:appendVersions",
    async (_event, id: string, nodeId: string, versions: BoardNodeVersion[]) => {
      await boards.appendVersions(id, nodeId, versions);
      invalidateAssetCatalog();
      return { ok: true };
    }
  );

  ipcMain.handle("boards:getState", async () => ({ lastOpenedBoardId: await boards.getLastOpenedBoardId() }));

  ipcMain.handle("boards:setLastOpened", async (_event, id: string) => {
    await boards.setLastOpenedBoardId(id);
    return { ok: true };
  });


}
