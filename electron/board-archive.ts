import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isBoardImageNode,
  isBoardVideoGenerationNode,
  isBoardVideoNode,
  normalizeBoardConnection,
  normalizeBoardNode,
  type AssetComment,
  type AssetTagInfo,
  type BoardConnection,
  type BoardData,
  type BoardNode,
  type GenerationJob,
  type VideoGenerationJob,
  type VideoSequence
} from "../shared/types.js";
import { normalizeBoardGroup } from "../shared/comic-drama.js";
import { buildArchiveInWorker, parseArchiveInWorker } from "./archive-worker-client.js";

export const BOARD_ARCHIVE_FORMAT = "iterlay-board";
export const BOARD_ARCHIVE_VERSION = 1;
const LEGACY_BOARD_ARCHIVE_FORMAT = "image-relay-board";
const maxArchiveBytes = 512 * 1024 * 1024;

export interface BoardArchiveManifest {
  format: string;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
}

export interface ParsedBoardArchive {
  manifest: BoardArchiveManifest;
  /** nodes 的 imagePath 是包内相对路径（images/xxx.png）。 */
  board: BoardData;
  jobs: GenerationJob[];
  videoJobs: VideoGenerationJob[];
  /** 包内相对路径 -> 图片字节。 */
  images: Map<string, Buffer>;
  /** 包内相对路径 -> 图片、视频或 poster 字节。 */
  media: Map<string, Buffer>;
  /** 评论 / 收藏标签，imagePath 为包内相对路径，导入端重映射后落库。 */
  comments: AssetComment[];
  assetMeta: AssetTagInfo[];
  videoSequences: VideoSequence[];
}

/**
 * 打包画板为 .itb（标准 zip）：manifest.json + board.json + history.json + images/。
 * 节点引用的图片读不到时跳过该节点；历史里的绝对路径改写为包内相对路径或文件名，避免泄露本机目录。
 */
