// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTourSeen,
  hasSeenDemoStart,
  hasSeenTour,
  initializeOnboardingPersistence,
  markDemoStartSeen,
  markTourSeen
} from "../src/lib/onboarding.js";

describe("onboarding persistence", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await initializeOnboardingPersistence();
  });

  it("remembers that the first-run demo entry was presented independently from tour completion", () => {
    expect(hasSeenDemoStart()).toBe(false);
    expect(hasSeenTour("board", 1)).toBe(false);

    markDemoStartSeen();

    expect(hasSeenDemoStart()).toBe(true);
    expect(hasSeenTour("board", 1)).toBe(false);
  });

  it("migrates legacy localStorage markers and then uses the main-process state", async () => {
    window.localStorage.setItem("iterlay.onboarding.board.v1", JSON.stringify({
      status: "completed",
      at: "2026-07-20T08:00:00.000Z"
    }));
    const getOnboardingState = vi.fn(async (legacyState) => ({
      ...legacyState,
      "iterlay.onboarding.edit.v1": { status: "skipped" as const, at: "2026-07-20T09:00:00.000Z" }
    }));
    const bridge = {
      getOnboardingState,
      markOnboardingSeen: vi.fn(async () => ({})),
      clearOnboardingSeen: vi.fn(async () => ({}))
    };

    await initializeOnboardingPersistence(bridge);

    expect(getOnboardingState).toHaveBeenCalledWith({
      "iterlay.onboarding.board.v1": {
        status: "completed",
        at: "2026-07-20T08:00:00.000Z"
      }
    });
    expect(hasSeenTour("board", 1)).toBe(true);
    expect(hasSeenTour("edit", 1)).toBe(true);
  });

  it("mirrors mark and clear operations to the main process", async () => {
    const bridge = {
      getOnboardingState: vi.fn(async () => ({})),
      markOnboardingSeen: vi.fn(async () => ({})),
      clearOnboardingSeen: vi.fn(async () => ({}))
    };
    await initializeOnboardingPersistence(bridge);

    markTourSeen("board", 1, "completed");
    expect(hasSeenTour("board", 1)).toBe(true);
    expect(bridge.markOnboardingSeen).toHaveBeenCalledWith(
      "iterlay.onboarding.board.v1",
      "completed"
    );

    clearTourSeen("board", 1);
    expect(hasSeenTour("board", 1)).toBe(false);
    expect(bridge.clearOnboardingSeen).toHaveBeenCalledWith("iterlay.onboarding.board.v1");
  });
});
