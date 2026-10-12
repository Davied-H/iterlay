import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_PROTOCOL,
  AssetStore,
  audioExtensionFromMime,
  decodeImageDataUrl,
  MAX_MANAGED_IMAGE_BYTES
} from "../electron/storage/asset-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStore(): Promise<{ directory: string; store: AssetStore }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-assets-"));
  temporaryDirectories.push(directory);
  return { directory, store: new AssetStore(directory) };
}

describe("AssetStore renderer URLs", () => {
  it("uses opaque tokens and only resolves URLs issued by the same store", async () => {
    const { directory, store } = await createStore();
    const imagePath = path.join(directory, "outputs", "image.png");
    await writeFile(imagePath, Buffer.from("image"), { flag: "w" }).catch(async () => {
      await store.saveOutputs("image", [{ bytes: Buffer.from("image"), mimeType: "image/png" }]);
    });
    const savedPath = path.join(directory, "outputs", "image-1.png");
    const url = store.toAssetUrl(savedPath);

    expect(url).toMatch(new RegExp(`^${ASSET_PROTOCOL}://local/[A-Za-z0-9_-]+$`));
    expect(url).not.toContain(directory);
    expect(store.resolveAssetUrl(url)).toBe(savedPath);
    expect(new AssetStore(directory).resolveAssetUrl(url)).toBeNull();
    expect(await store.readManagedDataUrl(savedPath)).toBe("data:image/png;base64,aW1hZ2U=");
  });

  it("rejects files outside the managed workspace", async () => {
    const { store } = await createStore();
    expect(() => store.toAssetUrl(path.join(os.tmpdir(), "unmanaged.png"))).toThrow(/工作区之外/);
  });

  it("persists and reuses a thumbnail for an unchanged source", async () => {
    const { directory, store } = await createStore();
    const [sourcePath] = await store.saveOutputs("source", [{ bytes: Buffer.from("source"), mimeType: "image/png" }]);
    const createThumbnail = vi.fn(async () => Buffer.from("thumbnail"));

    const firstUrl = await store.getThumbnailUrl(sourcePath, createThumbnail);
    const secondUrl = await store.getThumbnailUrl(sourcePath, createThumbnail);
    const variantUrl = await store.getThumbnailUrl(sourcePath, createThumbnail, "new-size");
    const thumbnailPath = store.resolveAssetUrl(firstUrl);

    expect(secondUrl).toBe(firstUrl);
    expect(variantUrl).not.toBe(firstUrl);
    expect(createThumbnail).toHaveBeenCalledTimes(2);
    expect(thumbnailPath).toContain(path.join(directory, "thumbnails"));
    expect(await readFile(thumbnailPath!)).toEqual(Buffer.from("thumbnail"));
  });

  it("persists derived PNGs in the managed workspace", async () => {
    const { directory, store } = await createStore();
    const paths = await store.saveDerivedPngs("slice:unsafe/id", [Buffer.from("first"), Buffer.from("second")]);

    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain(path.join(directory, "derived", "sliceunsafeid-1.png"));
    expect(await readFile(paths[1])).toEqual(Buffer.from("second"));
    expect(store.toAssetUrl(paths[0])).toMatch(new RegExp(`^${ASSET_PROTOCOL}://local/`));
  });

  it("persists supported audio in its own managed root and issues a controlled URL", async () => {
    const { directory, store } = await createStore();

    const audioPath = await store.saveAudioUploadBytes(Buffer.from("audio"), "audio/mpeg");
    const url = store.toAssetUrl(audioPath);

    expect(audioPath).toContain(path.join(directory, "audio-uploads"));
    expect(audioPath.endsWith(".mp3")).toBe(true);
    expect(store.resolveAssetUrl(url)).toBe(audioPath);
    expect(await readFile(audioPath)).toEqual(Buffer.from("audio"));
    expect(() => audioExtensionFromMime("video/mp4")).toThrow(/仅支持/);
  });

  it("rejects oversized image data before base64 decoding", () => {
    const encoded = "A".repeat(Math.ceil(MAX_MANAGED_IMAGE_BYTES / 3) * 4 + 1);
    expect(() => decodeImageDataUrl(`data:image/png;base64,${encoded}`)).toThrow(/不能超过/);
  });

  it("garbage-collects only unreferenced files under asset roots", async () => {
    const { directory, store } = await createStore();
    const [referenced, orphan] = await store.saveOutputs("gc", [
      { bytes: Buffer.from("keep"), mimeType: "image/png" },
      { bytes: Buffer.from("remove"), mimeType: "image/png" }
    ]);
    const outside = path.join(directory, "boards", "board.json");
    await writeFile(outside, "metadata", { flag: "w" }).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.dirname(outside), { recursive: true });
      await writeFile(outside, "metadata");
    });

    const removed = await store.collectGarbage(new Set([referenced]), { minAgeMs: 0, now: Date.now() + 1_000 });

    expect(removed).toContain(orphan);
    expect(removed).not.toContain(referenced);
    expect(await readFile(referenced)).toEqual(Buffer.from("keep"));
    expect(await readFile(outside, "utf8")).toBe("metadata");
  });

  it("keeps files referenced by user metadata in the caller-provided root set", async () => {
    const { store } = await createStore();
    const [commented, favorite] = await store.saveOutputs("metadata", [
      { bytes: Buffer.from("commented"), mimeType: "image/png" },
      { bytes: Buffer.from("favorite"), mimeType: "image/png" }
    ]);

    const removed = await store.collectGarbage(
      new Set([commented, favorite]),
      { minAgeMs: 0, now: Date.now() + 1_000 }
    );

    expect(removed).not.toContain(commented);
    expect(removed).not.toContain(favorite);
    expect(await readFile(commented)).toEqual(Buffer.from("commented"));
    expect(await readFile(favorite)).toEqual(Buffer.from("favorite"));
  });
});
