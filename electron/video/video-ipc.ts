import { dialog, ipcMain, net, shell } from "electron";
import path from "node:path";
import { showVideoGenerationNotification } from "../system-notification.js";
import { registerVideoCommands, type VideoIpcDependencies } from "./video-commands.js";

export function registerVideoIpc(dependencies: VideoIpcDependencies) {
  const registration = registerVideoCommands(dependencies, (channel, handler) => ipcMain.handle(channel, handler), showVideoGenerationNotification, net.fetch.bind(net));
  const { assets } = dependencies;
  ipcMain.handle("video:save", async (_event, sourcePath: string) => {
    assets.toAssetUrl(sourcePath);
    const result = await dialog.showSaveDialog({
      defaultPath: path.basename(sourcePath),
      filters: [{ name: "视频", extensions: [path.extname(sourcePath).slice(1) || "mp4"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    await assets.exportAsset(sourcePath, result.filePath);
    return { ok: true, path: result.filePath };
  });
  ipcMain.handle("video:reveal", async (_event, sourcePath: string) => {
    await assets.readManagedBytes(sourcePath);
    shell.showItemInFolder(sourcePath);
    return { ok: true };
  });

  return registration;
}
