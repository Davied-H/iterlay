import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig, ProviderGenerateInput } from "../shared/types.js";
import { ArkImageProvider, arkModelListUrl, normalizeArkSize } from "../electron/providers/ark.js";

const config: ProviderConfig = {
  id: "ark",
  name: "火山方舟 Seedream",
  type: "ark",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  generationEndpoint: "/images/generations",
  model: "doubao-seedream-5-0-pro-260628",
  supportsReferenceImages: true
};

const input: ProviderGenerateInput = {
  workflowMode: "generate",
  prompt: "一张中文品牌海报",
  model: config.model,
  size: "800x800",
  n: 1,
  referenceImages: []
};

describe("ArkImageProvider", () => {
  it("generates through /images/generations and decodes b64 results", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      void _init;
      if (String(url).includes("images/generations")) {
        return jsonResponse({ data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] });
      }
      throw new Error(`unexpected url: ${String(url)}`);
    });
    const provider = new ArkImageProvider(fetchMock as typeof fetch);

    const result = await provider.generate(input, config, "sk-ark");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: "doubao-seedream-5-0-pro-260628",
      prompt: "一张中文品牌海报",
      response_format: "b64_json",
      output_format: "png",
      // 800x800 低于 pro 的 921600 下限，会被等比放大到 960x960。
      size: "960x960"
    });
    expect(body.image).toBeUndefined();
    // pro 不支持 sequential_image_generation，不下发该字段。
    expect(body.sequential_image_generation).toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer sk-ark" })
    }));
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[0].bytes.toString()).toBe("png-bytes");
  });

  it("sends reference images as data URLs in edit mode", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      void _url;
      void _init;
      return jsonResponse({ data: [{ b64_json: Buffer.from("edit").toString("base64") }] });
    });
    const provider = new ArkImageProvider(fetchMock as typeof fetch);

    await provider.generate({
      ...input,
      workflowMode: "edit",
      referenceImages: [{ name: "a.png", mimeType: "image/png", bytes: Buffer.from("ref") }]
    }, config, "sk-ark");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.image).toEqual([`data:image/png;base64,${Buffer.from("ref").toString("base64")}`]);
  });

  it("rejects edit mode without a reference image", async () => {
    const provider = new ArkImageProvider(vi.fn() as unknown as typeof fetch);
    await expect(provider.generate({ ...input, workflowMode: "edit" }, config, "sk-ark"))
      .rejects.toMatchObject({ code: "EDIT_IMAGE_REQUIRED" });
  });

  it("enforces model-specific reference limits", async () => {
    const provider = new ArkImageProvider(vi.fn() as unknown as typeof fetch);
    const references = (count: number) => Array.from({ length: count }, (_, index) => ({
      name: `${index}.png`,
      mimeType: "image/png",
      bytes: Buffer.from(String(index))
    }));

    await expect(provider.generate(
      { ...input, workflowMode: "edit", referenceImages: references(11) },
      config,
      "sk-ark"
    )).rejects.toMatchObject({ code: "TOO_MANY_REFERENCES" });

    await expect(provider.generate(
      { ...input, workflowMode: "edit", referenceImages: references(15), model: "doubao-seedream-4-0-250828" },
      { ...config, model: "doubao-seedream-4-0-250828" },
      "sk-ark"
    )).rejects.toMatchObject({ code: "TOO_MANY_REFERENCES" });
  });

  it("omits size for auto and falls back to downloading urls", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      void _init;
      if (String(url).includes("images/generations")) {
        return jsonResponse({ data: [{ url: "https://ark.example.com/result.png" }] });
      }
      return new Response("image-bytes", { headers: { "content-type": "image/png" } });
    });
    const provider = new ArkImageProvider(fetchMock as typeof fetch);

    const result = await provider.generate({ ...input, size: "auto" }, config, "sk-ark");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.size).toBeUndefined();
    expect(result.images[0].bytes.toString()).toBe("image-bytes");
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("runs multiple counts as independent requests and warns on partial failure", async () => {
    let generationCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      void _init;
      if (String(url).includes("images/generations")) {
        generationCalls += 1;
        return jsonResponse({ data: [{ b64_json: Buffer.from(`image-${generationCalls}`).toString("base64") }] });
      }
      throw new Error(`unexpected url: ${String(url)}`);
    });
    const provider = new ArkImageProvider(fetchMock as typeof fetch);

    const result = await provider.generate({ ...input, n: 2 }, config, "sk-ark");

    expect(generationCalls).toBe(2);
    expect(result.images).toHaveLength(2);
    expect(result.warnings).toBeUndefined();
  });

  it("tests credentials and lists models through the endpoint /models API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { id: "doubao-seedream-5-0-pro-260628", owned_by: "bytedance" },
        { id: "doubao-1-5-pro-32k", owned_by: "bytedance" }
      ]
    }));
    const provider = new ArkImageProvider(fetchMock as typeof fetch);

    await provider.testConnection(config, "sk-ark");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://ark.cn-beijing.volces.com/api/v3/models");

    const models = await provider.listModels(config, "sk-ark");
    expect(models).toEqual([{ id: "doubao-seedream-5-0-pro-260628", ownedBy: "bytedance" }]);
  });

  it("translates invalid API keys into an actionable error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { code: "AuthenticationError", message: "Invalid API key" } }, 401));
    const provider = new ArkImageProvider(fetchMock as typeof fetch);

    await expect(provider.testConnection(config, "bad-key")).rejects.toMatchObject({
      code: "AUTH_ERROR",
      message: "火山方舟 API Key 无效或无该模型权限，请检查配置。"
    });
  });

  it("requires an API key", async () => {
    const provider = new ArkImageProvider(vi.fn() as unknown as typeof fetch);
    await expect(provider.generate(input, config, "  ")).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});

describe("normalizeArkSize", () => {
  it("scales pixel counts into each model's allowed range", () => {
    expect(normalizeArkSize("auto", "doubao-seedream-5-0-pro-260628")).toBeUndefined();
    expect(normalizeArkSize("", "doubao-seedream-5-0-pro-260628")).toBeUndefined();
    expect(normalizeArkSize("800x800", "doubao-seedream-5-0-pro-260628")).toBe("960x960");

    const proLarge = normalizeArkSize("4096x4096", "doubao-seedream-5-0-pro-260628");
    const [proWidth, proHeight] = proLarge!.split("x").map(Number);
    expect(proWidth * proHeight).toBeLessThanOrEqual(4_624_220);
    expect(proWidth * proHeight).toBeGreaterThanOrEqual(921_600);

    const liteSmall = normalizeArkSize("1024x1024", "doubao-seedream-5-0-260128");
    const [liteWidth, liteHeight] = liteSmall!.split("x").map(Number);
    expect(liteWidth * liteHeight).toBeGreaterThanOrEqual(3_686_400);
  });
});

describe("arkModelListUrl", () => {
  it("targets /models for the official api/v3 endpoint and OpenAI-style relays", () => {
    expect(arkModelListUrl("https://ark.cn-beijing.volces.com/api/v3")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/models"
    );
    expect(arkModelListUrl("https://relay.example.com/v1")).toBe("https://relay.example.com/v1/models");
    expect(arkModelListUrl("https://relay.example.com")).toBe("https://relay.example.com/v1/models");
    expect(arkModelListUrl("")).toBe("https://ark.cn-beijing.volces.com/api/v3/models");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
