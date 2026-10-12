import { describe, expect, it, vi } from "vitest";
import type { CodexOAuthService } from "../electron/auth/codex-oauth.js";
import {
  buildCodexImageRequest,
  buildCodexTextRequest,
  CodexOAuthImageProvider,
  CodexOAuthTextTransport,
  parseCodexModels
} from "../electron/providers/codex-oauth.js";
import type { ProviderConfig, ProviderGenerateInput } from "../shared/types.js";

const config: ProviderConfig = {
  id: "codex-personal",
  name: "我的 Codex",
  type: "codex-oauth",
  apiMode: "responses",
  baseUrl: "",
  generationEndpoint: "",
  model: "gpt-image-2",
  supportsReferenceImages: true
};

const input: ProviderGenerateInput = {
  workflowMode: "edit",
  prompt: "保留主体，改成夜景",
  model: "gpt-image-2",
  size: "1536x1024",
  n: 2,
  quality: "high",
  style: "natural",
  background: "transparent",
  outputFormat: "png",
  referenceImages: [{ name: "source.png", mimeType: "image/png", bytes: Buffer.from("source") }]
};

describe("Codex OAuth image provider", () => {
  it("builds the Codex Responses image tool request", () => {
    expect(buildCodexImageRequest(input, config)).toMatchObject({
      model: "gpt-5.4-mini",
      stream: true,
      store: false,
      tool_choice: { type: "image_generation" },
      tools: [{
        type: "image_generation",
        action: "edit",
        model: "gpt-image-2",
        size: "1536x1024",
        background: "transparent",
        output_format: "png"
      }]
    });
    const body = buildCodexImageRequest(input, config) as {
      input: Array<{ content: Array<Record<string, unknown>> }>;
      tools: Array<Record<string, unknown>>;
    };
    expect(body.tools[0]).not.toHaveProperty("n");
    expect(body.tools[0]).not.toHaveProperty("style");
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: `data:image/png;base64,${Buffer.from("source").toString("base64")}`
    });
  });

  it("sends paired Codex identity headers and parses the completed SSE image", async () => {
    const getAccess = vi.fn().mockResolvedValue({ accessToken: "oauth-access", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    const image = Buffer.from("codex-image").toString("base64");
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      `data: ${JSON.stringify({
        type: "response.completed",
        response: { output: [{ type: "image_generation_call", result: image }] }
      })}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } }
    ));
    const provider = new CodexOAuthImageProvider(auth, fetchMock as typeof fetch);

    const result = await provider.generate({ ...input, n: 1 }, config);

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://chatgpt.com/backend-api/codex/responses");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = request.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer oauth-access");
    expect(headers["chatgpt-account-id"]).toBe("account-123");
    expect(headers.originator).toBe("codex_cli_rs");
    expect(headers["User-Agent"]).toMatch(/^codex_cli_rs\/0\.144\.1 /);
    expect(result.images[0].bytes.toString()).toBe("codex-image");
  });

  it("fans out multi-image requests without sending the unsupported n tool parameter", async () => {
    const getAccess = vi.fn().mockResolvedValue({ accessToken: "oauth-access", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    let imageIndex = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<Record<string, unknown>> };
      expect(body.tools[0]).not.toHaveProperty("n");
      imageIndex += 1;
      return new Response(
        `data: ${JSON.stringify({
          type: "response.completed",
          response: { output: [{ type: "image_generation_call", result: Buffer.from(`image-${imageIndex}`).toString("base64") }] }
        })}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } }
      );
    });
    const provider = new CodexOAuthImageProvider(auth, fetchMock as typeof fetch);

    const result = await provider.generate({ ...input, n: 3 }, config);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.images.map((image) => image.bytes.toString()).sort()).toEqual(["image-1", "image-2", "image-3"]);
  });

  it("keeps successful images when one of the fanned-out requests fails", async () => {
    const getAccess = vi.fn().mockResolvedValue({ accessToken: "oauth-access", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    const image = Buffer.from("partial-image").toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 500 }))
      .mockResolvedValueOnce(new Response(
        `data: ${JSON.stringify({ type: "response.completed", response: { output: [{ type: "image_generation_call", result: image }] } })}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } }
      ));
    const provider = new CodexOAuthImageProvider(auth, fetchMock as typeof fetch);

    const result = await provider.generate({ ...input, n: 2 }, config);

    expect(result.images).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("请求 2 张，其中 1 张生成失败");
  });

  it("refreshes once after an unauthorized response", async () => {
    const getAccess = vi.fn()
      .mockResolvedValueOnce({ accessToken: "old", accountId: "account-123" })
      .mockResolvedValueOnce({ accessToken: "new", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    const image = Buffer.from("retried-image").toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(
        `data: ${JSON.stringify({ type: "response.completed", response: { output: [{ type: "image_generation_call", result: image }] } })}\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } }
      ));
    const provider = new CodexOAuthImageProvider(auth, fetchMock as typeof fetch);

    await expect(provider.generate({ ...input, n: 1 }, config)).resolves.toMatchObject({ images: [{ mimeType: "image/png" }] });
    expect(getAccess).toHaveBeenNthCalledWith(2, config.id, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Codex OAuth text transport", () => {
  it("lists the visible API models available to the ChatGPT account", async () => {
    const getAccess = vi.fn().mockResolvedValue({ accessToken: "oauth-access", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { slug: "gpt-5.4-mini", display_name: "GPT-5.4 Mini", visibility: "list", supported_in_api: true, priority: 4 },
        { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list", supported_in_api: true, priority: 0 },
        { slug: "codex-auto-review", display_name: "Auto Review", visibility: "hide", supported_in_api: true, priority: 20 },
        { slug: "gpt-5.3-codex-spark", visibility: "list", supported_in_api: false, priority: 3 }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const transport = new CodexOAuthTextTransport(
      auth,
      "codex-personal",
      "gpt-5.4-mini",
      fetchMock as typeof fetch
    );

    await expect(transport.listModels()).resolves.toEqual([
      { id: "gpt-5.5", ownedBy: "Codex / ChatGPT" },
      { id: "gpt-5.4-mini", ownedBy: "GPT-5.4 Mini · Codex / ChatGPT" }
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://chatgpt.com/backend-api/codex/models?client_version=0.144.1"
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: {
        Authorization: "Bearer oauth-access",
        "chatgpt-account-id": "account-123",
        Accept: "application/json"
      }
    });
  });

  it("refreshes Codex credentials once when listing models is unauthorized", async () => {
    const getAccess = vi.fn()
      .mockResolvedValueOnce({ accessToken: "old", accountId: "account-123" })
      .mockResolvedValueOnce({ accessToken: "new", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const transport = new CodexOAuthTextTransport(auth, "codex-personal", undefined, fetchMock as typeof fetch);

    await expect(transport.listModels()).resolves.toEqual([]);
    expect(getAccess).toHaveBeenNthCalledWith(2, "codex-personal", true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed Codex model catalogs", () => {
    expect(() => parseCodexModels({ data: [] })).toThrow("Codex 未返回有效的模型目录");
  });

  it("converts chat messages and vision input to a Codex Responses request", () => {
    const request = buildCodexTextRequest([
      { role: "system", content: "只返回 JSON" },
      {
        role: "user",
        content: [
          { type: "text", text: "分析图片" },
          { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }
        ]
      }
    ], "gpt-5.4-mini", { maxTokens: 512 });

    expect(request).toMatchObject({
      instructions: "只返回 JSON",
      model: "gpt-5.4-mini",
      stream: true,
      max_output_tokens: 512,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "分析图片" },
          { type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" }
        ]
      }]
    });
  });

  it("uses the shared auth provider id and emits text deltas", async () => {
    const getAccess = vi.fn().mockResolvedValue({ accessToken: "oauth-access", accountId: "account-123" });
    const auth = { getAccess, markReauthRequired: vi.fn() } as unknown as CodexOAuthService;
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "你好" })}`,
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "，世界" })}`,
      "data: [DONE]",
      ""
    ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } }));
    const transport = new CodexOAuthTextTransport(
      auth,
      "codex-personal",
      "gpt-5.4-mini",
      fetchMock as typeof fetch
    );
    const deltas: string[] = [];

    const result = await transport.completeStream(
      [{ role: "user", content: "打招呼" }],
      {},
      (delta) => deltas.push(delta)
    );

    expect(result).toBe("你好，世界");
    expect(deltas).toEqual(["你好", "，世界"]);
    expect(getAccess).toHaveBeenCalledWith("codex-personal");
  });

  it("streams only public summaries separately, without duplicating done events or exposing encrypted reasoning", async () => {
    const auth = { getAccess: vi.fn().mockResolvedValue({ accessToken: "token", accountId: "account" }) } as unknown as CodexOAuthService;
    const events = [
      { type: "response.reasoning_summary_text.delta", item_id: "r1", summary_index: 0, delta: "先确认主体" },
      { type: "response.reasoning_summary_text.delta", item_id: "r1", summary_index: 0, delta: "与光线。" },
      { type: "response.reasoning_summary_text.done", item_id: "r1", summary_index: 0, text: "先确认主体与光线。" },
      { type: "response.reasoning_summary_text.done", item_id: "r1", summary_index: 1, text: "然后整理构图。" },
      { type: "response.reasoning_text.delta", delta: "PRIVATE" },
      { type: "response.output_item.done", item: { type: "reasoning", encrypted_content: "SECRET" } },
      { type: "response.output_text.delta", delta: "正文" }
    ];
    const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n`).join(""));
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      // Split inside UTF-8 and SSE frames to exercise incremental decoding.
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
      controller.close();
    } });
    const transport = new CodexOAuthTextTransport(auth, "codex", undefined, vi.fn().mockResolvedValue(new Response(body)) as typeof fetch);
    const summary: string[] = [], text: string[] = [];
    const result = await transport.completeStream([], { onReasoningSummary: chunk => summary.push(chunk) }, chunk => text.push(chunk));
    expect(result).toBe("正文");
    expect(text).toEqual(["正文"]);
    expect(summary.join("")).toBe("先确认主体与光线。\n\n然后整理构图。");
    expect(summary.join("")).not.toMatch(/PRIVATE|SECRET/);
  });

  it("recovers summaries from completion-only responses through the non-streaming agent entry point", async () => {
    const auth = { getAccess: vi.fn().mockResolvedValue({ accessToken: "token" }) } as unknown as CodexOAuthService;
    const event = { type: "response.completed", response: { output: [
      { type: "reasoning", encrypted_content: "SECRET", summary: [{ type: "summary_text", text: "已确认画面主体。" }] },
      { type: "message", content: [{ type: "output_text", text: "最终回复" }] }
    ] } };
    const transport = new CodexOAuthTextTransport(auth, "codex", undefined,
      vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(event)}\n\n`)) as typeof fetch);
    const summary = vi.fn();
    expect(await transport.complete([], { onReasoningSummary: summary })).toBe("最终回复");
    expect(summary).toHaveBeenCalledTimes(1);
    expect(summary).toHaveBeenCalledWith("已确认画面主体。");
  });
});
