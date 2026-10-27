interface PositionedCard {
  x: number;
  y: number;
  width?: number;
}

/** Keep automatically created video chains outside the occupied board area. */
export function automaticVideoPlacement(cards: readonly PositionedCard[]): { x: number; y: number } {
  if (cards.length === 0) return { x: 80, y: 80 };
  return {
    x: Math.max(...cards.map((card) => card.x + (card.width ?? 340))) + 96,
    y: Math.min(...cards.map((card) => card.y))
  };
}
