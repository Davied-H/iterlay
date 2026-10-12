import type { OnboardingState, OnboardingStatus } from "../../shared/types";

/** key 带版本号：引导内容大改时 bump version 即可对老用户重新展示，小改不打扰。 */
export type TourId = "board" | "edit" | "library" | "gallery";

const DEMO_START_SEEN_KEY = "iterlay.onboarding.demo-start.v1";
let persistedState: OnboardingState | null = null;
let persistence: OnboardingPersistence | null = null;

export interface OnboardingPersistence {
  getOnboardingState(legacyState?: OnboardingState): Promise<OnboardingState>;
  markOnboardingSeen(key: string, status: OnboardingStatus): Promise<OnboardingState>;
  clearOnboardingSeen(key: string): Promise<OnboardingState>;
}

function keyFor(id: TourId, version: number): string {
  return `iterlay.onboarding.${id}.v${version}`;
}

export function hasSeenTour(id: TourId, version: number): boolean {
  return hasSeenKey(keyFor(id, version));
}

export function markTourSeen(id: TourId, version: number, status: "completed" | "skipped"): void {
  markSeenKey(keyFor(id, version), status);
}

export function clearTourSeen(id: TourId, version: number): void {
  clearSeenKey(keyFor(id, version));
}

/** 首次空画布上的演示入口只推荐一次，与用户是否完成后续功能引导相互独立。 */
export function hasSeenDemoStart(): boolean {
  return hasSeenKey(DEMO_START_SEEN_KEY);
}

export function markDemoStartSeen(): void {
  markSeenKey(DEMO_START_SEEN_KEY, "seen");
}

/** 主进程状态为准，并把当前页面 origin 中的旧 localStorage 标记一次性补入主进程。 */
export async function initializeOnboardingPersistence(bridge?: OnboardingPersistence): Promise<void> {
  persistence = bridge ?? null;
  if (!bridge) {
    persistedState = null;
    return;
  }
  try {
    persistedState = await bridge.getOnboardingState(readLegacyState());
  } catch {
    persistedState = null;
  }
}

function hasSeenKey(key: string): boolean {
  if (persistedState) return Boolean(persistedState[key]);
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    // storage 不可用时宁可不弹，避免每次启动都骚扰。
    return true;
  }
}

function markSeenKey(key: string, status: OnboardingStatus): void {
  const record = { status, at: new Date().toISOString() };
  if (persistedState) persistedState[key] = record;
  try {
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // 主进程持久化仍可继续。
  }
  void persistence?.markOnboardingSeen(key, status).catch(() => undefined);
}

function clearSeenKey(key: string): void {
  if (persistedState) delete persistedState[key];
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 主进程持久化仍可继续。
  }
  void persistence?.clearOnboardingSeen(key).catch(() => undefined);
}

function readLegacyState(): OnboardingState {
  const state: OnboardingState = {};
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith("iterlay.onboarding.")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      if (key === DEMO_START_SEEN_KEY) {
        const at = Number.isNaN(Date.parse(raw)) ? new Date().toISOString() : raw;
        state[key] = { status: "seen", at };
        continue;
      }
      try {
        const record = JSON.parse(raw) as { status?: unknown; at?: unknown };
        if (
          (record.status === "completed" || record.status === "skipped") &&
          typeof record.at === "string"
        ) {
          state[key] = { status: record.status, at: record.at };
        }
      } catch {
        // 忽略损坏的旧标记。
      }
    }
  } catch {
    // localStorage 不可用时没有旧状态可迁移。
  }
  return state;
}
