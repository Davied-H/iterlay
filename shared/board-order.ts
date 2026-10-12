export interface RecentlyUsedBoard {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Most recently used first; creation time makes newly created boards win timestamp ties. */
export function sortBoardsByRecentUse<T extends RecentlyUsedBoard>(boards: readonly T[]): T[] {
  return [...boards].sort((left, right) =>
    timestamp(right.updatedAt) - timestamp(left.updatedAt) ||
    timestamp(right.createdAt) - timestamp(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function promoteRecentlyUsedBoard<T extends RecentlyUsedBoard>(
  boards: readonly T[],
  boardId: string,
  usedAt: string
): T[] {
  return sortBoardsByRecentUse(
    boards.map((board) => board.id === boardId ? { ...board, updatedAt: usedAt } : board)
  );
}
