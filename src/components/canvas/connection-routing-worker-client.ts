import type {
  LibavoidBatchRouteRequest,
  LibavoidBatchRouteResult
} from "./connection-routing-libavoid";

type PendingBatch = {
  resolve: (results: LibavoidBatchRouteResult[]) => void;
  reject: (error: Error) => void;
};

export interface ConnectionRoutingWorkerClient {
  route(
    entries: LibavoidBatchRouteRequest[],
    signal?: AbortSignal
  ): Promise<LibavoidBatchRouteResult[]>;
  dispose(): void;
}

function abortError(): Error {
  return new DOMException("连接路由任务已过期", "AbortError");
}

export function createConnectionRoutingWorkerClient(): ConnectionRoutingWorkerClient {
  let worker: Worker | undefined;
  let sequence = 0;
  let disposed = false;
  const pending = new Map<number, PendingBatch>();

  const cancelPending = (error: Error): void => {
    for (const [id, task] of pending) {
      // Worker cancellation only supersedes observation of stale results; native
      // routing already in progress may still finish before the message is handled.
      worker?.postMessage({ type: "cancel", id });
      task.reject(error);
    }
    pending.clear();
  };

  const routingWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL("./connection-routing.worker.ts", import.meta.url), {
      type: "module",
      name: "iterlay-connection-router"
    });
    worker.addEventListener("message", (event: MessageEvent<{
      type: "result" | "error";
      id: number;
      results?: LibavoidBatchRouteResult[];
      message?: string;
    }>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.type === "result") task.resolve(event.data.results ?? []);
      else task.reject(new Error(event.data.message ?? "连接路由 Worker 失败"));
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "连接路由 Worker 失败");
      for (const task of pending.values()) task.reject(error);
      pending.clear();
      worker?.terminate();
      worker = undefined;
    });
    return worker;
  };

  return {
    route(entries, signal) {
      if (disposed || signal?.aborted) return Promise.reject(abortError());
      const activeWorker = routingWorker();
      if (pending.size > 0) cancelPending(abortError());
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const abort = (): void => {
          const task = pending.get(id);
          if (!task) return;
          pending.delete(id);
          activeWorker.postMessage({ type: "cancel", id });
          task.reject(abortError());
        };
        pending.set(id, {
          resolve: (results) => {
            signal?.removeEventListener("abort", abort);
            resolve(results);
          },
          reject: (error) => {
            signal?.removeEventListener("abort", abort);
            reject(error);
          }
        });
        signal?.addEventListener("abort", abort, { once: true });
        activeWorker.postMessage({ type: "route", id, entries });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending(abortError());
      worker?.terminate();
      worker = undefined;
    }
  };
}

const defaultConnectionRoutingWorkerClient = createConnectionRoutingWorkerClient();

/** Compatibility entry point. Prefer an owned client so separate canvases cannot supersede each other. */
export function routeConnectionBatchInWorker(
  entries: LibavoidBatchRouteRequest[],
  signal?: AbortSignal
): Promise<LibavoidBatchRouteResult[]> {
  return defaultConnectionRoutingWorkerClient.route(entries, signal);
}
