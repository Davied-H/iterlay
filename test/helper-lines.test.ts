import { describe, expect, it } from "vitest";
import {
  calculateHelperLineSnap,
  createHelperLineIndex,
  queryHelperLineCandidates,
  type HelperLineItem
} from "@/components/canvas/helper-lines";

const target: HelperLineItem = { id: "target", x: 0, y: 0, width: 100, height: 100 };

describe("canvas helper lines", () => {
  it("snaps matching centers on both axes", () => {
    const result = calculateHelperLineSnap(
      [{ id: "moving", x: 4, y: -3, width: 100, height: 100 }],
      [target],
      6
    );

    expect(result).toEqual({
      horizontal: { position: 50, start: -12, end: 112 },
      vertical: { position: 50, start: -12, end: 112 },
      offset: { x: -4, y: 3 }
    });
  });

  it("snaps a moving edge to a nearby target edge", () => {
    const result = calculateHelperLineSnap(
      [{ id: "moving", x: 24, y: 200, width: 80, height: 80 }],
      [target],
      6
    );

    expect(result.vertical).toEqual({ position: 100, start: -12, end: 292 });
    expect(result.horizontal).toBeNull();
    expect(result.offset).toEqual({ x: -4, y: 0 });
  });

  it("does not snap outside the threshold", () => {
    const result = calculateHelperLineSnap(
      [{ id: "moving", x: 107, y: 200, width: 80, height: 80 }],
      [target],
      6
    );

    expect(result).toEqual({
      horizontal: null,
      vertical: null,
      offset: { x: 0, y: 0 }
    });
  });

  it("uses the full selection bounds while preserving group spacing", () => {
    const result = calculateHelperLineSnap(
      [
        { id: "a", x: 3, y: 200, width: 50, height: 50 },
        { id: "b", x: 103, y: 200, width: 50, height: 50 }
      ],
      [{ id: "wide", x: 0, y: 0, width: 150, height: 100 }],
      4
    );

    expect(result.vertical).toEqual({ position: 75, start: -8, end: 258 });
    expect(result.offset.x).toBe(-3);
  });

  it("extends a guide across every target already sharing the alignment", () => {
    const result = calculateHelperLineSnap(
      [{ id: "moving", x: 2, y: 400, width: 100, height: 100 }],
      [target, { id: "target-2", x: 0, y: 200, width: 100, height: 100 }],
      4
    );

    expect(result.vertical).toEqual({ position: 50, start: -8, end: 508 });
  });

  it("keeps distant nodes eligible when their coordinates align", () => {
    const result = calculateHelperLineSnap(
      [{ id: "moving", x: 10_004, y: 20_000, width: 100, height: 100 }],
      [{ ...target, x: 10_000 }],
      6
    );

    expect(result.offset.x).toBe(-4);
    expect(result.vertical?.position).toBe(10_050);
  });

  it.each([100, 500, 1_000])("queries only nearby indexed anchors across %i nodes", (count) => {
    const targets = Array.from({ length: count }, (_, index): HelperLineItem => ({
      id: "target-" + index,
      x: index * 1_000,
      y: index * 1_000,
      width: 100,
      height: 100
    }));
    const focus = Math.floor(count / 2);
    const moving = [{
      id: "moving",
      x: focus * 1_000 + 4,
      y: focus * 1_000 - 3,
      width: 100,
      height: 100
    }];
    const index = createHelperLineIndex(targets);
    const candidates = queryHelperLineCandidates(index, moving, 6);

    expect(candidates.x.length).toBeLessThanOrEqual(3);
    expect(candidates.y.length).toBeLessThanOrEqual(3);
    expect(calculateHelperLineSnap(moving, index, 6).offset).toEqual({ x: -4, y: 3 });
  });
});
