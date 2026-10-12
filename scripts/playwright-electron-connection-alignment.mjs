/* global DOMPoint, HTMLElement, KeyboardEvent, PointerEvent, SVGGeometryElement, getComputedStyle, window */

import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceWorkspace = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "Iterlay",
  "workspace"
);
const boardId = "7f1b9dd9-ac0d-4021-a8b5-ff0d537cbf7b";
const sourceNodeId = "7dc26f35-bacc-4ef5-936c-3708a654488c";
const targetNodeId = "6b028b52-a452-456e-a9ef-7744e6d6a791";
const outputDirectory = path.join(projectRoot, "output", "playwright");
const qaUserDataDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "iterlay-connection-alignment-")));
const qaWorkspace = path.join(qaUserDataDirectory, "workspace");
const qaBoards = path.join(qaWorkspace, "boards");
const qaOutputs = path.join(qaWorkspace, "outputs");

await mkdir(qaBoards, { recursive: true });
await mkdir(qaOutputs, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

const sourceBoard = JSON.parse(await readFile(path.join(sourceWorkspace, "boards", `${boardId}.json`), "utf8"));
const sourceSettings = JSON.parse(await readFile(path.join(sourceWorkspace, "settings.json"), "utf8"));
const sourceNodes = sourceBoard.nodes.filter((node) => node.id === sourceNodeId || node.id === targetNodeId);
const qaNodes = sourceNodes.map((node) => ({
  ...node,
  imagePath: path.join(qaOutputs, path.basename(node.imagePath))
}));
const qaBoard = {
  ...sourceBoard,
  nodes: qaNodes,
  connections: [],
  viewport: undefined
};
const qaSettings = {
  ...sourceSettings,
  canvasMinimapVisible: false,
  canvasImageToolbarOnHover: false
};
await Promise.all([
  ...sourceNodes.map((node, index) => copyFile(node.imagePath, qaNodes[index].imagePath)),
  writeFile(path.join(qaBoards, `${boardId}.json`), `${JSON.stringify(qaBoard, null, 2)}\n`),
  writeFile(path.join(qaBoards, "state.json"), `${JSON.stringify({ lastOpenedBoardId: boardId })}\n`),
  writeFile(path.join(qaWorkspace, "settings.json"), `${JSON.stringify(qaSettings, null, 2)}\n`),
  copyFile(path.join(sourceWorkspace, "license.dat"), path.join(qaWorkspace, "license.dat")),
  copyFile(path.join(sourceWorkspace, "onboarding.json"), path.join(qaWorkspace, "onboarding.json"))
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

function assertNear(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

async function pathGeometry(pathLocator) {
  return pathLocator.evaluate((element) => {
    if (!(element instanceof SVGGeometryElement)) throw new Error("Expected an SVG geometry element");
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error("SVG path has no screen transform");
    const length = element.getTotalLength();
    const samples = Array.from({ length: 41 }, (_, index) => {
      const point = element.getPointAtLength(length * index / 40);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
    return {
      d: element.getAttribute("d"),
      start: samples[0],
      end: samples.at(-1),
      ySpread: Math.max(...samples.map((point) => point.y)) - Math.min(...samples.map((point) => point.y))
    };
  });
}

let activePage;
let uiSmoke;
const consoleErrors = [];
const pageErrors = [];
try {
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180")) ?? firstWindow;
  activePage = page;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });
  await page.getByRole("button", { name: "打开画板库" }).waitFor({ state: "visible", timeout: 20_000 });
  const boardLibrary = page.locator("[data-board-library-dropzone]");
  if (await boardLibrary.isVisible()) {
    const targetBoard = boardLibrary.getByRole("button", {
      name: `打开画板 ${qaBoard.name}`,
      exact: true
    });
    await targetBoard.waitFor({ state: "visible", timeout: 20_000 });
    await targetBoard.click();
    await boardLibrary.waitFor({ state: "hidden", timeout: 20_000 });
  }
  await page.locator(`[data-id="${sourceNodeId}"] [data-image-node]`).waitFor({ state: "visible", timeout: 20_000 });

  const sourceCard = page.locator(`[data-id="${sourceNodeId}"] [data-image-node]`);
  const targetCard = page.locator(`[data-id="${targetNodeId}"] [data-image-node]`);
  await sourceCard.locator("img").first().click();
  const imageToolbar = page.getByRole("toolbar", { name: "图片操作" });
  await imageToolbar.waitFor({ state: "visible" });
  const moreImageActions = imageToolbar.getByRole("button", { name: "更多图片操作" });
  const imageToolbarActionable = await moreImageActions.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
  if (!imageToolbarActionable) {
    throw new Error("Image toolbar is visible but blocked from pointer interaction");
  }
  await moreImageActions.click();
  const imageMenu = page.getByRole("menu", { name: "更多图片操作" });
  await imageMenu.waitFor({ state: "visible" });
  const toolbarScreenshot = path.join(outputDirectory, "connection-alignment-image-toolbar.png");
  await page.screenshot({ path: toolbarScreenshot });
  await imageMenu.getByRole("menuitem", { name: /复制原图/u }).click();
  await imageMenu.waitFor({ state: "hidden" });

  if (await page.locator("[data-canvas-minimap]").count()) {
    throw new Error("Minimap unexpectedly visible before the smoke toggle");
  }
  await page.getByRole("button", { name: "打开小地图" }).click();
  const minimap = page.locator("[data-canvas-minimap]");
  await minimap.waitFor({ state: "visible" });
  const settingsAfterOpen = await page.evaluate(() => window.imageWorkbench.getSettings());
  await page.getByRole("button", { name: "关闭小地图" }).click();
  await minimap.waitFor({ state: "hidden" });
  const settingsAfterClose = await page.evaluate(() => window.imageWorkbench.getSettings());
  await page.getByRole("button", { name: "打开小地图" }).click();
  await minimap.waitFor({ state: "visible" });
  const settingsAfterReopen = await page.evaluate(() => window.imageWorkbench.getSettings());
  const minimapScreenshot = path.join(outputDirectory, "connection-alignment-minimap.png");
  await page.screenshot({ path: minimapScreenshot });
  if (
    settingsAfterOpen.canvasMinimapVisible !== true
    || settingsAfterClose.canvasMinimapVisible !== false
    || settingsAfterReopen.canvasMinimapVisible !== true
  ) {
    throw new Error("Minimap visibility and persisted settings are out of sync");
  }
  uiSmoke = {
    imageToolbarVisible: await imageToolbar.isVisible(),
    imageToolbarActionable,
    imageMenuClosedOnPointerLeave: !(await imageMenu.isVisible()),
    minimapSettings: {
      initial: false,
      afterOpen: settingsAfterOpen.canvasMinimapVisible,
      afterClose: settingsAfterClose.canvasMinimapVisible,
      afterReopen: settingsAfterReopen.canvasMinimapVisible
    },
    versionInteraction: "skipped: selected fixtures have no versions",
    screenshots: [toolbarScreenshot, minimapScreenshot]
  };
  await page.getByRole("button", { name: "关闭小地图" }).click();
  await minimap.waitFor({ state: "hidden" });

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", shiftKey: true, bubbles: true }));
  });
  await page.waitForTimeout(450);

  const sourceBox = await sourceCard.boundingBox();
  const targetBox = await targetCard.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Connection nodes have no bounding boxes");

  await sourceCard.hover();
  const sourceTrigger = sourceCard.getByRole("button", { name: "从右侧创建连接" });
  const triggerBox = await sourceTrigger.boundingBox();
  if (!triggerBox) throw new Error("Source connection trigger has no bounding box");
  const start = { x: triggerBox.x + triggerBox.width / 2, y: triggerBox.y + triggerBox.height / 2 };
  const target = { x: targetBox.x - 14, y: targetBox.y + targetBox.height / 2 };

  await page.mouse.move(start.x, start.y);
  await sourceTrigger.dispatchEvent("pointerdown", {
    pointerId: 17,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y
  });
  await page.evaluate(({ x, y }) => {
    const event = new PointerEvent("pointermove", {
      pointerId: 17,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      bubbles: true
    });
    window.dispatchEvent(event);
  }, target);
  await page.waitForTimeout(100);

  const previewPath = page.locator(".canvas-free-connection-preview path");
  await previewPath.waitFor({ state: "attached" });
  const preview = await pathGeometry(previewPath);
  const endpointGap = 28;
  assertNear(preview.start.x, sourceBox.x + sourceBox.width + endpointGap, 1.25, "Preview source endpoint card gap is incorrect");
  assertNear(preview.end.x, targetBox.x - endpointGap, 1.25, "Preview target endpoint card gap is incorrect");
  assertNear(preview.start.y, sourceBox.y + sourceBox.height / 2, 1.25, "Preview source anchor moved vertically");
  assertNear(preview.end.y, targetBox.y + targetBox.height / 2, 1.25, "Preview target anchor moved vertically");

  const previewScreenshot = path.join(outputDirectory, "connection-alignment-preview.png");
  await page.screenshot({ path: previewScreenshot });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 17,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
      bubbles: true
    }));
  }, target);

  const persistedPath = page.locator(".canvas-connection-edge").first();
  await persistedPath.waitFor({ state: "attached" });
  const persistedImmediate = await pathGeometry(persistedPath);
  await page.waitForTimeout(350);
  const persistedStable = await pathGeometry(persistedPath);

  assertNear(persistedImmediate.start.x, preview.start.x, 1.25, "Source endpoint moved after release");
  assertNear(persistedImmediate.end.x, preview.end.x, 1.25, "Target endpoint moved after release");
  assertNear(persistedImmediate.start.y, preview.start.y, 1.25, "Source endpoint moved after release");
  assertNear(persistedImmediate.end.y, preview.end.y, 1.25, "Target endpoint moved after release");
  if (persistedImmediate.d !== persistedStable.d) throw new Error("Delayed routing refinement changed the visible route");

  const overlayGeometry = await page.evaluate(() => {
    const canvas = document.querySelector("[data-canvas-visible-area]");
    const dock = document.querySelector("[data-edit-dock]");
    const promptCard = document.querySelector(".prompt-dock-card");
    if (
      !(canvas instanceof HTMLElement) ||
      !(dock instanceof HTMLElement) ||
      !(promptCard instanceof HTMLElement)
    ) {
      throw new Error("Canvas or prompt dock overlay element is missing");
    }
    const canvasRect = canvas.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const promptCardRect = promptCard.getBoundingClientRect();
    return {
      canvasBottom: canvasRect.bottom,
      dockTop: dockRect.top,
      promptCardWidth: promptCardRect.width,
      canvasWidth: canvasRect.width,
      viewportBottom: window.innerHeight,
      canvasBottomStyle: getComputedStyle(canvas).bottom
    };
  });
  assertNear(
    overlayGeometry.canvasBottom,
    overlayGeometry.viewportBottom,
    1,
    "Canvas does not extend to the viewport bottom"
  );
  if (overlayGeometry.canvasBottom <= overlayGeometry.dockTop) {
    throw new Error("Canvas does not continue behind the prompt dock overlay");
  }
  if (overlayGeometry.promptCardWidth >= overlayGeometry.canvasWidth) {
    throw new Error("Prompt card unexpectedly spans the full canvas width");
  }

  const persistedScreenshot = path.join(outputDirectory, "connection-alignment-persisted.png");
  await page.screenshot({ path: persistedScreenshot });
  console.log(JSON.stringify({
    ok: true,
    board: qaBoard.name,
    preview,
    persistedImmediate,
    persistedStable,
    overlayGeometry,
    uiSmoke,
    consoleErrors,
    pageErrors,
    screenshots: [previewScreenshot, persistedScreenshot]
  }, null, 2));
} catch (error) {
  if (activePage) {
    const failureScreenshot = path.join(outputDirectory, "connection-alignment-failure.png");
    await activePage.screenshot({ path: failureScreenshot }).catch(() => undefined);
    console.error(JSON.stringify({
      failureScreenshot,
      title: await activePage.title().catch(() => null),
      url: activePage.url(),
      body: await activePage.locator("body").innerText().catch(() => null),
      electronUserData: await electronApp.evaluate(({ app }) => app.getPath("userData")).catch(() => null),
      uiSmoke,
      consoleErrors,
      pageErrors,
      boardDetail: await activePage.evaluate(async (id) => {
        const detail = await window.imageWorkbench?.getBoard(id);
        return detail && {
          id: detail.id,
          name: detail.name,
          nodeIds: detail.nodes.map((node) => node.id),
          connectionCount: detail.connections?.length ?? 0,
          imageCount: Object.keys(detail.images).length
        };
      }, boardId).catch(() => null)
    }, null, 2));
  }
  throw error;
} finally {
  await electronApp.close();
  await rm(qaUserDataDirectory, { recursive: true, force: true });
}
