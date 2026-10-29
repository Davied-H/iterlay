// Inline imports must fit the local API's 32 MiB JSON body after Base64 encoding.
// Keep this separate from text limits and the App's direct file-import limits.
export const MAX_INLINE_MEDIA_BYTES = 20 * 1024 * 1024;
export const MAX_INLINE_MEDIA_DATA_URL_LENGTH = Math.ceil(MAX_INLINE_MEDIA_BYTES / 3) * 4 + 128;

export function assertInlineMediaByteLength(bytes: number, label = "素材"): void {
  if (bytes === 0) throw new Error(`${label}为空，请选择非空素材文件。`);
  if (bytes > MAX_INLINE_MEDIA_BYTES) {
    throw new Error(`${label}原始文件大小超过 20 MiB（${MAX_INLINE_MEDIA_BYTES} 字节），当前 ${bytes} 字节。请压缩后重试，或通过 App 导入。`);
  }
}

/** Validate the media envelope before decoding or mutating a board. */
export function parseInlineMediaDataUrl(value: unknown, kind: "image" | "video"): { dataUrl: string; mimeType: string; dataBase64: string } {
  const label = kind === "image" ? "图片" : "视频";
  if (typeof value !== "string") throw new Error(`${label} data URL 必须是字符串。`);
  if (value.length > MAX_INLINE_MEDIA_DATA_URL_LENGTH) {
    throw new Error(`${label}数据超过导入上限，原始文件不能超过 20 MiB。请压缩后重试，或通过 App 导入。`);
  }
  const comma = value.indexOf(",");
  const header = comma > 0 && comma < 128 ? value.slice(0, comma) : "";
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64$/u.exec(header);
  const mimeType = match?.[1].toLowerCase();
  if (!mimeType || (kind === "image" ? !mimeType.startsWith("image/") : !["video/mp4", "video/quicktime", "video/webm"].includes(mimeType))) {
    throw new Error(kind === "image" ? "仅支持 Base64 编码的图片 data URL。" : "仅支持 mp4、mov 或 webm 的视频 data URL。");
  }
  const dataBase64 = value.slice(comma + 1);
  const padding = dataBase64.endsWith("==") ? 2 : dataBase64.endsWith("=") ? 1 : 0;
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(dataBase64) || dataBase64.length % 4 === 1 || (padding > 0 && dataBase64.length % 4 !== 0)) {
    throw new Error(`${label}包含无效的 Base64 数据。`);
  }
  // For valid Base64, this is the decoded byte count, including unpadded input.
  assertInlineMediaByteLength(Math.floor(dataBase64.length * 3 / 4) - padding, label);
  return { dataUrl: value, mimeType, dataBase64 };
}
