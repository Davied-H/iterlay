import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig, ProviderGenerateInput } from "../shared/types.js";
import { FalImageProvider } from "../electron/providers/fal.js";

const falConfig: ProviderConfig = {
  id: "fal",
  name: "fal.ai",
  type: "fal",
  baseUrl: "https://queue.fal.run",
  generationEndpoint: "",
  model: "fal-ai/nano-banana-pro",
  referenceModel: "fal-ai/nano-banana-pro/edit",
  falSizeMode: "aspect_ratio_and_resolution",
  falReferenceInput: "image_urls",
  supportsReferenceImages: true
};

const generateInput: ProviderGenerateInput = {
  workflowMode: "generate",
  prompt: "一张现代产品海报",
  model: falConfig.model,
  size: "1536x1024",
  n: 2,
  referenceImages: []
};

describe("FalImageProvider", () => {
  it("loads active fal models by category and caches identical searches", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        models: [
          {
            endpoint_id: "fal-ai/flux/schnell",
            metadata: {
              display_name: "FLUX.1 [schnell]",
              category: "text-to-image",
              description: "Fast text to image",
              tags: ["fast"]
            }
          },
          {
            endpoint_id: "fal-ai/flux/schnell",
            metadata: { display_name: "duplicate", category: "text-to-image" }
          },
          {
            endpoint_id: "fal-ai/flux/dev/image-to-image",
            metadata: { display_name: "wrong category", category: "image-to-image" }
          }
        ],
        has_more: false
      }))
    );
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    const first = await provider.listModels("text-to-image", " flux ");
    const second = await provider.listModels("text-to-image", "FLUX");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe("https://api.fal.ai/v1/models");
    expect(Object.fromEntries(requestedUrl.searchParams)).toMatchObject({
      category: "text-to-image",
      status: "active",
      limit: "50",
      q: "flux"
    });
    expect(first).toEqual([
      {
        endpointId: "fal-ai/flux/schnell",
        displayName: "FLUX.1 [schnell]",
        category: "text-to-image",
        description: "Fast text to image",
        tags: ["fast"]
      }
    ]);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("rejects malformed fal model-directory responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    await expect(provider.listModels("image-to-image")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "fal.ai 模型目录返回格式无效。"
    });
  });

  it("loads video model categories and skips unknown directory categories", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        models: [
          {
            endpoint_id: "fal-ai/wan/text-to-video",
            metadata: { display_name: "Wan Text Video", category: "text-to-video" }
          },
          {
            endpoint_id: "fal-ai/wan/image-to-video",
            metadata: { display_name: "Wan Image Video", category: "image-to-video" }
          },
          {
            endpoint_id: "fal-ai/unknown",
            metadata: { display_name: "Unknown", category: "audio-to-video" }
          },
          {
            endpoint_id: "fal-ai/missing-category",
            metadata: { display_name: "Missing category" }
          }
        ]
      }))
    );
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    const textModels = await provider.listModels("text-to-video");
    const imageModels = await provider.listModels("image-to-video");

    expect(textModels).toEqual([{
      endpointId: "fal-ai/wan/text-to-video",
      displayName: "Wan Text Video",
      category: "text-to-video",
      description: undefined,
      tags: undefined
    }]);
    expect(imageModels).toEqual([{
      endpointId: "fal-ai/wan/image-to-video",
      displayName: "Wan Image Video",
      category: "image-to-video",
      description: undefined,
      tags: undefined
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("category")).toBe("text-to-video");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("category")).toBe("image-to-video");
  });

  it("attaches account-specific fal pricing and caches it by API key", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requested = new URL(String(url));
      if (requested.pathname.endsWith("/models/pricing")) {
        expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Key fal-key" }));
        return jsonResponse({
          prices: [
            { endpoint_id: "fal-ai/nano-banana-2", unit_price: 0.039, unit: "image", currency: "usd" }
          ],
          next_cursor: null,
          has_more: false
        });
      }
      return jsonResponse({
        models: [
          {
            endpoint_id: "fal-ai/nano-banana-2",
            metadata: { display_name: "Nano Banana 2", category: "text-to-image", tags: [] }
          }
        ],
        has_more: false
      });
    });
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    const first = await provider.listModels("text-to-image", "banana", "fal-key");
    const second = await provider.listModels("text-to-image", "BANANA", "fal-key");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pricingUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(pricingUrl.searchParams.getAll("endpoint_id")).toEqual(["fal-ai/nano-banana-2"]);
    expect(first[0].price).toEqual({ unitPrice: 0.039, unit: "image", currency: "USD" });
    expect(second).toEqual(first);
  });

  it("submits, polls, retrieves and downloads a fal queue result", async () => {
    let statusCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      void _init;
      const value = String(url);
      if (value === "https://queue.fal.run/fal-ai/nano-banana-pro") {
        return jsonResponse({
          request_id: "request-1",
          status_url: "https://queue.fal.run/status/request-1",
          response_url: "https://queue.fal.run/result/request-1"
        });
      }
      if (value.endsWith("/status/request-1")) {
        statusCount += 1;
        return jsonResponse({ status: statusCount === 1 ? "IN_QUEUE" : "COMPLETED" });
      }
      if (value.endsWith("/result/request-1")) {
        return jsonResponse({
          images: [
            { url: "https://fal.media/one.png", content_type: "image/png" },
            { url: "https://fal.media/two.png", content_type: "image/png" }
          ]
        });
      }
      if (value === "https://fal.media/one.png") return new Response("image-one", { headers: { "content-type": "image/png" } });
      if (value === "https://fal.media/two.png") return new Response("image-two", { headers: { "content-type": "image/png" } });
      throw new Error(`unexpected URL ${value}`);
    });
    const provider = new FalImageProvider(fetchMock as typeof fetch, 5000, 0);

    const result = await provider.generate(generateInput, falConfig, "key-id:key-secret");

    const submit = fetchMock.mock.calls[0];
    expect(String(submit[0])).toBe("https://queue.fal.run/fal-ai/nano-banana-pro");
    expect(submit[1]).toEqual(expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Key key-id:key-secret" })
    }));
    expect(JSON.parse(String(submit[1]?.body))).toMatchObject({
      prompt: generateInput.prompt,
      num_images: 2,
      output_format: "png",
      aspect_ratio: "3:2",
      resolution: "2K"
    });
    expect(statusCount).toBe(2);
    expect(result.images.map((image) => image.bytes.toString())).toEqual(["image-one", "image-two"]);
  });

  it("uses the edit model and sends reference images as data URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        images: [{ url: "data:image/png;base64,aW1hZ2U=" }]
      })
    );
    const provider = new FalImageProvider(fetchMock as typeof fetch, 5000, 0);

    const result = await provider.generate(
      {
        ...generateInput,
        workflowMode: "edit",
        size: "1024x1024",
        n: 1,
        referenceImages: [
          { name: "one.png", mimeType: "image/png", bytes: Buffer.from("reference-one") },
          { name: "two.jpg", mimeType: "image/jpeg", bytes: Buffer.from("reference-two") }
        ]
      },
      falConfig,
      "fal-key"
    );

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://queue.fal.run/fal-ai/nano-banana-pro/edit");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.image_urls).toEqual([
      `data:image/png;base64,${Buffer.from("reference-one").toString("base64")}`,
      `data:image/jpeg;base64,${Buffer.from("reference-two").toString("base64")}`
    ]);
    expect(body).not.toHaveProperty("image_url");
    expect(body.aspect_ratio).toBe("1:1");
    expect(result.images[0].bytes.toString()).toBe("image");
  });

  it("supports single-image fal models and warns when extra references are ignored", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ images: [{ url: "data:image/png;base64,b2s=" }] })
    );
    const provider = new FalImageProvider(fetchMock as typeof fetch, 5000, 0);
    const config: ProviderConfig = {
      ...falConfig,
      referenceModel: "fal-ai/flux-pro/kontext",
      falReferenceInput: "image_url",
      falSizeMode: "aspect_ratio"
    };

    const result = await provider.generate(
      {
        ...generateInput,
        workflowMode: "edit",
        n: 1,
        referenceImages: [
          { name: "one.png", mimeType: "image/png", bytes: Buffer.from("one") },
          { name: "two.png", mimeType: "image/png", bytes: Buffer.from("two") }
        ]
      },
      config,
      "fal-key"
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.image_url).toBe(`data:image/png;base64,${Buffer.from("one").toString("base64")}`);
    expect(body).not.toHaveProperty("image_urls");
    expect(result.warnings?.[0]).toContain("仅发送了第一张参考图");
  });

  it("does not claim a nonexistent queue request verified credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    await expect(provider.testConnection(falConfig, "fal-key")).rejects.toMatchObject({ status: 404 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/requests/iterlay-connection-test/status");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Key fal-key" })
    }));
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("surfaces fal authentication errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: "Invalid credentials" }, 401));
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    await expect(provider.testConnection(falConfig, "bad-key")).rejects.toMatchObject({
      code: "AUTH_ERROR",
      message: "fal.ai API Key 无效或无权访问，请检查后重试。",
      status: 401
    });
  });

  it("translates exhausted-balance responses into an actionable message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "User is locked. Reason: Exhausted balance. Top up your balance." }, 403)
    );
    const provider = new FalImageProvider(fetchMock as typeof fetch);

    await expect(provider.generate(generateInput, falConfig, "fal-key")).rejects.toMatchObject({
      code: "AUTH_ERROR",
      message: "fal.ai 账户余额不足，请前往 https://fal.ai/dashboard/billing 充值后重试。"
    });
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
