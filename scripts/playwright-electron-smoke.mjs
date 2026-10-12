import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetImage = process.env.ITERLAY_E2E_IMAGE ?? "b2fdc6bd-2f39-4087-a959-6dd2433d37c9-1.png";
const targetNodeId = process.env.ITERLAY_E2E_NODE_ID ?? "a0cf133b-ef13-40d2-a7ad-1670631b5e06";
const outputDirectory = path.join(projectRoot, "output", "playwright");
await mkdir(outputDirectory, { recursive: true });

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
  const encryptedLicense = (await readFile(
    path.join(process.env.HOME, "Library", "Application Support", "Iterlay", "workspace", "license.dat"),
    "utf8"
  )).trim();
  const safeStorageStatus = await electronApp.evaluate(({ app, safeStorage }, encrypted) => {
    try {
      safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      return { appName: app.getName(), readable: true };
    } catch (error) {
      return {
        appName: app.getName(),
        readable: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, encryptedLicense);
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180"))
    ?? firstWindow;
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });
  await page.getByRole("button", { name: "打开画板库" }).waitFor({ state: "visible" });

  const target = page.locator(`[data-id="${targetNodeId}"] [data-image-node] img`).first();
  await target.waitFor({ state: "visible", timeout: 15_000 });
  await target.click();
  await page.getByRole("button", { name: "更多图片操作" }).click();
  await page.getByRole("menuitem", { name: "还原为可编辑设计稿" }).click({ force: true });

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByText(targetImage, { exact: true }).waitFor({ state: "visible" });
  await dialog.getByRole("radio", { name: /照片分层/u }).waitFor({ state: "visible" });
  const screenshotPath = path.join(outputDirectory, "electron-smoke.png");
  await page.screenshot({ path: screenshotPath });

  console.log(JSON.stringify({
    ok: true,
    title: await page.title(),
    url: page.url(),
    targetImage,
    targetNodeId,
    dialogVisible: await dialog.isVisible(),
    safeStorageStatus,
    screenshotPath
  }, null, 2));
} finally {
  await electronApp.close();
}
