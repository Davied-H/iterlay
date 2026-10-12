import { stat } from "node:fs/promises";
import type { AssetLibraryItem } from "../shared/types.js";

interface AssetFileTimes {
  birthtimeMs: number;
  mtimeMs: number;
}

export function resolveAssetFileCreatedAt(info: AssetFileTimes, fallback: string): string {
  const timestamp = info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : fallback;
}

export async function getAssetFileCreatedAt(filePath: string, fallback: string): Promise<string> {
  try {
    return resolveAssetFileCreatedAt(await stat(filePath), fallback);
  } catch {
    return fallback;
  }
}

/** 素材类型不参与排序；瀑布流始终只按实际资产创建时间从新到旧排列。 */
export function sortAssetsNewestFirst(items: AssetLibraryItem[]): AssetLibraryItem[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
