import type { AssetLibraryItem, AssetLibraryPage } from "../../shared/types.js";

interface Snapshot { items: AssetLibraryItem[]; expiresAt: number }

/** Share catalog rebuilds, bound snapshots, and clone only the requested page. */
export class AssetCatalog {
  private version = 0;
  private cached: { items: AssetLibraryItem[]; expiresAt: number } | null = null;
  private pending: { version: number; promise: Promise<AssetLibraryItem[]> } | null = null;
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly byNode = new Map<string, AssetLibraryItem>();
  constructor(
    private readonly load: () => Promise<AssetLibraryItem[]>,
    private readonly decorate: (items: AssetLibraryItem[]) => Promise<AssetLibraryItem[]>,
    private readonly ttlMs = 30_000,
    private readonly snapshotTtlMs = 5 * 60_000,
    private readonly maxSnapshots = 8
  ) {}
  invalidate(): void { this.version++; this.cached = null; this.byNode.clear(); }
  async all(): Promise<AssetLibraryItem[]> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.items;
    if (this.pending?.version === this.version) return this.pending.promise;
    const version = this.version;
    const promise = this.load().then((items) => {
      if (this.version === version) {
        this.cached = { items, expiresAt: Date.now() + this.ttlMs };
        this.byNode.clear();
        for (const item of items) this.byNode.set(item.boardId + ":" + item.nodeId, item);
      }
      return items;
    });
    this.pending = { version, promise };
    try { return await promise; }
    finally { if (this.pending?.promise === promise) this.pending = null; }
  }
  async item(boardId: string, nodeId: string): Promise<AssetLibraryItem | null> {
    await this.all();
    const item = this.byNode.get(boardId + ":" + nodeId);
    return item ? (await this.decorate([item]))[0] ?? null : null;
  }
  async page(cursor?: string, requestedLimit = 40): Promise<AssetLibraryPage> {
    if (!Number.isFinite(requestedLimit)) throw new Error("素材分页数量无效。");
    const now = Date.now();
    for (const [id, snapshot] of this.snapshots) if (snapshot.expiresAt <= now) this.snapshots.delete(id);
    const limit = Math.max(1, Math.min(Math.trunc(requestedLimit), 100));
    let id: string, offset: number, snapshot: Snapshot | undefined;
    if (cursor) {
      const split = cursor.lastIndexOf(":");
      id = cursor.slice(0, split);
      offset = Number(cursor.slice(split + 1));
      snapshot = this.snapshots.get(id);
    } else {
      id = crypto.randomUUID();
      offset = 0;
      snapshot = { items: [...await this.all()], expiresAt: now + this.snapshotTtlMs };
      this.snapshots.set(id, snapshot);
      while (this.snapshots.size > this.maxSnapshots) {
        const first = this.snapshots.keys().next().value;
        if (!first) break;
        this.snapshots.delete(first);
      }
    }
    if (!snapshot || !Number.isSafeInteger(offset) || offset < 0) return { items: [], total: 0 };
    snapshot.expiresAt = Date.now() + this.snapshotTtlMs;
    const items = await this.decorate(snapshot.items.slice(offset, offset + limit));
    items.forEach((item, index) => { snapshot!.items[offset + index] = item; });
    const next = offset + items.length;
    if (next >= snapshot.items.length) this.snapshots.delete(id);
    return { items, total: snapshot.items.length, nextCursor: next < snapshot.items.length ? id + ":" + next : undefined };
  }
}
