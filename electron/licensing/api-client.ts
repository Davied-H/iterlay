import type {
  ActivationInput,
  CheckInput,
  DeviceRequest,
  GrantResponse,
  PortalDeviceLink
} from "../../shared/licensing.js";

export interface ActivationApiClient {
  startTrial(device: DeviceRequest): Promise<GrantResponse>;
  activateLicense(input: ActivationInput): Promise<GrantResponse>;
  checkActivation(input: CheckInput): Promise<GrantResponse>;
  deactivateCurrentDevice(input: CheckInput): Promise<void>;
  createPortalDeviceLink(input: CheckInput): Promise<PortalDeviceLink>;
}

export interface ActivationApiErrorBody {
  code?: string;
  message?: string;
  requestId?: string;
}

export class ActivationApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    message = `授权服务请求失败 (${status})`,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ActivationApiError";
  }
}

export type LicensingFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class HttpActivationApiClient implements ActivationApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetcher: LicensingFetch = globalThis.fetch,
    private readonly timeoutMs = 8_000
  ) {
    if (!baseUrl.trim()) throw new TypeError("授权服务地址不能为空");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  startTrial(device: DeviceRequest): Promise<GrantResponse> {
    return this.requestGrant("/trials/start", device);
  }

  activateLicense(input: ActivationInput): Promise<GrantResponse> {
    return this.requestGrant("/activations/activate", input);
  }

  checkActivation(input: CheckInput): Promise<GrantResponse> {
    return this.requestGrant("/activations/check", input);
  }

  async deactivateCurrentDevice(input: CheckInput): Promise<void> {
    const response = await this.post("/activations/deactivate", input);
    if (response.status !== 204) throw await toApiError(response);
  }

  async createPortalDeviceLink(input: CheckInput): Promise<PortalDeviceLink> {
    const response = await this.post("/portal/device-links", input);
    if (!response.ok) throw await toApiError(response);
    const value = await parseJson(response);
    if (!isPortalDeviceLink(value)) {
      throw new ActivationApiError(response.status, "INVALID_RESPONSE", "客户中心返回了无效登录链接");
    }
    return value;
  }

  private async requestGrant(path: string, body: unknown): Promise<GrantResponse> {
    const response = await this.post(path, body);
    if (!response.ok) throw await toApiError(response);
    const value = await parseJson(response);
    if (!isGrantResponse(value)) throw new ActivationApiError(response.status, "INVALID_RESPONSE", "授权服务返回了无效数据");
    return value;
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
  }
}

async function toApiError(response: Response): Promise<ActivationApiError> {
  const body = await parseJson(response).catch(() => undefined);
  if (isRecord(body)) {
    return new ActivationApiError(
      response.status,
      typeof body.code === "string" ? body.code : undefined,
      typeof body.message === "string" ? body.message : undefined,
      typeof body.requestId === "string" ? body.requestId : undefined
    );
  }
  return new ActivationApiError(response.status);
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) throw new Error("empty response");
  return JSON.parse(text) as unknown;
}

function isGrantResponse(value: unknown): value is GrantResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.grant === "string" &&
    typeof value.serverTime === "string" &&
    isLicenseMetadata(value.license) &&
    isDeviceMetadata(value.device) &&
    isRequiredUpdate(value.update, value.state) &&
    ["TRIAL_ACTIVE", "LICENSED", "OFFLINE_GRACE", "RESTRICTED", "REVOKED", "VERSION_BLOCKED", "UPDATE_REQUIRED"].includes(
      String(value.state)
    ) &&
    Number.isFinite(Date.parse(value.serverTime))
  );
}

function isPortalDeviceLink(value: unknown): value is PortalDeviceLink {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.expiresAt !== "string") return false;
  try {
    const url = new URL(value.url);
    return (url.protocol === "https:" || url.protocol === "http:") && Number.isFinite(Date.parse(value.expiresAt));
  } catch {
    return false;
  }
}

function isRequiredUpdate(value: unknown, state: unknown): boolean {
  if (state !== "UPDATE_REQUIRED") return value === undefined;
  if (!isRecord(value)) return false;
  return (
    value.required === true &&
    value.forced === true &&
    typeof value.targetVersion === "string" &&
    typeof value.minimumVersion === "string" &&
    typeof value.latestVersion === "string" &&
    typeof value.downloadUrl === "string" &&
    /^https?:\/\//i.test(value.downloadUrl)
  );
}

function isLicenseMetadata(value: unknown): boolean {
  return value === undefined || (isRecord(value) && typeof value.email === "string" && value.email.trim().length > 0);
}

function isDeviceMetadata(value: unknown): boolean {
  return value === undefined || (isRecord(value) && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
