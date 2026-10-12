import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { mkdir, copyFile, chmod } from "node:fs/promises";
const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("FFmpeg packaging currently supports macOS ARM64 only.");
const source = process.env.ITERLAY_FFMPEG_SOURCE_DIR?.trim();
if (source) {
  await mkdir(path.join(root, "resources/ffmpeg"), { recursive: true });
  for (const name of ["ffmpeg", "ffprobe"]) {
    const input = path.resolve(source, name);
    const { stdout } = await run(input, ["-version"]);
    if (stdout.includes("--enable-nonfree")) throw new Error("Nonfree FFmpeg builds must not be distributed.");
    const { stdout: dependencies } = await run("otool", ["-L", input]);
    if (dependencies.includes("/opt/homebrew/") || dependencies.includes("/usr/local/")) throw new Error("FFmpeg must not depend on local Homebrew libraries.");
    await copyFile(input, path.join(root, "resources/ffmpeg", name));
    await chmod(path.join(root, "resources/ffmpeg", name), 0o755);
  }
} else {
  const { stdout, stderr } = await run("bash", [path.join(root, "scripts/build-ffmpeg.sh")], { maxBuffer: 32 * 1024 * 1024 });
  process.stdout.write(stdout); process.stderr.write(stderr);
}
console.log("Prepared FFmpeg resources without nonfree components.");
