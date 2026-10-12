/* global HTMLElement, getComputedStyle, localStorage, window */

import { copyFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "output", "playwright");
await mkdir(outputDirectory, { recursive: true });
const qaUserDataDirectory = await mkdtemp(path.join(tmpdir(), "iterlay-sidebar-qa-"));
const qaWorkspaceDirectory = path.join(qaUserDataDirectory, "workspace");
const sourceWorkspaceDirectory = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "Iterlay",
  "workspace"
);
await mkdir(qaWorkspaceDirectory, { recursive: true });
await Promise.all([
  cp(path.join(sourceWorkspaceDirectory, "boards"), path.join(qaWorkspaceDirectory, "boards"), { recursive: true }),
  copyFile(path.join(sourceWorkspaceDirectory, "license.dat"), path.join(qaWorkspaceDirectory, "license.dat")),
  copyFile(path.join(sourceWorkspaceDirectory, "settings.json"), path.join(qaWorkspaceDirectory, "settings.json")),
  copyFile(path.join(sourceWorkspaceDirectory, "onboarding.json"), path.join(qaWorkspaceDirectory, "onboarding.json"))
]);

const electronApp = await electron.launch({
  args: [`--user-data-dir=${qaUserDataDirectory}`, "."],
  cwd: projectRoot,
  ...(process.env.ITERLAY_E2E_ELECTRON
    ? { executablePath: process.env.ITERLAY_E2E_ELECTRON }
    : {}),
  env: {
    ...process.env,
    ITERLAY_PLAYWRIGHT: "1",
    VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5180"
  },
  timeout: 30_000
});

async function openLibrary(page) {
  const separator = page.getByRole("separator", { name: "调整侧边栏宽度" });
  if (await separator.isVisible().catch(() => false)) return separator;
  const trigger = page.getByRole("button", { name: "打开画板库" });
  await trigger.waitFor({ state: "visible", timeout: 20_000 });
  await trigger.focus();
  const triggerTooltip = page.getByRole("tooltip").filter({ hasText: "打开画板库" });
  await triggerTooltip.waitFor({ state: "visible", timeout: 1_000 });
  await trigger.click();
  await separator.waitFor({ state: "visible", timeout: 10_000 });
  await triggerTooltip.waitFor({ state: "hidden", timeout: 1_000 });
  return separator;
}

async function sidebarWidth(page) {
  return page.locator("#library-sidebar").evaluate((element) => element.getBoundingClientRect().width);
}

async function expectSidebarWidth(page, expected) {
  try {
    await page.waitForFunction((targetWidth) => {
      const element = document.querySelector("#library-sidebar");
      return element instanceof HTMLElement
        && Math.abs(element.getBoundingClientRect().width - targetWidth) <= 0.5;
    }, expected, { timeout: 2_500 });
  } catch {
    const actual = await sidebarWidth(page).catch(() => null);
    throw new Error(`Timed out waiting for sidebar width ${expected}px; received ${actual}px`);
  }
  const actual = await sidebarWidth(page);
  if (Math.abs(actual - expected) > 0.5) {
    throw new Error(`Expected sidebar width ${expected}px, received ${actual}px`);
  }
  return actual;
}

async function dragSeparator(page, separator, deltaX) {
  const box = await separator.boundingBox();
  if (!box) throw new Error("Sidebar separator has no bounding box");
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height - 24, Math.max(80, box.height * 0.55));
  const hitTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName ?? null,
      className: element instanceof HTMLElement ? element.className : null,
      appRegion: element instanceof HTMLElement ? getComputedStyle(element).getPropertyValue("-webkit-app-region") : null,
      box: element instanceof HTMLElement ? element.getBoundingClientRect().toJSON() : null
    };
  }, { x, y });
  if (hitTarget.tag !== "BUTTON" || !String(hitTarget.className).includes("library-sidebar-resize-handle")) {
    throw new Error(`Sidebar separator is not the pointer hit target: ${JSON.stringify(hitTarget)}`);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(180);
}

