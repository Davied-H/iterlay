import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "output", "playwright");
const userData = await mkdtemp(path.join(os.tmpdir(), "iterlay-smoke-"));
await mkdir(output, { recursive: true });
await mkdir(path.join(userData, "workspace"), { recursive: true });
const fixture = await readFile(path.join(projectRoot, "demo-assets", "lamp-studio.jpg"));
const errors = [];
const provider = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/images/generations") { response.writeHead(404).end(); return; }
  request.resume();
  setTimeout(() => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ b64_json: fixture.toString("base64") }] })), 800);
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const connection = provider.address();
const config = {
  id: "fixture-provider", name: "Offline fixture", type: "openai-compatible", apiMode: "images",
  baseUrl: `http://127.0.0.1:${connection.port}`, generationEndpoint: "/v1/images/generations",
  referenceEndpoint: "/v1/images/edits", model: "fixture", supportsReferenceImages: true
};
await writeFile(path.join(userData, "workspace", "settings.json"), JSON.stringify({
  providers: [config], activeProviderId: config.id, theme: "light", language: "zh-CN", memoryEnabled: false,
  boardAssistantEnabled: false, boardAssistantAwarenessEnabled: false, editSmartSuggestionsEnabled: false
}));
await writeFile(path.join(userData, "workspace", "onboarding.json"), JSON.stringify(Object.fromEntries(
  ["board", "library", "gallery", "edit", "demo-start"].map((id) => [`iterlay.onboarding.${id}.v1`, { status: "completed", at: new Date().toISOString() }])
)));
let electronApp;
async function bridge(method, args = {}) {
  const info = JSON.parse(await readFile(path.join(userData, "mcp-bridge.json"), "utf8"));
  const response = await fetch(`http://127.0.0.1:${info.port}/call`, {
    method: "POST", headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
    body: JSON.stringify({ method, args }), signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "MCP failed");
  return body.result;
}
async function pageReady(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.waitForURL(/dist\/index\.html/u, { timeout: 60_000 });
  await page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.boardSaveState, { timeout: 60_000 });
}
try {
  const env = { ...process.env, ITERLAY_PLAYWRIGHT: "1", ITERLAY_E2E_USER_DATA: userData };
  delete env.VITE_DEV_SERVER_URL;
  electronApp = await electron.launch({ args: ["."], cwd: projectRoot, env,
    ...(process.env.ITERLAY_E2E_ELECTRON ? { executablePath: process.env.ITERLAY_E2E_ELECTRON } : {}), timeout: 60_000 });
  let page = await electronApp.firstWindow();
  await pageReady(page);
  await page.waitForFunction(async () => (await window.imageWorkbench.getSettings()).setupComplete);
  const settings = await page.evaluate(() => window.imageWorkbench.getSettings());
  await page.evaluate((settings) => window.imageWorkbench.saveSettings({ ...settings, apiKeyByProviderId: { "fixture-provider": "offline-test-only" } }), settings);
  const board = await page.evaluate(() => window.imageWorkbench.createBoard("Isolated smoke board"));
  const imported = await page.evaluate((data) => window.imageWorkbench.importUploadedImage(data), "data:image/jpeg;base64," + fixture.toString("base64"));
  const nodeId = "smoke-image";
  await page.evaluate(({ boardId, nodeId, imagePath }) => window.imageWorkbench.appendBoardNodes(boardId, [{ id: nodeId, imagePath, jobId: "smoke-import", source: "upload" }]), { boardId: board.id, nodeId, imagePath: imported.path });
  await bridge("open_board", { boardId: board.id });
  const node = page.locator(`[data-id="${nodeId}"]`);
  await node.waitFor({ state: "visible", timeout: 30_000 });
  const before = await bridge("get_board", { boardId: board.id });
  const original = before.nodes.find((item) => item.id === nodeId);
  const bounds = await node.boundingBox();
  assert(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 90, bounds.y + bounds.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const closed = page.waitForEvent("close");
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  const persisted = JSON.parse(await readFile(path.join(userData, "workspace", "boards", board.id + ".json"), "utf8"));
  const moved = persisted.nodes.find((item) => item.id === nodeId);
  assert(moved.x !== original.x || moved.y !== original.y, "The final drag must persist when closed immediately");
  const reopened = electronApp.waitForEvent("window");
  await electronApp.evaluate(({ app }) => { app.emit("activate"); });
  page = await reopened;
  await pageReady(page);
  assert((await bridge("list_boards")).some((item) => item.id === board.id), "MCP must survive reopening its initial window");
  await bridge("open_board", { boardId: board.id });
  await page.locator(`[data-id="${nodeId}"]`).waitFor({ state: "visible" });
  const task = await bridge("generate_image", { boardId: board.id, prompt: "Offline smoke fixture", n: 1 });
  assert.equal(task.status, "running");
  const secondClose = page.waitForEvent("close");
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await secondClose;
  let result;
  for (let attempt = 0; attempt < 100; attempt++) {
    result = await bridge("get_generation_status", { generationId: task.generationId });
    if (result.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(result.status, "succeeded", result.error);
  assert.equal(result.images.length, 1);
  const finalWindow = electronApp.waitForEvent("window");
  await electronApp.evaluate(({ app }) => { app.emit("activate"); });
  page = await finalWindow;
  await pageReady(page);
  await bridge("open_board", { boardId: board.id });
  await page.waitForFunction(() => document.querySelectorAll("[data-image-node]").length >= 2);
  await page.screenshot({ path: path.join(output, "electron-smoke.png") });
  const windowOptions = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(windowOptions.sandbox, true);
  assert.equal(windowOptions.contextIsolation, true);
  assert.equal(windowOptions.nodeIntegration, false);
  assert.equal(errors.filter((message) => /Content Security Policy|preload|uncaught|not defined/i.test(message)).length, 0, errors.join("\n"));
  console.log(JSON.stringify({ ok: true, isolatedWorkspace: true, immediateCloseSaved: true, mcpReopen: true, rendererIndependentGeneration: true, sandbox: true, boardNodes: 2, screenshot: path.join(output, "electron-smoke.png") }, null, 2));
} catch (error) {
  await writeFile(path.join(output, "electron-smoke-errors.json"), JSON.stringify({ error: String(error), rendererErrors: errors }, null, 2));
  if (electronApp) for (const page of electronApp.windows()) await page.screenshot({ path: path.join(output, "electron-smoke-failure.png") }).catch(() => undefined);
  throw error;
} finally {
  await electronApp?.close().catch(() => undefined);
  provider.closeAllConnections();
  await new Promise((resolve) => provider.close(resolve));
  await rm(userData, { recursive: true, force: true });
}
