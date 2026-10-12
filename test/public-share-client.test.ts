import { describe, expect, it, vi } from "vitest";
import { ManagerPublicShareClient } from "../electron/public-share-client";
import type { SignedRequestAuth } from "../shared/licensing";

function signedAuth(): SignedRequestAuth {
  return {
    grant: "grant",
    nonce: "1234567890123456",
    proof: "proof",
    appVersion: "0.1.25",
    purpose: "public-share.create",
    bodyHash: "hash"
  };
}

describe("ManagerPublicShareClient", () => {
  it("forwards Manager requests to localhost and unregisters the session on stop", async () => {
    let firstPoll = true;
    let relayedBody: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/public-shares") && init?.method === "POST") {
        return Response.json({
          sessionId: "session-1",
          secret: "session-secret",
          url: "https://share.example.com/share/public-token/",
          expiresAt: Date.now() + 60_000
        }, { status: 201 });
      }
      if (url.endsWith("/poll")) {
        if (firstPoll) {
          firstPoll = false;
          return Response.json({ requestId: "request-1", method: "GET", path: "/stickers/01.gif" });
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      if (url === "http://127.0.0.1:4567/local-token/stickers/01.gif") {
        return new Response("gif-bytes", { status: 200, headers: { "Content-Type": "image/gif" } });
      }
      if (url.endsWith("/responses")) {
        relayedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/public-shares/session-1") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const license = { createSignedRequest: vi.fn().mockResolvedValue(signedAuth()) };
    const client = new ManagerPublicShareClient(license, "https://manage.example.com/api/v1/", fetcher);

    await expect(client.start("http://127.0.0.1:4567/local-token/"))
      .resolves.toMatchObject({ url: "https://share.example.com/share/public-token/" });
    await vi.waitFor(() => expect(relayedBody).toMatchObject({
      requestId: "request-1",
      status: 200,
      headers: { "content-type": "image/gif" }
    }));
    expect(Buffer.from(String(relayedBody?.bodyBase64), "base64").toString()).toBe("gif-bytes");

    await client.stop();
    expect(fetcher).toHaveBeenCalledWith(
      "https://manage.example.com/api/v1/public-shares/session-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("cancels a session that is still being created when the dialog closes", async () => {
    let creationSignal: AbortSignal | null = null;
    const getCreationSignal = (): AbortSignal | null => creationSignal;
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (!url.endsWith("/public-shares")) throw new Error(`unexpected request: ${url}`);
      creationSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });
    const license = { createSignedRequest: vi.fn().mockResolvedValue(signedAuth()) };
    const client = new ManagerPublicShareClient(license, "https://manage.example.com/api/v1", fetcher);

    const starting = client.start("http://127.0.0.1:4567/local-token");
    await vi.waitFor(() => expect(getCreationSignal()).not.toBeNull());
    await client.stop();

    expect(getCreationSignal()?.aborted).toBe(true);
    await expect(starting).rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns a socket failure into a retryable product message", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const license = { createSignedRequest: vi.fn().mockResolvedValue(signedAuth()) };
    const client = new ManagerPublicShareClient(license, "https://manage.example.com/api/v1", fetcher);

    await expect(client.start("http://127.0.0.1:4567/local-token"))
      .rejects.toThrow("暂时无法连接 Manager 公网分享服务，请检查网络后重试。");
  });
});
