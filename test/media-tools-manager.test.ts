import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaToolsManager } from "../electron/media/media-tools-manager.js";
import { isMediaToolsRequiredError, type MediaToolsManifest } from "../shared/media-tools.js";

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

const directories: string[] = [];

beforeEach(() => {
  vi.stubEnv("ITERLAY_FFMPEG_PATH", "");
  vi.stubEnv("ITERLAY_FFPROBE_PATH", "");
  execFileMock.mockImplementation((binary: string, _args: string[], _options: unknown, done: (error: Error | null, output: string) => void) => {
    done(null, `${path.basename(binary)} version 6.0 Copyright FFmpeg developers\n`);
  });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(mutator?: (zip: AdmZip) => void) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-media-tools-"));
  directories.push(directory);
  const binary = Buffer.alloc(64);
  binary.writeUInt32LE(0xfeedfacf, 0);
  binary.writeUInt32LE(0x0100000c, 4);
  const content = new Map([
    ["ffmpeg", binary], ["ffprobe", binary], ["licenses/LICENSE.txt", Buffer.from("FFmpeg license fixture")]
  ]);
  const zip = new AdmZip();
  for (const [name, bytes] of content) zip.addFile(name, Buffer.from(bytes));
  mutator?.(zip);
  const archive = zip.toBuffer();
  const manifest: MediaToolsManifest = {
    version: "ffmpeg6-r1", platform: "darwin", arch: "arm64",
    url: "https://github.com/Davied-H/iterlay/releases/download/media-tools-ffmpeg6-r1/ffmpeg-darwin-arm64.zip",
    sha256: sha256(archive), sizeBytes: archive.byteLength,
    files: [...content].map(([name, bytes]) => ({ path: name, sha256: sha256(bytes), sizeBytes: bytes.byteLength }))
  };
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(archive)));
  const cache = path.join(directory, "tools", "ffmpeg", manifest.version, "darwin-arm64");
  const manager = (overrides: Partial<ConstructorParameters<typeof MediaToolsManager>[0]> = {}) => new MediaToolsManager({
    userDataPath: directory, manifest, fetcher, platform: "darwin", arch: "arm64", allowSystemTools: false, ...overrides
  });
  return { directory, archive, manifest, fetcher, cache, manager, content };
}

