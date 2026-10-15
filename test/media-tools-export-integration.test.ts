import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FfmpegService } from "../electron/media/ffmpeg-service.js";
import type { VideoSequence } from "../electron/video-sequence-types.js";
import type { MediaToolsPaths } from "../shared/media-tools.js";

// CI can opt into real component checks. An explicitly supplied broken component
// must fail the suite rather than silently falling back to the host FFmpeg.
const componentDirectory = process.env.ITERLAY_TEST_MEDIA_TOOLS_DIR?.trim();

describe.skipIf(!componentDirectory)("independent media tools: real sequence exports", () => {
  let directory: string | undefined;
  let service: FfmpegService;
  let tools: MediaToolsPaths;
  let samples: { silentMp4: string; audioMov: string; audioWebm: string };

  beforeAll(async () => {
    const component = path.resolve(componentDirectory!);
    tools = { ffmpeg: path.join(component, "ffmpeg"), ffprobe: path.join(component, "ffprobe") };
    await Promise.all(Object.values(tools).map((binary) => access(binary)));
    directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-component-export-"));
    service = new FfmpegService(directory, path.join(directory, "no-bundled-tools"), async () => tools);
    expect(await service.selfCheck()).toEqual(tools);

    // External encoders are used only to create realistic input fixtures. Every
    // probe, transcode, export and decoded-audio assertion uses the component.
    const fixtureTool = await findFixtureEncoder();
    samples = {
      silentMp4: path.join(directory, "silent-h264.mp4"),
      audioMov: path.join(directory, "audio-hevc.mov"),
      audioWebm: path.join(directory, "audio-vp9.webm")
    };
    await run(fixtureTool, [
      "-y", "-f", "lavfi", "-i", "color=c=red:s=320x240:r=24:d=0.4",
      "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", samples.silentMp4
    ]);
    await run(fixtureTool, [
      "-y", "-f", "lavfi", "-i", "color=c=blue:s=480x270:r=30:d=0.4",
      "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=0.4",
      "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "pools=1:frame-threads=1:log-level=error",
      "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-c:a", "pcm_s16le", "-shortest", samples.audioMov
    ]);
    await run(fixtureTool, [
      "-y", "-f", "lavfi", "-i", "color=c=green:s=180x320:r=30:d=0.4",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
      "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-threads", "2",
      "-pix_fmt", "yuv420p", "-c:a", "libopus", "-shortest", samples.audioWebm
    ]);
  }, 60_000);

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("probes H.264 MP4, HEVC/PCM MOV and VP9/Opus WebM through the component", async () => {
    expect(await service.probe(samples.silentMp4)).toMatchObject({ videoCodec: "h264", audioCodec: undefined, width: 320, height: 240 });
    expect(await service.probe(samples.audioMov)).toMatchObject({ videoCodec: "hevc", audioCodec: "pcm_s16le", width: 480, height: 270 });
    expect(await service.probe(samples.audioWebm)).toMatchObject({ videoCodec: "vp9", audioCodec: "opus", width: 180, height: 320 });
  });

  it("exports mixed silent and audible inputs as a 720p/30fps H.264/AAC sequence", async () => {
    const progress: number[] = [];
    const result = await service.exportSequence({
      sequence: sequence(), exportFingerprint: "component-mixed-720p30", resolution: "720p", fps: 30,
      segments: segments(samples), onProgress: (value) => progress.push(value)
    });
    expect(result.path.endsWith(".mp4")).toBe(true);
    expect(result.media).toMatchObject({ width: 1280, height: 720, fps: 30, videoCodec: "h264", audioCodec: "aac" });
    expect(result.media.durationMs).toBeGreaterThan(1_100);
    expect(result.media.durationMs).toBeLessThan(1_450);
    expect(progress.at(-1)).toBe(1);
    // Inspect decoded samples, so retaining an audio track alone cannot satisfy
    // the silent-fill or original-audio behavior.
    expect(await audioRms(tools.ffmpeg, result.path, 0.12)).toBeLessThan(0.0001);
    expect(await audioRms(tools.ffmpeg, result.path, 0.56)).toBeGreaterThan(0.01);
    expect(await audioRms(tools.ffmpeg, result.path, 0.98)).toBeGreaterThan(0.01);
    expect(await readdir(path.join(directory!, "sequence-temp"))).toEqual([]);
  }, 30_000);

  it("exports the same MP4/MOV/WebM inputs at 1080p/24fps with no audio stream", async () => {
    const result = await service.exportSequence({
      sequence: sequence(), exportFingerprint: "component-silent-1080p24", resolution: "1080p", fps: 24,
      includeAudio: false, segments: segments(samples)
    });
    expect(result.media).toMatchObject({ width: 1920, height: 1080, fps: 24, videoCodec: "h264", audioCodec: undefined });
    expect(result.media.durationMs).toBeGreaterThan(1_100);
    expect(result.media.durationMs).toBeLessThan(1_450);
    const streamBytes = await run(tools.ffprobe, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "json", result.path]);
    expect(JSON.parse(streamBytes.toString("utf8")).streams).toEqual([]);
    expect(await readdir(path.join(directory!, "sequence-temp"))).toEqual([]);
  }, 30_000);

  it("replaces a muted source's audible samples with silence while retaining AAC", async () => {
    const result = await service.exportSequence({
      sequence: sequence(), exportFingerprint: "component-muted-720p30", resolution: "720p", fps: 30,
      segments: [{ videoPath: samples.audioMov, inMs: 0, outMs: 400, muted: true }]
    });
    expect(result.media).toMatchObject({ width: 1280, height: 720, fps: 30, audioCodec: "aac" });
    expect(await audioRms(tools.ffmpeg, samples.audioMov, 0.12)).toBeGreaterThan(0.01);
    expect(await audioRms(tools.ffmpeg, result.path, 0.12)).toBeLessThan(0.0001);
    expect(result.media.durationMs).toBeGreaterThan(300);
    expect(result.media.durationMs).toBeLessThan(650);
    expect(await readdir(path.join(directory!, "sequence-temp"))).toEqual([]);
  }, 30_000);
});

