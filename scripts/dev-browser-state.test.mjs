import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertBrowserBackendStopped } from "./dev-browser-state.mjs";

async function workspace(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "iterlay-backend-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("rejects a live orphan backend without deleting its bridge credentials", async (t) => {
  const directory = await workspace(t);
  const configPath = path.join(directory, "browser-dev-bridge.json");
  const config = JSON.stringify({ pid: process.pid, port: 12345, token: "fixture" });
  await writeFile(configPath, config);
  await assert.rejects(assertBrowserBackendStopped(directory), new RegExp(`PID ${process.pid}`));
  assert.equal(await readFile(configPath, "utf8"), config);
});

test("detects an older orphan after its bridge config was removed", { skip: process.platform === "win32" }, async (t) => {
  const directory = await workspace(t);
  await symlink(`${hostname()}-${process.pid}`, path.join(directory, "SingletonLock"));
  await assert.rejects(assertBrowserBackendStopped(directory), new RegExp(`PID ${process.pid}`));
});

test("permits startup with missing or stale backend state", async (t) => {
  const directory = await workspace(t);
  await assertBrowserBackendStopped(directory);
  await writeFile(path.join(directory, "browser-dev-bridge.json"), JSON.stringify({ pid: 2147483647 }));
  if (process.platform !== "win32") await symlink(`${hostname()}-2147483647`, path.join(directory, "SingletonLock"));
  await assertBrowserBackendStopped(directory);
});
