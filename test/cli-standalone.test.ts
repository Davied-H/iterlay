import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { workspaceCipher } from "../cli/src/credentials.js";
import { SettingsStore } from "../electron/storage/settings-store-core.js";
import { configureProvider } from "../electron/provider-settings.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-node-credentials-")); directories.push(directory);
  const cipher = await workspaceCipher(directory);
  return { directory, cipher, store: new SettingsStore(path.join(directory, "workspace"), cipher) };
}
describe("standalone credentials and first-run image configuration", () => {
  it("persists image configuration and credentials without Electron and preserves omitted fields", async () => {
    const { directory, cipher, store } = await fixture();
    await configureProvider(store, { kind: "image", providerId: "image", baseUrl: "https://example.com", model: "fixture", apiKey: "fixture-secret", setDefault: true });
    await configureProvider(store, { kind: "image", providerId: "image", model: "other" });
    const reloaded = new SettingsStore(path.join(directory, "workspace"), await workspaceCipher(directory));
    expect(reloaded.getSettings().activeProviderId).toBe("image");
    expect(reloaded.getSettings().providers.find((p) => p.id === "image")).toMatchObject({ model: "other", generationEndpoint: "/v1/images/generations", supportsReferenceImages: true });
    expect(reloaded.getApiKey("image")).toBe("fixture-secret");
    expect(await readFile(path.join(directory, "workspace/settings.json"), "utf8")).not.toContain("fixture-secret");
    const a = cipher.encryptString("fixture-secret"), b = cipher.encryptString("fixture-secret");
    expect(a.equals(b)).toBe(false); expect(cipher.decryptString(a)).toBe("fixture-secret");
    a[a.length - 1] ^= 1; expect(() => cipher.decryptString(a)).toThrow();
    expect(() => cipher.decryptString(Buffer.from("desktop-safeStorage-cipher"))).toThrow("桌面端凭据");
  });
  it("refuses to silently replace a missing key for existing encrypted credentials", async () => {
    const { directory, store } = await fixture();
    await configureProvider(store, { kind: "image", providerId: "image", baseUrl: "https://example.com", model: "fixture", apiKey: "fixture-secret" });
    await rm(path.join(directory, "credential-key"));
    await expect(workspaceCipher(directory)).rejects.toThrow("凭据密钥缺失");
    await expect(readFile(path.join(directory, "credential-key"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects invalid image fields atomically and keeps other provider categories intact", async () => {
    const { directory, store } = await fixture();
    await configureProvider(store, { kind: "image", providerId: "image", baseUrl: "https://example.com", model: "fixture" });
    const before = await readFile(path.join(directory, "workspace/settings.json"), "utf8");
    for (const invalid of [{ apiMode: "chat" }, { generationEndpoint: "//elsewhere.example" }, { referenceEndpoint: "/../private" }, { voice: "nova" }, { type: "codex-oauth" }]) {
      await expect(configureProvider(store, { kind: "image", providerId: "image", ...invalid })).rejects.toThrow();
      expect(await readFile(path.join(directory, "workspace/settings.json"), "utf8")).toBe(before);
    }
    expect(store.getSettings().videoProviders.length).toBeGreaterThan(0);
    await configureProvider(store, { kind: "image", providerId: "image", action: "default" });
    await configureProvider(store, { kind: "image", providerId: "image", action: "remove" });
    expect(store.getSettings().providers.some((p) => p.id === "image")).toBe(false);
  });
  it("uses native provider endpoints and rejects corrupt credential keys", async () => {
    const { directory, store } = await fixture();
    for (const [type, endpoint] of [["ark", "/images/generations"], ["bailian", "/api/v1/services/aigc/multimodal-generation/generation"]]) {
      await configureProvider(store, { kind: "image", providerId: type, type, baseUrl: "https://example.com", model: "fixture" });
      expect(store.getSettings().providers.find((p) => p.id === type)?.generationEndpoint).toBe(endpoint);
    }
    await mkdir(path.join(directory, "workspace"), { recursive: true });
    await writeFile(path.join(directory, "credential-key"), Buffer.alloc(1));
    await expect(workspaceCipher(directory)).rejects.toThrow("凭据密钥损坏");
  });
});
