import { describe, expect, it, vi } from "vitest";
import type { AssetLibraryItem } from "../shared/types";
import { AssetCatalog } from "../electron/application/asset-catalog";
const asset = (id: string): AssetLibraryItem => ({ imagePath: id, dataUrl: id, thumbnailUrl: id, boardId: "board", boardName: "Board", nodeId: id, jobId: id, prompt: "", createdAt: "", source: "generated", favorite: false, tags: [] });
describe("asset catalog scale and invalidation", () => {
  it("coalesces concurrent first pages and decorates only the page", async () => {
    const items = Array.from({ length: 1000 }, (_, i) => asset(String(i)));
    const load = vi.fn(async () => items);
    const decorate = vi.fn(async (page: AssetLibraryItem[]) => page);
    const catalog = new AssetCatalog(load, decorate);
    await Promise.all([catalog.page(), catalog.page(), catalog.item("board", "500")]);
    expect(load).toHaveBeenCalledOnce();
    expect(decorate.mock.calls.map(([page]) => page.length).sort((a,b) => a-b)).toEqual([1, 40, 40]);
  });
  it("preserves a pagination snapshot while new changes invalidate the live index", async () => {
    const load = vi.fn().mockResolvedValueOnce([asset("1"), asset("2")]).mockResolvedValue([asset("new")]);
    const catalog = new AssetCatalog(load, async (items) => items);
    const first = await catalog.page(undefined, 1);
    catalog.invalidate();
    expect((await catalog.page(first.nextCursor, 1)).items[0].nodeId).toBe("2");
    expect((await catalog.page()).items[0].nodeId).toBe("new");
  });
  it("does not let a stale in-flight rebuild overwrite a newer invalidation", async () => {
    let finish!: (items: AssetLibraryItem[]) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue([asset("new")]);
    const catalog = new AssetCatalog(load, async (items) => items);
    const old = catalog.all();
    catalog.invalidate();
    await catalog.all();
    finish([asset("old")]);
    await old;
    expect((await catalog.all())[0].nodeId).toBe("new");
  });
});
