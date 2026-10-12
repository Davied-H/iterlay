import { ipcMain } from "electron";
import type { UpdateChannel } from "../../shared/app-update.js";
import type { AppUpdateService } from "./service.js";

export function registerUpdateIpc(update: AppUpdateService): void {
  ipcMain.handle("update:getState", () => update.getState());
  ipcMain.handle("update:check", () => update.check("manual"));
  ipcMain.handle("update:download", () => update.downloadAndInstall());
  ipcMain.handle("update:cancelDownload", () => update.cancelDownload());
  ipcMain.handle("update:install", () => update.install());
  ipcMain.handle("update:skipVersion", (_event, version: string) => update.skipVersion(version));
  ipcMain.handle("update:setChannel", (_event, channel: UpdateChannel) => update.setChannel(channel));
  ipcMain.handle("update:dismissInstalledRelease", () => update.dismissInstalledRelease());
}
