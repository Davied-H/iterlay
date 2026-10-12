import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronRight, CircleAlert, Clock3, FileText, ListTodo, Loader2, Pause, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { pausePiTemplateAgentTask, removePiTemplateAgentTask, type PiTemplateAgentPhase, type PiTemplateAgentTask, usePiTemplateAgentTasks } from "@/lib/pi-template-agent";

const PHASE_LABELS: Record<PiTemplateAgentPhase, string> = {
  extract: "提取规则",
  generate: "生成验证稿",
  review: "复核中",
  refine: "修订中",
  paused: "已暂停",
  complete: "已完成",
  error: "失败"
};

const PHASE_STYLES: Record<PiTemplateAgentPhase, { label: string; className: string }> = {
  extract: { label: "正在提取", className: "border-[hsl(var(--ai-accent)/0.18)] bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]" },
  generate: { label: "正在生成", className: "border-[hsl(var(--ai-accent)/0.18)] bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]" },
  review: { label: "正在复核", className: "border-[hsl(var(--ai-accent)/0.18)] bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]" },
  refine: { label: "正在修订", className: "border-[hsl(var(--ai-accent)/0.18)] bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]" },
  paused: { label: "已暂停", className: "border-border bg-muted text-muted-foreground" },
  complete: { label: "已完成", className: "border-border bg-muted text-foreground" },
  error: { label: "需要处理", className: "border-destructive/30 bg-destructive/10 text-destructive" }
};

function isTerminal(phase: PiTemplateAgentPhase): boolean {
  return phase === "complete" || phase === "error";
}

