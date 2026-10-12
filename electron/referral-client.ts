import type { GiftActivationOverview, ReferralOverview } from "../shared/types.js";
import type { SignedRequestAuth } from "../shared/licensing.js";
import type { LicenseService } from "./licensing/service.js";

type FetchLike = typeof fetch;

export class ManagerReferralClient {
  private readonly baseUrl: string;

  constructor(
    private readonly license: Pick<LicenseService, "createSignedRequest" | "markCredentialRejected">,
    apiBaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async getOverview(): Promise<ReferralOverview> {
    const serializedPayload = "{}";
    const auth: SignedRequestAuth = await this.license.createSignedRequest("referrals.overview", serializedPayload);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/referrals/overview`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error("暂时无法读取邀请信息，请检查网络后重试。", { cause: error });
    }

    if (!response.ok) {
      const error = await referralError(response);
      if (error.code === "invalid_credential") this.license.markCredentialRejected(error.message);
      throw error;
    }

    const value = await response.json().catch(() => undefined);
    if (!isReferralOverview(value)) throw new Error("Manager 返回了无效的邀请信息。");
    return value;
  }

  async getGiftActivationOverview(): Promise<GiftActivationOverview> {
    const value = await this.signedRequest(
      "gift-activations.overview",
      "/gift-activations/overview",
      "{}"
    );
    if (!isGiftActivationOverview(value)) {
      throw new Error("Manager 返回了无效的好友激活礼信息。");
    }
    return value;
  }

  async recordGiftActivationShare(codeId: string): Promise<void> {
    const normalizedCodeId = typeof codeId === "string" ? codeId.trim() : "";
    if (!normalizedCodeId) throw new Error("请选择要分享的激活码。");
    await this.signedRequest(
      "gift-activations.share",
      "/gift-activations/share",
      JSON.stringify({ codeId: normalizedCodeId }),
      true
    );
  }

  private async signedRequest(
    purpose: string,
    path: string,
    serializedPayload: string,
    noContent = false
  ): Promise<unknown> {
    const auth: SignedRequestAuth = await this.license.createSignedRequest(purpose, serializedPayload);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error("暂时无法连接活动服务，请检查网络后重试。", { cause: error });
    }
    if (!response.ok) {
      const error = await referralError(response);
      if (error.code === "invalid_credential") this.license.markCredentialRejected(error.message);
      throw error;
    }
    return noContent ? undefined : response.json().catch(() => undefined);
  }
}

class ReferralApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ReferralApiError";
  }
}

async function referralError(response: Response): Promise<ReferralApiError> {
  const body = await response.json().catch(() => undefined) as { code?: unknown; message?: unknown } | undefined;
  const code = typeof body?.code === "string" ? body.code : `HTTP_${response.status}`;
  const defaults: Record<string, string> = {
    conflict: "激活授权后即可参与邀请计划。",
    invalid_credential: "设备凭证已失效，请重新检查授权状态。",
    gift_campaign_unavailable: "好友激活礼当前不可用，请稍后再试。",
    gift_recipient_ineligible: "当前授权不符合好友激活礼参与条件。"
  };
  const apiMessage = typeof body?.message === "string" ? body.message.trim() : "";
  const message = (defaults[code] ?? apiMessage) || `邀请信息请求失败 (${response.status})。`;
  return new ReferralApiError(code, message);
}

function isGiftActivationOverview(value: unknown): value is GiftActivationOverview {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GiftActivationOverview>;
  return (
    Boolean(item.campaign && typeof item.campaign === "object") &&
    typeof item.campaign?.name === "string" &&
    typeof item.campaign?.status === "string" &&
    typeof item.eligible === "boolean" &&
    typeof item.totalQuota === "number" && Number.isFinite(item.totalQuota) &&
    typeof item.availableCount === "number" && Number.isFinite(item.availableCount) &&
    typeof item.redeemedCount === "number" && Number.isFinite(item.redeemedCount) &&
    Array.isArray(item.codes) && item.codes.every((code) => (
      Boolean(code) && typeof code.id === "string" && typeof code.sequence === "number" &&
      typeof code.code === "string" && typeof code.codePrefix === "string" && typeof code.status === "string"
    ))
  );
}

function isReferralOverview(value: unknown): value is ReferralOverview {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ReferralOverview>;
  return (
    typeof item.invitationCode === "string" && item.invitationCode.length > 0 &&
    typeof item.invitationLink === "string" && /^https?:\/\//i.test(item.invitationLink) &&
    typeof item.rewardCredits === "number" && Number.isFinite(item.rewardCredits) &&
    typeof item.totalInvited === "number" && Number.isFinite(item.totalInvited) &&
    typeof item.successfulCount === "number" && Number.isFinite(item.successfulCount) &&
    typeof item.totalRewards === "number" && Number.isFinite(item.totalRewards) &&
    typeof item.creditBalance === "number" && Number.isFinite(item.creditBalance) &&
    Array.isArray(item.items)
  );
}
