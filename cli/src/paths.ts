import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
export function defaultUserDataPath(): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Iterlay");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "Iterlay");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Iterlay");
}
export function candidateIterlayAppRoots(): string[] {
  if (process.platform === "darwin") return ["/Applications/Iterlay.app", path.join(os.homedir(), "Applications/Iterlay.app")];
  if (process.platform === "win32") return [path.join(process.env.LOCALAPPDATA || os.homedir(), "Programs/Iterlay"), "C:\\Program Files\\Iterlay"];
  return ["/opt/Iterlay", "/usr/lib/iterlay"];
}
export async function resolveIterlayApp(explicitRoot?: string): Promise<{ root: string; commandPath: string } | null> {
  for (const root of explicitRoot ? [explicitRoot] : candidateIterlayAppRoots()) {
    const commandPath = process.platform === "darwin" ? path.join(root, "Contents/MacOS/Iterlay") : path.join(root, process.platform === "win32" ? "Iterlay.exe" : "Iterlay");
    try { await access(commandPath); return { root, commandPath }; } catch { /* Try next location. */ }
  }
  return null;
}
