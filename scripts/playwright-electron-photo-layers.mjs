import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetImage = process.env.ITERLAY_E2E_IMAGE ?? "b2fdc6bd-2f39-4087-a959-6dd2433d37c9-1.png";
const targetNodeId = process.env.ITERLAY_E2E_NODE_ID ?? "a0cf133b-ef13-40d2-a7ad-1670631b5e06";
const requiredAssetPatterns = JSON.parse(
  process.env.ITERLAY_E2E_REQUIRED_ASSET_PATTERNS
    ?? '["person|people|human|woman|women|man|men|girl|boy","sign|board|advert|poster|billboard"]'
).map((pattern) => new RegExp(pattern, "iu"));
const requirePersonCompleteness = process.env.ITERLAY_E2E_REQUIRE_PERSON_COMPLETENESS !== "0";
const minimumSignAssets = Number(process.env.ITERLAY_E2E_MIN_SIGN_ASSETS ?? "0");
const forbiddenAssetPatterns = JSON.parse(
  process.env.ITERLAY_E2E_FORBIDDEN_ASSET_PATTERNS ?? "[]"
).map((pattern) => new RegExp(pattern, "iu"));
const taskTimeoutMs = Number(process.env.ITERLAY_E2E_TIMEOUT_MS ?? String(10 * 60_000));
const outputDirectory = path.join(projectRoot, "output", "playwright");
const piAgentLogPath = path.join(
  process.env.HOME,
  "Library",
  "Logs",
  "Iterlay",
  "pi-agent.jsonl"
);
const createdAssetDirectory = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "Iterlay",
  "mastergo-workspace",
  ".mastergo",
  "created",
  "asset"
);
const iterlayWorkspaceDirectory = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "Iterlay",
  "workspace"
);
await mkdir(outputDirectory, { recursive: true });

async function latestAssetDirectory(startedAt) {
  const entries = await readdir(createdAssetDirectory, { withFileTypes: true });
  const candidates = await Promise.all(entries.filter((entry) => (
    entry.isDirectory() && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(entry.name)
  )).map(async (entry) => {
    const directory = path.join(createdAssetDirectory, entry.name);
    const info = await stat(directory);
    const pngNames = (await readdir(directory)).filter((name) => name.endsWith(".png"));
    return { directory, modifiedAt: info.mtimeMs, pngNames };
  }));
  const latest = candidates
    .filter((candidate) => candidate.modifiedAt >= startedAt - 1_000 && candidate.pngNames.length > 0)
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
  if (!latest) throw new Error("未找到本次照片分层生成的素材目录。");
  return latest.directory;
}

async function sourceImagePath() {
  if (process.env.ITERLAY_E2E_SOURCE_PATH) return process.env.ITERLAY_E2E_SOURCE_PATH;
  for (const directory of ["uploads", "outputs"]) {
    const candidate = path.join(iterlayWorkspaceDirectory, directory, targetImage);
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next local source directory.
    }
  }
  throw new Error(`未找到照片分层源图：${targetImage}`);
}

