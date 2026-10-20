import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { signalDevChild, stopDevChild } from "./dev-process.mjs";
import { assertBrowserBackendStopped } from "./dev-browser-state.mjs";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userData = path.resolve(process.env.ITERLAY_BROWSER_DEV_USER_DATA || path.join(projectRoot, "tmp/browser-dev/user-data"));
const bridgeConfig = path.join(userData, "browser-dev-bridge.json");
const lockPath = path.join(userData, "browser-dev.lock");
const buildInfoPath = path.join(userData, "electron.tsbuildinfo");
const electronOutput = path.join(projectRoot, "dist-electron");
const rendererPort = Number(process.env.ITERLAY_BROWSER_DEV_PORT || "5180");
if (!Number.isInteger(rendererPort) || rendererPort < 1024 || rendererPort > 65535) throw new Error("Invalid browser development port.");
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const env = {
  ...process.env,
  ITERLAY_BROWSER_DEV: "1",
  ITERLAY_BROWSER_DEV_USER_DATA: userData,
  ITERLAY_BROWSER_DEV_BRIDGE_CONFIG: bridgeConfig,
  VITE_DEV_SERVER_URL: rendererUrl
};
// Some terminal hosts set this for their own Node subprocesses. Electron must run
// as an application to provide native image, dialog, and safe-storage services.
delete env.ELECTRON_RUN_AS_NODE;

const children = new Set();
let stopping = false;
let shutdownPromise;
let compilerWatcher;
let restartTimer;
let electronProcess;
let restarting = false;
let restartRequested = false;
let ownsLock = false;
let ownsBackendState = false;
let backendRestartBlocked = false;
let electronStopPromise;
const outputHashes = new Map();
const changedOutputs = new Set();

function log(message) {
  console.log(`[browser-dev] ${message}`);
}

function startChild(label, executable, args, { persistent = true } = {}) {
  const child = spawn(executable, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    detached: process.platform !== "win32"
  });
  children.add(child);
  child.once("error", (error) => {
    log(`${label}: ${error.message}`);
    void shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (persistent && !stopping && !child.expectedExit) {
      log(`${label} exited (${signal || code}).`);
      void shutdown(child === electronProcess && backendRestartBlocked ? code || 0 : code || 1);
    }
  });
  return child;
}

async function runStep(label, executable, args) {
  log(label);
  const child = startChild(label, executable, args, { persistent: false });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${label} failed (${signal || code}).`)));
  });
  if (stopping) throw new Error("Startup interrupted.");
}

function stopElectron() {
  const child = electronProcess;
  electronStopPromise ??= stopDevChild(electronProcess, {
    graceMs: 20_000, forceOnTimeout: false, group: false, log,
    requestStop: async () => {
      const config = JSON.parse(await readFile(bridgeConfig, "utf8"));
      if (config.pid !== child.pid || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535
        || typeof config.token !== "string" || !config.token) throw new Error("Browser bridge shutdown configuration is stale or invalid.");
      const response = await fetch(`http://127.0.0.1:${config.port}/_control/quit`, {
        method: "POST", headers: { "x-iterlay-dev-token": config.token }, signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) throw new Error(`Browser bridge rejected shutdown (${response.status}).`);
    }
  }).finally(() => { electronStopPromise = undefined; });
  return electronStopPromise;
}

function preserveEditingSession() {
  backendRestartBlocked = true;
  restartRequested = false;
  log("Electron has kept the workspace open. Backend and Vite remain running; automatic restarts are paused.");
  log("请先在网页保存并处理保存错误，再按 Ctrl+C 重试停止服务；开发服务不会强制结束工作区。");
}

function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  clearTimeout(restartTimer);
  shutdownPromise = (async () => {
    // Keep Vite available while the backend finishes its pending saves.
    if (electronProcess && !await stopElectron()) {
      preserveEditingSession();
      stopping = false;
      shutdownPromise = undefined;
      return false;
    }
    compilerWatcher?.close();
    await Promise.all([...children].map((child) => stopDevChild(child, { log })));
    if (ownsLock) {
      if (ownsBackendState) await rm(bridgeConfig, { force: true });
      await rm(lockPath, { force: true });
    }
    process.exitCode = code;
    return true;
  })();
  return shutdownPromise;
}

process.on("SIGINT", () => { void shutdown(0); });
process.on("SIGTERM", () => { void shutdown(0); });
process.once("exit", () => {
  // An unexpected launcher exit must not kill a backend that still owns edits.
  if (electronProcess && electronProcess.exitCode === null && electronProcess.signalCode === null) return;
  for (const child of children) signalDevChild(child, "SIGKILL", { log });
});

