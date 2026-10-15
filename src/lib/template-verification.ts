import type { GenerateImageInput, GenerateResponse, ProviderConfig } from "@shared/types";
import type { ImageWorkbenchApi } from "@shared/workbench-client";

export interface TemplateVerificationConfirmation {
  title: string;
  providerLabel: string;
  model: string;
  totalCostLabel: string;
  items: Array<{ id: string; label: string; task: string; costLabel: string; quoteId?: string; quoteExpiresAt?: string }>;
  confirmLabel: string;
}

export type GenerateTemplateVerification = (
  input: GenerateImageInput,
  task: { id: string; templateName: string; canContinue: () => boolean }
) => Promise<GenerateResponse | null>;

export async function generateTemplateVerification(
  input: GenerateImageInput,
  task: Parameters<GenerateTemplateVerification>[1],
  dependencies: {
    provider: ProviderConfig;
    api: Pick<ImageWorkbenchApi, "quotePaidMedia" | "generateImage">;
    confirm: (request: TemplateVerificationConfirmation) => Promise<boolean>;
  }
): Promise<GenerateResponse | null> {
  const { provider, api, confirm } = dependencies;
  if (!task.canContinue()) return null;
  // Keep the confirmed input independent of later board/provider changes.
  const submission = structuredClone({ ...input, providerId: provider.id });
  if (provider.type === "official") {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(submission)));
    const inputFingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const generationAttemptId = crypto.randomUUID();
    const boardId = submission.boardId ?? "global";
    const quote = await api.quotePaidMedia({
      kind: "image",
      clientRequestId: generationAttemptId,
      inputFingerprint,
      providerId: provider.id,
      boardId,
      requestScope: task.id,
      operation: "image:generate",
      imageCount: submission.n,
      stage: "first-frame"
    });
    Object.assign(submission, {
      generationAttemptId,
      inputFingerprint,
      quoteId: quote.quoteId,
      quoteExpiresAt: quote.expiresAt,
      idempotencyKey: [generationAttemptId, inputFingerprint, quote.quoteId].join(":"),
      priceSnapshot: quote.priceSnapshot,
      quoteBoardId: boardId,
      quoteRequestScope: task.id,
      quotePurpose: "first-frame",
      quoteOperation: "image:generate"
    });
  }
  if (!task.canContinue()) return null;
  const costLabel = submission.priceSnapshot
    ? `${submission.priceSnapshot.amount} ${submission.priceSnapshot.currency === "credit" ? "Credit" : submission.priceSnapshot.currency}`
    : "由外部 Provider 计费";
  const confirmed = await confirm({
    title: "确认生成模板验证稿",
    providerLabel: provider.name,
    model: submission.model,
    totalCostLabel: costLabel,
    items: [{
      id: task.id,
      label: task.templateName,
      task: `生成 ${submission.n} 张验证稿`,
      costLabel,
      quoteId: submission.quoteId,
      quoteExpiresAt: submission.quoteExpiresAt
    }],
    confirmLabel: "确认费用并生成"
  });
  if (!confirmed || !task.canContinue()) return null;
  if (submission.quoteExpiresAt && Date.parse(submission.quoteExpiresAt) <= Date.now()) {
    throw new Error("验证稿报价已过期，未提交图片生成；模板已保留，请重新确认费用后生成。");
  }
  return api.generateImage(submission);
}
