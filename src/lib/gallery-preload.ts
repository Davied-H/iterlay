import type { GenerationJob } from "@shared/types";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";

const PRELOAD_LIMIT = 18;
const PRELOAD_CONCURRENCY = 4;
const CACHE_LIMIT = 256;

const thumbnailCache = new Map<string, Promise<string | undefined>>();
const decodeCache = new Map<string, Promise<void>>();

function trimCache<K, V>(cache: Map<K, V>): void {
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as K | undefined;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

function localDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function collectGalleryPreloadPaths(jobs: GenerationJob[]): string[] {
  const ready = jobs
    .filter((job) => job.status === "succeeded" && job.outputImagePaths.length > 0)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const newestDay = ready[0] ? localDayKey(ready[0].createdAt) : null;
  const firstDayJobs = newestDay
    ? ready.filter((job) => localDayKey(job.createdAt) === newestDay)
    : [];
  return Array.from(new Set([
    ...firstDayJobs.map((job) => job.outputImagePaths[0]),
    ...(firstDayJobs[0]?.outputImagePaths ?? [])
  ].filter(Boolean))).slice(0, PRELOAD_LIMIT);
}

export function loadGalleryThumbnail(path: string): Promise<string | undefined> {
  const cached = thumbnailCache.get(path);
  if (cached) return cached;
  let request: Promise<string | undefined>;
  try {
    request = hasImageWorkbenchApi()
      ? getImageWorkbenchApi().getAssetThumbnail(path, 960)
      : Promise.resolve(undefined);
  } catch {
    request = Promise.resolve(undefined);
  }
  const promise = request.then(
    (url) => {
      if (!url && thumbnailCache.get(path) === promise) thumbnailCache.delete(path);
      return url;
    },
    () => {
      if (thumbnailCache.get(path) === promise) thumbnailCache.delete(path);
      return undefined;
    }
  );
  thumbnailCache.set(path, promise);
  trimCache(thumbnailCache);
  return promise;
}

function decodeImage(url: string): Promise<void> {
  const cached = decodeCache.get(url);
  if (cached) return cached;
  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (typeof image.decode === "function") void image.decode().then(resolve, () => undefined);
  });
  decodeCache.set(url, promise);
  trimCache(decodeCache);
  return promise;
}

export async function preloadGalleryThumbnails(paths: string[]): Promise<void> {
  const queue = Array.from(new Set(paths.filter(Boolean))).slice(0, PRELOAD_LIMIT);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const path = queue[cursor];
      cursor += 1;
      const url = await loadGalleryThumbnail(path);
      if (url) await decodeImage(url);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(PRELOAD_CONCURRENCY, queue.length) },
    () => worker()
  ));
}
