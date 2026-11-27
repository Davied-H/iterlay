import { execFile } from "node:child_process";
import { access, copyFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { Arch } from "electron-builder";

const exec = promisify(execFile);

export async function prepareCliRuntime({ sourceDirectory, outputDirectory, platform, arch }, install = async (args, cwd) => {
  await exec(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd, shell: process.platform === "win32", timeout: 180_000, maxBuffer: 8 * 1024 * 1024
  });
}) {
  if (!["darwin", "win32", "linux"].includes(platform) || !["arm64", "x64"].includes(arch)) throw new Error("Unsupported CLI runtime target.");
  // Use the same integrity-pinned dependency graph as npm-installed CLI users,
  // while selecting binaries for the package target rather than the host CPU.
  await copyFile(path.join(sourceDirectory, "package-lock.json"), path.join(outputDirectory, "package-lock.json"));
  await install(["ci", "--omit=dev", "--include=optional", "--ignore-scripts", "--no-audit", "--no-fund", `--os=${platform}`, `--cpu=${arch}`], outputDirectory);
  const require = createRequire(path.join(outputDirectory, "package.json"));
  require.resolve("sharp");
  const native = platform === "linux" ? `linux-${arch}` : `${platform}-${arch}`;
  const binaryPackage = path.join(outputDirectory, "node_modules", "@img", `sharp-${native}`, "package.json");
  await access(binaryPackage);
  const installed = JSON.parse(await readFile(binaryPackage, "utf8"));
  if (!installed.os?.includes(platform) || !installed.cpu?.includes(arch)) throw new Error("Packaged Sharp binary does not match the target.");
  console.log(`Standalone CLI runtime ready: ${platform}/${arch}`);
}

export default async function packageCliRuntime(context) {
  const platform = context.electronPlatformName;
  const resources = platform === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  await prepareCliRuntime({
    sourceDirectory: path.join(context.packager.projectDir, "cli"),
    outputDirectory: path.join(resources, "cli"), platform, arch: Arch[context.arch]
  });
}
