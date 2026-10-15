import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mapDevBrowserAssetUrls } from "../shared/dev-asset-url.js";
import { decodeDevBrowserWire, encodeDevBrowserWire } from "../shared/dev-browser-wire.js";
import { collectWorkbenchChannels } from "../shared/workbench-client.js";
import { WINDOW_RENDERER_READY, WINDOW_SAVE_REQUEST, WINDOW_SAVE_RESULT, type WindowSaveResult } from "../shared/window-lifecycle.js";
import { WindowSaveRequests } from "./window-save-requests.js";

export const DEV_BROWSER_PREFIX = "/__iterlay_dev";
export const DEV_BROWSER_TOKEN_HEADER = "x-iterlay-dev-token";
export const MAX_DEV_BROWSER_REQUEST_BYTES = 768 * 1024 * 1024;

async function readRequestPayload(request: IncomingMessage, url: URL): Promise<{
  body: unknown;
  attachments?: Map<number, ArrayBuffer>;
}> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (declaredLength > MAX_DEV_BROWSER_REQUEST_BYTES) throw new Error("开发请求超过 768 MB 限制。");
  const contentType = request.headers["content-type"] ?? "";
  if (/^multipart\/form-data(?:;|$)/iu.test(contentType)) {
    let received = 0;
    const stream = (Readable.toWeb(request) as ReadableStream<Uint8Array>).pipeThrough(new TransformStream({
      transform(chunk: Uint8Array, controller) {
        received += chunk.byteLength;
        if (received > MAX_DEV_BROWSER_REQUEST_BYTES) throw new Error("开发请求超过 768 MB 限制。");
        controller.enqueue(chunk);
      }
    }));
    const init: RequestInit & { duplex: "half" } = {
      method: "POST", headers: { "content-type": contentType }, body: stream, duplex: "half"
    };
    const form = await new Request(url, init).formData();
    const payload = form.get("payload");
    if (typeof payload !== "string" || form.getAll("payload").length !== 1) throw new Error("开发请求缺少唯一的 JSON 参数。");
    const body: unknown = JSON.parse(payload);
    const files = new Map<number, Blob>();
    let totalBytes = Buffer.byteLength(payload);
    form.forEach((value, name) => {
      if (name === "payload") return;
      const match = /^attachment:(0|[1-9]\d*)$/u.exec(name);
      const index = match ? Number(match[1]) : -1;
      if (!Number.isSafeInteger(index) || index < 0 || typeof value === "string" || files.has(index)) {
        throw new Error("开发请求二进制附件无效或重复。");
      }
      totalBytes += value.size;
      if (totalBytes > MAX_DEV_BROWSER_REQUEST_BYTES) throw new Error("开发请求超过 768 MB 限制。");
      files.set(index, value);
    });
    const attachments = new Map(await Promise.all([...files].map(async ([index, file]) => (
      [index, await file.arrayBuffer()] as const
    ))));
    return { body, attachments };
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_DEV_BROWSER_REQUEST_BYTES) throw new Error("开发请求超过 768 MB 限制。");
    chunks.push(buffer);
  }
  return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
}

interface ServerOptions {
  token: string;
  origin: string;
  invoke: (channel: string, args: unknown[]) => Promise<unknown>;
  send: (channel: string, args: unknown[]) => void;
  assetResponse: (request: Request) => Promise<Response | null>;
  requestQuit?: () => void;
  sessionLeaseMs?: number;
}
interface EditorSession {
  id: string;
  stream?: ServerResponse;
  sequence: number;
  events: { id: number; data: string }[];
}

