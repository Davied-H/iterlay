import { describe, expect, it } from "vitest";
import { promoteRecentlyUsedBoard, sortBoardsByRecentUse } from "@shared/board-order";

const boards = [
  { id: "old", createdAt: "2026-07-18T08:00:00.000Z", updatedAt: "2026-07-20T08:00:00.000Z" },
  { id: "new", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T08:00:00.000Z" },
  { id: "recent", createdAt: "2026-07-19T08:00:00.000Z", updatedAt: "2026-07-20T09:00:00.000Z" }
];

describe("board recent-use order", () => {
  it("sorts recent use first and puts a new board first when timestamps tie", () => {
    expect(sortBoardsByRecentUse(boards).map((board) => board.id)).toEqual(["recent", "new", "old"]);
  });

  it("promotes an opened board immediately", () => {
    expect(
      promoteRecentlyUsedBoard(boards, "old", "2026-07-20T10:00:00.000Z").map((board) => board.id)
    ).toEqual(["old", "recent", "new"]);
  });
});
