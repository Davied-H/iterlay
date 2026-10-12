export const GENERATION_OUTPUT_HORIZONTAL_GAP = 192;
export const GENERATION_OUTPUT_VERTICAL_GAP = 40;

export interface GenerationOutputLayoutAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerationOutputLayoutItem {
  id: string;
  height: number;
}

/**
 * Places a result column to the right of its generator and centers the whole
 * column vertically, so later batches extend the column instead of overlapping.
 */
export function layoutGenerationOutputColumn(
  anchor: GenerationOutputLayoutAnchor,
  outputs: readonly GenerationOutputLayoutItem[]
): ReadonlyMap<string, { x: number; y: number }> {
  const totalHeight = outputs.reduce(
    (height, output, index) => (
      height + Math.max(1, output.height) + (index > 0 ? GENERATION_OUTPUT_VERTICAL_GAP : 0)
    ),
    0
  );
  const x = anchor.x + Math.max(1, anchor.width) + GENERATION_OUTPUT_HORIZONTAL_GAP;
  let y = anchor.y + (Math.max(1, anchor.height) - totalHeight) / 2;
  const positions = new Map<string, { x: number; y: number }>();
  for (const output of outputs) {
    positions.set(output.id, { x, y });
    y += Math.max(1, output.height) + GENERATION_OUTPUT_VERTICAL_GAP;
  }
  return positions;
}
