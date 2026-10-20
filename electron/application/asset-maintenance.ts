import path from "node:path";
import { isBoardImageNode, isBoardVideoNode, isBoardVideoGenerationNode } from "../../shared/types.js";
import type { AssetStore } from "../storage/asset-store.js";
import type { BoardStore } from "../storage/board-store.js";
import type { HistoryStore } from "../storage/history-store.js";
import type { VideoTaskStore } from "../storage/video-task-store.js";
import type { SceneMediaStore } from "../storage/scene-media-store.js";
import type { CommentStore } from "../storage/comment-store.js";
import type { AssetMetaStore } from "../storage/asset-meta-store.js";
import type { BoardImageTrashStore } from "../storage/board-image-trash-store.js";
import type { AssistantConversationStore } from "../storage/assistant-conversation-store.js";
import type { MemoryStore } from "../storage/memory-store.js";
import type { SettingsStore } from "../storage/settings-store.js";
import type { ModificationRequests } from "./modification-requests.js";

interface AssetMaintenanceDependencies {
  assets: Pick<AssetStore, "collectGarbage" | "pruneThumbnailCache">;
  boards: Pick<BoardStore, "listAllBoards" | "purgeExpiredTrashedBoards">;
  history: Pick<HistoryStore, "listJobs" | "removeJobsByBoard">;
  videoTasks: Pick<VideoTaskStore, "listJobs" | "removeJobsByBoard">;
  sceneMedia: Pick<SceneMediaStore, "list">;
  comments: Pick<CommentStore, "list">;
  assetMeta: Pick<AssetMetaStore, "list">;
  boardImageTrash: Pick<BoardImageTrashStore, "referencedAssetPaths" | "purgeExpired">;
  assistantConversations: Pick<AssistantConversationStore, "list">;
  memories: Pick<MemoryStore, "removeScope">;
  settings: Pick<SettingsStore, "getSettings">;
  modifications: Pick<ModificationRequests, "list">;
  onAssetsChanged: () => void;
}

