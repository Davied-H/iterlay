import { INITIAL_DEMO_BOARD_NAME } from "@shared/demo-board";
import type { BoardSummary } from "@shared/types";

export interface StartupBoardSelection {
  target: BoardSummary | undefined;
  needsStarterBoard: boolean;
}

export function selectStartupBoard(
  boards: BoardSummary[],
  lastOpenedBoardId: string | undefined,
  firstBoardVisit: boolean
): StartupBoardSelection {
  const target = boards.find((board) => board.id === lastOpenedBoardId) ?? boards[0];
  if (!firstBoardVisit || target?.name !== INITIAL_DEMO_BOARD_NAME) {
    return { target, needsStarterBoard: false };
  }

  const starter = boards.find(
    (board) => board.name !== INITIAL_DEMO_BOARD_NAME && board.imageCount === 0
  );
  return starter
    ? { target: starter, needsStarterBoard: false }
    : { target: undefined, needsStarterBoard: true };
}
