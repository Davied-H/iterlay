import {
  normalizeComicDramaEntryNode,
  normalizeComicDramaNode,
  normalizeComicDramaVersionBinding,
  normalizeVideoSequenceEntryNode
} from "../comic-drama.js";
import type {
  BoardComicDramaEntryNode,
  BoardGroup,
  BoardVideoSequenceEntryNode,
  ComicCharacterNode,
  ComicDramaBoardNode,
  ComicDramaVersionBinding,
  ComicFrameContextSnapshot,
  ComicFrameRole,
  ComicSegmentScriptNode,
  ComicSettingNode
} from "../comic-drama.js";
import type { ImageSource, ImageDerivation } from "./media.js";
import type { VideoGenerationJobStatus, VideoGenerationStatus, VideoSequence } from "./video.js";
import type { GptImageUseCase } from "./generation.js";

export type BoardTrashRetentionDays = 0 | 1 | 3 | 7 | 30 | 90;

// ---------- 画板（Board） ----------

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

/** 节点的一个编辑版本（v1 为原图）。 */
export interface BoardNodeVersion {
  imagePath: string;
  jobId: string;
  width?: number;
  height?: number;
}

/** 所有画板节点共享的可持久化布局信息。 */
export interface BoardNodeBase {
  id: string;
  x: number;
  y: number;
  title?: string;
  locked?: boolean;
  zIndex?: number;
  /** 画布上的展示宽度；节点类型未指定时由注册表提供默认值。 */
  displayWidth?: number;
  /** 非图片节点的展示高度；图片节点始终按原图比例推导。 */
  displayHeight?: number;
}

/** 画板上一个图片节点的落盘快照：只存资产引用与坐标，不复制图片文件。 */
export interface BoardNodeSnapshot extends BoardNodeBase {
  /** 旧画板没有此字段；读取时等同于 image。 */
  type?: "image";
  /** 画布节点 id（即 GeneratedImage.id），保存/恢复时保持一致。 */
  id: string;
  /** 当前激活版本的图片路径（与 versions[activeVersion] 一致，兼容无版本的旧数据）。 */
  imagePath: string;
  jobId: string;
  source: ImageSource;
  width?: number;
  height?: number;
  /** 编辑版本链（含原图）；无编辑历史时省略。 */
  versions?: BoardNodeVersion[];
  activeVersion?: number;
  /** 切图派生关系；普通生成/上传节点省略。 */
  derivation?: ImageDerivation;
}

/** 带显式判别字段的新格式图片节点。 */
export interface BoardImageNode extends BoardNodeSnapshot {
  type: "image";
}

export interface BoardTextNode extends BoardNodeBase {
  type: "text";
  text: string;
  heightMode?: "auto" | "manual";
}

export type BoardGenerationStatus = "idle" | "queued" | "running" | "succeeded" | "failed";

export interface BoardVideoVersion {
  videoPath: string;
  posterPath?: string;
  jobId: string;
  mimeType?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationMs?: number;
}

export interface BoardVideoNode extends BoardNodeBase {
  type: "video";
  videoPath: string;
  posterPath?: string;
  jobId: string;
  source: "generated" | "upload";
  mimeType?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  durationMs?: number;
  versions?: BoardVideoVersion[];
  activeVersion?: number;
  status?: VideoGenerationJobStatus | "draft" | "modified";
  error?: string;
  generationNodeId?: string;
}

export interface BoardVideoGenerationNode extends BoardNodeBase {
  type: "video-generation";
  mode?: "generate" | "remix" | "extend";
  prompt?: string;
  providerId?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  watermark?: boolean;
  referenceVideoPaths?: string[];
  referenceAudioPaths?: string[];
  referenceAudioNames?: Record<string, string>;
  sourceVideoPath?: string;
  targetVideoNodeId?: string;
  lastGenerationId?: string;
  status?: VideoGenerationStatus;
  error?: string;
  heightMode?: "auto" | "manual";
}