export async function buildBoardArchive(
  board: BoardData,
  jobs: GenerationJob[],
  appVersion: string,
  comments: AssetComment[] = [],
  assetMeta: AssetTagInfo[] = [],
  videoJobs: VideoGenerationJob[] = [],
  videoSequences: VideoSequence[] = []
): Promise<Buffer> {
  const archiveEntries: Array<[string, Uint8Array]> = [];
  const pathMap = new Map<string, string>();
  const archivedImageByHash = new Map<string, { relativePath: string; bytes: Buffer }>();
  const usedNames = new Set<string>();

  async function addMedia(mediaPath: string, directory: "images" | "videos" | "audios" | "posters"): Promise<void> {
    if (pathMap.has(mediaPath)) return;
    try {
      const bytes = await readFile(mediaPath);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const existing = archivedImageByHash.get(hash);
      if (existing && existing.bytes.equals(bytes)) {
        pathMap.set(mediaPath, existing.relativePath);
        return;
      }
      const relative = `${directory}/${uniqueName(path.basename(mediaPath), usedNames)}`;
      archiveEntries.push([relative, bytes]);
      pathMap.set(mediaPath, relative);
      archivedImageByHash.set(hash, { relativePath: relative, bytes });
    } catch {
      // 资产文件丢失：跳过，导入端会过滤掉引用不到图片的节点/版本。
    }
  }

  const addImage = (imagePath: string) => addMedia(imagePath, "images");

  for (const node of board.nodes) {
    if (isBoardImageNode(node)) {
      await addImage(node.imagePath);
      if (node.derivation) await addImage(node.derivation.sourceImagePath);
      for (const version of node.versions ?? []) await addImage(version.imagePath);
    } else if (isBoardVideoNode(node)) {
      await addMedia(node.videoPath, "videos");
      if (node.posterPath) await addMedia(node.posterPath, "posters");
      for (const version of node.versions ?? []) {
        await addMedia(version.videoPath, "videos");
        if (version.posterPath) await addMedia(version.posterPath, "posters");
      }
    } else if (isBoardVideoGenerationNode(node)) {
      if (node.sourceVideoPath) await addMedia(node.sourceVideoPath, "videos");
      for (const videoPath of node.referenceVideoPaths ?? []) await addMedia(videoPath, "videos");
      for (const audioPath of node.referenceAudioPaths ?? []) await addMedia(audioPath, "audios");
    }
  }

  // 引用图/源图也一并打包，导入端才能还原"引用图 + 血缘"。
  for (const job of jobs) {
    for (const referencePath of job.referenceImagePaths) {
      await addImage(referencePath);
    }
  }
  for (const job of videoJobs) {
    for (const referencePath of job.input.referenceImagePaths) await addImage(referencePath);
    if (job.input.firstFramePath) await addImage(job.input.firstFramePath);
    if (job.input.lastFramePath) await addImage(job.input.lastFramePath);
    if (job.input.sourceVideoPath) await addMedia(job.input.sourceVideoPath, "videos");
    for (const videoPath of job.input.referenceVideoPaths ?? []) await addMedia(videoPath, "videos");
    for (const audioPath of job.input.referenceAudioPaths ?? []) await addMedia(audioPath, "audios");
    if (job.outputVideoPath) await addMedia(job.outputVideoPath, "videos");
    if (job.outputPosterPath) await addMedia(job.outputPosterPath, "posters");
  }

  for (const sequence of videoSequences) {
    for (const keyframe of sequence.keyframes) await addImage(keyframe.source.imagePath);
    for (const segment of sequence.segments) {
      for (const version of segment.versions) {
        if ("sourceVideo" in version.inputSnapshot) {
          await addMedia(version.inputSnapshot.sourceVideo.videoPath, "videos");
          if (version.inputSnapshot.sourceVideo.posterPath) await addMedia(version.inputSnapshot.sourceVideo.posterPath, "posters");
        } else {
          await addImage(version.inputSnapshot.firstFrame.imagePath);
          await addImage(version.inputSnapshot.lastFrame.imagePath);
        }
        await addMedia(version.videoPath, "videos");
        if (version.posterPath) await addMedia(version.posterPath, "posters");
      }
    }
    for (const version of sequence.exportVersions) await addMedia(version.videoPath, "videos");
  }

  const exportedBoard: BoardData = {
    ...board,
    nodes: board.nodes.flatMap((node): BoardNode[] => {
        if (isBoardVideoGenerationNode(node)) {
          return [{
            ...node,
            sourceVideoPath: node.sourceVideoPath
              ? pathMap.get(node.sourceVideoPath) ?? path.basename(node.sourceVideoPath)
              : undefined,
            referenceVideoPaths: node.referenceVideoPaths?.map((value) => pathMap.get(value) ?? path.basename(value)),
            referenceAudioPaths: node.referenceAudioPaths?.map((value) => pathMap.get(value) ?? path.basename(value))
          }];
        }
        if (isBoardVideoNode(node)) {
          if (!pathMap.has(node.videoPath)) return [];
          const versions = node.versions
            ?.filter((version) => pathMap.has(version.videoPath))
            .map((version) => ({
              ...version,
              videoPath: pathMap.get(version.videoPath)!,
              posterPath: version.posterPath ? pathMap.get(version.posterPath) : undefined
            }));
          const remappedVideoPath = pathMap.get(node.videoPath)!;
          const remappedActive = versions?.findIndex((version) => version.videoPath === remappedVideoPath);
          return [{
            ...node,
            videoPath: remappedVideoPath,
            posterPath: node.posterPath ? pathMap.get(node.posterPath) : undefined,
            versions: versions && versions.length > 1 ? versions : undefined,
            activeVersion: versions && versions.length > 1
              ? (remappedActive !== undefined && remappedActive >= 0 ? remappedActive : versions.length - 1)
              : undefined
          }];
        }
        if (!isBoardImageNode(node)) return [structuredClone(node)];
        if (!pathMap.has(node.imagePath)) return [];
        const versions = node.versions
          ?.filter((version) => pathMap.has(version.imagePath))
          .map((version) => ({ ...version, imagePath: pathMap.get(version.imagePath)! }));
        const remappedActive = versions?.findIndex((version) => version.imagePath === pathMap.get(node.imagePath));
        return [{
          ...node,
          imagePath: pathMap.get(node.imagePath)!,
          derivation:
            node.derivation && pathMap.has(node.derivation.sourceImagePath)
              ? { ...node.derivation, sourceImagePath: pathMap.get(node.derivation.sourceImagePath)! }
              : undefined,
          versions: versions && versions.length > 1 ? versions : undefined,
          // 有版本被剔除时重算激活下标，避免指向错位。
          activeVersion:
            versions && versions.length > 1 ? (remappedActive !== undefined && remappedActive >= 0 ? remappedActive : versions.length - 1) : undefined
        }];
      })
  };

  const exportedJobs = jobs.map((job) => ({
    ...job,
    outputImagePaths: job.outputImagePaths.map((p) => pathMap.get(p) ?? path.basename(p)),
    // 引用图打包成功则用包内相对路径（导入端可重映射），否则退回文件名。
    referenceImagePaths: job.referenceImagePaths.map((p) => pathMap.get(p) ?? path.basename(p))
  }));
  const exportedVideoJobs = videoJobs.map((job) => ({
    ...job,
    input: {
      ...job.input,
      referenceImagePaths: job.input.referenceImagePaths.map((value) => pathMap.get(value) ?? path.basename(value)),
      firstFramePath: job.input.firstFramePath
        ? pathMap.get(job.input.firstFramePath) ?? path.basename(job.input.firstFramePath)
        : undefined,
      lastFramePath: job.input.lastFramePath
        ? pathMap.get(job.input.lastFramePath) ?? path.basename(job.input.lastFramePath)
        : undefined,
      sourceVideoPath: job.input.sourceVideoPath
        ? pathMap.get(job.input.sourceVideoPath) ?? path.basename(job.input.sourceVideoPath)
        : undefined,
      referenceVideoPaths: job.input.referenceVideoPaths?.map((value) => pathMap.get(value) ?? path.basename(value)),
      referenceAudioPaths: job.input.referenceAudioPaths?.map((value) => pathMap.get(value) ?? path.basename(value))
    },
    outputVideoPath: job.outputVideoPath ? pathMap.get(job.outputVideoPath) ?? path.basename(job.outputVideoPath) : undefined,
    outputPosterPath: job.outputPosterPath ? pathMap.get(job.outputPosterPath) ?? path.basename(job.outputPosterPath) : undefined
  }));

  const exportedVideoSequences = videoSequences.map((sequence) => ({
    ...sequence,
    keyframes: sequence.keyframes.map((keyframe) => ({
      ...keyframe,
      source: { ...keyframe.source, imagePath: pathMap.get(keyframe.source.imagePath) ?? path.basename(keyframe.source.imagePath) }
    })),
    segments: sequence.segments.map((segment) => ({
      ...segment,
      sourceVideo: segment.sourceVideo ? {
        ...segment.sourceVideo,
        videoPath: pathMap.get(segment.sourceVideo.videoPath) ?? path.basename(segment.sourceVideo.videoPath),
        posterPath: segment.sourceVideo.posterPath ? pathMap.get(segment.sourceVideo.posterPath) ?? path.basename(segment.sourceVideo.posterPath) : undefined
      } : undefined,
      versions: segment.versions.map((version) => ({
        ...version,
        inputSnapshot: "sourceVideo" in version.inputSnapshot ? {
          ...version.inputSnapshot,
          sourceVideo: {
            ...version.inputSnapshot.sourceVideo,
            videoPath: pathMap.get(version.inputSnapshot.sourceVideo.videoPath) ?? path.basename(version.inputSnapshot.sourceVideo.videoPath),
            posterPath: version.inputSnapshot.sourceVideo.posterPath
              ? pathMap.get(version.inputSnapshot.sourceVideo.posterPath) ?? path.basename(version.inputSnapshot.sourceVideo.posterPath)
              : undefined
          }
        } : {
          ...version.inputSnapshot,
          firstFrame: {
            ...version.inputSnapshot.firstFrame,
            imagePath: pathMap.get(version.inputSnapshot.firstFrame.imagePath) ?? path.basename(version.inputSnapshot.firstFrame.imagePath)
          },
          lastFrame: {
            ...version.inputSnapshot.lastFrame,
            imagePath: pathMap.get(version.inputSnapshot.lastFrame.imagePath) ?? path.basename(version.inputSnapshot.lastFrame.imagePath)
          }
        },
        videoPath: pathMap.get(version.videoPath) ?? path.basename(version.videoPath),
        posterPath: version.posterPath ? pathMap.get(version.posterPath) ?? path.basename(version.posterPath) : undefined
      }))
    })),
    exportVersions: sequence.exportVersions.map((version) => ({
      ...version, videoPath: pathMap.get(version.videoPath) ?? path.basename(version.videoPath)
    }))
  }));

  // 评论 / 收藏标签：imagePath 改写为包内相对路径（图片没打包进来的丢弃）。
  const exportedComments = comments
    .filter((comment) => pathMap.has(comment.imagePath))
    .map((comment) => ({ ...comment, imagePath: pathMap.get(comment.imagePath)! }));
  const exportedAssetMeta = assetMeta
    .filter((meta) => pathMap.has(meta.imagePath))
    .map((meta) => ({ ...meta, imagePath: pathMap.get(meta.imagePath)! }));

  const manifest: BoardArchiveManifest = {
    format: BOARD_ARCHIVE_FORMAT,
    formatVersion: BOARD_ARCHIVE_VERSION,
    appVersion,
    exportedAt: new Date().toISOString()
  };

  archiveEntries.push(
    ["manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8")],
    ["board.json", Buffer.from(JSON.stringify(exportedBoard, null, 2), "utf8")],
    ["history.json", Buffer.from(JSON.stringify(exportedJobs, null, 2), "utf8")],
    ["video-history.json", Buffer.from(JSON.stringify(exportedVideoJobs, null, 2), "utf8")],
    ["video-sequences.json", Buffer.from(JSON.stringify(exportedVideoSequences, null, 2), "utf8")],
    ["comments.json", Buffer.from(JSON.stringify(exportedComments, null, 2), "utf8")],
    ["asset-meta.json", Buffer.from(JSON.stringify(exportedAssetMeta, null, 2), "utf8")]
  );
  return buildArchiveInWorker(archiveEntries);
}

