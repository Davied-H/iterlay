import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "output", "playwright");
const rendererUrl = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5180";
const userData = process.env.ITERLAY_BROWSER_DEV_USER_DATA;
if (!userData) {
  throw new Error("Start pnpm dev with a temporary ITERLAY_BROWSER_DEV_USER_DATA, then pass that same directory to this smoke test.");
}
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(rendererUrl).hostname)) {
  throw new Error("Browser smoke tests require a local development server.");
}
// The test only connects to an existing service. Its owner stops it with Ctrl+C.
const bridgeInfo = JSON.parse(await readFile(path.join(userData, "browser-dev-bridge.json"), "utf8"));
assert(Number.isInteger(bridgeInfo.pid), "The supplied directory must belong to an active browser development backend.");
process.kill(bridgeInfo.pid, 0);
await mkdir(output, { recursive: true });
const fixture = await readFile(path.join(projectRoot, "demo-assets", "lamp-studio.jpg"));
let providerCalls = 0;
const providerRequests = [];
const provider = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/images/generations") { response.writeHead(404).end(); return; }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      providerRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      providerCalls += 1;
      setTimeout(() => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        data: [{ b64_json: fixture.toString("base64") }]
      })), 500);
    } catch { response.writeHead(400).end(); }
  });
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerAddress = provider.address();
const providerConfig = {
  id: "browser-smoke-offline", name: "Browser smoke offline fixture", type: "openai-compatible", apiMode: "images",
  baseUrl: `http://127.0.0.1:${providerAddress.port}`, generationEndpoint: "/v1/images/generations",
  referenceEndpoint: "/v1/images/edits", model: "fixture", supportsReferenceImages: true
};
const errors = [];
let browser;
let page;
let originalSettings;
let originalBoardId;
let testBoardId;
let settingsChanged = false;
async function workspace(method, args = {}) {
  const info = JSON.parse(await readFile(path.join(userData, "local-api.json"), "utf8"));
  const response = await fetch(`http://127.0.0.1:${info.port}/call`, {
    method: "POST", headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
    body: JSON.stringify({ method, args }), signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json();
  assert(response.ok, body.error || "Local workspace operation failed.");
  return body.result;
}
async function ready() {
  await page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected", { timeout: 60_000 });
}
try {
  const bundledBrowserAvailable = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(bundledBrowserAvailable ? {} : { channel: "chrome" }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  // The fixture provider runs in Electron. Browser requests stay on the local dev origin.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return [new URL(rendererUrl).origin, "null"].includes(url.origin) ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /uncaught|preload|not defined|Content Security Policy|renderer crashed|TypeError|ReferenceError|SyntaxError/iu.test(message.text())) errors.push(message.text()); });
  await page.goto(rendererUrl);
  await ready();
  originalSettings = await page.evaluate(() => window.imageWorkbench.getSettings());
  originalBoardId = (await page.evaluate(() => window.imageWorkbench.getBoardsState())).lastOpenedBoardId;
  assert(originalSettings && Array.isArray(originalSettings.providers));
  settingsChanged = true;
  await page.evaluate(async (config) => {
    const settings = await window.imageWorkbench.getSettings();
    await window.imageWorkbench.saveSettings({ ...settings,
      providers: [config, ...settings.providers.filter((provider) => provider.id !== config.id)], activeProviderId: config.id,
      memoryEnabled: false, boardAssistantEnabled: false, boardAssistantAwarenessEnabled: false,
      boardAssistantIntentSuggestionsEnabled: false, editSmartSuggestionsEnabled: false,
      theme: "light", language: "zh-CN", apiKeyByProviderId: { [config.id]: "offline-test-only" }
    });
    for (const key of ["board", "library", "gallery", "edit", "demo-start"]) {
      await window.imageWorkbench.markOnboardingSeen(`iterlay.onboarding.${key}.v1`, "completed");
    }
  }, providerConfig);
  const savedSettings = await page.evaluate(() => window.imageWorkbench.getSettings());
  assert.equal(savedSettings.activeProviderId, providerConfig.id);
  assert.equal(savedSettings.providerKeyStatus[providerConfig.id], true);
  // Deleting a shared image connection must detach video settings atomically,
  // retaining its effective URL and key without returning the secret to the UI.
  const detachedVideo = await page.evaluate(async (baseUrl) => {
    const api = window.imageWorkbench;
    const settings = await api.getSettings();
    const sourceId = "browser-smoke-shared-image";
    const videoId = "browser-smoke-shared-video";
    await api.saveSettings({ ...settings,
      providers: [...settings.providers, { id: sourceId, name: "Shared offline image", type: "fal",
        baseUrl, generationEndpoint: "", model: "offline-image", supportsReferenceImages: true }],
      videoProviders: [...settings.videoProviders, { id: videoId, name: "Shared offline video", type: "fal",
        baseUrl: "http://127.0.0.1:1", connectionProviderId: sourceId, model: "offline-video" }],
      apiKeyByProviderId: { [sourceId]: "offline-test-only" }
    });
    const linked = await api.getSettings();
    if (!linked.providerKeyStatus[videoId]) throw new Error("Shared video credentials were not available.");
    await api.saveSettings({ ...linked,
      providers: linked.providers.filter((item) => item.id !== sourceId),
      videoProviders: linked.videoProviders.map((item) => item.id === videoId
        ? { ...item, connectionProviderId: undefined } : item)
    });
    const detached = await api.getSettings();
    return { provider: detached.videoProviders.find((item) => item.id === videoId), hasKey: detached.providerKeyStatus[videoId] };
  }, providerConfig.baseUrl);
  assert.equal(detachedVideo.provider.connectionProviderId, undefined);
  assert.equal(detachedVideo.provider.baseUrl, providerConfig.baseUrl);
  assert.equal(detachedVideo.provider.model, "offline-video");
  assert.equal(detachedVideo.hasKey, true);
  const board = await page.evaluate(() => window.imageWorkbench.createBoard("Browser smoke isolated board"));
  testBoardId = board.id;
  const imported = await page.evaluate((data) => window.imageWorkbench.importUploadedImage(data), `data:image/jpeg;base64,${fixture.toString("base64")}`);
  const importedNodeId = "browser-smoke-import";
  const generationNodeId = "browser-smoke-generation";
  await page.evaluate(async ({ boardId, importedNodeId, generationNodeId, imagePath, providerId }) => {
    await window.imageWorkbench.appendBoardNodes(boardId, [
      { id: importedNodeId, imagePath, jobId: "browser-smoke-import", source: "upload" },
      { id: generationNodeId, type: "generation", prompt: "Offline browser smoke fixture", providerId, model: "fixture", size: "1024x1024", count: 1 }
    ]);
    const current = await window.imageWorkbench.getBoard(boardId);
    await window.imageWorkbench.saveBoard({ id: boardId, expectedRevision: current.revision,
      name: "Browser smoke persisted board", nodes: current.nodes.map((node) => node.id === importedNodeId ? { ...node, x: 140, y: 100 } : node),
      viewport: { x: 20, y: 10, zoom: 0.8 }
    });
    await window.imageWorkbench.setLastOpenedBoard(boardId);
  }, { boardId: board.id, importedNodeId, generationNodeId, imagePath: imported.path, providerId: providerConfig.id });
  const savedBoard = await page.evaluate((id) => window.imageWorkbench.getBoard(id), board.id);
  assert.equal(savedBoard.nodes.length, 2);
  assert.equal(savedBoard.nodes.find((node) => node.id === importedNodeId).x, 140);
  const assetUrl = savedBoard.images[imported.path];
  assert.match(assetUrl, /^\/__iterlay_dev\/assets\//u);
  const media = await page.evaluate(async (url) => {
    const full = await fetch(url);
    const fullBytes = new Uint8Array(await full.arrayBuffer());
    const range = await fetch(url, { headers: { range: "bytes=0-63" } });
    const bytes = new Uint8Array(await range.arrayBuffer());
    const image = new Image();
    image.src = url;
    await image.decode();
    return { status: range.status, range: range.headers.get("content-range"), type: full.headers.get("content-type"),
      bytes: [...bytes], prefix: [...fullBytes.slice(0, 64)], width: image.naturalWidth, height: image.naturalHeight };
  }, assetUrl);
  assert.equal(media.status, 206);
  assert.match(media.range, /^bytes 0-63\/\d+$/u);
  assert.equal(media.bytes.length, 64);
  assert.deepEqual(media.bytes, media.prefix);
  assert(media.width > 0 && media.height > 0);
  await page.reload();
  await ready();
  const restored = await page.evaluate((id) => window.imageWorkbench.getBoard(id), board.id);
  assert.equal(restored.name, "Browser smoke persisted board");
  assert.equal(restored.nodes.find((node) => node.id === importedNodeId).x, 140);
  assert.equal(restored.viewport.zoom, 0.8);
  await page.evaluate(() => {
    window.__browserSmokeEvents = [];
    window.imageWorkbench.onWorkbenchEvent((event) => window.__browserSmokeEvents.push(event));
  });
  // The bridge becomes ready before React mounts its board event listener.
  await page.locator(".react-flow").waitFor({ state: "visible", timeout: 30_000 });
  await workspace("open_board", { boardId: board.id });
  await page.waitForFunction((id) => window.__browserSmokeEvents.some((event) => event.type === "open-board" && event.boardId === id), board.id);
  await page.waitForFunction((id) => {
    const fatal = document.querySelector("[data-root-error]");
    if (fatal) throw new Error(fatal.textContent || "Workspace crashed");
    return document.querySelector(`.react-flow__node[data-id="${id}"]`);
  }, importedNodeId, { timeout: 30_000 });
  const generated = await page.evaluate(({ boardId, providerId, generationNodeId }) => window.imageWorkbench.generateImage({
    workflowMode: "generate", prompt: "Offline browser smoke fixture", model: "fixture", size: "1024x1024", n: 1,
    referenceImages: [], providerId, boardId, generationNodeId
  }), { boardId: board.id, providerId: providerConfig.id, generationNodeId });
  assert.equal(generated.job.status, "succeeded", generated.job.error);
  assert.equal(generated.images.length, 1);
  assert.match(generated.images[0].dataUrl, /^\/__iterlay_dev\/assets\//u);
  assert.equal(providerCalls, 1);
  assert.equal(providerRequests[0].model, "fixture");
  const generatedBoard = await page.evaluate((id) => window.imageWorkbench.getBoard(id), board.id);
  assert(generatedBoard.nodes.some((node) => node.imagePath === generated.images[0].path), "The backend must persist the generated image independently of the renderer.");
  assert.equal(generatedBoard.nodes.find((node) => node.id === generationNodeId).status, "succeeded");
  const history = await page.evaluate((id) => window.imageWorkbench.listHistory(id), board.id);
  assert(history.some((job) => job.id === generated.job.id && job.status === "succeeded"));
  // Real CLI subprocess uses the App's saved offline provider, task service, and assets.
  const cliOutputPath = path.join(output, "cli-smoke-image.png");
  const cli = await promisify(execFile)(process.execPath, [path.join(projectRoot, "cli/dist/main.js"),
    "image", "generate", "--prompt", "CLI offline smoke fixture", "--board", board.id,
    "--user-data-path", userData, "--out", cliOutputPath, "--overwrite", "--json"], { timeout: 30000 });
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.ok, true);
  assert.equal(cliResult.data.status, "succeeded");
  assert.equal(cliResult.data.job.providerId, providerConfig.id);
  assert.equal(providerCalls, 2);
  assert.deepEqual(await readFile(cliOutputPath), fixture);
  const cliBoard = await page.evaluate((id) => window.imageWorkbench.getBoard(id), board.id);
  assert.equal(cliBoard.nodes.filter((node) => node.imagePath === cliResult.data.images[0].path).length, 1, "CLI results must be appended exactly once");
  const secondPage = await context.newPage();
  await secondPage.goto(rendererUrl);
  await secondPage.locator(".boot-error").waitFor({ state: "visible" });
  assert.match(await secondPage.locator(".boot-error").textContent(), /已有网页/u);
  assert.equal(await secondPage.evaluate(() => Boolean(window.imageWorkbench)), false);
  await secondPage.close();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.workbenchConnection), "connected");
  assert.equal(errors.length, 0, errors.join("\n"));
  await page.screenshot({ path: path.join(output, "browser-smoke.png") });
  const report = { ok: true, browser: "chromium", isolatedWorkspace: true, settingsRoundTrip: true,
    importAndSave: true, reloadPersistence: true, sharedConnectionDeletion: true, realOfflineGeneration: true, cliGeneration: true, cliProviderReused: true, providerCalls,
    imageHttpRange: true, workbenchEvents: true, secondTabRejected: true, rendererErrors: errors,
    serviceManagedExternally: true, screenshot: path.join(output, "browser-smoke.png") };
  await writeFile(path.join(output, "browser-smoke.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await writeFile(path.join(output, "browser-smoke-errors.json"), JSON.stringify({ error: String(error), rendererErrors: errors }, null, 2));
  await page?.screenshot({ path: path.join(output, "browser-smoke-failure.png") }).catch(() => undefined);
  throw error;
} finally {
  if (page && !page.isClosed()) {
    try {
      const fallbackBoardId = originalBoardId || (await page.evaluate(() => window.imageWorkbench.listBoards())).find((board) => board.id !== testBoardId)?.id;
      if (fallbackBoardId) await workspace("open_board", { boardId: fallbackBoardId });
      if (testBoardId) await page.evaluate(async (id) => {
        await window.imageWorkbench.deleteBoard(id);
        await window.imageWorkbench.permanentlyDeleteBoard(id);
      }, testBoardId);
      if (settingsChanged) await page.evaluate(({ settings, fixtureId }) => window.imageWorkbench.saveSettings({
        ...settings, apiKeyByProviderId: { [fixtureId]: "" }
      }), { settings: originalSettings, fixtureId: providerConfig.id });
      if (originalBoardId) await page.evaluate((id) => window.imageWorkbench.setLastOpenedBoard(id), originalBoardId);
    } catch (error) {
      console.error(`Browser smoke cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (page && !page.isClosed()) {
    try {
      await page.evaluate(async () => {
        const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
        if (!sessionId) return;
        const response = await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }), signal: AbortSignal.timeout(5_000) });
        if (!response.ok) throw new Error("Failed to release the smoke test's editor session.");
      });
    } catch (error) {
      console.error(`Browser smoke disconnect failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
  await browser?.close();
  provider.closeAllConnections();
  await new Promise((resolve) => provider.close(resolve));
}
