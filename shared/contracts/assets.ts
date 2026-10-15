import type { GptImageUseCase, PromptSpec } from "./generation.js";
import type { ImageSource } from "./media.js";

// ---------- 素材库 / 评论 ----------

/** 素材库条目：一张生成图片 + 其来源画板与提示词（由主进程聚合所有画板生成节点得到）。 */
export interface AssetLibraryItem {
  /** 缺省按 image 处理，兼容既有素材记录。 */
  mediaType?: "image" | "video";
  imagePath: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留，不再携带 base64。 */
  dataUrl: string;
  /** 列表使用的小尺寸持久缩略图 URL。 */
  thumbnailUrl: string;
  /** 来源画板与节点：用于"进入画板并定位"。 */
  boardId: string;
  boardName: string;
  nodeId: string;
  jobId: string;
  prompt: string;
  useCase?: GptImageUseCase;
  size?: string;
  createdAt: string;
  width?: number;
  height?: number;
  posterUrl?: string;
  durationMs?: number;
  /** ThumbHash（base64）：列表在真图加载前显示的模糊占位，同时兜底提供宽高比。 */
  thumbHash?: string;
  /** 是否含透明像素：列表据此垫棋盘格衬底。 */
  hasAlpha?: boolean;
  /** 素材来源：生成结果 / 用户上传 / 切图派生（供素材库来源筛选）。 */
  source: ImageSource;
  /** 收藏与标签（供素材库筛选）。 */
  favorite: boolean;
  tags: string[];
}

export interface AssetLibraryPage {
  items: AssetLibraryItem[];
  total: number;
  /** 快照游标；继续加载时传回，避免重复扫描画板与历史。 */
  nextCursor?: string;
}

/** 素材/图片评论：按图片文件 imagePath 归属，持久化，画布评论栏与素材详情共用。 */
export interface AssetComment {
  id: string;
  imagePath: string;
  text: string;
  createdAt: string;
  /** 图片内的归一化标记坐标；旧评论和素材详情评论可以没有坐标。 */
  position?: {
    x: number;
    y: number;
  };
}

/** 某个生成任务的提示词与引用图（用于编辑态查看图片来源信息）。 */
export interface JobPromptInfo {
  prompt: string;
  referenceImages: string[];
  /** 结构化提示词（若该次生成有），供工作台拆分展示。 */
  promptSpec?: PromptSpec;
}

/** 引用图（生成/编辑时用到的源图）；若其本身是画板上的某素材，附血缘跳转信息。 */
export interface AssetReference {
  imagePath: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
  dataUrl: string;
  /** 该引用图对应的来源素材（生成节点），用于血缘跳转；无则表示外部上传/无法定位。 */
  sourceBoardId?: string;
  sourceNodeId?: string;
}

/** 素材的一个版本（v1 起），带该次生成/编辑的提示词、结构化字段与引用图。 */
export interface AssetVersion {
  imagePath: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
  dataUrl: string;
  jobId: string;
  prompt: string;
  promptSpec?: PromptSpec;
  useCase?: GptImageUseCase;
  size?: string;
  model?: string;
  createdAt: string;
  /** 该版本由 AI 助手发起生成时对应的会话。 */
  assistantConversationId?: string;
  references: AssetReference[];
}

/** 素材详情按需数据：版本链（含各自提示词/引用图/血缘）+ 激活版本下标。 */
export interface AssetDetailData {
  versions: AssetVersion[];
  activeVersion: number;
}

/** 素材的收藏与标签（按图片文件 imagePath 归属，持久化）。 */
export interface AssetTagInfo {
  imagePath: string;
  favorite: boolean;
  tags: string[];
}
