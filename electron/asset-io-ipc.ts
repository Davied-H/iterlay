import { ipcMain, nativeImage, type NativeImage } from "electron";
import path from "node:path";
import {
  type AnalyzeSliceSubjectsRequest,
  type AnalyzeSliceSubjectsResult,
  type SliceImageRequest,
  type SliceImageResult,
  type TextProviderConfig
} from "../shared/types.js";
import { MAX_SLICE_COUNT, validateCropRect } from "../shared/image-slicing.js";
import { analyzeSliceSubjectsWith, type TextTransport } from "./providers/text-assistant.js";
import { normalizeProviderError } from "./providers/errors.js";
import { detectRemoteImageMime, downloadRemoteImage } from "./remote-image.js";
import { ImageTaskQueue } from "./image-worker-client.js";
import type { LicenseService } from "./licensing/service.js";
import { AssetStore } from "./storage/asset-store.js";
import type { ThumbHashEntry, ThumbHashStore } from "./storage/thumbhash-store.js";
import type { ThumbHashResult } from "./thumbhash-encoder.js";

interface AssetIoIpcDependencies {
  assets: Pick<
    AssetStore,
    "deleteManagedAsset" | "saveUpload" | "saveUploadBytes" | "readManagedBytes" | "readManagedDataUrl" | "toAssetUrl" | "saveDerivedPngs"
  >;
  license: Pick<LicenseService, "assertCapability">;
  imageTasks: Pick<ImageTaskQueue, "run">;
  thumbHashes: Pick<ThumbHashStore, "put" | "putMany">;
  referencedAssetPaths: () => Promise<Set<string>>;
  invalidateAssetCatalog: () => void;
  backfillThumbHashes: (imagePaths: string[]) => void;
  createThumbHashForNativeImage: (image: NativeImage) => Promise<ThumbHashResult | null>;
  getAssetThumbnailUrl: (sourcePath: string, requestedSize?: number) => Promise<string>;
  resolveTextProvider: (requestedId: string | undefined, capability: "generate" | "edit") => TextProviderConfig;
  getTextTransport: (config: TextProviderConfig) => TextTransport;
  trackAssetImported: (source: "upload" | "url") => void;
}

