import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, lstat, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const appPath = path.resolve(argument("--app-path") ?? path.join(root, "release/mac-arm64/Iterlay.app"));
const reportPath = path.resolve(argument("--report") ?? path.join(root, "output/package-size/report.json"));
const isMacApp = appPath.endsWith(".app");
const resources = path.join(appPath, isMacApp ? "Contents/Resources" : "resources");
const asarPath = path.join(resources, "app.asar");
// Resolve through electron-builder's declared dependency rather than relying on hoisting.
const builderRequire = createRequire(import.meta.resolve("electron-builder/package.json"));
const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib/package.json"));
const asar = appBuilderRequire("@electron/asar");
const rendererOnly = new Set(["react-icons", "gifenc", "gifuct-js", "libavoid-js", "qrcode", "use-stick-to-bottom"]);
const entries = asar.listPackage(asarPath).map((entry) => entry.replaceAll("\\", "/"));
const violations = [];
try {
  const sandbox = asar.extractFile(asarPath, path.join("dist", "code-sandbox", "index.html")).toString("utf8");
  const script = sandbox.match(/<script\b([^>]*)>/iu);
  if (!script || /\bsrc\s*=/iu.test(script[1]) || !sandbox.includes("iterlay-code-sandbox")) {
    violations.push("Canvas sandbox must include its runtime inline for file:// loading");
  }
  if (!entries.includes("/dist/code-sandbox/LICENSES.txt")) violations.push("Missing Canvas runtime licenses");
} catch {
  violations.push("Missing Canvas sandbox document in app.asar");
}
for (const entry of entries) {
  if (/^\/dist-electron\/(?:electron\/dev-browser-[^/]+|shared\/(?:dev-browser-wire|dev-asset-url))\.js$/u.test(entry)) {
    violations.push(`Browser development module: ${entry}`);
  }
  if (/\.(?:js|mjs|cjs)\.map$/u.test(entry)) violations.push(`Production JavaScript source map: ${entry}`);
  if (/(?:^|\/)node_modules\/(?:react-icons|gifenc|gifuct-js|libavoid-js|qrcode|use-stick-to-bottom)(?:\/|$)/u.test(entry)) {
    const dependency = entry.split("/node_modules/").at(-1)?.split("/")[0];
    if (rendererOnly.has(dependency)) violations.push(`Renderer-only dependency: ${dependency}`);
  }
  if (/(?:^|\/)(?:ffmpeg|ffprobe)(?:\.exe)?$/u.test(entry)) violations.push(`Bundled media executable: ${entry}`);
}
if (await access(path.join(resources, "ffmpeg")).then(() => true, () => false)) violations.push("Bundled ffmpeg resource directory");
async function totalBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await totalBytes(entryPath);
    else total += (await lstat(entryPath)).size;
  }
  return total;
}
const appBytes = await totalBytes(appPath);
const asarBytes = (await stat(asarPath)).size;
// Windows Electron includes a larger runtime than its macOS distribution.
const appBudgetBytes = (isMacApp ? 380 : 480) * 1024 * 1024;
const asarBudgetBytes = 120 * 1024 * 1024;
if (appBytes > appBudgetBytes) violations.push(`App ${appBytes} bytes exceeds ${appBudgetBytes} byte budget`);
if (asarBytes > asarBudgetBytes) violations.push(`ASAR ${asarBytes} bytes exceeds ${asarBudgetBytes} byte budget`);
const report = {
  appPath, measuredAt: new Date().toISOString(), appBytes, asarBytes, appBudgetBytes, asarBudgetBytes,
  violations: [...new Set(violations)]
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`App: ${(appBytes / 1024 / 1024).toFixed(2)} MiB; ASAR: ${(asarBytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(`Package audit: ${reportPath}`);
assert.equal(report.violations.length, 0, report.violations.join("\n"));
console.log("Package passed development-module, dependency, JavaScript source map, media-tool and size checks.");
