import { readFile } from "node:fs/promises";
import path from "node:path";
interface BridgeInfo { port: number; token: string }
const BRIDGE_FILE = "mcp-bridge.json";

export async function callMcpBridge(userDataPath: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  const bridgePath = path.join(userDataPath, BRIDGE_FILE);
  const info = JSON.parse(await readFile(bridgePath, "utf8")) as BridgeInfo;
  const response = await fetch(`http://127.0.0.1:${info.port}/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ method, args })
  });
  const body = await response.json() as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || "Iterlay 未能完成 MCP 请求。");
  return body.result;
}

