import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { build } from "esbuild";
import type { BrowserWindow } from "electron";
import type { GenerateImageInput } from "../shared/types";
import { MAX_INLINE_MEDIA_BYTES } from "../shared/media-import";
import { createMainWorkbenchApi, type WorkspaceApi } from "../electron/application/workbench-api";
import { startLocalApi } from "../electron/local-api";
import { AssetStore } from "../electron/storage/asset-store";
import { workspaceFixture } from "./helpers/workspace-fixture";

vi.mock("../electron/application/workbench-api", () => ({ createMainWorkbenchApi: vi.fn() }));
vi.mock("../electron/window-lifecycle", () => ({ flushWindow: vi.fn(async () => undefined) }));

const exec = promisify(execFile);
let directory: string, script: string, userDataPath: string, imagePath: string;
let store: AssetStore;
let fixture: ReturnType<typeof workspaceFixture>;
let stop: (() => void) | undefined;

function pngChunk(name: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(name), data]);
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

// A valid PNG whose original bytes already exceed the old 100,000-character limit.
const pngHeader = Buffer.alloc(13);
pngHeader.writeUInt32BE(512, 0);
pngHeader.writeUInt32BE(256, 4);
pngHeader[8] = 8;
pngHeader[9] = 6;
const pngBytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", pngHeader),
  pngChunk("IDAT", deflateSync(Buffer.alloc((512 * 4 + 1) * 256), { level: 0 })),
  pngChunk("IEND", Buffer.alloc(0))
]);

async function runCli(...args: string[]) {
  return exec(process.execPath, [script, ...args, "--user-data-path", userDataPath, "--json"]);
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-cli-media-"));
  script = path.join(directory, "main.mjs");
  await build({ entryPoints: ["cli/src/main.ts"], bundle: true, platform: "node", format: "esm", outfile: script });
});

beforeEach(async () => {
  userDataPath = await mkdtemp(path.join(directory, "workspace-"));
  imagePath = path.join(userDataPath, "reference.png");
  await writeFile(imagePath, pngBytes);
  store = new AssetStore(path.join(userDataPath, "assets"));
  fixture = workspaceFixture();
  const nodes: Record<string, unknown>[] = [];
  fixture.mocks.getBoard.mockImplementation(async (id) => ({ id, nodes, revision: 1 }));
  fixture.mocks.appendBoardNodes.mockImplementation(async (_id, additions) => {
    nodes.push(...(additions as Record<string, unknown>[]).map((node) => ({ x: 0, y: 0, ...node })));
    return { ok: true };
  });
  fixture.mocks.importUploadedImage.mockImplementation(async (dataUrl) => ({ path: await store.saveUpload(dataUrl as string) }));
  fixture.mocks.importVideo.mockImplementation(async (bytes, mimeType) => ({
    path: await store.saveVideoUploadBytes(Buffer.from(bytes as ArrayBuffer), mimeType as string), mimeType
  }));
  fixture.mocks.readAssetDataUrl.mockImplementation(async (file) => store.readManagedDataUrl(file as string));
  const [resultPath] = await store.saveOutputs("result", [{ bytes: pngBytes, mimeType: "image/png" }]);
  fixture.mocks.generateImage.mockResolvedValue({
    job: { id: "job", providerId: "custom", status: "succeeded", outputImagePaths: [resultPath] },
    images: [{ path: resultPath, dataUrl: store.toAssetUrl(resultPath) }], warnings: []
  });
  vi.mocked(createMainWorkbenchApi).mockReturnValue(fixture.mocks as unknown as WorkspaceApi);
  const window = { isDestroyed: () => false, webContents: { send: vi.fn() } } as unknown as BrowserWindow;
  await mkdir(path.join(userDataPath, "workspace"), { recursive: true });
  stop = await startLocalApi(window, userDataPath);
});

afterEach(() => { stop?.(); stop = undefined; });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("CLI media imports through the real local API", () => {
  it.each(["generate", "edit"])("imports a large PNG for image %s without changing its bytes", async (action) => {
    expect(pngBytes.length).toBeGreaterThan(256 * 1024);
    const run = await runCli("image", action, "--prompt", "preserve the subject", "--board", "board",
      action === "edit" ? "--input" : "--reference", imagePath);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, data: { status: "succeeded" } });
    expect(fixture.mocks.generateImage).toHaveBeenCalledOnce();
    const input = fixture.mocks.generateImage.mock.calls[0][0] as GenerateImageInput;
    expect(input.workflowMode).toBe(action);
    expect(input.referenceImages).toHaveLength(1);
    expect(Buffer.from(input.referenceImages[0].dataBase64, "base64")).toEqual(pngBytes);
    expect(input.referenceImages[0].role).toBe(action === "edit" ? "edit-target" : "reference");
    const imported = await fixture.mocks.importUploadedImage.mock.results[0].value as { path: string };
    expect(await readFile(imported.path)).toEqual(pngBytes);
    expect(fixture.mocks.appendBoardNodes).toHaveBeenCalledWith("board", expect.arrayContaining([
      expect.objectContaining({ imagePath: imported.path, source: "upload" })
    ]));
  });

  it.each(["png", "mp4"])("imports a large .%s asset without a generation request", async (extension) => {
    const bytes = extension === "png" ? pngBytes : Buffer.alloc(256 * 1024, 1);
    const source = path.join(userDataPath, `asset.${extension}`);
    await writeFile(source, bytes);
    const run = await runCli("assets", "import", "--input", source);
    const result = JSON.parse(run.stdout);
    expect(result.ok).toBe(true);
    expect(await readFile(result.data.path)).toEqual(bytes);
    expect(fixture.mocks.generateImage).not.toHaveBeenCalled();
  });

  it("accepts a 20 MiB PNG through the 32 MiB HTTP body budget", async () => {
    const text = Buffer.alloc(MAX_INLINE_MEDIA_BYTES - pngBytes.length - 12, 65);
    text.write("padding\0");
    const bytes = Buffer.concat([pngBytes.subarray(0, 33), pngChunk("tEXt", text), pngBytes.subarray(33)]);
    expect(bytes.length).toBe(MAX_INLINE_MEDIA_BYTES);
    const source = path.join(userDataPath, "at-limit.png");
    await writeFile(source, bytes);
    const run = await runCli("assets", "import", "--input", source);
    const result = JSON.parse(run.stdout);
    expect(result.ok).toBe(true);
    expect((await readFile(result.data.path)).equals(bytes)).toBe(true);
    expect(fixture.mocks.generateImage).not.toHaveBeenCalled();
  });

  it("rejects an oversized local reference before importing or submitting generation", async () => {
    const oversizedPath = path.join(userDataPath, "oversized-reference.png");
    const file = await open(oversizedPath, "w");
    try { await file.truncate(MAX_INLINE_MEDIA_BYTES + 1); }
    finally { await file.close(); }
    await expect(runCli("image", "generate", "--prompt", "test", "--board", "board", "--reference", oversizedPath))
      .rejects.toMatchObject({ stdout: expect.stringMatching(/oversized-reference\.png.*20 MiB/u) });
    expect(fixture.mocks.importUploadedImage).not.toHaveBeenCalled();
    expect(fixture.mocks.generateImage).not.toHaveBeenCalled();
  });
});
