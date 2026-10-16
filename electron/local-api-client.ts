import { readFile } from "node:fs/promises";
import path from "node:path";
interface BridgeInfo { port: number; token: string }
const BRIDGE_FILE = "local-api.json";

export async function callLocalApi(userDataPath: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  const bridgePath = path.join(userDataPath, BRIDGE_FILE);
  const info = JSON.parse(await readFile(bridgePath, "utf8")) as BridgeInfo;
  if (!Number.isInteger(info.port) || info.port < 1 || info.port > 65535 || typeof info.token !== "string" || !/^[A-Za-z0-9_-]{20,100}$/u.test(info.token)) throw new Error("Iterlay 本地服务发现信息无效。");
  const response = await fetch(`http://127.0.0.1:${info.port}/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ method, args })
  });
  const body = await response.json() as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || "Iterlay 未能完成 CLI 请求。");
  return body.result;
}

