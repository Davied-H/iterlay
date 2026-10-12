interface CacheEntry {
  promise: Promise<string | undefined>;
  estimatedBytes: number;
}

export interface DataUrlLruCacheOptions {
  maxEntries: number;
  maxEstimatedBytes: number;
}

/** Bounded cache for full data URLs. Pending loads count toward the entry limit. */
export class DataUrlLruCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalEstimatedBytes = 0;

  constructor(private readonly options: DataUrlLruCacheOptions) {}

  getOrLoad(key: string, load: () => Promise<string | undefined>): Promise<string | undefined> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }

    const entry: CacheEntry = {
      estimatedBytes: 0,
      promise: Promise.resolve(undefined)
    };
    entry.promise = Promise.resolve()
      .then(load)
      .then((dataUrl) => {
        if (!dataUrl) {
          this.deleteEntry(key, entry);
          return undefined;
        }
        if (this.entries.get(key) === entry) {
          entry.estimatedBytes = dataUrl.length * 2;
          this.totalEstimatedBytes += entry.estimatedBytes;
          this.evictToLimits();
        }
        return dataUrl;
      })
      .catch(() => {
        this.deleteEntry(key, entry);
        return undefined;
      });
    this.entries.set(key, entry);
    this.evictToLimits();
    return entry.promise;
  }

  get size(): number {
    return this.entries.size;
  }

  get estimatedBytes(): number {
    return this.totalEstimatedBytes;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  private evictToLimits(): void {
    while (
      this.entries.size > this.options.maxEntries
      || this.totalEstimatedBytes > this.options.maxEstimatedBytes
    ) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
      if (!oldest) return;
      this.deleteEntry(oldest[0], oldest[1]);
    }
  }

  private deleteEntry(key: string, expected: CacheEntry): void {
    if (this.entries.get(key) !== expected) return;
    this.entries.delete(key);
    this.totalEstimatedBytes -= expected.estimatedBytes;
  }
}
