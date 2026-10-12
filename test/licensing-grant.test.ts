import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GrantPayload, LicenseGrantPayload, TrialGrantPayload } from "../shared/licensing.js";
import {
  createLicenseGrantSchedule,
  createTrialGrantSchedule,
  GrantVerificationError,
  signCompactGrant,
  verifyCompactGrant
} from "../electron/licensing/grant.js";

const issuedAt = "2026-07-16T00:00:00.000Z";

function keys() {
  return generateKeyPairSync("ed25519");
}

function licensePayload(overrides: Partial<LicenseGrantPayload> = {}): LicenseGrantPayload {
  return {
    subjectType: "license",
    productId: "iterlay",
    licenseId: "license-1",
    deviceId: "device-1",
    devicePublicKey: "device-public-key",
    planType: "perpetual",
    maxMajorVersion: 1,
    issuedAt,
    ...createLicenseGrantSchedule(issuedAt),
    ...overrides
  };
}

function trialPayload(overrides: Partial<TrialGrantPayload> = {}): TrialGrantPayload {
  return {
    subjectType: "trial",
    productId: "iterlay",
    trialId: "trial-1",
    deviceId: "device-1",
    devicePublicKey: "device-public-key",
    issuedAt,
    ...createTrialGrantSchedule(issuedAt),
    ...overrides
  };
}

describe("compact license grant", () => {
  it.each<GrantPayload>([licensePayload(), trialPayload()])("signs and verifies a $subjectType grant", (payload) => {
    const { privateKey, publicKey } = keys();
    const compact = signCompactGrant(payload, "2026-01", privateKey);
    const verified = verifyCompactGrant(compact, { "2026-01": publicKey }, {
      deviceId: "device-1",
      devicePublicKey: "device-public-key"
    });

    expect(compact.split(".")).toHaveLength(3);
    expect(verified.header).toEqual({ alg: "EdDSA", typ: "ITERLAY-GRANT", v: 1, kid: "2026-01" });
    expect(verified.payload).toEqual(payload);
  });

  it("selects public keys by kid and rejects unknown key ids", () => {
    const { privateKey } = keys();
    const compact = signCompactGrant(licensePayload(), "rotated-key", privateKey);
    expect(() => verifyCompactGrant(compact, {})).toThrowError(
      expect.objectContaining<Partial<GrantVerificationError>>({ code: "UNKNOWN_KEY" })
    );
  });

  it("rejects a tampered payload before exposing its claims", () => {
    const { privateKey, publicKey } = keys();
    const compact = signCompactGrant(licensePayload(), "key-1", privateKey);
    const segments = compact.split(".");
    const decoded = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as LicenseGrantPayload;
    decoded.maxMajorVersion = 99;
    segments[1] = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    expect(() => verifyCompactGrant(segments.join("."), { "key-1": publicKey })).toThrowError(
      expect.objectContaining<Partial<GrantVerificationError>>({ code: "INVALID_SIGNATURE" })
    );
  });

  it("rejects a valid grant issued for another device", () => {
    const { privateKey, publicKey } = keys();
    const compact = signCompactGrant(licensePayload(), "key-1", privateKey);
    expect(() => verifyCompactGrant(compact, { "key-1": publicKey }, { deviceId: "device-2" })).toThrowError(
      expect.objectContaining<Partial<GrantVerificationError>>({ code: "GRANT_SCOPE_MISMATCH" })
    );
  });

  it("creates exact 30-day check, 45-day offline, and 3-day trial boundaries", () => {
    expect(createLicenseGrantSchedule(issuedAt)).toEqual({
      nextCheckAt: "2026-08-15T00:00:00.000Z",
      offlineValidUntil: "2026-08-30T00:00:00.000Z"
    });
    expect(createTrialGrantSchedule(issuedAt)).toEqual({
      nextCheckAt: "2026-07-19T00:00:00.000Z",
      offlineValidUntil: "2026-07-19T00:00:00.000Z"
    });
  });

  it("rejects grants that extend beyond the allowed offline window", () => {
    const { privateKey } = keys();
    expect(() =>
      signCompactGrant(
        licensePayload({ offlineValidUntil: "2026-09-01T00:00:00.000Z" }),
        "key-1",
        privateKey
      )
    ).toThrowError(expect.objectContaining<Partial<GrantVerificationError>>({ code: "INVALID_PAYLOAD" }));
  });
});
