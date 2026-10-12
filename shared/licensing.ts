export const LICENSE_STATES = [
  "UNACTIVATED",
  "TRIAL_ACTIVE",
  "LICENSED",
  "OFFLINE_GRACE",
  "RESTRICTED",
  "REVOKED",
  "VERSION_BLOCKED",
  "UPDATE_REQUIRED"
] as const;

export type LicenseState = (typeof LICENSE_STATES)[number];
export type GrantResponseState = Exclude<LicenseState, "UNACTIVATED">;
export type GrantSubjectType = "license" | "trial";
export type LicensePlanType = "perpetual" | "annual";
export type SupportedLicensePlatform = "darwin" | "win32";

export const ITERLAY_PRODUCT_ID = "iterlay";

export const LICENSE_CHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1_000;
export const LICENSE_OFFLINE_VALIDITY_MS = 45 * 24 * 60 * 60 * 1_000;
export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1_000;
export const DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1_000;

interface BaseGrantPayload {
  subjectType: GrantSubjectType;
  productId: string;
  deviceId: string;
  devicePublicKey: string;
  issuedAt: string;
  nextCheckAt: string;
  offlineValidUntil: string;
}

export interface LicenseGrantPayload extends BaseGrantPayload {
  subjectType: "license";
  licenseId: string;
  planType: LicensePlanType;
  maxMajorVersion: number | null;
  validUntil?: string | null;
  trialId?: never;
}

export interface TrialGrantPayload extends BaseGrantPayload {
  subjectType: "trial";
  trialId: string;
  licenseId?: never;
  planType?: never;
  maxMajorVersion?: never;
  validUntil?: never;
}

export type GrantPayload = LicenseGrantPayload | TrialGrantPayload;

export interface CompactGrantHeader {
  alg: "EdDSA";
  typ: "ITERLAY-GRANT";
  v: 1;
  kid: string;
}

export interface DeviceRequest {
  deviceFingerprint: string;
  devicePublicKey: string;
  deviceName?: string;
  platform: SupportedLicensePlatform;
  appVersion: string;
}

export interface ActivationInput extends DeviceRequest {
  email: string;
  licenseKey: string;
}

export interface CheckInput {
  grant: string;
  nonce: string;
  proof: string;
  appVersion: string;
}

export interface PortalDeviceLink {
  url: string;
  expiresAt: string;
}

export interface SignedRequestAuth {
  grant: string;
  nonce: string;
  proof: string;
  appVersion: string;
  purpose: string;
  bodyHash: string;
}

export interface GrantResponse {
  grant: string;
  state: GrantResponseState;
  serverTime: string;
  license?: {
    email: string;
  };
  device?: {
    createdAt: string;
  };
  update?: RequiredAppUpdate;
}

export interface RequiredAppUpdate {
  required: true;
  forced: true;
  targetVersion: string;
  minimumVersion: string;
  latestVersion: string;
  downloadUrl: string;
}

export type LicenseAccessMode = "full" | "read-only";

export interface LicenseCapabilities {
  mode: LicenseAccessMode;
  canView: boolean;
  canExport: boolean;
  canGenerate: boolean;
  canEdit: boolean;
  canImport: boolean;
  canStartTrial: boolean;
  canActivate: boolean;
}

export interface ClockObservation {
  /** Persist this high-water mark outside the core, ideally in protected app storage. */
  lastObservedAt: string;
}

export interface LicenseStatusSnapshot {
  state: LicenseState;
  reason: string;
  capabilities: LicenseCapabilities;
  licenseEmail?: string;
  activatedAt?: string;
  nextCheckAt?: string;
  offlineValidUntil?: string;
  planType?: LicensePlanType;
  maxMajorVersion?: number | null;
  validUntil?: string | null;
  serverTime?: string;
  update?: RequiredAppUpdate;
  message?: string;
}
