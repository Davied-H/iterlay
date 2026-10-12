import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getVersion: () => "1.0.0" },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8")
  }
}));

import { isCanonicalDeviceKeyPair } from "../electron/licensing/device.js";
import { ActivationApiError, type ActivationApiClient } from "../electron/licensing/api-client.js";
import { createLicenseGrantSchedule, signCompactGrant } from "../electron/licensing/grant.js";
import { LicenseService } from "../electron/licensing/service.js";
import { SecureLicenseStore, type StoredLicenseState } from "../electron/licensing/store.js";
import type { ActivationInput, DeviceRequest, GrantResponse } from "../shared/licensing.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("license device identity migration", () => {
  it("regenerates a legacy public key and clears identity-bound server state", async () => {
    const directory = await temporaryDirectory();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const oldPrivateKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const oldPublicKey = publicKey.export({ type: "spki", format: "pem" }).toString();
    const observation = "2026-07-16T02:00:00.000Z";
    new SecureLicenseStore(directory).write({
      version: 1,
      deviceId: fingerprint("a"),
      devicePublicKey: oldPublicKey,
      devicePrivateKey: oldPrivateKey,
      grant: "old.header.signature",
      lastServerState: "REVOKED",
      lastServerTime: "2026-07-16T03:00:00.000Z",
      clockObservation: { lastObservedAt: observation }
    });

    const status = await service(directory, fingerprint("a")).initialize();
    const migrated = new SecureLicenseStore(directory).read();

    expect(status).toMatchObject({ state: "UNACTIVATED", reason: "no_grant" });
    expect(migrated).not.toBeNull();
    expect(isCanonicalDeviceKeyPair(keysOf(migrated!))).toBe(true);
    expect(migrated?.devicePublicKey).not.toBe(oldPublicKey);
    expect(migrated?.devicePrivateKey).not.toBe(oldPrivateKey);
    expect(migrated?.grant).toBeUndefined();
    expect(migrated?.lastServerState).toBeUndefined();
    expect(migrated?.lastServerTime).toBeUndefined();
    expect(migrated?.clockObservation).toEqual({ lastObservedAt: observation });
  });

  it("regenerates mismatched raw keys and drops an invalid clock observation", async () => {
    const directory = await temporaryDirectory();
    const first = canonicalPair();
    const second = canonicalPair();
    new SecureLicenseStore(directory).write({
      version: 1,
      deviceId: fingerprint("b"),
      devicePublicKey: second.publicKey,
      devicePrivateKey: first.privateKey,
      grant: "old.header.signature",
      lastServerState: "LICENSED",
      clockObservation: { lastObservedAt: "not-a-time" }
    });

    await service(directory, fingerprint("b")).initialize();
    const migrated = new SecureLicenseStore(directory).read();

    expect(isCanonicalDeviceKeyPair(keysOf(migrated!))).toBe(true);
    expect(migrated?.devicePublicKey).not.toBe(second.publicKey);
    expect(migrated?.grant).toBeUndefined();
    expect(migrated?.lastServerState).toBeUndefined();
    expect(migrated?.clockObservation).toBeUndefined();
  });

  it("preserves an already canonical matching identity", async () => {
    const directory = await temporaryDirectory();
    const pair = canonicalPair();
    const stored: StoredLicenseState = {
      version: 1,
      deviceId: fingerprint("c"),
      devicePublicKey: pair.publicKey,
      devicePrivateKey: pair.privateKey,
      clockObservation: { lastObservedAt: "2026-07-16T02:00:00.000Z" }
    };
    new SecureLicenseStore(directory).write(stored);

    await service(directory, fingerprint("c")).initialize();

    expect(new SecureLicenseStore(directory).read()).toEqual(stored);
  });

  it("persists the activation email and original activation time across online checks", async () => {
    const directory = await temporaryDirectory();
    const deviceId = fingerprint("d");
    const signingKeys = generateKeyPairSync("ed25519");
    const activatedAt = "2026-07-16T13:18:00.000Z";
    const checkedAt = "2026-07-17T09:30:00.000Z";
    let activatedDevice: ActivationInput | undefined;
    const api: ActivationApiClient = {
      startTrial: vi.fn(),
      activateLicense: vi.fn(async (input) => {
        activatedDevice = input;
        return licenseResponse(input, activatedAt, activatedAt, signingKeys.privateKey);
      }),
      checkActivation: vi.fn(async () => {
        if (!activatedDevice) throw new Error("missing activation request");
        return licenseResponse(activatedDevice, checkedAt, activatedAt, signingKeys.privateKey);
      }),
      deactivateCurrentDevice: vi.fn(),
      createPortalDeviceLink: vi.fn().mockResolvedValue({
        url: "https://iterlay.example/portal?token=one-time-token",
        expiresAt: "2026-07-17T10:02:00.000Z"
      })
    };
    const options = {
      dataDir: directory,
      apiBaseUrl: "https://license.example.com/api/v1",
      keyring: { "test-key": signingKeys.publicKey },
      apiClient: api,
      fingerprintProvider: { getDeviceId: async () => deviceId },
      currentVersion: "1.0.0",
      now: () => new Date("2026-07-17T10:00:00.000Z")
    };
    const license = new LicenseService(options);

    const activated = await license.activate(" Buyer@Example.com ", "ITER-AAAA-BBBB-CCCC");
    const checked = await license.checkNow();
    const portalURL = await license.createPortalDeviceLink();
    const store = new SecureLicenseStore(directory);
    const legacyStored = store.read();
    if (!legacyStored) throw new Error("missing stored license");
    delete legacyStored.licenseEmail;
    delete legacyStored.activatedAt;
    store.write(legacyStored);
    vi.mocked(api.checkActivation).mockClear();
    const restoredLicense = new LicenseService(options);
    const restoredLocally = await restoredLicense.initialize();
    const restoredOnline = await restoredLicense.checkNow();

    expect(api.activateLicense).toHaveBeenCalledWith(expect.objectContaining({ email: "buyer@example.com" }));
    expect(activated).toMatchObject({ licenseEmail: "buyer@example.com", activatedAt });
    expect(checked).toMatchObject({ licenseEmail: "buyer@example.com", activatedAt });
    expect(portalURL).toBe("https://iterlay.example/portal?token=one-time-token");
    expect(api.createPortalDeviceLink).toHaveBeenCalledWith(expect.objectContaining({ appVersion: "1.0.0" }));
    expect(restoredLocally.licenseEmail).toBeUndefined();
    expect(restoredLocally.activatedAt).toBeUndefined();
    expect(api.checkActivation).toHaveBeenCalledOnce();
    expect(restoredOnline).toMatchObject({ licenseEmail: "buyer@example.com", activatedAt });
    expect(new SecureLicenseStore(directory).read()).toMatchObject({
      licenseEmail: "buyer@example.com",
      activatedAt
    });
  });

  it("persists a forced update across restarts and clears it after reaching the target version", async () => {
    const directory = await temporaryDirectory();
    const deviceId = fingerprint("e");
    const signingKeys = generateKeyPairSync("ed25519");
    const issuedAt = "2026-07-20T00:00:00.000Z";
    const targetVersion = "1.0.1";
    const api: ActivationApiClient = {
      startTrial: vi.fn(),
      activateLicense: vi.fn(async (input) => ({
        ...licenseResponse(input, issuedAt, issuedAt, signingKeys.privateKey),
        state: "UPDATE_REQUIRED" as const,
        update: {
          required: true as const,
          forced: true as const,
          targetVersion,
          minimumVersion: targetVersion,
          latestVersion: targetVersion,
          downloadUrl: "https://iterlay.example/download"
        }
      })),
      checkActivation: vi.fn(),
      deactivateCurrentDevice: vi.fn(),
      createPortalDeviceLink: vi.fn()
    };
    const common = {
      dataDir: directory,
      apiBaseUrl: "https://license.example.com/api/v1",
      keyring: { "test-key": signingKeys.publicKey },
      apiClient: api,
      fingerprintProvider: { getDeviceId: async () => deviceId },
      now: () => new Date("2026-07-20T00:01:00.000Z")
    };

    const blocked = await new LicenseService({ ...common, currentVersion: "1.0.0" })
      .activate("buyer@example.com", "ITER-AAAA-BBBB-CCCC");
    expect(blocked).toMatchObject({ state: "UPDATE_REQUIRED", update: { targetVersion } });
    expect(new SecureLicenseStore(directory).read()).toMatchObject({
      lastServerState: "UPDATE_REQUIRED",
      update: { targetVersion }
    });

    const upgraded = await new LicenseService({ ...common, currentVersion: targetVersion }).initialize();
    expect(upgraded.state).toBe("LICENSED");
    expect(new SecureLicenseStore(directory).read()?.lastServerState).toBeUndefined();
    expect(new SecureLicenseStore(directory).read()?.update).toBeUndefined();
  });

  it("restores an active license locally on restart and persists revocation after an explicit online check", async () => {
    const directory = await temporaryDirectory();
    const deviceId = fingerprint("f");
    const signingKeys = generateKeyPairSync("ed25519");
    const issuedAt = "2026-07-20T00:00:00.000Z";
    const api: ActivationApiClient = {
      startTrial: vi.fn(),
      activateLicense: vi.fn((input) =>
        Promise.resolve(licenseResponse(input, issuedAt, issuedAt, signingKeys.privateKey))
      ),
      checkActivation: vi.fn(),
      deactivateCurrentDevice: vi.fn(),
      createPortalDeviceLink: vi.fn()
    };
    const options = {
      dataDir: directory,
      apiBaseUrl: "https://license.example.com/api/v1",
      keyring: { "test-key": signingKeys.publicKey },
      apiClient: api,
      fingerprintProvider: { getDeviceId: async () => deviceId },
      currentVersion: "1.0.0",
      now: () => new Date("2026-07-20T00:01:00.000Z")
    };

    await new LicenseService(options).activate("buyer@example.com", "ITER-AAAA-BBBB-CCCC");
    vi.mocked(api.checkActivation).mockRejectedValue(
      new ActivationApiError(403, "LICENSE_REVOKED", "当前设备授权已失效。")
    );

    const restoredLicense = new LicenseService(options);
    const restored = await restoredLicense.initialize();

    expect(api.checkActivation).not.toHaveBeenCalled();
    expect(restored).toMatchObject({ state: "LICENSED", reason: "license_active" });
    expect(new SecureLicenseStore(directory).read()?.lastServerState).toBe("LICENSED");

    const checked = await restoredLicense.checkNow();

    expect(api.checkActivation).toHaveBeenCalledOnce();
    expect(checked).toMatchObject({ state: "REVOKED", reason: "revoked_by_server" });
    expect(new SecureLicenseStore(directory).read()?.lastServerState).toBe("REVOKED");
  });

  it("persists an authoritative revoked state returned by a successful activation check", async () => {
    const directory = await temporaryDirectory();
    const deviceId = fingerprint("g");
    const signingKeys = generateKeyPairSync("ed25519");
    const issuedAt = "2026-07-20T00:00:00.000Z";
    let activatedDevice: ActivationInput | undefined;
    const api: ActivationApiClient = {
      startTrial: vi.fn(),
      activateLicense: vi.fn(async (input) => {
        activatedDevice = input;
        return licenseResponse(input, issuedAt, issuedAt, signingKeys.privateKey);
      }),
      checkActivation: vi.fn(async () => {
        if (!activatedDevice) throw new Error("missing activation request");
        return {
          ...licenseResponse(activatedDevice, issuedAt, issuedAt, signingKeys.privateKey),
          state: "REVOKED" as const
        };
      }),
      deactivateCurrentDevice: vi.fn(),
      createPortalDeviceLink: vi.fn()
    };
    const license = new LicenseService({
      dataDir: directory,
      apiBaseUrl: "https://license.example.com/api/v1",
      keyring: { "test-key": signingKeys.publicKey },
      apiClient: api,
      fingerprintProvider: { getDeviceId: async () => deviceId },
      currentVersion: "1.0.0",
      now: () => new Date("2026-07-20T00:01:00.000Z")
    });

    await license.activate("buyer@example.com", "ITER-AAAA-BBBB-CCCC");
    const checked = await license.checkNow();

    expect(checked).toMatchObject({ state: "REVOKED", reason: "revoked_by_server" });
    expect(new SecureLicenseStore(directory).read()?.lastServerState).toBe("REVOKED");
  });

  it("does not turn a request-level credential rejection into a persisted device revocation", async () => {
    const directory = await temporaryDirectory();
    const deviceId = fingerprint("e");
    const signingKeys = generateKeyPairSync("ed25519");
    const issuedAt = "2026-07-20T00:00:00.000Z";
    const api: ActivationApiClient = {
      startTrial: vi.fn(),
      activateLicense: vi.fn((input) =>
        Promise.resolve(licenseResponse(input, issuedAt, issuedAt, signingKeys.privateKey))
      ),
      checkActivation: vi.fn(),
      deactivateCurrentDevice: vi.fn(),
      createPortalDeviceLink: vi.fn()
    };
    const license = new LicenseService({
      dataDir: directory,
      apiBaseUrl: "https://license.example.com/api/v1",
      keyring: { "test-key": signingKeys.publicKey },
      apiClient: api,
      fingerprintProvider: { getDeviceId: async () => deviceId },
      currentVersion: "1.0.0",
      now: () => new Date("2026-07-20T00:01:00.000Z")
    });

    await license.activate("buyer@example.com", "ITER-AAAA-BBBB-CCCC");
    const rejected = license.markCredentialRejected();

    expect(rejected).toMatchObject({
      state: "LICENSED",
      reason: "license_active",
      message: "设备凭证已失效，请重新检查授权状态。"
    });
    expect(new SecureLicenseStore(directory).read()?.lastServerState).toBe("LICENSED");
  });
});

