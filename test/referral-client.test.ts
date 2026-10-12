import { describe, expect, it, vi } from "vitest";
import { ManagerReferralClient } from "../electron/referral-client";
import type { SignedRequestAuth } from "../shared/licensing";

function signedAuth(): SignedRequestAuth {
  return {
    grant: "grant",
    nonce: "1234567890123456",
    proof: "proof",
    appVersion: "0.1.28",
    purpose: "referrals.overview",
    bodyHash: "hash"
  };
}

describe("ManagerReferralClient", () => {
  it("loads the invitation overview through a signed device request", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      invitationCode: "HEYU2026",
      invitationLink: "https://iterlay.example.com/download?ref=HEYU2026",
      rewardCredits: 200,
      totalInvited: 3,
      successfulCount: 2,
      totalRewards: 400,
      creditBalance: 1260,
      items: []
    }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerReferralClient(license, "https://manage.example.com/api/v1/", fetcher);

    await expect(client.getOverview()).resolves.toMatchObject({ invitationCode: "HEYU2026" });
    expect(license.createSignedRequest).toHaveBeenCalledWith("referrals.overview", "{}");
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/referrals/overview",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("surfaces the activation requirement for trial devices", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      code: "conflict",
      message: "当前状态不允许此操作"
    }, { status: 409 }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerReferralClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.getOverview()).rejects.toThrow("激活授权后即可参与邀请计划。");
  });

  it("rejects malformed invitation responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ invitationCode: "HEYU2026" }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerReferralClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.getOverview()).rejects.toThrow("Manager 返回了无效的邀请信息。");
  });

  it("loads gift activation codes through the dedicated signed purpose", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      campaign: {
        id: "default",
        name: "好友激活礼",
        enabled: true,
        redemptionEnabled: true,
        defaultQuota: 5,
        totalCodeLimit: 0,
        maxMajorVersion: 1,
        maxDevices: 2,
        activationCredits: 0,
        shareMessage: "送你一份 Iterlay 永久授权",
        status: "active",
        codesIssued: true
      },
      eligible: true,
      totalQuota: 5,
      availableCount: 4,
      redeemedCount: 1,
      codes: [{
        id: "code-1",
        sequence: 1,
        code: "ABCD-EFGH-IJKL-MNOP",
        codePrefix: "ABCD",
        status: "available",
        shareCount: 0,
        createdAt: "2026-07-22T00:00:00Z"
      }]
    }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerReferralClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.getGiftActivationOverview()).resolves.toMatchObject({ totalQuota: 5 });
    expect(license.createSignedRequest).toHaveBeenCalledWith("gift-activations.overview", "{}");
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/gift-activations/overview",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("records a copied gift code with the exact signed payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerReferralClient(license, "https://manage.example.com/api/v1", fetcher);
    const payload = '{"codeId":"code-1"}';

    await client.recordGiftActivationShare(" code-1 ");

    expect(license.createSignedRequest).toHaveBeenCalledWith("gift-activations.share", payload);
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/gift-activations/share",
      expect.objectContaining({ body: expect.stringContaining(`"payload":${payload}`) })
    );
  });
});
