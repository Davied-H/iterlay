import { describe, expect, it } from "vitest";
import { GenerationQueue } from "../src/lib/generation-queue";
import type { ActiveBoardGeneration } from "../src/lib/active-board-generation";
import { generationHarness } from "./helpers/generation-fixture";

describe("queued image task cancellation", () => {
  it("cancels before submission and settles local state without sending or charging a provider request", async () => {
    const queue = new GenerationQueue();
    ["a", "b", "c"].forEach((id) => queue.enqueue(id));
    const h = generationHarness(false, queue);
    const result = h.generate();
    const addTasks = h.setActiveBoardGenerations.mock.calls[0][0] as (current: ActiveBoardGeneration[]) => ActiveBoardGeneration[];
    const task = addTasks([])[0];
    expect(task.status).toBe("queued");
    expect(task.cancelQueued?.()).toBe(true);
    await expect(result).resolves.toEqual([]);
    queue.release("a");
    queue.release("b");
    queue.release("c");
    expect(queue.snapshot()).toEqual([]);
    expect(h.generateImage).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.setStatus).toHaveBeenLastCalledWith("已取消排队任务，尚未发送到 Provider。");
    const removeTasks = h.setActiveBoardGenerations.mock.calls.at(-1)![0] as (current: ActiveBoardGeneration[]) => ActiveBoardGeneration[];
    expect(removeTasks([task])).toEqual([]);
  });
});
