import { app } from "electron";
import { compareVersions } from "../../shared/app-update.js";
import type {
  GrantResponse,
  GrantResponseState,
  LicenseCapabilities,
  LicenseStatusSnapshot
} from "../../shared/licensing.js";
import { ITERLAY_PRODUCT_ID } from "../../shared/licensing.js";
import { ActivationApiError, HttpActivationApiClient, type ActivationApiClient } from "./api-client.js";
import {
  createCheckInput,
  createDeviceRequest,
  createSignedRequestAuth,
  generateDeviceKeyPair,
  HashedDeviceFingerprintProvider,
  isCanonicalDeviceKeyPair,
  type DeviceFingerprintProvider
} from "./device.js";
import { verifyCompactGrant, type GrantKeyring, type VerifiedGrant } from "./grant.js";
import { evaluateLicenseState } from "./state-machine.js";
import { SecureLicenseStore, type StoredLicenseState } from "./store.js";
import { currentDeviceName, currentLicensePlatform, SystemDeviceFingerprintSource } from "./system-device.js";
import type { SignedRequestAuth } from "../../shared/licensing.js";

type RestrictedCapability = "generate" | "edit" | "import";

export interface LicenseServiceOptions {
  dataDir: string;
  apiBaseUrl: string;
  keyring: GrantKeyring;
  apiClient?: ActivationApiClient;
  fingerprintProvider?: DeviceFingerprintProvider;
  currentVersion?: string;
  now?: () => Date;
}

export class LicenseService {
  private readonly store: SecureLicenseStore;
  private readonly api: ActivationApiClient;
  private readonly fingerprintProvider: DeviceFingerprintProvider;
  private readonly currentVersion: string;
  private readonly now: () => Date;
  private persisted: StoredLicenseState | null = null;
  private snapshot: LicenseStatusSnapshot = unactivatedSnapshot();

  constructor(private readonly options: LicenseServiceOptions) {
    this.store = new SecureLicenseStore(options.dataDir);
    this.api = options.apiClient ?? new HttpActivationApiClient(options.apiBaseUrl);
    this.fingerprintProvider =
      options.fingerprintProvider ?? new HashedDeviceFingerprintProvider(new SystemDeviceFingerprintSource());
    this.currentVersion = options.currentVersion ?? app.getVersion();
    this.now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<LicenseStatusSnapshot> {
    await this.ensureIdentity();
    this.clearSatisfiedUpdateRequirement();
    this.refreshSnapshot();
    if (this.persisted) this.store.write(this.persisted);
    // 启动阶段只恢复本地授权，避免网络波动阻塞首个窗口；渲染层进入工作台后再后台复核。
    return this.getStatus();
  }

  getStatus(): LicenseStatusSnapshot {
    this.refreshSnapshot();
    return structuredClone(this.snapshot);
  }

  async getDeviceId(): Promise<string> {
	return (await this.ensureIdentity()).deviceId;
  }

  markCredentialRejected(message = "设备凭证已失效，请重新检查授权状态。"): LicenseStatusSnapshot {
    if (!this.persisted?.grant) return this.getStatus();
    // `invalid_credential` also covers request proof, nonce, and grant-key
    // verification failures. Only the activation check can authoritatively
    // report that the device binding was revoked.
    this.refreshSnapshot(message);
    return structuredClone(this.snapshot);
  }

  async startTrial(): Promise<LicenseStatusSnapshot> {
    const current = await this.ensureIdentity();
    const device = await this.buildDeviceRequest(current);
    return this.acceptGrant(await this.api.startTrial(device));
  }

  async activate(email: string, licenseKey: string): Promise<LicenseStatusSnapshot> {
    const current = await this.ensureIdentity();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !licenseKey.trim()) throw new Error("请输入购买邮箱和激活码。");
    const device = await this.buildDeviceRequest(current);
    return this.acceptGrant(
      await this.api.activateLicense({ ...device, email: normalizedEmail, licenseKey: licenseKey.trim() }),
      normalizedEmail
    );
  }

  async checkNow(): Promise<LicenseStatusSnapshot> {
    const current = await this.ensureIdentity();
    if (!current.grant) return this.getStatus();
    try {
      const input = createCheckInput(current.grant, this.currentVersion, current.devicePrivateKey);
      return await this.acceptGrant(await this.api.checkActivation(input));
    } catch (error) {
      if (error instanceof ActivationApiError) {
        const serverState = stateForApiError(error.code);
        if (serverState) {
          current.lastServerState = serverState;
          this.store.write(current);
          this.persisted = current;
          this.refreshSnapshot(error.message);
          return this.getStatus();
        }
      }
      this.refreshSnapshot("暂时无法连接授权服务，将按本地授权期限继续运行。");
      throw error;
    }
  }

