import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OnboardingStore } from "../electron/storage/onboarding-store.js";

describe("OnboardingStore", () => {
  it("persists seen markers independently from renderer origins", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-onboarding-"));
    try {
      const store = new OnboardingStore(directory);
      store.markSeen("iterlay.onboarding.board.v1", "completed");

      expect(new OnboardingStore(directory).getState()).toMatchObject({
        "iterlay.onboarding.board.v1": { status: "completed" }
      });
      const persisted = JSON.parse(await readFile(path.join(directory, "onboarding.json"), "utf8"));
      expect(persisted["iterlay.onboarding.board.v1"].status).toBe("completed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fills missing legacy markers without overwriting authoritative records", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-onboarding-"));
    try {
      const store = new OnboardingStore(directory);
      store.markSeen("iterlay.onboarding.board.v1", "completed");
      const state = store.getState({
        "iterlay.onboarding.board.v1": { status: "skipped", at: "2026-07-01T00:00:00.000Z" },
        "iterlay.onboarding.demo-start.v1": { status: "seen", at: "2026-07-01T00:00:00.000Z" }
      });

      expect(state["iterlay.onboarding.board.v1"].status).toBe("completed");
      expect(state["iterlay.onboarding.demo-start.v1"].status).toBe("seen");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("clears replayed tours and rejects malformed keys", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-onboarding-"));
    try {
      const store = new OnboardingStore(directory);
      store.markSeen("iterlay.onboarding.library.v1", "skipped");
      expect(store.clearSeen("iterlay.onboarding.library.v1")).toEqual({});
      expect(() => store.markSeen("untrusted-key", "seen")).toThrow("引导状态键格式无效");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
