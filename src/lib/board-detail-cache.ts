interface BoardDetailCacheEntry<T> {
  promise: Promise<T>;
  timer: ReturnType<typeof setTimeout>;
}

/** Small LRU for board payloads. Each entry is actively released after its TTL. */
export class BoardDetailCache<T> {
  private readonly entries = new Map<string, BoardDetailCacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): Promise<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.promise;
  }

  set(key: string, promise: Promise<T>): void {
    this.delete(key);
    const entry: BoardDetailCacheEntry<T> = {
      promise,
      timer: setTimeout(() => this.deleteIfMatches(key, promise), this.ttlMs)
    };
    this.entries.set(key, entry);
    this.trim();
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    return this.entries.delete(key);
  }

  deleteIfMatches(key: string, promise: Promise<T>): boolean {
    const entry = this.entries.get(key);
    if (entry?.promise !== promise) return false;
    return this.delete(key);
  }

  clear(): void {
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.delete(oldest);
    }
  }
}
