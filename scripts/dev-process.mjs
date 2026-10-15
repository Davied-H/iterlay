import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";

export function signalDevChild(child, signal, { group = true, log = console.error } = {}) {
  if (!child.pid) return;
  try {
    if (!group || process.platform === "win32") {
      if (group && signal === "SIGKILL" && process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else child.kill(signal);
    } else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") log(`Unable to stop process ${child.pid}: ${error.message}`);
  }
}

/** A data-owning backend may decline to quit after a save failure. Keep it alive. */
export async function stopDevChild(child, { graceMs = 3_000, forceOnTimeout = true, group = true, requestStop, log = console.error } = {}) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return true;
  child.expectedExit = true;
  return new Promise((resolve) => {
    const exited = () => { clearTimeout(timeout); resolve(true); };
    const timeout = setTimeout(() => {
      child.removeListener("exit", exited);
      if (forceOnTimeout) {
        signalDevChild(child, "SIGKILL", { group, log });
        resolve(true);
      } else {
        child.expectedExit = false;
        resolve(false);
      }
    }, graceMs);
    child.once("exit", exited);
    if (requestStop) {
      void Promise.resolve().then(requestStop).catch((error) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        log(`Graceful shutdown request failed: ${error.message}; sending SIGTERM to the main process.`);
        signalDevChild(child, "SIGTERM", { group: false, log });
      });
    } else signalDevChild(child, "SIGTERM", { group, log });
  });
}
