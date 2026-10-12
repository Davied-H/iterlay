import { safeStorage, shell } from "electron";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import type { CodexAuthStatus } from "../../shared/types.js";

type FetchLike = typeof fetch;

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CALLBACK_PORT = 1455;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/auth/callback`;
const AUTH_TIMEOUT_MS = 5 * 60_000;
const REFRESH_EARLY_MS = 5 * 60_000;

export interface CodexCredentials {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
  email: string;
  accountId: string;
  planType: string;
  reauthRequired?: boolean;
}

interface StoredCredentialsFile {
  version: 1;
  entries: Record<string, string>;
}

interface TokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
}

interface AuthClaims {
  email?: unknown;
  exp?: unknown;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: unknown;
    chatgpt_plan_type?: unknown;
  };
}

class TokenRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class CodexCredentialStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "codex-oauth.json");
  }

  get(providerId: string): CodexCredentials | null {
    const encrypted = this.readFile().entries[providerId];
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64"))) as CodexCredentials;
    } catch {
      return null;
    }
  }

  set(providerId: string, credentials: CodexCredentials): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统不支持安全存储，无法保存 Codex 登录凭据。");
    }
    const current = this.readFile();
    current.entries[providerId] = safeStorage
      .encryptString(JSON.stringify(credentials))
      .toString("base64");
    this.writeFile(current);
  }

  delete(providerId: string): void {
    const current = this.readFile();
    if (!(providerId in current.entries)) return;
    delete current.entries[providerId];
    this.writeFile(current);
  }

  retain(providerIds: Set<string>): void {
    const current = this.readFile();
    const entries = Object.fromEntries(
      Object.entries(current.entries).filter(([providerId]) => providerIds.has(providerId))
    );
    if (Object.keys(entries).length !== Object.keys(current.entries).length) {
      this.writeFile({ version: 1, entries });
    }
  }

  private readFile(): StoredCredentialsFile {
    if (!existsSync(this.filePath)) return { version: 1, entries: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<StoredCredentialsFile>;
      return {
        version: 1,
        entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {}
      };
    } catch {
      return { version: 1, entries: {} };
    }
  }

  private writeFile(value: StoredCredentialsFile): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}

export class CodexOAuthService {
  private readonly store: CodexCredentialStore;
  private readonly refreshes = new Map<string, Promise<CodexCredentials>>();
  private readonly authorizing = new Set<string>();
  private callbackServer: Server | null = null;

  constructor(
    dataDir: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly openExternal: (url: string) => Promise<void> = (url) => shell.openExternal(url),
    store?: CodexCredentialStore
  ) {
    this.store = store ?? new CodexCredentialStore(dataDir);
  }

  getStatus(providerId: string): CodexAuthStatus {
    if (this.authorizing.has(providerId)) return { state: "authorizing", message: "等待浏览器授权" };
    if (this.refreshes.has(providerId)) return this.toStatus(this.store.get(providerId), "refreshing");
    const credentials = this.store.get(providerId);
    if (!credentials) return { state: "signed-out" };
    if (credentials.reauthRequired) return this.toStatus(credentials, "reauth-required");
    if (credentials.expiresAt <= Date.now() && !credentials.refreshToken) {
      return this.toStatus(credentials, "expired");
    }
    return this.toStatus(credentials, "connected");
  }

  async signIn(providerId: string): Promise<CodexAuthStatus> {
    if (this.authorizing.has(providerId)) throw new Error("该账号正在授权，请在浏览器中完成登录。");
    if (this.callbackServer) throw new Error("已有 Codex 账号正在授权，请先完成或取消当前登录。");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统不支持安全存储，无法登录 Codex 账号。");

    this.authorizing.add(providerId);
    const state = randomBytes(32).toString("hex");
    const verifier = randomBytes(64).toString("hex");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    try {
      const code = await this.waitForAuthorizationCode(state, async () => {
        await this.openExternal(buildAuthorizationUrl(state, challenge));
      });
      const credentials = await this.exchangeCode(code, verifier);
      this.store.set(providerId, credentials);
      return this.toStatus(credentials, "connected");
    } finally {
      this.authorizing.delete(providerId);
      this.closeCallbackServer();
    }
  }

  async getAccess(providerId: string, forceRefresh = false): Promise<{ accessToken: string; accountId: string }> {
    const credentials = this.store.get(providerId);
    if (!credentials) throw new Error("请先登录 Codex / ChatGPT 账号。");
    if (credentials.reauthRequired) throw new Error("Codex 登录已失效，请重新授权。");
    if (!forceRefresh && credentials.expiresAt - Date.now() > REFRESH_EARLY_MS) {
      return { accessToken: credentials.accessToken, accountId: credentials.accountId };
    }
    const refreshed = await this.refresh(providerId, credentials);
    return { accessToken: refreshed.accessToken, accountId: refreshed.accountId };
  }

  async refreshNow(providerId: string): Promise<CodexAuthStatus> {
    const credentials = this.store.get(providerId);
    if (!credentials) return { state: "signed-out" };
    const refreshed = await this.refresh(providerId, credentials);
    return this.toStatus(refreshed, "connected");
  }

  signOut(providerId: string): CodexAuthStatus {
    this.store.delete(providerId);
    return { state: "signed-out" };
  }

  markReauthRequired(providerId: string): void {
    const credentials = this.store.get(providerId);
    if (credentials) this.store.set(providerId, { ...credentials, reauthRequired: true });
  }

  retainProviders(providerIds: Set<string>): void {
    this.store.retain(providerIds);
  }

  dispose(): void {
    this.closeCallbackServer();
  }

  private refresh(providerId: string, credentials: CodexCredentials): Promise<CodexCredentials> {
    const pending = this.refreshes.get(providerId);
    if (pending) return pending;
    if (!credentials.refreshToken) {
      const expired = { ...credentials, reauthRequired: true };
      this.store.set(providerId, expired);
      return Promise.reject(new Error("Codex 登录已过期，请重新授权。"));
    }

    const request = this.requestToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: credentials.refreshToken,
      scope: "openid profile email"
    }))
      .then((payload) => this.credentialsFromToken(payload, credentials))
      .then((refreshed) => {
        this.store.set(providerId, refreshed);
        return refreshed;
      })
      .catch((error) => {
        if (error instanceof TokenRequestError && [400, 401, 403].includes(error.status)) {
          this.store.set(providerId, { ...credentials, reauthRequired: true });
        }
        throw new Error(error instanceof Error ? error.message : "无法刷新 Codex 登录状态。");
      })
      .finally(() => this.refreshes.delete(providerId));
    this.refreshes.set(providerId, request);
    return request;
  }

  private async exchangeCode(code: string, verifier: string): Promise<CodexCredentials> {
    const payload = await this.requestToken(new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    }));
    return this.credentialsFromToken(payload);
  }

  private async requestToken(body: URLSearchParams): Promise<TokenPayload> {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = (await response.json().catch(() => ({}))) as TokenPayload;
    if (!response.ok) {
      const description = typeof payload.error_description === "string" ? payload.error_description : "";
      throw new TokenRequestError(description || "OpenAI 授权失败，请重新登录。", response.status);
    }
    return payload;
  }

  private credentialsFromToken(payload: TokenPayload, previous?: CodexCredentials): CodexCredentials {
    const accessToken = asString(payload.access_token) || previous?.accessToken || "";
    const refreshToken = asString(payload.refresh_token) || previous?.refreshToken || "";
    const idToken = asString(payload.id_token) || previous?.idToken || "";
    if (!accessToken) throw new Error("OpenAI 授权响应缺少 Access Token。");

    const claims = decodeJwt(idToken) ?? decodeJwt(accessToken);
    const auth = claims?.["https://api.openai.com/auth"];
    const accountId = asString(auth?.chatgpt_account_id) || previous?.accountId || "";
    if (!accountId) throw new Error("无法识别 ChatGPT 账号，请重新授权。");
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    return {
      accessToken,
      refreshToken,
      idToken,
      expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
      email: asString(claims?.email) || previous?.email || "",
      accountId,
      planType: asString(auth?.chatgpt_plan_type) || previous?.planType || "",
      reauthRequired: false
    };
  }

  private waitForAuthorizationCode(state: string, openBrowser: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, code?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(code || "");
      };
      const timeout = setTimeout(() => finish(new Error("登录等待超时，请重新发起授权。")), AUTH_TIMEOUT_MS);
      const server = createServer((request, response) => {
        const url = new URL(request.url || "/", REDIRECT_URI);
        if (url.pathname !== "/auth/callback") {
          response.writeHead(404).end();
          return;
        }
        const returnedState = url.searchParams.get("state") || "";
        const code = url.searchParams.get("code") || "";
        const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error") || "";
        const stateMatches = safeEqual(state, returnedState);
        const ok = stateMatches && Boolean(code) && !oauthError;
        response.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(callbackPage(ok, oauthError || (stateMatches ? "授权未返回登录凭据" : "授权状态校验失败")));
        if (!stateMatches) finish(new Error("授权状态校验失败，请重新登录。"));
        else if (oauthError) finish(new Error(`OpenAI 授权未完成：${oauthError}`));
        else if (!code) finish(new Error("OpenAI 授权未返回登录凭据。"));
        else finish(undefined, code);
      });
      server.on("error", (error) => finish(new Error(`无法启动本机授权回调：${error.message}`)));
      server.listen(CALLBACK_PORT, "localhost", () => {
        this.callbackServer = server;
        void openBrowser().catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
      });
    });
  }

  private closeCallbackServer(): void {
    this.callbackServer?.close();
    this.callbackServer = null;
  }

  private toStatus(credentials: CodexCredentials | null, state: CodexAuthStatus["state"]): CodexAuthStatus {
    if (!credentials) return { state };
    return {
      state,
      email: credentials.email || undefined,
      accountId: credentials.accountId,
      planType: credentials.planType || undefined,
      expiresAt: new Date(credentials.expiresAt).toISOString()
    };
  }
}

export function buildAuthorizationUrl(state: string, challenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email offline_access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true"
  }).toString();
  return url.toString();
}

function decodeJwt(token: string): AuthClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AuthClaims;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function callbackPage(ok: boolean, detail: string): string {
  const title = ok ? "登录完成" : "登录未完成";
  const message = ok ? "你可以关闭此页面并返回 Iterlay。" : escapeHtml(detail);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f5f5f5;color:#202020;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.wrap{max-width:480px;margin:18vh auto;padding:28px;background:#fff;border:1px solid #ddd;border-radius:8px}h1{margin:0 0 10px;font-size:22px}p{margin:0;color:#666;line-height:1.7}</style></head><body><main class="wrap"><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] || character);
}
