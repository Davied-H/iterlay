import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ImageIcon,
  Video,
  LoaderCircle,
  LocateFixed,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import type { GenerationJob, JobStatus, ProviderConfig, VideoGenerationJob } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const LIST_TIME_FORMATTER = new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const CLOCK_FORMATTER = new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const FULL_TIME_FORMATTER = new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

/** 右侧浮层（历史/评论）共用的弹入弹出动画：从右侧轻微滑入 + 淡入。 */
export const railMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 }
} as const;

const statusMeta: Record<JobStatus, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}> = {
  succeeded: { label: "成功", icon: CheckCircle2, className: "text-[hsl(var(--ai-accent))]" },
  failed: { label: "失败", icon: AlertCircle, className: "text-destructive" },
  running: { label: "进行中", icon: LoaderCircle, className: "text-foreground" },
  queued: { label: "排队", icon: Clock3, className: "text-muted-foreground" }
};

interface HistoryRailProps {
  history: GenerationJob[];
  videoHistory: VideoGenerationJob[];
  providers: ProviderConfig[];
  thumbnailFor: (path: string) => string | undefined;
  loadThumbnail: (path: string) => Promise<string | undefined>;
  onFocusJob: (job: GenerationJob) => void;
  onReuseJob: (job: GenerationJob) => void;
  onClear: () => Promise<void>;
  onClose: () => void;
}

interface HistoryItemProps {
  job: GenerationJob;
  providers: ProviderConfig[];
  thumbnail?: string | null;
  open: boolean;
  pinned: boolean;
  onHoverOpen: (jobId: string) => void;
  onTogglePinned: (jobId: string) => void;
  onCloseDetails: (jobId: string) => void;
  onFocusJob: (job: GenerationJob) => void;
  onReuseJob: (job: GenerationJob) => void;
}

