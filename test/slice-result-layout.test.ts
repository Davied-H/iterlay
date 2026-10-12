import { describe, expect, it } from "vitest";
import { getSliceResultCell } from "@/components/canvas/slice-result-layout";

describe("slice result layout", () => {
  it("compacts sparse selections without changing their reading order", () => {
    const sourceIndexes = [0, 3, 10, 15];
    const cells = sourceIndexes.map((sourceIndex, outputIndex) =>
      getSliceResultCell(sourceIndex, outputIndex, 4, sourceIndexes.length, "compact")
    );

    expect(cells).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
      { row: 0, column: 3 }
    ]);
  });

  it("keeps source cells when preserving the original grid", () => {
    expect(getSliceResultCell(10, 2, 4, 4, "source-grid")).toEqual({ row: 2, column: 2 });
  });

  it("keeps vertical source grids vertical when compacting", () => {
    expect(getSliceResultCell(4, 2, 1, 3, "compact")).toEqual({ row: 2, column: 0 });
  });
});
