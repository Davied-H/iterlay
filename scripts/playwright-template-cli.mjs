import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const userData = process.env.ITERLAY_BROWSER_DEV_USER_DATA;
if (!userData) throw new Error("Use an isolated pnpm dev workspace and set ITERLAY_BROWSER_DEV_USER_DATA.");
const url = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5180";
if (new URL(url).hostname !== "127.0.0.1") throw new Error("Local development only.");
const run = promisify(execFile);
const cli = async (...args) => JSON.parse((await run(process.execPath, ["cli/dist/main.js", ...args, "--user-data-path", userData, "--json"], { maxBuffer: 1024 * 1024 })).stdout).data;
const image = await readFile("demo-assets/lamp-studio.jpg");
let calls = 0;
const server = createServer((req, res) => {
  req.resume(); req.on("end", () => { calls++; res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] })); });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
const legacy = { id: `custom:legacy-${Date.now()}`, name: "旧模板迁移检查", description: "", prompt: "旧版固定规则", category: "other", mode: "generate", useCase: "other", source: "custom" };
let originalSettings, board, created;
try {
  await context.addInitScript(t => { if (!localStorage.getItem("iterlay.templatesMigrated")) localStorage.setItem("iterlay.customScenes", JSON.stringify([t])); }, legacy);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.workbenchConnection === "connected");
  await page.waitForFunction(() => localStorage.getItem("iterlay.templatesMigrated") === "1");
  assert((await cli("templates", "list")).some(t => t.id === legacy.id));
  created = await cli("templates", "create", "--name", "CLI 可复用模板检查", "--prompt", "米白背景，黑色大标题", "--category", "marketing");
  await page.waitForFunction(id => JSON.parse(localStorage.getItem("iterlay.customScenes") || "[]").some(t => t.id === id), created.id);
  await cli("templates", "update", created.id, "--description", "双端共享检查");
  await page.waitForFunction(id => JSON.parse(localStorage.getItem("iterlay.customScenes") || "[]").find(t => t.id === id)?.description === "双端共享检查", created.id);
  // Exercise the same persistence helper used by the template editor, including unchanged sibling entries.
  await page.evaluate(async id => {
    const library = await import("/src/lib/scene-library.ts");
    library.writeCustomScenes(library.readCustomScenes().map(t => t.id === id ? { ...t, name: "网页更新后的模板" } : t));
    const persistence = await import("/src/lib/template-persistence.ts");
    await persistence.readPersistedTemplates();
  }, created.id);
  assert.equal((await cli("templates", "show", created.id)).name, "网页更新后的模板");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.workbenchConnection === "connected");
  assert.equal((await cli("templates", "show", created.id)).name, "网页更新后的模板");
  originalSettings = await page.evaluate(() => window.imageWorkbench.getSettings());
  await page.evaluate(async baseUrl => {
    const settings = await window.imageWorkbench.getSettings();
    await window.imageWorkbench.saveSettings({ ...settings, memoryEnabled: false, boardAssistantEnabled: false, boardAssistantAwarenessEnabled: false, boardAssistantIntentSuggestionsEnabled: false, editSmartSuggestionsEnabled: false, apiKeyByProviderId: { "template-offline": "offline-test-only" }, activeProviderId: "template-offline", providers: [...settings.providers, { id: "template-offline", name: "Offline template test", type: "openai-compatible", apiMode: "images", baseUrl, generationEndpoint: "/v1/images/generations", model: "fixture", supportsReferenceImages: true }] });
  }, `http://127.0.0.1:${server.address().port}`);
  board = await cli("boards", "create", "--name", "Template CLI smoke");
  const result = await cli("image", "generate", "--board", board.id, "--template", created.id, "--prompt", "春日咖啡海报", "--provider", "template-offline", "--timeout", "30");
  assert.equal(result.status, "succeeded");
  assert.equal(result.job.input.sceneId, created.id);
  assert(result.job.input.prompt.includes("米白背景"));
  assert(result.job.input.prompt.includes("春日咖啡海报"));
  assert.equal(calls, 1);
  console.log("PASS: legacy migration, CLI create/update/read, renderer refresh, UI persistence, reload, offline template generation and provenance.");
} finally {
  if (board) await page.evaluate(id => window.imageWorkbench.deleteBoard(id), board.id).catch(() => {});
  if (originalSettings) await page.evaluate(settings => window.imageWorkbench.saveSettings(settings), originalSettings).catch(() => {});
  await page.evaluate(async ids => {
    const api = window.imageWorkbench; const all = await api.listTemplates();
    await api.syncTemplates(all, all.filter(t => !ids.includes(t.id)));
  }, [legacy.id, created?.id]).catch(() => {});
  await page.evaluate(async () => {
    const sessionId = sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }).catch(() => {});
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
