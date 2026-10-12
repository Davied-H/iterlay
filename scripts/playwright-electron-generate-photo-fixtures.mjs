import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "output", "playwright");
const workspaceDirectory = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "Iterlay",
  "workspace"
);
const boardStatePath = path.join(workspaceDirectory, "boards", "state.json");
const historyPath = path.join(workspaceDirectory, "history.json");
await mkdir(outputDirectory, { recursive: true });

const fixtures = [
  {
    key: "product",
    prompt: "写实商业产品摄影：一只透明玻璃香水瓶完整放在浅色石台上，旁边单独摆放一枝红色郁金香，柔和棚拍光线，纯净浅灰背景，主体轮廓清晰，画面中不要文字、标签和水印。"
  },
  {
    key: "animal",
    prompt: "自然纪实摄影：一只完整的金毛犬站在绿色草地上，旁边单独放着一只红色旅行箱，远处树林虚化，狗和旅行箱彼此分开、轮廓清晰，画面中不要文字和水印。"
  },
  {
    key: "vehicle",
    prompt: "电影感城市街头摄影：一辆完整的复古绿色摩托车停在砖墙前，旁边站着一名戴头盔的全身骑手，人物与摩托车彼此分开、轮廓清晰，画面中不要文字和水印。"
  }
];

async function activeBoardPath() {
  const state = JSON.parse(await readFile(boardStatePath, "utf8"));
  if (!state.lastOpenedBoardId) throw new Error("无法确定当前画板。");
  return path.join(workspaceDirectory, "boards", `${state.lastOpenedBoardId}.json`);
}

async function boardNode(nodeId) {
  const board = JSON.parse(await readFile(await activeBoardPath(), "utf8"));
  return board.nodes?.find((node) => node.id === nodeId) ?? null;
}

async function latestGeneration(prompt, startedAt) {
  const history = JSON.parse(await readFile(historyPath, "utf8"));
  return [...history].reverse().find((entry) => (
    entry.prompt === prompt && Date.parse(entry.createdAt) >= startedAt - 1_000
  )) ?? null;
}

const electronApp = await electron.launch({
  args: ["."],
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

try {
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180"))
    ?? firstWindow;
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });
  await page.getByRole("button", { name: "打开画板库" }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "切换提供商" }).click();
  await page.getByRole("menuitem", { name: /Fai/u }).hover();
  await page.getByRole("menuitem", { name: /microsoft\/mai-image-2\.5/u }).click();
  await page.waitForTimeout(500);

  const results = [];
  for (const fixture of fixtures) {
    const editor = page.locator("[data-prompt-editor] textarea").first();
    await editor.waitFor({ state: "visible", timeout: 15_000 });
    await editor.fill(fixture.prompt);
    const generateButton = page.locator('[data-tour="prompt-card"]').locator([
      "button.generate-action-button",
      "button.generate-glow-button",
      "button.generate-prismatic-button",
      "button.generate-send-button"
    ].join(", ")).last();
    await generateButton.waitFor({ state: "visible", timeout: 15_000 });
    const startedAt = Date.now();
    await generateButton.click();

    const pending = page.getByLabel(new RegExp(`(?:正在生成|排队中).*${fixture.prompt.slice(0, 18)}`, "u"));
    await pending.waitFor({ state: "visible", timeout: 20_000 });
    const nodeId = await pending.locator("xpath=ancestor::*[@data-id][1]").getAttribute("data-id");
    if (!nodeId) throw new Error(`无法读取 ${fixture.key} 生成节点 ID。`);

    const completedImage = page.locator(`[data-id="${nodeId}"] [data-image-node] img`).first();
    const generationDeadline = Date.now() + 6 * 60_000;
    let historyEntry = null;
    while (Date.now() < generationDeadline) {
      if (await completedImage.isVisible().catch(() => false)) break;
      historyEntry = await latestGeneration(fixture.prompt, startedAt);
      if (historyEntry?.status === "failed") {
        throw new Error(`${fixture.key} 图片生成失败：${historyEntry.error ?? "Provider 未返回原因"}`);
      }
      await page.waitForTimeout(2_000);
    }
    if (!await completedImage.isVisible().catch(() => false)) {
      throw new Error(`${fixture.key} 图片在 6 分钟内未生成：${historyEntry?.status ?? "无历史状态"}`);
    }
    await page.waitForTimeout(1_500);

    let node = await boardNode(nodeId);
    const deadline = Date.now() + 15_000;
    while ((!node?.imagePath || !node.imagePath.includes("/outputs/")) && Date.now() < deadline) {
      await page.waitForTimeout(500);
      node = await boardNode(nodeId);
    }
    if (!node?.imagePath) throw new Error(`生成结果 ${fixture.key} 未保存到当前画板。`);

    const screenshotPath = path.join(outputDirectory, `generated-${fixture.key}.png`);
    await page.screenshot({ path: screenshotPath });
    const result = {
      ...fixture,
      nodeId,
      imagePath: node.imagePath,
      imageName: path.basename(node.imagePath),
      screenshotPath
    };
    results.push(result);
    console.log(`[generate-fixture] ${JSON.stringify(result)}`);
  }

  const manifestPath = path.join(outputDirectory, "generated-photo-fixtures.json");
  await writeFile(manifestPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, count: results.length, manifestPath, results }, null, 2));
} finally {
  await electronApp.close();
}
