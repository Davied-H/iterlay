import { Check, Loader2, Pause, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePiTemplateAgentTask, type PiTemplateAgentPhase } from "@/lib/pi-template-agent";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<PiTemplateAgentPhase, string> = {
  extract: "提取风格", generate: "生成验证稿", review: "视觉复核", refine: "修订并复验", paused: "已暂停", complete: "已完成", error: "需要处理"
};

export function PiTemplateAgentStatus(): React.ReactElement | null {
  const task = usePiTemplateAgentTask();
  const [expanded, setExpanded] = useState(true);
  if (!task) return null;
  const terminal = task.phase === "complete" || task.phase === "error";
  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed bottom-5 right-5 z-[70] h-10 w-10 bg-background shadow-md"
        onClick={() => setExpanded(true)}
        aria-label="查看模板智能创建进度"
        title="查看创建进度"
      >
        {terminal ? <Check className="h-4 w-4" /> : task.phase === "paused" ? <Pause className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
      </Button>
    );
  }
  return (
    <aside className="fixed bottom-5 right-5 z-[70] w-[min(360px,calc(100vw-2.5rem))] border border-border bg-background shadow-lg" aria-live="polite" aria-label="模板智能创建后台任务">
      <div className="flex items-start gap-3 p-3.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", task.phase === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground")}>
          {terminal ? <Check className="h-4 w-4" /> : task.phase === "paused" ? <Pause className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">{task.title}</p>
            <Button variant="ghost" size="icon" className="-mr-1 -mt-1 h-7 w-7 text-muted-foreground" onClick={() => setExpanded(false)} aria-label="收起模板智能创建后台任务" title="收起"><X className="h-3.5 w-3.5" /></Button>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.detail}</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /><span>{PHASE_LABELS[task.phase]}</span>{task.attempt > 1 ? <span>第 {task.attempt} 轮</span> : null}{task.templateName ? <span className="truncate">{task.templateName}</span> : null}</div>
        </div>
      </div>
    </aside>
  );
}
