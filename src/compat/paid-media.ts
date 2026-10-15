import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
/** Compatibility for older paid task receipts; community providers never request quotes. */
export async function generationFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function paidGenerationMetadata(
  inputFingerprint: string,
  stage: "character" | "first-frame" | "last-frame" | "video",
  request: {
    kind: "image" | "video";
    providerId: string;
    boardId: string;
    requestScope: string;
    operation: "image:generate" | "video:start";
    imageCount?: number;
    durationSeconds?: number;
    model?: string;
    resolution?: string;
    generateAudio?: boolean;
  }
) {
  const generationAttemptId = crypto.randomUUID();
  const quote = await getImageWorkbenchApi().quotePaidMedia({
    kind: request.kind,
    clientRequestId: generationAttemptId,
    inputFingerprint,
    boardId: request.boardId,
    requestScope: request.requestScope,
    operation: request.operation,
    providerId: request.providerId,
    imageCount: request.imageCount,
    durationSeconds: request.durationSeconds,
    model: request.model,
    resolution: request.resolution,
    generateAudio: request.generateAudio,
    stage
  });
  return {
    inputFingerprint,
    generationAttemptId,
    quoteId: quote.quoteId,
    quoteExpiresAt: quote.expiresAt,
    idempotencyKey: [generationAttemptId, inputFingerprint, quote.quoteId].join(":"),
    priceSnapshot: quote.priceSnapshot,
    quoteBoardId: request.boardId,
    quoteRequestScope: request.requestScope,
    quotePurpose: stage,
    quoteOperation: request.operation
  };
}