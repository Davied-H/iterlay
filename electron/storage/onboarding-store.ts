import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { OnboardingRecord, OnboardingState, OnboardingStatus } from "../../shared/types.js";

const ONBOARDING_KEY_PATTERN = /^iterlay\.onboarding\.[a-z0-9-]+\.v[1-9]\d*$/;

export class OnboardingStore {
  private readonly filePath: string;
  private cached: OnboardingState | undefined;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "onboarding.json");
  }

  getState(legacyState?: OnboardingState): OnboardingState {
    const current = this.readState();
    let changed = false;
    for (const [key, record] of Object.entries(normalizeState(legacyState))) {
      if (current[key]) continue;
      current[key] = record;
      changed = true;
    }
    if (changed) this.writeState(current);
    return cloneState(current);
  }

  markSeen(key: string, status: OnboardingStatus): OnboardingState {
    assertKey(key);
    assertStatus(status);
    const current = this.readState();
    current[key] = { status, at: new Date().toISOString() };
    this.writeState(current);
    return cloneState(current);
  }

  clearSeen(key: string): OnboardingState {
    assertKey(key);
    const current = this.readState();
    if (current[key]) {
      delete current[key];
      this.writeState(current);
    }
    return cloneState(current);
  }

  private readState(): OnboardingState {
    if (this.cached) return cloneState(this.cached);
    if (!existsSync(this.filePath)) return {};
    try {
      this.cached = normalizeState(JSON.parse(readFileSync(this.filePath, "utf8")) as unknown);
    } catch {
      this.cached = {};
    }
    return cloneState(this.cached);
  }

  private writeState(state: OnboardingState): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
    this.cached = cloneState(state);
  }
}

function normalizeState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const state: OnboardingState = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!ONBOARDING_KEY_PATTERN.test(key) || !isRecord(candidate)) continue;
    state[key] = { status: candidate.status, at: candidate.at };
  }
  return state;
}

function isRecord(value: unknown): value is OnboardingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<OnboardingRecord>;
  return (
    (record.status === "completed" || record.status === "skipped" || record.status === "seen") &&
    typeof record.at === "string" &&
    !Number.isNaN(Date.parse(record.at))
  );
}

function assertKey(key: string): void {
  if (!ONBOARDING_KEY_PATTERN.test(key)) throw new Error("引导状态键格式无效。");
}

function assertStatus(status: OnboardingStatus): void {
  if (status !== "completed" && status !== "skipped" && status !== "seen") {
    throw new Error("引导状态值无效。");
  }
}

function cloneState(state: OnboardingState): OnboardingState {
  return Object.fromEntries(Object.entries(state).map(([key, record]) => [key, { ...record }]));
}
