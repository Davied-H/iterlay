import { contextBridge, ipcRenderer } from "electron";
import { createWorkbenchClient } from "../../shared/workbench-client.js";

const api = createWorkbenchClient({
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      listener(...args as Parameters<typeof listener>);
    };
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  }
});

contextBridge.exposeInMainWorld("imageWorkbench", api);

export type { ImageWorkbenchApi } from "../../shared/workbench-client.js";
