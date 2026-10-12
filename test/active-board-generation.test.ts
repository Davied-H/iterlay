import { describe, expect, it } from "vitest";
import {
  groupActiveBoardGenerations,
  type ActiveBoardGeneration
} from "../src/lib/active-board-generation";

describe("active board generations", () => {
  it("groups concurrent tasks by their origin board without changing task order", () => {
    const tasks: ActiveBoardGeneration[] = [
      { id: "a-1", boardId: "board-a", mode: "generate", prompt: "海报", requestedCount: 2, startedAt: 10 },
      { id: "b-1", boardId: "board-b", mode: "edit", prompt: "调整背景", requestedCount: 1, startedAt: 20 },
      { id: "a-2", boardId: "board-a", mode: "edit", prompt: "补充文字", requestedCount: 1, startedAt: 30 }
    ];

    const grouped = groupActiveBoardGenerations(tasks);

    expect(grouped.get("board-a")?.map((task) => task.id)).toEqual(["a-1", "a-2"]);
    expect(grouped.get("board-b")?.map((task) => task.id)).toEqual(["b-1"]);
    expect(grouped.has("board-c")).toBe(false);
  });
});
