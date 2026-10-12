import { mkdtemp,rm,writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { normalizeProvider,SettingsStore } from "../electron/storage/settings-store.js";

describe("SettingsStore provider normalization", () => {
  it("migrates the legacy board-only Agent switch to the global assistant switch", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      await writeFile(path.join(directory, "settings.json"), JSON.stringify({
        providers: [],
        activeProviderId: "",
        theme: "system",
        boardAssistantAgentModeEnabled: true
      }), "utf8");
      expect(new SettingsStore(directory).getSettings()).toMatchObject({
        boardAssistantAgentModeEnabled: true,
        assistantAgentModeEnabled: true
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults language to system and persists explicit preferences", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.language).toBe("system");

      store.saveSettings({ ...defaults, language: "en-US" });
      expect(new SettingsStore(directory).getSettings().language).toBe("en-US");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists every app preference through independent incremental updates", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const preferences = {
        theme: "dark",
        promptDockAutoCollapse: false,
        advancedVideoModesEnabled: true,
        canvasThumbnailPreview: true,
        canvasMinimapVisible: false,
        canvasImageToolbarOnHover: true,
        canvasRelationshipHoverHighlight: true,
        wechatStickerExportEnabled: true,
        copyImageFormat: "gif",
        boardSmartSuggestionsEnabled: false,
        boardAssistantEnabled: true,
        boardAssistantAwarenessEnabled: true,
        boardAssistantIntentSuggestionsEnabled: false,
        boardAssistantIntentSuggestionCount: 5,
        editSmartSuggestionsEnabled: true,
        memoryEnabled: true,
        memoryUsageLevel: "active",
        editInfoMode: "panel",
        imageDoubleClickAction: "reference",
        downloadDirectory: path.join(directory, "downloads"),
        versionSeparationMode: "extract",
        generateButtonStyle: "send",
        appIcon: "mascot",
        boardTrashRetentionDays: 90
      } as const;

      for (const [key, value] of Object.entries(preferences)) {
        store.updateSettings({ [key]: value });
      }

      expect(new SettingsStore(directory).getSettings()).toMatchObject(preferences);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults trash retention to three days and persists supported values", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const settings = store.getSettings();

      expect(settings.boardTrashRetentionDays).toBe(3);
      store.saveSettings({ ...settings, boardTrashRetentionDays: 7 });
      expect(new SettingsStore(directory).getSettings().boardTrashRetentionDays).toBe(7);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires a self-configured provider for a new install", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const settings = new SettingsStore(directory).getSettings();
      expect(settings.activeProviderId).toBe("openai-compatible");
      expect(settings.providers).toEqual([
        expect.objectContaining({ id: "openai-compatible", type: "openai-compatible", name: "OpenAI Compatible" })
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not inject official providers when saving", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      const custom = normalizeProvider({ id: "custom", name: "Custom", baseUrl: "https://example.com" });
      store.saveSettings({ ...defaults, providers: [custom], activeProviderId: custom.id });
      const saved = new SettingsStore(directory).getSettings();
      expect(saved.activeProviderId).toBe(custom.id);
      expect(saved.providers.map((provider) => provider.id)).toEqual([custom.id]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves the active custom provider during upgrade", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      await writeFile(
        path.join(directory, "settings.json"),
        JSON.stringify({
          providers: [{
            id: "existing-custom",
            name: "Existing Custom",
            type: "openai-compatible",
            baseUrl: "https://example.com",
            generationEndpoint: "/v1/images/generations",
            model: "custom-image-model",
            supportsReferenceImages: true
          }],
          activeProviderId: "existing-custom",
          theme: "system"
        }),
        "utf8"
      );
      const settings = new SettingsStore(directory).getSettings();
      expect(settings.activeProviderId).toBe("existing-custom");
      expect(settings.providers.map((provider) => provider.id)).toEqual(["existing-custom"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("forces openai-compatible type and keeps provided fields", () => {
    const provider = normalizeProvider({
      id: "relay-1",
      name: "中转 A",
      baseUrl: "https://relay.example.com",
      generationEndpoint: "/v1/responses",
      model: "gpt-5.5"
    });
    expect(provider.type).toBe("openai-compatible");
    expect(provider.id).toBe("relay-1");
    expect(provider.name).toBe("中转 A");
    expect(provider.model).toBe("gpt-5.5");
  });

  it("infers apiMode from the generation endpoint when missing", () => {
    expect(normalizeProvider({ generationEndpoint: "/v1/responses" }).apiMode).toBe("responses");
    expect(normalizeProvider({ generationEndpoint: "/v1/images/generations" }).apiMode).toBe("images");
  });

  it("preserves fal providers and fills fal queue defaults", () => {
    const provider = normalizeProvider({
      id: "fal-1",
      name: "fal production",
      type: "fal",
      baseUrl: "",
      generationEndpoint: "",
      model: "fal-ai/flux/schnell",
      supportsReferenceImages: false
    });

    expect(provider).toMatchObject({
      id: "fal-1",
      name: "fal production",
      type: "fal",
      baseUrl: "https://queue.fal.run",
      model: "fal-ai/flux/schnell",
      supportsReferenceImages: false
    });
    expect(provider.apiMode).toBeUndefined();
    expect(provider.falSizeMode).toBe("aspect_ratio_and_resolution");
  });

  it("preserves codex OAuth providers without exposing connection fields", () => {
    const provider = normalizeProvider({
      id: "codex-personal",
      name: "我的 Codex",
      type: "codex-oauth",
      baseUrl: "https://should-not-persist.example.com",
      generationEndpoint: "/v1/responses",
      model: "",
      supportsReferenceImages: false
    });

    expect(provider).toMatchObject({
      id: "codex-personal",
      name: "我的 Codex",
      type: "codex-oauth",
      apiMode: "responses",
      baseUrl: "",
      generationEndpoint: "",
      model: "gpt-image-2",
      supportsReferenceImages: true
    });
  });

  it.each([
    ["openrouter", "https://openrouter.ai/api", "/v1/images", "bytedance-seed/seedream-4.5", true],
    ["bailian", "https://dashscope.aliyuncs.com", "/api/v1/services/aigc/multimodal-generation/generation", "qwen-image-2.0-pro", true],
    ["ark", "https://ark.cn-beijing.volces.com/api/v3", "/images/generations", "doubao-seedream-5-0-pro-260628", true],
    ["poe", "https://api.poe.com", "/v1/images", "nano-banana-2", false]
  ] as const)("preserves %s providers and fills platform defaults", (type, baseUrl, endpoint, model, supportsReferences) => {
    const provider = normalizeProvider({
      id: `${type}-custom`,
      name: "",
      type,
      baseUrl: "",
      generationEndpoint: "",
      model: ""
    });

    expect(provider).toMatchObject({
      id: `${type}-custom`,
      type,
      baseUrl,
      generationEndpoint: endpoint,
      model,
      supportsReferenceImages: supportsReferences
    });
    expect(provider.falSizeMode).toBeUndefined();
  });

  it("fills id/name defaults when omitted", () => {
    const provider = normalizeProvider({ baseUrl: "https://x.example.com" });
    expect(provider.id).toBeTruthy();
    expect(provider.name).toBeTruthy();
  });

  it("defaults image double-click to edit and persists alternate actions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.imageDoubleClickAction).toBe("edit");

      store.saveSettings({ ...defaults, imageDoubleClickAction: "reference" });
      expect(new SettingsStore(directory).getSettings().imageDoubleClickAction).toBe("reference");

      store.saveSettings({ ...defaults, imageDoubleClickAction: "focus" });
      expect(new SettingsStore(directory).getSettings().imageDoubleClickAction).toBe("focus");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults canvas thumbnail previews to on and preserves an explicit opt-out", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.canvasThumbnailPreview).toBe(true);

      store.saveSettings({ ...defaults, canvasThumbnailPreview: false });
      expect(new SettingsStore(directory).getSettings().canvasThumbnailPreview).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("enables online image sharing by default and persists an explicit opt-out", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.onlineImageSharingEnabled).toBe(true);

      store.saveSettings({ ...defaults, onlineImageSharingEnabled: false });
      expect(new SettingsStore(directory).getSettings().onlineImageSharingEnabled).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults the canvas minimap to visible and persists an explicit opt-out", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.canvasMinimapVisible).toBe(true);

      store.saveSettings({ ...defaults, canvasMinimapVisible: false });
      expect(new SettingsStore(directory).getSettings().canvasMinimapVisible).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults image toolbar hover activation to off and persists an explicit opt-in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.canvasImageToolbarOnHover).toBe(false);

      store.saveSettings({ ...defaults, canvasImageToolbarOnHover: true });
      expect(new SettingsStore(directory).getSettings().canvasImageToolbarOnHover).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults relationship hover highlighting to off and persists an explicit opt-in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.canvasRelationshipHoverHighlight).toBe(false);

      store.saveSettings({ ...defaults, canvasRelationshipHoverHighlight: true });
      expect(new SettingsStore(directory).getSettings().canvasRelationshipHoverHighlight).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults prompt dock anchor expansion to off and persists an explicit opt-in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.promptDockAutoCollapse).toBe(false);

      store.saveSettings({ ...defaults, promptDockAutoCollapse: true });
      expect(new SettingsStore(directory).getSettings().promptDockAutoCollapse).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults advanced video modes to off and persists an explicit opt-in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.advancedVideoModesEnabled).toBe(false);

      store.saveSettings({ ...defaults, advancedVideoModesEnabled: true });
      expect(new SettingsStore(directory).getSettings().advancedVideoModesEnabled).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults board smart suggestions to off and persists an explicit opt-in", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.boardSmartSuggestionsEnabled).toBe(false);

      store.saveSettings({ ...defaults, boardSmartSuggestionsEnabled: true });
      expect(new SettingsStore(directory).getSettings().boardSmartSuggestionsEnabled).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults every board AI feature on and persists explicit opt-outs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.boardAssistantEnabled).toBe(true);
      expect(defaults.boardAssistantAgentModeEnabled).toBe(false);
      expect(defaults.assistantAgentModeEnabled).toBe(false);
      expect(defaults.piAgentBuiltinTools).toEqual(["read", "grep", "find", "ls"]);
      expect(defaults.piAgentIterlayTools).toHaveLength(26);
      expect(defaults.piAgentMaxTurns).toBe(12);
      expect(defaults.piAgentWebSearchMaxResults).toBe(5);
      expect(defaults.boardAssistantAwarenessEnabled).toBe(true);
      expect(defaults.boardAssistantIntentSuggestionsEnabled).toBe(true);
      expect(defaults.boardAssistantIntentSuggestionCount).toBe(3);

      store.saveSettings({
        ...defaults,
        boardAssistantEnabled: false,
        boardAssistantAgentModeEnabled: true,
        assistantAgentModeEnabled: true,
        piAgentBuiltinTools: ["read", "bash"],
        piAgentIterlayTools: ["get_board"],
        piAgentSkillPaths: ["/tmp/skill/SKILL.md"],
        piAgentExtensionPaths: ["/tmp/extension.ts"],
        piAgentMaxTurns: 20,
        piAgentWebSearchMaxResults: 8,
        boardAssistantAwarenessEnabled: false,
        boardAssistantIntentSuggestionsEnabled: false,
        boardAssistantIntentSuggestionCount: 5
      });
      expect(new SettingsStore(directory).getSettings()).toMatchObject({
        boardAssistantEnabled: false,
        boardAssistantAgentModeEnabled: true,
        assistantAgentModeEnabled: true,
        piAgentBuiltinTools: ["read", "bash"],
        piAgentIterlayTools: ["get_board"],
        piAgentSkillPaths: ["/tmp/skill/SKILL.md"],
        piAgentExtensionPaths: ["/tmp/extension.ts"],
        piAgentMaxTurns: 20,
        piAgentWebSearchMaxResults: 8,
        boardAssistantAwarenessEnabled: false,
        boardAssistantIntentSuggestionsEnabled: false,
        boardAssistantIntentSuggestionCount: 5
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults edit smart suggestions to on and persists an explicit opt-out", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.editSmartSuggestionsEnabled).toBe(true);

      store.saveSettings({ ...defaults, editSmartSuggestionsEnabled: false });
      expect(new SettingsStore(directory).getSettings().editSmartSuggestionsEnabled).toBe(false);

      store.saveSettings({ ...defaults, editSmartSuggestionsEnabled: true });
      expect(new SettingsStore(directory).getSettings().editSmartSuggestionsEnabled).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults assistant memory to on and persists its usage level", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.memoryEnabled).toBe(true);
      expect(defaults.memoryUsageLevel).toBe("balanced");

      store.saveSettings({ ...defaults, memoryEnabled: true, memoryUsageLevel: "active" });
      expect(new SettingsStore(directory).getSettings()).toMatchObject({
        memoryEnabled: true,
        memoryUsageLevel: "active"
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists the automatic download directory across restarts", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      expect(store.getSettings().downloadDirectory).toBe("");

      const downloadDirectory = path.join(directory, "downloads");
      store.setDownloadDirectory(downloadDirectory);
      expect(new SettingsStore(directory).getSettings().downloadDirectory).toBe(downloadDirectory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults version separation to copy and persists direct separation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.versionSeparationMode).toBe("copy");

      store.saveSettings({ ...defaults, versionSeparationMode: "extract" });
      expect(new SettingsStore(directory).getSettings().versionSeparationMode).toBe("extract");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("hides WeChat sticker export by default and persists the experimental toggle", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.wechatStickerExportEnabled).toBe(false);

      store.saveSettings({ ...defaults, wechatStickerExportEnabled: true });
      expect(new SettingsStore(directory).getSettings().wechatStickerExportEnabled).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults copied images to PNG and persists GIF output", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.copyImageFormat).toBe("png");

      store.saveSettings({ ...defaults, copyImageFormat: "gif" });
      expect(new SettingsStore(directory).getSettings().copyImageFormat).toBe("gif");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults the generate button to folded and persists alternate styles", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const defaults = store.getSettings();
      expect(defaults.generateButtonStyle).toBe("folded");

      store.saveSettings({ ...defaults, generateButtonStyle: "glow" });
      expect(new SettingsStore(directory).getSettings().generateButtonStyle).toBe("glow");

      store.saveSettings({ ...defaults, generateButtonStyle: "prismatic" });
      expect(new SettingsStore(directory).getSettings().generateButtonStyle).toBe("prismatic");

      store.saveSettings({ ...defaults, generateButtonStyle: "send" });
      expect(new SettingsStore(directory).getSettings().generateButtonStyle).toBe("send");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("defaults to the brand app icon and persists the mascot icon", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      expect(store.getSettings().appIcon).toBe("default");

      store.setAppIcon("mascot");
      expect(new SettingsStore(directory).getSettings().appIcon).toBe("mascot");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists custom app icon history and falls back to the mascot when the active custom icon is deleted", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-settings-"));
    try {
      const store = new SettingsStore(directory);
      const customIcon = {
        id: "portrait-1",
        name: "我的头像.png",
        dataUrl: "data:image/png;base64,AAAA",
        createdAt: "2026-07-23T00:00:00.000Z"
      };

      const added = store.addCustomAppIcon(customIcon);
      expect(added.appIcon).toBe("custom:portrait-1");
      expect(new SettingsStore(directory).getSettings()).toMatchObject({
        appIcon: "custom:portrait-1",
        customAppIcons: [customIcon]
      });

      const deleted = new SettingsStore(directory).deleteCustomAppIcon("portrait-1");
      expect(deleted).toEqual({ appIcon: "mascot", customAppIcons: [] });
      expect(new SettingsStore(directory).getSettings().appIcon).toBe("mascot");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