function segments(samples: { silentMp4: string; audioMov: string; audioWebm: string }) {
  return [samples.silentMp4, samples.audioMov, samples.audioWebm].map((videoPath) => ({ videoPath, inMs: 0, outMs: 400 }));
}

function sequence(): VideoSequence {
  const now = new Date().toISOString();
  return {
    id: "component-sequence", boardId: "component-board", name: "Component integration", revision: 1, createdAt: now, updatedAt: now,
    defaults: { model: "fixture", aspectRatio: "16:9", resolution: "720p", fps: 30, durationSeconds: 5, generateAudio: true, watermark: false },
    keyframes: [], segments: [], exportVersions: []
  };
}

async function findFixtureEncoder(): Promise<string> {
  for (const binary of ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg", path.resolve("resources/ffmpeg/ffmpeg")]) {
    try {
      const encoders = (await run(binary, ["-hide_banner", "-encoders"])).toString("utf8");
      if (["libx264", "libx265", "libvpx-vp9", "libopus"].every((encoder) => encoders.includes(encoder))) return binary;
    } catch { /* Try another fixture generator; the component is never substituted. */ }
  }
  throw new Error("Real media-tools tests require a fixture FFmpeg with libx264, libx265, libvpx-vp9 and libopus encoders.");
}

async function audioRms(binary: string, input: string, startSeconds: number): Promise<number> {
  const bytes = await run(binary, [
    "-v", "error", "-ss", String(startSeconds), "-i", input, "-t", "0.1",
    "-vn", "-ac", "1", "-ar", "8000", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"
  ]);
  expect(bytes.byteLength).toBeGreaterThan(400 * 4);
  let squares = 0;
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) squares += bytes.readFloatLE(offset) ** 2;
  return Math.sqrt(squares / (bytes.byteLength / 4));
}

function run(binary: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { encoding: "buffer", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(binary)} failed: ${error.message}\n${stderr.toString("utf8").slice(-3_000)}`));
      else resolve(stdout);
    });
  });
}
