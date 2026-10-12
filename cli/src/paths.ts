import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpCommand } from "../../electron/mcp-integration.js";

export interface ResolvedIterlayApp {
  root: string;
  commandPath: string;
  scriptPath: string;
}

/** Candidate Iterlay install roots for the current platform, most likely first. */
export function candidateIterlayAppRoots(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications/Iterlay.app",
      path.join(os.homedir(), "Applications", "Iterlay.app")
    ];
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const roots = localAppData ? [path.join(localAppData, "Programs", "Iterlay")] : [];
    roots.push(path.join("C:", "Program Files", "Iterlay"));
    return roots;
  }
  return ["/opt/Iterlay", "/usr/lib/iterlay"];
}

export async function resolveIterlayApp(explicitRoot?: string): Promise<ResolvedIterlayApp | null> {
  const roots = explicitRoot ? [explicitRoot] : candidateIterlayAppRoots();
  for (const root of roots) {
    const resolved = appLayout(root);
    if (await fileExists(resolved.commandPath)) return resolved;
  }
  return null;
}

function appLayout(root: string): ResolvedIterlayApp {
  if (process.platform === "darwin") {
    return {
      root,
      commandPath: path.join(root, "Contents", "MacOS", "Iterlay"),
      scriptPath: path.join(root, "Contents", "Resources", "app.asar", "dist-electron", "electron", "mcp-stdio-node.js")
    };
  }
  if (process.platform === "win32") {
    return {
      root,
      commandPath: path.join(root, "Iterlay.exe"),
      scriptPath: path.join(root, "resources", "app.asar", "dist-electron", "electron", "mcp-stdio-node.js")
    };
  }
  return {
    root,
    commandPath: path.join(root, "Iterlay"),
    scriptPath: path.join(root, "resources", "app.asar", "dist-electron", "electron", "mcp-stdio-node.js")
  };
}

/** Mirrors the packaged Iterlay app's userData directory (app name: Iterlay). */
export function defaultUserDataPath(): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Iterlay");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "Iterlay");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Iterlay");
}

export function buildMcpCommand(app: ResolvedIterlayApp, userDataPath: string, version: string): McpCommand {
  return {
    command: app.commandPath,
    args: [app.scriptPath],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      ITERLAY_USER_DATA_PATH: userDataPath,
      ITERLAY_VERSION: version
    }
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
