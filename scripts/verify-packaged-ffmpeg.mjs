import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const platform = process.env.npm_config_platform || process.platform;
const arch = process.env.npm_config_arch || process.arch;
const resources = platform === "darwin"
  ? path.join(root, "release", `mac-${arch}`, "Iterlay.app", "Contents", "Resources", "ffmpeg")
  : path.join(root, "release", platform === "win32" ? `win-${arch}-unpacked` : `linux-${arch}-unpacked`, "resources", "ffmpeg");

for (const name of ["ffmpeg", "ffprobe"]) {
  const executable = path.join(resources, platform === "win32" ? `${name}.exe` : name);
  await access(executable);
  const info = await stat(executable);
  if (!info.isFile() || (platform !== "win32" && (info.mode & 0o111) === 0)) {
    throw new Error(`Packaged ${name} is missing or not executable: ${executable}`);
  }
  const { stdout } = await run(executable, ["-version"], { timeout: 15_000 });
  if (!stdout.toLowerCase().includes(name)) throw new Error(`Packaged ${name} -version failed validation: ${executable}`);
  console.log(`${executable}: ${stdout.split("\n", 1)[0]}`);
}
