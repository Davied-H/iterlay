import { describe, expect, it } from "vitest";
import {
  formatDuration,
  GENERATION_ESTIMATE_MS,
  getGenerationTiming
} from "@/lib/generation-timing";

describe("generation timing", () => {
  it("counts down from the two-minute estimate while tracking elapsed time", () => {
    const timing = getGenerationTiming(1_000, 38_000);

    expect(GENERATION_ESTIMATE_MS).toBe(120_000);
    expect(timing).toMatchObject({
      elapsedSeconds: 37,
      remainingSeconds: 83,
      elapsedLabel: "00:37",
      remainingLabel: "01:23",
      overdue: false
    });
  });

  it("switches to overdue exactly at two minutes without a negative countdown", () => {
    expect(getGenerationTiming(0, 119_999)).toMatchObject({ remainingLabel: "00:01", overdue: false });
    expect(getGenerationTiming(0, 120_000)).toMatchObject({ remainingLabel: "00:00", overdue: true });
    expect(getGenerationTiming(0, 181_000)).toMatchObject({
      elapsedLabel: "03:01",
      remainingLabel: "00:00",
      overdue: true
    });
  });

  it("formats long-running generations without wrapping minutes past an hour", () => {
    expect(formatDuration(3_661)).toBe("01:01:01");
    expect(formatDuration(-10)).toBe("00:00");
  });
});
