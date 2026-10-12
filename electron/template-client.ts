import type { SignedRequestAuth } from "../shared/licensing.js";
import type { TemplateSubmissionResult } from "../shared/types.js";
import type { LicenseService } from "./licensing/service.js";

type FetchLike = typeof fetch;

const MAX_TEMPLATE_ARCHIVE_BYTES = 32 * 1024 * 1024;

export class ManagerTemplateClient {
  private readonly baseUrl: string;

  constructor(
    private readonly license: Pick<LicenseService, "createSignedRequest" | "markCredentialRejected">,
    apiBaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async submit(sourceTemplateId: string, authorName: string, archive: Buffer): Promise<TemplateSubmissionResult> {
    if (!sourceTemplateId.trim()) throw new Error("模板 ID 无效，无法发布。");
    if (archive.byteLength < 1 || archive.byteLength > MAX_TEMPLATE_ARCHIVE_BYTES) {
      throw new Error("公开模板包不能超过 32 MB，请减少模板中的示例图后重试。");
    }
    const serializedPayload = JSON.stringify({
      sourceTemplateId,
      authorName: authorName.trim(),
      archiveBase64: archive.toString("base64")
    });
    const auth: SignedRequestAuth = await this.license.createSignedRequest("templates.submit", serializedPayload);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/template-submissions`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: AbortSignal.timeout(90_000)
      });
    } catch (error) {
      throw new Error("暂时无法连接模板发布服务，请检查网络后重试。", { cause: error });
    }
    if (!response.ok) {
      const apiError = await templateSubmissionError(response);
      if (apiError.code === "invalid_credential") this.license.markCredentialRejected(apiError.message);
      if (response.status === 409) {
        throw new Error("模板发布目前仅对已激活用户开放，请先激活 Iterlay。");
      }
      throw apiError;
    }
    const value = await response.json().catch(() => undefined);
    if (!isTemplateSubmissionResult(value) || value.status !== "pending") {
      throw new Error("Manager 返回了无效的模板发布结果。");
    }
    return value;
  }

  async getStatus(sourceTemplateId: string): Promise<TemplateSubmissionResult | null> {
    if (!sourceTemplateId.trim()) throw new Error("模板 ID 无效，无法查询审核状态。");
    const serializedPayload = JSON.stringify({ sourceTemplateId });
    const auth: SignedRequestAuth = await this.license.createSignedRequest("templates.status", serializedPayload);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/template-submissions/status`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      throw new Error("暂时无法连接模板审核服务，请检查网络后重试。", { cause: error });
    }
    if (!response.ok) {
      const apiError = await templateSubmissionError(response, "模板审核状态查询失败");
      if (response.status === 404 && apiError.code === "not_found") return null;
      if (apiError.code === "invalid_credential") this.license.markCredentialRejected(apiError.message);
      throw apiError;
    }
    const value = await response.json().catch(() => undefined);
    if (!isTemplateSubmissionResult(value)) {
      throw new Error("Manager 返回了无效的模板审核状态。");
    }
    return value;
  }
}

class TemplateSubmissionApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TemplateSubmissionApiError";
  }
}

async function templateSubmissionError(
  response: Response,
  fallbackMessage = "模板发布失败"
): Promise<TemplateSubmissionApiError> {
  try {
    const value = await response.json() as { code?: unknown; message?: unknown };
    return new TemplateSubmissionApiError(
      typeof value.code === "string" ? value.code : "template_submission_failed",
      typeof value.message === "string" && value.message.trim()
        ? value.message.trim()
        : `${fallbackMessage} (${response.status})。`
    );
  } catch {
    return new TemplateSubmissionApiError("template_submission_failed", `${fallbackMessage} (${response.status})。`);
  }
}

function isTemplateSubmissionResult(value: unknown): value is TemplateSubmissionResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TemplateSubmissionResult>;
  const validStatus = item.status === "pending" || item.status === "published" || item.status === "rejected" ||
    item.status === "taken_down" || item.status === "withdrawn";
  return typeof item.id === "string" && typeof item.slug === "string" && typeof item.name === "string" &&
    typeof item.authorName === "string" && validStatus && typeof item.submittedAt === "string" &&
    (item.reviewNote === undefined || typeof item.reviewNote === "string") &&
    (item.reviewedAt === undefined || typeof item.reviewedAt === "string") &&
    (item.publishedAt === undefined || typeof item.publishedAt === "string") &&
    (item.updatedAt === undefined || typeof item.updatedAt === "string");
}
