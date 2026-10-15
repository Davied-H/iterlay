import { readFile } from "node:fs/promises";
import http from "node:http";
import type { Plugin } from "vite";

/** Never enabled for builds: Vite forwards same-origin development requests to Electron. */
export function devBrowserBridge(): Plugin {
  return {
    name: "iterlay-browser-development",
    apply: "serve",
    configureServer(server) {
      if (process.env.ITERLAY_BROWSER_DEV !== "1") return;
      const configPath = process.env.ITERLAY_BROWSER_DEV_BRIDGE_CONFIG;
      const origin = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5180";
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/__iterlay_dev/")) return next();
        const fail = (status: number, message: string) => {
          if (response.headersSent) return response.destroy();
          response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
          response.end(JSON.stringify({ error: message }));
        };
        if (request.headers.host !== new URL(origin).host
          || (request.headers.origin && request.headers.origin !== origin)
          || (request.headers["sec-fetch-site"] && !["same-origin", "none"].includes(String(request.headers["sec-fetch-site"])))) {
          fail(403, "只允许从本机调试页面访问开发服务。"); return;
        }
        void (async () => {
          if (!configPath) throw new Error("没有配置网页开发后端。");
          const config = JSON.parse(await readFile(configPath, "utf8")) as { port: number; token: string };
          if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || typeof config.token !== "string") throw new Error("网页开发服务配置无效。");
          const upstream = http.request({ hostname: "127.0.0.1", port: config.port, path: request.url,
            method: request.method, headers: { ...request.headers, host: `127.0.0.1:${config.port}`, "x-iterlay-dev-token": config.token } }, (incoming) => {
            response.writeHead(incoming.statusCode ?? 502, incoming.headers);
            incoming.pipe(response);
            incoming.on("error", () => response.destroy());
          });
          upstream.on("error", () => fail(503, "网页开发后端暂未就绪，请稍后刷新。"));
          response.once("close", () => upstream.destroy());
          request.pipe(upstream);
        })().catch(() => fail(503, "网页开发后端暂未就绪，请稍后刷新。"));
      });
    }
  };
}
