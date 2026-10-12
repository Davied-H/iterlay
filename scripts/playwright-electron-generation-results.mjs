import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceWorkspace = path.join(process.env.HOME, "Library", "Application Support", "Iterlay", "workspace");
const outputDirectory = path.join(projectRoot, "output", "playwright");
const qaUserDataDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "iterlay-generation-results-")));
const qaWorkspace = path.join(qaUserDataDirectory, "workspace");
const qaBoards = path.join(qaWorkspace, "boards");
const qaOutputs = path.join(qaWorkspace, "outputs");
const boardId = "generation-results-qa";
const generationId = "generation-node";
const jobId = "8a4a8a05-c4ee-4140-808b-6aeea3880815";
const generationWidth = 340;
const generationHeight = 320;
const outputWidth = 264;
const outputHorizontalGap = 192;
const outputVerticalGap = 40;
const sourceImages = [
  { file: `${jobId}-1.png`, id: "portrait", width: 1024, height: 1536 },
  { file: `${jobId}-2.png`, id: "landscape", width: 1448, height: 1086 },
  { file: `${jobId}-3.png`, id: "square", width: 1300, height: 1210 }
];
const outputHeights = sourceImages.map((image) => outputWidth * image.height / image.width);
const outputColumnHeight = outputHeights.reduce((sum, height) => sum + height, 0)
  + outputVerticalGap * (sourceImages.length - 1);
let nextOutputY = (generationHeight - outputColumnHeight) / 2;
const outputPositions = sourceImages.map((image, index) => {
  const position = { x: generationWidth + outputHorizontalGap, y: nextOutputY };
  nextOutputY += outputHeights[index] + outputVerticalGap;
  return { ...image, ...position };
});

await Promise.all([
  mkdir(qaBoards, { recursive: true }),
  mkdir(qaOutputs, { recursive: true }),
  mkdir(outputDirectory, { recursive: true })
]);
const settings = JSON.parse(await readFile(path.join(sourceWorkspace, "settings.json"), "utf8"));
const board = {
  schemaVersion: 3,
  id: boardId,
  name: "生成结果纵向布局 QA",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: generationId,
      type: "generation",
      title: "图片生成",
      prompt: "这个图帮我拆成三个图",
      model: "官方图片模型",
      size: "auto",
      count: 3,
      status: "succeeded",
      lastGenerationId: jobId,
      x: 0,
      y: 0,
      displayWidth: generationWidth,
      displayHeight: generationHeight
    },
    ...outputPositions.map((image) => ({
      id: image.id,
      type: "image",
      imagePath: path.join(qaOutputs, image.file),
      jobId,
      source: "generated",
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      displayWidth: outputWidth
    }))
  ],
  connections: sourceImages.map((image, index) => ({
    id: `result-edge-${index}`,
    source: generationId,
    target: image.id,
    sourceHandle: "source-right",
    targetHandle: "target-left",
    kind: "visual",
    label: "生成结果",
    sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
    targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
    routing: { mode: "auto", kind: "curved", waypoints: [] }
  }))
};

await Promise.all([
  ...sourceImages.map((image) => copyFile(
    path.join(sourceWorkspace, "outputs", image.file),
    path.join(qaOutputs, image.file)
  )),
  writeFile(path.join(qaBoards, `${boardId}.json`), `${JSON.stringify(board, null, 2)}\n`),
  writeFile(path.join(qaBoards, "state.json"), `${JSON.stringify({ lastOpenedBoardId: boardId })}\n`),
  writeFile(path.join(qaWorkspace, "settings.json"), `${JSON.stringify({
    ...settings,
    canvasMinimapVisible: false
  }, null, 2)}\n`),
  copyFile(path.join(sourceWorkspace, "license.dat"), path.join(qaWorkspace, "license.dat")),
  copyFile(path.join(sourceWorkspace, "onboarding.json"), path.join(qaWorkspace, "onboarding.json"))
]);

const electronApp = await electron.launch({
  args: [`--user-data-dir=${qaUserDataDirectory}`, "."],
  cwd: projectRoot,
  ...(process.env.ITERLAY_E2E_ELECTRON ? { executablePath: process.env.ITERLAY_E2E_ELECTRON } : {}),
  env: {
    ...process.env,
    ITERLAY_PLAYWRIGHT: "1",
    VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5180"
  },
  timeout: 30_000
});

try {
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180")) ?? firstWindow;
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });
  await page.getByRole("button", { name: "打开画板库" }).waitFor({ state: "visible", timeout: 20_000 });
  const library = page.locator("[data-board-library-dropzone]");
  if (await library.isVisible()) {
    await library.getByRole("button", { name: `打开画板 ${board.name}`, exact: true }).click();
    await library.waitFor({ state: "hidden", timeout: 20_000 });
  }
  await page.locator(`[data-id="${generationId}"]`).waitFor({ state: "visible", timeout: 20_000 });
  await page.keyboard.press("Shift+1");
  await page.waitForTimeout(500);

  const boxes = [];
  for (const image of sourceImages) {
    const box = await page.locator(`[data-id="${image.id}"] [data-image-node]`).boundingBox();
    if (!box) throw new Error(`Missing generated image node: ${image.id}`);
    boxes.push(box);
  }
  if (!boxes.every((box, index) => index === 0 || box.y > boxes[index - 1].y)) {
    throw new Error("Generated image nodes are not vertically ordered");
  }
  const xSpread = Math.max(...boxes.map((box) => box.x)) - Math.min(...boxes.map((box) => box.x));
  if (xSpread > 2) throw new Error(`Generated image nodes are not vertically aligned: ${xSpread}px`);
  const generationBox = await page.locator(`[data-id="${generationId}"]`).boundingBox();
  if (!generationBox) throw new Error("Missing generation node");
  const renderedGap = Math.min(...boxes.map((box) => box.x)) - (generationBox.x + generationBox.width);
  if (renderedGap < 130) throw new Error(`Generated-result connection area is too narrow: ${renderedGap}px`);
  const columnTop = Math.min(...boxes.map((box) => box.y));
  const columnBottom = Math.max(...boxes.map((box) => box.y + box.height));
  const centerDelta = Math.abs(
    (columnTop + columnBottom) / 2 - (generationBox.y + generationBox.height / 2)
  );
  if (centerDelta > 2) throw new Error(`Generated-result column is not vertically centered: ${centerDelta}px`);
  const edgeCount = await page.locator(".canvas-connection-edge").count();
  if (edgeCount !== 3) throw new Error(`Expected 3 generated-result edges, received ${edgeCount}`);
  const generationText = await page.locator(`[data-id="${generationId}"]`).innerText();
  if (!generationText.includes("已完成")) throw new Error(`Generation node did not show completion: ${generationText}`);

  const screenshotPath = path.join(outputDirectory, "generation-results-vertical.png");
  await page.screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ ok: true, edgeCount, xSpread, renderedGap, centerDelta, screenshotPath }, null, 2));
} finally {
  await electronApp.close();
  await rm(qaUserDataDirectory, { recursive: true, force: true });
}
