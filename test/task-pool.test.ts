import { describe, expect, it } from "vitest";
import { runTaskPool } from "../electron/task-pool.js";

describe("runTaskPool", () => {
  it("processes every task without exceeding the concurrency limit", async () => {
    let active = 0;
    let maximumActive = 0;
    const completed: number[] = [];

    await runTaskPool([1, 2, 3, 4, 5, 6], 3, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      completed.push(item);
      active -= 1;
    });

    expect(maximumActive).toBe(3);
    expect(completed.sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
