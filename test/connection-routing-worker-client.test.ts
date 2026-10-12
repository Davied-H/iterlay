import { afterEach, describe, expect, it, vi } from "vitest";

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly messages: unknown[] = [];
  terminated = false;
  private listeners = new Map<string, Array<(event: never) => void>>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) listener({ data } as never);
  }
}

describe("connection routing worker client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeWorker.instances = [];
  });

  it("keeps one worker alive and cancels stale versioned batches", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { routeConnectionBatchInWorker } = await import(
      "@/components/canvas/connection-routing-worker-client"
    );
    const entry = {
      id: "edge",
      request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [] }
    };

    const first = routeConnectionBatchInWorker([entry]);
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const secondController = new AbortController();
    const second = routeConnectionBatchInWorker([entry], secondController.signal);
    const secondRejected = expect(second).rejects.toMatchObject({ name: "AbortError" });

    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].terminated).toBe(false);
    expect(FakeWorker.instances[0].messages).toEqual([
      { type: "route", id: 1, entries: [entry] },
      { type: "cancel", id: 1 },
      { type: "route", id: 2, entries: [entry] }
    ]);
    secondController.abort();
    expect(FakeWorker.instances[0].terminated).toBe(false);
    expect(FakeWorker.instances[0].messages.at(-1)).toEqual({ type: "cancel", id: 2 });
    await firstRejected;
    await secondRejected;
  });

  it("resolves the latest request without recreating the worker", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { routeConnectionBatchInWorker } = await import(
      "@/components/canvas/connection-routing-worker-client"
    );
    const entry = {
      id: "edge",
      request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [] }
    };

    const result = routeConnectionBatchInWorker([entry]);
    FakeWorker.instances[0].emitMessage({
      type: "result",
      id: 1,
      results: [{ id: "edge", points: [], engine: "fallback" }]
    });

    await expect(result).resolves.toEqual([{ id: "edge", points: [], engine: "fallback" }]);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].terminated).toBe(false);
  });

  it("isolates pending batches between owned clients", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { createConnectionRoutingWorkerClient } = await import(
      "@/components/canvas/connection-routing-worker-client"
    );
    const entry = {
      id: "edge",
      request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [] }
    };
    const firstClient = createConnectionRoutingWorkerClient();
    const secondClient = createConnectionRoutingWorkerClient();

    const first = firstClient.route([entry]);
    const second = secondClient.route([entry]);

    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].messages).toEqual([{ type: "route", id: 1, entries: [entry] }]);
    expect(FakeWorker.instances[1].messages).toEqual([{ type: "route", id: 1, entries: [entry] }]);

    FakeWorker.instances[0].emitMessage({
      type: "result",
      id: 1,
      results: [{ id: "edge", points: [], engine: "fallback" }]
    });
    FakeWorker.instances[1].emitMessage({
      type: "result",
      id: 1,
      results: [{ id: "edge", points: [], engine: "libavoid" }]
    });
    await expect(first).resolves.toEqual([{ id: "edge", points: [], engine: "fallback" }]);
    await expect(second).resolves.toEqual([{ id: "edge", points: [], engine: "libavoid" }]);

    firstClient.dispose();
    secondClient.dispose();
    expect(FakeWorker.instances.every((instance) => instance.terminated)).toBe(true);
  });

  it("rejects pending work and refuses new routes after disposal", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { createConnectionRoutingWorkerClient } = await import(
      "@/components/canvas/connection-routing-worker-client"
    );
    const client = createConnectionRoutingWorkerClient();
    const entry = {
      id: "edge",
      request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [] }
    };

    const pending = client.route([entry]);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    client.dispose();

    expect(FakeWorker.instances[0].messages.at(-1)).toEqual({ type: "cancel", id: 1 });
    expect(FakeWorker.instances[0].terminated).toBe(true);
    await rejected;
    await expect(client.route([entry])).rejects.toMatchObject({ name: "AbortError" });
  });
});
