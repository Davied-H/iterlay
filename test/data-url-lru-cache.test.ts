import { describe, expect, it, vi } from "vitest";
import { DataUrlLruCache } from "../src/lib/data-url-lru-cache";

describe("DataUrlLruCache", () => {
  it("deduplicates pending loads and evicts the least recently used entry", async () => {
    const cache = new DataUrlLruCache({ maxEntries: 2, maxEstimatedBytes: 1_000 });
    const load = vi.fn(async () => "data:image/png;base64,aaaa");

    expect(cache.getOrLoad("a", load)).toBe(cache.getOrLoad("a", load));
    await cache.getOrLoad("b", load);
    await cache.getOrLoad("a", load);
    await cache.getOrLoad("c", load);

    expect(load).toHaveBeenCalledTimes(3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("reclaims estimated bytes when full data URLs exceed the byte budget", async () => {
    const cache = new DataUrlLruCache({ maxEntries: 10, maxEstimatedBytes: 60 });
    await cache.getOrLoad("a", async () => "data:image/png;base64,aaaa");
    await cache.getOrLoad("b", async () => "data:image/png;base64,bbbb");

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.estimatedBytes).toBe("data:image/png;base64,bbbb".length * 2);
  });

  it("does not retain failed or empty loads", async () => {
    const cache = new DataUrlLruCache({ maxEntries: 2, maxEstimatedBytes: 1_000 });
    await expect(cache.getOrLoad("failed", async () => { throw new Error("failed"); })).resolves.toBeUndefined();
    await expect(cache.getOrLoad("empty", async () => undefined)).resolves.toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
