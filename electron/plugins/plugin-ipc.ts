import { app, ipcMain } from "electron";
import path from "node:path";
import { PluginStore } from "./plugin-store.js";
import { startPluginServer } from "./plugin-server.js";

export function registerPluginIpc(): () => void {
  const store = new PluginStore(path.join(app.getPath("userData"), "plugins"), app.isPackaged ? path.join(process.resourcesPath, "plugins") : path.join(app.getAppPath(), "resources/plugins"));
  const server = startPluginServer(store);
  const handlers: Record<string, (...args: never[]) => unknown> = {
    "plugins:list": () => store.list(),
    "plugins:catalog": async () => (await store.catalog()).map(p => p.manifest),
    "plugins:get": (id: string) => store.get(id),
    "plugins:frameUrl": (id: string) => server.url(id),
    "plugins:inspect": (bytes: Uint8Array) => store.inspect(bytes).manifest,
    "plugins:install": (bytes: Uint8Array) => store.install(bytes),
    "plugins:installCatalog": (id: string) => store.installCatalog(id),
    "plugins:setEnabled": (id: string, enabled: boolean) => { if (typeof enabled !== "boolean") throw new Error("启用状态无效。"); return store.setEnabled(id, enabled); },
    "plugins:uninstall": (id: string) => store.uninstall(id),
    "plugins:readState": (id: string, scope: string) => store.readState(id, scope),
    "plugins:writeState": (id: string, scope: string, value: unknown) => store.writeState(id, scope, value),
    "plugins:authorize": (id: string, permission: string) => store.authorize(id, permission)
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, (_event, ...args) => handler(...args as never[]));
  return () => { server.close(); for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}
