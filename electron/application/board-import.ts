import path from "node:path";
import { parseBoardArchive } from "../board-archive.js";
import { remapGenerationHistorySnapshot } from "../../shared/generation-history.js";
import { remapFinalVersion, remapImageDeliveryMetadata } from "../../shared/image-delivery.js";
import { isBoardImageNode, isBoardVideoNode, isBoardVideoGenerationNode, type BoardNode, type BoardConnection } from "../../shared/types.js";
import type { AssetStore } from "../storage/asset-store.js";
import type { BoardStore } from "../storage/board-store.js";
import type { HistoryStore } from "../storage/history-store.js";
import type { VideoTaskStore } from "../storage/video-task-store.js";
import type { VideoSequenceStore } from "../storage/video-sequence-store.js";
import type { CommentStore } from "../storage/comment-store.js";
import type { AssetMetaStore } from "../storage/asset-meta-store.js";

export interface BoardImportDependencies {
  assets: Pick<AssetStore, "saveImportedImage">;
  boards: Pick<BoardStore, "saveBoard" | "summarize">;
  history: Pick<HistoryStore, "importMany">;
  videoTasks: Pick<VideoTaskStore, "importMany">;
  videoSequences: Pick<VideoSequenceStore, "importMany">;
  comments: Pick<CommentStore, "importMany">;
  assetMeta: Pick<AssetMetaStore, "importMany">;
  onImported: () => void;
}

