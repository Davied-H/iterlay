import { BrowserWindow } from "electron";
import { imageDimensionsFromHeader } from "./media/image-metadata.js";
import { detectRemoteImageMime } from "./remote-image.js";

/** Chromium 自带 WebP 编码器：不依赖额外媒体工具，不访问网络，也不创建可见窗口。 */
export async function encodeDeliveryWebp(png: Buffer, quality: number): Promise<Buffer> {
  return transcodeImage(png, "webp", quality);
}

/** nativeImage 无法解码 WebP 等格式时，用同一隔离编码器转换为 PNG。 */
export async function decodeDeliveryToPng(bytes: Buffer): Promise<Buffer> {
  return transcodeImage(bytes, "png", 100);
}

async function transcodeImage(input: Buffer, format: "png" | "webp", quality: number): Promise<Buffer> {
  const dimensions = imageDimensionsFromHeader(input);
  const mimeType = detectRemoteImageMime(input);
  if (!dimensions || dimensions.width * dimensions.height > 32_000_000 || !mimeType || input.length > 100 * 1024 * 1024 || !Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("图像编码输入无效或超过大小限制。");
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false, partition: "image-delivery-encoder" }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("<!doctype html><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src data:;\"><title>Image encoder</title>"));
    const dataUrl = `data:${mimeType};base64,${input.toString("base64")}`;
    const encoded = await Promise.race([
      window.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify(dataUrl)};
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image encoding context unavailable");
        context.drawImage(image, 0, 0);
        return canvas.toDataURL(${JSON.stringify(`image/${format}`)}, ${quality / 100});
      })()`),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("WebP 编码超时。")), 60_000); })
    ]);
    const prefix = `data:image/${format};base64,`;
    if (typeof encoded !== "string" || !encoded.startsWith(prefix)) throw new Error("图像编码器未返回指定格式。");
    const bytes = Buffer.from(encoded.slice(prefix.length), "base64");
    if (bytes.length > 100 * 1024 * 1024) throw new Error("图像编码输出超过大小限制。");
    return bytes;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (!window.isDestroyed()) window.destroy();
  }
}