try {
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180"))
    ?? firstWindow;
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });
  await page.evaluate(() => localStorage.removeItem("iterlay.librarySidebarSize"));
  await page.reload();

  let separator = await openLibrary(page);
  const defaultWidth = await expectSidebarWidth(page, 240);
  const defaultScreenshot = path.join(outputDirectory, "library-sidebar-default.png");
  await page.screenshot({ path: defaultScreenshot });

  const boardSearchInput = page.getByRole("textbox", { name: "搜索画板", exact: true });
  const boardSearchBounds = await boardSearchInput.boundingBox();
  const boardControlsBounds = await page.locator("[data-board-controls]").boundingBox();
  if (
    !boardSearchBounds
    || !boardControlsBounds
    || boardSearchBounds.y < boardControlsBounds.y
    || boardSearchBounds.y + boardSearchBounds.height > boardControlsBounds.y + boardControlsBounds.height
  ) {
    throw new Error(`Board search is not contained by the secondary controls row: ${JSON.stringify({
      boardSearchBounds,
      boardControlsBounds
    })}`);
  }
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  if (!await boardSearchInput.evaluate((element) => element === document.activeElement)) {
    throw new Error("Board search shortcut did not focus the relocated input");
  }
  await boardSearchInput.fill("画板 9");
  if (await boardSearchInput.inputValue() !== "画板 9") {
    throw new Error("Board search did not retain the entered query");
  }
  await page.keyboard.press("Escape");
  if (await boardSearchInput.inputValue() !== "") {
    throw new Error("Escape did not clear the board search");
  }

  const moreButton = page.getByRole("button", { name: "更多", exact: true });
  await moreButton.click();
  await page.getByRole("menuitem", { name: /回收站/u }).waitFor({ state: "visible" });
  await page.getByRole("menuitem", { name: "设置", exact: true }).waitFor({ state: "visible" });
  const utilityMenuScreenshot = path.join(outputDirectory, "library-sidebar-more-menu.png");
  await page.screenshot({ path: utilityMenuScreenshot });
  await page.getByText("工作台", { exact: true }).click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).waitFor({ state: "hidden" });

  const createNav = page.getByRole("button", { name: "新建创作", exact: true });
  await createNav.click();
  await page.waitForTimeout(300);
  const createPageScreenshot = path.join(outputDirectory, "library-create-page-layer.png");
  await page.screenshot({ path: createPageScreenshot });
  const createTabState = await page.locator("#library-sidebar").getAttribute("data-active-tab").catch(() => null);
  if (createTabState !== "create") {
    throw new Error(`Create entry did not activate the create tab: ${JSON.stringify({ createTabState, url: page.url() })}`);
  }
  await page.getByRole("heading", { name: "今天想创作什么？" }).waitFor({ state: "visible" });
  const canvasZoomToolbar = page.locator('[data-tour="zoom"]');
  const zoomToolbarExposed = await canvasZoomToolbar.evaluate((toolbar) => {
    const rect = toolbar.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hitTarget === toolbar || toolbar.contains(hitTarget);
  }).catch(() => false);
  if (zoomToolbarExposed) {
    throw new Error("Canvas zoom toolbar leaked through the standalone create page");
  }
  await page.getByRole("button", { name: "画板库", exact: true }).click();

  await page.getByRole("button", { name: "收起侧边栏", exact: true }).click();
  const explicitCompactWidth = await expectSidebarWidth(page, 56);
  await page.getByRole("button", { name: "展开侧边栏", exact: true }).click();
  const explicitExpandedWidth = await expectSidebarWidth(page, 240);

  await dragSeparator(page, separator, -32);
  const mediumWidth = await expectSidebarWidth(page, 208);

  await dragSeparator(page, separator, -152);
  const smallWidth = await expectSidebarWidth(page, 56);

  await dragSeparator(page, separator, 100);
  const continuousToMediumWidth = await expectSidebarWidth(page, 208);

  await separator.press("ArrowRight");
  const keyboardPresetWidth = await expectSidebarWidth(page, 240);

  await separator.press("ArrowLeft");
  await expectSidebarWidth(page, 208);
  const box = await separator.boundingBox();
  if (!box) throw new Error("Sidebar separator disappeared before double click");
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.55);
  const doubleClickWidth = await expectSidebarWidth(page, 240);

  await separator.press("ArrowLeft");
  await expectSidebarWidth(page, 208);
  await separator.press("Escape");
  await separator.waitFor({ state: "hidden" });
  separator = await openLibrary(page);
  const reopenedWidth = await expectSidebarWidth(page, 208);

  await separator.press("Home");
  await expectSidebarWidth(page, 56);
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.setSize(980, 680);
  });
  await page.waitForTimeout(250);
  const minimumWindowScreenshot = path.join(outputDirectory, "library-sidebar-small-min-window.png");
  await page.screenshot({ path: minimumWindowScreenshot });

  const templatesNav = page.getByRole("button", { name: "模版库", exact: true });
  await templatesNav.hover();
  const templatesTooltip = page.locator("[data-compact-sidebar-tooltip]").filter({ hasText: "模版库" });
  await templatesTooltip.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const templatesTooltipBounds = await templatesTooltip.boundingBox();
  if (!templatesTooltipBounds || templatesTooltipBounds.x < 56 || templatesTooltipBounds.width < 40) {
    throw new Error(`Compact navigation tooltip is misplaced: ${JSON.stringify(templatesTooltipBounds)}`);
  }
  const compactTooltipScreenshot = path.join(outputDirectory, "library-sidebar-small-template-tooltip.png");
  await page.screenshot({ path: compactTooltipScreenshot });

  const recentBoardsTrigger = page.getByRole("button", { name: "最近画板", exact: true });
  const recentBoardsMenu = page.getByRole("menu", { name: "最近画板", exact: true });
  await recentBoardsTrigger.hover();
  await recentBoardsMenu.waitFor({ state: "visible" });
  const compactMenuScreenshot = path.join(outputDirectory, "library-sidebar-small-recents.png");
  await page.screenshot({ path: compactMenuScreenshot });
  const menuBounds = await recentBoardsMenu.boundingBox();
  if (!menuBounds) throw new Error("Recent boards menu has no bounding box");
  await page.mouse.move(menuBounds.x + 20, menuBounds.y + 20, { steps: 8 });
  await page.waitForTimeout(420);
  if (!await recentBoardsMenu.isVisible()) throw new Error("Recent boards menu closed while the pointer was inside it");
  await page.mouse.move(700, 600);
  await recentBoardsMenu.waitFor({ state: "hidden", timeout: 1_000 });

  await recentBoardsTrigger.focus();
  await recentBoardsTrigger.press("ArrowDown");
  await recentBoardsMenu.waitFor({ state: "visible" });
  const firstRecentBoard = recentBoardsMenu.getByRole("menuitem").first();
  await firstRecentBoard.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem", null, { timeout: 500 });
  if (!await firstRecentBoard.evaluate((element) => element === document.activeElement)) {
    throw new Error("Keyboard opening did not focus the first recent board");
  }
  await firstRecentBoard.press("Escape");
  await recentBoardsMenu.waitFor({ state: "hidden" });

  const compactMetrics = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("#library-sidebar .library-sidebar-label")];
    const navItems = [...document.querySelectorAll("#library-sidebar .library-sidebar-nav-item")];
    return {
      labelsHidden: labels.every((element) => getComputedStyle(element).display === "none"),
      navItemWidths: navItems.map((element) => element.getBoundingClientRect().width)
    };
  });
  if (!compactMetrics.labelsHidden || compactMetrics.navItemWidths.some((width) => Math.abs(width - 40) > 0.5)) {
    throw new Error(`Compact rail metrics are invalid: ${JSON.stringify(compactMetrics)}`);
  }

  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector("#library-sidebar")?.getBoundingClientRect();
    const main = document.querySelector("#library-sidebar")?.nextElementSibling?.nextElementSibling?.getBoundingClientRect();
    const stored = localStorage.getItem("iterlay.librarySidebarSize");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sidebar: sidebar ? { left: sidebar.left, right: sidebar.right, width: sidebar.width } : null,
      main: main ? { left: main.left, right: main.right, width: main.width } : null,
      stored
    };
  });

  if (!layout.sidebar || !layout.main || Math.abs(layout.sidebar.right - layout.main.left) > 0.5) {
    throw new Error(`Sidebar and main content are not aligned: ${JSON.stringify(layout)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    widths: {
      default: defaultWidth,
      explicitCompact: explicitCompactWidth,
      explicitExpanded: explicitExpandedWidth,
      medium: mediumWidth,
      small: smallWidth,
      continuousToMedium: continuousToMediumWidth,
      keyboardPreset: keyboardPresetWidth,
      doubleClickDefault: doubleClickWidth,
      reopened: reopenedWidth
    },
    compactMetrics,
    boardSearchBounds,
    boardControlsBounds,
    templatesTooltipBounds,
    menuBounds,
    layout,
    screenshots: [
      defaultScreenshot,
      utilityMenuScreenshot,
      createPageScreenshot,
      minimumWindowScreenshot,
      compactTooltipScreenshot,
      compactMenuScreenshot
    ]
  }, null, 2));
} finally {
  await electronApp.close();
  await rm(qaUserDataDirectory, { recursive: true, force: true });
}
