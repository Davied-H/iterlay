/* global getComputedStyle, performance, requestAnimationFrame */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "output", "playwright");
await mkdir(outputDirectory, { recursive: true });
const qaUserDataDirectory = await mkdtemp(path.join(tmpdir(), "iterlay-template-assistant-qa-"));

const electronApp = await electron.launch({
  args: [`--user-data-dir=${qaUserDataDirectory}`, "."],
  cwd: projectRoot,
  ...(process.env.ITERLAY_E2E_ELECTRON
    ? { executablePath: process.env.ITERLAY_E2E_ELECTRON }
    : {}),
  env: {
    ...process.env,
    ITERLAY_PLAYWRIGHT: "1",
    VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL
      ?? "http://127.0.0.1:5180/?preview=scene-detail"
  },
  timeout: 30_000
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setWindowSize(page, width, height) {
  const window = await electronApp.browserWindow(page);
  await window.evaluate((browserWindow, size) => {
    browserWindow.setContentSize(size.width, size.height);
    browserWindow.center();
  }, { width, height });
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  const viewport = await page.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
  assert(viewport.width === width, `Expected viewport width ${width}, received ${viewport.width}`);
}

async function openAssistant(page) {
  await page.getByRole("button", { name: "AI 助手" }).click();
  await page.getByLabel("使用模板：参考图风格拆解").waitFor({ state: "visible" });
}

async function createProposal(page, brief) {
  const assistant = page.getByLabel("使用模板：参考图风格拆解");
  const input = assistant.getByLabel("描述这次如何使用模板");
  await input.fill(brief);
  await assistant.getByRole("button", { name: "发送给模板使用助手" }).click();
  await assistant.getByRole("button", { name: "应用提示词", exact: true }).waitFor({ state: "visible" });
  assert(await input.inputValue() === "", "Template assistant composer was not cleared after sending");
  assert(await page.getByLabel("描述本次要生成的画面").inputValue() === "", "Page prompt dock was not cleared after sending to the assistant");
  return assistant;
}

try {
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180"))
    ?? firstWindow;
  await page.waitForURL(/preview=scene-detail/u, { timeout: 30_000 });
  await page.getByRole("button", { name: "AI 助手" }).waitFor({ state: "visible", timeout: 20_000 });

  await setWindowSize(page, 1280, 900);
  await openAssistant(page);
  const initialStage = await page.locator('[data-template-creation-dock] [aria-label^="当前创作阶段"]').getAttribute("aria-label");
  assert(initialStage?.includes("描述需求"), `Opening the assistant advanced the workflow: ${initialStage}`);
  const initialAssistant = page.getByLabel("使用模板：参考图风格拆解");
  const initialAssistantBounds = await initialAssistant.boundingBox();
  const initialPrimaryBounds = await page.locator('[data-template-assistant-primary=""]').boundingBox();
  assert((initialAssistantBounds?.width ?? Infinity) <= 362, `Desktop assistant is too wide: ${JSON.stringify(initialAssistantBounds)}`);
  assert((initialPrimaryBounds?.x ?? Infinity) + (initialPrimaryBounds?.width ?? Infinity) <= (initialAssistantBounds?.x ?? 0) + 1, "Desktop assistant overlaps the primary workspace");
  assert(await initialAssistant.getByRole("button", { name: /模板约束/u }).getAttribute("aria-expanded") === "false", "Template constraints should be collapsed by default");
  await page.screenshot({ path: path.join(outputDirectory, "template-assistant-desktop-initial.png") });

  const brief = "生成一个面向设计师的移动端作品集首页，突出案例封面和联系入口";
  const assistant = await createProposal(page, brief);
  const proposalStage = await page.locator('[data-template-creation-dock] [aria-label^="当前创作阶段"]').getAttribute("aria-label");
  assert(proposalStage?.includes("确认方案"), `Proposal did not advance to confirmation: ${proposalStage}`);
  const usageGuide = assistant.getByRole("button", { name: /模板约束/u });
  assert(await usageGuide.getAttribute("aria-expanded") === "false", "Template guide did not collapse after the conversation started");
  const conversationBounds = await assistant.getByRole("log").locator("..").boundingBox();
  assert((conversationBounds?.height ?? 0) >= 300, `Conversation area is still too short: ${JSON.stringify(conversationBounds)}`);
  await usageGuide.click();
  assert(await assistant.locator('[data-request-status="included"]').count() > 0, "Checklist did not mark proposal data as included");
  await usageGuide.click();
  await page.waitForTimeout(200);
  assert(await assistant.getByRole("button", { name: "应用提示词", exact: true }).count() === 1, "Assistant rendered duplicate apply actions");
  assert(await assistant.getByRole("button", { name: "立即生成", exact: true }).count() === 1, "Assistant did not render immediate generation");
  await page.screenshot({ path: path.join(outputDirectory, "template-assistant-desktop-proposal.png") });

  await assistant.getByRole("button", { name: "关闭模板使用助手" }).click();
  const pageApply = page.getByLabel("模板创作坞").getByRole("button", { name: "采用方案", exact: true });
  await pageApply.waitFor({ state: "visible" });
  assert(await pageApply.isEnabled(), "Pending proposal is not actionable after closing the assistant");
  assert(await page.getByLabel("描述本次要生成的画面").inputValue() === "", "Sent assistant draft reappeared in the page prompt dock");
  await page.screenshot({ path: path.join(outputDirectory, "template-assistant-desktop-pending.png") });

  await pageApply.click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-template-creation-action=""]') ?? false, undefined, { timeout: 1_500 });
  assert(!await page.locator("#template-creation-tray").isVisible().catch(() => false), "Applying opened the removed proposal tray");
  const focusOnCreationAction = await page.evaluate(() => document.activeElement?.matches('[data-template-creation-action=""]') ?? false);
  assert(focusOnCreationAction, "Focus did not move to the generation action after applying");

  await page.reload();
  await page.getByRole("button", { name: "AI 助手" }).waitFor({ state: "visible" });
  await setWindowSize(page, 1280, 900);
  await openAssistant(page);
  const directApplyAssistant = await createProposal(page, "生成一个面向创作者的案例展示页，重点呈现作品缩略图和联系入口");
  const editedProposal = [
    "食物主体：宫保鸡丁，酱色油亮，花生米、干辣椒段、葱段与青红椒丁层次分明。",
    "顶部悬浮元素：炸花生米、辣椒碎、葱花与酱汁液滴冻结在空中。",
    "分层结构：主菜、酱汁层、配菜层与白色陶瓷盘垂直爆炸分层展示。",
    "视觉要求：白色背景，商品信息图构图，材质真实，标签清晰。"
  ].join("\n");
  await directApplyAssistant.getByLabel("确认生成方案内容").fill(editedProposal);
  const exitLayoutFramesPromise = page.evaluate(() => new Promise((resolve) => {
    const frames = [];
    const startedAt = performance.now();
    const sample = () => {
      const workspace = document.querySelector('[data-template-detail-workspace="concept-c"]');
      const sidebar = document.querySelector('[data-template-assistant-sidebar="workspace"]');
      frames.push({
        elapsed: performance.now() - startedAt,
        columns: workspace ? getComputedStyle(workspace).gridTemplateColumns : "",
        sidebarConnected: Boolean(sidebar),
        trayVisible: Boolean(document.querySelector("#template-creation-tray"))
      });
      if (performance.now() - startedAt < 320) requestAnimationFrame(sample);
      else resolve(frames);
    };
    requestAnimationFrame(sample);
  }));
  await directApplyAssistant.getByRole("button", { name: "应用提示词", exact: true }).click();
  const exitLayoutFrames = await exitLayoutFramesPromise;
  const exitingSidebarFrames = exitLayoutFrames.filter((frame) => frame.sidebarConnected);
  assert(exitingSidebarFrames.every((frame) => frame.columns.trim().split(/\s+/u).length === 2), `Assistant exit collapsed the grid before unmount: ${JSON.stringify(exitingSidebarFrames)}`);
  assert(exitLayoutFrames.every((frame) => !frame.trayVisible), `Creation tray flashed during assistant exit: ${JSON.stringify(exitLayoutFrames)}`);
  await page.locator('[data-template-assistant-sidebar="workspace"]').waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.matches('[data-template-creation-action=""]') ?? false, undefined, { timeout: 1_500 });
  assert(!await page.locator("#template-creation-tray").isVisible().catch(() => false), "Direct assistant confirmation opened a second proposal surface");
  const directApplyFocusOnAction = await page.evaluate(() => document.activeElement?.matches('[data-template-creation-action=""]') ?? false);
  assert(directApplyFocusOnAction, "Direct assistant confirmation did not focus the generation action");
  await page.waitForTimeout(250);
  const creationPrompt = page.getByLabel("描述本次要生成的画面");
  const creationPromptGrip = page.locator('[data-template-prompt-grip=""]');
  const autoPromptBounds = await creationPrompt.boundingBox();
  assert((autoPromptBounds?.height ?? 0) > 80, `Applied prompt did not auto-grow: ${JSON.stringify(autoPromptBounds)}`);
  await page.screenshot({ path: path.join(outputDirectory, "template-prompt-dock-auto-height.png") });

  const gripBounds = await creationPromptGrip.boundingBox();
  assert(gripBounds, "Template prompt resize grip is not visible");
  await page.mouse.move(gripBounds.x + gripBounds.width / 2, gripBounds.y + gripBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBounds.x + gripBounds.width / 2, gripBounds.y + gripBounds.height / 2 - 72, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const draggedPromptBounds = await creationPrompt.boundingBox();
  const mediaStageBounds = await page.locator("[data-scene-preview-stage]").boundingBox();
  assert((draggedPromptBounds?.height ?? 0) >= (autoPromptBounds?.height ?? 0) + 60, `Dragging the grip did not grow the prompt: ${JSON.stringify({ autoPromptBounds, draggedPromptBounds })}`);
  assert((mediaStageBounds?.height ?? 0) >= 320, `Prompt resize squeezed the media stage below its minimum: ${JSON.stringify(mediaStageBounds)}`);
  await page.screenshot({ path: path.join(outputDirectory, "template-prompt-dock-dragged.png") });

  await creationPromptGrip.dblclick();
  await page.waitForTimeout(250);
  const resetPromptBounds = await creationPrompt.boundingBox();
  assert((resetPromptBounds?.height ?? Infinity) < (draggedPromptBounds?.height ?? 0), `Double-click did not restore content-fit height: ${JSON.stringify({ draggedPromptBounds, resetPromptBounds })}`);
  await page.getByRole("button", { name: "调整方案" }).click();
  const reopenedAssistant = page.getByLabel("使用模板：参考图风格拆解");
  assert(await reopenedAssistant.getByLabel("确认生成方案内容").inputValue() === editedProposal, "Inline proposal edits were not preserved");
  await reopenedAssistant.getByRole("button", { name: "关闭模板使用助手" }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDirectory, "template-assistant-desktop-applied.png") });

  await page.reload();
  await page.getByRole("button", { name: "AI 助手" }).waitFor({ state: "visible" });
  await setWindowSize(page, 390, 844);
  await openAssistant(page);
  const mobileSidebar = page.locator('[data-template-assistant-sidebar="workspace"]');
  await mobileSidebar.waitFor({ state: "visible" });
  assert(await mobileSidebar.getAttribute("aria-modal") !== "true", "Narrow assistant is still exposed as a modal dialog");
  assert(await page.locator('[data-template-assistant-primary=""]').isHidden(), "Primary workspace should yield to the narrow assistant view");

  const mobileBounds = await mobileSidebar.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  assert(mobileBounds.scrollWidth <= mobileBounds.clientWidth, `Narrow assistant overflows horizontally: ${JSON.stringify(mobileBounds)}`);
  await page.screenshot({ path: path.join(outputDirectory, "template-assistant-mobile-sidebar.png") });
  const mobileProposal = await createProposal(page, "生成一张移动端作品集首页，重点突出案例封面和联系入口");
  await page.waitForTimeout(300);
  const mobileProposalBounds = await mobileProposal.getByRole("region", { name: "确认生成方案" }).boundingBox();
  const mobileProposalLayout = await page.evaluate(() => {
    const workspace = document.querySelector('[data-template-detail-workspace="concept-c"]');
    const sidebar = document.querySelector('[data-template-assistant-sidebar="workspace"]');
    const assistant = document.querySelector('[aria-label^="使用模板："]');
    const panel = document.querySelector('[aria-label="确认生成方案"]');
    const read = (element) => element ? {
      rect: element.getBoundingClientRect().toJSON(),
      transform: getComputedStyle(element).transform,
      overflowX: getComputedStyle(element).overflowX
    } : null;
    return { workspace: read(workspace), sidebar: read(sidebar), assistant: read(assistant), panel: read(panel) };
  });
  await page.screenshot({ path: path.join(outputDirectory, "template-assistant-mobile-proposal.png") });
  assert((mobileProposalBounds?.x ?? -1) >= 0, `Mobile proposal starts outside the viewport: ${JSON.stringify({ mobileProposalBounds, mobileProposalLayout })}`);
  assert((mobileProposalBounds?.x ?? 0) + (mobileProposalBounds?.width ?? Infinity) <= 390, `Mobile proposal exceeds the viewport: ${JSON.stringify({ mobileProposalBounds, mobileProposalLayout })}`);
  const mobileAppliedPrompt = [
    "页面结构：顶部品牌区，中部案例瀑布流，底部联系入口。",
    "视觉要求：克制留白、清晰层级、移动端安全边距。",
    "内容重点：案例封面、项目标签、联系方式。"
  ].join("\n");
  await mobileProposal.getByLabel("确认生成方案内容").fill(mobileAppliedPrompt);
  await mobileProposal.getByRole("button", { name: "应用提示词", exact: true }).click();
  await mobileSidebar.waitFor({ state: "hidden" });
  await page.waitForTimeout(250);
  const mobilePromptBounds = await page.getByLabel("描述本次要生成的画面").boundingBox();
  const mobileDockBounds = await page.locator('[data-template-prompt-dock=""]').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  assert((mobilePromptBounds?.height ?? 0) > 80, `Hidden mobile prompt did not auto-grow after apply: ${JSON.stringify(mobilePromptBounds)}`);
  assert(mobileDockBounds.scrollWidth <= mobileDockBounds.clientWidth, `Mobile prompt dock overflows horizontally: ${JSON.stringify(mobileDockBounds)}`);
  await page.screenshot({ path: path.join(outputDirectory, "template-prompt-dock-mobile-auto-height.png") });

  console.log(JSON.stringify({
    initialStage,
    desktopAssistantWidth: initialAssistantBounds?.width,
    proposalStage,
    conversationHeight: conversationBounds?.height,
    usageGuideAutoCollapsed: true,
    pendingProposalSurvivedClose: true,
    appliedFocusMovedToAction: true,
    directInlineConfirmationPassed: true,
    exitLayoutStable: true,
    promptAutoHeight: autoPromptBounds?.height,
    promptDraggedHeight: draggedPromptBounds?.height,
    promptResetHeight: resetPromptBounds?.height,
    mobileUsesWorkspaceSidebar: true,
    mobileBounds,
    mobileProposalBounds,
    mobileProposalLayout,
    mobilePromptHeight: mobilePromptBounds?.height,
    mobileDockBounds
  }, null, 2));
} finally {
  await electronApp.close();
  await rm(qaUserDataDirectory, { recursive: true, force: true });
}
