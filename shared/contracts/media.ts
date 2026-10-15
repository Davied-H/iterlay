export type SystemNotificationDeliveryStatus =
  | "delivered"
  | "requested"
  | "unsupported"
  | "failed";

export interface SystemNotificationDeliveryResult {
  status: SystemNotificationDeliveryStatus;
  message?: string;
}

export interface AppErrorShape {
  code: string;
  message: string;
}

export type ImageSource = "generated" | "upload" | "slice";

export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDerivation {
  sourceNodeId: string;
  sourceImagePath: string;
  crop: ImageCropRect;
}

export interface SliceImageRequest {
  sourcePath: string;
  crops: ImageCropRect[];
}

export interface SliceImageResult {
  path: string;
  /** 受控协议 URL；字段名为兼容旧渲染层保留。 */
  dataUrl: string;
  width: number;
  height: number;
}

export interface WechatStickerPackageFile {
  /** 相对导出目录的 POSIX 路径，例如 stickers/01.png。 */
  relativePath: string;
  bytes: ArrayBuffer;
}

export interface SaveWechatStickerPackageRequest {
  packageName: string;
  files: WechatStickerPackageFile[];
  createZip?: boolean;
}

export interface SaveWechatStickerPackageResult {
  ok: boolean;
  directory?: string;
  folderPath?: string;
  zipPath?: string;
  fileCount?: number;
}

export interface WriteClipboardImageRequest {
  mimeType: "image/gif";
  bytes: ArrayBuffer;
}

export interface SliceSubjectDetection {
  index: number;
  bounds: ImageCropRect;
  confidence: number;
}

export interface AnalyzeSliceSubjectsRequest {
  sourcePath: string;
  crops: ImageCropRect[];
  /** 指定用哪个文本 provider；缺省用 activeTextProviderId。 */
  textProviderId?: string;
}

export interface AnalyzeSliceSubjectsResult {
  items: SliceSubjectDetection[];
}