function isPausedOrTerminal(phase: PiTemplateAgentPhase): boolean {
  return phase === "paused" || isTerminal(phase);
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDuration(startedAt: number, updatedAt: number): string {
  const seconds = Math.max(0, Math.floor((updatedAt - startedAt) / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

interface PiTemplateTaskCenterProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PiTemplateTaskCenter({ open: controlledOpen, onOpenChange }: PiTemplateTaskCenterProps): React.ReactElement {
  const tasks = usePiTemplateAgentTasks();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null, [selectedId, tasks]);
  const open = controlledOpen ?? uncontrolledOpen;

  function setOpen(nextOpen: boolean): void {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    if (!selectedId && tasks[0]) setSelectedId(tasks[0].id);
  }, [selectedId, tasks]);

  function removeTask(task: PiTemplateAgentTask): void {
    if (!isPausedOrTerminal(task.phase)) return;
    if (!window.confirm(`删除创建记录「${task.templateName || task.title}」？此操作无法恢复。`)) return;
    removePiTemplateAgentTask(task.id);
    if (selectedId === task.id) setSelectedId(null);
  }

  function pauseTask(task: PiTemplateAgentTask): void {
    if (isPausedOrTerminal(task.phase)) return;
    if (!window.confirm("暂停此创建任务？当前请求会在返回后停止，后续阶段不会继续执行。")) return;
    pausePiTemplateAgentTask(task.id);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <ListTodo className="h-4 w-4" />
        任务中心
        {tasks.some((task) => !isPausedOrTerminal(task.phase)) ? <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-foreground" aria-label="有任务正在运行" /> : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(660px,calc(100dvh-3rem))] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0">
          <DialogHeader className="border-b border-border px-6 py-5 text-left">
            <div className="flex items-center gap-3 pr-8">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]"><Bot className="h-[18px] w-[18px]" /></span>
              <div>
                <DialogTitle className="text-[15px]">模板智能创建</DialogTitle>
                <DialogDescription className="mt-1 text-xs">任务在后台持续执行；这里保留结果、失败原因与完整阶段记录。</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-sm:grid-cols-1">
            <nav className="min-h-0 overflow-y-auto border-r border-border bg-muted/25 max-sm:max-h-52 max-sm:border-b max-sm:border-r-0" aria-label="创建任务列表">
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <h3 className="text-xs font-semibold">创建记录</h3>
                {tasks.length ? <span className="text-[11px] tabular-nums text-muted-foreground">{tasks.length} 项</span> : null}
              </div>
              {tasks.length === 0 ? (
                <div className="flex h-full min-h-44 flex-col items-center justify-center px-6 text-center text-xs leading-5 text-muted-foreground">
                  <FileText className="mb-3 h-5 w-5" />
                  还没有创建任务。点击“创建模板”，选择“智能创建”即可开始。
                </div>
              ) : tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "group mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-1 rounded-lg px-1 py-1 text-left transition-colors",
                    selected?.id === task.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(task.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", task.phase === "error" ? "bg-destructive/10 text-destructive" : isPausedOrTerminal(task.phase) ? "bg-muted text-muted-foreground" : "bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]")}>
                      <TaskIcon phase={task.phase} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{task.templateName || task.title}</span>
                      <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">{PHASE_LABELS[task.phase]} · {formatTime(task.updatedAt)}</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                  {!isPausedOrTerminal(task.phase) ? (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label={`暂停创建任务 ${task.templateName || task.title}`} title="暂停创建任务" onClick={() => pauseTask(task)}>
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  {isPausedOrTerminal(task.phase) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`删除创建记录 ${task.templateName || task.title}`}
                      title="删除创建记录"
                      onClick={() => removeTask(task)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </nav>

            <section className="min-h-0 overflow-y-auto p-5" aria-label="任务详情">
              {selected ? <TaskDetail task={selected} /> : null}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaskDetail({ task }: { task: PiTemplateAgentTask }): React.ReactElement {
  const terminal = isPausedOrTerminal(task.phase);
  const status = PHASE_STYLES[task.phase];
  return (
    <div className="mx-auto max-w-[620px] px-1 pb-5 pt-1">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">任务详情</p>
          <h3 className="mt-1 truncate text-base font-semibold">{task.templateName || "模板智能创建"}</h3>
          <p className="mt-2 max-w-[62ch] text-xs leading-5 text-muted-foreground">{task.detail}</p>
        </div>
        <span className={cn("inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[11px] font-medium", status.className)}>
          <TaskIcon phase={task.phase} className="mr-1.5 h-3 w-3" />{status.label}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />已执行 {formatDuration(task.startedAt, task.updatedAt)}</span>
        <span className="inline-flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" />第 {task.attempt} 轮</span>
        <span className="tabular-nums">最后更新 {formatTime(task.updatedAt)}</span>
      </div>
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold">执行记录</h4>
          <span className="text-[11px] tabular-nums text-muted-foreground">{task.logs.length} 个阶段</span>
        </div>
        <ol className="mt-4 space-y-0">
          {task.logs.map((log, index) => (
            <li key={log.id} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
              <span className={cn("relative z-10 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background", log.phase === "error" ? "border-destructive/40 text-destructive" : index === task.logs.length - 1 && !terminal ? "border-[hsl(var(--ai-accent)/0.45)] text-[hsl(var(--ai-accent))]" : "border-border text-muted-foreground")}>
                <TaskIcon phase={log.phase} className="h-3 w-3" />
              </span>
              {index < task.logs.length - 1 ? <span className="absolute left-[9px] top-5 h-[calc(100%-4px)] w-px bg-border" /> : null}
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium">{PHASE_LABELS[log.phase]}</p><time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatTime(log.timestamp)}</time></div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{log.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function TaskIcon({ phase, className }: { phase: PiTemplateAgentPhase; className?: string }): React.ReactElement {
  if (phase === "error") return <CircleAlert className={cn("h-3.5 w-3.5", className)} />;
  if (phase === "paused") return <Pause className={cn("h-3.5 w-3.5", className)} />;
  if (phase === "complete") return <Check className={cn("h-3.5 w-3.5", className)} />;
  if (phase === "refine") return <RotateCcw className={cn("h-3.5 w-3.5", className)} />;
  if (phase === "extract") return <FileText className={cn("h-3.5 w-3.5", className)} />;
  return <Loader2 className={cn("h-3.5 w-3.5", phase !== "review" && "animate-spin motion-reduce:animate-none", className)} />;
}
