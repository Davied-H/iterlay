import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig, ProviderGenerateInput } from "../shared/types.js";
import { BailianImageProvider } from "../electron/providers/bailian.js";

const config: ProviderConfig = {
  id: "bailian",
  name: "阿里云百炼",
  type: "bailian",
  baseUrl: "https://dashscope.aliyuncs.com",
  generationEndpoint: "/api/v1/services/aigc/multimodal-generation/generation",
  model: "qwen-image-2.0-pro",
  supportsReferenceImages: true
};

const input: ProviderGenerateInput = {
  workflowMode: "generate",
  prompt: "一张中文品牌海报",
  model: config.model,
  size: "1536x1024",
  n: 2,
  referenceImages: []
};

describe("BailianImageProvider", () => {
  it("generates through the synchronous multimodal endpoint and downloads results", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      void _init;
      if (String(url).includes("multimodal-generation")) {
        return jsonResponse({
          output: {
            choices: [{ message: { content: [{ image: "https://dashscope-result/one.png" }, { image: "https://dashscope-result/two.png" }] } }]
          }
        });
      }
      return new Response(String(url).endsWith("one.png") ? "image-one" : "image-two", {
        headers: { "content-type": "image/png" }
      });
    });
    const provider = new BailianImageProvider(fetchMock as typeof fetch);

    const result = await provider.generate(input, config, "sk-bailian");

    const request = fetchMock.mock.calls[0];
    expect(String(request[0])).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    );
    const body = JSON.parse(String(request[1]?.body));
    expect(body).toMatchObject({
      model: "qwen-image-2.0-pro",
      input: { messages: [{ role: "user", content: [{ text: input.prompt }] }] },
      parameters: { size: "1536*1024", n: 2, watermark: false, prompt_extend: true }
    });
    expect(result.images.map((image) => image.bytes.toString())).toEqual(["image-one", "image-two"]);
  });

  it("sends reference images before the edit instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output: { choices: [{ message: { content: [{ image: "data:image/png;base64,ZWRpdGVk" }] } }] } })
    );
    const provider = new BailianImageProvider(fetchMock as typeof fetch);

    const result = await provider.generate(
      {
        ...input,
        workflowMode: "edit",
        n: 1,
        referenceImages: [
          { name: "one.png", mimeType: "image/png", bytes: Buffer.from("one") },
          { name: "two.jpg", mimeType: "image/jpeg", bytes: Buffer.from("two") }
        ]
      },
      config,
      "sk-bailian"
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.input.messages[0].content).toEqual([
      { image: `data:image/png;base64,${Buffer.from("one").toString("base64")}` },
      { image: `data:image/jpeg;base64,${Buffer.from("two").toString("base64")}` },
      { text: input.prompt }
    ]);
    expect(result.images[0].bytes.toString()).toBe("edited");
  });

  it("supports Qwen Image 3.0 generation and editing through the same endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output: { choices: [{ message: { content: [{ image: "data:image/png;base64,dGhyZWU=" }] } }] } })
    );
    const provider = new BailianImageProvider(fetchMock as typeof fetch);

    await provider.generate(
      {
        ...input,
        workflowMode: "edit",
        model: "qwen-image-3.0-pro",
        size: "2048x1024",
        n: 6,
        referenceImages: [
          { name: "one.png", mimeType: "image/png", bytes: Buffer.from("one") },
          { name: "two.png", mimeType: "image/png", bytes: Buffer.from("two") },
          { name: "three.png", mimeType: "image/png", bytes: Buffer.from("three") }
        ]
      },
      { ...config, model: "qwen-image-3.0-pro" },
      "sk-bailian"
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: "qwen-image-3.0-pro",
      parameters: { size: "2048*1024", n: 6, watermark: false, prompt_extend: true }
    });
    expect(body.input.messages[0].content).toHaveLength(4);
  });

  it("rejects more than three reference images for Qwen Image 3.0", async () => {
    const provider = new BailianImageProvider(vi.fn() as unknown as typeof fetch);

    await expect(provider.generate(
      {
        ...input,
        workflowMode: "edit",
        model: "qwen-image-3.0-pro",
        referenceImages: Array.from({ length: 4 }, (_, index) => ({
          name: `${index}.png`,
          mimeType: "image/png",
          bytes: Buffer.from(String(index))
        }))
      },
      { ...config, model: "qwen-image-3.0-pro" },
      "sk-bailian"
    )).rejects.toMatchObject({ code: "TOO_MANY_REFERENCES" });
  });

  it("tests credentials through the compatible models endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const provider = new BailianImageProvider(fetchMock as typeof fetch);

    await provider.testConnection(config, "sk-bailian");

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/models");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: { Authorization: "Bearer sk-bailian" }
    }));
  });

  it("translates invalid API keys into an actionable error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: "InvalidApiKey", message: "Invalid API-key provided." }, 401));
    const provider = new BailianImageProvider(fetchMock as typeof fetch);

    await expect(provider.testConnection(config, "bad-key")).rejects.toMatchObject({
      code: "AUTH_ERROR",
      message: "百炼 API Key 无效、地域不匹配或无模型权限，请检查配置。"
    });
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
