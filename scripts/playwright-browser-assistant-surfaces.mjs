import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.ITERLAY_BROWSER_SMOKE_URL ?? "http://127.0.0.1:5299";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("output/playwright", { recursive: true });
async function preview(name) {
  await page.goto(`${origin}/?preview=${name}`);
}
async function screenshot(name) {
  await page.screenshot({ path: `output/playwright/unified-${name}.png` });
}
async function noOverflow(locator) {
  assert.equal(await locator.evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
}
try {
  await preview("scene-detail");
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  const template = page.locator(".assistant-template-root");
  await template.waitFor();
  await template.getByRole("button", { name: /模板约束/ }).click();
  await template.getByRole("button", { name: /补充要生成/ }).click();
  assert.match(await template.getByRole("textbox", { name: "给 AI 助手发送消息", exact: true }).inputValue(), /关于/);
  await template.getByRole("textbox", { name: "给 AI 助手发送消息", exact: true }).fill("为咖啡品牌设计产品海报");
  await template.getByRole("textbox", { name: "给 AI 助手发送消息", exact: true }).press("Enter");
  await template.getByRole("textbox", { name: "确认生成方案内容", exact: true }).waitFor();
  await template.getByRole("textbox", { name: "确认生成方案内容", exact: true }).fill("自然光咖啡海报，保留主体比例");
  await noOverflow(template);
  await screenshot("template-proposal");
  await template.getByRole("button", { name: "应用提示词", exact: true }).click();
  await page.getByRole("textbox", { name: "描述本次要生成的画面", exact: true }).waitFor();
  assert.match(await page.getByRole("textbox", { name: "描述本次要生成的画面", exact: true }).inputValue(), /自然光咖啡海报/);
  await page.setViewportSize({ width: 900, height: 760 });
  await noOverflow(template);
  await screenshot("template-narrow");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await preview("template-assistant");
  await page.locator(".assistant-chat").waitFor();
  assert.equal(await page.locator(".assistant-chat .create-chat-composer").count(), 1);
  await noOverflow(page.locator(".assistant-chat"));
  await screenshot("template-factory");

  await preview("assistant-history");
  // Mount the production editor: the older video preview is a standalone design mock.
  await page.evaluate(async () => {
    const reactModule = await import("/node_modules/.vite/deps/react.js");
    const React = reactModule.default ?? reactModule;
    const clientModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = clientModule.createRoot ?? clientModule.default.createRoot;
    const { I18nProvider } = await import("/src/i18n/index.tsx");
    const { VideoSequenceEditor } = await import("/src/components/video-sequence/VideoSequenceEditor.tsx");
    document.querySelector("#root").style.display = "none";
    const host = document.createElement("div"); host.style.height = "100dvh"; document.body.append(host);
    const noop = () => {};
    const sequence = { id: "offline-editor", boardId: "offline", name: "视频助手样式验收", revision: 1, updatedAt: new Date().toISOString(),
      defaults: { model: "offline", aspectRatio: "16:9", resolution: "720p", fps: 24, durationSeconds: 5, generateAudio: false, watermark: false },
      keyframes: [{ id: "f1", order: 0, imagePath: "first" }, { id: "f2", order: 1, imagePath: "last" }],
      segments: [{ id: "s1", order: 0, fromKeyframeId: "f1", toKeyframeId: "f2", prompt: "镜头缓缓推进", trimInMs: 0, state: "configured", versions: [] }] };
    createRoot(host).render(React.createElement(I18nProvider, null, React.createElement(VideoSequenceEditor, { sequence, mediaUrls: {}, providers: [], onChange: noop, onGenerateSegment: noop, onGenerateBatch: noop, onSaveTemplate: noop, onApplyTemplate: noop, onExport: noop, onClose: noop })));
  });
  await page.getByRole("button", { name: "视频助手", exact: true }).click();
  await page.locator(".vse-assistant .assistant-chat").waitFor();
  await noOverflow(page.locator(".vse-assistant .assistant-chat"));
  await page.locator(".vse-assistant").getByRole("textbox", { name: "给 AI 助手发送消息", exact: true }).fill("镜头缓缓推进");
  await page.waitForFunction(() => document.querySelector(".vse-assistant .create-chat-send")?.disabled === false);
  const sendColors = await page.locator(".vse-assistant .create-chat-send").evaluate((node) => { const style = getComputedStyle(node); return { ink: style.color, surface: style.backgroundColor }; });
  assert.notEqual(sendColors.ink, sendColors.surface, "Video editor CSS must not override assistant button contrast");
  await screenshot("video-assistant");

  await preview("assistant-history");
  await page.getByRole("button", { name: "查看对话历史", exact: true }).click();
  await page.locator(".assistant-chat-history-list").waitFor();
  assert.equal(await page.locator(".assistant-chat-history-list > button").count(), 4);
  await page.locator(".assistant-chat-history-list > button").first().click();
  await page.getByRole("button", { name: "展开本轮提示词", exact: true }).click();
  assert(await page.locator('[aria-label="结构化提示词"] dt').count() > 0);
  await screenshot("structured-prompt");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, verified: ["template requirement shortcut", "template Enter submission", "editable proposal apply", "template narrow width", "template factory shared composer", "video assistant", "shared history", "structured prompt"], rendererErrors: errors }, null, 2));
} catch (error) {
  console.error((await page.locator("body").innerText()).slice(0, 4000));
  throw error;
} finally {
  await browser.close();
}
