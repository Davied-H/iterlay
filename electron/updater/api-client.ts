import {
  isUpdateManifest,
  type UpdateArch,
  type UpdateChannel,
  type UpdateManifest,
  type UpdatePlatform
} from "../../shared/app-update.js";

export interface UpdateCheckQuery {
  platform: UpdatePlatform;
  arch: UpdateArch;
  currentVersion: string;
  channel?: UpdateChannel;
  /** 透传设备标识，供后台按设备做灰度放量。 */
  deviceId?: string;
}

export interface UpdateApiClient {
  /** 返回该平台当前可用的最新版本，后台未发布时返回 null。 */
  fetchLatest(query: UpdateCheckQuery): Promise<UpdateManifest | null>;
}

export class UpdateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    message = `更新服务请求失败 (${status})`
  ) {
    super(message);
    this.name = "UpdateApiError";
  }
}

export type UpdateFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class HttpUpdateApiClient implements UpdateApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly fetcher: UpdateFetch = globalThis.fetch) {
    if (!baseUrl.trim()) throw new TypeError("更新服务地址不能为空");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async fetchLatest(query: UpdateCheckQuery): Promise<UpdateManifest | null> {
    const params = new URLSearchParams({
      platform: query.platform,
      arch: query.arch,
      appVersion: query.currentVersion
    });
    if (query.channel) params.set("channel", query.channel);
    if (query.deviceId) params.set("deviceId", query.deviceId);

    // appVersion 用于让 iterlay-manage 优先返回强制更新目标。
    const response = await this.fetcher(`${this.baseUrl}/releases/latest?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000)
    });
    // 204/404 统一视为「该平台暂无可用版本」。
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw await toApiError(response);

    const text = await response.text();
    if (!text.trim()) return null;
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new UpdateApiError(response.status, "INVALID_RESPONSE", "更新服务返回了无效数据");
    }
    if (value === null) return null;
    if (!isUpdateManifest(value)) {
      throw new UpdateApiError(response.status, "INVALID_RESPONSE", "更新服务返回了无效数据");
    }
    return value;
  }
}

async function toApiError(response: Response): Promise<UpdateApiError> {
  const body = (await response
    .text()
    .then((text) => (text ? (JSON.parse(text) as unknown) : undefined))
    .catch(() => undefined)) as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return new UpdateApiError(
      response.status,
      typeof body.code === "string" ? body.code : undefined,
      typeof body.message === "string" ? body.message : undefined
    );
  }
  return new UpdateApiError(response.status);
}
