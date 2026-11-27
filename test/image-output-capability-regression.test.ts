import { describe, expect, it } from "vitest";
import { imageOutputCapabilities, imageOutputConfigurationKey, normalizeImageOutput } from "../shared/image-output";
import type { ProviderConfig } from "../shared/types";
import { workspaceFixture } from "./helpers/workspace-fixture";

const provider: ProviderConfig = {
  id: "relay", name: "Relay", type: "openai-compatible", apiMode: "images",
  baseUrl: "https://fixture.invalid", generationEndpoint: "/v1/images/generations",
  model: "gpt-image-2.6-flare", supportsReferenceImages: true
};

describe("unverified image output declarations", () => {
  it.each(["gpt-image-2.6-flare", "gpt-image-2.6-sunburst-2026-11-01"])("does not infer vector or animation support from %s", (model) => {
    expect(imageOutputCapabilities({ ...provider, model })).toEqual({ outputFormats: ["png", "jpeg", "webp"], svgModel: undefined });
    expect(() => normalizeImageOutput({ workflowMode: "generate", prompt: "logo", model, size: "auto", referenceImages: [], outputFormat: "svg" }, provider)).toThrow("输出格式");
  });

  it("retains an explicit SVG opt-in without enabling other models", () => {
    const configured: ProviderConfig = { ...provider, imageCapabilities: { [provider.model]: { outputFormats: ["png", "svg"], svgModel: "author" } } };
    expect(imageOutputCapabilities(configured)).toEqual({ outputFormats: ["png", "svg"], svgModel: "author" });
    configured.imageOutputVerifications = { [provider.model]: { svg: { status: "passed", configurationKey: imageOutputConfigurationKey(configured), checkedAt: new Date().toISOString(), message: "fixture" } } };
    expect(normalizeImageOutput({ workflowMode: "generate", prompt: "logo", model: provider.model, size: "auto", referenceImages: [], outputFormat: "svg" }, configured).outputFormat).toBe("svg");
    expect(imageOutputCapabilities(configured, "gpt-image-2.6-sunburst").outputFormats).toEqual(["png", "jpeg", "webp"]);
  });

  it("marks both provider and model discovery as unverified local declarations", async () => {
    const f = workspaceFixture();
    const configured = { ...provider, imageCapabilities: { [provider.model]: { outputFormats: ["png", "svg"], svgModel: "author" } } };
    f.mocks.getSettings.mockResolvedValue({ activeProviderId: provider.id, providers: [configured] });
    const providers = await f.commands.call("list_providers", { kind: "image" });
    expect(providers).toEqual([expect.objectContaining({ capabilities: expect.objectContaining({ outputFormats: ["png", "svg"], capabilitySource: "local-configuration", verifiedOutputFormats: [] }) })]);
    expect(await f.commands.call("list_models", { providerId: provider.id })).toMatchObject({ imageCapabilities: { [provider.model]: { outputFormats: ["png", "svg"], capabilitySource: "local-configuration", verifiedOutputFormats: [] } } });
  });

  it("exposes a paid verification operation with explicit acknowledgment", async () => {
    const f = workspaceFixture();
    f.mocks.getSettings.mockResolvedValue({ activeProviderId: provider.id, providers: [provider] });
    await expect(f.commands.call("verify_image_output", { providerId: provider.id, outputFormat: "svg" })).rejects.toThrow();
    expect(f.mocks.testProvider).not.toHaveBeenCalled();
    f.mocks.testProvider.mockResolvedValue({ ok: true, outputVerification: { status: "passed" } });
    expect(await f.commands.call("verify_image_output", { providerId: provider.id, outputFormat: "svg", acknowledgeCharges: true })).toMatchObject({ ok: true });
    expect(f.mocks.testProvider).toHaveBeenCalledWith(provider, undefined, { mode: "generation", outputFormat: "svg", acknowledgeCharges: true });
  });
});