describe("MediaToolsManager", () => {
  it("inspects missing tools and reports a recognizable requirement without network access", async () => {
    const fixtureData = await fixture();
    const manager = fixtureData.manager();
    expect(await manager.getState()).toMatchObject({ status: "missing", transferredBytes: 0, version: "ffmpeg6-r1" });
    const error = await manager.requireReady().catch((reason: unknown) => reason);
    expect(isMediaToolsRequiredError(error)).toBe(true);
    expect(isMediaToolsRequiredError({ message: "Error invoking IPC: MEDIA_TOOLS_REQUIRED: missing" })).toBe(true);
    expect(isMediaToolsRequiredError(new Error("unrelated"))).toBe(false);
    expect(fixtureData.fetcher).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("installs a verified archive once for concurrent requests and retains licenses", async () => {
    const fixtureData = await fixture();
    const onStateChange = vi.fn();
    const manager = fixtureData.manager({ onStateChange });
    const first = manager.install();
    const second = manager.install();
    expect(first).toBe(second);
    expect(await first).toMatchObject({ status: "ready", transferredBytes: fixtureData.archive.byteLength });
    expect(fixtureData.fetcher).toHaveBeenCalledTimes(1);
    expect(await manager.requireReady()).toEqual({ ffmpeg: path.join(fixtureData.cache, "ffmpeg"), ffprobe: path.join(fixtureData.cache, "ffprobe") });
    expect(await readFile(path.join(fixtureData.cache, "licenses", "LICENSE.txt"), "utf8")).toBe("FFmpeg license fixture");
    expect(onStateChange.mock.calls.map(([state]) => state.status)).toEqual(expect.arrayContaining(["checking", "downloading", "verifying", "ready"]));
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual(["darwin-arm64"]);
  });

  it("reuses the fixed tool version across manager instances without downloading", async () => {
    const fixtureData = await fixture();
    expect((await fixtureData.manager().install()).status).toBe("ready");
    const offline = vi.fn<typeof fetch>(async () => { throw new Error("offline"); });
    const restarted = fixtureData.manager({ fetcher: offline });
    expect((await restarted.getState()).status).toBe("ready");
    expect((await restarted.install()).status).toBe("ready");
    expect((await restarted.requireReady()).ffmpeg).toBe(path.join(fixtureData.cache, "ffmpeg"));
    expect(offline).not.toHaveBeenCalled();
  });

  it("detects damaged cached executables and repairs them only after install is called", async () => {
    const fixtureData = await fixture();
    await fixtureData.manager().install();
    await writeFile(path.join(fixtureData.cache, "ffmpeg"), Buffer.alloc(64, 42));
    const manager = fixtureData.manager();
    expect((await manager.getState()).status).toBe("missing");
    await expect(manager.requireReady()).rejects.toThrow("MEDIA_TOOLS_REQUIRED");
    expect(fixtureData.fetcher).toHaveBeenCalledTimes(1);
    expect((await manager.install()).status).toBe("ready");
    expect(fixtureData.fetcher).toHaveBeenCalledTimes(2);
    expect(await readFile(path.join(fixtureData.cache, "ffmpeg"))).toEqual(fixtureData.content.get("ffmpeg"));
  });

  it("rejects archive checksum mismatches, cleans partial files and permits retry", async () => {
    const fixtureData = await fixture();
    fixtureData.fetcher.mockResolvedValueOnce(new Response(new Uint8Array(Buffer.alloc(fixtureData.archive.length))));
    const manager = fixtureData.manager();
    expect(await manager.install()).toMatchObject({ status: "error", error: expect.stringContaining("SHA-256") });
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual([]);
    expect((await manager.install()).status).toBe("ready");
  });

  it("cancels an in-flight stream, cleans partial files and permits retry", async () => {
    const fixtureData = await fixture();
    const cancelBody = vi.fn();
    fixtureData.fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(fixtureData.archive.subarray(0, 10))); },
      cancel: cancelBody
    })));
    const manager = fixtureData.manager();
    const pending = manager.install();
    await vi.waitFor(async () => expect(await manager.getState()).toMatchObject({ status: "downloading", transferredBytes: 10 }));
    manager.cancel();
    expect(await pending).toMatchObject({ status: "missing", transferredBytes: 0 });
    expect(cancelBody).toHaveBeenCalled();
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual([]);
    expect((await manager.install()).status).toBe("ready");
  });

  it("cancels verification before publishing the executable cache", async () => {
    const fixtureData = await fixture();
    const manager = fixtureData.manager({ onStateChange: (state) => {
      if (state.status === "verifying") manager.cancel();
    } });
    expect(await manager.install()).toMatchObject({ status: "missing", transferredBytes: 0 });
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual([]);
    await expect(manager.requireReady()).rejects.toThrow("MEDIA_TOOLS_REQUIRED");
  });

  it("times out stalled requests and reports a retryable error", async () => {
    const fixtureData = await fixture();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      markStarted();
    }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const manager = fixtureData.manager({ fetcher });
    const pending = manager.install();
    await started;
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(await pending).toMatchObject({ status: "error", error: expect.stringContaining("超时") });
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual([]);
  });

  it("rejects archives with unexpected files or traversal paths", async () => {
    const fixtureData = await fixture((zip) => zip.addFile("../escape.txt", Buffer.from("unexpected")));
    expect(await fixtureData.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("非预期") });
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual([]);
  });

  it("rejects symbolic links from an otherwise correctly hashed archive", async () => {
    const fixtureData = await fixture((zip) => { zip.getEntry("ffmpeg")!.attr = (0o120777 << 16) >>> 0; });
    expect(await fixtureData.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("链接") });
  });

  it("rejects missing binaries and per-file checksum mismatches", async () => {
    const missing = await fixture((zip) => zip.deleteFile("ffprobe"));
    expect(await missing.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("缺少") });
    const mismatched = await fixture((zip) => zip.updateFile("ffprobe", Buffer.alloc(64)));
    expect(await mismatched.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("SHA-256") });
  });

  it("enforces download size for responses with and without content-length", async () => {
    const fixtureData = await fixture();
    fixtureData.fetcher.mockResolvedValueOnce(new Response(new Uint8Array(fixtureData.archive), { headers: { "content-length": "1" } }));
    expect(await fixtureData.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("大小") });
    fixtureData.fetcher.mockResolvedValueOnce(new Response(new Uint8Array(Buffer.concat([fixtureData.archive, Buffer.from("extra")]))));
    expect(await fixtureData.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("大小") });
  });

  it("rejects a malformed archive before publishing any cache", async () => {
    const fixtureData = await fixture();
    const bytes = Buffer.from("this is not a ZIP archive");
    fixtureData.manifest.sha256 = sha256(bytes);
    fixtureData.manifest.sizeBytes = bytes.length;
    fixtureData.fetcher.mockResolvedValueOnce(new Response(new Uint8Array(bytes)));
    expect((await fixtureData.manager().install()).status).toBe("error");
    expect(await readdir(path.dirname(fixtureData.cache))).toEqual([]);
  });

  it("checks the native architecture and the expected FFmpeg major version", async () => {
    const wrongArch = await fixture((zip) => {
      const binary = Buffer.from(zip.readFile("ffmpeg")!);
      binary.writeUInt32LE(0x01000007, 4);
      zip.updateFile("ffmpeg", binary);
    });
    const updatedBytes = new AdmZip(wrongArch.archive).readFile("ffmpeg")!;
    wrongArch.manifest.files.find((file) => file.path === "ffmpeg")!.sha256 = sha256(updatedBytes);
    expect(await wrongArch.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("架构") });
    const wrongVersion = await fixture();
    execFileMock.mockImplementation((binary: string, _args: string[], _options: unknown, done: (error: Error | null, output: string) => void) => done(null, `${path.basename(binary)} version 7.0`));
    expect(await wrongVersion.manager().install()).toMatchObject({ status: "error", error: expect.stringContaining("版本") });
  });

  it("supports explicit paths and older bundled tools without downloading", async () => {
    const fixtureData = await fixture();
    const bundledDirectory = path.join(fixtureData.directory, "old-resources", "ffmpeg");
    await mkdir(bundledDirectory, { recursive: true });
    for (const name of ["ffmpeg", "ffprobe"]) {
      await writeFile(path.join(bundledDirectory, name), "binary fixture");
      await chmod(path.join(bundledDirectory, name), 0o755);
    }
    const bundled = fixtureData.manager({ resourcesPath: path.dirname(bundledDirectory) });
    expect((await bundled.getState()).status).toBe("ready");
    vi.stubEnv("ITERLAY_FFMPEG_PATH", path.join(bundledDirectory, "ffmpeg"));
    expect((await fixtureData.manager().requireReady()).ffprobe).toBe(path.join(bundledDirectory, "ffprobe"));
    expect(fixtureData.fetcher).not.toHaveBeenCalled();
  });

  it("rejects unsupported platforms without contacting the server", async () => {
    const fixtureData = await fixture();
    expect(await fixtureData.manager({ arch: "x64" }).install()).toMatchObject({ status: "error", error: expect.stringContaining("Apple Silicon") });
    expect(fixtureData.fetcher).not.toHaveBeenCalled();
  });

  it("rejects unsafe manifest paths and unreasonable download sizes before network access", async () => {
    const fixtureData = await fixture();
    expect(() => fixtureData.manager({ manifest: { ...fixtureData.manifest, sizeBytes: Number.MAX_SAFE_INTEGER } })).toThrow("清单");
    expect(() => fixtureData.manager({ manifest: { ...fixtureData.manifest, files: [...fixtureData.manifest.files, { path: "../escape", sha256: "a".repeat(64), sizeBytes: 1 }] } })).toThrow("清单");
    expect(fixtureData.fetcher).not.toHaveBeenCalled();
  });
});

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
