import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { OnboardingStore } from "../dist-electron/electron/storage/onboarding-store.js";

const root = process.cwd();
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "iterlay-fusion-qa-"));
const onboarding = new OnboardingStore(path.join(dataDirectory, "workspace"));
for (const id of ["board", "library", "gallery", "edit"]) onboarding.markSeen(`iterlay.onboarding.${id}.v1`, "completed");
const output = path.join(root, "output", "playwright", "fusion");
await mkdir(output, { recursive: true });
const application = await electron.launch({
  args: [path.join(root, "scripts", "electron-fusion-qa.mjs")],
  cwd: root,
  env: { ...process.env, ITERLAY_PLAYWRIGHT: "1", ITERLAY_QA_DATA_DIR: dataDirectory, VITE_DEV_SERVER_URL: "http://127.0.0.1:5180" },
  timeout: 60_000
});
application.process().stderr?.on("data", (data) => process.stderr.write(data));
try {
  const actualDirectory = await application.evaluate(({ app }) => app.getPath("userData"));
  if (actualDirectory !== dataDirectory) throw new Error("Refusing QA against the user's real workspace");
  const page = await application.firstWindow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForLoadState("domcontentloaded");
  page.on("pageerror", (error) => console.error("Renderer error:", error.message));
  await page.waitForFunction(() => document.querySelectorAll("button").length > 3, null, { timeout: 60_000 });
  await page.addLocatorHandler(page.getByRole("button", { name: "跳过引导", exact: true }), async () => { await page.keyboard.press("Escape"); });
  await page.addLocatorHandler(page.locator(".welcome-tour"), async () => {
    const skipDemo = page.locator(".welcome-tour__skip-demo");
    if (await skipDemo.isVisible()) await skipDemo.click();
    await page.locator(".welcome-tour__service-option--official").click();
  });
  await page.locator(".prompt-fusion[data-fusion-expanded=true] > .prompt-fusion-conversation header button").last().click();
  await page.getByRole("button", { name: /从示例开始/ }).click();
  await page.locator(".react-flow__node").first().waitFor({ state: "visible", timeout: 30_000 });
  const modeSwitch = page.getByRole("switch", { name: "AI 对话模式", exact: true });
  if (await modeSwitch.getAttribute("aria-checked") !== "true") await modeSwitch.click();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const checks = [];
  const fusion = page.locator(".prompt-fusion");
  if (!process.env.ITERLAY_DRAG_ONLY) {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [size, expected] of [["small", 460], ["medium", 560], ["large", 660], ["maximum", 760]]) {
    await page.evaluate(async (size) => {
      const { setAssistantWidth } = await import("/src/lib/assistant-width.ts");
      setAssistantWidth(size);
    }, size);
    await page.waitForFunction((size) => document.querySelector(".prompt-fusion")?.getAttribute("data-assistant-width") === size, size);
    const geometry = await page.locator(".prompt-fusion").evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      overflow: element.scrollWidth > element.clientWidth
    }));
    if (Math.abs(geometry.width - expected) > 1 || geometry.overflow) throw new Error(`Invalid ${size} width: ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: path.join(output, `width-${size}.png`), scale: "css" });
    checks.push(`${size}: ${expected}px, no overflow`);
  }
  await page.evaluate(async () => {
    const { setAssistantWidth } = await import("/src/lib/assistant-width.ts");
    setAssistantWidth("medium");
  });
  await page.reload();
  await page.locator('.prompt-fusion[data-assistant-width="medium"]').waitFor();
  checks.push("width preference survives reload");
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').first().setInputFiles([path.join(root, "demo-assets/lamp-studio.jpg"), path.join(root, "demo-assets/lamp-sage.jpg")]);
  await page.waitForFunction(() => document.querySelectorAll(".prompt-fusion-image").length === 2);
  checks.push("real local reference image import");
  await page.screenshot({ path: path.join(output, "with-references-1440.png"), scale: "css" });
  for (const [width, height] of [[1440, 900], [1280, 800], [940, 998]]) {
    await page.setViewportSize({ width, height });
    await page.locator(".prompt-fusion").waitFor();
    await page.screenshot({ path: path.join(output, `chat-${width}.png`), scale: "css" });
    const geometry = await page.locator(".prompt-fusion").evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, max: globalThis.innerHeight * .72, bottom: box.bottom, viewportHeight: globalThis.innerHeight, overflow: document.documentElement.scrollWidth > globalThis.innerWidth };
    });
    if (geometry.height > geometry.max + 1 || geometry.bottom > geometry.viewportHeight || geometry.overflow) throw new Error(`Invalid dock bounds: ${JSON.stringify(geometry)}`);
    await page.locator(".prompt-fusion textarea").fill("保留这段对话草稿");
    await modeSwitch.click();
    if (await page.locator(".prompt-fusion").getAttribute("data-fusion-expanded") !== "false") throw new Error("Direct mode did not collapse");
    await page.locator(".prompt-fusion-direct-editor textarea").fill("保留台灯的金属结构与自然光背景");
    await page.screenshot({ path: path.join(output, `direct-${width}.png`), scale: "css" });
    await modeSwitch.click();
    if (await page.locator(".prompt-fusion textarea").inputValue() !== "保留这段对话草稿") throw new Error("Chat draft lost");
    if (!await page.getByRole("button", { name: "移除提示词上下文", exact: true }).isVisible()) throw new Error("Direct prompt context not carried into chat");
    await modeSwitch.click();
    if (await page.locator(".prompt-fusion-direct-editor textarea").inputValue() !== "保留台灯的金属结构与自然光背景") throw new Error("Manual generation draft lost");
    await modeSwitch.click();
    checks.push(`${width}x${height}: bounds, modes, drafts`);
  }
  await page.locator(".prompt-fusion textarea").fill("");
  await page.getByRole("button", { name: "平移 (H)", exact: true }).click();
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  const nodeBefore = await page.locator(".react-flow__node").first().getAttribute("style");
  await page.mouse.move(100, 150);
  await page.mouse.down();
  await page.mouse.move(175, 200, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator(".react-flow__viewport").getAttribute("style");
  if (before === after) throw new Error("Hand mode did not pan viewport");
  if (nodeBefore !== await page.locator(".react-flow__node").first().getAttribute("style")) throw new Error("Panning moved node layout");
  await page.keyboard.press("v");
  if (await page.getByRole("button", { name: "选择 (V)", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("V shortcut failed");
  await page.locator(".prompt-fusion textarea").focus();
  await page.keyboard.press("h");
  if (await page.getByRole("button", { name: "选择 (V)", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("Typing H switched canvas mode");
  checks.push("hand pans without moving nodes; V shortcut; typing isolation");
  await page.locator(".prompt-fusion textarea").fill("");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await modeSwitch.click();
  const hasHeightTransition = await page.locator(".prompt-fusion").evaluate((element) =>
    element.getAnimations().some((animation) => animation.effect?.getKeyframes().some((frame) => "height" in frame)));
  if (!hasHeightTransition) throw new Error("Mode switch has no height transition");
  await page.waitForTimeout(350);
  await modeSwitch.click();
  await page.waitForTimeout(350);
  await page.locator(".prompt-fusion-conversation header button").last().click();
  const hasCollapseTransition = await page.locator(".prompt-fusion").evaluate((element) =>
    element.getAnimations().some((animation) => animation.effect?.getKeyframes().some((frame) => "height" in frame)));
  if (!hasCollapseTransition) throw new Error("Collapse has no height transition");
  await page.waitForTimeout(350);
  await page.locator(".prompt-fusion-collapsed button").click();
  await page.waitForTimeout(350);
  if (await page.locator(".fusion-greeting-sender").count()) throw new Error("Duplicate assistant name remains");
  checks.push("04 switch; actual mode/collapse height transitions; no duplicate sender title");
  await page.screenshot({ path: path.join(output, "switch-04-chat.png"), scale: "css" });
  await modeSwitch.click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "switch-04-direct.png"), scale: "css" });
  await modeSwitch.click();
  await page.waitForTimeout(350);
  if (await page.locator(".prompt-fusion-keyboard").count()) throw new Error("Keyboard hint remains");
  await page.locator(".prompt-fusion textarea").fill("拖拽后保留的草稿");
  const dragHeader = async (x, y) => {
    const header = await fusion.locator(".prompt-fusion-conversation header").boundingBox();
    await page.mouse.move(header.x + 100, header.y + 22);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 16 });
    await page.mouse.up();
  };
  await dragHeader(550, 130);
  if (await fusion.getAttribute("data-assistant-dock-side") !== "floating") throw new Error("Free drag unexpectedly docked");
  await page.screenshot({ path: path.join(output, "drag-floating.png"), scale: "css" });
  for (const side of ["left", "right"]) {
    await dragHeader(side === "left" ? 30 : 1400, 150);
    await page.waitForFunction((side) => document.querySelector(".prompt-fusion")?.getAttribute("data-assistant-dock-side") === side, side);
    const bounds = await fusion.boundingBox();
    if (Math.abs(bounds.y - 48) > 1 || Math.abs(bounds.height - 852) > 1) throw new Error(`Invalid ${side} sidebar bounds: ${JSON.stringify(bounds)}`);
    if (await fusion.locator(".prompt-fusion-collapsed").count()) throw new Error(`Docked ${side} assistant should not show a conversation expand row`);
    if (!await fusion.locator(".prompt-fusion-conversation").isVisible()) throw new Error(`Docked ${side} assistant conversation is not expanded`);
    const logOverflow = await fusion.locator('[data-assistant-appearance="fusion"] [role="log"]').evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      overscrollBehavior: getComputedStyle(element).overscrollBehavior
    }));
    if (logOverflow.overflowY !== "auto" || logOverflow.overscrollBehavior !== "contain") {
      throw new Error(`Docked assistant log is not an isolated scroll surface: ${JSON.stringify(logOverflow)}`);
    }
    const resizeHandle = fusion.locator("[data-assistant-dock-resize-handle]");
    if (await resizeHandle.count() !== 1) throw new Error(`Missing ${side} dock resize handle`);
    const handleOpacity = await resizeHandle.locator("> span").evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
    if (handleOpacity <= 0) throw new Error(`Docked ${side} assistant resize handle is not discoverable`);
    const beforeDockResize = await fusion.boundingBox();
    if (!await fusion.evaluate((element) => element.classList.contains("nowheel"))) {
      throw new Error(`Docked ${side} assistant does not own wheel scrolling`);
    }
    const resizeHandleBounds = await resizeHandle.boundingBox();
    await page.mouse.move(
      resizeHandleBounds.x + resizeHandleBounds.width / 2,
      resizeHandleBounds.y + resizeHandleBounds.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      resizeHandleBounds.x + resizeHandleBounds.width / 2 + (side === "right" ? 72 : -72),
      resizeHandleBounds.y + resizeHandleBounds.height / 2,
      { steps: 8 }
    );
    await page.mouse.up();
    const afterDockResize = await fusion.boundingBox();
    if ((beforeDockResize.width - afterDockResize.width) < 24) {
      throw new Error(`Docked ${side} assistant did not resize: ${JSON.stringify({ beforeDockResize, afterDockResize })}`);
    }
    checks.push(`${side}: isolated message scroll and edge width resize`);
    await page.screenshot({ path: path.join(output, `docked-${side}.png`), scale: "css" });
    await fusion.getByRole("button", { name: "收起 AI 助手", exact: true }).click();
    await page.getByRole("button", { name: "展开 AI 助手", exact: true }).click();
    await dragHeader(700, 150);
    if (await fusion.getAttribute("data-assistant-dock-side") !== "floating") throw new Error(`Cannot detach ${side} sidebar`);
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".react-flow");
      const bounds = canvas?.getBoundingClientRect();
      return bounds && Math.abs(bounds.left) < 1 && Math.abs(bounds.right - globalThis.innerWidth) < 1;
    }, null, { timeout: 3000 });
    await page.screenshot({ path: path.join(output, `detached-${side}.png`), scale: "css" });
    if (await page.locator(".prompt-fusion textarea").inputValue() !== "拖拽后保留的草稿") throw new Error("Drag lost draft");
  }
  for (const side of ["left", "right"]) {
    await page.waitForTimeout(350);
    await dragHeader(side === "left" ? 30 : 1400, 150);
    await page.waitForFunction((side) => document.querySelector(".prompt-fusion")?.getAttribute("data-assistant-dock-side") === side, side);
    await modeSwitch.click();
    const handle = await fusion.locator(".prompt-fusion-conversation header").boundingBox();
    await page.mouse.move(handle.x + 100, handle.y + 16);
    await page.mouse.down();
    await page.mouse.move(700, 180, { steps: 16 });
    await page.waitForFunction(() => {
      const bounds = document.querySelector(".react-flow")?.getBoundingClientRect();
      return bounds && Math.abs(bounds.left) < 1 && Math.abs(bounds.right - globalThis.innerWidth) < 1;
    }, null, { timeout: 3000 });
    await page.mouse.up();
    if (await fusion.getAttribute("data-assistant-dock-side") !== "floating") throw new Error(`Direct mode cannot detach ${side}`);
    if (await fusion.getAttribute("data-assistant-dragging") !== null) throw new Error("Direct-mode drag lost pointerup");
    await page.screenshot({ path: path.join(output, `detached-direct-${side}.png`), scale: "css" });
    await modeSwitch.click();
  }
  checks.push("direct-mode left/right detach releases canvas during drag and completes pointerup");
  checks.push("no keyboard hint; free drag; left/right docking, collapse, expand, detach; draft preserved");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const release of ["pointerup", "lostpointercapture", "blur", "missing-pointerup"]) {
    console.log(`Checking drag release: ${release}`);
    const handle = await fusion.locator(".prompt-fusion-conversation header").boundingBox();
    await page.mouse.move(handle.x + 100, handle.y + 22);
    await page.mouse.down();
    await page.mouse.move(handle.x + 150, handle.y + 60, { steps: 10 });
    if (release === "pointerup") await page.mouse.up();
    else if (release === "blur") await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event("blur")));
    else if (release === "lostpointercapture") {
      await fusion.evaluate((element) => {
        for (let pointerId = 1; pointerId < 10; pointerId++) {
          if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
        }
      });
      // Browsers process pending capture changes before the next pointer event.
      await page.mouse.move(handle.x + 151, handle.y + 60);
    }
    else await fusion.evaluate((element) => {
      for (let pointerId = 1; pointerId < 10; pointerId++) {
        if (element.hasPointerCapture(pointerId)) globalThis.dispatchEvent(new globalThis.PointerEvent("pointermove", {
          pointerId, pointerType: "mouse", buttons: 0, clientX: 1200, clientY: 600
        }));
      }
    });
    await page.waitForFunction(() => !document.querySelector(".prompt-fusion")?.hasAttribute("data-assistant-dragging"));
    await page.mouse.up();
    const resting = await fusion.boundingBox();
    await page.mouse.move(800, 300, { steps: 15 });
    await page.waitForTimeout(100);
    const hovered = await fusion.boundingBox();
    if (Math.abs(resting.x - hovered.x) > 1 || Math.abs(resting.y - hovered.y) > 1) throw new Error(`${release}: dock follows idle mouse ${JSON.stringify({ resting, hovered })}`);
    if (await fusion.evaluate(element => element.style.translate !== "")) throw new Error(`${release}: transient translate not cleared`);
    checks.push(`${release}: idle hover never moves the dock`);
  }
  if (errors.length) throw new Error(`Renderer errors: ${errors.join("\n")}`);
  await writeFile(path.join(output, "checks.json"), JSON.stringify({ checks, errors }, null, 2));
  await page.screenshot({ path: path.join(output, "startup.png") });
  await writeFile(path.join(output, "startup.txt"), await page.locator("body").innerText());
  console.log(JSON.stringify({ dataDirectory, url: page.url(), checks, errors, body: (await page.locator("body").innerText()).slice(0, 2500) }));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  // The isolated main process can wait on shutdown work; never strand QA.
  let watchdog;
  try {
    await Promise.race([
      application.close(),
      new Promise((resolve) => {
        watchdog = setTimeout(() => { application.process().kill("SIGTERM"); resolve(); }, 5000);
      })
    ]);
  } finally { globalThis.clearTimeout(watchdog); }
}
process.exit(0);