async function waitFor(label, check) {
  const deadline = Date.now() + 60_000;
  while (!stopping && Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(stopping ? "Startup interrupted." : `${label} did not become ready within 60 seconds.`);
}

async function launchElectron() {
  await rm(bridgeConfig, { force: true });
  electronProcess = startChild("Electron backend", require("electron"), ["."]);
  await waitFor("Electron browser bridge", async () => {
    try {
      const config = JSON.parse(await readFile(bridgeConfig, "utf8"));
      return Number.isInteger(config.port) && config.port > 0;
    } catch { return false; }
  });
}

async function acquireLock() {
  try {
    const file = await open(lockPath, "wx", 0o600);
    ownsLock = true;
    await file.writeFile(String(process.pid));
    await file.close();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await readFile(lockPath, "utf8"));
    let active = false;
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); active = true; }
      catch (checkError) { if (checkError.code !== "ESRCH") throw checkError; }
    }
    if (active) throw new Error(`Browser development is already running (PID ${pid}).`);
    await rm(lockPath, { force: true });
    await acquireLock();
  }
}

async function assertPortAvailable() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("Port 5180 is in use. Stop the existing development server before running pnpm dev.")));
    probe.listen(rendererPort, "127.0.0.1", () => probe.close(resolve));
  });
}

async function outputHash(filename) {
  try { return createHash("sha256").update(await readFile(path.join(electronOutput, filename))).digest("hex"); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}

async function rememberOutputs(directory = "") {
  for (const entry of await readdir(path.join(electronOutput, directory), { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await rememberOutputs(filename);
    else if (/\.(?:js|cjs|json)$/u.test(filename)) outputHashes.set(filename, await outputHash(filename));
  }
}

async function restartChangedOutputs() {
  const filenames = [...changedOutputs];
  changedOutputs.clear();
  let changed = false;
  for (const filename of filenames) {
    const hash = await outputHash(filename);
    if (outputHashes.get(filename) === hash) continue;
    changed = true;
    if (hash === undefined) outputHashes.delete(filename);
    else outputHashes.set(filename, hash);
  }
  if (changed) await restartElectron();
}

async function restartElectron() {
  if (stopping || backendRestartBlocked) return;
  if (restarting) { restartRequested = true; return; }
  restarting = true;
  try {
    log("Backend changed; restarting Electron services…");
    if (!await stopElectron()) { preserveEditingSession(); return; }
    if (!stopping) await launchElectron();
  } catch (error) {
    log(error.message);
    await shutdown(1);
  } finally {
    restarting = false;
    if (restartRequested && !stopping) {
      restartRequested = false;
      void restartElectron();
    }
  }
}

try {
  await mkdir(userData, { recursive: true });
  await acquireLock();
  await assertBrowserBackendStopped(userData);
  await assertPortAvailable();
  ownsBackendState = true;
  await rm(bridgeConfig, { force: true });
  if (process.platform === "darwin") await runStep("Building native image services…", "bash", ["scripts/build-photo-layer-segmenter.sh"]);
  await rm(path.join(projectRoot, "dist-electron"), { recursive: true, force: true });
  await rm(buildInfoPath, { force: true });
  const tsc = require.resolve("typescript/bin/tsc");
  // Reuse the initial build state so the watcher does not immediately emit and
  // restart an unchanged backend. Failed checks never replace running services.
  const compilerArgs = [tsc, "-p", "electron/tsconfig.json", "--noEmitOnError", "--incremental", "--tsBuildInfoFile", buildInfoPath];
  await runStep("Building Electron services…", process.execPath, compilerArgs);
  await runStep("Building preload…", process.execPath, ["scripts/build-preload.mjs"]);
  const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
  startChild("Vite", process.execPath, [vite, "--host", "127.0.0.1", "--port", String(rendererPort), "--strictPort"]);
  await waitFor("Vite", async () => {
    try { return (await fetch(rendererUrl, { signal: AbortSignal.timeout(1_000) })).ok; }
    catch { return false; }
  });
  await launchElectron();
  await rememberOutputs();
  compilerWatcher = watch(electronOutput, { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(?:js|cjs|json)$/u.test(filename)) return;
    changedOutputs.add(filename);
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      void restartChangedOutputs().catch((error) => { log(error.message); void shutdown(1); });
    }, 800);
  });
  compilerWatcher.on("error", (error) => { log(error.message); void shutdown(1); });
  startChild("TypeScript watcher", process.execPath, [...compilerArgs, "--watch", "--preserveWatchOutput"]);
  startChild("Preload watcher", process.execPath, ["scripts/build-preload.mjs", "--watch"]);
  log(`Ready: ${rendererUrl}`);
  log(`Isolated development data: ${userData}`);
  log("Open the URL in your browser. Ctrl+C stops the browser development services.");
} catch (error) {
  if (!stopping) log(error.message);
  await shutdown(stopping ? process.exitCode || 0 : 1);
}
