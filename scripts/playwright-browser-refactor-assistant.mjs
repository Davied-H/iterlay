import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";
import { chromium } from "playwright";

const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5297";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
let calls = 0;
let fixtureMode = "chat";
let hold = false;
let notifyHeld;
const held = new Promise(resolve => { notifyHeld = resolve; });
const provider = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
  request.resume();
  request.on("end", () => {
    calls++;
    if (hold) { notifyHeld(); return; }
    if (fixtureMode === "error") { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: { message: "离线测试：暂时无法处理请求" } })); return; }
    const content = JSON.stringify(fixtureMode === "questions" ? {
      message: "分四步确认本次创作需求。", intent: "creative", commitment: "prepare_only", fields: [],
      interaction: { type: "form", title: "确认创作需求", fields: [
        { id: "style", label: "视觉风格", type: "select", required: true, options: [{ label: "自然质感", value: "natural" }, { label: "戏剧光影", value: "dramatic" }] },
        { id: "channels", label: "投放渠道", type: "select", multiple: true, required: true, allowSupplement: false, options: [{ label: "社交媒体", value: "social" }, { label: "线下海报", value: "poster" }] },
        { id: "title", label: "海报标题", type: "text", required: true },
        { id: "notes", label: "其他要求", type: "textarea" }
      ] }
    } : fixtureMode === "form" ? {
      message: "先一起明确品牌的视觉方向。", intent: "creative", commitment: "prepare_only", fields: [],
      interaction: { type: "form", title: "确认视觉风格", fields: [{ id: "style", label: "画面风格", type: "select", required: true, options: [{ label: "自然质感", value: "natural" }, { label: "戏剧光影", value: "dramatic" }] }] }
    } : fixtureMode === "confirm" ? {
      message: "方案已整理好，保持自然光和简洁构图。", intent: "direct", commitment: "prepare_only", fields: [{ label: "提示词", value: "自然光下的咖啡器物，简洁构图与克制色彩" }],
      interaction: { type: "confirm", title: "应用创作方案？", confirmLabel: "应用方案", cancelLabel: "继续讨论" }
    } : { message: "离线助手已读取当前画板。", intent: "chat", goal: "explain", commitment: "advise_only", fields: [] });
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
    localStorage.setItem("iterlay:agent-hint:v1:cli", "dismissed");
    localStorage.removeItem("iterlay.assistantDockLayout");
    localStorage.removeItem("iterlay.assistantPanelSize");
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
  assert.equal(await page.locator(".assistant-chat").count(), 1);
  assert.equal(await page.locator(".assistant-chat-header img").count(), 0);
  await page.getByRole("button", { name: "查看对话历史", exact: true }).click();
  await page.locator(".assistant-chat-history").waitFor();
  assert.equal(await page.locator(".prompt-fusion-composer").isVisible(), false);
  await page.screenshot({ path: "output/playwright/board-chat-history.png" });
  await page.locator(".assistant-chat-history-list > button").first().click();
  await page.locator(".assistant-chat .create-chat-response").getByText("离线助手已读取当前画板。", { exact: true }).waitFor();
  assert.equal(calls, 2);
  await page.setViewportSize({ width: 1100, height: 760 });
  let box = await page.locator(".prompt-fusion").boundingBox();
  const resize = await page.locator('[data-assistant-resize-handle][data-corner="se"]').boundingBox();
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down(); await page.mouse.move(resize.x - 165, resize.y, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector(".prompt-fusion").getBoundingClientRect().width < 430);
  const overflow = await page.locator(".prompt-fusion").evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  assert.equal(overflow, false);
  await page.screenshot({ path: "output/playwright/board-chat-narrow.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  box = await page.locator(".assistant-chat-header").boundingBox();
  await page.mouse.move(box.x + 55, box.y + 22); await page.mouse.down();
  await page.mouse.move(35, 130, { steps: 16 }); await page.mouse.up();
  await page.locator('.prompt-fusion[data-assistant-dock-side="left"]').waitFor();
  const dockHandle = page.getByRole("button", { name: "调整助手侧栏宽度", exact: true });
  const beforeWidth = (await page.locator(".prompt-fusion").boundingBox()).width;
  await dockHandle.focus(); await dockHandle.press("ArrowRight");
  await page.waitForFunction((before) => document.querySelector(".prompt-fusion").getBoundingClientRect().width !== before, beforeWidth);
  await dockHandle.evaluate((node) => node.blur());
  await page.waitForFunction(() => Math.abs(document.querySelector(".prompt-fusion").getBoundingClientRect().bottom - window.innerHeight) < 2);
  await page.screenshot({ path: "output/playwright/board-chat-docked-light.png" });
  await page.evaluate(() => window.imageWorkbench.updateSettings({ theme: "dark" }));
  await page.reload(); await ready();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.locator('.prompt-fusion[data-assistant-dock-side="left"]').waitFor();
  await page.locator(".assistant-chat .create-chat-response").getByText("离线助手已读取当前画板。", { exact: true }).waitFor();
  await page.waitForFunction(() => Math.abs(document.querySelector(".prompt-fusion").getBoundingClientRect().bottom - window.innerHeight) < 2);
  await page.screenshot({ path: "output/playwright/board-chat-dark.png" });
  hold = false; fixtureMode = "form";
  await page.getByRole("button", { name: "开始新会话", exact: true }).click();
  await input.fill("我在考虑咖啡品牌的视觉方向");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("heading", { name: "确认视觉风格", exact: true }).waitFor();
  assert.equal(await page.locator(".prompt-fusion-original").isVisible(), false);
  assert.equal(await page.locator(".assistant-chat .ct-question").count(), 0);
  await page.locator(".prompt-fusion-replacement .ct-question").waitFor();
  assert.equal(await page.locator(".assistant-chat [data-assistant-message]").count(), 2, "The welcome state must disappear when the new conversation starts");
  await page.getByRole("radio", { name: "自然质感", exact: true }).check();
  await page.getByRole("textbox", { name: "补充说明：画面风格", exact: true }).fill("适合清晨自然光");
  assert.equal(await page.getByRole("button", { name: "继续", exact: true }).isEnabled(), true);
  await page.screenshot({ path: "output/playwright/board-chat-question.png" });
  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForFunction(() => {
    const card = document.querySelector(".prompt-fusion-replacement");
    const dock = document.querySelector(".prompt-fusion");
    return card && dock && card.getBoundingClientRect().bottom <= window.innerHeight &&
      Math.abs(card.getBoundingClientRect().bottom - dock.getBoundingClientRect().bottom) < 30;
  });
  assert.equal(await page.locator(".prompt-fusion-replacement").evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
  await page.screenshot({ path: "output/playwright/board-chat-question-bottom.png", animations: "disabled" });
  await page.getByRole("button", { name: "用文字回答", exact: true }).click();
  await input.waitFor({ state: "visible" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  fixtureMode = "questions";
  await page.getByRole("button", { name: "开始新会话", exact: true }).click();
  await input.fill("请分步确认创作需求");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const questionnaire = page.locator(".prompt-fusion-replacement .ct-question");
  await questionnaire.getByRole("heading", { name: "确认创作需求", exact: true }).waitFor();
  await questionnaire.getByRole("radio", { name: "自然质感", exact: true }).check();
  await questionnaire.getByRole("textbox", { name: "补充说明：视觉风格", exact: true }).fill("使用纸张肌理");
  await questionnaire.getByRole("button", { name: "下一题", exact: true }).click();
  await questionnaire.getByRole("checkbox", { name: "社交媒体", exact: true }).check();
  await questionnaire.getByRole("checkbox", { name: "线下海报", exact: true }).check();
  assert.equal(await questionnaire.getByRole("textbox").count(), 0);
  await questionnaire.getByRole("button", { name: "上一题", exact: true }).click();
  assert.equal(await questionnaire.getByRole("radio", { name: "自然质感", exact: true }).isChecked(), true);
  assert.equal(await questionnaire.getByRole("textbox", { name: "补充说明：视觉风格", exact: true }).inputValue(), "使用纸张肌理");
  await questionnaire.getByRole("button", { name: "下一题", exact: true }).click();
  assert.equal(await questionnaire.getByRole("checkbox", { checked: true }).count(), 2);
  await page.setViewportSize({ width: 900, height: 620 });
  await page.screenshot({ path: "output/playwright/questionnaire-multiple-narrow.png", animations: "disabled" });
  assert.equal(await questionnaire.evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
  await questionnaire.getByRole("button", { name: "下一题", exact: true }).click();
  await questionnaire.getByRole("textbox", { name: "海报标题", exact: true }).fill("晨间咖啡");
  const beforeSubmit = calls;
  await questionnaire.getByRole("textbox", { name: "海报标题", exact: true }).press("Enter");
  assert.equal(calls, beforeSubmit, "Moving between questions must not submit a model request");
  await questionnaire.getByRole("textbox", { name: "其他要求", exact: true }).fill("保留大面积留白");
  await page.screenshot({ path: "output/playwright/questionnaire-text-narrow.png", animations: "disabled" });
  fixtureMode = "chat";
  await questionnaire.getByRole("button", { name: "提交回答", exact: true }).click();
  await input.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelectorAll(".assistant-chat [data-assistant-activity]").length === 0);
  assert.equal(calls, beforeSubmit + 1, "All answers must be submitted together exactly once");
  await page.setViewportSize({ width: 1440, height: 1000 });
  fixtureMode = "confirm";
  await input.fill("先给我一个创作方案，不要生成");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("heading", { name: "应用创作方案？", exact: true }).waitFor();
  assert.equal(await page.locator(".prompt-fusion-original").isVisible(), false);
  await page.screenshot({ path: "output/playwright/board-chat-confirmation.png" });
  await page.getByRole("button", { name: "应用方案", exact: true }).click();
  await page.locator(".prompt-fusion-original").waitFor({ state: "visible" });
  await mode.click();
  await page.locator(".prompt-fusion-direct-editor").getByText("自然光下的咖啡器物，简洁构图与克制色彩", { exact: true }).waitFor();
  await mode.click();
  fixtureMode = "error";
  await input.fill("再讨论一下构图");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".assistant-chat [role=alert]").waitFor();
  await page.screenshot({ path: "output/playwright/board-chat-error.png" });
  assert.equal(await page.locator(".prompt-fusion").evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, verified: ["real PromptDock turn", "SSE chunks", "persisted conversation", "cancellation", "chat/direct modes", "reload without model resubmission", "history drawer", "pointer resize", "drag to dock", "keyboard dock resize", "dark theme", "question supplements", "multi-question draft retention", "single/multiple/text answers", "one final submission", "narrow questionnaire layout", "confirmation apply", "error recovery controls"], providerCalls: calls, rendererErrors: errors }, null, 2));
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
