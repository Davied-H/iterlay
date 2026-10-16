import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import { DEFAULT_VIDEO_PROVIDER_ID,OFFICIAL_TEXT_PROVIDER_ID } from "../shared/types.js";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, "utf8"),
    decryptString: (buffer: Buffer) => buffer.toString("utf8").replace(/^enc:/, "")
  }
}));

import { normalizeProvider,SettingsStore } from "../electron/storage/settings-store.js";

const tempDirs: string[] = [];

function makeDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "iterlay-settings-"));
  tempDirs.push(dir);
  return dir;
}

function encrypted(value: string): string {
  return Buffer.from(`enc:${value}`, "utf8").toString("base64");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("SettingsStore 文本 Provider 迁移", () => {
  it("fresh install offers a self-configured text provider", () => {
    const store = new SettingsStore(makeDataDir());
    const settings = store.getSettings();
    expect(settings.textProviders).toHaveLength(1);
    expect(settings.textProviders[0].id).toBe("text-openai-compatible");
    expect(settings.activeTextProviderId).toBe("text-openai-compatible");
    expect(settings.videoProviders.map((provider) => provider.id)).toEqual([DEFAULT_VIDEO_PROVIDER_ID]);
    expect(settings.activeVideoProviderId).toBe(DEFAULT_VIDEO_PROVIDER_ID);
  });

  it("round-trips video providers independently from image providers", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({
      ...base,
      videoProviders: [
        ...base.videoProviders,
        { id: "ark-team", name: "团队方舟", type: "ark", baseUrl: "https://ark.example.com/", model: "seedance-team" }
      ],
      activeVideoProviderId: "ark-team"
    });
    store.setApiKey("ark-team", "ark-secret");

    const reloaded = new SettingsStore(dir);
    expect(reloaded.getSettings()).toMatchObject({
      activeVideoProviderId: "ark-team",
      videoProviders: expect.arrayContaining([expect.objectContaining({ id: "ark-team", model: "seedance-team" })])
    });
    expect(reloaded.getApiKey("ark-team")).toBe("ark-secret");
    expect(reloaded.getKeyStatus()["ark-team"]).toBe(true);
  });

  it("resolves an OpenRouter video provider through its linked image connection", () => {
    const store = new SettingsStore(makeDataDir());
    const settings = store.getSettings();
    const imageProvider = normalizeProvider({
      id: "openrouter-image",
      name: "OpenRouter 图片",
      type: "openrouter",
      baseUrl: "https://openrouter.example/api",
      model: "vendor/image-model"
    });
    store.saveSettings({
      ...settings,
      providers: [...settings.providers, imageProvider],
      videoProviders: [
        ...settings.videoProviders,
        {
          id: "openrouter-video",
          name: "OpenRouter 视频",
          type: "openrouter",
          connectionProviderId: imageProvider.id,
          baseUrl: "https://unused.example/api",
          model: "vendor/video-model",
          models: ["vendor/video-model"]
        }
      ]
    });
    store.setApiKey(imageProvider.id, "shared-openrouter-secret");

    expect(store.resolveVideoProviderConnection("openrouter-video")).toEqual({
      baseUrl: "https://openrouter.example/api",
      apiKey: "shared-openrouter-secret",
      connectionProviderId: imageProvider.id
    });
  });

  it("normalizes and persists a fal.ai video provider", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({
      ...base,
      videoProviders: [{ id: "fal-video", name: "", type: "fal", baseUrl: "", model: "" }],
      activeVideoProviderId: "fal-video"
    });
    expect(new SettingsStore(dir).getSettings().videoProviders.find((provider) => provider.id === "fal-video")).toMatchObject({
      id: "fal-video",
      name: "fal.ai",
      type: "fal",
      baseUrl: "https://queue.fal.run",
      model: expect.stringContaining("fal-ai/")
    });
  });

  it("resolves a fal.ai video connection from a linked image provider", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    const falImage = {
      id: "fal-images",
      name: "团队 fal.ai",
      type: "fal" as const,
      baseUrl: "https://queue.fal.example",
      generationEndpoint: "",
      model: "fal-ai/nano-banana-pro",
      supportsReferenceImages: true
    };
    store.saveSettings({
      ...base,
      providers: [...base.providers, falImage],
      videoProviders: [{
        id: "fal-video",
        name: "fal.ai 视频",
        type: "fal",
        connectionProviderId: falImage.id,
        baseUrl: "https://unused.example",
        model: "fal-ai/kling-video"
      }],
      activeVideoProviderId: "fal-video"
    });
    store.setApiKey(falImage.id, "shared-fal-key");

    expect(store.resolveVideoProviderConnection("fal-video")).toEqual({
      baseUrl: "https://queue.fal.example",
      apiKey: "shared-fal-key",
      connectionProviderId: falImage.id
    });
    expect(store.getKeyStatus()["fal-video"]).toBe(true);
    expect(new SettingsStore(dir).getSettings().videoProviders.find((provider) => provider.id === "fal-video")).toMatchObject({
      connectionProviderId: falImage.id,
      model: "fal-ai/kling-video"
    });
  });

  it("rejects a dangling fal.ai image connection instead of silently using the video key", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({
      ...base,
      videoProviders: [{
        id: "fal-video",
        name: "fal.ai 视频",
        type: "fal",
        connectionProviderId: "missing-fal-images",
        baseUrl: "https://queue.fal.run",
        model: "fal-ai/kling-video"
      }],
      activeVideoProviderId: "fal-video"
    });
    store.setApiKey("fal-video", "stale-video-key");

    expect(() => store.resolveVideoProviderConnection("fal-video")).toThrow("关联的 fal.ai 图片服务不存在");
    expect(store.getKeyStatus()["fal-video"]).toBe(false);
  });

  it("migrates an existing Ark image-provider entry into the video provider list", () => {
    const dir = makeDataDir();
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify({
      providers: [{
        id: "legacy-ark",
        name: "火山方舟 Seedance",
        type: "openai-compatible",
        baseUrl: "https://ark.cn-beijing.volces.com",
        generationEndpoint: "",
        model: "seedance-legacy",
        supportsReferenceImages: false
      }],
      activeProviderId: "legacy-ark",
      encryptedApiKeys: { "legacy-ark": encrypted("ark-legacy-key") },
      theme: "system"
    }), "utf8");

    const store = new SettingsStore(dir);
    expect(store.getSettings()).toMatchObject({
      activeVideoProviderId: "legacy-ark",
      videoProviders: expect.arrayContaining([expect.objectContaining({
        id: "legacy-ark",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        model: "seedance-legacy"
      })])
    });
    expect(store.getApiKey("legacy-ark")).toBe("ark-legacy-key");
  });

  it("derives text providers from legacy provider.promptModel and copies API keys", () => {
    const dir = makeDataDir();
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify({
      providers: [
        {
          id: "sub2api",
          name: "me",
          type: "openai-compatible",
          apiMode: "responses",
          baseUrl: "https://relay.example.com",
          generationEndpoint: "/v1/responses",
          model: "gpt-5.5",
          promptModel: "gpt-4o-mini",
          supportsReferenceImages: true
        },
        {
          id: "bailian",
          name: "阿里云百炼",
          type: "bailian",
          baseUrl: "https://dashscope.aliyuncs.com",
          generationEndpoint: "/api/v1/services/aigc/multimodal-generation/generation",
          model: "qwen-image-2.0-pro",
          promptModel: "qwen-vl-plus",
          supportsReferenceImages: true
        },
        {
          id: "fal-ai",
          name: "fal.ai",
          type: "fal",
          baseUrl: "https://queue.fal.run",
          generationEndpoint: "",
          model: "fal-ai/nano-banana-pro",
          promptModel: "should-be-ignored",
          supportsReferenceImages: true
        }
      ],
      activeProviderId: "sub2api",
      encryptedApiKeys: {
        sub2api: encrypted("sk-legacy"),
        bailian: encrypted("sk-bailian")
      },
      theme: "dark"
    }), "utf8");

    const store = new SettingsStore(dir);
    const settings = store.getSettings();

    expect(settings.textProviders[0].id).toBe("text-sub2api");
    const derived = settings.textProviders.find((p) => p.id === "text-sub2api");
    expect(derived).toMatchObject({
      type: "openai-compatible",
      baseUrl: "https://relay.example.com",
      model: "gpt-4o-mini"
    });
    // bailian 文本走 compatible-mode 前缀；fal 没有文本能力，不派生。
    expect(settings.textProviders.find((p) => p.id === "text-bailian")).toMatchObject({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
      model: "qwen-vl-plus"
    });
    expect(settings.textProviders.some((p) => p.id === "text-fal-ai")).toBe(false);
    // 跟随原激活 provider。
    expect(settings.activeTextProviderId).toBe("text-sub2api");
    // key 密文拷贝到新 id。
    expect(store.getApiKey("text-sub2api")).toBe("sk-legacy");
    expect(store.getApiKey("text-bailian")).toBe("sk-bailian");
    expect(store.getKeyStatus()["text-sub2api"]).toBe(true);
    expect(store.getKeyStatus()[OFFICIAL_TEXT_PROVIDER_ID]).toBeUndefined();
    // 图片 provider 不再携带 promptModel。
    expect(settings.providers.find((p) => p.id === "sub2api")).not.toHaveProperty("promptModel", "gpt-4o-mini");
  });

  it("round-trips the new textProviders schema through saveSettings", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({
      ...base,
      textProviders: [
        ...base.textProviders,
        { id: "text-custom", name: "自定义文本", type: "openai-compatible", baseUrl: "https://text.example.com/", model: "gpt-4o-mini" }
      ],
      activeTextProviderId: "text-custom"
    });
    store.setApiKey("text-custom", "sk-text");

    const reloaded = new SettingsStore(dir).getSettings();
    expect(reloaded.textProviders.map((p) => p.id)).toEqual(["text-openai-compatible", "text-custom"]);
    expect(reloaded.textProviders[1].baseUrl).toBe("https://text.example.com");
    expect(reloaded.activeTextProviderId).toBe("text-custom");
    expect(new SettingsStore(dir).getApiKey("text-custom")).toBe("sk-text");
  });

  it("round-trips multiple models on the same image provider", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "iterlay-settings-"));
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({
      ...base,
      providers: [
        ...base.providers,
        {
          id: "multi-model",
          name: "Multi model",
          type: "openai-compatible",
          apiMode: "responses",
          baseUrl: "https://models.example.com",
          generationEndpoint: "/v1/responses",
          model: "model-b",
          models: ["model-a", "model-b", "model-a"],
          supportsReferenceImages: true
        }
      ],
      activeProviderId: "multi-model"
    });

    expect(new SettingsStore(dir).getSettings().providers.find((provider) => provider.id === "multi-model")).toMatchObject({
      model: "model-b",
      models: ["model-b", "model-a"]
    });
  });

  it("clamps a stale activeTextProviderId to an existing provider", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({ ...base, activeTextProviderId: "missing-id" });
    expect(new SettingsStore(dir).getSettings().activeTextProviderId).toBe("text-openai-compatible");
  });

  it("automatically binds a Codex text provider to every Codex image provider", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    store.saveSettings({
      ...base,
      providers: [
        ...base.providers,
        {
          id: "codex-personal",
          name: "我的 Codex",
          type: "codex-oauth",
          baseUrl: "",
          generationEndpoint: "",
          model: "gpt-image-2",
          supportsReferenceImages: true
        }
      ]
    });

    const reloaded = new SettingsStore(dir).getSettings();
    expect(reloaded.textProviders.find((provider) => provider.authProviderId === "codex-personal")).toMatchObject({
      id: "text-codex-personal",
      name: "我的 Codex",
      type: "codex-oauth",
      model: "gpt-5.4-mini"
    });
  });
  it.each(["fal", "openrouter"] as const)("detaches %s videos and retains their encrypted credentials after deleting the image source", (type) => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    const source = normalizeProvider({ id: "shared-source", type, baseUrl: "https://shared.example/api", model: "image-model" });
    store.saveSettings({ ...base, providers: [...base.providers, source], videoProviders: [
      { id: "shared-video", name: "Shared video", type, baseUrl: "https://unused.example", connectionProviderId: source.id, model: "video-model" }
    ], activeVideoProviderId: "shared-video" });
    store.setApiKey(source.id, "shared-secret");
    store.setApiKey("shared-video", "old-independent-secret");
    const before = store.getSettings();
    // The UI clears the link in its atomic settings payload.
    store.saveSettings({ ...before, providers: before.providers.filter((provider) => provider.id !== source.id),
      videoProviders: before.videoProviders.map((provider) => ({ ...provider, connectionProviderId: undefined })) });
    const reloaded = new SettingsStore(dir);
    expect(reloaded.getSettings().videoProviders[0]).toMatchObject({ id: "shared-video", baseUrl: source.baseUrl, model: "video-model" });
    expect(reloaded.getSettings().videoProviders[0].connectionProviderId).toBeUndefined();
    expect(reloaded.resolveVideoProviderConnection("shared-video")).toEqual({ baseUrl: source.baseUrl, apiKey: "shared-secret", connectionProviderId: "shared-video" });
    expect(reloaded.getApiKey(source.id)).toBe("");
    expect(reloaded.getKeyStatus()["shared-video"]).toBe(true);
    expect(reloaded.getSettings().activeVideoProviderId).toBe("shared-video");
  });
  it("also clears an existing video link when a caller deletes its source without clearing the reference", () => {
    const store = new SettingsStore(makeDataDir());
    const base = store.getSettings();
    const source = normalizeProvider({ id: "source", type: "fal", baseUrl: "https://source.example", model: "image-model" });
    store.saveSettings({ ...base, providers: [...base.providers, source], videoProviders: [
      { id: "video", name: "Video", type: "fal", baseUrl: "", connectionProviderId: source.id, model: "movie" }
    ] });
    const before = store.getSettings();
    store.saveSettings({ ...before, providers: before.providers.filter((provider) => provider.id !== source.id) });
    expect(store.getSettings().videoProviders[0].connectionProviderId).toBeUndefined();
    expect(store.getSettings().videoProviders[0].baseUrl).toBe(source.baseUrl);
    expect(store.getKeyStatus()["video"]).toBe(false);
  });
  it("does not recreate a deleted Codex text binding after restart", () => {
    const dir = makeDataDir();
    const store = new SettingsStore(dir);
    const base = store.getSettings();
    const account = normalizeProvider({ id: "account", type: "codex-oauth" });
    store.saveSettings({ ...base, providers: [...base.providers, account] });
    const linked = store.getSettings();
    expect(linked.textProviders.some((provider) => provider.authProviderId === account.id)).toBe(true);
    store.saveSettings({ ...linked,
      providers: linked.providers.map((provider) => provider.id === account.id ? { ...provider, autoBindText: false } : provider),
      textProviders: linked.textProviders.filter((provider) => provider.authProviderId !== account.id)
    });
    const reloaded = new SettingsStore(dir).getSettings();
    expect(reloaded.providers.find((provider) => provider.id === account.id)?.autoBindText).toBe(false);
    expect(reloaded.textProviders.some((provider) => provider.authProviderId === account.id)).toBe(false);
  });

});