function formatDuration(job: GenerationJob): string | null {
  if (job.status !== "succeeded" || !job.completedAt) return null;
  const durationMs = new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

function formatListTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return CLOCK_FORMATTER.format(date);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${CLOCK_FORMATTER.format(date)}`;

  return LIST_TIME_FORMATTER.format(date);
}

function providerNameFor(job: GenerationJob, providers: ProviderConfig[]): string {
  if (job.providerName?.trim()) return job.providerName.trim();
  const byId = providers.find((provider) => provider.id === job.providerId);
  if (byId) return byId.name;

  const model = job.model?.trim() || job.input.model?.trim();
  const matches = model
    ? providers.filter((provider) => provider.model === model || provider.referenceModel === model)
    : [];
  return matches.length === 1 ? matches[0].name : "未记录";
}

function HistoryItem({
  job,
  providers,
  thumbnail,
  open,
  pinned,
  onHoverOpen,
  onTogglePinned,
  onCloseDetails,
  onFocusJob,
  onReuseJob
}: HistoryItemProps): React.ReactElement {
  const closeTimerRef = useRef<number | null>(null);
  const meta = statusMeta[job.status] ?? statusMeta.queued;
  const StatusIcon = meta.icon;
  const duration = formatDuration(job);
  const providerName = providerNameFor(job, providers);
  const model = job.model?.trim() || job.input.model?.trim() || "未记录";
  const mode = job.input.workflowMode === "edit" ? "编辑" : "生成";
  const canFocus = job.outputImagePaths.length > 0;

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  function clearCloseTimer(): void {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function scheduleClose(): void {
    clearCloseTimer();
    if (pinned) return;
    closeTimerRef.current = window.setTimeout(() => onCloseDetails(job.id), 160);
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) onCloseDetails(job.id);
  }

  function handleItemClick(): void {
    clearCloseTimer();
    onTogglePinned(job.id);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={handleItemClick}
          onFocus={() => onHoverOpen(job.id)}
          onMouseEnter={() => {
            clearCloseTimer();
            onHoverOpen(job.id);
          }}
          onMouseLeave={scheduleClose}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "group grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2.5 rounded-lg p-2 text-left transition-colors duration-150",
            "hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            open && "bg-accent"
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border/80">
            {thumbnail ? (
              <img src={thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="min-w-0 self-center">
            <span className="block truncate text-[13px] font-medium leading-5 text-foreground">
              {job.prompt || "无提示词"}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <span className={cn("inline-flex shrink-0 items-center gap-1", meta.className)}>
                <StatusIcon
                  className={cn("h-3 w-3", job.status === "running" && "animate-spin motion-reduce:animate-none")}
                  aria-hidden
                />
                <span>{meta.label}</span>
              </span>
              <span aria-hidden>·</span>
              <time className="min-w-0 truncate tabular-nums" dateTime={job.createdAt} title={FULL_TIME_FORMATTER.format(new Date(job.createdAt))}>
                {formatListTime(job.createdAt)}
              </time>
              {job.outputImagePaths.length > 1 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{job.outputImagePaths.length} 张</span>
                </>
              ) : null}
            </span>
          </span>
        </button>
      </PopoverAnchor>

      <PopoverContent
        side="left"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        className="w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-[0_2px_8px_hsl(0_0%_0%/0.14)] data-[state=closed]:!animate-none motion-reduce:!animate-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.className)}>
            <StatusIcon
              className={cn("h-3.5 w-3.5", job.status === "running" && "animate-spin motion-reduce:animate-none")}
              aria-hidden
            />
            {meta.label}
          </span>
          <time className="text-[11px] tabular-nums text-muted-foreground" dateTime={job.createdAt}>
            {FULL_TIME_FORMATTER.format(new Date(job.createdAt))}
          </time>
        </div>

        <div className="space-y-3 px-3.5 py-3">
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
            {job.prompt || "无提示词"}
          </p>

          {job.status === "failed" && job.error ? (
            <div className="rounded-lg bg-destructive/8 px-2.5 py-2 text-xs leading-5 text-destructive">
              {job.error}
            </div>
          ) : null}

          <dl className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs leading-5">
            <dt className="text-muted-foreground">来源</dt>
            <dd className="truncate text-foreground" title={providerName}>{providerName}</dd>
            <dt className="text-muted-foreground">模型</dt>
            <dd className="truncate text-foreground" title={model}>{model}</dd>
            <dt className="text-muted-foreground">任务</dt>
            <dd className="text-foreground">{mode} · {job.input.size}</dd>
            <dt className="text-muted-foreground">结果</dt>
            <dd className="text-foreground">
              {job.outputImagePaths.length} 张
              {duration ? <span className="text-muted-foreground"> · {duration}</span> : null}
            </dd>
            {job.referenceImagePaths.length > 0 ? (
              <>
                <dt className="text-muted-foreground">参考</dt>
                <dd className="text-foreground">{job.referenceImagePaths.length} 张图片</dd>
              </>
            ) : null}
          </dl>
        </div>

        <div className="flex items-center justify-end gap-1.5 border-t border-border bg-muted/35 px-2.5 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              onReuseJob(job);
              onCloseDetails(job.id);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            复用参数
          </Button>
          {canFocus ? (
            <Button
              size="sm"
              className="h-7"
              onClick={() => {
                onFocusJob(job);
                onCloseDetails(job.id);
              }}
            >
              <LocateFixed className="h-3.5 w-3.5" />
              定位到画布
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HistoryRail({
  history,
  videoHistory,
  providers,
  thumbnailFor,
  loadThumbnail,
  onFocusJob,
  onReuseJob,
  onClear,
  onClose
}: HistoryRailProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [loadedThumbnails, setLoadedThumbnails] = useState<Record<string, string | null>>({});
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [pinnedJobId, setPinnedJobId] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const totalCount = history.length + videoHistory.length;

  useEffect(() => {
    let active = true;
    const paths = Array.from(new Set(
      history
        .map((job) => job.outputImagePaths[0])
        .filter((path): path is string => Boolean(
          path && !thumbnailFor(path) && loadedThumbnails[path] === undefined
        ))
    )).slice(0, 2);
    if (paths.length === 0) return () => { active = false; };

    void Promise.all(paths.map(async (path) => ({ path, dataUrl: await loadThumbnail(path) }))).then((results) => {
      if (!active) return;
      setLoadedThumbnails((current) => {
        const next = { ...current };
        for (const { path, dataUrl } of results) next[path] = dataUrl ?? null;
        return next;
      });
    });
    return () => { active = false; };
  }, [history, loadThumbnail, loadedThumbnails, thumbnailFor]);

  async function confirmClear(): Promise<void> {
    setClearing(true);
    try {
      await onClear();
      setClearDialogOpen(false);
    } finally {
      setClearing(false);
    }
  }

  function openJobDetails(jobId: string): void {
    setPinnedJobId(null);
    setOpenJobId(jobId);
  }

  function togglePinnedJob(jobId: string): void {
    if (openJobId === jobId && pinnedJobId === jobId) {
      setOpenJobId(null);
      setPinnedJobId(null);
      return;
    }
    setOpenJobId(jobId);
    setPinnedJobId(jobId);
  }

  function closeJobDetails(jobId: string): void {
    setOpenJobId((current) => current === jobId ? null : current);
    setPinnedJobId((current) => current === jobId ? null : current);
  }

  return (
    <>
      <motion.aside
        {...railMotion}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE_OUT }}
        className="pointer-events-auto absolute bottom-4 right-4 top-16 z-10 flex w-[calc(100%-2rem)] max-w-[304px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_8px_hsl(0_0%_0%/0.12)]"
      >
        <TooltipProvider delayDuration={150}>
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">历史</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{totalCount} 条</span>
            </div>
            <div className="flex items-center gap-0.5">
              {totalCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setClearDialogOpen(true)}
                      aria-label="清空生成历史"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>清空当前画板的生成历史</TooltipContent>
                </Tooltip>
              ) : null}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="收起历史">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5">
            {totalCount === 0 ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
                <Clock3 className="mb-2 h-5 w-5 text-muted-foreground/70" aria-hidden />
                <p className="text-sm font-medium text-foreground">暂无生成历史</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">完成生成后，记录会自动出现在这里。</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {videoHistory.map((job) => <VideoHistoryItem key={job.id} job={job} />)}
                {history.map((job) => {
                  const outputPath = job.outputImagePaths[0];
                  const thumbnail = outputPath ? thumbnailFor(outputPath) ?? loadedThumbnails[outputPath] : undefined;
                  return (
                    <HistoryItem
                      key={job.id}
                      job={job}
                      providers={providers}
                      thumbnail={thumbnail}
                      open={openJobId === job.id}
                      pinned={pinnedJobId === job.id}
                      onHoverOpen={openJobDetails}
                      onTogglePinned={togglePinnedJob}
                      onCloseDetails={closeJobDetails}
                      onFocusJob={onFocusJob}
                      onReuseJob={onReuseJob}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </TooltipProvider>
      </motion.aside>

      <Dialog open={clearDialogOpen} onOpenChange={(open) => !clearing && setClearDialogOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>清空当前画板历史？</DialogTitle>
            <DialogDescription>这会删除当前画板的全部生成记录，但不会删除已经放到画布上的图片。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={clearing}>取消</Button>
            <Button variant="destructive" onClick={() => void confirmClear()} disabled={clearing}>
              {clearing ? "清空中…" : "确认清空"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoHistoryItem({ job }: { job: VideoGenerationJob }): React.ReactElement {
  const running = ["submitting", "queued", "generating", "post_processing", "recovering"].includes(job.status);
  const failed = job.status === "failed";
  const label = job.status === "completed" ? "成功" : failed ? "失败" : job.status === "cancelled" ? "已取消" : "进行中";
  const Icon = running ? LoaderCircle : failed ? AlertCircle : job.status === "completed" ? CheckCircle2 : Clock3;
  return (
    <div className="grid w-full grid-cols-[44px_minmax(0,1fr)] gap-2.5 rounded-lg p-2 text-left">
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border/80">
        <Video className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 self-center">
        <span className="block truncate text-[13px] font-medium leading-5 text-foreground">{job.input.prompt || "视频生成"}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
          <span className={cn("inline-flex shrink-0 items-center gap-1", failed && "text-destructive")}>
            <Icon className={cn("h-3 w-3", running && "animate-spin motion-reduce:animate-none")} aria-hidden />{label}
          </span>
          <span aria-hidden>·</span><time>{formatListTime(job.createdAt)}</time>
          <span aria-hidden>·</span><span className="min-w-0 truncate">{job.providerName || "视频"}</span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" title={job.model}>{job.model}</span>
        {job.error ? <span className="mt-1 block truncate text-[11px] text-destructive" title={job.error}>{job.error}</span> : null}
      </span>
    </div>
  );
}
