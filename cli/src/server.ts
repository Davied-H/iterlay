import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { createNodeWorkbench } from "./workbench.js";
import { defaultUserDataPath } from "./paths.js";
import { WorkspaceCommands } from "../../electron/application/workspace-commands.js";
import { writeJsonAtomic } from "../../electron/storage/atomic-json.js";

export async function startNodeServer(requestedPath: string) {
  const resolved = path.resolve(requestedPath);
  const desktop = path.resolve(defaultUserDataPath());
  if (resolved === desktop || resolved.startsWith(desktop + path.sep)) throw new Error("独立模式需要单独的工作区，不能使用 App 数据目录。");
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const directory = await realpath(resolved);
  const desktopReal = await realpath(desktop).catch(() => desktop);
  if (directory === desktopReal || directory.startsWith(desktopReal + path.sep)) throw new Error("独立模式不能通过符号链接使用 App 数据目录。");
  const marker = path.join(directory, "standalone.json");
  try {
    const data = JSON.parse(await readFile(marker, "utf8"));
    if (data?.schemaVersion !== 1 || data?.runtime !== "node") throw new Error("独立工作区标识无效。");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (await stat(path.join(directory, "workspace/settings.json")).catch(() => null)) throw new Error("目录已含其他工作区，请为独立模式指定新的 --user-data-path。");
  }
  const release = await lockfile.lock(directory, { lockfilePath: path.join(directory, ".runtime.lock"), stale: 10_000, update: 2_000 });
  let workbench: Awaited<ReturnType<typeof createNodeWorkbench>> | undefined;
  const token = randomBytes(32).toString("base64url");
  const bridge = path.join(directory, "local-api.json");
  let stopping = false;
  const active = new Set<Promise<unknown>>();
  const server = createServer((request, response) => { void handle(request, response); });
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  let finished!: () => void;
  const closed = new Promise<void>((resolve) => { finished = resolve; });
  const close = async () => {
    if (stopping) return closed;
    stopping = true;
    server.close();
    for (const socket of sockets) socket.destroy();
    try {
      while (active.size) await Promise.allSettled([...active]);
      await commands?.dispose();
      await workbench?.dispose();
      const current = JSON.parse(await readFile(bridge, "utf8").catch(() => "null")) as { token?: string } | null;
      if (current?.token === token) await rm(bridge, { force: true });
    } finally { await release(); finished(); }
  };
  async function handle(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) {
    if (request.method !== "POST" || request.url !== "/call" || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end(); return;
    }
    try {
      if (stopping) throw new Error("独立后台正在停止，请稍后重试。");
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
        if (size > 32 * 1024 * 1024) throw new Error("CLI 请求超过 32 MB 限制。");
        chunks.push(bytes);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { method?: unknown; args?: unknown };
      if (typeof body.method !== "string" || !body.args || typeof body.args !== "object" || Array.isArray(body.args)) throw new Error("CLI 请求参数无效。");
      if (["open_iterlay", "open_board", "focus_nodes", "fit_board_view"].includes(body.method)) throw new Error("独立模式没有桌面窗口，请用 boards show 或 assets export 查看结果。");
      if (stopping) throw new Error("独立后台正在停止，请稍后重试。");
      let result: unknown;
      if (body.method === "shutdown") result = { stopping: true };
      else {
        const operation = commands.call(body.method, body.args as Record<string, unknown>);
        active.add(operation);
        try { result = await operation; } finally { active.delete(operation); }
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ result: body.method === "status" ? { ...(result as object), runtime: "node", userDataPath: directory } : result }));
      if (body.method === "shutdown") response.once("finish", () => { void close(); });
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "请求失败。" }));
    }
  }
  let commands: WorkspaceCommands;
  try {
    await writeJsonAtomic(marker, { schemaVersion: 1, runtime: "node" });
    workbench = await createNodeWorkbench(directory);
    commands = new WorkspaceCommands({ api: workbench.api, emit: () => workbench!.invalidate(), flush: async () => undefined, taskDirectory: path.join(directory, "workspace/cli-tasks") });
    server.requestTimeout = 30_000; server.headersTimeout = 10_000;
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("无法启动独立 CLI 服务。");
    await writeJsonAtomic(bridge, { port: address.port, token, runtime: "node" });
    return { directory, close, closed };
  } catch (error) { await close(); throw error; }
}
