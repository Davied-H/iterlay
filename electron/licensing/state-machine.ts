import type {
  ClockObservation,
  GrantResponseState,
  LicenseCapabilities,
  LicenseGrantPayload,
  LicenseState
} from "../../shared/licensing.js";
import { DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS, ITERLAY_PRODUCT_ID } from "../../shared/licensing.js";
import { detectClockRollback } from "./clock.js";
import type { VerifiedGrant } from "./grant.js";

export type LicenseStateReason =
  | "no_grant"
  | "trial_active"
  | "trial_expired"
  | "license_active"
  | "check_due"
  | "offline_grace_expired"
  | "subscription_expired"
  | "revoked_by_server"
  | "restricted_by_server"
  | "version_not_entitled"
  | "update_required"
  | "product_mismatch"
  | "device_mismatch"
  | "clock_rollback";

export interface LicenseEvaluationInput {
  grant?: VerifiedGrant | null;
  currentVersion: string;
  expectedDeviceId: string;
  expectedProductId?: string;
  now?: Date | string | number;
  lastClockObservation?: ClockObservation | null;
  lastServerState?: GrantResponseState | null;
  clockRollbackToleranceMs?: number;
}

export interface LicenseEvaluation {
  state: LicenseState;
  reason: LicenseStateReason;
  capabilities: LicenseCapabilities;
  clockObservation: ClockObservation;
  nextCheckAt?: string;
  offlineValidUntil?: string;
}

export function evaluateLicenseState(input: LicenseEvaluationInput): LicenseEvaluation {
  const nowMs = toTimestamp(input.now ?? Date.now(), "now");
  const clock = detectClockRollback(
    nowMs,
    input.lastClockObservation,
    input.clockRollbackToleranceMs ?? DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS
  );
  const common = {
    clockObservation: clock.observation
  };

  if (!input.grant) return evaluation("UNACTIVATED", "no_grant", common);
  const payload = input.grant.payload;
  const timing = { nextCheckAt: payload.nextCheckAt, offlineValidUntil: payload.offlineValidUntil };

  if (input.lastServerState === "UPDATE_REQUIRED") {
    return evaluation("UPDATE_REQUIRED", "update_required", { ...common, ...timing });
  }
  if (input.lastServerState === "REVOKED") {
    return evaluation("REVOKED", "revoked_by_server", { ...common, ...timing });
  }
  if (input.lastServerState === "RESTRICTED") {
    return evaluation("RESTRICTED", "restricted_by_server", { ...common, ...timing });
  }
  if (payload.productId !== (input.expectedProductId ?? ITERLAY_PRODUCT_ID)) {
    return evaluation("RESTRICTED", "product_mismatch", { ...common, ...timing });
  }
  if (payload.deviceId !== input.expectedDeviceId) {
    return evaluation("RESTRICTED", "device_mismatch", { ...common, ...timing });
  }
  if (clock.rolledBack) {
    return evaluation("RESTRICTED", "clock_rollback", { ...common, ...timing });
  }

  const issuedAtMs = Date.parse(payload.issuedAt);
  const toleranceMs = input.clockRollbackToleranceMs ?? DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS;
  if (nowMs + toleranceMs < issuedAtMs) {
    return evaluation("RESTRICTED", "clock_rollback", { ...common, ...timing });
  }

  if (payload.subjectType === "trial") {
    if (nowMs < Date.parse(payload.offlineValidUntil)) {
      return evaluation("TRIAL_ACTIVE", "trial_active", { ...common, ...timing });
    }
    return evaluation("RESTRICTED", "trial_expired", { ...common, ...timing });
  }

  if (!isVersionEntitled(payload, input.currentVersion)) {
    return evaluation("VERSION_BLOCKED", "version_not_entitled", { ...common, ...timing });
  }
  if (payload.planType === "annual" && payload.validUntil && nowMs >= Date.parse(payload.validUntil)) {
    return evaluation("RESTRICTED", "subscription_expired", { ...common, ...timing });
  }
  if (nowMs < Date.parse(payload.nextCheckAt)) {
    return evaluation("LICENSED", "license_active", { ...common, ...timing });
  }
  if (nowMs < Date.parse(payload.offlineValidUntil)) {
    return evaluation("OFFLINE_GRACE", "check_due", { ...common, ...timing });
  }
  return evaluation("RESTRICTED", "offline_grace_expired", { ...common, ...timing });
}

export function isVersionEntitled(payload: LicenseGrantPayload, currentVersion: string): boolean {
  if (payload.maxMajorVersion === null) return true;
  return parseMajorVersion(currentVersion) <= payload.maxMajorVersion;
}

export function parseMajorVersion(version: string): number {
  const match = /^v?(0|[1-9]\d*)(?:\.|$)/.exec(version.trim());
  if (!match) throw new TypeError(`无法解析应用版本: ${version}`);
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major)) throw new TypeError(`应用主版本无效: ${version}`);
  return major;
}

export function capabilitiesForState(state: LicenseState): LicenseCapabilities {
  const fullAccess = state === "TRIAL_ACTIVE" || state === "LICENSED" || state === "OFFLINE_GRACE";
  return {
    mode: fullAccess ? "full" : "read-only",
    canView: true,
    canExport: true,
    canGenerate: fullAccess,
    canEdit: fullAccess,
    canImport: fullAccess,
    canStartTrial: state === "UNACTIVATED",
    canActivate: !fullAccess
  };
}

export class LicenseStateMachine {
  constructor(
    private readonly currentVersion: string,
    private readonly expectedDeviceId: string,
    private readonly clockRollbackToleranceMs = DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS
  ) {}

  evaluate(input: Omit<LicenseEvaluationInput, "currentVersion" | "expectedDeviceId" | "clockRollbackToleranceMs">): LicenseEvaluation {
    return evaluateLicenseState({
      ...input,
      currentVersion: this.currentVersion,
      expectedDeviceId: this.expectedDeviceId,
      clockRollbackToleranceMs: this.clockRollbackToleranceMs
    });
  }
}

function evaluation(
  state: LicenseState,
  reason: LicenseStateReason,
  details: Pick<LicenseEvaluation, "clockObservation"> & Partial<Pick<LicenseEvaluation, "nextCheckAt" | "offlineValidUntil">>
): LicenseEvaluation {
  return { state, reason, capabilities: capabilitiesForState(state), ...details };
}

function toTimestamp(value: Date | string | number, field: string): number {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${field} 不是有效时间`);
  return timestamp;
}