/** Shared archive-import use case. IPC only selects a file or supplies bytes. */
export async function importBoardBuffer(buffer: Buffer, dependencies: BoardImportDependencies) {
    const { assets, boards, history, videoTasks, videoSequences, comments, assetMeta, onImported } = dependencies;
    const parsed = await parseBoardArchive(buffer);
    const newBoardId = crypto.randomUUID();

    // 包内图片复制进本机资产库，并建立 相对路径 -> 新绝对路径 的映射。
    const pathMap = new Map<string, string>();
    const importedMedia = [...parsed.media];
    for (let offset = 0; offset < importedMedia.length; offset += 4) {
      await Promise.all(
        importedMedia.slice(offset, offset + 4).map(async ([relative, bytes]) => {
          const saved = await assets.saveImportedImage(newBoardId, relative.replaceAll("/", "-"), bytes);
          pathMap.set(relative, saved);
        })
      );
    }

    // 节点/历史 id 全部重新生成：同一个包可以反复导入而互不干扰。
    const jobIdMap = new Map([...parsed.jobs, ...parsed.videoJobs].map((job) => [job.id, crypto.randomUUID()]));
    const nodeIdMap = new Map(parsed.board.nodes.map((node) => [node.id, crypto.randomUUID()]));
    const nodes = parsed.board.nodes.flatMap((node): BoardNode[] => {
        const id = nodeIdMap.get(node.id)!;
        if (isBoardVideoNode(node)) {
          if (!pathMap.has(node.videoPath)) return [];
          const versions = node.versions
            ?.filter((version) => pathMap.has(version.videoPath))
            .map((version) => ({
              ...version,
              videoPath: pathMap.get(version.videoPath)!,
              posterPath: version.posterPath ? pathMap.get(version.posterPath) : undefined,
              jobId: jobIdMap.get(version.jobId) ?? version.jobId
            }));
          const activeIndex = versions?.findIndex((version) => version.videoPath === pathMap.get(node.videoPath));
          return [{
            ...node,
            id,
            videoPath: pathMap.get(node.videoPath)!,
            posterPath: node.posterPath ? pathMap.get(node.posterPath) : undefined,
            jobId: jobIdMap.get(node.jobId) ?? node.jobId,
            versions: versions && versions.length > 1 ? versions : undefined,
            activeVersion: versions && versions.length > 1
              ? (activeIndex !== undefined && activeIndex >= 0 ? activeIndex : versions.length - 1)
              : undefined
          }];
        }
        if (isBoardVideoGenerationNode(node)) {
          return [{
            ...node,
            id,
            sourceVideoPath: node.sourceVideoPath ? pathMap.get(node.sourceVideoPath) ?? node.sourceVideoPath : undefined,
            referenceVideoPaths: (node.referenceVideoPaths ?? []).map((value) => pathMap.get(value) ?? value),
            referenceAudioPaths: (node.referenceAudioPaths ?? []).map((value) => pathMap.get(value) ?? value),
            targetVideoNodeId: node.targetVideoNodeId
              ? nodeIdMap.get(node.targetVideoNodeId) ?? node.targetVideoNodeId
              : undefined,
            ...(node.lastGenerationId
              ? { lastGenerationId: jobIdMap.get(node.lastGenerationId) ?? node.lastGenerationId }
              : {})
          }];
        }
        if (!isBoardImageNode(node)) {
          return [{
            ...node,
            id,
            ...(node.type === "generation" && node.lastGenerationId
              ? { lastGenerationId: jobIdMap.get(node.lastGenerationId) ?? node.lastGenerationId }
              : {})
          }];
        }
        if (!pathMap.has(node.imagePath)) return [];
        const versions = node.versions
          ?.filter((version) => pathMap.has(version.imagePath))
          .map((version) => ({
            ...version,
            imagePath: pathMap.get(version.imagePath)!,
            jobId: jobIdMap.get(version.jobId) ?? version.jobId
          }));
        const activeIndex = versions?.findIndex((version) => version.imagePath === pathMap.get(node.imagePath));
        return [{
          ...node,
          id,
          imagePath: pathMap.get(node.imagePath)!,
          finalVersion: remapFinalVersion(node.finalVersion,p=>pathMap.get(p)??`missing/${path.basename(p)}`,id=>jobIdMap.get(id)??id),
          jobId: jobIdMap.get(node.jobId) ?? node.jobId,
          derivation:
            node.derivation && pathMap.has(node.derivation.sourceImagePath)
              ? {
                  ...node.derivation,
                  sourceNodeId: nodeIdMap.get(node.derivation.sourceNodeId) ?? node.derivation.sourceNodeId,
                  sourceImagePath: pathMap.get(node.derivation.sourceImagePath)!
                }
              : undefined,
          versions: versions && versions.length > 1 ? versions : undefined,
          activeVersion:
            versions && versions.length > 1
              ? activeIndex !== undefined && activeIndex >= 0
                ? activeIndex
                : versions.length - 1
              : undefined
        }];
      });
    const retainedNodeIds = new Set(nodes.map((node) => node.id));
    const connections = (parsed.board.connections ?? []).flatMap((connection): BoardConnection[] => {
      const source = nodeIdMap.get(connection.source);
      const target = nodeIdMap.get(connection.target);
      if (!source || !target || !retainedNodeIds.has(source) || !retainedNodeIds.has(target)) return [];
      return [{ ...connection, id: crypto.randomUUID(), source, target }];
    });

    const remapFrozenSequenceImage = (source: import("../../shared/types.js").FrozenImageSource) => ({
      ...source,
      nodeId: source.nodeId ? nodeIdMap.get(source.nodeId) ?? source.nodeId : undefined,
      imagePath: pathMap.get(source.imagePath) ?? source.imagePath
    });
    const importedVideoSequences = parsed.videoSequences.map((sequence) => ({
      ...sequence,
      boardId: newBoardId,
      keyframes: sequence.keyframes.map((keyframe) => ({ ...keyframe, source: remapFrozenSequenceImage(keyframe.source) })),
      segments: sequence.segments.map((segment) => ({
        ...segment,
        sourceVideo: segment.sourceVideo ? {
          ...segment.sourceVideo,
          nodeId: nodeIdMap.get(segment.sourceVideo.nodeId) ?? segment.sourceVideo.nodeId,
          videoPath: pathMap.get(segment.sourceVideo.videoPath) ?? segment.sourceVideo.videoPath,
          posterPath: segment.sourceVideo.posterPath ? pathMap.get(segment.sourceVideo.posterPath) ?? segment.sourceVideo.posterPath : undefined
        } : undefined,
        versions: segment.versions.map((version) => ({
          ...version,
          inputSnapshot: "sourceVideo" in version.inputSnapshot ? {
            ...version.inputSnapshot,
            sourceVideo: {
              ...version.inputSnapshot.sourceVideo,
              nodeId: nodeIdMap.get(version.inputSnapshot.sourceVideo.nodeId) ?? version.inputSnapshot.sourceVideo.nodeId,
              videoPath: pathMap.get(version.inputSnapshot.sourceVideo.videoPath) ?? version.inputSnapshot.sourceVideo.videoPath,
              posterPath: version.inputSnapshot.sourceVideo.posterPath
                ? pathMap.get(version.inputSnapshot.sourceVideo.posterPath) ?? version.inputSnapshot.sourceVideo.posterPath
                : undefined
            }
          } : {
            ...version.inputSnapshot,
            firstFrame: remapFrozenSequenceImage(version.inputSnapshot.firstFrame),
            lastFrame: remapFrozenSequenceImage(version.inputSnapshot.lastFrame)
          },
          videoPath: pathMap.get(version.videoPath) ?? version.videoPath,
          posterPath: version.posterPath ? pathMap.get(version.posterPath) ?? version.posterPath : undefined
        }))
      })),
      exportVersions: sequence.exportVersions.map((version) => ({
        ...version, videoPath: pathMap.get(version.videoPath) ?? version.videoPath
      }))
    }));

    const board = await boards.saveBoard({
      id: newBoardId,
      name: parsed.board.name || "导入画板",
      deliveryRecipes: remapImageDeliveryMetadata(parsed.board.deliveryRecipes,p=>pathMap.get(p)??`missing/${path.basename(p)}`,id=>nodeIdMap.get(id)??id,id=>jobIdMap.get(id)??id),
      nodes,
      connections,
      groups: (parsed.board.groups ?? []).map((group) => ({
        ...group,
        id: crypto.randomUUID(),
        nodeIds: group.nodeIds.flatMap((nodeId) => nodeIdMap.get(nodeId) ?? [])
      })).filter((group) => group.nodeIds.length > 0),
      videoSequences: (parsed.board.videoSequences ?? []).map((sequence) => ({
        ...sequence,
        boardId: newBoardId,
        keyframes: sequence.keyframes.map((keyframe) => ({
          ...keyframe,
          source: {
            ...keyframe.source,
            nodeId: keyframe.source.nodeId ? nodeIdMap.get(keyframe.source.nodeId) ?? keyframe.source.nodeId : undefined,
            imagePath: pathMap.get(keyframe.source.imagePath) ?? keyframe.source.imagePath
          }
        }))
      })),
      viewport: parsed.board.viewport,
      thumbnailDataUrl: parsed.board.thumbnailDataUrl
    });

    await videoSequences.importMany(importedVideoSequences);

    await history.importMany(
      parsed.jobs.map((job) => ({
        ...job,
        id: jobIdMap.get(job.id) ?? crypto.randomUUID(),
        boardId: newBoardId,
        outputImagePaths: job.outputImagePaths.map((p) => pathMap.get(p) ?? p),
        inputSnapshot: remapGenerationHistorySnapshot(job.inputSnapshot,p=>pathMap.get(p)??p,{boardId:newBoardId,nodeIds:nodeIdMap,jobIds:jobIdMap}),
        input: {...job.input,boardId:newBoardId,editSource:job.input.editSource ? {...job.input.editSource,boardId:newBoardId,imagePath:pathMap.get(job.input.editSource.imagePath)??job.input.editSource.imagePath,nodeId:job.input.editSource.nodeId?nodeIdMap.get(job.input.editSource.nodeId)??job.input.editSource.nodeId:undefined,jobId:job.input.editSource.jobId?jobIdMap.get(job.input.editSource.jobId)??job.input.editSource.jobId:undefined}:undefined},
        referenceImagePaths: job.referenceImagePaths.map((p) => pathMap.get(p) ?? p)
      }))
    );
    await videoTasks.importMany(parsed.videoJobs.map((job) => ({
      ...job,
      id: jobIdMap.get(job.id) ?? crypto.randomUUID(),
      input: {
        ...job.input,
        boardId: newBoardId,
        generationNodeId: job.input.generationNodeId
          ? nodeIdMap.get(job.input.generationNodeId) ?? job.input.generationNodeId
          : undefined,
        referenceImagePaths: job.input.referenceImagePaths.map((value) => pathMap.get(value) ?? value),
        firstFramePath: job.input.firstFramePath ? pathMap.get(job.input.firstFramePath) ?? job.input.firstFramePath : undefined,
        lastFramePath: job.input.lastFramePath ? pathMap.get(job.input.lastFramePath) ?? job.input.lastFramePath : undefined,
        sourceVideoPath: job.input.sourceVideoPath
          ? pathMap.get(job.input.sourceVideoPath) ?? job.input.sourceVideoPath
          : undefined,
        referenceVideoPaths: (job.input.referenceVideoPaths ?? [])
          .map((value) => pathMap.get(value) ?? value),
        referenceAudioPaths: (job.input.referenceAudioPaths ?? [])
          .map((value) => pathMap.get(value) ?? value),
        targetVideoNodeId: job.input.targetVideoNodeId
          ? nodeIdMap.get(job.input.targetVideoNodeId) ?? job.input.targetVideoNodeId
          : undefined
      },
      outputVideoPath: job.outputVideoPath ? pathMap.get(job.outputVideoPath) ?? job.outputVideoPath : undefined,
      outputPosterPath: job.outputPosterPath ? pathMap.get(job.outputPosterPath) ?? job.outputPosterPath : undefined
    })));

    // 评论 / 收藏标签：imagePath 从包内相对路径映射到本机新路径后落库。
    const importedComments = parsed.comments
      .filter((comment) => pathMap.has(comment.imagePath))
      .map((comment) => ({ ...comment, imagePath: pathMap.get(comment.imagePath)! }));
    await comments.importMany(importedComments);
    const importedMeta = parsed.assetMeta
      .filter((meta) => pathMap.has(meta.imagePath))
      .map((meta) => ({ ...meta, imagePath: pathMap.get(meta.imagePath)! }));
    await assetMeta.importMany(importedMeta);

    onImported();
    return boards.summarize(board);
  }

