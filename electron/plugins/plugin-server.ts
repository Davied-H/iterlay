import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { PluginStore } from "./plugin-store.js";

export const PLUGIN_DOCUMENT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; sandbox allow-scripts allow-forms";
/** A separate document is required: srcdoc inherits the host's strict script CSP. */
export function startPluginServer(store: PluginStore) {
  const token = randomBytes(32).toString("hex");
  let origin = "";
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const match = request.url?.match(new RegExp(`^/${token}/([a-z0-9.-]+)$`));
    if (request.method !== "GET" || !match || request.headers.host !== new URL(origin).host) { response.writeHead(404).end(); return; }
    try {
      await store.authorize(match[1]);
      const plugin = await store.get(match[1]);
      response.setHeader("Content-Security-Policy", PLUGIN_DOCUMENT_CSP);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(plugin.html);
    } catch { response.writeHead(404).end("Plugin unavailable"); }
  });
  const ready = new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { reject(new Error("插件服务启动失败。")); return; }
      origin = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
  // Preserve the failure for url() without an unhandled startup rejection.
  void ready.catch(() => undefined);
  return {
    async url(id: string) { await store.authorize(id); await ready; return `${origin}/${token}/${id}`; },
    close() { void ready.then(() => { server.closeAllConnections(); server.close(); }).catch(() => undefined); }
  };
}
