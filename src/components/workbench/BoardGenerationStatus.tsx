import { useEffect, useRef, useState } from "react";
import { Clock3, LoaderCircle } from "lucide-react";
import type { ActiveBoardGeneration } from "@/lib/active-board-generation";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface BoardGenerationStatusProps {
  tasks: ActiveBoardGeneration[];
  variant?: "compact" | "badge";
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}

export function BoardGenerationStatus({
  tasks,
  variant = "compact",
  side = "right",
  align = "center",
  className
}: BoardGenerationStatusProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const closeTimerRef = useRef<number | null>(null);
  const taskCount = tasks.length;
  const requestedCount = tasks.reduce((total, task) => total + Math.max(1, task.requestedCount), 0);
  const latestTask = tasks.reduce<ActiveBoardGeneration | undefined>(
    (latest, task) => !latest || task.startedAt > latest.startedAt ? task : latest,
    undefined
  );
  const startedAt = tasks.reduce(
    (earliest, task) => Math.min(earliest, task.startedAt),
    Number.POSITIVE_INFINITY
  );
  const allEditing = tasks.every((task) => task.mode === "edit");
  const allGenerating = tasks.every((task) => task.mode === "generate");
  const queuedCount = tasks.filter((task) => task.status === "queued").length;
  const allQueued = queuedCount === taskCount;
  const statusLabel = allQueued ? "排队中" : allEditing ? "正在编辑" : allGenerating ? "正在生成" : "正在处理";

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  if (taskCount === 0 || !latestTask) return null;

  function clearCloseTimer(): void {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function openDetails(): void {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose(): void {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
  }

  const countLabel = taskCount > 1
    ? `${taskCount} 个任务 · ${requestedCount} 张`
    : allEditing
      ? `${requestedCount} 个版本`
      : `${requestedCount} 张图片`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={`${statusLabel}，${countLabel}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseEnter={openDetails}
          onMouseLeave={scheduleClose}
          onFocus={openDetails}
          onBlur={scheduleClose}
          onClick={(event) => {
            event.stopPropagation();
            clearCloseTimer();
            setOpen((current) => !current);
          }}
          className={cn(
            "relative shrink-0 text-[hsl(var(--ai-accent))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant === "compact"
              ? "flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(var(--ai-muted))] hover:bg-[hsl(var(--ai-muted))]/75"
              : "inline-flex h-6 items-center gap-1.5 rounded-md bg-[hsl(var(--ai-muted))] px-2 text-[10px] font-semibold leading-none shadow-sm ring-1 ring-inset ring-[hsl(var(--ai-accent))]/15 hover:bg-[hsl(var(--ai-muted))]/80",
            className
          )}
        >
          {allQueued ? (
            <Clock3 aria-hidden="true" className={variant === "compact" ? "h-3.5 w-3.5" : "h-3 w-3"} />
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className={cn("animate-spin motion-reduce:animate-none", variant === "compact" ? "h-3.5 w-3.5" : "h-3 w-3")}
            />
          )}
          {variant === "badge" ? (
            <span>{allQueued ? statusLabel : statusLabel.replace("正在", "") + "中"}{taskCount > 1 ? ` · ${taskCount}` : ""}</span>
          ) : null}
        </button>
      </PopoverAnchor>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        className="w-64 rounded-lg p-3"
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]">
            {allQueued
              ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              : <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">{statusLabel}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {countLabel}{queuedCount > 0 && !allQueued ? ` · ${queuedCount} 个排队` : ""} · {allQueued ? "已等待" : "已进行"} {formatElapsed(now - startedAt)}
            </p>
          </div>
        </div>
        <div className="mt-2.5 border-t border-border/80 pt-2.5">
          <p className="text-[10px] font-medium text-muted-foreground">{taskCount > 1 ? "最近任务" : "提示词"}</p>
          <p className="mt-1 line-clamp-3 break-words text-xs leading-5 text-foreground">
            {latestTask.prompt || "未填写提示词"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatElapsed(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}