async function inspectAlpha(page, filePath) {
  const bytes = await readFile(filePath);
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建素材像素检查画布。");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    let lowerLeft = 0;
    let lowerRight = 0;
    let bottom = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
        opaque += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (y >= canvas.height * 0.52 && x < canvas.width * 0.5) lowerLeft += 1;
        if (y >= canvas.height * 0.52 && x >= canvas.width * 0.5) lowerRight += 1;
        if (y >= canvas.height * 0.88) bottom += 1;
      }
    }
    const boundsWidth = Math.max(0, maxX - minX + 1);
    const boundsHeight = Math.max(0, maxY - minY + 1);
    const boundsArea = Math.max(1, boundsWidth * boundsHeight);
    const boundsMiddleX = minX + boundsWidth * 0.5;
    const boundsLowerY = minY + boundsHeight * 0.52;
    const boundsFootY = minY + boundsHeight * 0.88;
    let boundsLowerLeft = 0;
    let boundsLowerRight = 0;
    let boundsFootLeft = 0;
    let boundsFootRight = 0;
    const footColumns = new Array(boundsWidth).fill(0);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
        if (y >= boundsLowerY && x < boundsMiddleX) boundsLowerLeft += 1;
        if (y >= boundsLowerY && x >= boundsMiddleX) boundsLowerRight += 1;
        if (y >= boundsFootY && x < boundsMiddleX) boundsFootLeft += 1;
        if (y >= boundsFootY && x >= boundsMiddleX) boundsFootRight += 1;
        if (y >= boundsFootY) footColumns[x - minX] += 1;
      }
    }
    const minimumColumnPixels = Math.max(1, Math.floor(boundsHeight * 0.12 * 0.05));
    const minimumClusterWidth = Math.max(2, Math.floor(boundsWidth * 0.03));
    let footClusterCount = 0;
    let clusterStart = -1;
    for (let index = 0; index <= footColumns.length; index += 1) {
      const occupied = index < footColumns.length && footColumns[index] >= minimumColumnPixels;
      if (occupied && clusterStart < 0) clusterStart = index;
      if (!occupied && clusterStart >= 0) {
        if (index - clusterStart >= minimumClusterWidth) footClusterCount += 1;
        clusterStart = -1;
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      opaqueShare: opaque / (canvas.width * canvas.height),
      lowerLeftShare: lowerLeft / (canvas.width * canvas.height),
      lowerRightShare: lowerRight / (canvas.width * canvas.height),
      bottomShare: bottom / (canvas.width * canvas.height),
      opaqueBounds: { minX, minY, maxX, maxY },
      boundsLowerLeftShare: boundsLowerLeft / boundsArea,
      boundsLowerRightShare: boundsLowerRight / boundsArea,
      boundsFootLeftShare: boundsFootLeft / boundsArea,
      boundsFootRightShare: boundsFootRight / boundsArea,
      footClusterCount
    };
  }, `data:image/png;base64,${bytes.toString("base64")}`);
}

async function masterGoScreenshotPath(taskId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const lines = (await readFile(piAgentLogPath, "utf8")).trim().split("\n").reverse();
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.taskId !== taskId || entry.toolName !== "review_mastergo_visual" || entry.event !== "tool_end") {
        continue;
      }
      const text = entry.details?.result?.content
        ?.filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n") ?? "";
      const match = text.match(/- \[[^\]]+\] (.+?\.png)，/u);
      if (match?.[1]) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`未找到任务 ${taskId} 的 MasterGo 最终截图。`);
}

