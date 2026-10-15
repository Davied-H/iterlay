import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { createDevBrowserAssetResponse } from "./dev-browser-assets.js";
import { startDevBrowserServer } from "./dev-browser-server.js";
import { invokeRegisteredCommand, sendRegisteredMessage } from "./renderer-security.js";
import type { AssetStore } from "./storage/asset-store.js";

export async function startDevBrowserBridge(window: BrowserWindow, assets: AssetStore, configPath: string, origin: string) {
  const token = randomBytes(32).toString("base64url");
  const sender = window.webContents;
  const event = (): IpcMainInvokeEvent & IpcMainEvent => ({
    sender, senderFrame: sender.mainFrame,
    frameId: sender.mainFrame.routingId, processId: sender.mainFrame.processId,
    type: "frame", ports: [], returnValue: undefined,
    preventDefault() {}, defaultPrevented: false,
    reply: (channel: string, ...args: unknown[]) => sender.send(channel, ...args)
  });
  const server = await startDevBrowserServer({
    token, origin,
    invoke: (channel, args) => invokeRegisteredCommand(event(), channel, args),
    send: (channel, args) => sendRegisteredMessage(event(), channel, args),
    assetResponse: (request) => createDevBrowserAssetResponse(request, assets),
    requestQuit: () => app.quit()
  });
  // Keep a real, trusted WebContents for handlers that use native dialogs/sessions.
  // Its renderer has no React workspace; the browser is the only editor.
  const originalSend = sender.send.bind(sender);
  sender.send = (channel, ...args: unknown[]) => { server.publish(channel, ...args); originalSend(channel, ...args); };
  try {
    await mkdir(path.dirname(configPath), { recursive: true });
    const temporary = `${configPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ port: server.port, token, pid: process.pid }), { mode: 0o600 });
    await rename(temporary, configPath);
  } catch (error) { server.close(); throw error; }
  return {
    flush: server.flush,
    close: () => { sender.send = originalSend; server.close(); void rm(configPath, { force: true }); }
  };
}
