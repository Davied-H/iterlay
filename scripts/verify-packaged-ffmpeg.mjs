// Verify the independently distributed component, not an app-bundled executable.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const manifestFlag = process.argv.indexOf("--manifest");
const manifestPath = manifestFlag < 0 ? path.join(root, "shared/media-tools-manifest.json") : process.argv[manifestFlag + 1];
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const componentDir = path.resolve(process.argv[2] ?? path.join(root, "output/media-tools", `${manifest.version}-darwin-arm64/staging`));
for (const entry of manifest.files) {
  const bytes = await readFile(path.join(componentDir, entry.path));
  assert.equal(bytes.byteLength, entry.sizeBytes, `${entry.path}: size mismatch`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, `${entry.path}: SHA-256 mismatch`);
}
const ffmpeg = path.join(componentDir, "ffmpeg");
const ffprobe = path.join(componentDir, "ffprobe");
for (const binary of [ffmpeg, ffprobe]) {
  const info = await stat(binary);
  assert.ok(info.isFile() && (info.mode & 0o111) !== 0, `${binary} is not executable`);
  const { stdout: version } = await run(binary, ["-version"], { timeout: 15_000 });
  assert.ok(!version.includes("--enable-nonfree"), "Nonfree components must not be distributed");
  const { stdout: dependencies } = await run("/usr/bin/otool", ["-L", binary]);
  assert.ok(!/\/opt\/homebrew\/|\/usr\/local\//u.test(dependencies), "Local Homebrew libraries must not be required");
  const { stdout: architecture } = await run("/usr/bin/lipo", ["-archs", binary]);
  assert.equal(architecture.trim(), "arm64");
  console.log(version.split("\n", 1)[0]);
}
const temp = await mkdtemp(path.join(os.tmpdir(), "iterlay-media-tools-verify-"));
try {
  const source = path.join(temp, "source.mp4");
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x240:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source], { timeout: 30_000 });
  const output = path.join(temp, "normalized.mp4");
  await run(ffmpeg, ["-y", "-ss", "0", "-i", source, "-t", "0.9", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p", "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output], { timeout: 30_000 });
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate", "-of", "json", output]);
  const metadata = JSON.parse(stdout);
  assert.ok(metadata.streams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264" && stream.width === 1280 && stream.height === 720));
  assert.ok(metadata.streams.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac"));
  assert.ok(Number(metadata.format.duration) > 0.7);
  console.log("Media tools passed checksum, architecture, dependency and real H.264/AAC export checks.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
