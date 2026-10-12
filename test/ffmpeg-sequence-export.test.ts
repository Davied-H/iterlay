import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FfmpegService } from "../electron/media/ffmpeg-service.js";
import type { VideoSequence } from "../electron/video-sequence-types.js";

const hasFfmpeg = await commandWorks("ffmpeg");

describe.skipIf(!hasFfmpeg)("FfmpegService sequence export", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-ffmpeg-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });


  it("falls back from a missing packaged resource directory to verified system binaries", async () => {
    const service = new FfmpegService(dir, path.join(dir, "missing-resources"));
    const resolved = await service.selfCheck();
    expect(path.basename(resolved.ffmpeg)).toBe("ffmpeg");
    expect(path.basename(resolved.ffprobe)).toBe("ffprobe");
  });

  it("normalizes clips and publishes a validated MP4", async () => {
    const first = path.join(dir, "first.mp4");
    const second = path.join(dir, "second.mp4");
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=red:s=320x240:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", first]);
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=blue:s=640x360:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", second]);
    const service = new FfmpegService(dir);
    const result = await service.exportSequence({ sequence: sequence(), exportFingerprint: "abc123", segments: [{ videoPath: first, inMs: 0, outMs: 900 }, { videoPath: second, inMs: 0, outMs: 900 }] });
    expect(result.path.endsWith(".mp4")).toBe(true);
    expect(result.media).toMatchObject({ width: 1280, height: 720, videoCodec: "h264", audioCodec: "aac" });
    expect(result.media.durationMs).toBeGreaterThan(1_500);
    const silent = await service.exportSequence({ sequence: sequence(), exportFingerprint: "silent1080", resolution: "1080p", fps: 24, includeAudio: false, segments: [{ videoPath: second, inMs: 0, outMs: 900 }] });
    expect(silent.media).toMatchObject({ width: 1920, height: 1080, fps: 24, audioCodec: undefined });
  }, 30_000);
});

function sequence(): VideoSequence {
  const now = new Date().toISOString();
  return { id: "sequence", boardId: "board", name: "test", revision: 1, createdAt: now, updatedAt: now, defaults: { model: "m", aspectRatio: "16:9", resolution: "720p", fps: 30, durationSeconds: 5, generateAudio: true, watermark: false }, keyframes: [], segments: [], exportVersions: [] };
}
function commandWorks(binary: string): Promise<boolean> { return run(binary, ["-version"]).then(() => true, () => false); }
function run(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${binary} exited ${code}`)));
  });
}