export function registerAssetIoIpc({
  assets,
  license,
  imageTasks,
  thumbHashes,
  referencedAssetPaths,
  invalidateAssetCatalog,
  backfillThumbHashes,
  createThumbHashForNativeImage,
  getAssetThumbnailUrl,
  resolveTextProvider,
  getTextTransport,
  trackAssetImported
}: AssetIoIpcDependencies): void {
  ipcMain.handle("asset:delete", async (_event, sourcePath: unknown) => {
    if (typeof sourcePath !== "string") throw new Error("无法识别要删除的素材。");
    const normalized = path.resolve(sourcePath);
    if ((await referencedAssetPaths()).has(normalized)) {
      return { ok: false, message: "素材仍被画板、历史或场景引用。" };
    }
    const deleted = await assets.deleteManagedAsset(normalized);
    invalidateAssetCatalog();
    return { ok: deleted, message: deleted ? undefined : "素材不存在或不属于工作区。" };
  });

  ipcMain.handle("asset:importUpload", async (_event, dataUrl: string) => {
    license.assertCapability("import");
    const filePath = await assets.saveUpload(dataUrl);
    backfillThumbHashes([filePath]);
    trackAssetImported("upload");
    return { path: filePath };
  });

  ipcMain.handle("asset:importUrl", async (_event, imageUrl: unknown) => {
    license.assertCapability("import");
    if (typeof imageUrl !== "string") throw new Error("无法识别图片链接。");
    const downloaded = await downloadRemoteImage(imageUrl);
    const image = await imageTasks.run(() => nativeImage.createFromBuffer(downloaded.bytes));
    if (image.isEmpty()) throw new Error("链接内容不是可识别的图片。");
    const size = image.getSize();
    if (
      size.width <= 0 ||
      size.height <= 0 ||
      size.width > 32_768 ||
      size.height > 32_768 ||
      size.width * size.height > 100_000_000
    ) {
      throw new Error("图片尺寸无效或过大。");
    }

    const detectedMime = detectRemoteImageMime(downloaded.bytes);
    const mimeType = detectedMime ?? "image/png";
    const bytes = detectedMime ? downloaded.bytes : await imageTasks.run(() => image.toPNG());
    const filePath = await assets.saveUploadBytes(bytes, mimeType);
    // 复用已解码的 NativeImage 实例编码，免二次读盘。
    const thumbResult = await createThumbHashForNativeImage(image);
    if (thumbResult) void thumbHashes.put({ imagePath: filePath, ...thumbResult }).catch(() => undefined);
    trackAssetImported("url");
    return {
      path: filePath,
      dataUrl: assets.toAssetUrl(filePath),
      width: size.width,
      height: size.height
    };
  });



  ipcMain.handle("asset:readDataUrl", async (_event, sourcePath: string) =>
    assets.readManagedDataUrl(sourcePath)
  );

  ipcMain.handle(
    "asset:analyzeSliceSubjects",
    async (_event, request: AnalyzeSliceSubjectsRequest): Promise<AnalyzeSliceSubjectsResult> => {
      if (!request || typeof request.sourcePath !== "string" || !Array.isArray(request.crops)) {
        throw new Error("AI 主体识别参数无效。");
      }
      if (request.crops.length === 0 || request.crops.length > MAX_SLICE_COUNT) {
        throw new Error(`一次最多识别 ${MAX_SLICE_COUNT} 个主体。`);
      }
      const sourceBytes = await assets.readManagedBytes(request.sourcePath);
      const sourceImage = await imageTasks.run(() => nativeImage.createFromBuffer(sourceBytes));
      if (sourceImage.isEmpty()) throw new Error("无法读取待识别图片。");
      const size = sourceImage.getSize();
      request.crops.forEach((crop) => validateCropRect(crop, size.width, size.height));
      try {
        const textProvider = resolveTextProvider(request.textProviderId, "edit");
        const imageDataUrl = await assets.readManagedDataUrl(request.sourcePath);
        const items = await analyzeSliceSubjectsWith(getTextTransport(textProvider), imageDataUrl, request.crops);
        return { items };
      } catch (error) {
        throw normalizeProviderError(error);
      }
    }
  );

  ipcMain.handle("asset:thumbnail", async (_event, sourcePath: string, maxSize?: number) =>
    getAssetThumbnailUrl(sourcePath, maxSize)
  );

  ipcMain.handle(
    "asset:slice",
    async (_event, request: SliceImageRequest): Promise<SliceImageResult[]> => {
      license.assertCapability("edit");
      if (!request || typeof request.sourcePath !== "string" || !Array.isArray(request.crops)) {
        throw new Error("切图参数无效。");
      }
      if (request.crops.length === 0 || request.crops.length > MAX_SLICE_COUNT) {
        throw new Error(`一次最多切出 ${MAX_SLICE_COUNT} 张图片。`);
      }

      const sourceBytes = await assets.readManagedBytes(request.sourcePath);
      const sourceImage = await imageTasks.run(() => nativeImage.createFromBuffer(sourceBytes));
      if (sourceImage.isEmpty()) throw new Error("无法读取待切图片。");
      const size = sourceImage.getSize();
      request.crops.forEach((crop) => validateCropRect(crop, size.width, size.height));

      const cropImages: NativeImage[] = [];
      const buffers: Buffer[] = [];
      for (const crop of request.crops) {
        const result = await imageTasks.run(() => {
          const image = sourceImage.crop(crop);
          return { image, bytes: image.toPNG() };
        });
        cropImages.push(result.image);
        buffers.push(result.bytes);
      }
      const paths = await assets.saveDerivedPngs(`slice-${Date.now()}-${crypto.randomUUID()}`, buffers);
      const cropEntries = (await Promise.all(paths.map(async (filePath, index) => {
        const result = await createThumbHashForNativeImage(cropImages[index]);
        return result ? { imagePath: filePath, ...result } : null;
      }))).filter((entry): entry is ThumbHashEntry => entry !== null);
      void thumbHashes.putMany(cropEntries).catch(() => undefined);
      return paths.map((filePath, index) => ({
        path: filePath,
        dataUrl: assets.toAssetUrl(filePath),
        width: request.crops[index].width,
        height: request.crops[index].height
      }));
    }
  );

}