  async deactivateCurrentDevice(): Promise<LicenseStatusSnapshot> {
    const current = await this.ensureIdentity();
    if (current.grant) {
      await this.api.deactivateCurrentDevice(
        createCheckInput(current.grant, this.currentVersion, current.devicePrivateKey)
      );
    }
    const cleared: StoredLicenseState = {
      version: 1,
      deviceId: current.deviceId,
      devicePublicKey: current.devicePublicKey,
      devicePrivateKey: current.devicePrivateKey,
      clockObservation: current.clockObservation
    };
    this.store.write(cleared);
    this.persisted = cleared;
    this.refreshSnapshot();
    return this.getStatus();
  }

  async createPortalDeviceLink(): Promise<string> {
    const current = await this.ensureIdentity();
    if (!current.grant) throw new Error("请先激活 Iterlay 授权。");
    const link = await this.api.createPortalDeviceLink(
      createCheckInput(current.grant, this.currentVersion, current.devicePrivateKey)
    );
    return link.url;
  }

  assertCapability(capability: RestrictedCapability): void {
    const current = this.getStatus();
    const allowed = capabilityAllowed(current.capabilities, capability);
    if (!allowed) {
      throw new Error("当前授权为只读状态，请激活 Iterlay 后继续操作。");
    }
  }

  async ensureCapability(capability: RestrictedCapability, startTrialWhenUnactivated = false): Promise<void> {
    if (this.getStatus().capabilities.mode === "full") return;
    if (startTrialWhenUnactivated && this.snapshot.state === "UNACTIVATED") {
      const started = await this.startTrial();
      if (capabilityAllowed(started.capabilities, capability)) return;
    }
    this.assertCapability(capability);
  }

  async createSignedRequest(purpose: string, payload: string | Buffer): Promise<SignedRequestAuth> {
    let current = await this.ensureIdentity();
    if (!current.grant) {
      await this.startTrial();
      current = await this.ensureIdentity();
    }
    if (!current.grant) throw new Error("无法获取官方 Provider 所需的设备凭证。");
    return createSignedRequestAuth(
      current.grant,
      this.currentVersion,
      purpose,
      payload,
      current.devicePrivateKey
    );
  }

  private async ensureIdentity(): Promise<StoredLicenseState> {
    if (
      this.persisted &&
      isCanonicalDeviceKeyPair({
        publicKey: this.persisted.devicePublicKey,
        privateKey: this.persisted.devicePrivateKey
      })
    ) {
      return this.persisted;
    }
    const deviceId = await this.fingerprintProvider.getDeviceId();
    let stored = this.persisted ?? this.store.read();
    const hasValidIdentity =
      stored?.deviceId === deviceId &&
      isCanonicalDeviceKeyPair({
        publicKey: stored.devicePublicKey,
        privateKey: stored.devicePrivateKey
      });
    if (hasValidIdentity) {
      this.persisted = stored;
      return stored;
    }
    const keys = generateDeviceKeyPair();
    const migrated: StoredLicenseState = {
      version: 1,
      deviceId,
      devicePublicKey: keys.publicKey,
      devicePrivateKey: keys.privateKey,
      ...preservedClockObservation(stored)
    };
    this.store.write(migrated);
    this.persisted = migrated;
    return migrated;
  }

  private buildDeviceRequest(current: StoredLicenseState) {
    return createDeviceRequest({
      fingerprintProvider: this.fingerprintProvider,
      devicePublicKey: current.devicePublicKey,
      deviceName: currentDeviceName(),
      platform: currentLicensePlatform(),
      appVersion: this.currentVersion
    });
  }

  private acceptGrant(response: GrantResponse, activationEmail?: string): LicenseStatusSnapshot {
    if (!this.persisted) throw new Error("授权设备尚未初始化。");
    const verified = this.verifyGrant(response.grant, this.persisted);
    const responseEmail = response.license?.email.trim().toLowerCase();
    const responseActivatedAt = normalizedTime(response.device?.createdAt);
    const activationMetadata = verified.payload.subjectType === "license"
      ? {
          ...(responseEmail || activationEmail ? { licenseEmail: responseEmail || activationEmail } : {}),
          ...(responseActivatedAt || activationEmail
            ? { activatedAt: responseActivatedAt || verified.payload.issuedAt }
            : {})
        }
      : {};
    this.persisted = {
      ...this.persisted,
      ...activationMetadata,
      grant: response.grant,
      lastServerState: response.state,
      update: response.state === "UPDATE_REQUIRED" ? response.update : undefined,
      lastServerTime: response.serverTime,
      clockObservation: { lastObservedAt: latestTime(response.serverTime, this.persisted.clockObservation?.lastObservedAt) }
    };
    this.store.write(this.persisted);
    this.refreshSnapshot(undefined, verified);
    return this.getStatus();
  }

