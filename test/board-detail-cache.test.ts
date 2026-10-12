import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDetailCache } from "../src/lib/board-detail-cache";

afterEach(() => {
  vi.useRealTimers();
});

describe("BoardDetailCache", () => {
  it("deduplicates reads and evicts the least recently used board", () => {
    const cache = new BoardDetailCache<number>(2, 15_000);
    const a = Promise.resolve(1);
    const b = Promise.resolve(2);
    const c = Promise.resolve(3);
    cache.set("a", a);
    cache.set("b", b);
    expect(cache.get("a")).toBe(a);
    cache.set("c", c);

    expect(cache.get("a")).toBe(a);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(c);
    cache.clear();
  });

  it("actively releases expired board payloads", () => {
    vi.useFakeTimers();
    const cache = new BoardDetailCache<number>(4, 15_000);
    cache.set("board", Promise.resolve(1));

    vi.advanceTimersByTime(15_000);

    expect(cache.size).toBe(0);
  });

  it("does not let an old rejected request delete its replacement", () => {
    const cache = new BoardDetailCache<number>(4, 15_000);
    const oldRequest = Promise.resolve(1);
    const replacement = Promise.resolve(2);
    cache.set("board", oldRequest);
    cache.set("board", replacement);

    expect(cache.deleteIfMatches("board", oldRequest)).toBe(false);
    expect(cache.get("board")).toBe(replacement);
    cache.clear();
  });
});
