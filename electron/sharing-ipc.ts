import { ONLINE_SHARING_AVAILABLE } from "../shared/sharing-availability.js";
import { ipcMain, nativeImage } from "electron";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import type { OnlineImageShareRequest, OnlineShareSession } from "../shared/types.js";
import { getAppIconPath } from "./app-icon.js";
import { buildOnlineImageDetailSharePage, buildOnlineImageSharePage } from "./image-share-page.js";
import { ManagerPublicShareClient } from "./public-share-client.js";
import { MAX_MANAGED_IMAGE_BYTES, type AssetStore } from "./storage/asset-store.js";
import type { HistoryStore } from "./storage/history-store.js";
import type { SettingsStore } from "./storage/settings-store.js";
import { assertDownloadChildPath, buildWechatMobileSharePage } from "./wechat-share-page.js";

interface SharingIpcDependencies {
  settings: Pick<SettingsStore, "getSettings">;
  history: Pick<HistoryStore, "listJobs">;
  assets: Pick<AssetStore, "readManagedBytes">;
  ensureDownloadDirectory: (input: string) => Promise<string>;
  publicShareClient: ManagerPublicShareClient;
  trackShareCreated: (surface: "download" | "image") => void;
}

export function registerSharingIpc({
  settings,
  history,
  assets,
  ensureDownloadDirectory,
  publicShareClient,
  trackShareCreated
}: SharingIpcDependencies): { dispose: () => void } {
  let wechatShareServer: Server | null = null;
  let wechatShareTimer: ReturnType<typeof setTimeout> | null = null;
  let activeOnlineShare: OnlineShareSession | null = null;

  ipcMain.handle("downloads:sharePath", async (_event, input: unknown) => {
    if (!ONLINE_SHARING_AVAILABLE) throw new Error("在线分享暂未开放，请使用本地导出。");
    if (typeof input !== "string" || !path.isAbsolute(input)) throw new Error("分享文件路径无效。");
    const directory = settings.getSettings().downloadDirectory?.trim();
    if (!directory) throw new Error("请先完成一次下载后再发送到手机。");
    const safeDirectory = await ensureDownloadDirectory(directory);
    const targetPath = path.resolve(input);
    const relative = path.relative(safeDirectory, targetPath);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("只能分享下载目录中的文件。");
    }
    const info = await stat(targetPath);
    if (!info.isFile() || info.size <= 0 || info.size > 32 * 1024 * 1024) {
      throw new Error("分享文件为空或超过 32MB。");
    }

    await stopWechatShareServer();
    const token = crypto.randomUUID();
    const route = `/${token}/${encodeURIComponent(path.basename(targetPath))}`;
    const server = createServer((request, response) => {
      if (request.method !== "GET" || (request.url !== route && request.url !== `${route}/`)) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", mimeFromSharedPath(targetPath));
      response.setHeader("Content-Length", String(info.size));
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(path.basename(targetPath))}`);
      createReadStream(targetPath).pipe(response);
    });
    wechatShareServer = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      await stopWechatShareServer();
      throw new Error("无法启动本地公网分享服务。");
    }
    try {
      const shared = await publicShareClient.start(`http://127.0.0.1:${address.port}${route}`);
      const session = activateOnlineShare("image", path.basename(targetPath), shared);
      trackShareCreated("download");
      return { ok: true, ...session };
    } catch (error) {
      await stopWechatShareServer();
      throw error;
    }
  });

  ipcMain.handle("sharing:startImage", async (_event, input: unknown) => {
    if (!ONLINE_SHARING_AVAILABLE) throw new Error("在线分享暂未开放，请使用本地导出。");
    if (!settings.getSettings().onlineImageSharingEnabled) {
      throw new Error("请先在设置中开启“快速分享图片”。");
    }
    const request: OnlineImageShareRequest = typeof input === "string"
      ? { sourcePath: input, showPrompt: false }
      : input && typeof input === "object" && !Array.isArray(input)
        ? input as OnlineImageShareRequest
        : { sourcePath: "", showPrompt: false };
    const rawSourcePaths: unknown[] = Array.isArray(request.sourcePaths) ? request.sourcePaths : [request.sourcePath];
    if (
      rawSourcePaths.length === 0 ||
      rawSourcePaths.length > 24 ||
      rawSourcePaths.some((sourcePath) => typeof sourcePath !== "string" || !path.isAbsolute(sourcePath))
    ) {
      throw new Error("分享图片路径无效。");
    }
    const sourcePaths = rawSourcePaths as string[];
    if (
      request.jobId !== undefined &&
      (sourcePaths.length !== 1 || typeof request.jobId !== "string" || request.jobId.length > 200)
    ) {
      throw new Error("分享图片的生成信息无效。");
    }
    if (
      request.jobIds !== undefined &&
      (sourcePaths.length < 2 || !Array.isArray(request.jobIds) || request.jobIds.length !== sourcePaths.length || request.jobIds.some((jobId) => typeof jobId !== "string" || jobId.length > 200))
    ) {
      throw new Error("分享图片的生成信息无效。");
    }
    if (typeof request.showPrompt !== "boolean") throw new Error("分享图片配置无效。");
    const shareOrigin = normalizeOnlineShareOrigin(request.origin);

    const sharedImages = await Promise.all(sourcePaths.map(async (sourcePath) => {
      const targetPath = path.resolve(sourcePath);
      const bytes = await assets.readManagedBytes(targetPath);
      if (bytes.length === 0 || bytes.length > MAX_MANAGED_IMAGE_BYTES) {
        throw new Error("分享图片为空或超过 25MB。");
      }
      return {
        bytes,
        targetPath,
        fileName: path.basename(targetPath) || "iterlay-image.png"
      };
    }));

    await stopWechatShareServer();
    const job = sourcePaths.length === 1 && request.showPrompt && request.jobId
      ? (await history.listJobs()).find((item) => item.id === request.jobId)
      : undefined;
    const jobsById = request.showPrompt && sourcePaths.length > 1 && request.jobIds
      ? new Map((await history.listJobs()).map((item) => [item.id, item]))
      : new Map();
    const references: Array<{ bytes: Buffer; filePath: string }> = [];
    for (const filePath of job?.referenceImagePaths.slice(0, 4) ?? []) {
      try {
        const referenceBytes = await assets.readManagedBytes(filePath);
        if (referenceBytes.length > 0 && referenceBytes.length <= MAX_MANAGED_IMAGE_BYTES) {
          references.push({ bytes: referenceBytes, filePath });
        }
      } catch {
        // A deleted reference should not prevent the main image from being shared.
      }
    }
    const collectionDetails = sourcePaths.length > 1 && request.showPrompt && request.jobIds
      ? await Promise.all(request.jobIds.map(async (jobId) => {
        const imageJob = jobsById.get(jobId);
        const imageReferences: Array<{ bytes: Buffer; filePath: string }> = [];
        for (const filePath of imageJob?.referenceImagePaths.slice(0, 4) ?? []) {
          try {
            const referenceBytes = await assets.readManagedBytes(filePath);
            if (referenceBytes.length > 0 && referenceBytes.length <= MAX_MANAGED_IMAGE_BYTES) {
              imageReferences.push({ bytes: referenceBytes, filePath });
            }
          } catch {
            // A deleted reference should not prevent the main image from being shared.
          }
        }
        return { prompt: imageJob?.prompt ?? "", references: imageReferences };
      }))
      : [];
    const logoImage = nativeImage.createFromPath(getAppIconPath("default"));
    if (logoImage.isEmpty()) throw new Error("无法读取 Iterlay 品牌图标。");
    const logoBytes = logoImage.resize({ width: 96, height: 96, quality: "best" }).toPNG();
    const page = Buffer.from(buildOnlineImageSharePage({
      prompt: job?.prompt ?? "",
      referenceCount: references.length,
      showPrompt: sourcePaths.length === 1 && request.showPrompt,
      imageCount: sharedImages.length
    }), "utf8");
    const token = crypto.randomUUID();
    const route = `/${token}`;
    const server = createServer((request, response) => {
      const requestPath = request.url?.split("?", 1)[0] ?? "";
      if (request.method !== "GET") {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      if (requestPath === route || requestPath === `${route}/`) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Content-Length", String(page.length));
        response.setHeader("Cache-Control", "private, no-store");
        response.end(page);
        return;
      }
      const imageDetailMatch = requestPath.match(new RegExp(`^${route}/images/([1-9]|1[0-9]|2[0-4])/detail$`));
      if (imageDetailMatch) {
        const imageIndex = Number(imageDetailMatch[1]) - 1;
        const detail = collectionDetails[imageIndex];
        if (!sharedImages[imageIndex]) {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }
        const detailPage = Buffer.from(buildOnlineImageDetailSharePage({
          imageNumber: imageIndex + 1,
          prompt: detail?.prompt ?? "",
          referenceCount: detail?.references.length ?? 0
        }), "utf8");
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Content-Length", String(detailPage.length));
        response.setHeader("Cache-Control", "private, no-store");
        response.end(detailPage);
        return;
      }
      if (requestPath === `${route}/brand-logo`) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "image/png");
        response.setHeader("Content-Length", String(logoBytes.length));
        response.setHeader("Cache-Control", "private, max-age=600");
        response.end(logoBytes);
        return;
      }
      if (requestPath === `${route}/import` && sharedImages.length === 1) {
        const payload = Buffer.from(JSON.stringify({
          prompt: job?.prompt ?? "",
          referenceUrls: references.map((_, index) => `references/${index + 1}`)
        }), "utf8");
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Content-Length", String(payload.length));
        response.setHeader("Cache-Control", "private, no-store");
        response.end(payload);
        return;
      }
      const referenceMatch = requestPath.match(new RegExp(`^${route}/references/([1-4])$`));
      if (referenceMatch) {
        const reference = references[Number(referenceMatch[1]) - 1];
        if (reference) {
          response.statusCode = 200;
          response.setHeader("Content-Type", mimeFromSharedPath(reference.filePath));
          response.setHeader("Content-Length", String(reference.bytes.length));
          response.setHeader("Cache-Control", "private, max-age=600");
          response.end(reference.bytes);
          return;
        }
      }
      const referenceDownloadMatch = requestPath.match(new RegExp(`^${route}/references/([1-4])/download$`));
      if (referenceDownloadMatch) {
        const referenceIndex = Number(referenceDownloadMatch[1]) - 1;
        const reference = references[referenceIndex];
        if (reference) {
          const referenceFileName = path.basename(reference.filePath) || `reference-${referenceIndex + 1}.png`;
          response.statusCode = 200;
          response.setHeader("Content-Type", mimeFromSharedPath(reference.filePath));
          response.setHeader("Content-Length", String(reference.bytes.length));
          response.setHeader("Cache-Control", "private, max-age=600");
          response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(referenceFileName)}`);
          response.end(reference.bytes);
          return;
        }
      }
      const collectionReferenceMatch = requestPath.match(new RegExp(`^${route}/images/([1-9]|1[0-9]|2[0-4])/references/([1-4])(/download)?$`));
      if (collectionReferenceMatch) {
        const imageIndex = Number(collectionReferenceMatch[1]) - 1;
        const referenceIndex = Number(collectionReferenceMatch[2]) - 1;
        const reference = collectionDetails[imageIndex]?.references[referenceIndex];
        if (reference) {
          const download = Boolean(collectionReferenceMatch[3]);
          response.statusCode = 200;
          response.setHeader("Content-Type", mimeFromSharedPath(reference.filePath));
          response.setHeader("Content-Length", String(reference.bytes.length));
          response.setHeader("Cache-Control", "private, max-age=600");
          if (download) {
            response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(reference.filePath) || `reference-${referenceIndex + 1}.png`)}`);
          }
          response.end(reference.bytes);
          return;
        }
      }
      const imageMatch = sharedImages.length === 1
        ? (requestPath === `${route}/image` ? ["", "0"] : null)
        : requestPath.match(new RegExp(`^${route}/images/([1-9]|1[0-9]|2[0-4])$`));
      const imageDownloadMatch = sharedImages.length > 1
        ? requestPath.match(new RegExp(`^${route}/images/([1-9]|1[0-9]|2[0-4])/download$`))
        : null;
      if (imageDownloadMatch) {
        const image = sharedImages[Number(imageDownloadMatch[1]) - 1];
        if (image) {
          response.statusCode = 200;
          response.setHeader("Content-Type", mimeFromSharedPath(image.targetPath));
          response.setHeader("Content-Length", String(image.bytes.length));
          response.setHeader("Cache-Control", "private, max-age=600");
          response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(image.fileName)}`);
          response.end(image.bytes);
          return;
        }
      }
      if (!imageMatch) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      const image = sharedImages[Number(imageMatch[1])];
      if (!image) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", mimeFromSharedPath(image.targetPath));
      response.setHeader("Content-Length", String(image.bytes.length));
      response.setHeader("Cache-Control", "private, max-age=600");
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(image.fileName)}`);
      response.end(image.bytes);
    });
    wechatShareServer = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      await stopWechatShareServer();
      throw new Error("无法启动本地公网分享服务。");
    }
    try {
      const shared = await publicShareClient.start(`http://127.0.0.1:${address.port}${route}`);
      const session = activateOnlineShare(
        "image",
        sharedImages.length === 1 ? sharedImages[0].fileName : `${sharedImages.length} 张图片快速分享`,
        shared,
        shareOrigin
      );
      trackShareCreated("image");
      return { ok: true, ...session };
    } catch (error) {
      await stopWechatShareServer();
      throw error;
    }
  });

  ipcMain.handle("downloads:shareWechatPackage", async (_event, input: unknown) => {
    if (!ONLINE_SHARING_AVAILABLE) throw new Error("在线分享暂未开放，请使用本地导出。");
    if (!input || typeof input !== "object") throw new Error("微信表情分享参数无效。");
    const folderPath = (input as { folderPath?: unknown }).folderPath;
    const zipPath = (input as { zipPath?: unknown }).zipPath;
    const shareOrigin = normalizeOnlineShareOrigin((input as { origin?: unknown }).origin);
    if (typeof folderPath !== "string" || !path.isAbsolute(folderPath)) throw new Error("微信表情目录无效。");
    const directory = settings.getSettings().downloadDirectory?.trim();
    if (!directory) throw new Error("请先完成一次下载后再发送到手机。");
    const safeDirectory = await ensureDownloadDirectory(directory);
    const safeFolderPath = assertDownloadChildPath(safeDirectory, folderPath);
    const folderInfo = await stat(safeFolderPath);
    if (!folderInfo.isDirectory()) throw new Error("微信表情目录不存在。");
    const stickersDirectory = path.join(safeFolderPath, "stickers");
    const stickerNames = (await readdir(stickersDirectory))
      .filter((name) => /\.(?:png|gif|jpe?g)$/i.test(name))
      .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
    if (stickerNames.length === 0 || stickerNames.length > 24) throw new Error("微信表情目录中没有可分享的图片。");
    const safeZipPath = typeof zipPath === "string" && path.isAbsolute(zipPath)
      ? assertDownloadChildPath(safeDirectory, zipPath)
      : undefined;

    await stopWechatShareServer();
    const token = crypto.randomUUID();
    const pageRoute = `/${token}`;
    const server = createServer(async (request, response) => {
      try {
        if (request.method !== "GET" || !request.url) {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }
        const requestUrl = new URL(request.url, "http://localhost");
        if (requestUrl.pathname === pageRoute || requestUrl.pathname === `${pageRoute}/`) {
          const page = buildWechatMobileSharePage({
            packageName: path.basename(safeFolderPath),
            stickerNames,
            hasZip: Boolean(safeZipPath)
          });
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(page);
          return;
        }
        const stickerPrefix = `${pageRoute}/stickers/`;
        if (requestUrl.pathname.startsWith(stickerPrefix)) {
          const fileName = path.basename(decodeURIComponent(requestUrl.pathname.slice(stickerPrefix.length)));
          if (!stickerNames.includes(fileName)) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          const targetPath = path.join(stickersDirectory, fileName);
          const fileInfo = await stat(targetPath);
          response.statusCode = 200;
          response.setHeader("Content-Type", mimeFromSharedPath(targetPath));
          response.setHeader("Content-Length", String(fileInfo.size));
          response.setHeader("Cache-Control", "private, max-age=600");
          response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
          createReadStream(targetPath).pipe(response);
          return;
        }
        if (requestUrl.pathname === `${pageRoute}/package.zip` && safeZipPath) {
          const fileInfo = await stat(safeZipPath);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/zip");
          response.setHeader("Content-Length", String(fileInfo.size));
          response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(safeZipPath))}`);
          createReadStream(safeZipPath).pipe(response);
          return;
        }
        response.statusCode = 404;
        response.end("Not found");
      } catch {
        response.statusCode = 500;
        response.end("Unable to read sticker");
      }
    });
    wechatShareServer = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      await stopWechatShareServer();
      throw new Error("无法启动本地公网分享服务。");
    }
    try {
      const shared = await publicShareClient.start(`http://127.0.0.1:${address.port}${pageRoute}`);
      const session = activateOnlineShare(
        "wechat-stickers",
        path.basename(safeFolderPath),
        shared,
        shareOrigin
      );
      return { ok: true, ...session };
    } catch (error) {
      await stopWechatShareServer();
      throw error;
    }
  });

  ipcMain.handle("downloads:stopSharing", async () => {
    await stopWechatShareServer();
    return { ok: true };
  });
  ipcMain.handle("sharing:getActive", () => {
    if (activeOnlineShare && activeOnlineShare.expiresAt <= Date.now()) {
      void stopWechatShareServer();
      return null;
    }
    return activeOnlineShare ? { ...activeOnlineShare } : null;
  });
  ipcMain.handle("sharing:stop", async () => {
    await stopWechatShareServer();
    return { ok: true };
  });

  function activateOnlineShare(
    kind: OnlineShareSession["kind"],
    title: string,
    shared: { url: string; expiresAt: number },
    origin?: OnlineShareSession["origin"]
  ): OnlineShareSession {
    const session: OnlineShareSession = {
      id: crypto.randomUUID(),
      kind,
      title,
      url: shared.url,
      startedAt: Date.now(),
      expiresAt: shared.expiresAt,
      ...(origin ? { origin } : {})
    };
    activeOnlineShare = session;
    const remaining = Math.max(0, shared.expiresAt - Date.now());
    wechatShareTimer = setTimeout(() => void stopWechatShareServer(), remaining);
    wechatShareTimer.unref?.();
    return session;
  }

  async function stopWechatShareServer(): Promise<void> {
    if (wechatShareTimer) clearTimeout(wechatShareTimer);
    wechatShareTimer = null;
    const server = wechatShareServer;
    wechatShareServer = null;
    activeOnlineShare = null;
    server?.close();
    server?.closeAllConnections();
    await publicShareClient.stop();
  }

  return {
    dispose: () => {
      void stopWechatShareServer();
    }
  };
}

function mimeFromSharedPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".zip") return "application/zip";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  return "application/octet-stream";
}

function normalizeOnlineShareOrigin(input: unknown): OnlineShareSession["origin"] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const boardId = (input as { boardId?: unknown }).boardId;
  const nodeIds = (input as { nodeIds?: unknown }).nodeIds;
  if (
    typeof boardId !== "string" ||
    !boardId.trim() ||
    boardId.length > 200 ||
    !Array.isArray(nodeIds)
  ) return undefined;
  const normalizedNodeIds = [...new Set(nodeIds.filter(
    (nodeId): nodeId is string => typeof nodeId === "string" && Boolean(nodeId.trim()) && nodeId.length <= 200
  ))].slice(0, 100);
  if (normalizedNodeIds.length === 0) return undefined;
  return { boardId, nodeIds: normalizedNodeIds };
}
