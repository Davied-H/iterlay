import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { ImageWorkbenchApi } from "../../shared/workbench-client.js";
import { WORKBENCH_COMMANDS } from "../../shared/contracts/workbench-commands.js";
import { invokeRegisteredCommand } from "../renderer-security.js";

export type WorkspaceApi = Pick<ImageWorkbenchApi, keyof typeof WORKBENCH_COMMANDS>;

/** Capture trusted main-process context once; long tasks outlive their renderer. */
export function createMainWorkbenchApi(window: BrowserWindow): WorkspaceApi {
  const sender = window.webContents;
  const event = { sender, senderFrame: sender.mainFrame } as IpcMainInvokeEvent;
  return Object.fromEntries(Object.entries(WORKBENCH_COMMANDS).map(([name, channel]) => [
    name, (...args: unknown[]) => invokeRegisteredCommand(event, channel, args)
  ])) as WorkspaceApi;
}
