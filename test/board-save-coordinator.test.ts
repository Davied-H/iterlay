import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardSaveCoordinator } from "../src/lib/board-save-coordinator";
afterEach(() => vi.useRealTimers());
describe("board persistence lifecycle", () => {
  it("flushes a debounced change before closing", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const coordinator = new BoardSaveCoordinator(save);
    coordinator.schedule();
    await coordinator.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(coordinator.dirty).toBe(false);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledOnce();
  });
  it("keeps failed changes dirty and retries the latest snapshot", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const coordinator = new BoardSaveCoordinator(save);
    await expect(coordinator.saveNow()).rejects.toThrow("disk full");
    expect(coordinator.dirty).toBe(true);
    expect(coordinator.state).toBe("failed");
    await coordinator.flush();
    expect(coordinator.state).toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("waits for changes queued during an in-flight save", async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
    const coordinator = new BoardSaveCoordinator(save);
    const closing = coordinator.saveNow();
    coordinator.schedule();
    const secondClosing = coordinator.flush();
    finish();
    await Promise.all([closing, secondClosing]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(coordinator.dirty).toBe(false);
  });
  it("discards an obsolete snapshot after an external mutation", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const coordinator = new BoardSaveCoordinator(save);
    coordinator.schedule();
    coordinator.discardPending();
    await coordinator.flush();
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
  });
});
