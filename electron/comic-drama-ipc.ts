import { ipcMain } from "electron";
import {
  COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL,
  COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL,
  type BoardMutationPlan,
  type BoardMutationResult,
  type ComicDramaBoardSnapshot
} from "../shared/comic-drama.js";

interface ComicDramaBoardStore {
  getComicDramaBoardSnapshot(boardId: string): Promise<ComicDramaBoardSnapshot>;
  applyMutationPlan(plan: BoardMutationPlan): Promise<BoardMutationResult>;
}

export function registerComicDramaIpc(boards: ComicDramaBoardStore): () => void {
  ipcMain.handle(COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL, (_event, boardId: unknown) => {
    if (typeof boardId !== "string" || !boardId.trim()) throw new Error("缺少画板 ID。");
    return boards.getComicDramaBoardSnapshot(boardId);
  });
  ipcMain.handle(COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL, (_event, plan: unknown) => {
    if (!plan || typeof plan !== "object") throw new Error("漫剧助手计划无效。");
    return boards.applyMutationPlan(plan as BoardMutationPlan);
  });
  return () => {
    ipcMain.removeHandler(COMIC_DRAMA_BOARD_SNAPSHOT_CHANNEL);
    ipcMain.removeHandler(COMIC_DRAMA_APPLY_MUTATION_PLAN_CHANNEL);
  };
}
