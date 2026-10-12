import { describe, expect, it } from "vitest";
import {
  calculateFilmFrameMetrics,
  nearestFilmFrameIndex,
  projectFilmScrollLeft
} from "@/components/workbench/gallery/film-scroll";

describe("film strip scrolling", () => {
  it("selects the frame nearest to the viewport gate", () => {
    expect(nearestFilmFrameIndex([100, 500, 900], 620)).toBe(1);
    expect(nearestFilmFrameIndex([100, 500, 900], 780)).toBe(2);
  });

  it("ignores frames that have not mounted yet", () => {
    expect(nearestFilmFrameIndex([Number.NaN, 500, Number.NaN], 480, 0)).toBe(1);
  });

  it("projects drag velocity without leaving the strip bounds", () => {
    expect(projectFilmScrollLeft(400, 1.5, 180, 1200)).toBe(670);
    expect(projectFilmScrollLeft(40, -2, 180, 1200)).toBe(0);
    expect(projectFilmScrollLeft(1100, 2, 180, 1200)).toBe(1200);
  });

  it("uses the available width on large displays while respecting the viewport height", () => {
    expect(calculateFilmFrameMetrics(1648, 820)).toEqual({ frameWidth: 920, edgeSpace: 364 });

    const shortViewport = calculateFilmFrameMetrics(1648, 500);
    expect(shortViewport.frameWidth).toBe(633);
    expect(shortViewport.frameWidth / 1.5 + 58).toBeLessThanOrEqual(500);
  });

  it("keeps compact film frames centered with a stable edge gutter", () => {
    expect(calculateFilmFrameMetrics(500, 650)).toEqual({ frameWidth: 400, edgeSpace: 50 });
  });
});