/** 生成节点只保存可复用配置；图片和文本输入由 reference 连线在运行时解析。 */
export interface BoardGenerationNode extends BoardNodeBase {
  type: "generation";
  prompt?: string;
  providerId?: string;
  model?: string;
  useCase?: GptImageUseCase;
  size?: string;
  count?: number;
  lastGenerationId?: string;
  /** 最新生成结果。漫剧帧只有用户采用后才复制到 lastGenerationId。 */
  latestGenerationId?: string;
  status?: BoardGenerationStatus;
  error?: string;
  /** 漫剧首帧/尾帧生成意图；普通图片生成节点省略。 */
  comicFrameRole?: ComicFrameRole;
  comicFrameContextSnapshot?: ComicFrameContextSnapshot;
  /** 节点输入区的自适应或用户手动调整高度。 */
  heightMode?: "auto" | "manual";
}

/** 旧图片节点仍可无 type；存储读取边界会将其规范化为显式 image。 */
export type BoardNode =
  | BoardNodeSnapshot
  | BoardTextNode
  | BoardGenerationNode
  | BoardVideoNode
  | BoardVideoGenerationNode
  | ComicDramaBoardNode
  | BoardComicDramaEntryNode
  | BoardVideoSequenceEntryNode;

/** Omit 对联合类型不分发，追加节点 API 使用显式联合保持各节点字段推断。 */
export type UnpositionedBoardNode =
  | Omit<BoardNodeSnapshot, "x" | "y">
  | Omit<BoardTextNode, "x" | "y">
  | Omit<BoardGenerationNode, "x" | "y">
  | Omit<BoardVideoNode, "x" | "y">
  | Omit<BoardVideoGenerationNode, "x" | "y">
  | Omit<ComicSettingNode, "x" | "y">
  | Omit<ComicCharacterNode, "x" | "y">
  | Omit<ComicSegmentScriptNode, "x" | "y">
  | Omit<BoardComicDramaEntryNode, "x" | "y">
  | Omit<BoardVideoSequenceEntryNode, "x" | "y">;

export function isBoardImageNode(node: BoardNode): node is BoardNodeSnapshot {
  return node.type === undefined || node.type === "image";
}

export function isBoardTextNode(node: BoardNode): node is BoardTextNode {
  return node.type === "text";
}

export function isBoardGenerationNode(node: BoardNode): node is BoardGenerationNode {
  return node.type === "generation";
}

export function isBoardVideoNode(node: BoardNode): node is BoardVideoNode {
  return node.type === "video";
}

export function isBoardVideoGenerationNode(node: BoardNode): node is BoardVideoGenerationNode {
  return node.type === "video-generation";
}

/** 将可信存储中的旧图片节点补齐判别字段；无法识别的节点不会进入画板。 */
export function normalizeBoardNode(value: unknown): BoardNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<BoardNode> & Record<string, unknown>;
  if (typeof node.id !== "string" || typeof node.x !== "number" || typeof node.y !== "number") return null;
  if (node.type === "comic-setting" || node.type === "comic-character" || node.type === "comic-segment-script") {
    return normalizeComicDramaNode(value);
  }
  if (node.type === "comic-drama-entry") return normalizeComicDramaEntryNode(value);
  if (node.type === "video-sequence-entry") return normalizeVideoSequenceEntryNode(value);
  if (node.type === "text") {
    if (typeof node.text !== "string") return null;
    return { ...node, type: "text", text: node.text } as BoardTextNode;
  }
  if (node.type === "generation") return { ...node, type: "generation" } as BoardGenerationNode;
  if (node.type === "video-generation") return { ...node, type: "video-generation" } as BoardVideoGenerationNode;
  if (node.type === "video") {
    if (typeof node.videoPath !== "string" || typeof node.jobId !== "string") return null;
    if (node.source !== "generated" && node.source !== "upload") return null;
    return { ...node, type: "video" } as BoardVideoNode;
  }
  if (node.type !== undefined && node.type !== "image") return null;
  if (typeof node.imagePath !== "string" || typeof node.jobId !== "string" || typeof node.source !== "string") return null;
  return { ...node, type: "image" } as BoardImageNode;
}

