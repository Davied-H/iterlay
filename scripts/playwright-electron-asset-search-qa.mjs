/* global getComputedStyle */

import { copyFile, cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "output", "playwright");
const qaUserDataDirectory = await mkdtemp(path.join(tmpdir(), "iterlay-asset-search-qa-"));
const qaWorkspaceDirectory = path.join(qaUserDataDirectory, "workspace");
const sourceWorkspaceDirectory = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "Iterlay",
  "workspace"
);

await mkdir(outputDirectory, { recursive: true });
await mkdir(qaWorkspaceDirectory, { recursive: true });
await Promise.all([
  cp(path.join(sourceWorkspaceDirectory, "boards"), path.join(qaWorkspaceDirectory, "boards"), { recursive: true }),
  ...["outputs", "uploads", "imported", "derived", "references", "thumbnails"].map((directory) =>
    symlink(path.join(sourceWorkspaceDirectory, directory), path.join(qaWorkspaceDirectory, directory), "dir")
  ),
  copyFile(path.join(sourceWorkspaceDirectory, "asset-meta.json"), path.join(qaWorkspaceDirectory, "asset-meta.json")),
  copyFile(path.join(sourceWorkspaceDirectory, "license.dat"), path.join(qaWorkspaceDirectory, "license.dat")),
  copyFile(path.join(sourceWorkspaceDirectory, "settings.json"), path.join(qaWorkspaceDirectory, "settings.json")),
  copyFile(path.join(sourceWorkspaceDirectory, "onboarding.json"), path.join(qaWorkspaceDirectory, "onboarding.json"))
]);

const electronApp = await electron.launch({
  args: [`--user-data-dir=${qaUserDataDirectory}`, "."],
  cwd: projectRoot,
  env: {
    ...process.env,
    ITERLAY_PLAYWRIGHT: "1",
    VITE_DEV_SERVER_URL: "http://127.0.0.1:5180"
  },
  timeout: 30_000
});

try {
  const firstWindow = await electronApp.firstWindow();
  const page = electronApp.windows().find((window) => window.url().includes("127.0.0.1:5180"))
    ?? firstWindow;
  await page.waitForURL(/127\.0\.0\.1:5180/u, { timeout: 30_000 });

  const libraryTrigger = page.getByRole("button", { name: "打开画板库" });
  await libraryTrigger.waitFor({ state: "visible", timeout: 20_000 });
  await libraryTrigger.click();
  await page.getByRole("separator", { name: "调整侧边栏宽度" }).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "素材库", exact: true }).click();
  await page.getByText("素材库", { exact: true }).last().waitFor({ state: "visible", timeout: 20_000 });
  console.log((await page.locator("body").innerText()).slice(0, 1200));
  await page.screenshot({ path: path.join(outputDirectory, "asset-search-debug.png") });

  const input = page.getByRole("textbox", { name: "搜索素材" });
  await input.waitFor({ state: "visible", timeout: 20_000 });
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000));
  await page.waitForTimeout(500);

  const metrics = await input.evaluate((element) => {
    const inputStyle = getComputedStyle(element);
    const form = element.closest("form");
    const formStyle = form ? getComputedStyle(form) : null;
    return {
      height: element.getBoundingClientRect().height,
      borderRadius: inputStyle.borderRadius,
      formBackground: formStyle?.backgroundColor,
      formPadding: formStyle?.padding
    };
  });

  if (metrics.height !== 48 || metrics.borderRadius !== "16px") {
    throw new Error(`Unexpected search input metrics: ${JSON.stringify(metrics)}`);
  }
  if (metrics.formBackground !== "rgba(0, 0, 0, 0)" || metrics.formPadding !== "0px") {
    throw new Error(`Search form still renders an outer shell: ${JSON.stringify(metrics)}`);
  }

  const desktopScreenshot = path.join(outputDirectory, "asset-search-desktop.png");
  await page.screenshot({ path: desktopScreenshot });

  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 700));
  await page.waitForTimeout(350);
  const narrowScreenshot = path.join(outputDirectory, "asset-search-narrow.png");
  await page.screenshot({ path: narrowScreenshot });

  console.log(JSON.stringify({ ok: true, metrics, desktopScreenshot, narrowScreenshot }));
} finally {
  await electronApp.close();
  await rm(qaUserDataDirectory, { recursive: true, force: true });
}
