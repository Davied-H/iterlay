import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { runMcpServer } from "./mcp-stdio-core.js";

const userDataPath = process.env.ITERLAY_USER_DATA_PATH || defaultUserDataPath();

void runMcpServer({
  version: process.env.ITERLAY_VERSION || "unknown",
  userDataPath,
  openIterlay
});

async function openIterlay(): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", "iterlay://boards"] : ["iterlay://boards"];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function defaultUserDataPath(): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Iterlay");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "Iterlay");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Iterlay");
}
