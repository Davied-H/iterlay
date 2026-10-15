import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevBrowserAssetResponse } from "../electron/dev-browser-assets.js";
import { DEV_BROWSER_TOKEN_HEADER, startDevBrowserServer } from "../electron/dev-browser-server.js";
import { AssetStore } from "../electron/storage/asset-store.js";
import { toDevBrowserAssetUrl } from "../shared/dev-asset-url.js";
import { DEV_BROWSER_ATTACHMENT_THRESHOLD, decodeDevBrowserWire, encodeDevBrowserWire } from "../shared/dev-browser-wire.js";
import { WINDOW_RENDERER_READY, WINDOW_SAVE_RESULT } from "../shared/window-lifecycle.js";

const origin = "http://127.0.0.1:5180";
const token = "integration-test-secret";
const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(options: { sessionLeaseMs?: number; requestQuit?: () => void } = {}) {
  const invoke = vi.fn(async (_channel: string, args: unknown[]) => args);
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-dev-server-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const assets = new AssetStore(directory);
  const send = vi.fn();
  const server = await startDevBrowserServer({
    token, origin, invoke, send, ...options,
    assetResponse: (request) => createDevBrowserAssetResponse(request, assets)
  });
  cleanups.push(() => server.close());
  const address = `http://127.0.0.1:${server.port}`;
  const headers = { [DEV_BROWSER_TOKEN_HEADER]: token, Origin: origin };
  const session = async (sessionId?: string) => {
    const response = await fetch(`${address}/__iterlay_dev/session${sessionId ? `?sessionId=${sessionId}` : ""}`, { headers });
    return { response, body: await response.json() as { sessionId: string; error?: string } };
  };
  const post = (route: string, body: unknown) => fetch(`${address}/__iterlay_dev/${route}`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const connect = async (sessionId: string, lastEventId?: number) => {
    const controller = new AbortController();
    cleanups.push(() => controller.abort());
    const response = await fetch(`${address}/__iterlay_dev/events?sessionId=${sessionId}`, {
      headers: { ...headers, ...(lastEventId === undefined ? {} : { "Last-Event-ID": String(lastEventId) }) },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3_000)])
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    return {
      response,
      async next() {
        while (!buffered.includes("\n\n")) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error("SSE stream ended before an event arrived.");
          buffered += decoder.decode(chunk.value, { stream: true });
        }
        const boundary = buffered.indexOf("\n\n");
        const frame = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        const lines = Object.fromEntries(frame.split("\n").map((line) => {
          const colon = line.indexOf(":");
          return [line.slice(0, colon), line.slice(colon + 1).trimStart()];
        }));
        return { id: lines.id, event: lines.event, data: lines.data ? JSON.parse(lines.data) : undefined };
      },
      async close() {
        controller.abort();
        await reader.cancel().catch(() => undefined);
      }
    };
  };
  return { ...server, address, headers, assets, invoke, send, session, post, connect };
}

