import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifyProviderOutput } from "../electron/application/provider-output-verification";
import { SettingsStore } from "../electron/storage/settings-store-core";
import { AssetStore } from "../electron/storage/asset-store";
import { HistoryStore } from "../electron/storage/history-store";
import { imageOutputConfigurationKey, imageOutputVerification, normalizeImageOutput } from "../shared/image-output";
import type { ProviderConfig } from "../shared/types";

const cipher = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
const vector = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="20" fill="blue"/></svg>');
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2mcAAAAASUVORK5CYII=", "base64");
const provider: ProviderConfig = { id: "relay", name: "Relay", type: "openai-compatible", apiMode: "images", baseUrl: "https://fixture.invalid", generationEndpoint: "/v1/images/generations", model: "gpt-image-2.6-flare", supportsReferenceImages: true,
  imageCapabilities: { "gpt-image-2.6-flare": { outputFormats: ["png", "svg", "gif"], svgModel: "author" } } };
const input = { model: provider.model, outputFormat: "svg" as const, workflowMode: "generate" as const, referenceImages: [], size: "auto" };

async function fixture(bytes = vector) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-format-verification-"));
  const settings = new SettingsStore(directory, cipher), assets = new AssetStore(directory), history = new HistoryStore(directory);
  settings.updateSettings({ providers: [provider], activeProviderId: provider.id });
  settings.setApiKey(provider.id, "fixture-only");
  const config = () => settings.getSettings().providers.find((p) => p.id === provider.id)!;
  const generate = vi.fn(async () => ({ images: [{ bytes, mimeType: "image/png" }] }));
  const dependencies = { settings, assets, history, getProviderAdapter: () => ({ generate, testConnection: async () => undefined }) };
  const verify = (acknowledgeCharges = true) => verifyProviderOutput(config(), { mode: "generation", outputFormat: "svg", acknowledgeCharges }, undefined, dependencies);
  return { directory, settings, history, config, generate, dependencies, verify,
    dispose: async () => { await history.flush(); await rm(directory, { recursive: true, force: true }); } };
}

describe("configuration-bound real output verification", () => {
  it("does not resurrect an old passed result when a stale settings draft is saved", async () => {
    const f = await fixture();
    try {
      await f.verify();
      const passed = f.config();
      passed.imageOutputVerifications![passed.model]!.svg!.checkedAt = "2026-01-01T00:00:00.000Z";
      f.settings.updateSettings({ providers: [passed] });
      const staleDraft = structuredClone(f.config());
      f.generate.mockResolvedValueOnce({ images: [{ bytes: png, mimeType: "image/png" }] });
      expect((await f.verify()).ok).toBe(false);
      expect(imageOutputVerification(f.config(), "svg")?.status).toBe("failed");
      f.settings.updateSettings({ providers: [{ ...staleDraft, name: "Renamed service" }] });
      expect(imageOutputVerification(f.config(), "svg")?.status).toBe("failed");
      expect(() => normalizeImageOutput(input, f.config())).toThrow("验证");
    } finally { await f.dispose(); }
  });
  it("requires explicit charge acknowledgment and blocks unverified SVG before normal generation", async () => {
    const f = await fixture();
    try {
      expect(() => normalizeImageOutput(input, f.config())).toThrow("验证");
      expect((await f.verify(false)).billing?.generationSubmitted).toBe(false);
      expect(f.generate).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });

  it("validates SVG bytes, persists proof across reload and enables normal SVG requests", async () => {
    const f = await fixture();
    try {
      const result = await f.verify();
      expect(result).toMatchObject({ ok: true, outputVerification: { status: "passed", actualMimeType: "image/svg+xml" } });
      const restored = new SettingsStore(f.directory, cipher).getSettings().providers.find((p) => p.id === provider.id)!;
      expect(normalizeImageOutput(input, restored).outputFormat).toBe("svg");
      expect(imageOutputVerification(restored, "svg")?.status).toBe("passed");
      expect((await readFile(result.outputPaths![0])).toString()).toContain("<svg");
      expect((await f.history.listJobs())[0]).toMatchObject({ status: "succeeded", delivery: { status: "succeeded" } });
      expect(f.generate).toHaveBeenCalledOnce();
    } finally { await f.dispose(); }
  });

  it("retains PNG originals but fails SVG verification and does not enable it", async () => {
    const f = await fixture(png);
    try {
      const result = await f.verify();
      expect(result).toMatchObject({ ok: false, outputVerification: { status: "failed", actualMimeType: "image/png" }, checks: { capability: { status: "failed" }, generation: { status: "passed" } } });
      expect(await readFile(result.outputPaths![0])).toEqual(png);
      expect((await f.history.listJobs())[0]).toMatchObject({ status: "succeeded", delivery: { status: "failed" } });
      expect(() => normalizeImageOutput(input, f.config())).toThrow("验证");
      expect(f.generate).toHaveBeenCalledOnce();
    } finally { await f.dispose(); }
  });

  it("invalidates proof after changing connection, model, author, transport or credentials", async () => {
    const f = await fixture();
    try {
      await f.verify();
      const verified = f.config();
      for (const patch of [{ baseUrl: "https://other.invalid" }, { model: "other-model" }, { generationEndpoint: "/other" }, { apiMode: "responses" as const },
        { imageCapabilities: { [provider.model]: { outputFormats: ["svg" as const], svgModel: "other-author" } } }]) {
        expect(imageOutputVerification({ ...verified, ...patch }, "svg")).toBeUndefined();
      }
      f.settings.setApiKey(provider.id, "new-fixture-only");
      expect(imageOutputVerification(f.config(), "svg")).toBeUndefined();
      f.settings.updateSettings({ providers: [verified] });
      expect(imageOutputConfigurationKey(f.config())).not.toBe(imageOutputConfigurationKey(verified));
      expect(() => normalizeImageOutput(input, f.config())).toThrow("验证");
    } finally { await f.dispose(); }
  });

  it("does not attach a late result to a connection changed while verification runs", async () => {
    const f = await fixture();
    try {
      f.generate.mockImplementationOnce(async () => {
        f.settings.updateSettings({ providers: [{ ...f.config(), baseUrl: "https://changed.invalid" }] });
        return { images: [{ bytes: vector, mimeType: "image/svg+xml" }] };
      });
      expect((await f.verify()).ok).toBe(true);
      expect(imageOutputVerification(f.config(), "svg")).toBeUndefined();
    } finally { await f.dispose(); }
  });
});
