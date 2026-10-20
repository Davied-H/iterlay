import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5293";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
const page = await context.newPage();
page.setDefaultTimeout(8_000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
let boardId;
try {
  await page.goto(origin);
  const ready = () => page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected");
  await ready();
  boardId = await page.evaluate(async () => {
    const api = window.imageWorkbench;
    const board = await api.createBoard("工具悬停与快捷键验证");
    await api.setLastOpenedBoard(board.id);
    localStorage.setItem("iterlay.libraryOpen", "0");
    return board.id;
  });
  await page.reload(); await ready();
  const toolbar = page.getByRole("toolbar", { name: "画布工具", exact: true });
  await toolbar.waitFor();
  await mkdir("output/playwright", { recursive: true });
  for (const name of ["选择 (V)", "平移 (H)", "生成图片", "生成视频", "添加文本", "适应画布"]) {
    console.log("hover", name);
    await toolbar.getByRole("button", { name, exact: true }).hover();
    const card = page.locator(".canvas-tool-hint");
    await card.waitFor();
    assert.equal(await card.locator("svg").count(), 1);
    assert(await card.locator("p").innerText());
    assert(await card.locator("kbd").innerText());
    const bounds = await card.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 1280 && bounds.y >= 0 && bounds.y + bounds.height <= 900);
    if (name === "生成图片") await page.screenshot({ path: "output/playwright/tool-hint-image.png" });
    await page.mouse.move(45, 130, { steps: 8 });
    await card.waitFor({ state: "hidden" });
  }
  await toolbar.getByRole("button", { name: "生成视频", exact: true }).focus();
  await page.locator(".canvas-tool-hint").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".canvas-tool-hint").waitFor({ state: "hidden" });
  console.log("hover and focus complete");
  for (const [key, count] of [["I", 1], ["V", 2], ["T", 3]]) {
    await page.evaluate(() => document.activeElement?.blur());
    console.log("create", key);
    await page.keyboard.press(`Shift+${key}`);
    await page.waitForFunction(count => document.querySelectorAll(".react-flow__node").length === count, count);
  }
  const input = page.locator('textarea:visible,input:not([type="file"]):visible').first();
  await input.focus();
  await page.keyboard.press("Shift+I");
  assert.equal(await page.locator(".react-flow__node").count(), 3);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+Digit1");
  await page.keyboard.press("Control+/");
  await page.getByRole("heading", { name: "画板快捷键" }).waitFor();
  assert(await page.getByRole("dialog").getByText("Shift I", { exact: true }).isVisible());
  await page.keyboard.press("Escape");
  await page.evaluate(async () => { const api = window.imageWorkbench; const settings = await api.getSettings(); await api.saveSettings({ ...settings, theme: "dark" }); });
  await page.reload(); await ready();
  await toolbar.getByRole("button", { name: "生成视频", exact: true }).hover();
  await page.locator(".canvas-tool-hint").waitFor();
  await page.screenshot({ path: "output/playwright/tool-hint-video-dark.png" });
  assert.deepEqual(errors, []);
  console.log("Verified six hover cards, illustrations, descriptions, shortcuts, bounds, focus/Escape, three creation shortcuts, input guard, shortcut help and dark theme.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  await page.screenshot({ path: "output/playwright/tool-hint-failure.png" });
  throw error;
} finally {
  const sessionId = await page.evaluate(async boardId => {
    const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
    if (boardId) await window.imageWorkbench.deleteBoard(boardId);
    return sessionId;
  }, boardId).catch(error => console.error("Cleanup:", error.message));
  await page.close();
  if (sessionId) await context.request.post(`${origin}/__iterlay_dev/disconnect`, { data: { sessionId } });
  await browser.close();
}
