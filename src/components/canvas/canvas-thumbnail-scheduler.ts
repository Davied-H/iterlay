export type CanvasThumbnailSize = 192 | 480;
export type CanvasThumbnailPriority = "normal" | "high";

interface ThumbnailTask {
  key: string;
  path: string;
  size: CanvasThumbnailSize;
  priority: CanvasThumbnailPriority;
  consumers: number;
  started: boolean;
  resolve: (url: string | undefined) => void;
  promise: Promise<string | undefined>;
}

export interface CanvasThumbnailRequest {
  promise: Promise<string | undefined>;
  cancel: () => void;
}

export interface CanvasThumbnailSchedulerOptions {
  concurrency?: number;
  cacheLimit?: number;
}

export class CanvasThumbnailScheduler {
  private readonly concurrency: number;
  private readonly cacheLimit: number;
  private readonly load: (path: string, size: CanvasThumbnailSize) => Promise<string | undefined>;
  private readonly cache = new Map<string, string>();
  private readonly tasks = new Map<string, ThumbnailTask>();
  private readonly queue: ThumbnailTask[] = [];
  private active = 0;

  constructor(
    load: (path: string, size: CanvasThumbnailSize) => Promise<string | undefined>,
    options: CanvasThumbnailSchedulerOptions = {}
  ) {
    this.load = load;
    this.concurrency = Math.max(1, options.concurrency ?? 4);
    this.cacheLimit = Math.max(1, options.cacheLimit ?? 160);
  }

  peek(path: string, size: CanvasThumbnailSize): string | undefined {
    const key = this.key(path, size);
    const value = this.cache.get(key);
    if (!value) return undefined;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  request(
    path: string,
    size: CanvasThumbnailSize,
    priority: CanvasThumbnailPriority = "normal"
  ): CanvasThumbnailRequest {
    if (!path) return { promise: Promise.resolve(undefined), cancel: () => undefined };
    const cached = this.peek(path, size);
    if (cached) return { promise: Promise.resolve(cached), cancel: () => undefined };

    const key = this.key(path, size);
    let task = this.tasks.get(key);
    if (task) {
      task.consumers += 1;
      if (!task.started && priority === "high" && task.priority !== "high") {
        task.priority = "high";
        this.sortQueue();
      }
    } else {
      let resolveTask: (url: string | undefined) => void = () => undefined;
      const promise = new Promise<string | undefined>((resolve) => {
        resolveTask = resolve;
      });
      task = {
        key,
        path,
        size,
        priority,
        consumers: 1,
        started: false,
        resolve: resolveTask,
        promise
      };
      this.tasks.set(key, task);
      this.queue.push(task);
      this.sortQueue();
      this.drain();
    }

    let cancelled = false;
    return {
      promise: task.promise,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        task.consumers = Math.max(0, task.consumers - 1);
        if (task.started || task.consumers > 0) return;
        const index = this.queue.indexOf(task);
        if (index >= 0) this.queue.splice(index, 1);
        this.tasks.delete(task.key);
        task.resolve(undefined);
      }
    };
  }

  private key(path: string, size: CanvasThumbnailSize): string {
    return `${path}:${size}`;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high"));
  }

  private store(key: string, url: string): void {
    this.cache.delete(key);
    this.cache.set(key, url);
    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private drain(): void {
    while (this.active < this.concurrency) {
      const task = this.queue.shift();
      if (!task) return;
      if (task.consumers === 0) {
        this.tasks.delete(task.key);
        task.resolve(undefined);
        continue;
      }
      task.started = true;
      this.active += 1;
      void Promise.resolve()
        .then(() => this.load(task.path, task.size))
        .catch(() => undefined)
        .then((url) => {
          if (url && task.consumers > 0) this.store(task.key, url);
          task.resolve(url);
        })
        .finally(() => {
          this.active -= 1;
          this.tasks.delete(task.key);
          this.drain();
        });
    }
  }
}
