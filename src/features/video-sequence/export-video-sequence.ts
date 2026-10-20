import { toast } from "sonner";
import { translateSourceText } from "@/i18n/ui-text";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import type { VideoSequenceExportOptions } from "@/components/video-sequence";
import type { VideoSequence, VideoSequenceTask } from "@shared/types";

interface ExportDependencies {
  prepareActiveVideoSequence: () => Promise<(VideoSequence & { sequenceTasks?: VideoSequenceTask[] }) | null>;
  runActiveVideoSequence: (segmentIds?: string[]) => Promise<VideoSequenceTask[]>;
  refreshActiveVideoSequence: () => Promise<void>;
}

/** Export only the tasks submitted by this attempt; never reuse unrelated completed jobs. */
export async function exportVideoSequence(options: VideoSequenceExportOptions, dependencies: ExportDependencies): Promise<void> {
  const { prepareActiveVideoSequence, runActiveVideoSequence, refreshActiveVideoSequence } = dependencies;
    const retry = (): void => { void exportVideoSequence(options, dependencies); };
    let toastId: string | number | undefined;
    try {
      let current = await prepareActiveVideoSequence();
      if (!current) return;
      toastId = toast.loading(options.updateBeforeExport ? translateSourceText("正在更新待生成片段...") : translateSourceText("正在准备导出..."));
      if (options.updateBeforeExport) {
        const staleIds = current.segments
          .filter((segment) => segment.renderedRevision !== segment.desiredRevision || !segment.activeVersionId)
          .map((segment) => segment.id);
        if (staleIds.length > 0) {
          const submitted = await runActiveVideoSequence(staleIds);
          const submittedIds = new Set(submitted.map((task) => task.id));
          if (submittedIds.size === 0) throw new Error("没有创建本次更新任务，已停止导出。");
          let finished = false;
          for (let attempt = 0; attempt < 300; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_000));
            const latest = await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id });
            if (!latest) throw new Error("视频序列不存在，已停止导出。");
            current = latest;
            const currentTasks = (latest.sequenceTasks ?? []).filter((task) => submittedIds.has(task.id));
            const failed = currentTasks.find((task) => ["failed_retryable", "failed_terminal", "remote_unknown", "cancelled"].includes(task.status));
            if (failed) throw new Error(failed.error || "本次更新片段失败，已停止导出。");
            if (currentTasks.length === submittedIds.size && currentTasks.every((task) => task.status === "completed")) {
              const stillStale = latest.segments.some((segment) => staleIds.includes(segment.id)
                && (segment.renderedRevision !== segment.desiredRevision || !segment.activeVersionId));
              if (stillStale) throw new Error("本次更新结果已被新的片段修改取代，已停止导出。");
              finished = true;
              break;
            }
          }
          if (!finished) throw new Error("等待本次片段更新超时，已停止导出。");
        }
      }
      toast.loading(translateSourceText("正在拼接视频..."), { id: toastId });
      let job = await getImageWorkbenchApi().exportVideoSequence({
        boardId: current.boardId, sequenceId: current.id, expectedRevision: current.revision,
        fileName: options.fileName, resolution: options.resolution, fps: options.fps, includeAudio: options.includeAudio
      });
      for (let attempt = 0; attempt < 1_800 && job.status !== "completed"; attempt += 1) {
        if (["failed", "cancelled"].includes(job.status)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const latest = await getImageWorkbenchApi().getVideoSequenceExport(job.id);
        if (!latest) throw new Error("导出任务状态丢失，请重试导出。");
        job = latest;
        toast.loading(translateSourceText("正在拼接视频... {{ui:0}}%", [Math.round((job.progress ?? 0) * 100)]), { id: toastId });
      }
      if (job.status !== "completed") {
        throw new Error(job.error?.message || (job.status === "cancelled" ? "导出已取消。" : "导出失败或等待超时。"));
      }
      const exportVersionId = job.exportVersionId
        ?? (await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id }))?.activeExportVersionId;
      if (!exportVersionId) throw new Error("导出完成但缺少可保存的版本记录。");
      const saved = await getImageWorkbenchApi().saveVideoSequenceExport({
        boardId: current.boardId, sequenceId: current.id, exportVersionId
      });
      toast.success(saved.ok ? translateSourceText("视频已保存") : translateSourceText("导出已完成，可再次点击导出保存"), { id: toastId });
      await refreshActiveVideoSequence();
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "视频导出失败。");
      toast.error(message, { id: toastId, duration: Infinity, action: { label: "重试", onClick: retry } });
    }
}
