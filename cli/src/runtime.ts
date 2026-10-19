import { spawn } from "node:child_process";
import { callLocalApi } from "../../electron/local-api-client.js";
import { resolveIterlayApp } from "./paths.js";
import { CLI_BACKGROUND_FLAG } from "../../electron/background-session.js";
export interface RuntimeOptions { userDataPath: string; appRoot?: string; noLaunch?: boolean }
export async function connect(options: RuntimeOptions): Promise<(method: string, args?: Record<string, unknown>) => Promise<unknown>> {
  const call = (method: string, args: Record<string, unknown> = {}) => callLocalApi(options.userDataPath, method, args);
  try { await call("status"); return call; } catch (error) {
    if (options.noLaunch) throw error;
  }
  const app = await resolveIterlayApp(options.appRoot);
  if (!app) throw new Error("未找到 Iterlay App，请先安装并打开 App，或指定 --app-path。");
  const child = spawn(app.commandPath, [CLI_BACKGROUND_FLAG], { detached: true, stdio: "ignore", windowsHide: true, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")) });
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { await call("status"); return call; } catch { /* Readiness probes only; never retry mutations. */ }
  }
  throw new Error("Iterlay 后台服务尚未就绪，请检查运行日志，或手动打开 App 后重试。");
}
