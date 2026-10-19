import { describe, expect, it, vi } from "vitest";
import { Semaphore } from "../electron/providers/concurrency";

describe("provider concurrency semaphore", () => {
  it("removes an aborted waiter without submitting it or occupying the next free slot", async () => {
    const semaphore = new Semaphore(1);
    let finish!: () => void;
    const running = semaphore.run(() => new Promise<void>((resolve) => { finish = resolve; }));
    const abort = new AbortController();
    const cancelledProvider = vi.fn(async () => "unexpected");
    const cancelled = semaphore.run(cancelledProvider, { signal: abort.signal });
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    const nextProvider = vi.fn(async () => "next");
    const next = semaphore.run(nextProvider);
    abort.abort();
    await rejection;
    finish();
    await running;
    expect(await next).toBe("next");
    expect(cancelledProvider).not.toHaveBeenCalled();
    expect(nextProvider).toHaveBeenCalledOnce();
  });

  it("does not call a provider for an already aborted ticket", async () => {
    const semaphore = new Semaphore(3);
    const abort = new AbortController();
    abort.abort();
    const provider = vi.fn(async () => undefined);
    await expect(semaphore.run(provider, { signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(provider).not.toHaveBeenCalled();
  });
});
