import assert from "node:assert/strict";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "output", "playwright");
const rendererUrl = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5180";
const userData = process.env.ITERLAY_BROWSER_DEV_USER_DATA;
assert(userData, "Pass the temporary ITERLAY_BROWSER_DEV_USER_DATA of an already-running pnpm dev service.");
const origin = new URL(rendererUrl).origin;
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(rendererUrl).hostname), "Restart verification requires a local development server.");
const restartTarget = path.join(projectRoot, "dist-electron", "electron", "dev-browser-bridge.js");
assert((await stat(restartTarget)).isFile(), "Compile the existing development backend before running this script.");
const originalCompiledBridge = await readFile(restartTarget);
const bridgePath = path.join(userData, "browser-dev-bridge.json");
const initialBridge = JSON.parse(await readFile(bridgePath, "utf8"));
assert(Number.isInteger(initialBridge.pid), "The supplied workspace must have an active browser development backend.");
process.kill(initialBridge.pid, 0);
await mkdir(output, { recursive: true });
const fixture = await readFile(path.join(projectRoot, "demo-assets", "lamp-studio.jpg"));
const nodeId = `browser-restart-${Date.now()}`;
const nodeSelector = `.react-flow__node[data-id="${nodeId}"]`;
const probePrefix = "__ITERLAY_BROWSER_RESTART__";
const errors = [];
const probes = [];
const dialogs = [];
const onboardingKeys = ["board", "library", "gallery", "edit", "demo-start"].map((key) => `iterlay.onboarding.${key}.v1`);
const report = { ok: false, serviceManagedExternally: true, restartTrigger: restartTarget, rendererErrors: errors, saveEvents: probes, dialogs };
let browser;
let page;
let sessionId;
let originalBoardId;
let originalSettings;
let originalOnboarding;
let testBoardId;
let imagePath;
let settingsChanged = false;
let onboardingChanged = false;
let compiledBridgeChanged = false;
let failure;

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

async function rpc(channel, args = []) {
  const response = await fetch(`${origin}/__iterlay_dev/invoke`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, channel, args }), signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json();
  assert(response.ok, body.error || "Browser cleanup operation failed.");
  return body.result;
}

async function ready(timeout = 60_000, retryPreviousTestLease = false) {
  const deadline = Date.now() + timeout;
  const leaseDeadline = Math.min(deadline, Date.now() + 40_000);
  while (Date.now() < deadline) {
    await page.waitForFunction(() => (window.imageWorkbench
      && document.documentElement.dataset.workbenchConnection === "connected") || document.querySelector(".boot-error"),
    undefined, { timeout: Math.max(1, deadline - Date.now()) });
    const bootstrapError = await page.evaluate(() => document.querySelector(".boot-error")?.textContent ?? null);
    if (!bootstrapError) {
      sessionId = await page.evaluate(() => window.sessionStorage.getItem("iterlay:browser-debug-session"));
      return;
    }
    // A prior headless process may have closed without pagehide. Only automation
    // startup retries that preserved crash-recovery lease; an active editor wins.
    if (!retryPreviousTestLease || !/已有网页/u.test(bootstrapError) || Date.now() >= leaseDeadline) throw new Error(bootstrapError);
    await delay(Math.min(2_000, leaseDeadline - Date.now()));
    await page.reload();
  }
  throw new Error("The browser development page did not become ready before the timeout.");
}

async function waitForNewBackend(previousPid, stableMs = 0) {
  const deadline = Date.now() + 60_000;
  let candidatePid;
  let candidateSince = 0;
  while (Date.now() < deadline) {
    try {
      const info = JSON.parse(await readFile(bridgePath, "utf8"));
      if (Number.isInteger(info.pid) && info.pid !== previousPid) {
        process.kill(info.pid, 0);
        if (candidatePid !== info.pid) {
          candidatePid = info.pid;
          candidateSince = Date.now();
        }
        if (Date.now() - candidateSince >= stableMs) return info;
      }
    } catch { candidatePid = undefined; /* The launcher atomically replaces this file during a restart. */ }
    await delay(150);
  }
  throw new Error("The existing backend watcher did not finish restarting within 60 seconds.");
}

