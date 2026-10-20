import { createServer } from "node:http";
import { URL } from "node:url";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5180";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw new Error("Local development URL required");
const output = path.resolve("output/playwright"); await mkdir(output, { recursive: true });
const decisions = [];
let holdCompletion = false;
let providerCalls = 0;
const provider = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
  request.resume();
  request.on("end", () => {
    providerCalls++;
    if (holdCompletion) return;
    const decision = decisions.shift();
    if (!decision) { response.writeHead(500).end("Unexpected model request"); return; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(decision) } }] }));
  });
});
await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
const providerUrl = `http://127.0.0.1:${provider.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && /Content Security Policy|Uncaught|TypeError|ReferenceError/.test(message.text())) errors.push(message.text()); });
const ready = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected", null, { timeout: 5_000 }); return; }
    catch (error) { if (attempt === 9) throw error; await page.reload(); }
  }
};
const id = "dev.iterlay.short-drama";
let boardId;
try {
  await page.goto(origin); await ready(); console.log("[plugins] workspace connected");
  const hint = page.getByRole("button", { name: "关闭此提醒" });
  if (await hint.isVisible()) await hint.click();
  // Start a fresh board in this isolated development workspace on every run.
  await page.evaluate(async id => {
    const api = window.imageWorkbench;
    const settings = await api.getSettings();
    await api.saveSettings({ ...settings, boardAssistantEnabled: false, memoryEnabled: false, textProviders: [{ id: "plugin-no-model", name: "未配置测试模型", type: "openai-compatible", baseUrl: "http://127.0.0.1:1", model: "unconfigured" }], activeTextProviderId: "plugin-no-model" });
    const board = await api.createBoard("插件验收 · 短剧工作流");
    await api.setLastOpenedBoard(board.id);
    localStorage.setItem("iterlay.libraryOpen", "0");
    await api.uninstallPlugin(id);
  }, id);
  await page.reload(); await ready();
  await page.getByRole("button", { name: "插件市场", exact: true }).click();
  await page.getByRole("button", { name: "安装", exact: true }).click();
  await page.getByRole("button", { name: "确认安装", exact: true }).click();
  await page.getByRole("button", { name: "已安装", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "plugins-market.png") });
  console.log("[plugins] catalog installed");
  await page.getByRole("button", { name: "关闭插件市场" }).click();
  await page.getByRole("button", { name: "短剧助手", exact: true }).click();
  let tool = page.frameLocator('iframe[title="短剧助手"]');
  const openProjectMenu = async () => {
    if (await tool.locator(".project-menu").getAttribute("open") === null) await tool.getByLabel("项目功能", { exact: true }).click();
  };
  const chooseStage = async name => { await openProjectMenu(); await tool.getByRole("button", { name, exact: true }).click(); };

  await chooseStage("01 故事");
  assert.equal(await page.locator(".react-flow").count(), 0, "Comic workspace must not mount the node canvas");
  boardId = await page.evaluate(async () => (await window.imageWorkbench.getBoardsState()).lastOpenedBoardId);
  await tool.getByRole("button", { name: "编辑故事", exact: true }).click();
  await tool.getByLabel("标题", { exact: true }).fill("雨夜来信");
  await tool.getByLabel("故事梗概").fill("失忆的女孩林雨在雨夜收到哥哥寄来的一封信。信上的日期却是明天，她必须在天亮前找到消失的车站。");
  await tool.getByLabel("题材", { exact: true }).fill("悬疑");
  await tool.getByLabel("统一视觉风格").fill("克制的电影感，雨夜冷色与室内暖光");
  await tool.getByRole("button", { name: "保存更改" }).click();
  await Promise.race([tool.locator(".editor").waitFor({ state: "hidden" }), tool.locator(".editor .error").waitFor().then(async () => { throw new Error(await tool.locator(".editor .error").innerText()); })]);
  console.log("[plugins] story saved");
  // Editing an existing card creates a new version through the same native board transaction.
  await tool.getByRole("button", { name: "编辑故事", exact: true }).click();
  await tool.getByLabel("叙事基调").fill("克制、紧张");
  await tool.getByRole("button", { name: "保存更改" }).click();
  await Promise.race([tool.locator(".editor").waitFor({ state: "hidden" }), tool.locator(".editor .error").waitFor().then(async () => { throw new Error(await tool.locator(".editor .error").innerText()); })]);
  await chooseStage("02 角色");
  await tool.getByRole("button", { name: "添加角色", exact: true }).first().click();
  await tool.getByLabel("角色名称").fill("林雨");
  await tool.getByLabel("故事定位").fill("寻找哥哥的主角");
  await tool.getByLabel("背景、性格与动机").fill("失忆，敏锐而谨慎；为了找回哥哥进入废弃车站。");
  await tool.getByLabel("固定外观锚点").fill("黑色齐肩短发\n灰色风衣\n银色项链");
  await tool.getByLabel("角色形象提示词").fill("年轻女孩，黑色齐肩短发，灰色风衣，银色项链，电影角色设定图");
  await tool.getByRole("button", { name: "保存更改" }).click();
  await tool.getByText("林雨", { exact: true }).waitFor();
  console.log("[plugins] character saved");
  // Exercise the installed package's sandbox capability path, without importing
  // plugin policy into the host or submitting any media/model request.
  const callsBeforeCapabilities = providerCalls;
  const capabilities = await page.evaluate(async ({ id, boardId }) => {
    const { requestPluginCapability } = await import("/src/features/plugins/request-plugin-capability.ts");
    const before = await window.imageWorkbench.getComicDramaBoardSnapshot(boardId);
    const character = before.nodes.find(node => node.type === "comic-character");
    const recipe = await requestPluginCapability(id, "character.prepareGeneration", character);
    const context = await requestPluginCapability(id, "comic.context", { snapshot: before, selectedNodeIds: [character.id] });
    const guide = await requestPluginCapability(id, "comic.guide", { snapshot: before, selectedNodeIds: [character.id] });
    const initialPlan = await requestPluginCapability(id, "project.initialize", {
      snapshot: { boardId, revision: before.revision, nodes: [], connections: [], groups: [] },
      instruction: "离线初始化能力检查"
    });
    const cancelled = new window.AbortController();
    cancelled.abort();
    let cancellationRejected = false;
    try { await requestPluginCapability(id, "character.prepareGeneration", character, { signal: cancelled.signal }); }
    catch { cancellationRejected = true; }
    const after = await window.imageWorkbench.getComicDramaBoardSnapshot(boardId);
    return { recipe, context, guide, initialPlan, before, after, cancellationRejected,
      hiddenFrames: document.querySelectorAll('iframe[hidden]').length };
  }, { id, boardId });
  assert(capabilities.recipe.prompt.includes("林雨") && capabilities.recipe.prompt.includes("灰色风衣"));
  assert.equal(capabilities.recipe.size, "1024x1792");
  assert(capabilities.context.includes("林雨"));
  assert.equal(typeof capabilities.guide.message, "string");
  assert.equal(capabilities.initialPlan.boardId, boardId);
  assert.equal(capabilities.initialPlan.additions.nodes[0].type, "comic-setting");
  assert.equal(capabilities.cancellationRejected, true);
  assert.equal(capabilities.hiddenFrames, 0, "Sandbox capability frames must be removed after success or cancellation");
  assert.deepEqual(capabilities.after, capabilities.before, "Preparing plugin plans must not mutate the board");
  assert.equal(providerCalls, callsBeforeCapabilities, "Pure plugin capabilities must not call a model");
  console.log("[plugins] installed sandbox capabilities, cancellation and cleanup verified");
  await chooseStage("03 分镜");
  await tool.getByRole("button", { name: "添加分镜", exact: true }).first().click();
  await tool.getByLabel("标题", { exact: true }).fill("来自明天的信");
  await tool.getByLabel("画面与动作").fill("窗外雨声渐密，林雨展开信纸，看到落款日期是明天。");
  await tool.getByLabel("场景", { exact: true }).fill("旧公寓 / 夜 / 内");
  await tool.getByLabel("台词 / 旁白").fill("这不可能……");
  await tool.getByLabel("运镜", { exact: true }).fill("缓慢推近信纸日期，切到女孩的眼睛");
  await tool.getByRole("button", { name: "保存更改" }).click();
  await tool.getByRole("button", { name: "查看分镜 来自明天的信", exact: true }).waitFor();
  console.log("[plugins] shot saved");
  for (const shot of [
    { title: "雨中的站牌", scene: "废弃车站 / 雨夜 / 外", action: "林雨站在站牌下，指尖抹去玻璃上的雨水，露出熟悉的名字。", dialogue: "哥哥，你来过这里。", camera: "中景，镜头缓慢横移" },
    { title: "最后一班列车", scene: "站台 / 黎明前 / 外", action: "远处车灯刺破雨幕，林雨攥紧信纸，向空无一人的站台迈出一步。", dialogue: "等我。", camera: "远景转跟拍，沿站台推进" },
    { title: "空车厢", scene: "列车车厢 / 内", action: "车门缓缓合拢。林雨看向窗外，站台上的钟开始倒转。", dialogue: "这里是什么地方？", camera: "固定中景，玻璃反射人物" },
    { title: "消失的照片", scene: "车厢座位 / 内", action: "她拿出兄妹合影，照片里哥哥的身影正在一点点褪色。", dialogue: "不……你不能消失。", camera: "手部特写，焦点移向照片" },
    { title: "熟悉的背影", scene: "车厢连接处 / 内", action: "昏暗的通道尽头，一个穿深色外套的人回过头。", dialogue: "你终于来了。", camera: "长焦压缩通道，缓慢推近" },
    { title: "迟到的告别", scene: "车厢门边 / 内", action: "林雨停在门口。两人隔着摇晃的车厢，谁也没有走近。", dialogue: "这一次，我不会再忘记。", camera: "对称双人中景，保持静止" },
    { title: "天亮以后", scene: "车站出口 / 清晨 / 外", action: "第一缕阳光落在站牌上。林雨把信折好，转身走入人群。", dialogue: "明天见。", camera: "全景，镜头缓慢升起" }
  ]) {
    await tool.getByRole("button", { name: "添加分镜", exact: true }).first().click();
    await tool.getByLabel("标题", { exact: true }).fill(shot.title);
    await tool.getByLabel("场景", { exact: true }).fill(shot.scene);
    await tool.getByLabel("画面与动作").fill(shot.action);
    await tool.getByLabel("台词 / 旁白").fill(shot.dialogue);
    await tool.getByLabel("运镜", { exact: true }).fill(shot.camera);
    await tool.getByRole("button", { name: "保存更改" }).click();
    await tool.locator(".editor").waitFor({ state: "hidden" });
  }
  await tool.getByRole("button", { name: "列表视图" }).click();
  assert.equal(await tool.locator("tbody tr").count(), 8);
  await page.screenshot({ path: path.join(output, "short-drama-shotlist-1440.png") });
  await tool.getByRole("button", { name: "网格视图" }).click();
  await tool.getByRole("textbox", { name: "搜索制作内容" }).fill("雨中的站牌");
  assert.equal(await tool.locator(".frame-card").count(), 1);
  await tool.getByRole("textbox", { name: "搜索制作内容" }).fill("");

  await tool.getByRole("button", { name: "剧本面板", exact: true }).click();
  await tool.getByRole("textbox", { name: "镜头 1 台词 / 旁白", exact: true }).fill("这封信……来自明天。");
  await page.waitForFunction(async ({ id, boardId }) => {
    const state = await window.imageWorkbench.readPluginState(id, `board:${boardId}`);
    return Object.values(state?.scriptDrafts ?? {}).some(draft => draft.values.dialogue === "这封信……来自明天。");
  }, { id, boardId });
  await page.reload(); await ready();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  assert.equal(await tool.getByRole("textbox", { name: "镜头 1 台词 / 旁白", exact: true }).inputValue(), "这封信……来自明天。");
  await tool.getByRole("button", { name: "保存剧本", exact: true }).click();
  await page.waitForFunction(async boardId => {
    const snapshot = await window.imageWorkbench.getComicDramaBoardSnapshot(boardId);
    const shot = snapshot.nodes.find(n => n.type === "comic-segment-script" && n.order === 1);
    return shot.versions.find(v => v.versionId === shot.activeVersionId).fields.dialogue === "这封信……来自明天。";
  }, boardId);
  await tool.getByRole("button", { name: "演示分镜", exact: true }).click();
  await tool.getByRole("button", { name: "下一镜", exact: true }).click();
  assert.equal(await tool.locator(".frame-card").count(), 1);
  await tool.getByRole("button", { name: "退出演示", exact: true }).click();
  await page.screenshot({ path: path.join(output, "short-drama-shots-1440.png") });
  await tool.getByRole("button", { name: "AI 导演", exact: true }).click();
  await tool.getByRole("textbox", { name: "给 AI 导演的指令" }).fill("下一镜保持同一件灰色风衣");
  const board = await page.evaluate(id => window.imageWorkbench.getComicDramaBoardSnapshot(id), boardId);
  assert.equal(board.nodes.filter(n => n.type === "comic-character").length, 1);
  assert.equal(board.nodes.filter(n => n.type === "comic-segment-script").length, 8);
  assert(board.nodes.find(n => n.type === "comic-setting").versions.length >= 3);
  assert.equal(board.connections.filter(c => c.kind === "reference").length, 17);
  await page.waitForFunction(async ({ id, boardId }) => (await window.imageWorkbench.readPluginState(id, `board:${boardId}`))?.draft === "下一镜保持同一件灰色风衣", { id, boardId });
  await page.reload(); await ready();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  await tool.getByRole("button", { name: "AI 导演", exact: true }).click();
  assert.equal(await tool.getByRole("textbox", { name: "给 AI 导演的指令" }).inputValue(), "下一镜保持同一件灰色风衣");
  await tool.getByRole("button", { name: "工具设置" }).click();
  let settings = tool;
  await settings.getByLabel("导演约定").fill("冷静克制；固定服装与光线；逐镜确认。");
  await settings.getByRole("button", { name: "保存设置" }).click();
  await settings.getByText("设置已保存", { exact: true }).waitFor();
  // A visible settings panel must not swallow editing and preview actions.
  await chooseStage("03 分镜");
  await tool.getByRole("button", { name: "工具设置" }).click();
  await tool.getByRole("button", { name: "编辑分镜", exact: true }).first().click();
  await tool.getByRole("heading", { name: "编辑分镜", exact: true }).waitFor();
  await tool.getByRole("button", { name: "关闭面板" }).click();
  await tool.getByRole("button", { name: "工具设置" }).click();
  await tool.getByRole("button", { name: "查看分镜 来自明天的信", exact: true }).click();
  await tool.getByRole("complementary", { name: "镜头详情", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "short-drama-detail-1440.png") });
  await tool.getByRole("button", { name: "关闭面板" }).click();
  await tool.getByRole("button", { name: "工具设置" }).click();

  await tool.getByRole("button", { name: "返回工具" }).click();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  await chooseStage("04 制作");
  await tool.getByRole("button", { name: /来自明天的信/ }).click();
  await tool.getByText("已选中", { exact: true }).waitFor();
  // Verify the iframe cannot obtain preload or parent DOM even though it can call the SDK.
  const child = page.frames().find(f => f.url().includes(`/${id}`));
  const isolation = await child.evaluate(() => {
    let parentBlocked = false; try { void window.parent.document.body; } catch { parentBlocked = true; }
    return { parentBlocked, preload: typeof window.imageWorkbench, require: typeof window.require, origin: window.origin };
  });
  assert.equal(isolation.parentBlocked, true); assert.equal(isolation.preload, "undefined"); assert.equal(isolation.require, "undefined"); assert.equal(isolation.origin, "null");
  await tool.getByRole("button", { name: "AI 导演", exact: true }).click();
  // With no credentials configured, the real assistant must settle with an actionable error.
  await tool.getByRole("textbox", { name: "给 AI 导演的指令" }).fill("检查当前分镜的连续性");
  await tool.getByRole("button", { name: "发送", exact: false }).click();
  await tool.locator(".message-assistant.error").waitFor({ timeout: 30_000 });
  await tool.getByRole("button", { name: "发送", exact: false }).waitFor();
  // Real native Agent + offline text fixture: state read, interactive form,
  // versioned mutation, final result, then cancellation of a pending completion.
  await page.evaluate(async baseUrl => {
    const api = window.imageWorkbench;
    const settings = await api.getSettings();
    await api.saveSettings({ ...settings, textProviders: [{ id: "plugin-offline-fixture", name: "插件离线验收", type: "openai-compatible", baseUrl, model: "fixture" }], activeTextProviderId: "plugin-offline-fixture", apiKeyByProviderId: { "plugin-offline-fixture": "offline-test-only" } });
  }, providerUrl);
  const current = await page.evaluate(boardId => window.imageWorkbench.getComicDramaBoardSnapshot(boardId), boardId);
  const decision = (name, args) => ({ text: "离线验收", toolCalls: [{ name, arguments: args }] });
  decisions.push(
    decision("get_comic_drama_state", { boardId }),
    decision("present_form", { title: "确认镜头情绪", fields: [{ id: "emotion", label: "情绪", type: "text", required: true }] }),
    decision("update_comic_setting", { boardId, expectedRevision: current.revision, idempotencyKey: "plugin-fixture-tone-update", setting: { tone: "克制、紧张、连续" } }),
    decision("finish_assistant_result", { result: { message: "已读取当前画板，并将叙事基调保存为新版本。", intent: "chat", goal: "explain", commitment: "advise_only", fields: [] } })
  );
  await tool.getByRole("textbox", { name: "给 AI 导演的指令" }).fill("检查设定，询问我的镜头情绪，然后更新叙事基调。");
  await tool.getByRole("button", { name: "发送", exact: false }).click();
  await tool.getByText("确认镜头情绪", { exact: true }).waitFor();
  await tool.getByLabel("情绪", { exact: true }).fill("紧张");
  await tool.getByRole("button", { name: "确认继续", exact: true }).click();
  await tool.getByText("已读取当前画板，并将叙事基调保存为新版本。", { exact: true }).waitFor();
  const afterAgent = await page.evaluate(boardId => window.imageWorkbench.getComicDramaBoardSnapshot(boardId), boardId);
  const story = afterAgent.nodes.find(n => n.type === "comic-setting");
  assert.equal(story.versions.find(v => v.versionId === story.activeVersionId).fields.tone, "克制、紧张、连续");
  assert.equal(decisions.length, 0);
  holdCompletion = true;
  await tool.getByRole("textbox", { name: "给 AI 导演的指令" }).fill("等待中的可取消请求");
  await tool.getByRole("button", { name: "发送", exact: false }).click();
  await tool.getByRole("button", { name: "停止", exact: true }).click();
  await tool.getByText("已停止。", { exact: true }).waitFor();
  console.log("[plugins] native Agent form, mutation, final result and cancellation verified", providerCalls);
  await openProjectMenu();
  await tool.getByRole("button", { name: "插件市场", exact: true }).click();
  await page.getByRole("button", { name: /^停用\s*短剧助手$/ }).click();
  await page.getByRole("button", { name: "关闭插件市场" }).click();
  await page.getByRole("heading", { name: "安装短剧助手" }).waitFor();
  await page.getByRole("button", { name: "打开插件市场", exact: true }).click();
  await page.getByRole("button", { name: /^启用\s*短剧助手$/ }).click();
  await page.getByRole("button", { name: /^卸载\s*短剧助手$/ }).click();
  // Input upload exercises the actual browser binary transport, not a backend-only install.
  await page.locator('input[type="file"][accept=".iterlay-plugin"]').setInputFiles({ name: `${id}.iterlay-plugin`, mimeType: "application/zip", buffer: await readFile(`resources/plugins/${id}.iterlay-plugin`) });
  await page.getByRole("button", { name: "确认安装", exact: true }).click();
  await page.getByRole("button", { name: "已安装", exact: true }).waitFor();
  await page.getByRole("button", { name: "关闭插件市场" }).click();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  await tool.locator(".production-list").waitFor();
  assert.equal((await page.evaluate(id => window.imageWorkbench.getComicDramaBoardSnapshot(id), boardId)).nodes.length, 10);
  const state = await page.evaluate(({ id, boardId }) => window.imageWorkbench.readPluginState(id, `board:${boardId}`), { id, boardId });
  assert(state.messages.length >= 2);
  await tool.getByRole("button", { name: "工具设置" }).click();
  settings = tool;
  assert.equal(await settings.getByLabel("导演约定").inputValue(), "冷静克制；固定服装与光线；逐镜确认。");
  await tool.getByRole("button", { name: "返回工具" }).click();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(output, "short-drama-production-1280.png") });
  const checkPluginLayout = async () => {
    const frame = page.frames().find(f => f.url().includes(`/${id}`));
    assert(frame, "Installed plugin frame must be present");
    const layout = await frame.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length }));
    assert.equal(layout.overflow, false, "Plugin must not overflow horizontally");
    assert.equal(layout.brokenImages, 0, "Plugin previews must load");
  };
  await checkPluginLayout();
  await chooseStage("02 角色");
  await tool.getByRole("button", { name: "查看角色 林雨" }).waitFor();
  await page.screenshot({ path: path.join(output, "short-drama-characters-1280.png") });
  await checkPluginLayout();
  await tool.getByRole("button", { name: "AI 导演", exact: true }).click();
  await tool.getByText("已读取当前画板，并将叙事基调保存为新版本。", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "short-drama-director-1280.png") });
  await checkPluginLayout();
  await page.evaluate(async () => { const api = window.imageWorkbench; const settings = await api.getSettings(); await api.saveSettings({ ...settings, theme: "dark" }); });
  await page.reload(); await ready();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  await chooseStage("02 角色");
  await page.screenshot({ path: path.join(output, "short-drama-characters-dark-1280.png") });
  await checkPluginLayout();
  await tool.getByRole("button", { name: "AI 导演", exact: true }).click();
  await tool.locator(".message-assistant.error").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "short-drama-error-dark-1280.png") });
  await checkPluginLayout();
  await page.evaluate(async () => { const api = window.imageWorkbench; const settings = await api.getSettings(); await api.saveSettings({ ...settings, theme: "light" }); });
  await page.reload(); await ready();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  await chooseStage("03 分镜");
  await tool.getByRole("button", { name: "查看分镜 来自明天的信", exact: true }).waitFor();
  await tool.getByRole("button", { name: "返回主画板", exact: true }).click();
  await page.locator(".react-flow").waitFor();
  await page.evaluate(boardId => window.imageWorkbench.setLastOpenedBoard(boardId), boardId);
  await page.reload(); await ready();
  tool = page.frameLocator('iframe[title="短剧助手"]');
  await chooseStage("03 分镜");
  await tool.getByRole("button", { name: "查看分镜 来自明天的信", exact: true }).waitFor();
  assert.equal(await page.locator(".react-flow").count(), 0);
  await tool.getByRole("button", { name: "剧本面板", exact: true }).click();
  await page.setViewportSize({ width: 1235, height: 846 });
  await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, "short-drama-replica-1235.png") });
  await tool.getByRole("button", { name: "列表视图", exact: true }).click();
  assert.equal(await tool.locator(".studio-inspector").count(), 0);
  await page.screenshot({ path: path.join(output, "short-drama-replica-list-1235.png") });
  await tool.getByRole("button", { name: "网格视图", exact: true }).click();
  await checkPluginLayout();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, boardId, screenshots: ["plugins-market.png", "short-drama-shots-1440.png", "short-drama-production-1280.png"], verified: ["catalog install", "real React UI", "story versioning", "cast and shot editing", "reference connections", "draft recovery", "settings", "selection sync", "sandbox", "assistant error recovery", "native Agent form", "Agent mutation", "Agent cancellation", "disable", "uninstall", "file import", "reinstall data preservation"] }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, "plugins-failure.png") }).catch(() => undefined);
  console.error(await page.locator("body").innerText());
  for (const frame of page.frames().slice(1)) console.error("FRAME:", await frame.locator("body").innerText().catch(() => "unavailable"));
  console.error(errors);
  throw error;
} finally {
  await page.evaluate(async () => {
    if (window.imageWorkbench) {
      const settings = await window.imageWorkbench.getSettings();
      await window.imageWorkbench.saveSettings({ ...settings, textProviders: settings.textProviders.filter(p => !p.id.startsWith("plugin-")), activeTextProviderId: "" });
    }
    const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }).catch(() => undefined);
  await browser.close();
  provider.closeAllConnections(); provider.close();
}
