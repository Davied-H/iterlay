import { describe, expect, it, vi } from "vitest";
import { ManagerTemplateClient } from "../electron/template-client";

describe("ManagerTemplateClient", () => {
  it("signs and submits the generated template archive", async () => {
    const createSignedRequest = vi.fn(async () => ({
      grant: "grant",
      nonce: "nonce-value-long-enough",
      proof: "proof",
      appVersion: "0.1.0",
      purpose: "templates.submit",
      bodyHash: "hash"
    }));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.payload.sourceTemplateId).toBe("custom:test");
      expect(body.payload.archiveBase64).toBe(Buffer.from("archive").toString("base64"));
      return new Response(JSON.stringify({
        id: "submission-id",
        slug: "template-submission",
        name: "测试模板",
        authorName: "Dong",
        status: "pending",
        submittedAt: "2026-07-24T00:00:00Z"
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const client = new ManagerTemplateClient(
      { createSignedRequest, markCredentialRejected: vi.fn() },
      "https://iterlay.example/api/v1",
      fetchImpl as typeof fetch
    );

    const result = await client.submit("custom:test", "Dong", Buffer.from("archive"));

    expect(result.status).toBe("pending");
    expect(createSignedRequest).toHaveBeenCalledWith("templates.submit", expect.any(String));
  });

  it("fetches the latest Manager review status and rejection reason", async () => {
    const createSignedRequest = vi.fn(async () => ({
      grant: "grant",
      nonce: "nonce-value-long-enough",
      proof: "proof",
      appVersion: "0.1.0",
      purpose: "templates.status",
      bodyHash: "hash"
    }));
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.payload).toEqual({ sourceTemplateId: "custom:test" });
      return new Response(JSON.stringify({
        id: "submission-id",
        slug: "template-submission",
        name: "Manager 中的模板名",
        authorName: "Manager 创作者",
        status: "rejected",
        reviewNote: "封面包含无权公开的素材，请替换后重新提交。",
        submittedAt: "2026-07-24T00:00:00Z",
        reviewedAt: "2026-07-24T01:00:00Z",
        updatedAt: "2026-07-24T01:00:00Z"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = new ManagerTemplateClient(
      { createSignedRequest, markCredentialRejected: vi.fn() },
      "https://iterlay.example/api/v1/",
      fetchImpl as typeof fetch
    );

    const result = await client.getStatus("custom:test");

    expect(result).toMatchObject({
      name: "Manager 中的模板名",
      authorName: "Manager 创作者",
      status: "rejected",
      reviewNote: "封面包含无权公开的素材，请替换后重新提交。"
    });
    expect(createSignedRequest).toHaveBeenCalledWith("templates.status", JSON.stringify({
      sourceTemplateId: "custom:test"
    }));
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://iterlay.example/api/v1/template-submissions/status",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns null when the template has not been submitted", async () => {
    const client = new ManagerTemplateClient(
      {
        createSignedRequest: vi.fn(async () => ({
          grant: "grant",
          nonce: "nonce-value-long-enough",
          proof: "proof",
          appVersion: "0.1.0",
          purpose: "templates.status",
          bodyHash: "hash"
        })),
        markCredentialRejected: vi.fn()
      },
      "https://iterlay.example/api/v1",
      vi.fn(async () => new Response(JSON.stringify({
        code: "not_found",
        message: "资源不存在"
      }), { status: 404, headers: { "Content-Type": "application/json" } })) as typeof fetch
    );

    await expect(client.getStatus("custom:new")).resolves.toBeNull();
  });

  it("does not mistake a missing Manager route for an unpublished template", async () => {
    const client = new ManagerTemplateClient(
      {
        createSignedRequest: vi.fn(async () => ({
          grant: "grant",
          nonce: "nonce-value-long-enough",
          proof: "proof",
          appVersion: "0.1.0",
          purpose: "templates.status",
          bodyHash: "hash"
        })),
        markCredentialRejected: vi.fn()
      },
      "https://iterlay.example/api/v1",
      vi.fn(async () => new Response("404 page not found", { status: 404 })) as typeof fetch
    );

    await expect(client.getStatus("custom:test")).rejects.toThrow("模板审核状态查询失败 (404)");
  });
});
