import { BrowserWindow, ipcMain } from "electron";
import {
  ITERLAY_DEEP_LINK_CHANNEL,
  ITERLAY_DEEP_LINK_READY_CHANNEL,
  parseIterlayDeepLink
} from "../shared/deep-link.js";

const pendingUrls: string[] = [];
const readyWebContents = new Set<number>();
const MAX_PENDING_URLS = 32;
let ipcRegistered = false;

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow()
    ?? BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
}

export function registerDeepLinkIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle(ITERLAY_DEEP_LINK_READY_CHANNEL, (event) => {
    readyWebContents.add(event.sender.id);
    event.sender.once("destroyed", () => readyWebContents.delete(event.sender.id));
    return pendingUrls.splice(0);
  });
}

export function dispatchDeepLink(rawUrl: string): boolean {
  const parsed = parseIterlayDeepLink(rawUrl);
  if (!parsed.ok) {
    console.warn(`[deep-link] ignored: ${parsed.reason}`);
    return false;
  }

  const window = targetWindow();
  if (!window || !readyWebContents.has(window.webContents.id)) {
    if (pendingUrls.at(-1) !== parsed.canonicalUrl) pendingUrls.push(parsed.canonicalUrl);
    if (pendingUrls.length > MAX_PENDING_URLS) pendingUrls.splice(0, pendingUrls.length - MAX_PENDING_URLS);
  } else {
    window.webContents.send(ITERLAY_DEEP_LINK_CHANNEL, parsed.canonicalUrl);
  }

  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
  return true;
}
