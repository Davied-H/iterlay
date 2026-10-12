import type { SignedRequestAuth } from "../shared/licensing.js";
import type {
  ManagerFeedbackPayload,
  FeedbackDetail,
  FeedbackHistoryPage,
  FeedbackSubmissionResult
} from "../shared/feedback.js";
import type { LicenseService } from "./licensing/service.js";

type FetchLike = typeof fetch;

export class ManagerFeedbackClient {
  private readonly baseUrl: string;

  constructor(
    private readonly license: Pick<LicenseService, "createSignedRequest" | "markCredentialRejected">,
    apiBaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async submit(payload: ManagerFeedbackPayload): Promise<FeedbackSubmissionResult> {
    const value = await this.signedPost("feedback", "feedback.create", payload);
    if (!isFeedbackResult(value)) throw new Error("Manager 返回了无效的反馈结果。");
    return value;
  }

  async listHistory(limit = 50, offset = 0): Promise<FeedbackHistoryPage> {
    const value = await this.signedPost("feedback/history", "feedback.read", { limit, offset });
    if (!isFeedbackHistoryPage(value)) throw new Error("Manager 返回了无效的反馈记录。");
    return value;
  }

  async getDetail(feedbackId: string): Promise<FeedbackDetail> {
    const value = await this.signedPost("feedback/details", "feedback.read", { feedbackId });
    if (!isFeedbackDetail(value)) throw new Error("Manager 返回了无效的反馈详情。");
    return value;
  }

  async delete(feedbackId: string): Promise<void> {
    await this.signedPost("feedback/delete", "feedback.delete", { feedbackId });
  }

  private async signedPost(path: string, purpose: string, payload: unknown): Promise<unknown> {
    const serializedPayload = JSON.stringify(payload);
    const auth: SignedRequestAuth = await this.license.createSignedRequest(purpose, serializedPayload);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      throw new Error("暂时无法提交反馈，请检查网络后重试。", { cause: error });
    }

    if (!response.ok) {
      const error = await feedbackError(response);
      if (error.code === "invalid_credential") this.license.markCredentialRejected(error.message);
      throw error;
    }
    return response.json().catch(() => undefined);
  }
}

class FeedbackApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "FeedbackApiError";
  }
}

async function feedbackError(response: Response): Promise<FeedbackApiError> {
  const body = await response.json().catch(() => ({})) as {
    code?: string;
    message?: string;
    error?: { code?: string; message?: string };
  };
  const code = body.error?.code || body.code || `http_${response.status}`;
  const serverMessage = body.error?.message || body.message;
  const message = response.status === 401
    ? "当前设备授权已失效，请重新激活后提交反馈。"
    : response.status === 413
      ? "自动截图过大，请调整窗口后重试。"
      : serverMessage || `反馈提交失败（${response.status}）。`;
  return new FeedbackApiError(code, message);
}

function isFeedbackResult(value: unknown): value is FeedbackSubmissionResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<FeedbackSubmissionResult>;
  return typeof result.id === "string" && typeof result.status === "string" && typeof result.createdAt === "string";
}

function isFeedbackHistoryPage(value: unknown): value is FeedbackHistoryPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<FeedbackHistoryPage>;
  return Array.isArray(page.items) && typeof page.total === "number" && typeof page.limit === "number" && typeof page.offset === "number";
}

function isFeedbackDetail(value: unknown): value is FeedbackDetail {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FeedbackDetail>;
  return typeof item.id === "string" && typeof item.content === "string" && Array.isArray(item.runs);
}
