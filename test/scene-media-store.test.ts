import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SceneMediaStore } from "../electron/storage/scene-media-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStore(): Promise<SceneMediaStore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-scene-media-"));
  temporaryDirectories.push(directory);
  return new SceneMediaStore(directory);
}

describe("SceneMediaStore", () => {
  it("persists scene-only results without mixing scenes", async () => {
    const store = await createStore();
    const [result] = await store.saveGeneration(
      "preset:ecommerce",
      {
        jobId: "job-1",
        prompt: "ceramic cup",
        createdAt: "2026-07-16T01:00:00.000Z",
        providerId: "provider-1",
        providerName: "Provider",
        model: "image-model"
      },
      [{ bytes: Buffer.from("image"), mimeType: "image/png" }]
    );

    expect(await readFile(result.path)).toEqual(Buffer.from("image"));
    expect(await store.list()).toEqual([
      expect.objectContaining({
        sceneId: "preset:ecommerce",
        results: [expect.objectContaining({ id: "job-1-1", prompt: "ceramic cup" })],
        covers: []
      })
    ]);
  });

  it("persists the user-defined example order", async () => {
    const store = await createStore();
    const results = await store.saveGeneration(
      "custom:ordered",
      { jobId: "job-order", prompt: "ordered", createdAt: "2026-07-16T01:00:00.000Z" },
      [
        { bytes: Buffer.from("first"), mimeType: "image/png" },
        { bytes: Buffer.from("second"), mimeType: "image/png" },
        { bytes: Buffer.from("third"), mimeType: "image/png" }
      ]
    );

    await store.reorderResults("custom:ordered", [results[2].id, results[0].id, results[1].id]);

    expect((await store.list())[0].results.map((result) => result.id)).toEqual([
      results[2].id,
      results[0].id,
      results[1].id
    ]);
  });

  it("keeps an independent cover copy after deleting its source result", async () => {
    const store = await createStore();
    const [result] = await store.saveGeneration(
      "preset:portrait",
      { jobId: "job-2", prompt: "portrait", createdAt: "2026-07-16T02:00:00.000Z" },
      [{ bytes: Buffer.from("portrait"), mimeType: "image/webp" }]
    );
    const cover = await store.addCover(
      "preset:portrait",
      result.path,
      await readFile(result.path),
      "image/webp"
    );

    await expect(store.deleteResult("preset:portrait", result.id)).resolves.toBe(true);
    expect(await readFile(cover.path)).toEqual(Buffer.from("portrait"));
    expect((await store.list())[0]).toMatchObject({ results: [], covers: [{ sourcePath: result.path }] });
  });

  it("requires an explicit replacement after three covers and preserves order", async () => {
    const store = await createStore();
    const sceneId = "preset:ad-poster";
    const covers = [];
    for (let index = 0; index < 3; index += 1) {
      covers.push(
        await store.addCover(sceneId, `/source/${index}.png`, Buffer.from(`cover-${index}`), "image/png")
      );
    }

    await expect(store.addCover(sceneId, "/source/4.png", Buffer.from("fourth"), "image/png")).rejects.toThrow(
      /封面已满/
    );
    const replacement = await store.addCover(
      sceneId,
      "/source/4.png",
      Buffer.from("fourth"),
      "image/png",
      covers[1].id
    );
    await store.reorderCovers(sceneId, [replacement.id, covers[0].id, covers[2].id]);
    await store.updateCoverFocus(sceneId, replacement.id, { x: 2, y: -1 });

    expect((await store.list())[0].covers.map((cover) => cover.id)).toEqual([
      replacement.id,
      covers[0].id,
      covers[2].id
    ]);
    expect((await store.list())[0].covers[0].focus).toEqual({ x: 1, y: 0 });
  });

  it("allows clearing every custom cover", async () => {
    const store = await createStore();
    await store.addCover("custom:scene", "/source/cover.png", Buffer.from("cover"), "image/png");
    await expect(store.clearCovers("custom:scene")).resolves.toBe(1);
    expect((await store.list())[0].covers).toEqual([]);
  });

  it("imports shared instances into a new scene and regenerates local ids", async () => {
    const store = await createStore();
    const media = {
      sceneId: "custom:source",
      results: [{
        id: "shared-result",
        jobId: "shared-job",
        sceneId: "custom:source",
        path: "media/results/result.png",
        prompt: "shared prompt",
        createdAt: "2026-07-22T00:00:00.000Z"
      }],
      covers: [{
        id: "shared-cover",
        sceneId: "custom:source",
        path: "media/covers/cover.webp",
        sourcePath: "media/results/result.png",
        createdAt: "2026-07-22T00:01:00.000Z",
        focus: { x: 1.5, y: -0.5 }
      }]
    };
    const imported = await store.importScene("custom:imported", media, new Map([
      ["media/results/result.png", Buffer.from("result")],
      ["media/covers/cover.webp", Buffer.from("cover")]
    ]));

    expect(imported.sceneId).toBe("custom:imported");
    expect(imported.results[0]).toMatchObject({ sceneId: "custom:imported", prompt: "shared prompt" });
    expect(imported.results[0].id).not.toBe("shared-result");
    expect(imported.results[0].jobId).not.toBe("shared-job");
    expect(await readFile(imported.results[0].path)).toEqual(Buffer.from("result"));
    expect(await readFile(imported.covers[0].path)).toEqual(Buffer.from("cover"));
    expect(imported.covers[0].sourcePath).toBe(imported.results[0].path);
    expect(imported.covers[0].focus).toEqual({ x: 1, y: 0 });
  });
});
