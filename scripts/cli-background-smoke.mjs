import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { _electron } from "playwright";

// This test never shows a native window or accesses an installed App's data.
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const exec = promisify(execFile);
const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-background-"));
await mkdir(path.join(directory, "workspace")); // Prevent importing legacy user data.
const env = { ...process.env, ITERLAY_PLAYWRIGHT: "1", ITERLAY_E2E_USER_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
delete env.ITERLAY_BROWSER_DEV;

async function cli(...args) {
  const { stdout } = await exec(process.execPath, [path.join(root, "cli/dist/main.js"), ...args, "--user-data-path", directory, "--json"], { cwd: root, timeout: 30_000 });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true, stdout);
  return result.data;
}

async function start() {
  const application = await _electron.launch({ executablePath: require("electron"), args: [root, "--iterlay-background"], cwd: root, env, timeout: 30_000 });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try { await cli("status"); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    assert(ready, "Background local API did not become ready");
    return application;
  } catch (error) {
    await application.close();
    throw error;
  }
}

async function assertHidden(application) {
  const state = await application.evaluate(({ app, BrowserWindow }) => ({
    visible: BrowserWindow.getAllWindows().some((window) => window.isVisible()),
    dock: process.platform === "darwin" ? app.dock.isVisible() : false,
    throttled: BrowserWindow.getAllWindows().some((window) => window.webContents.getBackgroundThrottling())
  }));
  assert.deepEqual(state, { visible: false, dock: false, throttled: false });
}

let application;
try {
  application = await start();
  await assertHidden(application);
  const board = await cli("call", "create_board", "--input", JSON.stringify({ name: "CLI background smoke" }));
  assert(board.id);
  assert((await cli("boards", "list")).some((item) => item.id === board.id));
  // Closing the workbench preserves the service used by subsequent CLI processes.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await cli("status");
  await assertHidden(application);
  // Another background launcher must never bring the existing session forward.
  await application.evaluate(({ app }) => app.emit("second-instance", {}, ["Iterlay", "--iterlay-background"], process.cwd()));
  await assertHidden(application);
  await application.close();
  application = undefined;
  application = await start();
  assert((await cli("boards", "list")).some((item) => item.id === board.id));
  await assertHidden(application);
  const files = await readFile(path.join(directory, "local-api.json"), "utf8");
  assert(JSON.parse(files).port > 0);
  console.log("Background CLI smoke passed: hidden window/Dock, real CLI reads/writes, close retention, background relaunch, and persistence after restart.");
} finally {
  if (application) await application.close();
  await rm(directory, { recursive: true, force: true });
}