/** Development-only transport. Vite owns browser access; this port accepts its secret header. */
export async function startDevBrowserServer(options: ServerOptions) {
  const channels = collectWorkbenchChannels();
  let session: EditorSession | undefined;
  let leaseTimer: ReturnType<typeof setTimeout> | undefined;
  const clearLease = () => { clearTimeout(leaseTimer); leaseTimer = undefined; };
  const publish = (channel: string, ...args: unknown[]) => {
    if (!session || !channels.events.has(channel)) return;
    const event = { id: ++session.sequence, data: JSON.stringify({ channel,
      args: encodeDevBrowserWire(mapDevBrowserAssetUrls(args, "to-browser")) }) };
    session.events.push(event);
    if (session.events.length > 256) session.events.shift();
    session.stream?.write(`id: ${event.id}\ndata: ${event.data}\n\n`);
  };
  const saves = new WindowSaveRequests((_sender, requestId) => publish(WINDOW_SAVE_REQUEST, { requestId }));
  const release = () => {
    clearLease();
    const previous = session;
    session = undefined;
    saves.forget(1);
    previous?.stream?.end();
  };
  const retainForReconnect = (current: EditorSession) => {
    clearLease();
    leaseTimer = setTimeout(() => {
      if (session === current && !current.stream) release();
    }, options.sessionLeaseMs ?? 30_000);
    leaseTimer.unref();
  };
  const json = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(value));
  };
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) json(response, 400, { error: error instanceof Error ? error.message : String(error) });
      else response.destroy();
    });
  });
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers[DEV_BROWSER_TOKEN_HEADER] !== options.token
      || (request.headers.origin && request.headers.origin !== options.origin)) {
      json(response, 403, { error: "网页开发服务拒绝了该连接。" }); return;
    }
    const url = new URL(request.url ?? "/", options.origin);
    // Launcher-only endpoint: Vite forwards only /__iterlay_dev/*.
    if (request.method === "POST" && url.pathname === "/_control/quit" && options.requestQuit) {
      json(response, 200, { result: true });
      setImmediate(options.requestQuit);
      return;
    }
    if (request.method === "GET" && url.pathname === `${DEV_BROWSER_PREFIX}/session`) {
      const previousId = url.searchParams.get("sessionId");
      if (session && session.id !== previousId) {
        json(response, 409, { error: "已有网页正在调试此工作区，请先关闭原来的调试页面。" }); return;
      }
      if (!session) session = { id: randomUUID(), sequence: 0, events: [] };
      if (!session.stream) retainForReconnect(session);
      json(response, 200, { sessionId: session.id }); return;
    }
    // Signed, opaque asset URLs are already capabilities; they contain no arbitrary file path.
    const asset = await options.assetResponse(new Request(url, { method: request.method,
      headers: request.headers.range ? { range: request.headers.range } : undefined }));
    if (asset) {
      const headers: Record<string, string> = {};
      asset.headers.forEach((value, name) => { headers[name] = value; });
      response.writeHead(asset.status, headers);
      if (asset.body) await pipeline(Readable.fromWeb(asset.body as import("node:stream/web").ReadableStream), response);
      else response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === `${DEV_BROWSER_PREFIX}/events`) {
      if (!session || session.id !== url.searchParams.get("sessionId")) {
        json(response, 409, { error: "网页调试会话已失效，请刷新页面。" }); return;
      }
      const current = session;
      clearLease();
      const previousStream = current.stream;
      current.stream = response;
      // Assign first: closing the previous stream must not reset the new editor's readiness.
      previousStream?.end();
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform",
        connection: "keep-alive", "x-accel-buffering": "no" });
      response.write("event: ready\ndata: {}\n\n");
      const lastId = Number(request.headers["last-event-id"] ?? 0);
      for (const event of current.events) if (event.id > lastId) response.write(`id: ${event.id}\ndata: ${event.data}\n\n`);
      const ping = setInterval(() => response.write(": heartbeat\n\n"), 20_000);
      ping.unref();
      response.once("close", () => {
        clearInterval(ping);
        if (session === current && current.stream === response) {
          current.stream = undefined;
          saves.forget(1);
          retainForReconnect(current);
        }
      });
      return;
    }
    if (request.method !== "POST" || !["invoke", "send", "disconnect"].some((route) => url.pathname === `${DEV_BROWSER_PREFIX}/${route}`)) {
      json(response, 404, { error: "未知的网页开发接口。" }); return;
    }
    const { body, attachments } = await readRequestPayload(request, url);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请求参数无效。");
    const { sessionId, channel, args } = body as { sessionId?: unknown; channel?: unknown; args?: unknown };
    if (!session || session.id !== sessionId) { json(response, 409, { error: "网页调试会话已失效，请刷新页面。" }); return; }
    if (url.pathname.endsWith("/disconnect")) { release(); json(response, 200, { result: null }); return; }
    if (typeof channel !== "string") throw new Error("请求命令无效。");
    const decoded = mapDevBrowserAssetUrls(decodeDevBrowserWire(args, (index) => attachments?.get(index)), "to-electron", options.origin);
    if (!Array.isArray(decoded)) throw new Error("请求参数必须为数组。");
    if (url.pathname.endsWith("/invoke")) {
      if (!channels.invoke.has(channel)) throw new Error("不允许调用该应用命令。");
      const result = await options.invoke(channel, decoded);
      json(response, 200, { result: encodeDevBrowserWire(mapDevBrowserAssetUrls(result, "to-browser")) });
    } else {
      if (!channels.send.has(channel)) throw new Error("不允许发送该应用消息。");
      if (channel === WINDOW_RENDERER_READY) saves.markReady(1);
      else if (channel === WINDOW_SAVE_RESULT) saves.accept(1, decoded[0] as WindowSaveResult);
      else options.send(channel, decoded);
      json(response, 200, { result: null });
    }
  }
  server.requestTimeout = 120_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法启动网页开发服务。");
  return {
    port: address.port, publish,
    flush: () => saves.request(1),
    close: () => { release(); server.closeAllConnections(); server.close(); }
  };
}