async function inspectMasterGoRender(page, backgroundPath, screenshotPath) {
  const [backgroundBytes, screenshotBytes] = await Promise.all([
    readFile(backgroundPath),
    readFile(screenshotPath)
  ]);
  return page.evaluate(async ({ backgroundUrl, screenshotUrl }) => {
    const loadPixels = async (src, targetSize) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = targetSize?.width ?? image.naturalWidth;
      canvas.height = targetSize?.height ?? image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("无法创建 MasterGo 截图检查画布。");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data
      };
    };
    const screenshot = await loadPixels(screenshotUrl);
    const backgroundImage = new Image();
    backgroundImage.src = backgroundUrl;
    await backgroundImage.decode();
    const backgroundAspect = backgroundImage.naturalWidth / backgroundImage.naturalHeight;
    const screenshotAspect = screenshot.width / screenshot.height;
    if (Math.abs(backgroundAspect - screenshotAspect) / backgroundAspect > 0.01) {
      throw new Error(
        `MasterGo 截图比例 ${screenshot.width}x${screenshot.height} 与背景 ${backgroundImage.naturalWidth}x${backgroundImage.naturalHeight} 不一致。`
      );
    }
    const background = await loadPixels(backgroundUrl, {
      width: screenshot.width,
      height: screenshot.height
    });
    let darkRegressionPixels = 0;
    let changedPixels = 0;
    let totalDifference = 0;
    const pixelCount = background.width * background.height;
    const backgroundLumas = new Float32Array(pixelCount);
    const screenshotLumas = new Float32Array(pixelCount);
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      backgroundLumas[pixelIndex] = (
        background.pixels[offset] * 0.2126
        + background.pixels[offset + 1] * 0.7152
        + background.pixels[offset + 2] * 0.0722
      );
      screenshotLumas[pixelIndex] = (
        screenshot.pixels[offset] * 0.2126
        + screenshot.pixels[offset + 1] * 0.7152
        + screenshot.pixels[offset + 2] * 0.0722
      );
    }
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      const backgroundLuma = backgroundLumas[pixelIndex];
      const screenshotLuma = screenshotLumas[pixelIndex];
      const difference = (
        Math.abs(background.pixels[offset] - screenshot.pixels[offset])
        + Math.abs(background.pixels[offset + 1] - screenshot.pixels[offset + 1])
        + Math.abs(background.pixels[offset + 2] - screenshot.pixels[offset + 2])
      ) / 3;
      totalDifference += difference;
      if (difference >= 24) changedPixels += 1;
      if (backgroundLuma >= 45 && screenshotLuma <= 12 && backgroundLuma - screenshotLuma >= 45) {
        const x = pixelIndex % background.width;
        const y = Math.floor(pixelIndex / background.width);
        let nearbyOriginalDarkPixel = false;
        for (let neighborY = Math.max(0, y - 2); neighborY <= Math.min(background.height - 1, y + 2); neighborY += 1) {
          for (let neighborX = Math.max(0, x - 2); neighborX <= Math.min(background.width - 1, x + 2); neighborX += 1) {
            if (backgroundLumas[neighborY * background.width + neighborX] <= 24) {
              nearbyOriginalDarkPixel = true;
              break;
            }
          }
          if (nearbyOriginalDarkPixel) break;
        }
        if (!nearbyOriginalDarkPixel) darkRegressionPixels += 1;
      }
    }
    return {
      width: background.width,
      height: background.height,
      darkRegressionShare: darkRegressionPixels / pixelCount,
      changedShare: changedPixels / pixelCount,
      meanAbsoluteDifference: totalDifference / pixelCount
    };
  }, {
    backgroundUrl: `data:image/png;base64,${backgroundBytes.toString("base64")}`,
    screenshotUrl: `data:image/png;base64,${screenshotBytes.toString("base64")}`
  });
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
  const startedAt = Date.now();
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180"))
    ?? firstWindow;
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });
  await page.getByRole("button", { name: "打开画板库" }).waitFor({ state: "visible" });

  await page.locator(`[data-id="${targetNodeId}"] [data-image-node] img`).first().click();
  await page.getByRole("button", { name: "更多图片操作" }).dispatchEvent("click");
  await page.getByRole("menuitem", { name: "还原为可编辑设计稿" }).dispatchEvent("click");

  const dialog = page.getByRole("dialog");
  await dialog.getByText(targetImage, { exact: true }).waitFor({ state: "visible" });
  await dialog.getByRole("radio", { name: /照片分层/u }).click();
  await dialog.getByRole("button", { name: "开始还原" }).click();

  let lastStatus = "";
  let completed = false;
  const deadline = Date.now() + taskTimeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    const status = (await dialog.innerText()).replace(/\s+/gu, " ").trim();
    if (status !== lastStatus) {
      console.log(`[photo-layers] ${status}`);
      lastStatus = status;
    }
    if (status.includes("可编辑设计稿已创建") && status.includes("已写入 MasterGo")) {
      completed = true;
      break;
    }
    if (status.includes("开始还原") && !status.includes("取消任务")) {
      throw new Error("任务运行期间弹窗提前回到了初始配置页。");
    }
    if (status.includes("还原失败") || status.includes("重新开始") || status.includes("重试")) {
      throw new Error(`照片分层任务失败：${status}`);
    }
  }
  if (!completed) throw new Error(`照片分层任务在超时时间内未完成：${lastStatus}`);

  const assetDirectory = await latestAssetDirectory(startedAt);
  const assetNames = (await readdir(assetDirectory)).filter((name) => name.endsWith(".png"));
  const backgroundName = assetNames.find((name) => name === "photo-background.png");
  if (!backgroundName) throw new Error(`照片分层缺少独立背景素材：${assetNames.join("、")}`);
  const requiredAssetNames = requiredAssetPatterns.map((pattern) => {
    const name = assetNames.find((assetName) => assetName !== backgroundName && pattern.test(assetName));
    if (!name) throw new Error(`照片分层缺少匹配 ${pattern} 的独立主体素材：${assetNames.join("、")}`);
    return name;
  });
  if (new Set(requiredAssetNames).size !== requiredAssetNames.length) {
    throw new Error(`不同主体类别被合并到了同一素材：${requiredAssetNames.join("、")}`);
  }
  const subjectAssetNames = assetNames.filter((name) => name !== backgroundName);
  const signAssetNames = subjectAssetNames.filter((name) => (
    /sign|board|advert|poster|billboard/iu.test(name)
  ));
  if (signAssetNames.length < minimumSignAssets) {
    throw new Error(
      `独立广告牌图层不足，需要 ${minimumSignAssets} 个，实际为 ${signAssetNames.length} 个：${assetNames.join("、")}`
    );
  }
  for (const pattern of forbiddenAssetPatterns) {
    const forbidden = subjectAssetNames.find((name) => pattern.test(name));
    if (forbidden) throw new Error(`存在应自动合并或删除的冗余图层 ${forbidden}：${assetNames.join("、")}`);
  }

  const backgroundAlpha = await inspectAlpha(page, path.join(assetDirectory, backgroundName));
  const subjectAssetAlpha = await Promise.all(subjectAssetNames.map(async (name) => ({
    name,
    alpha: await inspectAlpha(page, path.join(assetDirectory, name))
  })));
  const requiredAssetAlpha = subjectAssetAlpha.filter(({ name }) => requiredAssetNames.includes(name));
  if (backgroundAlpha.opaqueShare < 0.98) {
    throw new Error(`背景出现透明挖空：opaqueShare=${backgroundAlpha.opaqueShare}`);
  }
  for (const asset of subjectAssetAlpha) {
    if (asset.alpha.opaqueShare < 0.02) {
      throw new Error(`主体 ${asset.name} 像素不足：${JSON.stringify(asset.alpha)}`);
    }
    if (
      /sign|board|advert|poster|billboard/iu.test(asset.name)
      && (
        asset.alpha.opaqueShare < 0.08
        || asset.alpha.opaqueBounds.maxX - asset.alpha.opaqueBounds.minX + 1 < asset.alpha.width * 0.35
        || asset.alpha.opaqueBounds.maxY - asset.alpha.opaqueBounds.minY + 1 < asset.alpha.height * 0.25
      )
    ) {
      throw new Error(`广告牌 ${asset.name} 只生成了局部内容：${JSON.stringify(asset.alpha)}`);
    }
  }
  if (requirePersonCompleteness) {
    const personAsset = requiredAssetAlpha.find(({ name }) => (
      /(?:person|people|human|woman|women|man|men|girl|boy|rider)/iu.test(name)
    ));
    if (!personAsset) throw new Error(`未找到需要检查四肢完整性的人物素材：${requiredAssetNames.join("、")}`);
    if (
      personAsset.alpha.boundsLowerLeftShare < 0.015
      || personAsset.alpha.boundsLowerRightShare < 0.015
      || personAsset.alpha.footClusterCount < 2
    ) {
      throw new Error(`人物下肢不完整：${JSON.stringify(personAsset.alpha)}`);
    }
  }

  const taskId = path.basename(assetDirectory);
  const masterGoScreenshot = await masterGoScreenshotPath(taskId);
  const originalImagePath = await sourceImagePath();
  const cleanBackgroundDifference = await inspectMasterGoRender(
    page,
    originalImagePath,
    path.join(assetDirectory, backgroundName)
  );
  if (cleanBackgroundDifference.changedShare < 0.005) {
    throw new Error(`背景层仍保留原主体，没有生成 PSD 式干净背景：${JSON.stringify(cleanBackgroundDifference)}`);
  }
  const masterGoRender = await inspectMasterGoRender(
    page,
    originalImagePath,
    masterGoScreenshot
  );
  const foregroundContribution = await inspectMasterGoRender(
    page,
    path.join(assetDirectory, backgroundName),
    masterGoScreenshot
  );
  if (masterGoRender.darkRegressionShare >= 0.005) {
    throw new Error(`MasterGo 最终稿出现黑色主体或背景挖空：${JSON.stringify(masterGoRender)}`);
  }
  if (
    foregroundContribution.changedShare < 0.04
    || foregroundContribution.meanAbsoluteDifference < 3
  ) {
    throw new Error(`人物和物体图层没有完整叠回干净背景：${JSON.stringify(foregroundContribution)}`);
  }
  if (
    masterGoRender.changedShare >= 0.6
    || masterGoRender.meanAbsoluteDifference >= 30
  ) {
    throw new Error(`MasterGo 最终稿与完整照片出现明显色块或接缝：${JSON.stringify(masterGoRender)}`);
  }

  const screenshotSuffix = process.env.ITERLAY_E2E_SCREENSHOT_SUFFIX ?? "success";
  const screenshotPath = path.join(outputDirectory, `electron-photo-layers-${screenshotSuffix}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(JSON.stringify({
    ok: true,
    title: await page.title(),
    targetImage,
    targetNodeId,
    successPageVisible: completed,
    assetDirectory,
    assetNames,
    backgroundAlpha,
    subjectAssetAlpha,
    requiredAssetAlpha,
    cleanBackgroundDifference,
    masterGoScreenshot,
    masterGoRender,
    foregroundContribution,
    screenshotPath
  }, null, 2));
} finally {
  await electronApp.close();
}
