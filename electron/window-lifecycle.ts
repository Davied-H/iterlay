import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { WindowSaveRequests } from "./window-save-requests.js";
import { WINDOW_RENDERER_READY, WINDOW_SAVE_REQUEST, WINDOW_SAVE_RESULT, type WindowSaveResult } from "../shared/window-lifecycle.js";

let saveWindow: ((window: BrowserWindow) => Promise<void>) | undefined;
export function flushWindow(window: BrowserWindow): Promise<void> {
  return window.isDestroyed() ? Promise.resolve() : saveWindow?.(window) ?? Promise.resolve();
}

export { WindowSaveRequests } from "./window-save-requests.js";

/** A close acknowledgement is consumed once; failed writes never silently close. */
export function installWindowLifecycle(
  flushLogs: () => Promise<void>,
  flushExternal?: (window: BrowserWindow) => Promise<void>
) {
  const requests = new WindowSaveRequests((senderId, requestId) => {
    const window = BrowserWindow.getAllWindows().find((w) => w.webContents.id === senderId);
    if (!window || window.isDestroyed()) throw new Error("窗口已关闭。");
    window.webContents.send(WINDOW_SAVE_REQUEST, { requestId });
  });
  const requestSave = (window: BrowserWindow) => flushExternal?.(window) ?? requests.request(window.webContents.id);
  saveWindow = requestSave;
  const allowed = new Set<number>();
  const closing = new Set<number>();
  let quitAllowed = false;
  let preparingQuit = false;
  const isMainFrame = (event: Electron.IpcMainEvent) => event.senderFrame === event.sender.mainFrame;
  ipcMain.on(WINDOW_RENDERER_READY, (event) => {
    if (isMainFrame(event)) requests.markReady(event.sender.id);
  });
  ipcMain.on(WINDOW_SAVE_RESULT, (event, result: WindowSaveResult) => {
    if (isMainFrame(event)) requests.accept(event.sender.id, result);
  });
  const prepare = async (window: BrowserWindow): Promise<boolean> => {
    while (!window.isDestroyed()) {
      try { await requestSave(window); return true; }
      catch (error) {
        if (window.isDestroyed()) return true;
        if (flushExternal) {
          console.error("网页工作区保存失败，已取消关闭。请在网页保存后重试。", error);
          return false;
        }
        const result = await dialog.showMessageBox(window, {
          type: "warning", title: "画板尚未保存",
          message: "关闭前未能保存所有修改。",
          detail: error instanceof Error ? error.message : String(error),
          buttons: ["重试保存", "继续编辑", "不保存并关闭"], defaultId: 0, cancelId: 1
        });
        if (result.response === 1) return false;
        if (result.response === 2) return true;
      }
    }
    return true;
  };
  app.on("before-quit", (event) => {
    if (quitAllowed) return;
    event.preventDefault();
    if (preparingQuit) return;
    preparingQuit = true;
    void (async () => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!await prepare(window)) { preparingQuit = false; return; }
      }
      await flushLogs();
      quitAllowed = true;
      app.quit();
    })().catch((error) => { preparingQuit = false; console.error("退出准备失败", error); });
  });
  return (window: BrowserWindow): void => {
    const id = window.webContents.id;
    window.on("close", (event) => {
      if (quitAllowed || allowed.delete(id)) return;
      event.preventDefault();
      if (closing.has(id)) return;
      closing.add(id);
      void prepare(window).then((ok) => {
        if (ok && !window.isDestroyed()) { allowed.add(id); window.close(); }
      }).finally(() => closing.delete(id));
    });
    window.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) requests.forget(id);
    });
    window.on("closed", () => requests.forget(id));
  };
}
