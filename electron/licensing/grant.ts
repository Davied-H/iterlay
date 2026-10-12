import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type {
  CompactGrantHeader,
  GrantPayload,
  LicenseGrantPayload,
  TrialGrantPayload
} from "../../shared/licensing.js";
import {
  ITERLAY_PRODUCT_ID,
  LICENSE_CHECK_INTERVAL_MS,
  LICENSE_OFFLINE_VALIDITY_MS,
  TRIAL_DURATION_MS
} from "../../shared/licensing.js";

export type GrantKey = KeyObject | string | Buffer;
export type GrantKeyring = Readonly<Record<string, GrantKey>> | ReadonlyMap<string, GrantKey>;

export interface VerifiedGrant {
  compact: string;
  header: CompactGrantHeader;
  payload: GrantPayload;
}

export interface GrantExpectations {
  productId?: string;
  deviceId?: string;
  devicePublicKey?: string;
}

export type GrantVerificationErrorCode =
  | "MALFORMED_GRANT"
  | "INVALID_HEADER"
  | "UNKNOWN_KEY"
  | "INVALID_SIGNATURE"
  | "INVALID_PAYLOAD"
  | "GRANT_SCOPE_MISMATCH";

export class GrantVerificationError extends Error {
  constructor(
    readonly code: GrantVerificationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GrantVerificationError";
  }
}

