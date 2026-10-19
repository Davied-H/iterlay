import { describe, expect, it, vi } from "vitest";
import { checkImageGeneration, checkProviderConnection, localCredentialCheck } from "../electron/providers/diagnostics";
import type { ProviderConfig } from "../shared/types";

const config: ProviderConfig = {
  id: "image", name: "Test", type: "openai-compatible", baseUrl: "https://example.test/v1",
  generationEndpoint: "/images/generations", model: "image-model", supportsReferenceImages: true
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2mcAAAAASUVORK5CYII=", "base64");
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("provider diagnostic evidence and usage boundaries", () => {
  it.each(["/images/generations", "/responses"])("never submits generation to %s during a normal check", async (generationEndpoint) => {
    const fetcher = vi.fn().mockResolvedValue(json({ data: [{ id: "image-model" }] }));
    const result = await checkProviderConnection({ ...config, generationEndpoint }, "test-key", "image", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://example.test/v1/models", expect.objectContaining({ method: "GET" }));
    expect(result).toMatchObject({ ok: true, checks: {
      authentication: { status: "passed" }, model: { status: "passed" },
      capability: { status: "not-tested" }, generation: { status: "not-tested" }
    }, billing: { generationSubmitted: false, mayHaveIncurredCharge: false } });
  });
  it.each([400, 401, 403, 404, 422, 500])("does not equate HTTP %d with a successful check", async (status) => {
    const result = await checkProviderConnection(config, "key", "image", vi.fn().mockResolvedValue(json({ error: "no" }, status)));
    expect(result.ok).toBe(false);
    expect(result.checks?.network.status).toBe("passed");
    expect(result.checks?.authentication.status).toBe(status === 401 || status === 403 ? "failed" : "unknown");
    expect(result.billing?.generationSubmitted).toBe(false);
  });
  it("rejects a successful HTML login page or a malformed model catalog as evidence", async () => {
    for (const response of [new Response("<html>sign in</html>"), json({ success: true })]) {
      const result = await checkProviderConnection(config, "key", "image", vi.fn().mockResolvedValue(response));
      expect(result.ok).toBe(false);
      expect(result.checks?.authentication.status).not.toBe("passed");
    }
  });
  it("keeps an unlisted model and an absent task's authentication unknown", async () => {
    const missing = await checkProviderConnection(config, "key", "image", vi.fn().mockResolvedValue(json({ data: [] })));
    expect(missing.checks?.model.status).toBe("unknown");
    const fal = await checkProviderConnection({ ...config, type: "fal" }, "key", "image", vi.fn().mockResolvedValue(json({ detail: "not found" }, 404)));
    expect(fal.ok).toBe(false);
    expect(fal.checks?.authentication.status).toBe("unknown");
  });
  it("does not claim a local OAuth credential verified the server or model", () => {
    const result = localCredentialCheck();
    expect(result.checks?.network.status).toBe("not-tested");
    expect(result.checks?.authentication.status).toBe("unknown");
    expect(result.checks?.capability.status).toBe("not-tested");
  });
  it("does not send any active test without explicit charge acknowledgment", async () => {
    const generate = vi.fn();
    const result = await checkImageGeneration(config, false, generate);
    expect(generate).not.toHaveBeenCalled();
    expect(result.billing?.generationSubmitted).toBe(false);
  });
  it("submits exactly one image after acknowledgment, provides a preview and limits the verified capability", async () => {
    const generate = vi.fn().mockResolvedValue({ images: [{ bytes: png, mimeType: "image/png" }] });
    const result = await checkImageGeneration(config, true, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ n: 1, workflowMode: "generate", referenceImages: [] }));
    expect(result).toMatchObject({ ok: true, mode: "generation", checks: { capability: { status: "passed" } }, billing: { mayHaveIncurredCharge: true } });
    expect(result.previewDataUrl).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(result.message).toContain("参考图、编辑和工具调用尚未验证");
  });
  it("does not retry a timed-out paid request or imply no charge", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await checkImageGeneration(config, true, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.checks?.generation.status).toBe("unknown");
    expect(result.billing?.mayHaveIncurredCharge).toBe(true);
    expect(result.message).toContain("未自动重试");
  });
  it("does not validate capability when image bytes are actually an error response", async () => {
    const result = await checkImageGeneration(config, true, vi.fn().mockResolvedValue({ images: [{ bytes: Buffer.from("error"), mimeType: "image/png" }] }));
    expect(result.ok).toBe(false);
    expect(result.previewDataUrl).toBeUndefined();
  });
});
