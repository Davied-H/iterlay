import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCENE_ARCHIVE_FORMAT,
  SCENE_ARCHIVE_VERSION,
  buildSceneArchive,
  parseSceneArchive
} from "../electron/scene-archive.js";
import type { StoredSceneMedia } from "../electron/storage/scene-media-store.js";
import type { SceneTemplateData } from "../shared/types.js";

describe("scene archive (.itt)", () => {
  it("round-trips a template with instances, covers and generation metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-template-archive-"));
    const resultPath = path.join(directory, "result.png");
    const coverPath = path.join(directory, "cover.webp");
    await Promise.all([
      writeFile(resultPath, Buffer.from("result-image")),
      writeFile(coverPath, Buffer.from("cover-image"))
    ]);
    const scene: SceneTemplateData = {
      id: "custom:source",
      name: "商品海报",
      description: "可分享模板",
      prompt: "主体：【产品】",
      category: "product",
      mode: "generate",
      useCase: "product-mockup",
      extractionScenario: "series-template",
      fields: [{ id: "field-1", label: "主体", value: "【产品】" }],
      source: "custom",
      createdAt: "2026-07-22T00:00:00.000Z"
    };
    const media: StoredSceneMedia = {
      sceneId: scene.id,
      results: [{
        id: "result-1",
        jobId: "job-1",
        sceneId: scene.id,
        path: resultPath,
        prompt: "主体：陶瓷杯",
        createdAt: "2026-07-22T01:00:00.000Z",
        providerName: "Provider",
        model: "image-model"
      }],
      covers: [{
        id: "cover-1",
        sceneId: scene.id,
        path: coverPath,
        sourcePath: resultPath,
        createdAt: "2026-07-22T01:01:00.000Z",
        focus: { x: 0.25, y: 0.75 }
      }]
    };

    const parsed = await parseSceneArchive(await buildSceneArchive(scene, media, "0.1.25"));

    expect(parsed.manifest).toMatchObject({
      format: SCENE_ARCHIVE_FORMAT,
      formatVersion: SCENE_ARCHIVE_VERSION,
      appVersion: "0.1.25"
    });
    expect(parsed.scene).toEqual(scene);
    expect(parsed.media.results).toHaveLength(1);
    expect(parsed.media.covers).toHaveLength(1);
    expect(parsed.media.results[0]).toMatchObject({ prompt: "主体：陶瓷杯", providerName: "Provider" });
    expect(parsed.media.covers[0].focus).toEqual({ x: 0.25, y: 0.75 });
    expect(parsed.images.get(parsed.media.results[0].path)).toEqual(Buffer.from("result-image"));
    expect(parsed.images.get(parsed.media.covers[0].path)).toEqual(Buffer.from("cover-image"));
    expect(parsed.media.results[0].path).not.toContain(directory);
  });

  it("drops missing media without leaving broken references", async () => {
    const scene: SceneTemplateData = {
      id: "custom:missing",
      name: "缺失图片",
      description: "",
      prompt: "主体：测试",
      category: "other",
      mode: "generate",
      useCase: "other",
      source: "custom"
    };
    const media: StoredSceneMedia = {
      sceneId: scene.id,
      results: [{
        id: "missing",
        jobId: "job-missing",
        sceneId: scene.id,
        path: "/does/not/exist.png",
        prompt: "test",
        createdAt: "2026-07-22T00:00:00.000Z"
      }],
      covers: []
    };

    const parsed = await parseSceneArchive(await buildSceneArchive(scene, media, "0.1.25"));
    expect(parsed.media.results).toEqual([]);
    expect(parsed.images.size).toBe(0);
  });

  it("creates a valid template package when the template has no media", async () => {
    const scene: SceneTemplateData = {
      id: "custom:no-media",
      name: "无封面模板",
      description: "",
      prompt: "主体：测试",
      category: "other",
      mode: "generate",
      useCase: "other",
      source: "custom"
    };

    const parsed = await parseSceneArchive(await buildSceneArchive(scene, undefined, "0.1.25"));

    expect(parsed.scene).toEqual(scene);
    expect(parsed.media).toEqual({ sceneId: scene.id, results: [], covers: [] });
    expect(parsed.images.size).toBe(0);
  });

  it("uses the first example as the cover when no legacy cover is present", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-template-default-cover-"));
    const resultPath = path.join(directory, "first-result.png");
    await writeFile(resultPath, Buffer.from("first-result-image"));
    const scene: SceneTemplateData = {
      id: "custom:default-cover",
      name: "默认封面模板",
      description: "",
      prompt: "主体：测试",
      category: "other",
      mode: "generate",
      useCase: "other",
      source: "custom"
    };
    const media: StoredSceneMedia = {
      sceneId: scene.id,
      results: [{
        id: "result-first",
        jobId: "job-first",
        sceneId: scene.id,
        path: resultPath,
        prompt: "主体：测试",
        createdAt: "2026-08-04T00:00:00.000Z"
      }],
      covers: []
    };

    const parsed = await parseSceneArchive(await buildSceneArchive(scene, media, "0.1.25"));

    expect(parsed.media.covers).toHaveLength(1);
    expect(parsed.media.covers[0]).toMatchObject({
      id: "default-cover:result-first",
      sourcePath: parsed.media.results[0].path,
      path: parsed.media.results[0].path,
      focus: { x: 0.5, y: 0.5 }
    });
  });

  it("rejects archives of another format", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({ format: "other", formatVersion: 1 })));
    await expect(parseSceneArchive(zip.toBuffer())).rejects.toThrow(/不是 Iterlay 模板文件/);
  });

  it("reports invalid zip data as a template package error", async () => {
    await expect(parseSceneArchive(Buffer.from("not a zip"))).rejects.toThrow(/模板包.*无法按 zip 解压/);
  });
});