export function signCompactGrant(payload: GrantPayload, kid: string, privateKey: GrantKey): string {
  const validatedPayload = parseGrantPayload(payload);
  const header: CompactGrantHeader = { alg: "EdDSA", typ: "ITERLAY-GRANT", v: 1, kid };
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(validatedPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(null, Buffer.from(signingInput, "utf8"), toPrivateKey(privateKey));
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function verifyCompactGrant(
  compact: string,
  keyring: GrantKeyring,
  expectations: GrantExpectations = {}
): VerifiedGrant {
  const segments = compact.split(".");
  if (segments.length !== 3 || segments.some((segment) => !isBase64Url(segment))) {
    throw new GrantVerificationError("MALFORMED_GRANT", "授权凭证格式无效");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseHeader(decodeJson(encodedHeader, "INVALID_HEADER"));
  const key = getKey(keyring, header.kid);
  if (!key) {
    throw new GrantVerificationError("UNKNOWN_KEY", `找不到授权签名密钥: ${header.kid}`);
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = decodeBase64Url(encodedSignature, "MALFORMED_GRANT");
  const signatureValid = verify(null, Buffer.from(signingInput, "utf8"), toPublicKey(key), signature);
  if (!signatureValid) {
    throw new GrantVerificationError("INVALID_SIGNATURE", "授权凭证签名无效");
  }

  const payload = parseGrantPayload(decodeJson(encodedPayload, "INVALID_PAYLOAD"));
  const expectedProductId = expectations.productId ?? ITERLAY_PRODUCT_ID;
  if (payload.productId !== expectedProductId) {
    throw new GrantVerificationError("GRANT_SCOPE_MISMATCH", "授权凭证不属于当前产品");
  }
  if (expectations.deviceId !== undefined && payload.deviceId !== expectations.deviceId) {
    throw new GrantVerificationError("GRANT_SCOPE_MISMATCH", "授权凭证不属于当前设备");
  }
  if (expectations.devicePublicKey !== undefined && payload.devicePublicKey !== expectations.devicePublicKey) {
    throw new GrantVerificationError("GRANT_SCOPE_MISMATCH", "授权凭证设备公钥不匹配");
  }

  return { compact, header, payload };
}

export function createLicenseGrantSchedule(issuedAt: Date | string | number): {
  nextCheckAt: string;
  offlineValidUntil: string;
} {
  const issuedAtMs = toTimestamp(issuedAt, "issuedAt");
  return {
    nextCheckAt: new Date(issuedAtMs + LICENSE_CHECK_INTERVAL_MS).toISOString(),
    offlineValidUntil: new Date(issuedAtMs + LICENSE_OFFLINE_VALIDITY_MS).toISOString()
  };
}

export function createTrialGrantSchedule(issuedAt: Date | string | number): {
  nextCheckAt: string;
  offlineValidUntil: string;
} {
  const issuedAtMs = toTimestamp(issuedAt, "issuedAt");
  const expiresAt = new Date(issuedAtMs + TRIAL_DURATION_MS).toISOString();
  return { nextCheckAt: expiresAt, offlineValidUntil: expiresAt };
}

function parseHeader(value: unknown): CompactGrantHeader {
  if (!isRecord(value) || !hasOnlyKeys(value, ["alg", "typ", "v", "kid"])) {
    throw new GrantVerificationError("INVALID_HEADER", "授权凭证头无效");
  }
  if (value.alg !== "EdDSA" || value.typ !== "ITERLAY-GRANT" || value.v !== 1 || !isNonEmptyString(value.kid)) {
    throw new GrantVerificationError("INVALID_HEADER", "授权凭证头不受支持");
  }
  return { alg: "EdDSA", typ: "ITERLAY-GRANT", v: 1, kid: value.kid };
}

function parseGrantPayload(value: unknown): GrantPayload {
  if (!isRecord(value)) {
    throw new GrantVerificationError("INVALID_PAYLOAD", "授权凭证内容无效");
  }
  if (value.subjectType === "license") return parseLicensePayload(value);
  if (value.subjectType === "trial") return parseTrialPayload(value);
  throw new GrantVerificationError("INVALID_PAYLOAD", "未知的授权主体类型");
}

function parseLicensePayload(value: Record<string, unknown>): LicenseGrantPayload {
  const allowedKeys = [
    "subjectType",
    "productId",
    "licenseId",
    "deviceId",
    "devicePublicKey",
    "planType",
    "maxMajorVersion",
    "validUntil",
    "issuedAt",
    "nextCheckAt",
    "offlineValidUntil"
  ];
  if (!hasOnlyKeys(value, allowedKeys)) invalidPayload("正式授权包含未知字段");
  if (!isNonEmptyString(value.licenseId)) invalidPayload("licenseId 无效");
  const base = parseBasePayload(value);
  if (value.planType !== "perpetual" && value.planType !== "annual") invalidPayload("planType 无效");
  if (value.maxMajorVersion !== null && (!Number.isSafeInteger(value.maxMajorVersion) || Number(value.maxMajorVersion) < 1)) {
    invalidPayload("maxMajorVersion 无效");
  }
  if (value.validUntil !== undefined && value.validUntil !== null) assertIsoTime(value.validUntil, "validUntil");
  if (value.planType === "annual" && (value.validUntil === undefined || value.validUntil === null)) {
    invalidPayload("年付授权必须包含 validUntil");
  }
  if (value.planType === "perpetual" && value.validUntil !== undefined && value.validUntil !== null) {
    invalidPayload("永久授权不能包含 validUntil");
  }
  assertLicenseSchedule(base);

  return {
    ...base,
    subjectType: "license",
    licenseId: value.licenseId,
    planType: value.planType,
    maxMajorVersion: value.maxMajorVersion as number | null,
    ...(value.validUntil === undefined ? {} : { validUntil: value.validUntil as string | null })
  };
}

function parseTrialPayload(value: Record<string, unknown>): TrialGrantPayload {
  const allowedKeys = [
    "subjectType",
    "productId",
    "trialId",
    "deviceId",
    "devicePublicKey",
    "issuedAt",
    "nextCheckAt",
    "offlineValidUntil"
  ];
  if (!hasOnlyKeys(value, allowedKeys)) invalidPayload("试用授权包含未知字段");
  if (!isNonEmptyString(value.trialId)) invalidPayload("trialId 无效");
  const base = parseBasePayload(value);
  const issuedAtMs = Date.parse(base.issuedAt);
  const nextCheckAtMs = Date.parse(base.nextCheckAt);
  const expiresAtMs = Date.parse(base.offlineValidUntil);
  if (nextCheckAtMs < issuedAtMs || expiresAtMs < nextCheckAtMs || expiresAtMs - issuedAtMs > TRIAL_DURATION_MS) {
    invalidPayload("试用授权期限无效");
  }
  return { ...base, subjectType: "trial", trialId: value.trialId };
}

function parseBasePayload(value: Record<string, unknown>): Omit<TrialGrantPayload, "subjectType" | "trialId"> {
  if (!isNonEmptyString(value.productId)) invalidPayload("productId 无效");
  if (!isNonEmptyString(value.deviceId)) invalidPayload("deviceId 无效");
  if (!isNonEmptyString(value.devicePublicKey)) invalidPayload("devicePublicKey 无效");
  assertIsoTime(value.issuedAt, "issuedAt");
  assertIsoTime(value.nextCheckAt, "nextCheckAt");
  assertIsoTime(value.offlineValidUntil, "offlineValidUntil");
  return {
    productId: value.productId,
    deviceId: value.deviceId,
    devicePublicKey: value.devicePublicKey,
    issuedAt: value.issuedAt,
    nextCheckAt: value.nextCheckAt,
    offlineValidUntil: value.offlineValidUntil
  };
}

function assertLicenseSchedule(payload: Pick<LicenseGrantPayload, "issuedAt" | "nextCheckAt" | "offlineValidUntil">): void {
  const issuedAtMs = Date.parse(payload.issuedAt);
  const nextCheckAtMs = Date.parse(payload.nextCheckAt);
  const offlineValidUntilMs = Date.parse(payload.offlineValidUntil);
  if (
    nextCheckAtMs < issuedAtMs ||
    offlineValidUntilMs < nextCheckAtMs ||
    nextCheckAtMs - issuedAtMs > LICENSE_CHECK_INTERVAL_MS ||
    offlineValidUntilMs - issuedAtMs > LICENSE_OFFLINE_VALIDITY_MS
  ) {
    invalidPayload("正式授权复核期限无效");
  }
}

function assertIsoTime(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    invalidPayload(`${field} 必须是带时区的 ISO 时间`);
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(segment: string, code: GrantVerificationErrorCode): unknown {
  try {
    return JSON.parse(decodeBase64Url(segment, code).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof GrantVerificationError) throw error;
    throw new GrantVerificationError(code, "授权凭证 JSON 无效");
  }
}

function decodeBase64Url(segment: string, code: GrantVerificationErrorCode): Buffer {
  if (!isBase64Url(segment)) throw new GrantVerificationError(code, "授权凭证编码无效");
  try {
    return Buffer.from(segment, "base64url");
  } catch {
    throw new GrantVerificationError(code, "授权凭证编码无效");
  }
}

function isBase64Url(value: string): boolean {
  return value.length > 0 && value.length % 4 !== 1 && /^[A-Za-z0-9_-]+$/.test(value);
}

function getKey(keyring: GrantKeyring, kid: string): GrantKey | undefined {
  if ("get" in keyring && typeof keyring.get === "function") {
    return (keyring as ReadonlyMap<string, GrantKey>).get(kid);
  }
  return (keyring as Readonly<Record<string, GrantKey>>)[kid];
}

function toPrivateKey(key: GrantKey): KeyObject {
  return key instanceof Object && "type" in key ? (key as KeyObject) : createPrivateKey(key);
}

function toPublicKey(key: GrantKey): KeyObject {
  if (key instanceof Object && "type" in key) return key as KeyObject;
  return createPublicKey(key);
}

function toTimestamp(value: Date | string | number, field: string): number {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${field} 不是有效时间`);
  return timestamp;
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidPayload(message: string): never {
  throw new GrantVerificationError("INVALID_PAYLOAD", message);
}
