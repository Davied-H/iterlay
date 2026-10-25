import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib/package.json"));
const asar = appBuilderRequire("@electron/asar") as { createPackage: (source: string, archive: string) => Promise<void> };
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string | null>, platform = "mac") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-package-audit-"));
  temporary.push(directory);
  const source = path.join(directory, "source");
  const appPath = path.join(directory, platform === "mac" ? "Iterlay.app" : "win-unpacked");
  const resources = path.join(appPath, platform === "mac" ? "Contents/Resources" : "resources");
  await mkdir(resources, { recursive: true });
  const packageFiles = {
    "dist/code-sandbox/index.html": '<script>parent.postMessage({ source: "iterlay-code-sandbox", type: "ready" }, "*")</script>',
    "dist/code-sandbox/LICENSES.txt": "runtime licenses",
    ...files
  };
  for (const [name, contents] of Object.entries(packageFiles)) {
    if (contents === null) continue;
    const destination = path.join(source, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  await asar.createPackage(source, path.join(resources, "app.asar"));
  const report = path.join(directory, "report.json");
  const inspect = () => run(process.execPath, ["scripts/verify-package-size.mjs", "--app-path", appPath, "--report", report]);
  return { resources, report, inspect };
}

describe("packaged application audit", () => {
  it.each<{ files: Record<string, string | null>; violation: string }>([
    { files: { "dist/code-sandbox/index.html": null }, violation: "Missing Canvas sandbox document in app.asar" },
    { files: { "dist/code-sandbox/index.html": '<script src="./runtime.js"></script>' }, violation: "Canvas sandbox must include its runtime inline for file:// loading" },
    { files: { "dist/code-sandbox/LICENSES.txt": null }, violation: "Missing Canvas runtime licenses" }
  ])("rejects a broken Canvas package: $violation", async ({ files, violation }) => {
    const packaged = await fixture(files);
    await expect(packaged.inspect()).rejects.toThrow();
    const report = JSON.parse(await readFile(packaged.report, "utf8")) as { violations: string[] };
    expect(report.violations).toEqual([violation]);
  });
  it("audits the resources directory of a Windows package", async () => {
    const packaged = await fixture({ "package.json": "{}", "dist/index.js": "console.log('Windows');" }, "win");
    await packaged.inspect();
    const report = JSON.parse(await readFile(packaged.report, "utf8")) as { violations: string[] };
    expect(report.violations).toEqual([]);
  });
  it("accepts runtime TypeScript and binary assets inside an actual ASAR", async () => {
    const packaged = await fixture({
      "package.json": "{}",
      "node_modules/runtime/index.ts": "export const runtime = true;",
      "node_modules/runtime/engine.wasm": "wasm-fixture",
      "dist/index.js": "console.log('bundled renderer');"
    });
    await packaged.inspect();
    const report = JSON.parse(await readFile(packaged.report, "utf8")) as { violations: string[]; appBytes: number; asarBytes: number };
    expect(report.violations).toEqual([]);
    expect(report.appBytes).toBeGreaterThan(0);
    expect(report.asarBytes).toBeGreaterThan(0);
  });

  it("rejects nested renderer dependency trees, JavaScript maps and bundled FFmpeg", async () => {
    const packaged = await fixture({
      "node_modules/runtime/node_modules/react-icons/index.js": "export {};",
      "node_modules/runtime/index.js.map": "{}",
      "dist/renderer.mjs.map": "{}",
      "dist/preload.cjs.map": "{}"
    });
    await mkdir(path.join(packaged.resources, "ffmpeg"));
    await writeFile(path.join(packaged.resources, "ffmpeg", "ffmpeg"), "binary-fixture");
    await expect(packaged.inspect()).rejects.toThrow();
    const report = JSON.parse(await readFile(packaged.report, "utf8")) as { violations: string[] };
    expect(report.violations).toContain("Renderer-only dependency: react-icons");
    expect(report.violations.filter((item) => item.startsWith("Production JavaScript source map:"))).toHaveLength(3);
    expect(report.violations).toContain("Bundled ffmpeg resource directory");
  });

  it("rejects development browser services and transport modules inside an actual ASAR", async () => {
    const packaged = await fixture({
      "dist-electron/electron/main.js": "console.log('production main');",
      "dist-electron/electron/dev-browser-bridge.js": "console.log('development bridge');",
      "dist-electron/electron/dev-browser-server.js": "console.log('development server');",
      "dist-electron/shared/dev-browser-wire.js": "export const developmentWire = true;",
      "dist-electron/shared/dev-asset-url.js": "export const developmentAssets = true;"
    });
    await expect(packaged.inspect()).rejects.toThrow();
    const report = JSON.parse(await readFile(packaged.report, "utf8")) as { violations: string[] };
    expect(report.violations).toHaveLength(4);
    expect(report.violations).toContain("Browser development module: /dist-electron/electron/dev-browser-bridge.js");
    expect(report.violations).toContain("Browser development module: /dist-electron/shared/dev-browser-wire.js");
  });
});
