import { ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaToolsManager } from "./media-tools-manager.js";

interface MediaToolsRendererOptions {
  appFile: string;
  developmentUrl?: string;
}

/** Protect these handlers independently of any application-wide IPC guards. */
export function registerMediaToolsIpc(
  manager: Pick<MediaToolsManager, "getState" | "install" | "cancel">,
  options: MediaToolsRendererOptions
): () => void {
  const guard = (handler: () => unknown) => (event: IpcMainInvokeEvent): unknown => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !isTrustedUrl(frame.url, options)) {
      throw new Error("不允许非应用页面管理视频组件。");
    }
    return handler();
  };
  ipcMain.handle("mediaTools:getState", guard(() => manager.getState()));
  ipcMain.handle("mediaTools:install", guard(() => manager.install()));
  ipcMain.handle("mediaTools:cancel", guard(() => { manager.cancel(); }));
  return () => {
    for (const channel of ["mediaTools:getState", "mediaTools:install", "mediaTools:cancel"]) ipcMain.removeHandler(channel);
  };
}

function isTrustedUrl(value: string, options: MediaToolsRendererOptions): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "file:") return path.resolve(fileURLToPath(url)) === path.resolve(options.appFile);
    if (!options.developmentUrl) return false;
    const expected = new URL(options.developmentUrl);
    return (expected.protocol === "http:" || expected.protocol === "https:")
      && url.origin === expected.origin && url.pathname === expected.pathname;
  } catch { return false; }
}
