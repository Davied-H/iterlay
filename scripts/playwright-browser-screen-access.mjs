import assert from "node:assert/strict";
import { createServer } from "node:http";
import { URL } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Isolated development workspace only. This test never grants OS capture permission.
const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5299";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
let calls = 0;
const provider = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const content = body.messages.at(-1).content;
  const text = typeof content === "string" ? content : content.find((part) => part.type === "text").text;
  const task = JSON.parse(text);
  const suggestion = typeof task.instruction !== "string";
  if (!suggestion) calls++;
  const raw = JSON.stringify(suggestion ? { suggestions: ["探索咖啡品牌的视觉方向", "设计一幅清晨的森林插画", "拍摄自然光下的器物"] } : { message: "我可以在获得授权后查看当前屏幕。", intent: "chat", commitment: "advise_only", fields: [], actions: [{ type: "request_screen_capture", reason: "查看当前桌面上可见的窗口和内容" }] });
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const part of [raw.slice(0, 30), raw.slice(30)]) response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
  response.end("data: [DONE]\n\n");
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let originalSettings;
const ready = () => page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected");
try {
  await page.goto(origin); await ready();
  originalSettings = await page.evaluate(() => window.imageWorkbench.getSettings());
  await page.evaluate(async (baseUrl) => {
    const api = window.imageWorkbench;
    const settings = await api.getSettings();
    await api.saveSettings({ ...settings, textProviders: [{ id: "screen-fixture", name: "屏幕授权离线模型", type: "openai-compatible", baseUrl: `${baseUrl}/v1`, model: "fixture" }], activeTextProviderId: "screen-fixture",
      apiKeyByProviderId: { "screen-fixture": "offline-test-only" }, assistantAgentModeEnabled: false, boardAssistantAgentModeEnabled: false, assistantScreenAccess: "ask",
      boardAssistantEnabled: true, memoryEnabled: false, boardAssistantAwarenessEnabled: false, boardAssistantIntentSuggestionsEnabled: false, boardSmartSuggestionsEnabled: false, editSmartSuggestionsEnabled: false, language: "zh-CN", theme: "light" });
    for (const key of ["board", "library", "gallery", "edit", "demo-start"]) await api.markOnboardingSeen(`iterlay.onboarding.${key}.v1`, "completed");
    localStorage.setItem("iterlay.libraryOpen", "0");
    localStorage.setItem("iterlay:agent-hint:v1:cli", "dismissed");
  }, `http://127.0.0.1:${provider.address().port}`);
  await page.reload(); await ready();
  const closeHint = page.getByRole("button", { name: "关闭此提醒", exact: true });
  if (await closeHint.isVisible()) await closeHint.click();
  const input = page.getByRole("textbox", { name: "对话规划输入", exact: true });
  await page.getByRole("button", { name: "开始新会话", exact: true }).click();
  await input.fill("你可以看到我桌面有什么吗");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("heading", { name: "允许查看屏幕？", exact: true }).waitFor();
  assert.equal(calls, 1, "No screen analysis request before the user grants permission");
  assert.equal(await page.getByRole("button", { name: "允许", exact: true }).isEnabled(), true);
  assert.equal((await page.evaluate(() => window.imageWorkbench.getScreenAccessStatus())).policy, "ask");
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: "output/playwright/screen-permission-card.png" });
  const card = page.locator(".assistant-permission-card");
  assert.equal(await card.getByRole("checkbox", { name: "以后自动允许", exact: true }).isChecked(), false);
  assert.equal(await card.locator(".assistant-permission-actions button").count(), 2);
  await card.getByRole("checkbox", { name: "以后自动允许", exact: true }).check();
  assert.equal(calls, 1, "Remembering a choice must not grant access before Allow is clicked");
  await card.getByRole("checkbox", { name: "以后自动允许", exact: true }).uncheck();
  await card.screenshot({ path: "output/playwright/permission-refined-light.png" });
  const originalWidth = await page.locator(".prompt-fusion").evaluate((node) => { const width = node.style.width; node.style.width = "320px"; return width; });
  await page.waitForFunction(() => document.querySelector(".prompt-fusion").getBoundingClientRect().width < 325);
  assert.equal(await card.evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
  await card.screenshot({ path: "output/playwright/permission-refined-narrow.png" });
  await page.locator(".prompt-fusion").evaluate((node, width) => { node.style.width = width; }, originalWidth);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForFunction(() => {
    const card = document.querySelector(".assistant-permission-card");
    const button = card.querySelector('[data-primary="true"]');
    return getComputedStyle(button).backgroundColor === "rgb(236, 236, 236)";
  });
  await card.screenshot({ path: "output/playwright/permission-refined-dark.png" });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await page.getByText("本次未获取屏幕内容。你可以继续用文字说明，或自行上传截图。", { exact: true }).waitFor();
  assert.equal(calls, 1);

  await input.fill("请再请求一次查看屏幕");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("heading", { name: "允许查看屏幕？", exact: true }).waitFor();
  await page.getByRole("button", { name: "在设置中管理权限", exact: true }).click();
  const policy = page.getByRole("combobox", { name: "屏幕访问策略", exact: true });
  await policy.waitFor();
  await policy.selectOption("allow");
  await page.waitForFunction(async () => (await window.imageWorkbench.getScreenAccessStatus()).policy === "allow");
  await policy.selectOption("ask");
  await page.waitForFunction(async () => (await window.imageWorkbench.getScreenAccessStatus()).policy === "ask");
  await policy.selectOption("deny");
  await page.waitForFunction(async () => (await window.imageWorkbench.getScreenAccessStatus()).policy === "deny");
  await page.screenshot({ path: "output/playwright/screen-permission-settings.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "允许", exact: true }).click();
  await page.getByRole("button", { name: "发送", exact: true }).waitFor();
  assert.equal(calls, 2, "Revocation while a card is pending prevents capture and another model request");
  assert.equal((await page.evaluate(() => window.imageWorkbench.getScreenAccessStatus())).policy, "deny");
  await page.evaluate(() => window.imageWorkbench.updateSettings({ assistantScreenAccess: "ask" }));
  await page.getByRole("button", { name: "打开画板库", exact: true }).click();
  await page.getByRole("button", { name: "新建创作", exact: true }).click();
  await page.getByRole("textbox", { name: "描述想要创建的内容", exact: true }).fill("你可以看到我桌面有什么吗");
  await page.getByRole("button", { name: "发送给 Pi Agent", exact: true }).click();
  await page.getByRole("heading", { name: "允许查看屏幕？", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "允许", exact: true }).isEnabled(), true);
  await page.screenshot({ path: "output/playwright/create-chat-screen-permission.png" });
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await page.locator(".create-chat:not(.assistant-chat)").getByText("本次未获取屏幕内容。你可以继续用文字说明，或自行上传截图。", { exact: true }).waitFor();
  assert.equal(calls, 3, "Workbench new chat uses the same authorization without capturing before consent");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, verified: ["normal conversation authorization card", "no automatic capture", "deny without another model call", "direct settings navigation", "persist allow/ask/deny", "revoke pending authorization", "workbench new chat authorization card"], calls, errors }, null, 2));
} catch (error) {
  console.error(await page.locator("body").innerText()); throw error;
} finally {
  if (originalSettings) await page.evaluate((settings) => window.imageWorkbench.saveSettings(settings), originalSettings).catch(() => {});
  await page.evaluate(async () => {
    const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }).catch(() => {});
  await browser.close();
  await new Promise((resolve) => provider.close(resolve));
}
