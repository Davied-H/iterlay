/** Runs async work with a fixed upper bound on concurrent tasks. */
export async function runTaskPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const workerCount = Math.min(items.length, Math.max(1, Math.trunc(concurrency)));
  let nextIndex = 0;
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }));
}

export async function mapTaskPool<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  await runTaskPool(items.map((item, index) => ({ item, index })), concurrency, async ({ item, index }) => {
    output[index] = await worker(item, index);
  });
  return output;
}