export type BoardConnectionRoutingMode = "auto" | "manual";

export type BoardConnectionRoutingKind = "orthogonal" | "straight" | "curved";

/** 手动路由控制点。id 在坐标变化时保持不变，用于稳定线段和标签锚点。 */
export interface BoardConnectionWaypoint {
  id: string;
  x: number;
  y: number;
}

/** 连接线的持久化路由意图；自动路由的计算结果不会写回画板。 */
export interface BoardConnectionRouting {
  mode: BoardConnectionRoutingMode;
  kind: BoardConnectionRoutingKind;
  waypoints: BoardConnectionWaypoint[];
}

/** 标签锚点。存在 segmentId 时 progress 为线段内进度，否则为全路径进度。 */
export interface BoardConnectionLabelAnchor {
  segmentId?: string;
  /** 线段消失或异步路由拓扑变化时，用于在整条新路径上稳定回退。 */
  globalProgress?: number;
  progress: number;
}

export type BoardConnectionDash = "solid" | "dashed" | "dotted";

export type BoardConnectionMarker = "none" | "arrow";

export type BoardConnectionKind = "visual" | "reference";

export type BoardConnectionSide = "top" | "right" | "bottom" | "left";

/** 连接端点在节点边上的完整持久化锚点；数字格式仅保留用于读取旧画板。 */
export interface BoardConnectionAnchor {
  side: BoardConnectionSide;
  ratio: number;
  mode: "auto" | "pinned";
}

/** 连接线的可持久化视觉样式；缺省字段由画布主题提供稳定默认值。 */
export interface BoardConnectionStyle {
  color?: string;
  width?: number;
  dash?: BoardConnectionDash;
  startMarker?: BoardConnectionMarker;
  endMarker?: BoardConnectionMarker;
  /** 箭头在屏幕上的显示尺寸，单位为 px。 */
  markerSize?: number;
  lineJumps?: boolean;
}

/** 画板中两个图片节点之间的有向连接。端点记录在节点四边，便于恢复同一条视觉路径。 */
export interface BoardConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** visual 仅表达画布关系；reference 会作为生成节点的上游输入。旧连线缺省为 visual。 */
  kind?: BoardConnectionKind;
  /** reference 缺省跟随活动版本；固定版本缺失时保留连接并阻止生成。 */
  versionBinding?: ComicDramaVersionBinding;
  /** 系统维护的语义依赖不可由用户单独删除或重连；删除端点节点时随节点清理。 */
  locked?: boolean;
  /** 锚点沿连接侧边的位置；旧画板可能仍为 0-1 数字。 */
  sourceAnchor?: number | BoardConnectionAnchor;
  targetAnchor?: number | BoardConnectionAnchor;
  label?: string;
  /** 连线标签沿完整路径的归一化位置，0 为起点，1 为终点。 */
  labelProgress?: number;
  /** 稳定绑定到路径线段的标签位置；优先于 labelProgress。 */
  labelAnchor?: BoardConnectionLabelAnchor;
  style?: BoardConnectionStyle;
  /** @deprecated 旧版画布绝对坐标，仅用于迁移为 labelProgress。 */
  labelPosition?: { x: number; y: number };
  /** 连接线的路由模式、形态与手动控制点。 */
  routing?: BoardConnectionRouting;
  /** @deprecated 单拐线的中间路由坐标，仅用于迁移为 routing.waypoints。 */
  routeCoordinate?: number;
}

