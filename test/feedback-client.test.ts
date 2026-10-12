import { describe, expect, it, vi } from "vitest";
import { ManagerFeedbackClient } from "../electron/feedback-client";
import type { SignedRequestAuth } from "../shared/licensing";

function signedAuth(): SignedRequestAuth {
  return {
    grant: "grant",
    nonce: "1234567890123456",
    proof: "proof",
    appVersion: "0.1.45",
    purpose: "feedback.create",
    bodyHash: "hash"
  };
}

describe("ManagerFeedbackClient", () => {
  it("submits the exact payload covered by the device signature", async () => {
    const result = { id: "feedback-1", status: "pending", createdAt: "2026-08-04T08:00:00Z" };
    const fetcher = vi.fn().mockResolvedValue(Response.json(result, { status: 201 }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerFeedbackClient(license, "https://manage.example.com/api/v1/", fetcher);
    const payload = {
      kind: "feature" as const,
      content: "希望支持批量导出",
      pageContext: { view: "board", route: "/", viewport: "1440x900", locale: "zh-CN" },
      screenshot: "anBlZw==",
      screenshotContentType: "image/jpeg" as const
    };

    await expect(client.submit(payload)).resolves.toEqual(result);

    const serialized = JSON.stringify(payload);
    expect(license.createSignedRequest).toHaveBeenCalledWith("feedback.create", serialized);
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/feedback",
      expect.objectContaining({ method: "POST", body: `{"auth":${JSON.stringify(signedAuth())},"payload":${serialized}}` })
    );
  });

  it("marks a rejected device credential and returns an actionable message", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: "invalid_credential", message: "invalid" }, { status: 401 }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerFeedbackClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.submit({
      kind: "experience",
      content: "拖拽会卡顿",
      pageContext: { view: "board", route: "/", viewport: "1280x840", locale: "zh-CN" }
    })).rejects.toThrow("当前设备授权已失效");
    expect(license.markCredentialRejected).toHaveBeenCalledOnce();
  });

  it("rejects malformed successful responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const client = new ManagerFeedbackClient({
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    }, "https://manage.example.com/api/v1", fetcher);

    await expect(client.submit({
      kind: "other",
      content: "其他建议",
      pageContext: { view: "home", route: "/", viewport: "1280x840", locale: "zh-CN" }
    })).rejects.toThrow("Manager 返回了无效的反馈结果");
  });

  it("reads feedback history and detail with device-signed payloads", async () => {
    const page = { items: [], total: 0, limit: 50, offset: 0 };
    const detail = { id: "feedback-1", content: "希望支持批量导出", runs: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(Response.json(detail));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerFeedbackClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.listHistory()).resolves.toEqual(page);
    await expect(client.getDetail("feedback-1")).resolves.toEqual(detail);

    expect(license.createSignedRequest).toHaveBeenNthCalledWith(1, "feedback.read", JSON.stringify({ limit: 50, offset: 0 }));
    expect(license.createSignedRequest).toHaveBeenNthCalledWith(2, "feedback.read", JSON.stringify({ feedbackId: "feedback-1" }));
    expect(fetcher.mock.calls[0][0]).toBe("https://manage.example.com/api/v1/feedback/history");
    expect(fetcher.mock.calls[1][0]).toBe("https://manage.example.com/api/v1/feedback/details");
  });

  it("deletes feedback through a dedicated signed request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const license = {
      createSignedRequest: vi.fn().mockResolvedValue(signedAuth()),
      markCredentialRejected: vi.fn()
    };
    const client = new ManagerFeedbackClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.delete("feedback-1")).resolves.toBeUndefined();

    const payload = JSON.stringify({ feedbackId: "feedback-1" });
    expect(license.createSignedRequest).toHaveBeenCalledWith("feedback.delete", payload);
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/feedback/delete",
      expect.objectContaining({ method: "POST", body: `{"auth":${JSON.stringify(signedAuth())},"payload":${payload}}` })
    );
  });
});
