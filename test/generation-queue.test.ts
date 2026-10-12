import { describe, expect, it } from "vitest";
import { GenerationQueue } from "@/lib/generation-queue";

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
});
