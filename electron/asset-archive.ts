import path from "node:path";
import { buildArchiveInWorker } from "./archive-worker-client.js";

export interface AssetArchiveItem {
  sourcePath: string;
  bytes: Uint8Array;
}

export interface NamedArchiveItem {
  name: string;
  bytes: Uint8Array;
}

/** Build a plain ZIP and preserve source file names without allowing duplicate entries. */
export function buildAssetArchive(items: AssetArchiveItem[]): Promise<Buffer> {
  const usedNames = new Set<string>();
  const entries: Array<[string, Uint8Array]> = items.map((item) => [
    uniqueName(path.basename(item.sourcePath) || "image.png", usedNames),
    item.bytes
  ]);
  return buildArchiveInWorker(entries);
}

/** Build a ZIP whose callers have already supplied safe relative entry paths. */
export function buildNamedArchive(items: NamedArchiveItem[]): Promise<Buffer> {
  return buildArchiveInWorker(items.map((item) => [item.name, item.bytes]));
}

function uniqueName(baseName: string, used: Set<string>): string {
  let name = baseName;
  let index = 1;
  while (used.has(name)) {
    const extension = path.extname(baseName);
    name = `${path.basename(baseName, extension)}-${index}${extension}`;
    index += 1;
  }
  used.add(name);
  return name;
}
