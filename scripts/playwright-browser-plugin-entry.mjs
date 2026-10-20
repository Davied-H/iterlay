import assert from "node:assert/strict";
import { URL } from "node:url";
import { chromium } from "playwright";

const origin = process.env.ITERLAY_BROWSER_SMOKE_URL || "http://127.0.0.1:5180";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw new Error("Local development URL required");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ locale: "zh-CN" });
const id = "dev.iterlay.short-drama";
let boardId;
let originalPlugin;
const ready = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.waitForFunction(() => window.imageWorkbench && document.documentElement.dataset.workbenchConnection === "connected", null, { timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await page.reload();
    }
  }
};
const checkEntry = async available => {
  const toolbar = page.getByRole("toolbar", { name: "画布工具", exact: true });
  await toolbar.waitFor();
  const video = toolbar.getByRole("button", { name: "生成视频", exact: true });
  await video.waitFor();
  assert.equal(await video.evaluate(button => button.previousElementSibling?.getAttribute("aria-label")), "生成图片");
  const menu = toolbar.locator("details");
  if (available) {
    await menu.waitFor();
    if (await menu.getAttribute("open") === null) await menu.locator("summary").click();
  } else await menu.waitFor({ state: "detached" });
  const entry = toolbar.getByRole("button", { name: "新建漫剧项目", exact: true });
  await entry.waitFor({ state: available ? "visible" : "detached" });
  assert.equal(await entry.count(), available ? 1 : 0);
};
const openMarket = () => page.getByRole("button", { name: "插件市场", exact: true }).click();
const closeMarket = () => page.getByRole("button", { name: "关闭插件市场", exact: true }).click();
try {
  await page.goto(origin);
  await ready();
  ({ boardId, originalPlugin } = await page.evaluate(async id => {
    const api = window.imageWorkbench;
    const originalPlugin = (await api.listPlugins()).find(p => p.manifest.id === id);
    const board = await api.createBoard("插件入口状态回归验证");
    await api.setLastOpenedBoard(board.id);
    localStorage.setItem("iterlay.libraryOpen", "0");
    await api.uninstallPlugin(id);
    return { boardId: board.id, originalPlugin };
  }, id));
  await page.reload();
  await ready();
  await checkEntry(false);
  await openMarket();
  await page.getByRole("button", { name: "安装", exact: true }).click();
  await page.getByRole("button", { name: "确认安装", exact: true }).click();
  await page.getByRole("button", { name: "已安装", exact: true }).waitFor();
  await closeMarket();
  await checkEntry(true);
  await openMarket();
  await page.getByRole("button", { name: /^停用\s*短剧助手$/ }).click();
  await page.getByRole("button", { name: /^启用\s*短剧助手$/ }).waitFor();
  await closeMarket();
  await checkEntry(false);
  await openMarket();
  await page.getByRole("button", { name: /^启用\s*短剧助手$/ }).click();
  await page.getByRole("button", { name: /^停用\s*短剧助手$/ }).waitFor();
  await closeMarket();
  await checkEntry(true);
  await openMarket();
  await page.getByRole("button", { name: /^卸载\s*短剧助手$/ }).click();
  await page.getByRole("button", { name: "安装", exact: true }).waitFor();
  await closeMarket();
  await checkEntry(false);
  await page.reload();
  await ready();
  await checkEntry(false);
  console.log("Verified: absent before install, visible after install, hidden after disable, restored after enable, hidden after uninstall and reload; video entry preserved.");
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await page.evaluate(async ({ id, boardId, originalPlugin }) => {
    const api = window.imageWorkbench;
    if (originalPlugin) {
      await api.installCatalogPlugin(id);
      await api.setPluginEnabled(id, originalPlugin.enabled);
    } else if (boardId) await api.uninstallPlugin(id);
    if (boardId) await api.deleteBoard(boardId);
    const sessionId = window.sessionStorage.getItem("iterlay:browser-debug-session");
    if (sessionId) await fetch("/__iterlay_dev/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
  }, { id, boardId, originalPlugin }).catch(error => console.error("Cleanup:", error));
  await browser.close();
}
