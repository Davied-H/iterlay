import { describe, expect, it } from "vitest";
import { promptTemplates } from "../shared/workflow";
import {
  buildScenePreviewImagePath,
  createCustomScene,
  createCustomSceneFromScene,
  CUSTOM_SCENES_STORAGE_KEY,
  DEFAULT_FAVORITE_SCENE_IDS,
  FAVORITE_SCENE_IDS_STORAGE_KEY,
  findSceneForMode,
  getQuickScenes,
  normalizeSceneConversation,
  PRESET_SCENES,
  QUICK_PRESET_SCENE_COUNT,
  readCustomScenes,
  readFavoriteSceneIds,
  parseSceneFields,
  serializeSceneFields,
  sceneMatchesGeneration,
  sortScenesForLibrary,
  updateCustomScene,
  writeCustomScenes,
  writeFavoriteSceneIds,
  type SceneDefinition
} from "../src/lib/scene-library";

describe("scene library", () => {
  it("only restores a selected template in its matching workflow mode", () => {
    const editScene = PRESET_SCENES.find((scene) => scene.mode === "edit");
    const generateScene = PRESET_SCENES.find((scene) => scene.mode === "generate");

    expect(editScene).toBeDefined();
    expect(generateScene).toBeDefined();
    expect(findSceneForMode(PRESET_SCENES, editScene?.id, "edit")).toBe(editScene);
    expect(findSceneForMode(PRESET_SCENES, editScene?.id, "generate")).toBeUndefined();
    expect(findSceneForMode(PRESET_SCENES, generateScene?.id, "edit")).toBeUndefined();
  });

  it("uses the packaged app base path for preset preview images", () => {
    expect(buildScenePreviewImagePath("ad-poster", 1, "./")).toBe("./scene-previews/ad-poster/1.webp");
    expect(buildScenePreviewImagePath("ad-poster", 1, "/")).toBe("/scene-previews/ad-poster/1.webp");
  });

  it("exposes every existing prompt template as a preset scene", () => {
    expect(PRESET_SCENES).toHaveLength(promptTemplates.length);
    expect(PRESET_SCENES.map((scene) => scene.prompt)).toEqual(promptTemplates.map((template) => template.prompt));
    expect(PRESET_SCENES.every((scene) => scene.source === "preset")).toBe(true);
    expect(PRESET_SCENES.every((scene) => scene.fields && scene.fields.length > 0)).toBe(true);
  });

  it("provides one concrete prompt for every official preview image", () => {
    for (const scene of PRESET_SCENES) {
      expect(scene.previewImages).toHaveLength(3);
      expect(scene.previewPrompts).toHaveLength(scene.previewImages!.length);
      expect(scene.previewPrompts!.every((prompt) => prompt.trim().length > 0)).toBe(true);
      expect(scene.previewPrompts!.every((prompt) => !prompt.includes("【"))).toBe(true);
      expect(new Set(scene.previewPrompts).size).toBe(scene.previewPrompts!.length);
    }
  });

  it("creates normalized custom scenes", () => {
    const scene = createCustomScene(
      {
        name: "  雨夜街头  ",
        description: "  电影感夜景  ",
        prompt: "  雨夜的东京街头  ",
        category: "concept",
        mode: "generate",
        useCase: "stylized-concept",
        extractionScenario: "design-language"
      },
      "scene-1"
    );

    expect(scene).toMatchObject({
      id: "custom:scene-1",
      name: "雨夜街头",
      description: "电影感夜景",
      prompt: "雨夜的东京街头",
      extractionScenario: "design-language",
      source: "custom"
    });
  });

  it("preserves official effect images and example prompts when saving a preset as a custom scene", () => {
    const preset = PRESET_SCENES[0];
    const scene = createCustomSceneFromScene({
      ...preset,
      previewImages: [...(preset.previewImages ?? [])],
      previewPrompts: [...(preset.previewPrompts ?? [])]
    }, {
      name: `${preset.name} 修改版`,
      description: preset.description,
      prompt: `${preset.prompt}\n补充：保留品牌色`,
      category: preset.category,
      mode: preset.mode,
      useCase: preset.useCase
    }, "preset-copy");

    expect(scene).toMatchObject({
      id: "custom:preset-copy",
      source: "custom",
      previewImages: preset.previewImages,
      previewPrompts: preset.previewPrompts
    });
    expect(scene.previewImages).not.toBe(preset.previewImages);
    expect(scene.previewPrompts).not.toBe(preset.previewPrompts);
  });

  it("keeps a user's template identity and previews when saving edits", () => {
    const existing = {
      ...createCustomScene({
        name: "我的模板",
        description: "旧说明",
        prompt: "主体：旧内容",
        category: "other",
        mode: "generate",
        useCase: "other"
      }, "mine"),
      previewImages: ["/my-preview.webp"],
      previewPrompts: ["主体：示例内容"]
    } satisfies SceneDefinition;

    const updated = updateCustomScene(existing, {
      name: "我的模板新版",
      description: "新说明",
      prompt: "主体：新内容",
      category: "concept",
      mode: "generate",
      useCase: "stylized-concept"
    });

    expect(updated).toMatchObject({
      id: existing.id,
      source: "custom",
      previewImages: existing.previewImages,
      previewPrompts: existing.previewPrompts
    });
  });

  it("persists the template assistant conversation when saving edits", () => {
    const existing = createCustomScene({
      name: "我的模板",
      description: "",
      prompt: "主体：旧内容",
      category: "other",
      mode: "generate",
      useCase: "other"
    }, "conversation");
    const conversation = [
      { id: "assistant-1", role: "assistant" as const, content: "先说说你想做什么。" },
      { id: "user-1", role: "user" as const, content: "做一张克制的产品图。" }
    ];

    const updated = updateCustomScene(existing, {
      name: "我的模板",
      description: "",
      prompt: "主体：新内容",
      category: "other",
      mode: "generate",
      useCase: "other",
      conversation
    });

    expect(updated.conversation).toEqual(conversation);

    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    writeCustomScenes([updated], storage);

    expect(readCustomScenes(storage)[0]?.conversation).toEqual(conversation);
  });

  it("normalizes persisted template conversations to serializable messages", () => {
    expect(normalizeSceneConversation([
      {
        id: "assistant-1",
        role: "assistant",
        content: "已更新模板。",
        streaming: true,
        receipt: { label: "已应用", actions: [{ label: "撤销", onAction: () => undefined }] }
      },
      { id: "user-1", role: "user", content: "继续优化" },
      { id: "", role: "assistant", content: "无效 id" },
      { id: "broken", role: "system", content: "无效角色" }
    ])).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        content: "已更新模板。",
        receipt: { label: "已应用" }
      },
      { id: "user-1", role: "user", content: "继续优化" }
    ]);
  });

  it("round-trips structured scene fields and keeps fields as the prompt source", () => {
    const fields = parseSceneFields("任务：广告海报\nSubject: 【产品】\n补充说明");
    fields[0] = { ...fields[0], value: "社媒广告" };

    expect(serializeSceneFields(fields)).toBe("任务：社媒广告\nSubject：【产品】\n补充说明");
    expect(createCustomScene({
      name: "测试场景",
      description: "",
      prompt: "这段旧文本不应覆盖字段",
      category: "marketing",
      mode: "generate",
      useCase: "ads-marketing",
      fields
    }, "structured").prompt).toBe("任务：社媒广告\nSubject：【产品】\n补充说明");
  });

  it("ignores malformed stored entries and only writes custom scenes", () => {
    const custom = createCustomScene(
      {
        name: "我的场景",
        description: "",
        prompt: "主体位于【地点】",
        category: "other",
        mode: "generate",
        useCase: "other"
      },
      "scene-2"
    );
    const values = new Map<string, string>([
      [CUSTOM_SCENES_STORAGE_KEY, JSON.stringify([custom, { id: "broken" }])]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(readCustomScenes(storage)).toEqual([custom]);
    writeCustomScenes([PRESET_SCENES[0], custom] as SceneDefinition[], storage);
    expect(JSON.parse(values.get(CUSTOM_SCENES_STORAGE_KEY) ?? "[]")).toEqual([custom]);
  });

  it("falls back to an empty list for corrupted storage", () => {
    expect(readCustomScenes({ getItem: () => "not-json" })).toEqual([]);
  });

  it("shows custom scenes first and orders them from newest to oldest", () => {
    const older = {
      ...createCustomScene({
        name: "较早模板",
        description: "",
        prompt: "较早模板",
        category: "other",
        mode: "generate",
        useCase: "other"
      }, "older"),
      createdAt: "2026-07-19T08:00:00.000Z"
    };
    const newer = {
      ...createCustomScene({
        name: "最新模板",
        description: "",
        prompt: "最新模板",
        category: "other",
        mode: "generate",
        useCase: "other"
      }, "newer"),
      createdAt: "2026-07-21T08:00:00.000Z"
    };
    const legacy = {
      ...createCustomScene({
        name: "旧版模板",
        description: "",
        prompt: "旧版模板",
        category: "other",
        mode: "generate",
        useCase: "other"
      }, "legacy"),
      createdAt: undefined
    };
    const input = [PRESET_SCENES[0], older, legacy, PRESET_SCENES[1], newer];

    expect(sortScenesForLibrary(input).map((scene) => scene.id)).toEqual([
      newer.id,
      older.id,
      legacy.id,
      PRESET_SCENES[0].id,
      PRESET_SCENES[1].id
    ]);
    expect(input[0]).toBe(PRESET_SCENES[0]);
  });

  it("starts without preselected favorites and preserves an explicit empty selection", () => {
    expect(readFavoriteSceneIds({ getItem: () => null })).toEqual(DEFAULT_FAVORITE_SCENE_IDS);
    expect(DEFAULT_FAVORITE_SCENE_IDS).toEqual([]);
    expect(readFavoriteSceneIds({ getItem: () => "[]" })).toEqual([]);
  });

  it("normalizes and persists favorite scene ids", () => {
    const values = new Map<string, string>([
      [FAVORITE_SCENE_IDS_STORAGE_KEY, JSON.stringify(["preset:ecommerce", "preset:ecommerce", 42])]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(readFavoriteSceneIds(storage)).toEqual(["preset:ecommerce"]);
    writeFavoriteSceneIds(["preset:social", "preset:social"], storage);
    expect(JSON.parse(values.get(FAVORITE_SCENE_IDS_STORAGE_KEY) ?? "[]")).toEqual(["preset:social"]);
  });

  it("places favorites first, then adds three non-duplicate random presets", () => {
    const favoriteIds = ["custom:favorite", "preset:ecommerce"];
    const customFavorite = createCustomScene({
      name: "收藏模板",
      description: "",
      prompt: "任务：收藏模板",
      category: "other",
      mode: "generate",
      useCase: "other"
    }, "favorite");
    const quickScenes = getQuickScenes(
      [...PRESET_SCENES, customFavorite],
      favoriteIds,
      "generate",
      false,
      () => 0
    );

    expect(quickScenes.slice(0, favoriteIds.length).map((scene) => scene.id)).toEqual(favoriteIds);
    expect(quickScenes.slice(favoriteIds.length)).toHaveLength(QUICK_PRESET_SCENE_COUNT);
    expect(quickScenes.slice(favoriteIds.length).every((scene) => scene.source === "preset")).toBe(true);
    expect(new Set(quickScenes.map((scene) => scene.id)).size).toBe(quickScenes.length);
  });

  it("randomizes the three official quick scenes and keeps them in the active mode", () => {
    const first = getQuickScenes(PRESET_SCENES, [], "generate", false, () => 0).map((scene) => scene.id);
    const last = getQuickScenes(PRESET_SCENES, [], "generate", false, () => 0.999).map((scene) => scene.id);
    const edit = getQuickScenes(PRESET_SCENES, [], "edit", true, () => 0).map((scene) => scene.id);

    expect(first).toHaveLength(QUICK_PRESET_SCENE_COUNT);
    expect(last).toHaveLength(QUICK_PRESET_SCENE_COUNT);
    expect(edit).toHaveLength(QUICK_PRESET_SCENE_COUNT);
    expect(first).not.toEqual(last);
    expect(edit.every((id) => id.startsWith("preset:edit-"))).toBe(true);
  });

  it("matches new scene ids and legacy prompts with filled placeholders", () => {
    const scene = PRESET_SCENES.find((item) => item.id === "preset:ecommerce");
    expect(scene).toBeDefined();
    expect(sceneMatchesGeneration(scene!, "任意提示词", "preset:ecommerce")).toBe(true);
    expect(sceneMatchesGeneration(scene!, scene!.prompt.replace("【产品】", "一只陶瓷杯"))).toBe(true);
    expect(sceneMatchesGeneration(scene!, "完全不同的场景描述")).toBe(false);
  });
});
