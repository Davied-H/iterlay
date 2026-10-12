import type { SignedRequestAuth } from "../shared/licensing.js";
import type { LicenseService } from "./licensing/service.js";

type FetchLike = typeof fetch;

interface ManagerShareSessionResponse {
  sessionId: string;
  secret: string;
  url: string;
  expiresAt: number;
}

interface RelayRequest {
  requestId: string;
  method: "GET";
  path: string;
}

interface ActiveShare {
  sessionId: string;
  secret: string;
  localBaseUrl: string;
  controller: AbortController;
}

export interface ManagerPublicShareResult {
  url: string;
  expiresAt: number;
}

const RELAY_WORKER_COUNT = 4;
const MAX_RELAY_RESPONSE_BYTES = 32 * 1024 * 1024;

export class ManagerPublicShareClient {
  private readonly baseUrl: string;
  private active: ActiveShare | null = null;
  private startController: AbortController | null = null;

  constructor(
    private readonly license: Pick<LicenseService, "createSignedRequest">,
    apiBaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async start(localBaseUrl: string): Promise<ManagerPublicShareResult> {
    await this.stop();
    const startController = new AbortController();
    this.startController = startController;
    try {
      const serializedPayload = "{}";
      const auth: SignedRequestAuth = await this.license.createSignedRequest("public-share.create", serializedPayload);
      if (startController.signal.aborted) throw new DOMException("Aborted", "AbortError");
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/public-shares`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: `{"auth":${JSON.stringify(auth)},"payload":${serializedPayload}}`,
          signal: AbortSignal.any([startController.signal, AbortSignal.timeout(10_000)])
        });
      } catch (error) {
        if (startController.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        throw new Error("暂时无法连接 Manager 公网分享服务，请检查网络后重试。", { cause: error });
      }
      if (!response.ok) throw await managerShareError(response);
      const value = await response.json() as Partial<ManagerShareSessionResponse>;
      if (
        typeof value.sessionId !== "string" || !value.sessionId ||
        typeof value.secret !== "string" || !value.secret ||
        typeof value.url !== "string" || !/^https?:\/\//i.test(value.url) ||
        typeof value.expiresAt !== "number"
      ) {
        throw new Error("Manager 返回了无效的公网分享会话。");
      }
      if (startController.signal.aborted || this.startController !== startController) {
        throw new DOMException("Aborted", "AbortError");
      }

      const active: ActiveShare = {
        sessionId: value.sessionId,
        secret: value.secret,
        localBaseUrl: localBaseUrl.replace(/\/+$/, ""),
        controller: new AbortController()
      };
      this.startController = null;
      this.active = active;
      for (let index = 0; index < RELAY_WORKER_COUNT; index += 1) void this.runRelayWorker(active);
      return { url: value.url, expiresAt: value.expiresAt };
    } finally {
      if (this.startController === startController) this.startController = null;
    }
  }

  async stop(): Promise<void> {
    this.startController?.abort();
    this.startController = null;
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.controller.abort();
    try {
      await this.fetchImpl(`${this.baseUrl}/public-shares/${encodeURIComponent(active.sessionId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${active.secret}` },
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      // 本地转发已经停止；Manager 也会拒绝没有活跃轮询端的会话。
    }
  }

  private async runRelayWorker(active: ActiveShare): Promise<void> {
    while (this.active === active && !active.controller.signal.aborted) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/public-shares/${encodeURIComponent(active.sessionId)}/poll`, {
          method: "POST",
          headers: { Authorization: `Bearer ${active.secret}` },
          signal: active.controller.signal
        });
        if (response.status === 204) continue;
        if (response.status === 410 || response.status === 401) return;
        if (!response.ok) {
          await abortableDelay(500, active.controller.signal);
          continue;
        }
        const request = await response.json() as Partial<RelayRequest>;
        if (
          request.method !== "GET" || typeof request.requestId !== "string" || !request.requestId ||
          typeof request.path !== "string" || !isSafeRelayPath(request.path)
        ) continue;
        await this.forwardRequest(active, request as RelayRequest);
      } catch {
        if (active.controller.signal.aborted) return;
        await abortableDelay(500, active.controller.signal).catch(() => undefined);
      }
    }
  }

  private async forwardRequest(active: ActiveShare, request: RelayRequest): Promise<void> {
    let status = 502;
    let headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" };
    let body = Buffer.from("Unable to reach shared content", "utf8");
    try {
      const localResponse = await this.fetchImpl(`${active.localBaseUrl}${request.path}`, {
        method: "GET",
        signal: active.controller.signal
      });
      const bytes = Buffer.from(await localResponse.arrayBuffer());
      if (bytes.length > MAX_RELAY_RESPONSE_BYTES) throw new Error("分享文件超过公网中继大小限制。");
      status = localResponse.status;
      body = bytes;
      headers = pickRelayHeaders(localResponse.headers);
    } catch {
      if (active.controller.signal.aborted) return;
    }

    await this.fetchImpl(`${this.baseUrl}/public-shares/${encodeURIComponent(active.sessionId)}/responses`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${active.secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requestId: request.requestId,
        status,
        headers,
        bodyBase64: body.toString("base64")
      }),
      signal: active.controller.signal
    });
  }
}

function isSafeRelayPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && value.length <= 4_096;
}

function pickRelayHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const value = headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

async function managerShareError(response: Response): Promise<Error> {
  try {
    const value = await response.json() as { message?: unknown };
    if (typeof value.message === "string" && value.message.trim()) return new Error(value.message.trim());
  } catch {
    // Fall through to the stable status message.
  }
  return new Error(`Manager 公网分享服务请求失败 (${response.status})。`);
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
