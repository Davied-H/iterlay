import assert from "node:assert/strict";
import { createServer } from "node:http";
import { URL } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

// Run against an isolated pnpm dev workspace, never the user's active editing session.
const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5299";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
await mkdir("output/playwright", { recursive: true });
const videoFixturePath = "output/playwright/create-chat-fixture.mp4";
const generated = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", videoFixturePath]);
assert.equal(generated.status, 0, "Install ffmpeg to create the local video fixture");
const fixtureVideo = await readFile(videoFixturePath);
let releaseReply;
let holdDirectReply = true;
let steerObserved = false;
let videoSubmissions = 0;
let imageSubmissions = 0;
let polls = 0;
const creativeRequests = [];
const json = (response, value) => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
let providerOrigin;
const provider = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.url === "/fixture.mp4") { response.writeHead(200, { "content-type": "video/mp4" }); response.end(fixtureVideo); return; }
  if (request.method === "POST" && request.url === "/video-fixture") {
    videoSubmissions++;
    json(response, { request_id: "video-regression", status: "IN_QUEUE", status_url: `${providerOrigin}/status`, response_url: `${providerOrigin}/result` });
    return;
  }
  if (request.url === "/status" || request.url === "/video-fixture/requests/video-regression/status") { polls++; json(response, { status: "COMPLETED" }); return; }
  if (request.url === "/result" || request.url === "/video-fixture/requests/video-regression") { json(response, { video: { url: `${providerOrigin}/fixture.mp4`, content_type: "video/mp4" } }); return; }
  if (request.url?.includes("images/generations")) { imageSubmissions++; response.writeHead(500).end(); return; }
  if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const texts = body.messages.map((message) => typeof message.content === "string" ? message.content : message.content.find((part) => part.type === "text")?.text ?? "");
  if (texts.some((text) => text.includes("镜头节奏保持缓慢"))) steerObserved = true;
  const payloads = texts.flatMap((text) => { try { return [JSON.parse(text)]; } catch { return []; } });
  const task = payloads.find((value) => value.creationWorkflow) ?? payloads.at(-1) ?? {};
  const agentProtocol = texts[0].includes("JSON 工具决策协议");
  const formAnswers = texts.filter((text) => text.includes("Pi 工具结果：present_form")).length;
  const suggestions = { suggestions: ["设计极简咖啡包装", "拍摄山间小屋", "创作海底图书馆"] };
  let result = suggestions;
  let decision;
  if (task.creationWorkflow) {
    assert(agentProtocol, "Configured Agent mode must remain enabled for the creation entry");
    creativeRequests.push({ ...task, hasImage: body.messages.some((message) => Array.isArray(message.content)
      && message.content.some((part) => part.type === "image_url" || part.type === "image")) });
    if (task.instruction.includes("直接生成")) {
      const receipt = (name) => texts.filter((text) => text.startsWith(`Pi 工具结果：${name}\n`)).at(-1)?.split("\n\n").at(-1);
      const board = receipt("create_board");
      const taskReceipt = receipt("generate_video");
      const status = receipt("get_video_generation_status");
      if (!board) decision = { text: "需求已梳理：生成5秒咖啡视频。先创建画板。", toolCalls: [{ name: "create_board", arguments: { name: "视频回归测试" } }] };
      else if (!taskReceipt) decision = { text: "画板已创建，现在开始生成。", toolCalls: [{ name: "generate_video", arguments: { boardId: JSON.parse(board).id, prompt: "热咖啡缓缓升起蒸汽，镜头缓慢推进，5秒", durationSeconds: 5, aspectRatio: "16:9", resolution: "720p", providerId: "creation-video-fixture" } }] };
      else if (!status || !["completed", "failed", "cancelled"].includes(JSON.parse(status).status)) decision = { text: "正在核对视频任务。", toolCalls: [{ name: "get_video_generation_status", arguments: { videoGenerationId: JSON.parse(taskReceipt).videoGenerationId } }] };
      else decision = { text: "视频已生成并保存到画板。", toolCalls: [] };
    } else if (formAnswers < 2) {
      decision = { text: formAnswers ? "用途已确定，再确认视觉风格。" : "先明确交付用途，再整理创作方案。", toolCalls: [{ name: "present_form", arguments: {
        title: formAnswers ? "确认视觉风格" : "确认交付用途", fields: [{ id: "preference", label: "创作方向", type: "select", required: true, options: [{ label: "克制自然", value: "natural" }, { label: "强烈戏剧", value: "dramatic" }] }]
      } }] };
    } else {
      result = { message: "需求已收集，可以一起确认咖啡广告的创作方向。", intent: "direct", commitment: "prepare_only", mediaType: "image", fields: [{ label: "提示词", value: "克制自然的咖啡广告，柔和自然光" }] };
    }
  }
  const raw = JSON.stringify(task.creationWorkflow ? decision ?? { text: result.message, toolCalls: [] } : result);
  const send = (part) => response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
  response.writeHead(200, { "content-type": "text/event-stream" });
  if (task.creationWorkflow && task.instruction.includes("直接生成") && holdDirectReply) {
    holdDirectReply = false;
    const split = raw.indexOf("需求已梳理") + 20;
    send(raw.slice(0, split));
    releaseReply = () => { send(raw.slice(split)); response.end("data: [DONE]\n\n"); };
  } else { send(raw); response.end("data: [DONE]\n\n"); }
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
providerOrigin = `http://127.0.0.1:${provider.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const ready = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected", undefined, { timeout: 2500 }); return; }
    catch (error) {
      if (!(await page.locator("body").innerText()).includes("已有网页正在调试")) throw error;
      // A just-closed test browser retains a reconnect lease for 30 seconds.
      await page.reload();
    }
  }
  throw new Error("The isolated test workspace is still owned by another browser");
};
let originalSettings;
let originalBoardId;
let createdBoardIds = [];
try {
  await page.goto(origin); await ready();
  ({ originalSettings, originalBoardId } = await page.evaluate(async (baseUrl) => {
    const api = window.imageWorkbench;
    const originalSettings = await api.getSettings();
    const { lastOpenedBoardId: originalBoardId } = await api.getBoardsState();
    await api.saveSettings({ ...originalSettings,
      textProviders: [{ id: "creation-text-fixture", name: "离线创作助手", type: "openai-compatible", baseUrl: `${baseUrl}/v1`, model: "fixture-text" }], activeTextProviderId: "creation-text-fixture",
      videoProviders: [{ id: "creation-video-fixture", name: "离线视频服务", type: "fal", baseUrl, model: "video-fixture" }], activeVideoProviderId: "creation-video-fixture",
      apiKeyByProviderId: { "creation-text-fixture": "offline-test-only", "creation-video-fixture": "offline-test-only" },
      assistantAgentModeEnabled: true, memoryEnabled: false, boardAssistantEnabled: true,
      boardAssistantAwarenessEnabled: false, boardAssistantIntentSuggestionsEnabled: false,
      boardSmartSuggestionsEnabled: false, editSmartSuggestionsEnabled: false, language: "zh-CN", theme: "light"
    });
    for (const key of ["board", "library", "gallery", "edit", "demo-start"]) await api.markOnboardingSeen(`iterlay.onboarding.${key}.v1`, "completed");
    localStorage.setItem("iterlay.libraryOpen", "1");
    return { originalSettings, originalBoardId };
  }, providerOrigin));
  await page.reload(); await ready();
  const close = page.getByRole("button", { name: "关闭此提醒", exact: true });
  if (await close.isVisible()) await close.click();
  const openLibrary = page.getByRole("button", { name: "打开画板库", exact: true });
  if (await openLibrary.isVisible()) await openLibrary.click();
  await page.getByRole("button", { name: "创作助手", exact: true }).click();
  const input = page.getByRole("textbox", { name: "描述想要创建的内容", exact: true });
  await page.locator('.create-chat-compose-area input[type="file"]').setInputFiles("demo-assets/lamp-dusk.jpg");
  await page.getByRole("button", { name: "预览素材：lamp-dusk.jpg" }).waitFor();
  await page.getByRole("button", { name: "预览素材：lamp-dusk.jpg" }).click();
  await page.getByRole("dialog").getByRole("img", { name: "lamp-dusk.jpg" }).waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector('[role="dialog"] img');
    return image && image.complete && image.naturalWidth > 0;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: "output/playwright/create-chat-reference-preview.png" });
  await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.screenshot({ path: "output/playwright/create-chat-reference-thumbnail.png" });
  await input.fill("帮我做个咖啡广告");
  await page.getByRole("button", { name: "发送给 Pi Agent", exact: true }).click();
  await page.getByRole("heading", { name: "确认交付用途", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "确认生成", exact: true }).count(), 0);
  await page.getByRole("radio", { name: "克制自然", exact: true }).check();
  await page.locator(".ct-question").getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("heading", { name: "确认视觉风格", exact: true }).waitFor();
  await page.getByRole("radio", { name: "克制自然", exact: true }).check();
  await page.locator(".ct-question").getByRole("button", { name: "继续", exact: true }).click();
  await page.getByText("需求已收集，可以一起确认咖啡广告的创作方向。", { exact: true }).waitFor();
  assert.equal(creativeRequests.length, 3);
  assert(creativeRequests.some((task) => task.hasImage), "Saved reference pixels must reach the Agent's model request");
  assert(creativeRequests.every((task) => task.instruction === "帮我做个咖啡广告"), "Live forms continue in the same Agent run");
  assert.equal(videoSubmissions + imageSubmissions, 0);
  await page.locator(".creation-reference-item").first().hover();
  await page.screenshot({ path: "output/playwright/create-chat-reference-remove.png" });
  await page.getByRole("button", { name: "移除素材：lamp-dusk.jpg" }).click();
  assert.equal(await page.getByLabel("创作参考素材").count(), 0);
  await page.locator(".create-chat-header").getByRole("button", { name: "新对话", exact: true }).click();
  await input.fill("直接生成一个5秒咖啡视频");
  await page.getByRole("button", { name: "发送给 Pi Agent", exact: true }).click();
  await page.locator(".create-chat-response").getByText(/需求已梳理/).waitFor();
  assert.equal(await page.locator(".create-chat-thinking").count(), 0,
    "The waiting status must disappear once the assistant streams readable text");
  assert.equal(await page.locator(".creation-run-strip, .creation-run-details").count(), 0);
  assert.equal(await page.getByRole("button", { name: "确认生成", exact: true }).count(), 0, "No execution plan before stream completes");
  assert.equal(await page.locator('[data-assistant-message-body][data-streaming="true"]').count(), 1);
  await input.fill("视频完成后做一张竖版封面");
  await page.getByRole("button", { name: "发送给 Pi Agent", exact: true }).click();
  await page.getByText("视频完成后做一张竖版封面", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("待处理补充").count(), 0);
  await input.fill("镜头节奏保持缓慢");
  assert.equal(await page.getByRole("button", { name: "补充当前执行", exact: true }).count(), 0);
  await input.press("Enter");
  await page.getByText("镜头节奏保持缓慢", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("待处理补充").count(), 0);
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: "output/playwright/create-chat-streaming.png" });
  assert(releaseReply); releaseReply();
  await page.getByText("视频已生成并保存到画板。", { exact: false }).waitFor({ timeout: 60_000 });
  assert.equal(videoSubmissions, 1);
  assert.equal(steerObserved, true, "The in-run follow-up must reach a model request");
  assert.equal(imageSubmissions, 0);
  assert(polls > 0);
  const video = page.locator(".creation-artifact-panel video");
  await video.waitFor();
  await page.getByRole("complementary", { name: "创作成果" }).getByRole("tab", { name: "视频 1" }).waitFor();
  await video.evaluate(async (element) => { await element.play(); element.pause(); });
  const boards = await page.evaluate(() => window.imageWorkbench.listBoards());
  createdBoardIds = boards.filter((board) => board.name === "视频回归测试").map((board) => board.id);
  const saved = await page.evaluate((id) => window.imageWorkbench.getBoard(id), createdBoardIds[0]);
  assert(saved.nodes.some((node) => node.type === "video" && node.videoPath.endsWith(".mp4")));
  await page.screenshot({ path: "output/playwright/create-chat-video-result.png" });
  await page.waitForFunction(async () => (await window.imageWorkbench.listCreationSessions()).some((session) =>
    session.artifacts.some((artifact) => artifact.kind === "video" && artifact.status === "ready" && artifact.path)
    && session.messages.some((message) => message.role === "assistant" && message.content.includes("视频已生成并保存到画板。"))));
  const savedSessionId = await page.evaluate(() => localStorage.getItem("iterlay:creation:active"));
  await page.reload(); await ready();
  await page.waitForFunction((id) => localStorage.getItem("iterlay:creation:active") === id && document.querySelector('.creation-artifact-panel video'), savedSessionId);
  assert.equal(await page.getByRole("button", { name: "确认生成", exact: true }).count(), 0,
    "A delivered artifact must settle the old plan after reload");
  assert.equal(await page.locator(".creation-run-strip, .creation-run-details").count(), 0);
  await page.getByRole("button", { name: "收起成果预览" }).first().waitFor();
  await page.getByRole("complementary", { name: "创作助手导航" }).getByRole("button", { name: /直接生成一个5秒咖啡视频/ }).first().waitFor();
  assert.equal(videoSubmissions, 1, "Restoring a completed session must not resubmit media");
  await page.screenshot({ path: "output/playwright/create-chat-restored-video.png" });
  await page.setViewportSize({ width: 900, height: 760 });
  await page.waitForFunction(() => {
    const panel = document.querySelector('.creation-artifact-panel');
    return window.innerWidth === 900 && panel && getComputedStyle(panel).backgroundColor === 'rgb(255, 255, 255)'
      && panel.getBoundingClientRect().width >= 360;
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false,
    "Creation workspace must not cause page-level horizontal overflow at compact desktop width");
  await page.screenshot({ path: "output/playwright/create-chat-restored-video-narrow.png" });
  await page.getByRole("complementary", { name: "创作成果" }).getByRole("button", { name: "继续修改" }).click();
  await page.getByRole("complementary", { name: "创作成果" }).waitFor({ state: "hidden" });
  assert.match(await input.inputValue(), /继续修改/u);
  await input.fill("");
  await page.locator(".create-chat-header").getByRole("button", { name: "查看创作成果" }).click();
  await page.setViewportSize({ width: 520, height: 780 });
  await page.getByRole("complementary", { name: "创作成果" }).getByRole("button", { name: "收起成果预览" }).click();
  await page.getByRole("button", { name: "打开侧边栏" }).click();
  await page.waitForFunction(() => {
    const sidebar = document.querySelector(".creation-assistant-sidebar");
    return sidebar && getComputedStyle(sidebar).display === "flex"
      && sidebar.getBoundingClientRect().width >= 260
      && document.documentElement.scrollWidth <= window.innerWidth + 1;
  });
  await page.screenshot({ path: "output/playwright/create-chat-mobile-sidebar.png" });
  await page.getByRole("complementary", { name: "创作助手导航" }).getByRole("button", { name: "关闭侧边栏" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".create-chat-header").getByRole("button", { name: "查看创作成果" }).click();
  const recent = page.getByRole("complementary", { name: "创作助手导航" });
  const currentRow = recent.locator(`[data-session-id="${savedSessionId}"]`);
  await currentRow.getByRole("button", { name: /会话操作/ }).click();
  if (await page.getByRole("menuitem", { name: "取消置顶", exact: true }).isVisible()) {
    await page.getByRole("menuitem", { name: "取消置顶", exact: true }).click();
    await currentRow.getByRole("button", { name: /会话操作/ }).click();
  }
  await page.getByRole("menuitem", { name: "置顶", exact: true }).click();
  await page.waitForFunction(async (id) => (await window.imageWorkbench.listCreationSessions()).find((session) => session.id === id)?.pinned === true, savedSessionId);
  await currentRow.getByRole("button", { name: /会话操作/ }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click({ force: true });
  await recent.getByRole("textbox", { name: "重命名创作会话" }).fill("咖啡短片项目");
  await recent.getByRole("textbox", { name: "重命名创作会话" }).press("Enter");
  await page.waitForFunction(async (id) => (await window.imageWorkbench.listCreationSessions()).find((session) => session.id === id)?.title === "咖啡短片项目", savedSessionId);
  await currentRow.getByRole("button", { name: /会话操作/ }).click();
  if (await page.getByRole("menuitem", { name: "取消归档", exact: true }).isVisible()) {
    await page.getByRole("menuitem", { name: "取消归档", exact: true }).click();
    await currentRow.getByRole("button", { name: /会话操作/ }).click();
  }
  await page.getByRole("menuitem", { name: "归档", exact: true }).click({ force: true });
  await page.waitForFunction(async (id) => (await window.imageWorkbench.listCreationSessions()).find((session) => session.id === id)?.archived === true, savedSessionId);
  await recent.getByRole("button", { name: "查看归档", exact: true }).click();
  await recent.getByRole("button", { name: "咖啡短片项目", exact: true }).first().waitFor();
  await recent.getByRole("button", { name: "新建项目", exact: true }).click();
  await recent.getByRole("textbox", { name: "项目名称" }).fill("创作回归项目");
  await recent.getByRole("textbox", { name: "项目名称" }).press("Enter");
  await recent.getByRole("button", { name: "创作回归项目", exact: true }).waitFor();
  await currentRow.getByRole("button", { name: /会话操作/ }).click();
  await page.getByRole("menuitem", { name: "创作回归项目", exact: true }).click();
  const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("iterlay:creation:projects") ?? "[]")[0]?.id);
  await page.waitForFunction(async ({ id, projectId }) => (await window.imageWorkbench.listCreationSessions()).find((session) => session.id === id)?.projectId === projectId, { id: savedSessionId, projectId });
  await recent.getByRole("button", { name: "项目操作：创作回归项目" }).click();
  await page.getByRole("menuitem", { name: "删除项目", exact: true }).click();
  await page.waitForFunction(async ({ id }) => (await window.imageWorkbench.listCreationSessions()).find((session) => session.id === id)?.projectId == null
    && JSON.parse(localStorage.getItem("iterlay:creation:projects") ?? "[]").length === 0, { id: savedSessionId });
  await page.getByRole("complementary", { name: "创作成果" }).getByRole("button", { name: "在画板中打开" }).click();
  await page.locator(".prompt-fusion .assistant-chat").waitFor();
  await page.locator('.prompt-fusion .assistant-chat [data-assistant-message-body]')
    .filter({ hasText: "需求已梳理：生成5秒咖啡视频。" }).first().waitFor();
  await page.screenshot({ path: "output/playwright/create-chat-board-handoff.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, verified: ["reference preview, hover removal, and image reaches Agent", "live Agent forms in one run", "real Agent SSE before completion", "queued follow-up", "in-run steering", "authorized direct execution", "video task routing", "saved MP4 node", "video playback", "session and artifact restore", "pin, rename, archive, and project directories", "mobile sidebar open and close", "same conversation opens in canvas assistant", "configured Agent mode stays enabled"], videoSubmissions, imageSubmissions, errors }, null, 2));
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  releaseReply?.();
  createdBoardIds = await page.evaluate(async () => (await window.imageWorkbench.listBoards()).filter((board) => board.name === "视频回归测试").map((board) => board.id)).catch(() => createdBoardIds);
  await page.evaluate(async ({ originalSettings, originalBoardId, createdBoardIds }) => {
    const api = window.imageWorkbench;
    if (originalSettings) await api.saveSettings(originalSettings);
    if (originalBoardId) await api.setLastOpenedBoard(originalBoardId);
    for (const id of createdBoardIds) await api.deleteBoard(id);
  }, { originalSettings, originalBoardId, createdBoardIds }).catch(() => {});
  await page.evaluate(async () => {
    const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }).catch(() => {});
  await browser.close();
  await new Promise((resolve) => provider.close(resolve));
}