  private verifyGrant(grant: string, stored: StoredLicenseState): VerifiedGrant {
    return verifyCompactGrant(grant, this.options.keyring, {
      productId: ITERLAY_PRODUCT_ID,
      deviceId: stored.deviceId,
      devicePublicKey: stored.devicePublicKey
    });
  }

  private refreshSnapshot(message?: string, verifiedGrant?: VerifiedGrant): void {
    const current = this.persisted;
    if (!current?.grant) {
      this.snapshot = { ...unactivatedSnapshot(), ...(message ? { message } : {}) };
      return;
    }
    try {
      const verified = verifiedGrant ?? this.verifyGrant(current.grant, current);
      const evaluation = evaluateLicenseState({
        grant: verified,
        currentVersion: this.currentVersion,
        expectedDeviceId: current.deviceId,
        expectedProductId: ITERLAY_PRODUCT_ID,
        now: this.now(),
        lastClockObservation: current.clockObservation,
        lastServerState: current.lastServerState
      });
      current.clockObservation = evaluation.clockObservation;
      const payload = verified.payload;
      this.snapshot = {
        state: evaluation.state,
        reason: evaluation.reason,
        capabilities: evaluation.capabilities,
        nextCheckAt: evaluation.nextCheckAt,
        offlineValidUntil: evaluation.offlineValidUntil,
        serverTime: current.lastServerTime,
        ...(evaluation.state === "UPDATE_REQUIRED" && current.update ? { update: current.update } : {}),
        ...(payload.subjectType === "license"
          ? {
              ...(current.licenseEmail ? { licenseEmail: current.licenseEmail } : {}),
              ...(current.activatedAt ? { activatedAt: current.activatedAt } : {}),
              planType: payload.planType,
              maxMajorVersion: payload.maxMajorVersion,
              validUntil: payload.validUntil
            }
          : {}),
        ...(message ? { message } : {})
      };
    } catch (error) {
      this.snapshot = restrictedSnapshot(error instanceof Error ? error.message : "授权凭证无效。");
    }
  }

  private clearSatisfiedUpdateRequirement(): void {
    if (
      !this.persisted ||
      this.persisted.lastServerState !== "UPDATE_REQUIRED" ||
      !this.persisted.update ||
      compareVersions(this.currentVersion, this.persisted.update.targetVersion) < 0
    ) {
      return;
    }
    this.persisted = {
      ...this.persisted,
      lastServerState: undefined,
      update: undefined
    };
    this.store.write(this.persisted);
  }
}

function preservedClockObservation(
  stored: StoredLicenseState | null | undefined
): Pick<StoredLicenseState, "clockObservation"> {
  const lastObservedAt = stored?.clockObservation?.lastObservedAt;
  if (typeof lastObservedAt !== "string") return {};
  const timestamp = Date.parse(lastObservedAt);
  if (!Number.isFinite(timestamp)) return {};
  return { clockObservation: { lastObservedAt: new Date(timestamp).toISOString() } };
}

function unactivatedSnapshot(): LicenseStatusSnapshot {
  return {
    state: "UNACTIVATED",
    reason: "no_grant",
    capabilities: {
      mode: "read-only",
      canView: true,
      canExport: true,
      canGenerate: false,
      canEdit: false,
      canImport: false,
      canStartTrial: true,
      canActivate: true
    }
  };
}

function restrictedSnapshot(message: string): LicenseStatusSnapshot {
  const value = unactivatedSnapshot();
  return { ...value, state: "RESTRICTED", reason: "invalid_grant", message };
}

function capabilityAllowed(capabilities: LicenseCapabilities, capability: RestrictedCapability): boolean {
  if (capability === "generate") return capabilities.canGenerate;
  if (capability === "edit") return capabilities.canEdit;
  return capabilities.canImport;
}

function stateForApiError(code?: string): GrantResponseState | undefined {
  switch (code) {
    case "LICENSE_REVOKED":
    case "license_revoked":
      return "REVOKED";
    case "LICENSE_EXPIRED":
    case "license_expired":
      return "RESTRICTED";
    case "VERSION_BLOCKED":
    case "version_blocked":
      return "VERSION_BLOCKED";
    default:
      return undefined;
  }
}

function latestTime(left: string, right?: string): string {
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function normalizedTime(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
