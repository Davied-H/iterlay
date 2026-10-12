import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ThumbHashStore, type ThumbHashEntry } from "../electron/storage/thumbhash-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStore(): Promise<{ directory: string; store: ThumbHashStore }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-thumbhash-"));
  temporaryDirectories.push(directory);
  return { directory, store: new ThumbHashStore(directory) };
}

function entry(imagePath: string, hash = "aGFzaA=="): ThumbHashEntry {
  return { imagePath, hash, width: 1024, height: 768, hasAlpha: false };
}

describe("ThumbHashStore", () => {
  it("persists entries and reads them back across instances", async () => {
    const { directory, store } = await createStore();
    await store.putMany([entry("/a.png"), entry("/b.png", "Yg==")]);

    const map = await store.getMap();
    expect(map.size).toBe(2);
    expect(map.get("/a.png")?.hash).toBe("aGFzaA==");
    expect(map.get("/b.png")?.width).toBe(1024);

    // 新实例从磁盘读，验证真实落盘而非仅内存。
    const fresh = new ThumbHashStore(directory);
    expect((await fresh.getMap()).get("/b.png")?.hash).toBe("Yg==");
    const raw = JSON.parse(await readFile(path.join(directory, "thumbhash.json"), "utf8"));
    expect(raw.v).toBe(1);
  });

  it("overwrites entries with the same imagePath", async () => {
    const { store } = await createStore();
    await store.put(entry("/a.png", "b2xk"));
    await store.put({ ...entry("/a.png", "bmV3"), hasAlpha: true });

    const map = await store.getMap();
    expect(map.size).toBe(1);
    expect(map.get("/a.png")).toMatchObject({ hash: "bmV3", hasAlpha: true });
  });

  it("returns an empty map when the file does not exist", async () => {
    const { store } = await createStore();
    expect((await store.getMap()).size).toBe(0);
  });

  it("recovers from a corrupted file by starting empty", async () => {
    const { directory } = await createStore();
    await writeFile(path.join(directory, "thumbhash.json"), "{not json", "utf8");
    const store = new ThumbHashStore(directory);
    expect((await store.getMap()).size).toBe(0);
    await store.put(entry("/a.png"));
    expect((await new ThumbHashStore(directory).getMap()).size).toBe(1);
  });

  it("drops malformed entries instead of failing the whole file", async () => {
    const { directory } = await createStore();
    await writeFile(
      path.join(directory, "thumbhash.json"),
      JSON.stringify({ v: 1, entries: [entry("/ok.png"), { imagePath: 42 }, null, { hash: "x" }] }),
      "utf8"
    );
    const map = await new ThumbHashStore(directory).getMap();
    expect([...map.keys()]).toEqual(["/ok.png"]);
  });

  it("serves reads from the in-memory cache after first load", async () => {
    const { directory, store } = await createStore();
    await store.put(entry("/a.png"));
    await store.getMap();
    // 删掉文件后仍能读到，证明命中内存缓存而非每次重读磁盘。
    await rm(path.join(directory, "thumbhash.json"));
    expect((await store.getMap()).get("/a.png")?.hash).toBe("aGFzaA==");
  });

  it("does not lose entries under concurrent writes", async () => {
    const { directory, store } = await createStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.put(entry(`/image-${index}.png`)))
    );
    expect((await store.getMap()).size).toBe(20);
    expect((await new ThumbHashStore(directory).getMap()).size).toBe(20);
  });

  it("ignores empty putMany without touching disk", async () => {
    const { directory, store } = await createStore();
    await store.putMany([]);
    await expect(readFile(path.join(directory, "thumbhash.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
