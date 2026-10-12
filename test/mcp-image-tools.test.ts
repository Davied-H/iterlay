import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildRendererCall } from "../electron/mcp-bridge.js";

type WorkbenchMock = Record<string, ReturnType<typeof vi.fn>>;

function runRendererCall(
  method: "generate_image" | "edit_image",
  args: Record<string, unknown>,
  imageWorkbench: WorkbenchMock
) {
  const window = { imageWorkbench, dispatchEvent: vi.fn() };
  const crypto = {
    randomUUID: vi.fn()
      .mockReturnValueOnce("operation-1")
      .mockReturnValueOnce("attempt-1"),
    subtle: webcrypto.subtle
  };
  class CustomEventMock {
    constructor(public type: string, public init: unknown) {}
  }
  const execute = new Function(
    "window",
    "crypto",
    "CustomEvent",
    `return ${buildRendererCall(method, args)}`
  );
  return execute(window, crypto, CustomEventMock) as Promise<{
    generationId: string;
    status: string;
  }>;
}

describe("MCP image tools", () => {
  it("quotes an official-provider generation before submitting it", async () => {
    const quotePaidMedia = vi.fn().mockResolvedValue({
      quoteId: "quote-1",
      clientRequestId: "attempt-1",
      inputFingerprint: "fingerprint",
      providerKey: "iterlay-official",
      expiresAt: "2026-08-27T12:00:00.000Z",
      priceSnapshot: {
        stage: "first-frame",
        amount: 1,
        currency: "credit",
        authoritative: true
      }
    });
    const generateImage = vi.fn().mockResolvedValue({
      job: { id: "job-1", providerId: "iterlay-official" },
      images: [{ path: "/managed/logo.png" }],
      warnings: []
    });
    const imageWorkbench = {
      getSettings: vi.fn().mockResolvedValue({
        activeProviderId: "iterlay-official",
        providers: [{ id: "iterlay-official", type: "official", model: "gpt-image-1" }]
      }),
      quotePaidMedia,
      generateImage,
      readAssetDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,AA=="),
      appendBoardNodes: vi.fn()
    };

    const task = await runRendererCall("generate_image", {
      boardId: "board-1",
      prompt: "Geometric Pi Agent logo",
      n: 1,
      size: "1024x1024",
      background: "transparent"
    }, imageWorkbench);

    expect(task).toMatchObject({ generationId: "operation-1", status: "running" });
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledOnce());

    const quoteRequest = quotePaidMedia.mock.calls[0][0];
    expect(quoteRequest).toMatchObject({
      kind: "image",
      clientRequestId: "attempt-1",
      boardId: "board-1",
      requestScope: expect.any(String),
      operation: "image:generate",
      providerId: "iterlay-official",
      imageCount: 1,
      stage: "first-frame"
    });
    expect(quoteRequest.inputFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(quoteRequest.requestScope).toBe(quoteRequest.inputFingerprint);

    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "iterlay-official",
      generationAttemptId: "attempt-1",
      inputFingerprint: quoteRequest.inputFingerprint,
      quoteId: "quote-1",
      quoteExpiresAt: "2026-08-27T12:00:00.000Z",
      idempotencyKey: `attempt-1:${quoteRequest.inputFingerprint}:quote-1`,
      quoteBoardId: "board-1",
      quoteRequestScope: quoteRequest.inputFingerprint,
      quotePurpose: "first-frame",
      quoteOperation: "image:generate",
      background: "auto",
      outputFormat: "png"
    }));
    expect(imageWorkbench.appendBoardNodes).not.toHaveBeenCalled();
  });

  it("keeps custom-provider generation on the quote-free path", async () => {
    const quotePaidMedia = vi.fn();
    const generateImage = vi.fn().mockResolvedValue({
      job: { id: "job-2", providerId: "custom-provider" },
      images: [{ path: "/managed/custom.png" }],
      warnings: []
    });
    const appendBoardNodes = vi.fn().mockResolvedValue(undefined);
    const imageWorkbench = {
      getSettings: vi.fn().mockResolvedValue({
        activeProviderId: "custom-provider",
        providers: [{ id: "custom-provider", type: "openai-compatible", model: "image-model" }]
      }),
      quotePaidMedia,
      generateImage,
      readAssetDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,AA=="),
      appendBoardNodes
    };

    await runRendererCall("generate_image", {
      boardId: "board-2",
      prompt: "Geometric logo"
    }, imageWorkbench);

    await vi.waitFor(() => expect(generateImage).toHaveBeenCalledOnce());
    expect(quotePaidMedia).not.toHaveBeenCalled();
    expect(generateImage).toHaveBeenCalledWith(expect.not.objectContaining({
      quoteId: expect.anything()
    }));
    expect(appendBoardNodes).toHaveBeenCalledWith("board-2", [
      expect.objectContaining({
        imagePath: "/managed/custom.png",
        jobId: "job-2",
        source: "generated"
      })
    ]);
  });
});
