import { readFile, readlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

/** Check before removing bridge credentials or rebuilding a workspace's backend. */
export async function assertBrowserBackendStopped(userData) {
  let pid;
  try {
    const config = JSON.parse(await readFile(path.join(userData, "browser-dev-bridge.json"), "utf8"));
    if (isAlive(config.pid)) pid = config.pid;
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  // Older launchers may already have deleted a surviving backend's config.
  // Chromium's POSIX lock still identifies the workspace owner in that case.
  if (!pid && process.platform !== "win32") {
    try {
      const lock = await readlink(path.join(userData, "SingletonLock"));
      const match = /^(.*)-(\d+)$/u.exec(lock);
      if (match && match[1] === hostname() && isAlive(Number(match[2]))) pid = Number(match[2]);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EINVAL") throw error;
    }
  }
  if (pid) throw new Error(`开发工作区仍由 Electron 后端占用（PID ${pid}）：${userData}。请先在原网页保存，再停止原开发服务；若启动器已退出，可用 kill -TERM ${pid} 请求安全退出，然后重试。未删除桥接配置或强制结束进程。`);
}
