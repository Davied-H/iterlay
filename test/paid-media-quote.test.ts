import { afterEach, describe, expect, it, vi } from "vitest";
import {
  paidProviderClientRequestId,
  paidVideoPricingKey,
  PaidMediaQuoteService,
  type PaidMediaQuoteBinding
} from "../electron/paid-media-quote.js";

const binding: PaidMediaQuoteBinding = {
  boardId: "board-1",
  requestScope: "generation-node-1",
  purpose: "video",
  operation: "video:start"
};

async function metadata(service: PaidMediaQuoteService, amount = 5, overrides: Partial<PaidMediaQuoteBinding> = {}) {
  const clientRequestId = crypto.randomUUID();
  const inputFingerprint = crypto.randomUUID();
  const resolvedBinding = { ...binding, ...overrides };
  const quote = await service.issue({
    clientRequestId, inputFingerprint, providerKey: "official-video", stage: "video",
    amount, currency: "gold-bean", balance: 8, pricingKey: "video-pricing", ...resolvedBinding
  });
  return {
    quote,
    submission: {
      generationAttemptId: clientRequestId,
      inputFingerprint,
      quoteId: quote.quoteId,
      quoteExpiresAt: quote.expiresAt,
      idempotencyKey: [clientRequestId, inputFingerprint, quote.quoteId].join(":"),
      priceSnapshot: quote.priceSnapshot,
      quoteBoardId: resolvedBinding.boardId,
      quoteRequestScope: resolvedBinding.requestScope,
      quotePurpose: resolvedBinding.purpose,
      quoteOperation: resolvedBinding.operation
    },
    expected: {
      clientRequestId, inputFingerprint, providerKey: "official-video", amount,
      currency: "gold-bean", pricingKey: "video-pricing", ...resolvedBinding
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

describe("PaidMediaQuoteService", () => {
  it("uses the short generation attempt id for provider requests", () => {
    const generationAttemptId = crypto.randomUUID();
    const idempotencyKey = `${generationAttemptId}:${"a".repeat(64)}:${crypto.randomUUID()}`;
    expect(idempotencyKey.length).toBeGreaterThan(128);
    expect(paidProviderClientRequestId({ generationAttemptId, idempotencyKey })).toBe(generationAttemptId);
    expect(paidProviderClientRequestId({ idempotencyKey: " external-request " })).toBe("external-request");
  });

  afterEach(() => { vi.useRealTimers(); });

  it("includes every provider-sensitive video option in the pricing key", () => {
    expect(paidVideoPricingKey([{
      providerId: "official-video",
      model: "bytedance/seedance-2.0/image-to-video",
      durationSeconds: 5,
      resolution: "720p",
      generateAudio: true
    }])).toBe(JSON.stringify([{
      providerId: "official-video",
      model: "bytedance/seedance-2.0/image-to-video",
      durationSeconds: 5,
      resolution: "720p",
      generateAudio: true
    }]));
  });

  it("rejects missing, mismatched, non-authoritative, and cross-identity submissions", async () => {
    let identity = "license-a";
    const service = new PaidMediaQuoteService(async () => identity);
    const valid = await metadata(service);
    await expect(service.consume({}, valid.expected, async () => "unused")).rejects.toThrow("缺失、过期");
    await expect(service.consume({ ...valid.submission, inputFingerprint: "changed" }, valid.expected, async () => "unused")).rejects.toThrow("不匹配");
    await expect(service.consume({ ...valid.submission, priceSnapshot: { ...valid.quote.priceSnapshot, authoritative: false } }, valid.expected, async () => "unused")).rejects.toThrow("不匹配");
    identity = "license-b";
    await expect(service.consume(valid.submission, valid.expected, async () => "unused")).rejects.toThrow("不匹配");
  });

  it("atomically shares one result for same-key retries and rejects cross-IPC replay", async () => {
    const service = new PaidMediaQuoteService();
    const valid = await metadata(service);
    const action = vi.fn();
    const pending = deferred<{ jobId: string }>();
    action.mockReturnValue(pending.promise);
    const first = service.consume(valid.submission, valid.expected, action);
    const retry = service.consume(structuredClone(valid.submission), { ...valid.expected }, action);
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    await expect(service.consume(
      { ...valid.submission, quoteOperation: "image:generate" },
      { ...valid.expected, operation: "image:generate" },
      async () => ({ jobId: "wrong-channel" })
    )).rejects.toThrow("付费媒体报价");
    const result = { jobId: "job-1" };
    pending.resolve(result);
    await expect(first).resolves.toBe(result);
    await expect(retry).resolves.toBe(result);
    await expect(service.consume(valid.submission, valid.expected, async () => ({ jobId: "job-2" }))).resolves.toBe(result);
    expect(action).toHaveBeenCalledOnce();
  });

  it("rolls back a failed action and atomically blocks concurrent quotes beyond balance", async () => {
    const service = new PaidMediaQuoteService();
    const first = await metadata(service, 5);
    const second = await metadata(service, 5);
    const pending = deferred<string>();
    const consuming = service.consume(first.submission, first.expected, () => pending.promise);
    await expect(service.consume(second.submission, second.expected, async () => "second")).rejects.toThrow("其他任务预占");
    pending.reject(new Error("persistent task write failed"));
    await expect(consuming).rejects.toThrow("persistent task write failed");
    await expect(service.consume(first.submission, first.expected, async () => "retried-result")).resolves.toBe("retried-result");
  });

  it("rejects a quote after its main-process expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const service = new PaidMediaQuoteService();
    const valid = await metadata(service);
    vi.advanceTimersByTime(2 * 60_000 + 1);
    await expect(service.consume(valid.submission, valid.expected, async () => "unused")).rejects.toThrow("缺失、过期");
  });
});
