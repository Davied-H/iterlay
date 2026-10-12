import { describe, expect, it } from "vitest";
import {
  pointAtConnectionPathProgress,
  projectPointToConnectionPath,
  sampleConnectionPath
} from "../src/components/canvas/connection-label";

describe("connection label path geometry", () => {
  it("samples the rounded smooth-step path commands", () => {
    const points = sampleConnectionPath("M0 0L20 0L 88,0Q 100,0 100,12L100 100");

    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 100, y: 100 });
    expect(points.some((point) => point.x > 88 && point.x < 100 && point.y > 0 && point.y < 12)).toBe(true);
  });

  it("projects dragging onto the nearest connection segment", () => {
    const points = sampleConnectionPath("M 0 0 L 100 0 L 100 100");
    const projection = projectPointToConnectionPath(points, { x: 82, y: 64 });

    expect(projection.point).toEqual({ x: 100, y: 64 });
    expect(projection.progress).toBeCloseTo(0.82);
  });

  it("keeps the same relative label position when the connection moves", () => {
    const original = sampleConnectionPath("M 0 0 L 100 0 L 100 100");
    const moved = sampleConnectionPath("M 40 30 L 240 30 L 240 130");
    const progress = projectPointToConnectionPath(original, { x: 100, y: 50 }).progress;

    expect(pointAtConnectionPathProgress(original, progress)).toEqual({ x: 100, y: 50 });
    expect(pointAtConnectionPathProgress(moved, progress)).toEqual({ x: 240, y: 55 });
  });
});
