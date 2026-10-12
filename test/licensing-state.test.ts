import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { LicenseGrantPayload, TrialGrantPayload } from "../shared/licensing.js";
import { createLicenseGrantSchedule, createTrialGrantSchedule, signCompactGrant, verifyCompactGrant } from "../electron/licensing/grant.js";
import { capabilitiesForState, evaluateLicenseState, parseMajorVersion } from "../electron/licensing/state-machine.js";

const issuedAt = "2026-07-16T00:00:00.000Z";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

function verify(payload: LicenseGrantPayload | TrialGrantPayload) {
  return verifyCompactGrant(signCompactGrant(payload, "key-1", privateKey), { "key-1": publicKey });
}

function license(overrides: Partial<LicenseGrantPayload> = {}) {
  return verify({
    subjectType: "license",
    productId: "iterlay",
    licenseId: "license-1",
    deviceId: "device-1",
    devicePublicKey: "public-key",
    planType: "perpetual",
    maxMajorVersion: 1,
    issuedAt,
    ...createLicenseGrantSchedule(issuedAt),
    ...overrides
  });
}

function trial(overrides: Partial<TrialGrantPayload> = {}) {
  return verify({
    subjectType: "trial",
    productId: "iterlay",
    trialId: "trial-1",
    deviceId: "device-1",
    devicePublicKey: "public-key",
    issuedAt,
    ...createTrialGrantSchedule(issuedAt),
    ...overrides
  });
}

function state(grant: ReturnType<typeof license> | null, now: string, extra = {}) {
  return evaluateLicenseState({
    grant,
    now,
    currentVersion: "1.8.0",
    expectedDeviceId: "device-1",
    ...extra
  });
}

describe("license state machine", () => {
  it("starts unactivated and advertises the trial path", () => {
    const result = state(null, issuedAt);
    expect(result.state).toBe("UNACTIVATED");
    expect(result.capabilities).toMatchObject({ mode: "read-only", canStartTrial: true, canGenerate: false });
  });

  it("keeps a trial full access until the exclusive 3-day expiry boundary", () => {
    const grant = trial();
    expect(state(grant, "2026-07-18T23:59:59.999Z").state).toBe("TRIAL_ACTIVE");
    const expired = state(grant, "2026-07-19T00:00:00.000Z");
    expect(expired).toMatchObject({ state: "RESTRICTED", reason: "trial_expired" });
    expect(expired.capabilities).toMatchObject({
      mode: "read-only",
      canView: true,
      canExport: true,
      canGenerate: false,
      canEdit: false,
      canImport: false
    });
  });

  it("moves from licensed to offline grace at day 30 and restricted at day 45", () => {
    const grant = license();
    expect(state(grant, "2026-08-14T23:59:59.999Z").state).toBe("LICENSED");
    expect(state(grant, "2026-08-15T00:00:00.000Z")).toMatchObject({ state: "OFFLINE_GRACE", reason: "check_due" });
    expect(state(grant, "2026-08-30T00:00:00.000Z")).toMatchObject({
      state: "RESTRICTED",
      reason: "offline_grace_expired"
    });
  });

  it("blocks app major versions above a perpetual entitlement", () => {
    const result = evaluateLicenseState({
      grant: license({ maxMajorVersion: 1 }),
      now: issuedAt,
      currentVersion: "2.0.0-beta.1",
      expectedDeviceId: "device-1"
    });
    expect(result).toMatchObject({ state: "VERSION_BLOCKED", reason: "version_not_entitled" });
    expect(parseMajorVersion("v12.3.0")).toBe(12);
  });

  it("supports annual expiry without changing the activation mechanism", () => {
    const grant = license({ planType: "annual", maxMajorVersion: null, validUntil: "2027-07-16T00:00:00.000Z" });
    expect(state(grant, "2027-07-16T00:00:00.000Z")).toMatchObject({
      state: "RESTRICTED",
      reason: "subscription_expired"
    });
  });

  it("honors a persisted server revocation over a still-valid offline grant", () => {
    expect(state(license(), issuedAt, { lastServerState: "REVOKED" })).toMatchObject({
      state: "REVOKED",
      reason: "revoked_by_server"
    });
  });

  it("blocks all write capabilities for a persisted forced update", () => {
    expect(state(license(), issuedAt, { lastServerState: "UPDATE_REQUIRED" })).toMatchObject({
      state: "UPDATE_REQUIRED",
      reason: "update_required",
      capabilities: { mode: "read-only", canGenerate: false, canEdit: false, canImport: false }
    });
  });

  it("restricts access when the wall clock rolls back beyond tolerance", () => {
    const result = state(license(), "2026-07-16T01:00:00.000Z", {
      lastClockObservation: { lastObservedAt: "2026-07-16T02:00:01.000Z" }
    });
    expect(result).toMatchObject({ state: "RESTRICTED", reason: "clock_rollback" });
    expect(result.clockObservation.lastObservedAt).toBe("2026-07-16T02:00:01.000Z");
  });

  it("keeps full access during offline grace and read-only access for terminal states", () => {
    expect(capabilitiesForState("OFFLINE_GRACE").mode).toBe("full");
    for (const state of ["RESTRICTED", "REVOKED", "VERSION_BLOCKED", "UPDATE_REQUIRED"] as const) {
      expect(capabilitiesForState(state)).toMatchObject({ mode: "read-only", canView: true, canExport: true });
    }
  });
});
