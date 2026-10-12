import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLatestFrameTask } from "@/components/canvas/latest-frame-task";

describe("createLatestFrameTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16) as unknown as number
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("commits only the latest value once per animation frame", () => {
    const run = vi.fn();
    const task = createLatestFrameTask(run);
    task.schedule(1);
    task.schedule(2);
    task.schedule(3);

    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(3);
  });

  it("flushes the final pointer value and supports cleanup", () => {
    const run = vi.fn();
    const task = createLatestFrameTask(run);
    task.schedule("stale");
    task.flush("final");
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("final");

    task.schedule("ignored");
    task.cancel();
    vi.advanceTimersByTime(20);
    expect(run).toHaveBeenCalledOnce();
  });
});