export function normalizeBoardConnection(value: unknown): BoardConnection | null {
  if (!value || typeof value !== "object") return null;
  const connection = value as Partial<BoardConnection> & Record<string, unknown>;
  if (
    typeof connection.id !== "string"
    || typeof connection.source !== "string"
    || typeof connection.target !== "string"
  ) return null;
  const binding = connection.kind === "reference"
    ? normalizeComicDramaVersionBinding(connection.versionBinding)
    : undefined;
  return {
    ...connection,
    kind: connection.kind === "reference" ? "reference" : "visual",
    ...(binding ? { versionBinding: binding } : {}),
    ...(connection.locked === true ? { locked: true } : { locked: undefined })
  } as BoardConnection;
}

export interface BoardData {
  /** 当前持久化模型版本；旧画板缺省视为 v1，读取后升级为 v3。 */
  schemaVersion?: 3;
  /** 内容 revision；旧画板读取为 0。助手计划以此做乐观并发控制。 */
  revision?: number;
  id: string;
  name: string;
  /** 独立漫剧子画板通过 parentBoardId 返回承载入口卡的普通画板。 */
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  createdAt: string;
  updatedAt: string;
  nodes: BoardNode[];
  connections?: BoardConnection[];
  groups?: BoardGroup[];
  viewport?: BoardViewport;
  /** 库页卡片封面，渲染层生成的小尺寸 dataUrl，随画板 JSON 一起存。 */
  thumbnailDataUrl?: string;
  /** 序列定义属于画板，但只能通过专用 sequence mutation 修改。 */
  videoSequences?: VideoSequence[];
}

export interface BoardSummary {
  id: string;
  name: string;
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  /** 画板引用的唯一图片文件总大小（包含版本链）。 */
  storageBytes?: number;
  thumbnailDataUrl?: string;
}

export interface TrashedBoardSummary extends BoardSummary {
  deletedAt: string;
  /** 根据当前保留策略计算；永不自动清理时省略。 */
  expiresAt?: string;
}

/** 画板内被移除的图片节点。图片文件会保留到回收站清理为止。 */
export interface TrashedBoardImage {
  id: string;
  boardId: string;
  boardName: string;
  node: BoardNodeSnapshot;
  deletedAt: string;
  /** 根据当前保留策略计算；永不自动清理时省略。 */
  expiresAt?: string;
  /** 受控图片 URL，仅用于回收站预览。 */
  previewUrl?: string;
}

export interface RestoreTrashedBoardImageResult {
  item: TrashedBoardImage;
  /** 当前节点与版本链的受控图片 URL。 */
  imageUrls: Record<string, string>;
}

/** 从画板库进入画板时的来源位置与预览，用于连续的工作台展开过渡。 */
export interface BoardEnterOrigin {
  rect: { left: number; top: number; width: number; height: number };
  thumbnailDataUrl?: string;
}

/** boards:get 的返回：主进程按 imagePath 附上受控协议 URL，不传图片字节。 */
export interface BoardDetail extends BoardData {
  images: Record<string, string>;
  /** 视频、poster 等非图片媒体路径到受控协议 URL 的映射。 */
  media?: Record<string, string>;
}

/** boards:save 的入参：未提供的字段保留原值（增量合并）。 */
export interface BoardSavePayload {
  id: string;
  /** Reject stale complete snapshots; renderer can rebase its local changes. */
  expectedRevision?: number;
  name?: string;
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  /** 画布完整快照保存时允许显式删除漫剧与入口节点；旧调用缺省继续保留。 */
  replaceManagedNodes?: boolean;
  nodes?: BoardNode[];
  connections?: BoardConnection[];
  groups?: BoardGroup[];
  videoSequences?: VideoSequence[];
  viewport?: BoardViewport;
  thumbnailDataUrl?: string;
}

export interface ComicDramaProjectCreateInput {
  parentBoardId: string;
  name?: string;
  position: { x: number; y: number };
}

export interface ComicDramaProjectCreateResult {
  parentBoard: BoardData;
  childBoard: BoardData;
  entryNode: BoardComicDramaEntryNode;
}