async function readPersistedNode() {
  const board = JSON.parse(await readFile(path.join(userData, "workspace", "boards", `${testBoardId}.json`), "utf8"));
  const node = board.nodes.find((item) => item.id === nodeId);
  assert(node, "The temporary image node must remain in the persisted board.");
  return { board, node };
}

try {
  const bundledBrowserAvailable = await access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(bundledBrowserAvailable ? {} : { channel: "chrome" }) });
  report.browser = bundledBrowserAvailable ? "bundled chromium" : "local Chrome";
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  await context.route("**/*", (route) => [origin, "null"].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith(probePrefix)) {
      try { probes.push(JSON.parse(text.slice(probePrefix.length))); } catch { errors.push("Invalid restart probe output."); }
    } else if (message.type() === "error" && /uncaught|not defined|Content Security Policy/iu.test(text)) errors.push(text);
  });
  await page.goto(rendererUrl);
  await ready(60_000, true);
  originalSettings = await page.evaluate(() => window.imageWorkbench.getSettings());
  originalBoardId = (await page.evaluate(() => window.imageWorkbench.getBoardsState())).lastOpenedBoardId;
  originalOnboarding = await page.evaluate(() => window.imageWorkbench.getOnboardingState());
  settingsChanged = true;
  onboardingChanged = true;
  await page.evaluate(async (keys) => {
    const settings = await window.imageWorkbench.getSettings();
    await window.imageWorkbench.saveSettings({ ...settings, language: "zh-CN", theme: "light", memoryEnabled: false,
      boardAssistantEnabled: false, boardAssistantAwarenessEnabled: false, boardAssistantIntentSuggestionsEnabled: false,
      editSmartSuggestionsEnabled: false });
    for (const key of keys) await window.imageWorkbench.markOnboardingSeen(key, "completed");
  }, onboardingKeys);
  await page.reload();
  await ready();
  const board = await page.evaluate(() => window.imageWorkbench.createBoard("Browser restart QA — temporary"));
  testBoardId = board.id;
  report.testBoardId = testBoardId;
  const imported = await page.evaluate((data) => window.imageWorkbench.importUploadedImage(data), `data:image/jpeg;base64,${fixture.toString("base64")}`);
  imagePath = imported.path;
  await page.evaluate(async ({ boardId, nodeId, imagePath }) => {
    await window.imageWorkbench.appendBoardNodes(boardId, [{ id: nodeId, imagePath, jobId: "browser-restart-import", source: "upload" }]);
    await window.imageWorkbench.setLastOpenedBoard(boardId);
  }, { boardId: testBoardId, nodeId, imagePath });
  await workspace("open_board", { boardId: testBoardId });
  const node = page.locator(nodeSelector);
  await node.waitFor({ state: "visible", timeout: 30_000 });
  await workspace("fit_board_view", { boardId: testBoardId });
  await node.locator('[data-image-node][data-selected="true"]').waitFor({ state: "visible", timeout: 15_000 });
  // fitView animates for 500 ms; measure the zoom only after that movement ends.
  await delay(600);
  await page.waitForFunction(() => document.documentElement.dataset.boardSaveState === "saved", undefined, { timeout: 15_000 });
  await page.waitForFunction((selector) => [...document.querySelectorAll(`${selector} img`)].some((image) => image.complete && image.naturalWidth > 0), nodeSelector);
  const before = await readPersistedNode();
  const oldAssetUrl = await page.evaluate(async ({ boardId, imagePath }) => (await window.imageWorkbench.getBoard(boardId)).images[imagePath], { boardId: testBoardId, imagePath });
  const zoom = await page.locator(".react-flow__viewport").evaluate((element) => new window.DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  assert(zoom > 0, "The fitted board must have a valid zoom.");
  const bounds = await node.boundingBox();
  assert(bounds && bounds.width > 0 && bounds.height > 0);
  await page.evaluate((prefix) => {
    const api = window.imageWorkbench;
    const log = (value) => console.log(prefix + JSON.stringify({ ...value, at: Date.now(), state: document.documentElement.dataset.boardSaveState }));
    api.onWindowSaveRequest(({ requestId }) => log({ type: "save-request", requestId }));
    const complete = api.completeWindowSave.bind(api);
    api.completeWindowSave = (result) => { log({ type: "save-result", ...result }); complete(result); };
  }, probePrefix);
  const screenDelta = { x: 120, y: 80 };
  const sessionBeforeDrag = sessionId;
  const backendBeforeDrag = JSON.parse(await readFile(bridgePath, "utf8"));
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + screenDelta.x, bounds.y + bounds.height / 2 + screenDelta.y, { steps: 6 });
  await page.mouse.up();
  const dragEndedAt = Date.now();
  // React Flow consumes an initial pointer threshold before dragging. Read the
  // rendered position without calling a save API so the persistence assertion
  // checks the user's actual last position rather than guessed pointer deltas.
  const expected = await node.evaluate((element) => {
    const transform = new window.DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: transform.e, y: transform.f };
  });
  assert(Math.abs(expected.x - before.node.x) > 1 || Math.abs(expected.y - before.node.y) > 1,
    "The real mouse drag must move the image before triggering restart.");
  const reloaded = page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame(), timeout: 60_000 });
  const recovery = Promise.all([waitForNewBackend(backendBeforeDrag.pid), reloaded]);
  void recovery.catch(() => undefined);
  // Change compiled output only: the launcher ignores unchanged file contents.
  // The original bytes are restored after browser cleanup and closure below.
  compiledBridgeChanged = true;
  await writeFile(restartTarget, Buffer.concat([originalCompiledBridge,
    Buffer.from(`\n// browser-restart-smoke:${process.pid}:${Date.now()}\n`)]));
  report.triggerDelayMs = Date.now() - dragEndedAt;
  const [newBackend] = await recovery;
  report.oldBackendPid = backendBeforeDrag.pid;
  report.newBackendPid = newBackend.pid;
  await ready();
  await page.locator(nodeSelector).waitFor({ state: "visible", timeout: 30_000 });
  const persisted = await readPersistedNode();
  assert(Math.abs(persisted.node.x - expected.x) <= 2 && Math.abs(persisted.node.y - expected.y) <= 2,
    `The final mouse drag must survive restart: expected (${expected.x}, ${expected.y}), got (${persisted.node.x}, ${persisted.node.y}).`);
  const request = probes.find((probe) => probe.type === "save-request");
  assert(request, "The old backend must ask the browser to flush before exiting.");
  assert(probes.some((probe) => probe.type === "save-result" && probe.requestId === request.requestId && probe.ok), "The browser must acknowledge a successful flush before restart.");
  assert.notEqual(sessionId, sessionBeforeDrag, "The browser must establish a new backend session after automatic reload.");
  const restored = await page.evaluate((id) => window.imageWorkbench.getBoard(id), testBoardId);
  const newAssetUrl = restored.images[imagePath];
  assert.match(newAssetUrl, /^\/__iterlay_dev\/assets\//u);
  assert.notEqual(newAssetUrl, oldAssetUrl, "Reload must replace resource URLs signed by the old backend.");
  await page.waitForFunction((selector) => [...document.querySelectorAll(`${selector} img`)].some((image) => image.complete && image.naturalWidth > 0), nodeSelector);
  const media = await page.evaluate(async (url) => {
    const image = new Image(); image.src = url; await image.decode();
    const response = await fetch(url, { headers: { range: "bytes=0-63" } });
    return { width: image.naturalWidth, height: image.naturalHeight, status: response.status, range: response.headers.get("content-range") };
  }, newAssetUrl);
  assert(media.width > 0 && media.height > 0);
  assert.equal(media.status, 206);
  assert.match(media.range, /^bytes 0-63\/\d+$/u);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(dialogs.length, 0, "A successful shutdown flush must not leave unsaved-change dialogs during automatic reload.");
  await page.screenshot({ path: path.join(output, "browser-restart.png") });
  Object.assign(report, { oldBackendPid: backendBeforeDrag.pid, newBackendPid: newBackend.pid,
    gracefulExitFlush: true, automaticReload: true, newSession: true, persistedDrag: true,
    positionBefore: { x: before.node.x, y: before.node.y }, expectedPosition: expected,
    persistedPosition: { x: persisted.node.x, y: persisted.node.y }, signedAssetUrlRenewed: true,
    imageLoadedAfterRestart: true, imageHttpRange: true, screenshot: path.join(output, "browser-restart.png") });
} catch (error) {
  failure = error;
  report.error = String(error);
  await page?.screenshot({ path: path.join(output, "browser-restart-failure.png") }).catch(() => undefined);
} finally {
  try {
    if (page && !page.isClosed()) {
      await ready(15_000);
      const fallback = originalBoardId || (await rpc("boards:list")).find((board) => board.id !== testBoardId)?.id;
      if (fallback) {
        await workspace("open_board", { boardId: fallback });
        await page.locator(nodeSelector).waitFor({ state: "hidden", timeout: 15_000 });
        await rpc("boards:setLastOpened", [fallback]);
      }
      if (testBoardId) {
        await rpc("boards:delete", [testBoardId]);
        await rpc("boards:trash:delete", [testBoardId]);
      }
      if (imagePath) {
        const deleted = await rpc("asset:delete", [imagePath]);
        assert(deleted.ok || !await access(imagePath).then(() => true, () => false), deleted.message || "The temporary image could not be removed.");
      }
      if (settingsChanged) await rpc("settings:save", [originalSettings]);
      if (onboardingChanged) for (const key of onboardingKeys) {
        if (originalOnboarding[key]) await rpc("onboarding:mark", [key, originalOnboarding[key].status]);
        else await rpc("onboarding:clear", [key]);
      }
      report.cleanup = { originalBoardRestored: true, temporaryBoardDeleted: true, temporaryImageDeleted: true, settingsRestored: true };
    }
  } catch (error) {
    report.cleanupError = String(error);
    failure ||= error;
  }
  try {
    if (page && !page.isClosed()) await page.evaluate(async () => {
      const currentSession = window.sessionStorage.getItem("iterlay:browser-debug-session");
      if (!currentSession) return;
      const response = await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: currentSession }), signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error("Failed to release the restart test's editor session.");
    });
    report.editorSessionReleased = true;
  } catch (error) { report.disconnectError = String(error); failure ||= error; }
  try { await browser?.close(); }
  catch (error) { report.browserCloseError = String(error); failure ||= error; }
  if (compiledBridgeChanged) {
    try {
      let beforeRestorePid = report.newBackendPid || initialBridge.pid;
      try { beforeRestorePid = JSON.parse(await readFile(bridgePath, "utf8")).pid; }
      catch { /* Restoring the original bytes must also work while the backend is restarting. */ }
      await writeFile(restartTarget, originalCompiledBridge);
      compiledBridgeChanged = false;
      report.compiledOutputRestored = true;
      const stableBackend = await waitForNewBackend(beforeRestorePid, 1_500);
      report.backendStableAfterRestore = true;
      report.finalBackendPid = stableBackend.pid;
    } catch (error) {
      report.restoreError = String(error);
      failure ||= error;
    }
  }
  report.ok = !failure;
  await writeFile(path.join(output, "browser-restart.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (failure) throw failure;
