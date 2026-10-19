import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ safeStorage: {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/u, "")
} }));
import { safeStorage } from "electron";
import { SettingsStore } from "../electron/storage/settings-store.js";
import { configureProvider } from "../electron/provider-settings.js";
import { workspaceFixture } from "./helpers/workspace-fixture.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-provider-config-"));
  vi.restoreAllMocks();
  directories.push(directory);
  return { directory, store: new SettingsStore(directory) };
}
const audio = { kind: "audio", providerId: "tts", baseUrl: "https://example.com", model: "tts-model", voice: "nova" };
const video = { kind: "video", providerId: "video", type: "openrouter", baseUrl: "https://openrouter.ai/api", model: "vendor/video" };

describe("CLI Provider configuration", () => {
  it("persists TTS, voice and encrypted credentials across reload and legacy UI saves", async () => {
    const { store, directory } = await fixture();
    const result = await configureProvider(store, { ...audio, apiKey: "test-secret", setDefault: true });
    expect(result).toMatchObject({ authConfigured: true, kind: "audio" });
    expect(JSON.stringify(result)).not.toContain("test-secret");
    expect(await readFile(path.join(directory, "settings.json"), "utf8")).not.toContain("test-secret");
    await configureProvider(store, { kind: "audio", providerId: "tts", model: "new-model", voice: "echo" });
    const legacy = store.getSettings();
    delete legacy.audioProviders;
    delete legacy.activeAudioProviderId;
    store.saveSettings({ ...legacy, theme: "dark" });
    const reloaded = new SettingsStore(directory);
    expect(reloaded.getSettings()).toMatchObject({ theme: "dark", activeAudioProviderId: "tts", audioProviders: [{ model: "new-model", voice: "echo", speechEndpoint: "/v1/audio/speech" }] });
    expect(reloaded.getApiKey("tts")).toBe("test-secret");
    await configureProvider(reloaded, { kind: "audio", providerId: "tts", apiKey: "" });
    expect(new SettingsStore(directory).getKeyStatus().tts).toBe(false);
  });

  it("rolls back configuration changes if credential encryption fails", async () => {
    const { store, directory } = await fixture();
    await configureProvider(store, audio);
    const before = await readFile(path.join(directory, "settings.json"), "utf8");
    vi.spyOn(safeStorage, "isEncryptionAvailable").mockReturnValueOnce(false);
    await expect(configureProvider(store, { ...audio, voice: "changed", apiKey: "new-key" })).rejects.toThrow("无法安全保存");
    expect(store.getSettings().audioProviders?.[0].voice).toBe("nova");
    expect(await readFile(path.join(directory, "settings.json"), "utf8")).toBe(before);
  });

  it("serializes simultaneous video and audio edits and selects defaults without losing other settings", async () => {
    const { store, directory } = await fixture();
    store.updateSettings({ language: "en-US", cliDefaultBoardId: "board" });
    await Promise.all([
      configureProvider(store, { ...audio, apiKey: "audio-key" }),
      configureProvider(store, { ...video, apiKey: "video-key", models: ["other", "vendor/video"] })
    ]);
    await configureProvider(store, { kind: "video", providerId: "video", action: "default" });
    await configureProvider(store, { kind: "video", providerId: "video", model: "other" });
    const reloaded = new SettingsStore(directory);
    expect(reloaded.getSettings()).toMatchObject({ language: "en-US", cliDefaultBoardId: "board", activeVideoProviderId: "video", activeAudioProviderId: "tts" });
    expect(reloaded.getSettings().videoProviders.find((p) => p.id === "video")).toMatchObject({ model: "other", models: ["other", "vendor/video"] });
    expect(reloaded.getApiKey("video")).toBe("video-key");
    await configureProvider(reloaded, { kind: "audio", providerId: "tts", action: "remove" });
    expect(new SettingsStore(directory).getSettings()).toMatchObject({ audioProviders: [], activeAudioProviderId: "" });
    expect(reloaded.getKeyStatus().tts).toBeUndefined();
  });

  it.each([
    { baseUrl: "https://user:password@example.com" }, { baseUrl: "file:///tmp/audio" },
    { model: "" }, { voice: 123 }, { type: "fal" }, { models: [42] },
    { speechEndpoint: "https://elsewhere.example/speech" }, { speechEndpoint: "//elsewhere.example" },
    { apiKey: 123 }, { setDefault: "yes" }, { unknown: true }
  ])("rejects invalid input atomically: %j", async (invalid) => {
    const { store, directory } = await fixture();
    await configureProvider(store, audio);
    const before = await readFile(path.join(directory, "settings.json"), "utf8");
    await expect(configureProvider(store, { ...audio, ...invalid })).rejects.toThrow();
    expect(await readFile(path.join(directory, "settings.json"), "utf8")).toBe(before);
  });

  it("rejects ID collisions, missing defaults, and mismatched shared video connections", async () => {
    const { store } = await fixture();
    await configureProvider(store, audio);
    await expect(configureProvider(store, { ...video, providerId: "tts" })).rejects.toThrow("其它类型");
    await expect(configureProvider(store, { kind: "audio", providerId: "missing", action: "default" })).rejects.toThrow("不存在");
    await expect(configureProvider(store, { ...video, connectionProviderId: "missing" })).rejects.toThrow("不匹配");
  });

  it("exposes audio metadata through workspace discovery and routes configuration to the service", async () => {
    const { store } = await fixture();
    await configureProvider(store, { ...audio, apiKey: "private-key" });
    const { mocks, commands } = workspaceFixture();
    mocks.getSettings.mockResolvedValue({ ...store.getSettings(), audioProviders: [{ ...store.getSettings().audioProviders![0], apiKey: "legacy-secret" }], providerKeyStatus: store.getKeyStatus() });
    expect(await commands.call("list_providers", { kind: "audio" })).toEqual([expect.objectContaining({ id: "tts", kind: "audio", isDefault: true, authConfigured: true })]);
    expect(await commands.call("list_models", { providerId: "tts" })).toMatchObject({ defaultModel: "tts-model", models: ["tts-model"] });
    expect(await commands.call("get_provider", { providerId: "tts" })).toMatchObject({ voice: "nova" });
    expect(JSON.stringify(await commands.call("get_provider", { providerId: "tts" }))).not.toMatch(/private-key|legacy-secret/u);
    await commands.call("configure_provider", audio);
    expect(mocks.configureProvider).toHaveBeenCalledWith(audio);
  });
});
