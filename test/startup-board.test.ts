import { describe, expect, it } from "vitest";
import { INITIAL_DEMO_BOARD_NAME } from "../shared/demo-board.js";
import type { BoardSummary } from "../shared/types.js";
import { selectStartupBoard } from "../src/lib/startup-board.js";

function board(id: string, name: string, imageCount: number): BoardSummary {
  return {
    id,
    name,
    imageCount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("selectStartupBoard", () => {
  const demo = board("demo", INITIAL_DEMO_BOARD_NAME, 6);
  const empty = board("empty", "画板 1", 0);
  const work = board("work", "包装设计", 3);

  it("routes a first visit away from the auto-installed demo", () => {
    expect(selectStartupBoard([demo, empty], demo.id, true)).toEqual({
      target: empty,
      needsStarterBoard: false
    });
  });

  it("requests an empty starter when the demo is the only board", () => {
    expect(selectStartupBoard([demo], demo.id, true)).toEqual({
      target: undefined,
      needsStarterBoard: true
    });
  });

  it("keeps a real last-opened board for existing work", () => {
    expect(selectStartupBoard([demo, work], work.id, true)).toEqual({
      target: work,
      needsStarterBoard: false
    });
  });

  it("keeps the demo when onboarding has already been handled", () => {
    expect(selectStartupBoard([demo, empty], demo.id, false)).toEqual({
      target: demo,
      needsStarterBoard: false
    });
  });
});
