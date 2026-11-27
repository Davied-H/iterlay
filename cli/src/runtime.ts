import path from "node:path";
import { spawn } from "node:child_process";
import { callLocalApi } from "../../electron/local-api-client.js";
import { resolveIterlayApp } from "./paths.js";
import { CLI_BACKGROUND_FLAG } from "../../electron/background-session.js";
export interface RuntimeOptions { userDataPath: string; appRoot?: string; noLaunch?: boolean; standalone?: boolean }
export async function connect(options: RuntimeOptions): Promise<(method: string, args?: Record<string, unknown>) => Promise<unknown>> {
  const call = (method: string, args: Record<string, unknown> = {}) => callLocalApi(options.userDataPath, method, args);
  let connected = false;
  try { await call("status"); connected = true; } catch (error) {
    if (options.noLaunch) throw error;
  }
  if (connected) {
    if (options.standalone) {
      const status = await call("status") as { runtime?: string };
      if (status?.runtime !== "node") throw new Error("指定工作区连接的是 App 后台，请为 --standalone 选择独立工作区。");
    }
    return call;
  }
  const app = options.standalone ? null : await resolveIterlayApp(options.appRoot);
  if (!app && !options.standalone) throw new Error("未找到 Iterlay App，请使用 --standalone 独立运行，或指定 --app-path。");
  const command = app?.commandPath ?? process.execPath;
  const args = app ? [CLI_BACKGROUND_FLAG] : [process.argv[1], "serve", "--standalone", "--user-data-path", path.resolve(options.userDataPath)];
  const env = app ? Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")) : { ...process.env };
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, env });
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { await call("status"); return call; } catch { /* Readiness probes only; never retry mutations. */ }
  }
  throw new Error(options.standalone ? "独立后台尚未就绪。请运行 iterlay serve --user-data-path <相同工作区> 查看启动错误；异常退出后的工作区锁约 10 秒过期。" : "Iterlay 后台服务尚未就绪，请检查运行日志，或手动打开 App 后重试。");
}
