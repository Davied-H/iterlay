import { Worker } from "node:worker_threads";
import type { ThumbHashResult } from "./thumbhash-encoder.js";
import type { ThumbHashWorkerRequest, ThumbHashWorkerResponse } from "./image-worker.js";

/** Serializes nativeImage CPU work and yields before every unit of work. */
export class ImageTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return operation();
    });
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export class ImageWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: ThumbHashResult) => void;
    reject: (error: Error) => void;
  }>();

  encodeThumbHash(input: Omit<ThumbHashWorkerRequest, "id">): Promise<ThumbHashResult> {
    const worker = this.getWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const request = { id, ...input } satisfies ThumbHashWorkerRequest;
      worker.postMessage(request, [input.bgra.buffer as ArrayBuffer]);
    });
  }

  dispose(): void {
    const error = new Error("图片处理 Worker 已停止。");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    void this.worker?.terminate();
    this.worker = null;
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./image-worker.js", import.meta.url));
    worker.unref();
    worker.on("message", (message: ThumbHashWorkerResponse) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.result) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "ThumbHash 编码失败。"));
    });
    worker.on("error", (error) => this.failWorker(worker, error));
    worker.on("exit", (code) => {
      if (code !== 0) this.failWorker(worker, new Error(`图片处理 Worker 异常退出（${code}）。`));
      else if (this.worker === worker) this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  private failWorker(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.worker = null;
  }
}
