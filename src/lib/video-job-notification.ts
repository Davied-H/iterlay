import type { VideoGenerationJob } from "@shared/types";
import { iterlayToast } from "@/components/ui/iterlay-toast";

interface NotifyVideoJobDependencies {
  notifiedJobIds: Set<string>;
  boardNameForId: (boardId: string | undefined) => string | undefined;
  onNavigate: (boardId: string, jobId: string) => void;
}

export function notifyVideoJob(
  job: VideoGenerationJob,
  { notifiedJobIds, boardNameForId, onNavigate }: NotifyVideoJobDependencies
): void {
  if (notifiedJobIds.has(job.id)) return;
  if (job.status !== "completed" && job.status !== "failed") return;

  notifiedJobIds.add(job.id);
  const boardId = job.input.boardId;
  const boardName = boardNameForId(boardId);
  const succeeded = job.status === "completed";
  iterlayToast.videoResult({
    succeeded,
    title: succeeded ? "视频生成完成" : "视频生成失败",
    detail: succeeded
      ? boardName ? `已存入「${boardName}」` : "已保存到画板"
      : job.error || "任务未能完成，请检查配置后重试",
    onNavigate: boardId ? () => onNavigate(boardId, job.id) : undefined
  });
}
