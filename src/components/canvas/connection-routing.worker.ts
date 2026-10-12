import {
  routeConnectionsWithLibavoid,
  type LibavoidBatchRouteRequest,
  type LibavoidBatchRouteResult
} from "./connection-routing-libavoid";

interface RouteBatchMessage {
  type: "route";
  id: number;
  entries: LibavoidBatchRouteRequest[];
}

interface CancelBatchMessage {
  type: "cancel";
  id: number;
}

type WorkerRequest = RouteBatchMessage | CancelBatchMessage;

type WorkerResponse =
  | { type: "result"; id: number; results: LibavoidBatchRouteResult[] }
  | { type: "error"; id: number; message: string };

const cancelled = new Set<number>();
const active = new Set<number>();

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "cancel") {
    if (active.has(event.data.id)) cancelled.add(event.data.id);
    return;
  }
  const { id, entries } = event.data;
  active.add(id);
  void routeConnectionsWithLibavoid(entries)
    .then((results) => {
      if (cancelled.delete(id)) return;
      self.postMessage({ type: "result", id, results } satisfies WorkerResponse);
    })
    .catch((error: unknown) => {
      if (cancelled.delete(id)) return;
      self.postMessage({
        type: "error",
        id,
        message: error instanceof Error ? error.message : String(error)
      } satisfies WorkerResponse);
    })
    .finally(() => {
      active.delete(id);
      cancelled.delete(id);
    });
});