describe("development browser server", () => {
  it("requires the proxy secret and rejects foreign origins before invoking application code", async () => {
    const f = await fixture();
    for (const headers of [undefined, { [DEV_BROWSER_TOKEN_HEADER]: "wrong", Origin: origin },
      { [DEV_BROWSER_TOKEN_HEADER]: token, Origin: "https://foreign.example" }]) {
      const response = await fetch(`${f.address}/__iterlay_dev/session`, { headers });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("authenticates launcher quit control independently of the browser editor session", async () => {
    const requestQuit = vi.fn();
    const f = await fixture({ requestQuit });
    const rejectedHeaders: (HeadersInit | undefined)[] = [undefined, { [DEV_BROWSER_TOKEN_HEADER]: "wrong" },
      { [DEV_BROWSER_TOKEN_HEADER]: token, Origin: "https://foreign.example" }];
    for (const headers of rejectedHeaders) {
      const response = await fetch(`${f.address}/_control/quit`, { method: "POST", headers });
      expect(response.status).toBe(403);
      await response.json();
    }
    expect(requestQuit).not.toHaveBeenCalled();
    const get = await fetch(`${f.address}/_control/quit`, { headers: f.headers });
    expect(get.status).toBe(404);
    await get.json();
    const browserRoute = await fetch(`${f.address}/__iterlay_dev/_control/quit`, { method: "POST", headers: f.headers });
    expect(browserRoute.status).toBe(404);
    await browserRoute.json();
    expect(requestQuit).not.toHaveBeenCalled();

    // The Node launcher has the secret and sends no browser Origin or session.
    const response = await fetch(`${f.address}/_control/quit`, {
      method: "POST", headers: { [DEV_BROWSER_TOKEN_HEADER]: token }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: true });
    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledOnce());
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("does not expose quit control when no launcher quit handler was registered", async () => {
    const f = await fixture();
    const response = await fetch(`${f.address}/_control/quit`, { method: "POST", headers: f.headers });
    expect(response.status).toBe(404);
    await response.json();
  });

  it("claims one editor before SSE connects, resumes it, and invalidates it on disconnect", async () => {
    const f = await fixture();
    const first = await f.session();
    expect(first.response.status).toBe(200);
    expect((await f.session()).response.status).toBe(409);
    expect((await f.session(first.body.sessionId)).body.sessionId).toBe(first.body.sessionId);

    const disconnected = await f.post("disconnect", { sessionId: first.body.sessionId });
    expect(disconnected.status).toBe(200);
    const stale = await f.post("invoke", { sessionId: first.body.sessionId, channel: "boards:list", args: [] });
    expect(stale.status).toBe(409);
    expect(f.invoke).not.toHaveBeenCalled();
    const next = await f.session();
    expect(next.response.status).toBe(200);
    expect(next.body.sessionId).not.toBe(first.body.sessionId);
  });

  it("keeps a disconnected editor's claim during its reconnect lease and expires it afterwards", async () => {
    const f = await fixture({ sessionLeaseMs: 120 });
    const { body } = await f.session();
    const stream = await f.connect(body.sessionId);
    await stream.next();
    await stream.close();
    expect((await f.session()).response.status).toBe(409);
    const resumed = await f.session(body.sessionId);
    expect(resumed.body.sessionId).toBe(body.sessionId);
    await vi.waitFor(async () => {
      expect((await f.session()).response.status).toBe(200);
    }, { timeout: 1_000, interval: 30 });
  });

  it("enforces the public IPC allowlists and returns backend errors to the browser", async () => {
    const f = await fixture();
    const { body } = await f.session();
    const invalidSession = await f.post("invoke", { sessionId: "expired", channel: "boards:list", args: [] });
    expect(invalidSession.status).toBe(409);
    for (const [route, channel] of [["invoke", "not:a:public:command"], ["send", "not:a:public:event"]]) {
      const response = await f.post(route, { sessionId: body.sessionId, channel, args: [] });
      expect(response.status).toBe(400);
    }
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();

    f.invoke.mockRejectedValueOnce(new Error("Fixture failed to save."));
    const error = await f.post("invoke", { sessionId: body.sessionId, channel: "boards:list", args: [] });
    expect(error.status).toBe(400);
    expect(await error.json()).toMatchObject({ error: "Fixture failed to save." });
  });

  it("round-trips binary payloads and translates only complete asset URL values", async () => {
    const f = await fixture();
    const { body } = await f.session();
    const source = new Uint8Array([99, 1, 2, 3, 99]).subarray(1, 4);
    const assetUrl = "iterlay-asset://local/signed_token";
    const browserUrl = toDevBrowserAssetUrl(assetUrl);
    const args = [{ bytes: source, imageUrl: browserUrl, text: `Use ${browserUrl}.`,
      absoluteUrl: `${origin}${browserUrl}`, externalUrl: `https://foreign.example${browserUrl}` }];
    const response = await f.post("invoke", { sessionId: body.sessionId,
      channel: "boards:importData", args: encodeDevBrowserWire(args) });
    expect(response.status).toBe(200);
    const passed = f.invoke.mock.calls[0][1][0] as typeof args[0];
    expect([...new Uint8Array(passed.bytes)]).toEqual([1, 2, 3]);
    expect(passed.imageUrl).toBe(assetUrl);
    expect(passed.absoluteUrl).toBe(assetUrl);
    expect(passed.externalUrl).toBe(args[0].externalUrl);
    expect(passed.text).toBe(args[0].text);
    const result = decodeDevBrowserWire((await response.json()).result) as typeof args;
    expect(result[0].imageUrl).toBe(browserUrl);
    expect([...new Uint8Array(result[0].bytes)]).toEqual([1, 2, 3]);
  });

  it("accepts large video attachments over real multipart HTTP without base64 JSON expansion", async () => {
    const f = await fixture();
    const { body } = await f.session();
    const video = new Uint8Array(DEV_BROWSER_ATTACHMENT_THRESHOLD);
    video[0] = 255;
    video[video.length - 1] = 127;
    const view = new Uint8Array(DEV_BROWSER_ATTACHMENT_THRESHOLD + 4).subarray(2);
    view.fill(42);
    const attachments: Blob[] = [];
    const encoded = encodeDevBrowserWire([video.buffer, view, new Uint8Array([1, 2]), "video/mp4"], (bytes) => {
      attachments.push(new Blob([bytes.slice().buffer]));
      return attachments.length - 1;
    });
    const payload = JSON.stringify({ sessionId: body.sessionId, channel: "video:import", args: encoded });
    expect(payload.length).toBeLessThan(512);
    const form = new FormData();
    form.append("payload", payload);
    attachments.forEach((file, index) => form.append(`attachment:${index}`, file, `video-${index}`));
    f.invoke.mockImplementationOnce(async (_channel, args) => {
      expect(args[0]).toBeInstanceOf(ArrayBuffer);
      expect(Buffer.from(args[0] as ArrayBuffer).equals(Buffer.from(video))).toBe(true);
      expect(args[1]).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(args[1] as Uint8Array).equals(Buffer.from(view))).toBe(true);
      expect(args[2]).toEqual(new Uint8Array([1, 2]));
      expect(args[3]).toBe("video/mp4");
      return [{ imported: true, bytes: (args[0] as ArrayBuffer).byteLength }];
    });
    const response = await fetch(`${f.address}/__iterlay_dev/invoke`, { method: "POST", headers: f.headers, body: form });
    expect(response.status).toBe(200);
    expect(f.invoke).toHaveBeenCalledOnce();
    expect((await response.json()).result).toEqual([{ imported: true, bytes: video.byteLength }]);
  });

  it("rejects malformed or missing multipart attachments before invoking application code", async () => {
    const f = await fixture();
    const { body } = await f.session();
    const payload = JSON.stringify({ sessionId: body.sessionId, channel: "video:import",
      args: [{ __iterlayDevWire: "ArrayBuffer", attachment: 0 }, "video/mp4"] });
    for (const invalid of ["missing", "duplicate", "text", "bad-index", "duplicate-payload"]) {
      const form = new FormData();
      form.append("payload", payload);
      if (invalid === "duplicate") {
        form.append("attachment:0", new Blob(["video"]));
        form.append("attachment:0", new Blob(["other video"]));
      }
      if (invalid === "text") form.append("attachment:0", "a string is not a binary attachment");
      if (invalid === "bad-index") form.append("attachment:-1", new Blob(["video"]));
      if (invalid === "duplicate-payload") form.append("payload", payload);
      const response = await fetch(`${f.address}/__iterlay_dev/invoke`, { method: "POST", headers: f.headers, body: form });
      expect(response.status).toBe(400);
    }
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it("streams and replays allowed events with their original order and binary contents", async () => {
    const f = await fixture();
    const { body } = await f.session();
    f.publish("not:a:public:event", { ignored: true });
    f.publish("workbench:event", { type: "first", imageUrl: "iterlay-asset://local/signed_token" });
    const stream = await f.connect(body.sessionId);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get("content-type")).toBe("text/event-stream");
    expect((await stream.next()).event).toBe("ready");
    const first = await stream.next();
    expect(first.id).toBe("1");
    expect(first.data).toEqual({ channel: "workbench:event", args: [{ type: "first", imageUrl: "/__iterlay_dev/assets/signed_token" }] });
    f.publish("workbench:event", { type: "second", bytes: new Uint8Array([1, 2, 3]) });
    expect((await stream.next()).id).toBe("2");
    await stream.close();

    const resumed = await f.connect(body.sessionId, 1);
    expect((await resumed.next()).event).toBe("ready");
    const replayed = await resumed.next();
    expect(replayed.id).toBe("2");
    const args = decodeDevBrowserWire(replayed.data.args) as { type: string; bytes: Uint8Array }[];
    expect(args[0].type).toBe("second");
    expect([...new Uint8Array(args[0].bytes)]).toEqual([1, 2, 3]);
    await resumed.close();
  });

  it("flushes the active browser editor through the existing window-save acknowledgement", async () => {
    const f = await fixture();
    const { body } = await f.session();
    const stream = await f.connect(body.sessionId);
    await stream.next();
    expect((await f.post("send", { sessionId: body.sessionId, channel: WINDOW_RENDERER_READY, args: [] })).status).toBe(200);
    // A replacement EventSource must not clear the same editor's ready flag.
    const replacement = await f.connect(body.sessionId);
    await replacement.next();
    const pendingSave = f.flush();
    const requested = await replacement.next();
    expect(requested.data.channel).toBe("window:save-request");
    const requestId = requested.data.args[0].requestId;
    expect(typeof requestId).toBe("string");
    expect((await f.post("send", { sessionId: body.sessionId, channel: WINDOW_SAVE_RESULT,
      args: [{ requestId, ok: true }] })).status).toBe(200);
    await pendingSave;
    await stream.close();
    await replacement.close();
  });

  it("serves signed managed assets with video Range and HEAD over real HTTP", async () => {
    const f = await fixture();
    const video = await f.assets.saveVideoOutput("fixture", Buffer.from(Array.from({ length: 32 }, (_, i) => i)), "video/mp4");
    const route = toDevBrowserAssetUrl(f.assets.toAssetUrl(video));
    const response = await fetch(`${f.address}${route}`, { headers: { ...f.headers, Range: "bytes=4-11" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 4-11/32");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    const head = await fetch(`${f.address}${route}`, { method: "HEAD", headers: f.headers });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("32");
    expect(await head.text()).toBe("");
    const arbitrary = await fetch(`${f.address}/__iterlay_dev/assets/%2fetc%2fpasswd`, { headers: f.headers });
    expect(arbitrary.status).toBe(404);
    const unsigned = await fetch(`${f.address}${route}`);
    expect(unsigned.status).toBe(403);
  });
});
