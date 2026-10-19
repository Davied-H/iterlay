export class Semaphore {
  private active = 0;
  private readonly waiting: Array<{ resolve: () => void; reject: (error: Error) => void; cleanup: () => void }> = [];

  constructor(private readonly limit: number) {}

  run<T>(operation: () => Promise<T>, options?: { signal?: AbortSignal }): Promise<T> {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("排队任务已取消。", "AbortError"));
    if (this.active < this.limit) {
      this.active += 1;
      return this.execute(operation, signal);
    }
    return new Promise<void>((resolve, reject) => {
      const entry = { resolve, reject, cleanup: () => signal?.removeEventListener("abort", onAbort) };
      const onAbort = () => {
        const index = this.waiting.indexOf(entry);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        entry.cleanup();
        reject(signal?.reason ?? new DOMException("排队任务已取消。", "AbortError"));
      };
      this.waiting.push(entry);
      signal?.addEventListener("abort", onAbort, { once: true });
    }).then(() => this.execute(operation, signal));
  }

  private async execute<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      if (signal?.aborted) throw signal.reason ?? new DOMException("排队任务已取消。", "AbortError");
      return await operation();
    } finally {
      this.release();
    }
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) { next.cleanup(); next.resolve(); }
    else this.active -= 1;
  }
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await mapper(values[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}
