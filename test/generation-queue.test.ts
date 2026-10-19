import { describe, expect, it } from "vitest";
import { GenerationQueue, GenerationQueueCancelledError } from "@/lib/generation-queue";

describe("GenerationQueue", () => {
  it("runs at most three tasks and starts queued tasks in FIFO order", async () => {
    const queue = new GenerationQueue(3);
    const started: string[] = [];
    const tickets = ["a", "b", "c", "d", "e"].map((id) => {
      const ticket = queue.enqueue(id);
      void ticket.ready.then(() => started.push(id));
      return { id, ...ticket };
    });

    await Promise.resolve();
    expect(tickets.map((ticket) => ticket.queued)).toEqual([false, false, false, true, true]);
    expect(started).toEqual(["a", "b", "c"]);
    expect(queue.snapshot()).toEqual([
      { id: "a", status: "running" },
      { id: "b", status: "running" },
      { id: "c", status: "running" },
      { id: "d", status: "queued" },
      { id: "e", status: "queued" }
    ]);

    queue.release("b");
    await Promise.resolve();
    expect(started).toEqual(["a", "b", "c", "d"]);

    queue.release("a");
    await Promise.resolve();
    expect(started).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ignores duplicate releases", () => {
    const queue = new GenerationQueue(1);
    queue.enqueue("a");
    queue.release("a");
    queue.release("a");
    expect(queue.snapshot()).toEqual([]);
  });

  it("rejects a cancelled queued ticket, never starts it, and keeps the next FIFO task", async () => {
    const queue = new GenerationQueue(1);
    queue.enqueue("running");
    const cancelled = queue.enqueue("cancelled");
    const next = queue.enqueue("next");
    expect(cancelled.cancel()).toBe(true);
    await expect(cancelled.ready).rejects.toBeInstanceOf(GenerationQueueCancelledError);
    expect(cancelled.cancel()).toBe(false);
    queue.release("running");
    await expect(next.ready).resolves.toBeUndefined();
    expect(queue.snapshot()).toEqual([{ id: "next", status: "running" }]);
  });

  it("does not claim cancellation once a provider slot has been acquired", async () => {
    const queue = new GenerationQueue(1);
    const running = queue.enqueue("running");
    const queued = queue.enqueue("queued");
    expect(running.cancel()).toBe(false);
    queue.release("running");
    expect(queued.cancel()).toBe(false);
    await queued.ready;
    expect(queue.snapshot()).toEqual([{ id: "queued", status: "running" }]);
  });

  it("settles ready when a pending task is directly released", async () => {
    const queue = new GenerationQueue(1);
    queue.enqueue("running");
    const pending = queue.enqueue("pending");
    queue.release("pending");
    await expect(pending.ready).rejects.toBeInstanceOf(GenerationQueueCancelledError);
    queue.release("running");
    expect(queue.snapshot()).toEqual([]);
  });
});