function service(dataDir: string, deviceId: string): LicenseService {
  return new LicenseService({
    dataDir,
    apiBaseUrl: "https://license.example.com/api/v1",
    keyring: {},
    fingerprintProvider: { getDeviceId: async () => deviceId },
    currentVersion: "1.0.0"
  });
}

function canonicalPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("missing Ed25519 x");
  return { publicKey: jwk.x, privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

function keysOf(stored: StoredLicenseState) {
  return { publicKey: stored.devicePublicKey, privateKey: stored.devicePrivateKey };
}

function fingerprint(character: string): string {
  return `dfp_${character.repeat(43)}`;
}

function licenseResponse(
  device: Pick<DeviceRequest, "deviceFingerprint" | "devicePublicKey">,
  issuedAt: string,
  activatedAt: string,
  signingKey: ReturnType<typeof generateKeyPairSync>["privateKey"]
): GrantResponse {
  return {
    grant: signCompactGrant({
      subjectType: "license",
      productId: "iterlay",
      licenseId: "license-1",
      deviceId: device.deviceFingerprint,
      devicePublicKey: device.devicePublicKey,
      planType: "perpetual",
      maxMajorVersion: 1,
      issuedAt,
      ...createLicenseGrantSchedule(issuedAt)
    }, "test-key", signingKey),
    state: "LICENSED",
    serverTime: issuedAt,
    license: { email: "buyer@example.com" },
    device: { createdAt: activatedAt }
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-license-migration-"));
  directories.push(directory);
  return directory;
}
