import { afterEach, describe, expect, it, vi } from "vitest";

const load = vi.fn(async () => {
  throw new Error("simulated WASM initialization failure");
});

vi.mock("libavoid-js", () => ({
  AvoidLib: {
    load,
    getInstance: vi.fn()
  }
}));

describe("libavoid routing fallback", () => {
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);

  afterEach(() => {
    process.off("unhandledRejection", onUnhandledRejection);
    unhandled.length = 0;
    load.mockClear();
    vi.unstubAllGlobals();
  });

  it("falls back without leaking an unhandled rejection when WASM initialization fails", async () => {
    process.on("unhandledRejection", onUnhandledRejection);
    const { routeConnectionWithLibavoid } = await import("@/components/canvas/connection-routing-libavoid");
    const result = await routeConnectionWithLibavoid({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      obstacles: [{ id: "blocker", x: 40, y: -20, width: 20, height: 40 }]
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(load).toHaveBeenCalledOnce();
    expect(result.engine).toBe("visibility-fallback");
    expect(result.fallbackReason).toBe("simulated WASM initialization failure");
    expect(result.points.length).toBeGreaterThan(2);
    expect(unhandled).toEqual([]);
  });

  it("rejects an HTTP failure before Emscripten can emit an unhandled abort", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const { routeConnectionWithLibavoid } = await import("@/components/canvas/connection-routing-libavoid");

    const result = await routeConnectionWithLibavoid({
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      obstacles: [{ id: "blocker", x: 40, y: -20, width: 20, height: 40 }]
    });

    expect(load).not.toHaveBeenCalled();
    expect(result.engine).toBe("visibility-fallback");
    expect(result.fallbackReason).toBe("libavoid WASM request failed with HTTP 503");
  });

  it("deduplicates concurrent initialization and permits a retry after failure", async () => {
    const { initializeLibavoid } = await import("@/components/canvas/connection-routing-libavoid");
    const first = initializeLibavoid({ wasmUrl: "mock://same-wasm" });
    const concurrent = initializeLibavoid({ wasmUrl: "mock://same-wasm" });

    expect(concurrent).toBe(first);
    await expect(first).rejects.toThrow("simulated WASM initialization failure");
    await expect(concurrent).rejects.toThrow("simulated WASM initialization failure");
    expect(load).toHaveBeenCalledTimes(1);

    await expect(initializeLibavoid({ wasmUrl: "mock://same-wasm" }))
      .rejects.toThrow("simulated WASM initialization failure");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
