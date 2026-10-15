// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeDevBrowserWire, encodeDevBrowserWire } from "../shared/dev-browser-wire.js";
import { initializeBrowserWorkbench, isBrowserWorkbench } from "../src/lib/browser-workbench";

const toasts = vi.hoisted(() => ({ loading: vi.fn(), dismiss: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

class FakeEventSource extends EventTarget {
  static connections: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    super();
    FakeEventSource.connections.push(this);
  }
  close(): void { this.closed = true; }
  ready(): void { this.dispatchEvent(new Event("ready")); }
  emit(channel: string, args: unknown[]): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ channel, args: encodeDevBrowserWire(args) }) }));
  }
}

const fetchMock = vi.fn<typeof fetch>();
const beaconMock = vi.fn(() => true);
const host = window as Window & { __iterlayBrowserWorkbench?: { dispose(): void } };

beforeEach(() => {
  FakeEventSource.connections = [];
  fetchMock.mockReset();
  beaconMock.mockClear();
  Object.values(toasts).forEach((mock) => mock.mockClear());
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", FakeEventSource);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beaconMock });
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
});

afterEach(() => {
  host.__iterlayBrowserWorkbench?.dispose();
  delete host.__iterlayBrowserWorkbench;
  delete window.imageWorkbench;
  Reflect.deleteProperty(navigator, "locks");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function connect(): Promise<FakeEventSource> {
  const initializing = initializeBrowserWorkbench();
  await vi.waitFor(() => expect(FakeEventSource.connections).toHaveLength(1));
  const source = FakeEventSource.connections[0];
  expect(window.imageWorkbench).toBeUndefined();
  source.ready();
  await initializing;
  return source;
}

describe("development browser workbench", () => {
  it("leaves the native Electron preload untouched", async () => {
    const native = {} as NonNullable<Window["imageWorkbench"]>;
    window.imageWorkbench = native;
    await initializeBrowserWorkbench();
    expect(window.imageWorkbench).toBe(native);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isBrowserWorkbench()).toBe(false);
  });

  it("waits for SSE readiness, forwards RPC and events, and keeps one API across HMR initialization", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/session")) return Response.json({ sessionId: "tab-session" });
      const body = JSON.parse(String(init?.body)) as { channel: string; args: unknown };
      if (body.channel === "boards:list") return Response.json({ error: "磁盘不可用" }, { status: 400 });
      return Response.json({ result: encodeDevBrowserWire({ path: "/media/video.mp4", received: decodeDevBrowserWire(body.args) }) });
    });
    const source = await connect();
    const api = window.imageWorkbench!;
    expect(isBrowserWorkbench()).toBe(true);
    expect(window.sessionStorage.getItem("iterlay:browser-debug-session")).toBe("tab-session");
    expect(document.documentElement.dataset.workbenchConnection).toBe("connected");

    const bytes = new Uint8Array([0, 255]).buffer;
    const result = await api.importVideo(bytes, "video/mp4");
    expect(result).toEqual({ path: "/media/video.mp4", received: [bytes, "video/mp4"] });
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.sessionId).toBe("tab-session");
    expect(request.channel).toBe("video:import");
    expect(decodeDevBrowserWire(request.args)).toEqual([bytes, "video/mp4"]);
    await expect(api.listBoards()).rejects.toThrow("磁盘不可用");

    const listener = vi.fn();
    const stop = api.onWorkbenchEvent(listener);
    source.emit("workbench:event", [{ type: "board-updated", boardId: "board-1" }]);
    expect(listener).toHaveBeenCalledOnce();
    stop();
    source.emit("workbench:event", [{ type: "board-updated" }]);
    expect(listener).toHaveBeenCalledOnce();
    source.onerror?.();
    expect(document.documentElement.dataset.workbenchConnection).toBe("reconnecting");
    source.ready();
    expect(document.documentElement.dataset.workbenchConnection).toBe("connected");

    await initializeBrowserWorkbench();
    expect(window.imageWorkbench).toBe(api);
    expect(FakeEventSource.connections).toHaveLength(1);
    api.windowRendererReady();
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => String(init?.body).includes("window:renderer-ready"))).toBe(true));
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(source.closed).toBe(true);
    expect(beaconMock).toHaveBeenCalledWith("/__iterlay_dev/disconnect", expect.any(Blob));
  });

  it("shows the backend's editing-session conflict without injecting a partial API", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "已有另一个网页正在编辑，请先关闭它。" }, { status: 409 }));
    await expect(initializeBrowserWorkbench()).rejects.toThrow("已有另一个网页正在编辑");
    expect(window.imageWorkbench).toBeUndefined();
    expect(host.__iterlayBrowserWorkbench).toBeUndefined();
    expect(FakeEventSource.connections).toHaveLength(0);
  });

  it("flushes pending saves before reloading after a backend restart changes the session", async () => {
    let sessionId = "original-session";
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes("/session")) return Response.json({ sessionId });
      return Response.json({ result: null });
    });
    const source = await connect();
    let saved = (): void => undefined;
    const pendingSave = new Promise<void>((resolve) => { saved = resolve; });
    const beforeReload = (event: Event): void => {
      (event as CustomEvent<{ waitUntil(task: Promise<void>): void }>).detail.waitUntil(pendingSave);
    };
    const reload = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener("iterlay:browser-workbench-before-reload", beforeReload);
    window.addEventListener("iterlay:browser-workbench-reload", reload);
    try {
      sessionId = "restarted-session";
      source.onerror?.();
      await vi.waitFor(() => expect(document.documentElement.dataset.workbenchConnection).toBe("restarting"));
      expect(window.sessionStorage.getItem("iterlay:browser-debug-session")).toBe(sessionId);
      expect(source.closed).toBe(true);
      expect(reload).not.toHaveBeenCalled();
      saved();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/session?sessionId=original-session"))).toBe(true);
    } finally {
      window.removeEventListener("iterlay:browser-workbench-before-reload", beforeReload);
      window.removeEventListener("iterlay:browser-workbench-reload", reload);
    }
  });

  it("restores renderer-save readiness after a short event-stream interruption", async () => {
    fetchMock.mockImplementation(async (input) => Response.json(String(input).includes("/session")
      ? { sessionId: "same-session" } : { result: null }));
    const source = await connect();
    window.imageWorkbench!.windowRendererReady();
    const readyCalls = () => fetchMock.mock.calls.filter(([, init]) => String(init?.body).includes("window:renderer-ready"));
    await vi.waitFor(() => expect(readyCalls()).toHaveLength(1));
    source.onerror?.();
    source.ready();
    await vi.waitFor(() => expect(readyCalls()).toHaveLength(2));
    expect(FakeEventSource.connections).toHaveLength(1);
    expect(window.sessionStorage.getItem("iterlay:browser-debug-session")).toBe("same-session");
  });

  it("reports a prolonged backend outage and continues retrying", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ sessionId: "lost-session" }));
    const source = await connect();
    fetchMock.mockRejectedValue(new Error("开发后端暂不可用"));
    vi.useFakeTimers();
    source.onerror?.();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(document.documentElement.dataset.workbenchConnection).toBe("disconnected");
    expect(toasts.error).toHaveBeenCalled();
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("restores save readiness when a page returns from the back-forward cache", async () => {
    fetchMock.mockImplementation(async (input) => Response.json(String(input).includes("/session")
      ? { sessionId: "cached-session" } : { result: null }));
    const source = await connect();
    const api = window.imageWorkbench!;
    api.windowRendererReady();
    const readyCalls = () => fetchMock.mock.calls.filter(([, init]) => String(init?.body).includes("window:renderer-ready"));
    await vi.waitFor(() => expect(readyCalls()).toHaveLength(1));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    expect(source.closed).toBe(true);
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await vi.waitFor(() => expect(FakeEventSource.connections).toHaveLength(2));
    FakeEventSource.connections[1].ready();
    await vi.waitFor(() => expect(readyCalls()).toHaveLength(2));
    expect(window.imageWorkbench).toBe(api);
    expect(document.documentElement.dataset.workbenchConnection).toBe("connected");
  });

  it("rejects a duplicated tab's copied session ID before it can replace the active SSE stream", async () => {
    window.sessionStorage.setItem("iterlay:browser-debug-session", "copied-active-session");
    const request = vi.fn(async (_name: string, _options: object, callback: (lock: { name: string } | null) => Promise<void>) => callback(null));
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    await expect(initializeBrowserWorkbench()).rejects.toThrow("已有网页正在调试此工作区");
    expect(request).toHaveBeenCalledWith("iterlay:browser-debug-editor", { mode: "exclusive", ifAvailable: true }, expect.any(Function));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeEventSource.connections).toHaveLength(0);
    expect(window.imageWorkbench).toBeUndefined();
  });

  it("holds the document lock until pagehide and reacquires it after a back-forward cache restore", async () => {
    let held = false;
    const request = vi.fn(async (name: string, _options: object, callback: (lock: { name: string } | null) => Promise<void>) => {
      if (held) return callback(null);
      held = true;
      try { return await callback({ name }); } finally { held = false; }
    });
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    fetchMock.mockImplementation(async (input) => Response.json(String(input).includes("/session")
      ? { sessionId: "locked-session" } : { result: null }));
    await connect();
    expect(held).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    await vi.waitFor(() => expect(held).toBe(false));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await vi.waitFor(() => expect(FakeEventSource.connections).toHaveLength(2));
    FakeEventSource.connections[1].ready();
    expect(held).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    host.__iterlayBrowserWorkbench?.dispose();
    await vi.waitFor(() => expect(held).toBe(false));
  });

  it("uploads large video bytes as multipart attachments with a browser-generated boundary", async () => {
    fetchMock.mockImplementation(async (input) => Response.json(String(input).includes("/session")
      ? { sessionId: "upload-session" } : { result: { path: "/media/large.mp4" } }));
    await connect();
    const bytes = new Uint8Array(1024 * 1024);
    await window.imageWorkbench!.importVideo(bytes.buffer, "video/mp4");
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe("/__iterlay_dev/invoke");
    expect(request?.headers).toBeUndefined();
    expect(request?.body).toBeInstanceOf(FormData);
    const form = request!.body as FormData;
    const payload = JSON.parse(String(form.get("payload")));
    expect(payload.channel).toBe("video:import");
    expect(payload.args[0]).toEqual({ __iterlayDevWire: "ArrayBuffer", attachment: 0 });
    expect((form.get("attachment:0") as Blob).size).toBe(bytes.byteLength);
  });
});
