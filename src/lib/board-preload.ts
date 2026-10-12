import { isBoardImageNode, type BoardDetail } from "@shared/types";

const PRELOAD_CONCURRENCY = 3;
const CACHE_ENTRY_LIMIT = 96;
const CACHE_ESTIMATED_BYTE_LIMIT = 64 * 1024 * 1024;
const MIN_DECODED_IMAGE_ESTIMATE = 4 * 1024 * 1024;

interface DecodeCacheEntry {
  promise: Promise<void>;
  estimatedBytes: number;
}

const decodeCache = new Map<string, DecodeCacheEntry>();
let decodeCacheEstimatedBytes = 0;

export interface BoardPreloadOptions {
  shouldContinue?: () => boolean;
  signal?: AbortSignal;
  maxImages?: number;
}

function trimCache(): void {
  while (
    decodeCache.size > CACHE_ENTRY_LIMIT
    || decodeCacheEstimatedBytes > CACHE_ESTIMATED_BYTE_LIMIT
  ) {
    const oldest = decodeCache.entries().next().value as [string, DecodeCacheEntry] | undefined;
    if (!oldest) return;
    decodeCache.delete(oldest[0]);
    decodeCacheEstimatedBytes -= oldest[1].estimatedBytes;
  }
}

function collectBoardImageResources(
  detail: Pick<BoardDetail, "nodes" | "images">
): Array<{ key: string; url: string }> {
  const paths = detail.nodes.filter(isBoardImageNode).flatMap((node) => [
    node.imagePath,
    ...(node.versions ?? []).map((version) => version.imagePath)
  ]);
  const uniquePaths = Array.from(new Set(paths));
  return uniquePaths.flatMap((path) => {
    const url = detail.images[path];
    return url ? [{ key: path, url }] : [];
  });
}

export function collectBoardImageUrls(detail: Pick<BoardDetail, "nodes" | "images">): string[] {
  return Array.from(new Set(collectBoardImageResources(detail).map(({ url }) => url)));
}

function decodeImage(key: string, url: string): Promise<void> {
  const cached = decodeCache.get(key);
  if (cached) {
    decodeCache.delete(key);
    decodeCache.set(key, cached);
    return cached.promise;
  }

  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    image.decoding = "async";
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
    if (typeof image.decode === "function") void image.decode().then(finish, () => undefined);
  });
  const entry = {
    promise,
    estimatedBytes: Math.max(MIN_DECODED_IMAGE_ESTIMATE, url.length * 2)
  };
  decodeCache.set(key, entry);
  decodeCacheEstimatedBytes += entry.estimatedBytes;
  trimCache();
  return promise;
}

export async function preloadBoardImages(
  detail: Pick<BoardDetail, "nodes" | "images">,
  options: BoardPreloadOptions = {}
): Promise<void> {
  const resources = collectBoardImageResources(detail);
  const queue = options.maxImages === undefined
    ? resources
    : resources.slice(0, Math.max(0, options.maxImages));
  let cursor = 0;
  const canContinue = (): boolean => (
    !options.signal?.aborted && (options.shouldContinue?.() ?? true)
  );

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      if (!canContinue()) return;
      const resource = queue[cursor];
      cursor += 1;
      await decodeImage(resource.key, resource.url);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(PRELOAD_CONCURRENCY, queue.length) },
    () => worker()
  ));
}
