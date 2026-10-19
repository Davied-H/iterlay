import type { ImageWorkflowMode } from "@shared/types";

/** 渲染层持有的在途任务快照，用于在离开画布后继续显示生成状态。 */
export interface ActiveBoardGeneration {
  id: string;
  boardId: string;
  mode: ImageWorkflowMode;
  prompt: string;
  requestedCount: number;
  startedAt: number;
  status?: "queued" | "running";
  /** Renderer-only action; never serialize callbacks into board/job storage. */
  cancelQueued?: () => boolean;
}

export function groupActiveBoardGenerations(
  tasks: ActiveBoardGeneration[]
): Map<string, ActiveBoardGeneration[]> {
  const grouped = new Map<string, ActiveBoardGeneration[]>();
  for (const task of tasks) {
    const current = grouped.get(task.boardId);
    if (current) current.push(task);
    else grouped.set(task.boardId, [task]);
  }
  return grouped;
}
