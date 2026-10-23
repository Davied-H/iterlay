import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

// Use an isolated pnpm dev workspace; all model/media requests stay local.
const origin = process.env.ITERLAY_BROWSER_SMOKE_URL ?? "http://127.0.0.1:5301";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const fixture = await readFile("demo-assets/lamp-studio.jpg");
let imageSubmissions = 0;
let agentRequests = 0;
const json = (res, value) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
const provider = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (req.url === "/v1/images/generations") {
    imageSubmissions++;
    json(res, { data: [{ b64_json: fixture.toString("base64") }] });
    return;
  }
  if (req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const texts = body.messages.map((m) => typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n"));
    const task = texts.flatMap((text) => { try { return [JSON.parse(text)]; } catch { return []; } }).find((t) => t.creationWorkflow);
    if (!task) { json(res, { choices: [{ message: { content: '{"suggestions":[]}' } }] }); return; }
    agentRequests++;
    assert(!texts[0].includes("finish_assistant_result"));
    const receipt = (name) => texts.filter((text) => text.startsWith(`Pi 工具结果：${name}\n`)).at(-1)?.split("\n\n").at(-1);
    let decision;
    if (task.instruction.includes("生成图片")) {
      const board = receipt("create_board");
      const generated = receipt("generate_image");
      if (!board) decision = { text: "我会新建画板，再生成水彩马。", toolCalls: [{ name: "create_board", arguments: { name: "无收尾工具回归" } }] };
      else if (!generated) decision = { text: "画板已创建，开始生成。", toolCalls: [{ name: "generate_image", arguments: { boardId: JSON.parse(board).id, prompt: "半透明的水彩马奔过草原", providerId: "finish-free-image" } }] };
      else {
        const taskId = JSON.parse(generated).generationId;
        const status = receipt("get_generation_status");
        if (!status || !["succeeded", "failed"].includes(JSON.parse(status).status)) decision = { text: "正在核对图片任务。", toolCalls: [{ name: "get_generation_status", arguments: { generationId: taskId } }] };
        else decision = { text: "水彩马图片已通过业务工具生成。", toolCalls: [] };
      }
    } else if (task.instruction.includes("选择风格") && !receipt("present_choices")) {
      decision = { text: "先选一种画风。", toolCalls: [{ name: "present_choices", arguments: { title: "选择测试画风", fieldId: "style", label: "画风", options: [{ label: "水彩", value: "watercolor" }, { label: "油画", value: "oil" }] } }] };
    } else decision = { text: task.instruction.includes("选择风格") ? "已收到你的画风选择。" : "普通对话可以直接完成，不需要收尾工具。", toolCalls: [] };
    const raw = JSON.stringify(decision);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const split = Math.floor(raw.length / 2);
    for (const part of [raw.slice(0, split), raw.slice(split)]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  } catch (error) { console.error(error); res.destroy(error); }
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${provider.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let originalSettings;
try {
  await page.goto(origin);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected", undefined, { timeout: 2500 });
      break;
    } catch (error) {
      if (attempt === 19 || !(await page.locator("body").innerText()).includes("已有网页正在调试")) throw error;
      await page.reload();
    }
  }
  originalSettings = await page.evaluate(async (baseUrl) => {
    const api = window.imageWorkbench;
    const old = await api.getSettings();
    await api.saveSettings({ ...old,
      providers: [{ id: "finish-free-image", name: "离线图片", type: "openai-compatible", apiMode: "images", baseUrl, generationEndpoint: "/v1/images/generations", model: "fixture", supportsReferenceImages: true }], activeProviderId: "finish-free-image",
      textProviders: [{ id: "finish-free-text", name: "离线对话", type: "openai-compatible", baseUrl: `${baseUrl}/v1`, model: "fixture" }], activeTextProviderId: "finish-free-text",
      apiKeyByProviderId: { "finish-free-image": "offline-test-only", "finish-free-text": "offline-test-only" },
      assistantAgentModeEnabled: false, piAgentMaxTurns: 30,
      piAgentBuiltinTools: [], piAgentSkillPaths: [], piAgentExtensionPaths: [],
      piAgentIterlayTools: ["create_board", "generate_image", "get_generation_status"],
      memoryEnabled: false, boardAssistantAwarenessEnabled: false, boardAssistantIntentSuggestionsEnabled: false,
      editSmartSuggestionsEnabled: false, language: "zh-CN", theme: "light"
    });
    for (const key of ["board", "library", "gallery", "edit", "demo-start"]) await api.markOnboardingSeen(`iterlay.onboarding.${key}.v1`, "completed");
    localStorage.setItem("iterlay.libraryOpen", "1");
    return old;
  }, baseUrl);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.workbenchConnection === "connected");
  const close = page.getByRole("button", { name: "关闭此提醒", exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole("button", { name: "创作助手", exact: true }).click();
  await page.getByRole("button", { name: "新建聊天", exact: true }).click();
  const input = page.locator("#create-chat-input");
  const send = async (text) => { await input.fill(text); await page.getByRole("button", { name: "发送给 Pi Agent", exact: true }).click(); };
  await send("你好");
  await page.getByText("普通对话可以直接完成，不需要收尾工具。", { exact: true }).waitFor();
  assert.equal(agentRequests, 1);
  assert.equal(imageSubmissions, 0);
  await send("帮我选择风格");
  await page.getByRole("heading", { name: "选择测试画风", exact: true }).waitFor();
  await page.getByRole("radio", { name: "水彩", exact: true }).check();
  await page.locator(".ct-question").getByRole("button", { name: "继续", exact: true }).click();
  await page.getByText("已收到你的画风选择。", { exact: true }).waitFor();
  await send("生成图片吧");
  await page.getByText(/水彩马图片已通过业务工具生成/).waitFor({ timeout: 60000 });
  await page.getByRole("complementary", { name: "创作成果" }).waitFor();
  assert.equal(imageSubmissions, 1);
  assert.equal(await page.getByRole("button", { name: "确认生成", exact: true }).count(), 0);
  assert(!await page.locator("body").innerText().then((text) => /仅补交状态|对话记录内容无效|完成助手回复/.test(text)));
  await mkdir("output/playwright", { recursive: true });
  assert.equal(await page.locator('[data-assistant-message="assistant"]').last().locator('.create-chat-response').innerText(), "水彩马图片已通过业务工具生成。");
  const savedId = await page.evaluate(() => localStorage.getItem("iterlay:creation:active"));
  let persisted = false;
  for (let attempt = 0; attempt < 100 && !persisted; attempt++) {
    persisted = await page.evaluate(async (id) => {
      const session = (await window.imageWorkbench.listCreationSessions()).find((item) => item.id === id);
      return session?.messages.length === 6 && session.artifacts.some((a) => a.status === "ready" && a.path) && !session.activeRunId;
    }, savedId);
    if (!persisted) await page.waitForTimeout(100);
  }
  assert(persisted, "Wait for the actual saved session before refreshing");
  // The local OpenAI fixture has no reasoning-summary capability. Seed a saved
  // provider-summary fixture to verify recovery and the production UI separately.
  await page.evaluate(async (id) => {
    const api = window.imageWorkbench;
    const session = (await api.listCreationSessions()).find((item) => item.id === id);
    for (const message of session.messages) if (message.role === "assistant") message.reasoningSummary = "采用自然水彩风格，保持主体清晰。";
    session.artifacts.push({ ...session.artifacts[0], id: `${session.artifacts[0].id}-preview`, boardName: "第二个预览" });
    await api.saveCreationSession(session);
  }, savedId);
  await page.reload();
  await page.getByRole("complementary", { name: "创作成果" }).waitFor();
  assert.equal(imageSubmissions, 1);
  assert.equal(await page.locator(".assistant-process-reasoning").count(), 3);
  const lastReply = page.locator('[data-assistant-message="assistant"]').last();
  assert.equal(await lastReply.locator('.create-chat-response').innerText(), "水彩马图片已通过业务工具生成。");
  assert.equal(await lastReply.locator('.assistant-process-reasoning').getAttribute('open'), null);
  await lastReply.locator('.assistant-process-reasoning > summary').click();
  await lastReply.locator('.assistant-process-activity > summary').click();
  assert.match(await lastReply.locator('.assistant-process-reasoning').innerText(), /自然水彩/);
  assert.match(await lastReply.locator('.assistant-process-activity').innerText(), /新建画板/);
  await lastReply.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/creation-tools-result.png" });
  await page.setViewportSize({ width: 900, height: 760 });
  await lastReply.scrollIntoViewIfNeeded();
  assert.equal(await lastReply.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  await page.screenshot({ path: "output/playwright/creation-tools-process-narrow.png" });
  const panel = page.getByRole("complementary", { name: "创作成果" });
  assert.equal(await panel.locator('.creation-artifact-actions, .creation-artifact-meta, .creation-artifact-list').count(), 0);
  const toolbar = panel.getByRole('toolbar', { name: '创作成果' });
  assert.equal(await toolbar.getByRole('button').count(), 5);
  assert.equal(await toolbar.innerText(), '');
  await toolbar.getByRole('button', { name: '选择创作成果', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '图片 2', exact: true }).click();
  assert.equal(await panel.locator('h2').innerText(), '第二个预览');
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await panel.evaluate((element) => getComputedStyle(element.querySelector('.creation-artifact-view')).backgroundColor === getComputedStyle(document.querySelector('.create-chat')).backgroundColor), true);
  await page.screenshot({ path: 'output/playwright/creation-artifact-toolbar.png' });
  await toolbar.getByRole('button', { name: '继续修改', exact: true }).click();
  assert.match(await input.inputValue(), /继续修改/);
  await toolbar.getByRole('button', { name: '收起成果预览', exact: true }).click();
  assert.equal(await panel.count(), 0);
  await page.getByRole('button', { name: '查看创作成果', exact: true }).click();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.setViewportSize({ width: 900, height: 760 });
  assert.equal(await panel.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  await page.screenshot({ path: 'output/playwright/creation-artifact-toolbar-dark-narrow.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, imageSubmissions, agentRequests, verified: ["natural text completion", "host choice tool", "create board and generate image via tools", "real task receipt and saved artifact", "no duplicate after reload", "creation always uses agent", "final reply excludes tool narration", "reasoning and execution styles", "process details survive reload", "narrow layout", "top icon toolbar", "multiple artifact switching", "refine and close actions", "matching chat surface", "dark narrow preview"] }));
} catch (error) {
  console.error((await page.locator("body").innerText()).slice(-6000));
  throw error;
} finally {
  await page.evaluate(async (settings) => { if (settings) await window.imageWorkbench.saveSettings(settings); }, originalSettings).catch(() => {});
  await page.evaluate(async () => {
    const sessionId = sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }).catch(() => {});
  await browser.close();
  await new Promise((resolve) => provider.close(resolve));
}
