import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";
import { chromium } from "playwright";

const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5297";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
let calls = 0;
let hold = false;
let notifyHeld;
const held = new Promise(resolve => { notifyHeld = resolve; });
const provider = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
  request.resume();
  request.on("end", () => {
    calls++;
    if (hold) { notifyHeld(); return; }
    const content = JSON.stringify({ message: "离线助手已读取当前画板。", intent: "chat", goal: "explain", commitment: "advise_only", fields: [] });
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const part of [content.slice(0, 32), content.slice(32)]) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
});
await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
let originalSettings, originalBoardId, boardId;
const ready = () => page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected");
try {
  await page.goto(origin); await ready();
  ({ originalSettings, originalBoardId, boardId } = await page.evaluate(async baseUrl => {
    const api = window.imageWorkbench;
    const originalSettings = await api.getSettings();
    const { lastOpenedBoardId: originalBoardId } = await api.getBoardsState();
    const provider = { id: "refactor-assistant-fixture", name: "助手离线回归", type: "openai-compatible", baseUrl, model: "fixture" };
    await api.saveSettings({ ...originalSettings,
      textProviders: [provider], activeTextProviderId: provider.id, apiKeyByProviderId: { [provider.id]: "offline-test-only" },
      boardAssistantEnabled: true, boardAssistantAgentModeEnabled: false, memoryEnabled: false,
      boardAssistantAwarenessEnabled: false, boardAssistantIntentSuggestionsEnabled: false,
      boardSmartSuggestionsEnabled: false, editSmartSuggestionsEnabled: false, language: "zh-CN", theme: "light"
    });
    for (const key of ["board", "library", "gallery", "edit", "demo-start"]) await api.markOnboardingSeen(`iterlay.onboarding.${key}.v1`, "completed");
    const board = await api.createBoard("重构验收 · 主创作助手");
    await api.setLastOpenedBoard(board.id);
    localStorage.setItem("iterlay.libraryOpen", "0");
    return { originalSettings, originalBoardId, boardId: board.id };
  }, `http://127.0.0.1:${provider.address().port}`));
  await page.reload(); await ready();
  const mode = page.getByRole("switch", { name: "对话规划模式", exact: true });
  await mode.waitFor();
  if (await mode.getAttribute("aria-checked") !== "true") await mode.click();
  const input = page.getByRole("textbox", { name: "对话规划输入", exact: true });
  await input.fill("请只解释当前画板，不要生成。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText("离线助手已读取当前画板。", { exact: true }).waitFor();
  await page.waitForFunction(async boardId => (await window.imageWorkbench.listAssistantConversations({ boardId, surface: "canvas-prompt" })).length > 0, boardId);
  assert.equal(calls, 1, "One conversation turn must submit exactly one text request");
  const conversations = await page.evaluate(boardId => window.imageWorkbench.listAssistantConversations({ boardId, surface: "canvas-prompt" }), boardId);
  assert(conversations.some(record => record.response === "离线助手已读取当前画板。"));
  hold = true;
  await input.fill("等待中的可取消请求");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  let heldTimer;
  try {
    await Promise.race([held, new Promise((_, reject) => { heldTimer = setTimeout(() => reject(new Error("Cancellation fixture was not requested")), 10_000); })]);
  } finally { clearTimeout(heldTimer); }
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page.getByRole("button", { name: "发送", exact: true }).waitFor();
  assert.equal(calls, 2);
  await mode.click();
  await page.locator(".prompt-fusion-direct-editor").waitFor();
  await mode.click();
  await input.waitFor();
  await page.reload(); await ready();
  await page.locator(".react-flow").waitFor();
  await page.getByRole("switch", { name: "对话规划模式", exact: true }).waitFor();
  const expand = page.getByRole("button", { name: "展开创作助手", exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.getByText("离线助手已读取当前画板。", { exact: true }).waitFor();
  const restored = await page.evaluate(boardId => window.imageWorkbench.listAssistantConversations({ boardId, surface: "canvas-prompt" }), boardId);
  assert(restored.some(record => record.response === "离线助手已读取当前画板。"));
  assert.equal(calls, 2, "Reloading history must not submit an unsolicited model request");
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: "output/playwright/refactor-assistant.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, verified: ["real PromptDock turn", "SSE chunks", "persisted conversation", "cancellation", "chat/direct modes", "reload without model resubmission"], providerCalls: calls, rendererErrors: errors }, null, 2));
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await page.evaluate(async ({ originalSettings, originalBoardId, boardId }) => {
    const api = window.imageWorkbench;
    if (!api) return;
    if (originalSettings) await api.saveSettings(originalSettings);
    if (originalBoardId) await api.setLastOpenedBoard(originalBoardId);
    if (boardId) await api.deleteBoard(boardId);
    const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }, { originalSettings, originalBoardId, boardId }).catch(error => console.error("Cleanup:", error.message));
  await browser.close();
  provider.closeAllConnections(); provider.close();
}
