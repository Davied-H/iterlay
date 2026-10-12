import type { SliceResultLayout } from "./ImageSliceDialog";

export interface SliceResultCell {
  row: number;
  column: number;
}

/** Resolve a selected slice into its output cell while preserving reading order. */
export function getSliceResultCell(
  sourceIndex: number,
  outputIndex: number,
  sourceColumns: number,
  selectedCount: number,
  layout: SliceResultLayout
): SliceResultCell {
  if (layout === "source-grid") {
    return {
      row: Math.floor(sourceIndex / sourceColumns),
      column: sourceIndex % sourceColumns
    };
  }

  const compactColumns = Math.max(1, Math.min(sourceColumns, selectedCount));
  return {
    row: Math.floor(outputIndex / compactColumns),
    column: outputIndex % compactColumns
  };
}
