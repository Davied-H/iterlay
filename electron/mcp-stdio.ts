import { app, shell } from "electron";
import { buildToolContent, runMcpServer } from "./mcp-stdio-core.js";

/** Electron compatibility launcher for existing --mcp invocations. */
export async function runElectronMcpServer(): Promise<void> {
  await app.whenReady();
  await runMcpServer({
    version: app.getVersion(),
    userDataPath: app.getPath("userData"),
    openIterlay: async () => { await shell.openExternal("iterlay://boards"); }
  });
}

export { buildToolContent };
