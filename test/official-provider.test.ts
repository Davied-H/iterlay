import { describe, expect, it, vi } from "vitest";
import { OfficialImageProvider } from "../electron/providers/official.js";
import {
  collaborateSceneStreamWith,
  enhancePromptWith,
  OfficialTextTransport,
  suggestImageEditsWith
} from "../electron/providers/text-assistant.js";
import type { LicenseService } from "../electron/licensing/service.js";
import { OFFICIAL_PROVIDER_CONFIG } from "../shared/types.js";

function fakeLicense() {
  return {
    markCredentialRejected: vi.fn(),
    createSignedRequest: vi.fn(async (purpose: string, payload: string) => ({
      grant: "grant",
      nonce: "nonce-with-enough-length",
      proof: "proof",
      appVersion: "1.0.0",
      purpose,
      bodyHash: `hash:${payload}`
    }))
  } as unknown as LicenseService;
}

describe("OfficialImageProvider", () => {
  it("allows recovery status checks to use a short caller timeout", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      })
    ));
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      fetcher as typeof fetch
    );

    await expect(provider.getGenerationStatus("legacy-job", AbortSignal.timeout(5))).rejects.toMatchObject({
      code: "REQUEST_CANCELLED"
    });
  });

  it("submits a signed job then polls its durable result", async () => {
    const license = fakeLicense();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { auth: { purpose: string; bodyHash: string }; payload: Record<string, unknown> };
      expect(body.auth.bodyHash).toBe(`hash:${JSON.stringify(body.payload)}`);
      if (body.auth.purpose === "official.images.generate") {
        expect(body.payload).toMatchObject({ operation: "edit", size: "1024x1024", n: 1 });
        expect(body.payload).not.toHaveProperty("background");
        expect(body.payload).not.toHaveProperty("outputFormat");
        expect(new Headers(init?.headers).get("X-Iterlay-Async-Generation")).toBe("1");
        return new Response(JSON.stringify({ job: { id: "remote-job-1", status: "running" } }), {
          status: 202, headers: { "Content-Type": "application/json" }
        });
      }
      expect(body.auth.purpose).toBe("official.images.status");
      expect(body.payload).toEqual({ jobId: "remote-job-1" });
      expect(new Headers(init?.headers).get("X-Iterlay-Async-Generation")).toBeNull();
      return new Response(JSON.stringify({
        job: { id: "remote-job-1", status: "succeeded", images: [{ mimeType: "image/png", dataBase64: Buffer.from("image").toString("base64") }] }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OfficialImageProvider(license, "https://manage.example.com/api/v1/", fetcher as typeof fetch);

    const result = await provider.generate({
      workflowMode: "edit",
      prompt: "replace the background",
      model: "ignored-client-model",
      size: "1024x1024",
      n: 1,
      referenceImages: [{ name: "source.png", mimeType: "image/png", bytes: Buffer.from("source") }]
    }, OFFICIAL_PROVIDER_CONFIG, "");

    expect(result.images[0].bytes.toString()).toBe("image");
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/official/images/generate",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/official/images/status",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("normalizes transparent output for the opaque-only official backend", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { auth: { purpose: string }; payload: Record<string, unknown> };
      if (body.auth.purpose !== "official.images.generate") throw new Error("unexpected status request");
      expect(body.payload).not.toHaveProperty("background");
      return new Response(JSON.stringify({
        job: {
          id: "remote-job-transparent",
          status: "succeeded",
          images: [{ mimeType: "image/png", dataBase64: Buffer.from("image").toString("base64") }]
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OfficialImageProvider(fakeLicense(), "https://manage.example.com/api/v1", fetcher as typeof fetch);

    await expect(provider.generate({
      workflowMode: "generate",
      prompt: "logo",
      model: "official",
      size: "1024x1024",
      n: 1,
      background: "transparent",
      outputFormat: "png",
      referenceImages: []
    }, OFFICIAL_PROVIDER_CONFIG, "")).resolves.toMatchObject({
      images: [{ bytes: Buffer.from("image") }]
    });
  });

  it("maps insufficient credit responses to a user-facing provider error", async () => {
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => new Response(JSON.stringify({ code: "insufficient_credits" }), {
        status: 402,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
    );

    await expect(provider.generate({
      workflowMode: "generate",
      prompt: "poster",
      model: "ignored",
      size: "1024x1024",
      n: 1,
      referenceImages: []
    }, OFFICIAL_PROVIDER_CONFIG, "")).rejects.toMatchObject({
      code: "insufficient_credits",
      status: 402
    });
  });

  it("propagates rejected device credentials back to the license state", async () => {
    const license = fakeLicense();
    const provider = new OfficialImageProvider(
      license,
      "https://manage.example.com/api/v1",
      vi.fn(async () => new Response(JSON.stringify({ code: "invalid_credential" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
    );

    await expect(provider.getCreditStatus()).rejects.toMatchObject({ code: "invalid_credential" });
    expect(license.markCredentialRejected).toHaveBeenCalledWith("设备凭证已失效，请重新检查授权状态。");
  });

  it("rejects image counts above the official provider limit before sending a request", async () => {
    const fetcher = vi.fn();
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      fetcher as typeof fetch
    );

    await expect(provider.generate({
      workflowMode: "generate",
      prompt: "poster",
      model: "ignored",
      size: "1024x1024",
      n: 5,
      referenceImages: []
    }, OFFICIAL_PROVIDER_CONFIG, "")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: "官方 Provider 单次生成数量必须为 1–4 张。"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enhances prompts via the signed text endpoint", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        auth: { purpose: string; bodyHash: string };
        payload: { clientRequestId: string; messages: Array<{ role: string }>; temperature?: number };
      };
      expect(body.auth.purpose).toBe("official.text.generate");
      expect(body.auth.bodyHash).toBe(`hash:${JSON.stringify(body.payload)}`);
      expect(body.payload.clientRequestId.length).toBeGreaterThanOrEqual(8);
      expect(body.payload.messages[0].role).toBe("system");
      expect(body.payload.temperature).toBe(0.7);
      return new Response(JSON.stringify({
        content: "  扩写后的提示词  ",
        model: "text-model",
        credits: {
          walletId: "wallet",
          balance: 99,
          lifetimeGranted: 100,
          lifetimeSpent: 1,
          unitCost: 10,
          status: "active",
          updatedAt: "2026-07-17T00:00:00.000Z"
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OfficialImageProvider(fakeLicense(), "https://manage.example.com/api/v1", fetcher as typeof fetch);

    const prompt = await enhancePromptWith(new OfficialTextTransport(provider), {
      prompt: "一只猫",
      workflowMode: "generate"
    });

    expect(prompt).toBe("扩写后的提示词");
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/official/text/generate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("streams the collaborate result as a single delta", async () => {
    const sceneJson = JSON.stringify({
      message: "帮你完善了场景",
      fields: [{ label: "主体", value: "白色陶瓷杯" }]
    });
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => new Response(JSON.stringify({ content: sceneJson }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
    );

    const deltas: string[] = [];
    const result = await collaborateSceneStreamWith(
      new OfficialTextTransport(provider),
      {
        instruction: "帮我完善场景",
        referenceImages: [],
        currentFields: [],
        workflowMode: "generate"
      },
      (delta) => deltas.push(delta)
    );

    expect(deltas).toEqual(["帮你完善了场景"]);
    expect(result.message).toBe("帮你完善了场景");
    expect(result.fields).toEqual([{ label: "主体", value: "白色陶瓷杯" }]);
  });

  it("parses edit suggestions from the text endpoint", async () => {
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { payload: { maxTokens?: number } };
        expect(body.payload.maxTokens).toBe(512);
        return new Response(JSON.stringify({
          content: '{"suggestions":["移除背景路人","增强主体光线","裁剪为方图"]}'
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch
    );

    const suggestions = await suggestImageEditsWith(new OfficialTextTransport(provider), "data:image/png;base64,QUJD");
    expect(suggestions).toEqual(["移除背景路人", "增强主体光线", "裁剪为方图"]);
  });

  it("maps text assistant unavailability to a user-facing provider error", async () => {
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => new Response(JSON.stringify({ code: "official_text_unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
    );

    await expect(
      enhancePromptWith(new OfficialTextTransport(provider), { prompt: "一只猫", workflowMode: "generate" })
    ).rejects.toMatchObject({
      code: "official_text_unavailable",
      message: "官方文本助手暂时不可用，请稍后重试或切换自定义 Provider。",
      status: 503
    });
  });

  it("maps gateway payload limits to an actionable message", async () => {
    const provider = new OfficialImageProvider(
      fakeLicense(),
      "https://manage.example.com/api/v1",
      vi.fn(async () => new Response("<html>request entity too large</html>", {
        status: 413,
        headers: { "Content-Type": "text/html" }
      })) as typeof fetch
    );

    await expect(provider.generate({
      workflowMode: "edit",
      prompt: "replace the background",
      model: "ignored",
      size: "1024x1024",
      n: 1,
      referenceImages: [{ name: "source.png", mimeType: "image/png", bytes: Buffer.from("source") }]
    }, OFFICIAL_PROVIDER_CONFIG, "")).rejects.toMatchObject({
      code: "HTTP_413",
      message: "参考图分辨率或文件大小超过官方 Provider 限制，请缩小尺寸或切分图片后重试。",
      status: 413
    });
  });
});
