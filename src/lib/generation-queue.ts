export type GenerationQueueStatus = "queued" | "running";
export const MAX_CONCURRENT_GENERATIONS = 3;

export interface GenerationQueueEntry {
  id: string;
  status: GenerationQueueStatus;
}

interface PendingEntry extends GenerationQueueEntry {
  resolve: () => void;
  reject: (error: GenerationQueueCancelledError) => void;
}

export class GenerationQueueCancelledError extends Error {
  constructor() {
    super("已取消排队任务，尚未发送到 Provider。");
    this.name = "GenerationQueueCancelledError";
  }
}

export interface GenerationQueueTicket {
  queued: boolean;
  ready: Promise<void>;
  /** Only cancels work that has not acquired a running slot. */
  cancel: () => boolean;
}

/** FIFO semaphore shared by generate and edit requests. */
export class GenerationQueue {
  private readonly concurrency: number;
  private readonly entries: PendingEntry[] = [];
  private running = 0;

  constructor(concurrency = MAX_CONCURRENT_GENERATIONS) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
  }

  enqueue(id: string): GenerationQueueTicket {
    if (this.entries.some((entry) => entry.id === id)) throw new Error("任务已在生成队列中。");
    const queued = this.running >= this.concurrency;
    let resolveReady: (() => void) | undefined;
    let rejectReady: ((error: GenerationQueueCancelledError) => void) | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // A caller may cancel a queued ticket before attaching its await handler.
    // Keep the original promise rejected for that await without an unhandled-rejection event.
    void ready.catch(() => undefined);
    const entry: PendingEntry = {
      id,
      status: queued ? "queued" : "running",
      resolve: resolveReady!,
      reject: rejectReady!
    };
    this.entries.push(entry);
    const cancel = () => this.cancelQueued(id);
    if (queued) return { queued: true, ready, cancel };

    this.running += 1;
    entry.resolve();
    return { queued: false, ready, cancel };
  }

  release(id: string): void {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [released] = this.entries.splice(index, 1);
    if (released.status === "running") this.running = Math.max(0, this.running - 1);
    else released.reject(new GenerationQueueCancelledError());
    this.startNext();
  }

  snapshot(): GenerationQueueEntry[] {
    return this.entries.map(({ id, status }) => ({ id, status }));
  }

  cancelQueued(id: string): boolean {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.status !== "queued") return false;
    this.release(id);
    return true;
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
