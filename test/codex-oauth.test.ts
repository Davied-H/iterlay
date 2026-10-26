import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8").replace(/^encrypted:/, "")
  },
  shell: { openExternal: vi.fn() }
}));

import {
  buildAuthorizationUrl,
  CodexCredentialStore,
  CodexOAuthService,
  type CodexCredentials
} from "../electron/auth/codex-oauth.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "iterlay-codex-oauth-"));
  tempDirs.push(directory);
  return directory;
}

function jwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function credentials(overrides: Partial<CodexCredentials> = {}): CodexCredentials {
  return {
    accessToken: "access-old",
    refreshToken: "refresh-token",
    idToken: jwt({
      email: "user@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-123",
        chatgpt_plan_type: "plus"
      }
    }),
    expiresAt: Date.now() - 1_000,
    email: "user@example.com",
    accountId: "account-123",
    planType: "plus",
    ...overrides
  };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("Codex OAuth", () => {
  it("builds the Codex PKCE browser authorization URL", () => {
    const url = new URL(buildAuthorizationUrl("state-value", "challenge-value"));
    expect(url.origin + url.pathname).toBe("https://auth.openai.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
  });

  it.each(["success", "token-error", "storage-error"] as const)(
    "reports the final %s result in both the callback page and app",
    async (scenario) => {
      const directory = tempDir();
      const store = new CodexCredentialStore(directory);
      if (scenario === "storage-error") {
        vi.spyOn(store, "set").mockImplementation(() => { throw new Error("凭据保存失败"); });
      }
      let releaseToken!: (response: Response) => void;
      const tokenResponse = new Promise<Response>((resolve) => { releaseToken = resolve; });
      const fetchMock = vi.fn().mockReturnValue(tokenResponse);
      let callback!: Promise<Response>;
      let callbackReturned = false;
      const service = new CodexOAuthService(directory, fetchMock, async (authorizationUrl) => {
        const authorization = new URL(authorizationUrl);
        const url = new URL(authorization.searchParams.get("redirect_uri")!);
        url.searchParams.set("state", authorization.searchParams.get("state")!);
        url.searchParams.set("code", "test-code");
        callback = fetch(url).then((response) => {
          callbackReturned = true;
          return response;
        });
      }, store);
      try {
        const result = service.signIn("codex-a").then(
          (status) => ({ status, error: null }),
          (error: Error) => ({ status: null, error })
        );
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(callbackReturned).toBe(false);
        expect(store.get("codex-a")).toBeNull();
        expect(service.getStatus("codex-a").state).toBe("authorizing");
        releaseToken(scenario === "token-error"
          ? new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
          : new Response(JSON.stringify({
            access_token: "access-new",
            id_token: credentials().idToken,
            refresh_token: "refresh-new"
          }), { status: 200 }));
        const outcome = await result;
        const response = await callback;
        const html = await response.text();
        if (scenario === "success") {
          expect(outcome.status?.state).toBe("connected");
          expect(response.status).toBe(200);
          expect(html).toContain("登录完成");
          expect(store.get("codex-a")?.accessToken).toBe("access-new");
        } else {
          const message = scenario === "token-error" ? "HTTP 400 / invalid_grant" : "凭据保存失败";
          expect(outcome.error?.message).toContain(message);
          expect(response.status).toBe(502);
          expect(html).toContain(message);
          expect(html).toContain("登录未完成");
          expect(html).not.toContain("<h1>登录完成</h1>");
          expect(service.getStatus("codex-a").state).toBe("signed-out");
        }
      } finally {
        service.dispose();
      }
    }
  );

  it("encrypts credentials per provider and removes stale entries", () => {
    const store = new CodexCredentialStore(tempDir());
    store.set("codex-a", credentials());
    store.set("codex-b", credentials({ accountId: "account-b" }));
    expect(store.get("codex-a")).toMatchObject({ email: "user@example.com", accountId: "account-123" });

    store.retain(new Set(["codex-b"]));
    expect(store.get("codex-a")).toBeNull();
    expect(store.get("codex-b")?.accountId).toBe("account-b");
  });

  it("deduplicates concurrent refreshes and persists refreshed identity", async () => {
    const directory = tempDir();
    const store = new CodexCredentialStore(directory);
    store.set("codex-a", credentials());
    const refreshedIdToken = jwt({
      email: "new@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-123",
        chatgpt_plan_type: "pro"
      }
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-new",
      refresh_token: "refresh-new",
      id_token: refreshedIdToken,
      expires_in: 3600
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const service = new CodexOAuthService(directory, fetchMock as typeof fetch, vi.fn(), store);

    const [first, second] = await Promise.all([
      service.getAccess("codex-a"),
      service.getAccess("codex-a")
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ accessToken: "access-new", accountId: "account-123" });
    expect(second).toEqual(first);
    expect(service.getStatus("codex-a")).toMatchObject({
      state: "connected",
      email: "new@example.com",
      planType: "pro"
    });
  });

  it("requires reauthorization only for rejected refresh credentials", async () => {
    const directory = tempDir();
    const store = new CodexCredentialStore(directory);
    store.set("codex-a", credentials());
    const service = new CodexOAuthService(
      directory,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error_description: "refresh token revoked" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      })) as unknown as typeof fetch,
      vi.fn(),
      store
    );

    await expect(service.getAccess("codex-a")).rejects.toThrow("refresh token revoked");
    expect(service.getStatus("codex-a").state).toBe("reauth-required");
  });
});
