import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaToolsPaths } from "../../shared/media-tools.js";
import type { SequenceMediaMetadata, VideoSequence } from "../video-sequence-types.js";

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
}

interface ProbeOutput {
  format?: { duration?: string };
  streams?: ProbeStream[];
}

export interface SequenceExportInput {
  sequence: VideoSequence;
  segments: Array<{ videoPath: string; inMs: number; outMs?: number; muted?: boolean }>;
  exportFingerprint: string;
  resolution?: string;
  fps?: number;
  includeAudio?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export class FfmpegService {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly outputDir: string;
  private readonly tempDir: string;

  constructor(dataDir: string, resourcesPath?: string, private readonly resolveTools?: () => Promise<MediaToolsPaths>) {
    const binaryDir = resourcesPath ? path.join(resourcesPath, "ffmpeg") : undefined;
    const packagedFfmpeg = binaryDir ? path.join(binaryDir, executable("ffmpeg")) : undefined;
    const packagedFfprobe = binaryDir ? path.join(binaryDir, executable("ffprobe")) : undefined;
    this.ffmpegPath = process.env.ITERLAY_FFMPEG_PATH
      || (packagedFfmpeg && existsSync(packagedFfmpeg) ? packagedFfmpeg : systemBinary("ffmpeg"));
    this.ffprobePath = process.env.ITERLAY_FFPROBE_PATH
      || (packagedFfprobe && existsSync(packagedFfprobe) ? packagedFfprobe : systemBinary("ffprobe"));
    this.outputDir = path.join(dataDir, "sequence-outputs");
    this.tempDir = path.join(dataDir, "sequence-temp");
  }

  /** Resolve local tools only. Downloads require a separate user-confirmed install. */
  async ensureReady(): Promise<MediaToolsPaths> {
    return this.resolveTools ? this.resolveTools() : { ffmpeg: this.ffmpegPath, ffprobe: this.ffprobePath };
  }

  async selfCheck(): Promise<{ ffmpeg: string; ffprobe: string }> {
    const tools = await this.ensureReady();
    try {
      await Promise.all([
        runProcess(tools.ffmpeg, ["-version"]),
        runProcess(tools.ffprobe, ["-version"])
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`FFmpeg/ffprobe 不可用（${process.platform}-${process.arch}）。已尝试 ffmpeg=${tools.ffmpeg}，ffprobe=${tools.ffprobe}。请安装系统 FFmpeg 或设置 ITERLAY_FFMPEG_PATH 与 ITERLAY_FFPROBE_PATH。${detail}`);
    }
    return tools;
  }

  async probe(filePath: string): Promise<SequenceMediaMetadata> {
    const { ffprobe } = await this.ensureReady();
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) throw new Error("视频文件为空或不可读取。");
    const output = await runProcess(ffprobe, [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate", "-of", "json", filePath
    ]);
    let parsed: ProbeOutput;
    try { parsed = JSON.parse(output.stdout) as ProbeOutput; } catch { throw new Error("ffprobe 返回了无效结果。"); }
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");
    const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
    const durationMs = Math.round(Number(parsed.format?.duration) * 1000);
    if (!video || !video.width || !video.height || !Number.isFinite(durationMs) || durationMs <= 0) throw new Error("视频缺少可解码的视频流或有效时长。");
    return {
      mimeType: "video/mp4", width: video.width, height: video.height, durationMs,
      fps: parseRate(video.avg_frame_rate), videoCodec: video.codec_name, audioCodec: audio?.codec_name
    };
  }

  async exportSequence(input: SequenceExportInput): Promise<{ path: string; media: SequenceMediaMetadata }> {
    if (input.segments.length === 0) throw new Error("序列没有可导出的片段。");
    const { ffmpeg } = await this.ensureReady();
    await mkdir(this.outputDir, { recursive: true });
    await mkdir(this.tempDir, { recursive: true });
    const finalPath = path.join(this.outputDir, `${safeName(input.exportFingerprint)}.mp4`);
    try {
      await access(finalPath);
      return { path: finalPath, media: await this.probe(finalPath) };
    } catch { /* cache miss */ }

    const jobDir = path.join(this.tempDir, crypto.randomUUID());
    await mkdir(jobDir, { recursive: true });
    const normalized: string[] = [];
    try {
      const { width, height } = resolutionDimensions(input.resolution ?? input.sequence.defaults.resolution, input.sequence.defaults.aspectRatio);
      for (let index = 0; index < input.segments.length; index += 1) {
        const segment = input.segments[index];
        const sourceMedia = await this.probe(segment.videoPath);
        const output = path.join(jobDir, `${index.toString().padStart(3, "0")}.mp4`);
        const durationArgs = segment.outMs === undefined ? [] : ["-t", String(Math.max(1, segment.outMs - segment.inMs) / 1000)];
        const includeAudio = input.includeAudio !== false;
        const useSourceAudio = includeAudio && Boolean(sourceMedia.audioCodec) && !segment.muted;
        const inputArgs = !includeAudio || useSourceAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
        const audioMap = !includeAudio ? ["-an"] : useSourceAudio ? ["-map", "0:a:0"] : ["-map", "1:a:0", "-shortest"];
        const audioCodecArgs = includeAudio ? ["-c:a", "aac", "-ar", "48000", "-ac", "2"] : [];
        await runProcess(ffmpeg, [
          "-y", "-ss", String(Math.max(0, segment.inMs) / 1000), "-i", segment.videoPath, ...durationArgs,
          ...inputArgs,
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${input.fps ?? input.sequence.defaults.fps},format=yuv420p`,
          "-map", "0:v:0", ...audioMap, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
          ...audioCodecArgs, "-movflags", "+faststart", output
        ], input.signal);
        normalized.push(output);
        input.onProgress?.((index + 0.8) / (input.segments.length + 1));
      }
      const concatFile = path.join(jobDir, "concat.txt");
      await writeFile(concatFile, normalized.map((item) => `file '${escapeConcat(item)}'`).join("\n"), "utf8");
      const partial = path.join(jobDir, "output.partial.mp4");
      await runProcess(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-movflags", "+faststart", partial], input.signal);
      const media = await this.probe(partial);
      const expectedDuration = input.segments.reduce((sum, segment) => sum + Math.max(0, (segment.outMs ?? 0) - segment.inMs), 0);
      if (expectedDuration > 0 && Math.abs(media.durationMs - expectedDuration) > Math.max(1_000, expectedDuration * 0.05)) {
        throw new Error("导出视频时长校验失败。");
      }
      await rename(partial, finalPath);
      input.onProgress?.(1);
      return { path: finalPath, media };
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function systemBinary(name: string): string {
  const binary = executable(name);
  const candidates = process.platform === "darwin"
    ? [path.join("/opt/homebrew/bin", binary), path.join("/usr/local/bin", binary), path.join("/usr/bin", binary)]
    : process.platform === "linux"
      ? [path.join("/usr/local/bin", binary), path.join("/usr/bin", binary)]
      : [];
  return candidates.find((candidate) => existsSync(candidate)) ?? binary;
}
function executable(name: string): string { return process.platform === "win32" ? `${name}.exe` : name; }
function safeName(value: string): string { return value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 96) || crypto.randomUUID(); }
function escapeConcat(value: string): string { return value.replace(/'/g, "'\\''"); }
function parseRate(value?: string): number | undefined {
  if (!value) return undefined;
  const [a = 0, b = 1] = value.split("/").map(Number);
  const result = a / b;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function resolutionDimensions(resolution: string, ratio: string): { width: number; height: number } {
  const short = resolution === "1080p" ? 1080 : 720;
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return { width: 1280, height: 720 };
  return rw >= rh
    ? { width: even(short * rw / rh), height: short }
    : { width: short, height: even(short * rh / rw) };
}
function even(value: number): number { return Math.max(2, Math.round(value / 2) * 2); }

function runProcess(binary: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const abort = (): void => { child.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-32_000); });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(Object.assign(new Error("媒体处理已取消。"), { code: "ABORT_ERR" }));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(binary)} 执行失败（${code}）：${stderr.slice(-2_000)}`));
    });
  });
}
