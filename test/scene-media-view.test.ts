import { describe, expect, it } from "vitest";
import type { SceneMediaSummary } from "../shared/types.js";
import { getScenePreviewImages } from "../src/lib/scene-media.js";
import type { SceneDefinition } from "../src/lib/scene-library.js";

const scene: SceneDefinition = {
  id: "preset:test",
  name: "测试场景",
  description: "",
  prompt: "主体：测试",
  previewImages: ["/official-1.webp", "/official-2.webp", "/official-3.webp"],
  category: "other",
  mode: "generate",
  useCase: "other",
  source: "preset"
};

describe("getScenePreviewImages", () => {
  it("没有生成示例时回退到内置示例图", () => {
    expect(getScenePreviewImages(scene)).toEqual([
      { src: "/official-1.webp", focus: { x: 0.5, y: 0.5 }, generated: false },
      { src: "/official-2.webp", focus: { x: 0.5, y: 0.5 }, generated: false },
      { src: "/official-3.webp", focus: { x: 0.5, y: 0.5 }, generated: false }
    ]);
  });

  it("优先使用最新的生成示例，并忽略旧版封面数据", () => {
    const media: SceneMediaSummary = {
      sceneId: scene.id,
      results: [
        {
          id: "result-2",
          jobId: "job-2",
          sceneId: scene.id,
          path: "/results/2.webp",
          imageUrl: "iterlay-asset://local/result-2",
          prompt: "示例 2",
          createdAt: "2026-07-17T00:00:00.000Z"
        },
        {
          id: "result-1",
          jobId: "job-1",
          sceneId: scene.id,
          path: "/results/1.webp",
          imageUrl: "iterlay-asset://local/result-1",
          prompt: "示例 1",
          createdAt: "2026-07-16T00:00:00.000Z"
        }
      ],
      covers: [
        {
          id: "legacy-cover",
          sceneId: scene.id,
          path: "/covers/legacy.webp",
          imageUrl: "iterlay-asset://local/legacy-cover",
          sourcePath: "/results/legacy.webp",
          createdAt: "2026-07-16T00:00:00.000Z",
          focus: { x: 0.2, y: 0.8 }
        }
      ]
    };

    expect(getScenePreviewImages(scene, media)).toEqual([
      { src: "iterlay-asset://local/result-2", focus: { x: 0.5, y: 0.5 }, generated: true },
      { src: "iterlay-asset://local/result-1", focus: { x: 0.5, y: 0.5 }, generated: true }
    ]);
  });
});
