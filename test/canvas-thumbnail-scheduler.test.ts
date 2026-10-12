import { describe, expect, it, vi } from "vitest";
import { CanvasThumbnailScheduler } from "@/components/canvas/canvas-thumbnail-scheduler";

describe("canvas thumbnail scheduler", () => {
  it("deduplicates requests for the same thumbnail", async () => {
    const load = vi.fn(async (path: string, size: number) => `${path}-${size}`);
    const scheduler = new CanvasThumbnailScheduler(load);

    const first = scheduler.request("image-a", 480);
    const second = scheduler.request("image-a", 480);

    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([
      "image-a-480",
      "image-a-480"
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("cancels stale queued work and prioritizes visible thumbnails", async () => {
    const resolvers: Array<(url: string) => void> = [];
    const load = vi.fn((path: string) => new Promise<string>((resolve) => {
      resolvers.push((url) => resolve(`${path}-${url}`));
    }));
    const scheduler = new CanvasThumbnailScheduler(load, { concurrency: 1 });

    const active = scheduler.request("active", 192);
    const stale = scheduler.request("stale", 192);
    const visible = scheduler.request("visible", 480, "high");
    stale.cancel();

    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    resolvers[0]("done");
    await active.promise;
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[1]?.[0]).toBe("visible");
    resolvers[1]("done");

    await expect(visible.promise).resolves.toBe("visible-done");
    await expect(stale.promise).resolves.toBeUndefined();
  });

  it("evicts the least recently used cached URL", async () => {
    const scheduler = new CanvasThumbnailScheduler(
      async (path, size) => `${path}-${size}`,
      { cacheLimit: 2 }
    );

    await scheduler.request("a", 192).promise;
    await scheduler.request("b", 192).promise;
    expect(scheduler.peek("a", 192)).toBe("a-192");
    await scheduler.request("c", 192).promise;

    expect(scheduler.peek("a", 192)).toBe("a-192");
    expect(scheduler.peek("b", 192)).toBeUndefined();
    expect(scheduler.peek("c", 192)).toBe("c-192");
  });
});
