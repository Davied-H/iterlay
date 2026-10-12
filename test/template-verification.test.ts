import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFICIAL_PROVIDER_CONFIG, type GenerateImageInput, type GenerateResponse, type PaidMediaQuoteRequest } from "@shared/types";
import { PaidMediaQuoteService } from "../electron/paid-media-quote";
import { generateTemplateVerification } from "@/lib/template-verification";

const input: GenerateImageInput = {
  workflowMode: "generate", prompt: "A watercolor landscape", model: "gpt-image-1",
  size: "auto", n: 1, sceneId: "scene-1", sceneOnly: true, referenceImages: [], boardId: "board-1"
};
const result = { images: [] } as unknown as GenerateResponse;

function setup() {
  const service = new PaidMediaQuoteService();
  const action = vi.fn(async () => result);
  const provider = { ...OFFICIAL_PROVIDER_CONFIG };
  const quotePaidMedia = vi.fn(async (request: PaidMediaQuoteRequest) => service.issue({
    ...request, providerKey: provider.id, purpose: request.stage,
    amount: 1, currency: "credit", balance: 10,
    pricingKey: JSON.stringify({ kind: "image", providerId: provider.id, count: request.imageCount })
  }));
  const generateImage = vi.fn(async (submission: GenerateImageInput) => service.consume(submission, {
    clientRequestId: submission.generationAttemptId ?? "",
    inputFingerprint: submission.inputFingerprint ?? "",
    providerKey: provider.id, amount: 1, currency: "credit",
    pricingKey: JSON.stringify({ kind: "image", providerId: provider.id, count: submission.n }),
    boardId: submission.boardId ?? "global", requestScope: "task-1",
    purpose: "first-frame", operation: "image:generate"
  }, action));
  const confirm = vi.fn(async () => true);
  const task = { id: "task-1", templateName: "Watercolor", canContinue: vi.fn(() => true) };
  return { provider, api: { quotePaidMedia, generateImage }, confirm, task, action };
}

afterEach(() => vi.useRealTimers());

describe("template verification generation", () => {
  it("submits a complete quote binding accepted by the backend, only after confirmation", async () => {
    const deps = setup();
    deps.confirm.mockImplementation(async () => {
      expect(deps.api.quotePaidMedia).toHaveBeenCalledOnce();
      expect(deps.api.generateImage).not.toHaveBeenCalled();
      return true;
    });
    expect(await generateTemplateVerification(input, deps.task, deps)).toBe(result);
    expect(deps.action).toHaveBeenCalledOnce();
    expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({ totalCostLabel: "1 Credit" }));
    expect(deps.api.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      boardId: "board-1", sceneId: "scene-1", sceneOnly: true, quoteRequestScope: "task-1",
      providerId: deps.provider.id
    }));
    expect(input).not.toHaveProperty("quoteId");
  });

  it("uses the global binding when no board is open", async () => {
    const deps = setup();
    await expect(generateTemplateVerification({ ...input, boardId: undefined }, deps.task, deps)).resolves.toBe(result);
    expect(deps.api.quotePaidMedia).toHaveBeenCalledWith(expect.objectContaining({ boardId: "global" }));
  });

  it("does not submit when confirmation is cancelled", async () => {
    const deps = setup();
    deps.confirm.mockResolvedValue(false);
    expect(await generateTemplateVerification(input, deps.task, deps)).toBeNull();
    expect(deps.api.generateImage).not.toHaveBeenCalled();
  });

  it("does not submit if paused while confirming", async () => {
    const deps = setup();
    deps.confirm.mockImplementation(async () => {
      deps.task.canContinue.mockReturnValue(false);
      return true;
    });
    expect(await generateTemplateVerification(input, deps.task, deps)).toBeNull();
    expect(deps.api.generateImage).not.toHaveBeenCalled();
  });

  it("does not quote or confirm a stopped task", async () => {
    const deps = setup();
    deps.task.canContinue.mockReturnValue(false);
    expect(await generateTemplateVerification(input, deps.task, deps)).toBeNull();
    expect(deps.api.quotePaidMedia).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it("does not open confirmation if paused while obtaining a quote", async () => {
    const deps = setup();
    deps.task.canContinue.mockReturnValueOnce(true).mockReturnValue(false);
    expect(await generateTemplateVerification(input, deps.task, deps)).toBeNull();
    expect(deps.api.quotePaidMedia).toHaveBeenCalledOnce();
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.api.generateImage).not.toHaveBeenCalled();
  });

  it("keeps the confirmed input snapshot when the original input changes", async () => {
    const deps = setup();
    const mutableInput = structuredClone(input);
    deps.confirm.mockImplementation(async () => {
      mutableInput.prompt = "Different prompt";
      mutableInput.boardId = "board-2";
      mutableInput.n = 5;
      return true;
    });
    await expect(generateTemplateVerification(mutableInput, deps.task, deps)).resolves.toBe(result);
    expect(deps.api.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: input.prompt, boardId: "board-1", n: 1
    }));
  });

  it("rejects expired quotes without submitting or automatically retrying", async () => {
    vi.useFakeTimers();
    const deps = setup();
    deps.confirm.mockImplementation(async () => {
      vi.advanceTimersByTime(120_001);
      return true;
    });
    await expect(generateTemplateVerification(input, deps.task, deps)).rejects.toThrow("报价已过期");
    expect(deps.api.generateImage).not.toHaveBeenCalled();
    expect(deps.api.quotePaidMedia).toHaveBeenCalledOnce();
  });

  it("stops on a quote failure", async () => {
    const deps = setup();
    deps.api.quotePaidMedia.mockRejectedValue(new Error("余额不足"));
    await expect(generateTemplateVerification(input, deps.task, deps)).rejects.toThrow("余额不足");
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.api.generateImage).not.toHaveBeenCalled();
  });

  it("confirms external provider billing without requesting an official quote", async () => {
    const deps = setup();
    deps.provider.type = "openai-compatible";
    deps.api.generateImage.mockResolvedValue(result);
    expect(await generateTemplateVerification(input, deps.task, deps)).toBe(result);
    expect(deps.api.quotePaidMedia).not.toHaveBeenCalled();
    expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({ totalCostLabel: "由外部 Provider 计费" }));
    expect(deps.api.generateImage.mock.calls[0][0]).not.toHaveProperty("quoteId");
  });
});