/** 解析并校验 .itb；同时兼容旧版 .irb，错误信息面向用户可读。 */
export async function parseBoardArchive(buffer: Buffer): Promise<ParsedBoardArchive> {
  if (buffer.byteLength > maxArchiveBytes) throw new Error("画板包压缩文件过大（最多 512 MB）。");
  const entries = await parseArchiveInWorker(buffer);
  const entryMap = new Map(entries);
  const manifest = readJsonEntry<BoardArchiveManifest>(entryMap, "manifest.json");
  if (!manifest) throw new Error("画板包缺少 manifest.json。");
  if (manifest.format !== BOARD_ARCHIVE_FORMAT && manifest.format !== LEGACY_BOARD_ARCHIVE_FORMAT) {
    throw new Error("这不是 Iterlay 画板文件。");
  }
  if (typeof manifest.formatVersion !== "number" || manifest.formatVersion > BOARD_ARCHIVE_VERSION) {
    throw new Error("画板包版本过高，请升级应用后再导入。");
  }

  const storedBoard = readJsonEntry<BoardData>(entryMap, "board.json");
  if (!storedBoard || !Array.isArray(storedBoard.nodes)) throw new Error("画板包缺少有效的 board.json。");
  const board: BoardData = {
    ...storedBoard,
    schemaVersion: 3,
    revision: Number.isInteger(storedBoard.revision) && (storedBoard.revision ?? 0) >= 0 ? storedBoard.revision : 0,
    nodes: storedBoard.nodes
      .map(normalizeBoardNode)
      .filter((node): node is BoardNode => node !== null),
    connections: (storedBoard.connections ?? [])
      .map(normalizeBoardConnection)
      .filter((connection): connection is BoardConnection => connection !== null),
    groups: (storedBoard.groups ?? [])
      .map(normalizeBoardGroup)
      .filter((group): group is NonNullable<BoardData["groups"]>[number] => group !== null)
  };

  const jobs = readJsonEntry<GenerationJob[]>(entryMap, "history.json") ?? [];
  const videoJobs = readJsonEntry<VideoGenerationJob[]>(entryMap, "video-history.json") ?? [];
  const videoSequences = readJsonEntry<VideoSequence[]>(entryMap, "video-sequences.json") ?? [];
  const comments = readJsonEntry<AssetComment[]>(entryMap, "comments.json") ?? [];
  const assetMeta = readJsonEntry<AssetTagInfo[]>(entryMap, "asset-meta.json") ?? [];

  const images = new Map<string, Buffer>();
  const media = new Map<string, Buffer>();
  for (const [name, bytes] of entryMap) {
    if (!name.startsWith("images/") && !name.startsWith("videos/") && !name.startsWith("audios/") && !name.startsWith("posters/")) continue;
    const buffer = Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
    media.set(name, buffer);
    if (name.startsWith("images/")) images.set(name, buffer);
  }

  return {
    manifest,
    board,
    jobs: Array.isArray(jobs) ? jobs : [],
    videoJobs: Array.isArray(videoJobs) ? videoJobs : [],
    videoSequences: Array.isArray(videoSequences) ? videoSequences : [],
    images,
    media,
    comments: Array.isArray(comments) ? comments : [],
    assetMeta: Array.isArray(assetMeta) ? assetMeta : []
  };
}

function readJsonEntry<T>(entries: Map<string, Uint8Array>, entryName: string): T | null {
  const bytes = entries.get(entryName);
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function uniqueName(baseName: string, used: Set<string>): string {
  let name = baseName;
  let index = 1;
  while (used.has(name)) {
    const extension = path.extname(baseName);
    name = `${path.basename(baseName, extension)}-${index}${extension}`;
    index += 1;
  }
  used.add(name);
  return name;
}
