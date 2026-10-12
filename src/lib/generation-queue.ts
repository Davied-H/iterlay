export type GenerationQueueStatus = "queued" | "running";
export const MAX_CONCURRENT_GENERATIONS = 3;

export interface GenerationQueueEntry {
  id: string;
  status: GenerationQueueStatus;
}

interface PendingEntry extends GenerationQueueEntry {
  resolve: () => void;
}

/** FIFO semaphore shared by generate and edit requests. */
export class GenerationQueue {
  private readonly concurrency: number;
  private readonly entries: PendingEntry[] = [];
  private running = 0;

  constructor(concurrency = MAX_CONCURRENT_GENERATIONS) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
  }

  enqueue(id: string): { queued: boolean; ready: Promise<void> } {
    const queued = this.running >= this.concurrency;
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const entry: PendingEntry = {
      id,
      status: queued ? "queued" : "running",
      resolve: resolveReady!
    };
    this.entries.push(entry);
    if (queued) return { queued: true, ready };

    this.running += 1;
    entry.resolve();
    return { queued: false, ready };
  }

  release(id: string): void {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [released] = this.entries.splice(index, 1);
    if (released.status === "running") this.running = Math.max(0, this.running - 1);
    this.startNext();
  }

  snapshot(): GenerationQueueEntry[] {
    return this.entries.map(({ id, status }) => ({ id, status }));
  }

  private startNext(): void {
    while (this.running < this.concurrency) {
      const next = this.entries.find((entry) => entry.status === "queued");
      if (!next) return;
      next.status = "running";
      this.running += 1;
      next.resolve();
    }
  }
}
