import { access, cp, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const LEGACY_APP_NAMES = ["ImageRelay Studio", "image-relay-studio"] as const;

function isWithin(root: string, candidate: string): string | null {
  if (!path.isAbsolute(candidate)) return null;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "") return "";
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

export function rewriteLegacyWorkspacePaths(
  value: unknown,
  legacyRoots: readonly string[],
  dataDir: string
): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    for (const root of legacyRoots) {
      const relative = isWithin(root, value);
      if (relative !== null) {
        return { value: relative ? path.join(dataDir, relative) : dataDir, changed: true };
      }
    }
    return { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const rewritten = rewriteLegacyWorkspacePaths(item, legacyRoots, dataDir);
      changed ||= rewritten.changed;
      return rewritten.value;
    });
    return { value: changed ? next : value, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const rewritten = rewriteLegacyWorkspacePaths(item, legacyRoots, dataDir);
      changed ||= rewritten.changed;
      next[key] = rewritten.value;
    }
    return { value: changed ? next : value, changed };
  }
  return { value, changed: false };
}

async function rewriteJsonFiles(
  directory: string,
  legacyRoots: readonly string[],
  dataDir: string
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteJsonFiles(filePath, legacyRoots, dataDir);
      return;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") return;

    const source = await readFile(filePath, "utf8");
    if (!LEGACY_APP_NAMES.some((name) => source.includes(name))) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return;
    }
    const rewritten = rewriteLegacyWorkspacePaths(parsed, legacyRoots, dataDir);
    if (!rewritten.changed) return;
    const temporaryPath = `${filePath}.migration-${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(rewritten.value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  }));
}

export async function migrateLegacyWorkspace(dataDir: string, appData: string): Promise<void> {
  const legacyRoots = LEGACY_APP_NAMES.map((name) => path.join(appData, name, "workspace"));
  let exists = true;
  try {
    await access(dataDir);
  } catch {
    exists = false;
  }

  if (!exists) {
    for (const legacyWorkspace of legacyRoots) {
      try {
        await cp(legacyWorkspace, dataDir, { recursive: true, errorOnExist: false });
        exists = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  if (exists) await rewriteJsonFiles(dataDir, legacyRoots, dataDir);
}
