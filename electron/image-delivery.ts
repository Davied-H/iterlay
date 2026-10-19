import { createHash } from "node:crypto";
import { open, rm } from "node:fs/promises";
import path from "node:path";
import type { NativeImage } from "electron";
import type { BoardData } from "../shared/types.js";
import { resolveDeliverySource, validateImageDeliveryRecipe, type ImageDeliveryItem, type ImageDeliveryManifest, type ImageDeliveryRecipe } from "../shared/image-delivery.js";
import { buildNamedArchive } from "./asset-archive.js";
import { imageDimensionsFromHeader } from "./media/image-metadata.js";
import { detectRemoteImageMime } from "./remote-image.js";

export interface DeliveryEncodedImage { bytes: Buffer; mimeType: string; width: number; height: number }
export interface DeliveryEncoderDependencies {
  createImage: (bytes: Buffer) => NativeImage;
  createBitmap: (bytes: Buffer, size: { width: number; height: number }) => NativeImage;
  webp: (png: Buffer, quality: number) => Promise<Buffer>;
  decodeToPng?: (bytes: Buffer) => Promise<Buffer>;
}

/** 缩放真实像素并编码；扩展名、尺寸和 MIME 均从实际输出再次核验。 */
export async function encodeDeliveryImage(bytes: Buffer, item: ImageDeliveryItem, deps: DeliveryEncoderDependencies): Promise<DeliveryEncodedImage> {
  let image = deps.createImage(bytes);
  if (image.isEmpty() && deps.decodeToPng) image = deps.createImage(await deps.decodeToPng(bytes));
  if (image.isEmpty()) throw new Error("交付源文件不是可解码的图片。");
  const source = image.getSize();
  const width = item.width ?? (item.height ? Math.max(1, Math.round(source.width * item.height / source.height)) : source.width);
  const height = item.height ?? (item.width ? Math.max(1, Math.round(source.height * item.width / source.width)) : source.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 32_000_000) throw new Error("目标尺寸无效，单张交付最多 3200 万像素。");
  if (source.width !== width || source.height !== height) image = image.resize({ width, height, quality: "best" });
  if (image.getSize().width !== width || image.getSize().height !== height) throw new Error("图片缩放未得到指定尺寸，已取消导出。");
  if (item.format === "jpeg") {
    // JPEG 不支持透明度；明确铺白底，避免透明区域变黑。
    const bitmap = image.toBitmap({ scaleFactor: 1 });
    for (let index = 0; index < bitmap.length; index += 4) {
      const alpha = bitmap[index + 3] / 255;
      // Electron 位图为预乘 BGRA，恢复到白底只需补入剩余白色分量。
      for (let channel = 0; channel < 3; channel++) bitmap[index + channel] = Math.min(255, bitmap[index + channel] + Math.round(255 * (1 - alpha)));
      bitmap[index + 3] = 255;
    }
    image = deps.createBitmap(bitmap, { width, height });
  }
  const output = item.format === "jpeg" ? image.toJPEG(item.quality ?? 90)
    : item.format === "webp" ? await deps.webp(image.toPNG(), item.quality ?? 90) : image.toPNG();
  const expectedMime = item.format === "jpeg" ? "image/jpeg" : `image/${item.format}`;
  const dimensions = imageDimensionsFromHeader(output);
  if (detectRemoteImageMime(output) !== expectedMime || !dimensions || dimensions.width !== width || dimensions.height !== height) throw new Error("导出文件字节、格式或尺寸校验失败，已取消写入。");
  return { bytes: output, mimeType: expectedMime, width, height };
}

export async function buildImageDelivery(
  board: BoardData,
  value: ImageDeliveryRecipe,
  readBytes: (sourcePath: string) => Promise<Buffer>,
  encode: (bytes: Buffer, item: ImageDeliveryItem) => Promise<DeliveryEncodedImage>
): Promise<{ archive: Buffer; manifest: ImageDeliveryManifest }> {
  const recipe = validateImageDeliveryRecipe(value);
  // 先核对全部绑定，避免某个源失效时交出部分内容。
  const sources = recipe.items.map((item) => resolveDeliverySource(board, item));
  const entries: Array<{ name: string; bytes: Buffer }> = [];
  const manifest: ImageDeliveryManifest = {
    format: "iterlay-image-delivery", version: 1, boardId: board.id, recipeId: recipe.id,
    recipeName: recipe.name, exportedAt: new Date().toISOString(), files: []
  };
  let totalBytes = 0;
  for (const [index, item] of recipe.items.entries()) {
    const source = sources[index];
    const bytes = await readBytes(source.imagePath);
    const encoded = await encode(bytes, item);
    const dimensions = imageDimensionsFromHeader(encoded.bytes);
    const expectedMime = item.format === "jpeg" ? "image/jpeg" : `image/${item.format}`;
    if (detectRemoteImageMime(encoded.bytes) !== expectedMime || !dimensions || dimensions.width !== encoded.width || dimensions.height !== encoded.height) throw new Error("交付编码结果与格式、尺寸不一致。");
    if (item.width && dimensions.width !== item.width || item.height && dimensions.height !== item.height) throw new Error("交付编码结果未达到配方指定尺寸。");
    totalBytes += encoded.bytes.length;
    if (totalBytes > 400 * 1024 * 1024) throw new Error("交付文件总大小不能超过 400 MB。");
    entries.push({ name: item.relativePath, bytes: encoded.bytes });
    manifest.files.push({
      path: item.relativePath, purpose: item.purpose.trim(), sourceNodeId: item.nodeId,
      sourceVersion: { jobId: source.jobId, fileName: path.basename(source.imagePath), sha256: createHash("sha256").update(bytes).digest("hex") },
      mimeType: expectedMime, width: dimensions.width, height: dimensions.height,
      bytes: encoded.bytes.length, sha256: createHash("sha256").update(encoded.bytes).digest("hex")
    });
  }
  entries.push({ name: "manifest.json", bytes: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") });
  return { archive: await buildNamedArchive(entries), manifest };
}

/** 用户选定位置仍使用排他创建；拒绝覆盖已经存在的交付包。 */
export async function writeImageDeliveryArchive(filePath: string, bytes: Buffer): Promise<void> {
  const handle = await open(filePath, "wx").catch((error: NodeJS.ErrnoException) => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("目标文件已存在，请选择新文件名；不会覆盖已有交付。");
    throw error;
  });
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(filePath, { force: true });
    throw error;
  }
  await handle.close();
}
