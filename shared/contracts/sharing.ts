export type OnlineShareKind = "image" | "wechat-stickers";

/** 图片公网分享页的内容配置。单图请求继续使用 sourcePath，多图使用 sourcePaths。 */
export interface OnlineImageShareRequest {
  sourcePath?: string;
  sourcePaths?: string[];
  jobId?: string;
  /** 多图分享时，按图片顺序传入各自的生成任务，用于展示详情。 */
  jobIds?: string[];
  showPrompt: boolean;
  /** 分享内容所在画板与节点，供在线分享管理一键返回。 */
  origin?: OnlineShareCanvasOrigin;
}

export interface OnlineShareCanvasOrigin {
  boardId: string;
  nodeIds: string[];
}

/** 当前由桌面端维持的 Manager 公网分享会话；同一时间最多一个。 */
export interface OnlineShareSession {
  id: string;
  kind: OnlineShareKind;
  title: string;
  url: string;
  startedAt: number;
  expiresAt: number;
  /** 部分分享（例如从画板发起的图片分享）可定位回来源节点。 */
  origin?: OnlineShareCanvasOrigin;
}

/** 公网分享页可被 Iterlay 一键导入的创作上下文。 */
export interface OnlineShareImportData {
  prompt: string;
  referenceUrls: string[];
}