/** Owns cross-store retention policy and its background lifecycle. */
export function createAssetMaintenance(dependencies: AssetMaintenanceDependencies) {
  const { assets, boards, history, videoTasks, sceneMedia, comments, assetMeta,
    boardImageTrash, assistantConversations, memories, settings, modifications, onAssetsChanged } = dependencies;
  let disposed = false;
  const garbageTimers = new Set<ReturnType<typeof setTimeout>>();
  async function referencedAssetPaths(): Promise<Set<string>> {
    const [allBoards, jobs, videoJobs, scenes, allComments, allAssetMeta, trashedImagePaths, allConversations] = await Promise.all([
      boards.listAllBoards(),
      history.listJobs(),
      videoTasks.listJobs(),
      sceneMedia.list(),
      comments.list(),
      assetMeta.list(),
      boardImageTrash.referencedAssetPaths(),
      assistantConversations.list()
    ]);
    const referenced = new Set<string>();
    for (const request of await modifications.list()) {
      for (const item of [request.sourcePath,request.annotationPath,request.maskPath,...request.referencePaths,...(request.resultPaths??[])]) {
        if (item) referenced.add(path.resolve(item));
      }
    }
    for (const conversation of allConversations) {
      for (const attachment of conversation.attachments ?? []) {
        if (attachment.path) referenced.add(path.resolve(attachment.path));
      }
    }
    for (const board of allBoards) for (const node of board.nodes) {
      if (isBoardImageNode(node)) {
        referenced.add(path.resolve(node.imagePath));
        if (node.finalVersion) referenced.add(path.resolve(node.finalVersion.imagePath));
        if (node.derivation?.sourceImagePath) referenced.add(path.resolve(node.derivation.sourceImagePath));
        for (const version of node.versions ?? []) referenced.add(path.resolve(version.imagePath));
      } else if (isBoardVideoNode(node)) {
        referenced.add(path.resolve(node.videoPath));
        if (node.posterPath) referenced.add(path.resolve(node.posterPath));
        for (const version of node.versions ?? []) {
          referenced.add(path.resolve(version.videoPath));
          if (version.posterPath) referenced.add(path.resolve(version.posterPath));
        }
      } else if (isBoardVideoGenerationNode(node)) {
        if (node.sourceVideoPath) referenced.add(path.resolve(node.sourceVideoPath));
        for (const value of node.referenceVideoPaths ?? []) referenced.add(path.resolve(value));
        for (const value of node.referenceAudioPaths ?? []) referenced.add(path.resolve(value));
      }
    }
    for (const board of allBoards) for (const recipe of board.deliveryRecipes??[]) for (const item of recipe.items) referenced.add(path.resolve(item.sourceVersion.imagePath));
    for (const job of jobs) {
      for (const item of job.outputImagePaths) referenced.add(path.resolve(item));
      for (const item of job.referenceImagePaths) referenced.add(path.resolve(item));
    }
    for (const job of videoJobs) {
      const input = job.input;
      for (const item of input.referenceImagePaths) referenced.add(path.resolve(item));
      for (const item of input.referenceVideoPaths ?? []) referenced.add(path.resolve(item));
      for (const item of input.referenceAudioPaths ?? []) referenced.add(path.resolve(item));
      if (input.sourceVideoPath) referenced.add(path.resolve(input.sourceVideoPath));
      if (input.firstFramePath) referenced.add(path.resolve(input.firstFramePath));
      if (input.lastFramePath) referenced.add(path.resolve(input.lastFramePath));
      if (job.outputVideoPath) referenced.add(path.resolve(job.outputVideoPath));
      if (job.outputPosterPath) referenced.add(path.resolve(job.outputPosterPath));
    }
    for (const scene of scenes) {
      for (const result of scene.results) referenced.add(path.resolve(result.path));
      for (const cover of scene.covers) {
        referenced.add(path.resolve(cover.path));
        referenced.add(path.resolve(cover.sourcePath));
      }
    }
    for (const comment of allComments) referenced.add(path.resolve(comment.imagePath));
    for (const meta of allAssetMeta) {
      if (meta.favorite || meta.tags.length > 0) referenced.add(path.resolve(meta.imagePath));
    }
    for (const imagePath of trashedImagePaths) referenced.add(imagePath);
    return referenced;
  }

  async function collectAssetGarbage(): Promise<void> {
    await assets.collectGarbage(await referencedAssetPaths());
    await assets.pruneThumbnailCache();
  }

  function scheduleAssetGarbageCollection(delayMs = 1_000): void {
    if (disposed) return;
    const timer = setTimeout(() => {
      garbageTimers.delete(timer);
      if (disposed) return;
      void collectAssetGarbage().catch((error) => console.warn("清理孤儿素材失败。", error));
    }, delayMs);
    garbageTimers.add(timer);
    timer.unref();
  }

  async function removeBoardAssociations(boardIds: string[]): Promise<void> {
    for (const boardId of boardIds) {
      await history.removeJobsByBoard(boardId);
      await videoTasks.removeJobsByBoard(boardId);
      await memories.removeScope("board", boardId);
    }
    if (boardIds.length > 0) {
      onAssetsChanged();
      scheduleAssetGarbageCollection();
    }
  }

  async function purgeExpiredBoardTrash(): Promise<number> {
    const retentionDays = settings.getSettings().boardTrashRetentionDays ?? 3;
    const purgedIds = await boards.purgeExpiredTrashedBoards(retentionDays);
    const purgedImages = await boardImageTrash.purgeExpired(retentionDays);
    await removeBoardAssociations(purgedIds);
    if (purgedImages.length > 0) scheduleAssetGarbageCollection();
    return purgedIds.length + purgedImages.length;
  }

  scheduleAssetGarbageCollection(30_000);
  void purgeExpiredBoardTrash().catch((error) => console.warn("自动清理画板回收站失败。", error));
  const boardTrashCleanupTimer = setInterval(() => {
    void purgeExpiredBoardTrash().catch((error) => console.warn("自动清理画板回收站失败。", error));
  }, 60 * 60 * 1_000);
  boardTrashCleanupTimer.unref();

  return {
    referencedAssetPaths,
    collectAssetGarbage,
    scheduleAssetGarbageCollection,
    removeBoardAssociations,
    purgeExpiredBoardTrash,
    dispose(): void {
      disposed = true;
      clearInterval(boardTrashCleanupTimer);
      for (const timer of garbageTimers) clearTimeout(timer);
      garbageTimers.clear();
    }
  };
}
