import { useUiText } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import type { PiAgentLogEntry, PiAgentLogEvent } from "@shared/pi-agent-log";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<PiAgentLogEvent, string> = {
  agent_start: "启动",
  image_ready: "图片",
  model_start: "模型",
  model_end: "模型",
  turn_start: "轮次",
  decision: "判断",
  tool_start: "工具",
  tool_end: "结果",
  agent_end: "结束",
  error: "错误"
};

export function PiAgentLogPanel(): React.ReactElement {
  const uiText = useUiText();

  const [entries, setEntries] = useState<PiAgentLogEntry[]>([]);
  const [logPath, setLogPath] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    const api = getImageWorkbenchApi();
    const unsubscribe = api.onPiAgentLog((entry) => {
      if (disposed) return;
      setEntries((current) => appendUniqueEntry(current, entry));
    });
    void api.getPiAgentLogs()
      .then((snapshot) => {
        if (disposed) return;
        setEntries((current) => mergeEntries(snapshot.entries, current));
        setLogPath(snapshot.logPath);
      })
      .catch((reason) => {
        if (!disposed) setError(getWorkbenchErrorMessage(reason, "无法读取运行记录。"));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [entries, autoScroll]);

  async function clearLogs(): Promise<void> {
    if (!window.confirm("确定清空运行记录吗？磁盘中的日志文件也会被清空。")) return;
    setClearing(true);
    setError(null);
    try {
      await getImageWorkbenchApi().clearPiAgentLogs();
      setEntries([]);
    } catch (reason) {
      setError(getWorkbenchErrorMessage(reason, "无法清空运行记录。"));
    } finally {
      setClearing(false);
    }
  }

  async function openLogDirectory(): Promise<void> {
    setError(null);
    try {
      await getImageWorkbenchApi().openPiAgentLogDirectory();
    } catch (reason) {
      setError(getWorkbenchErrorMessage(reason, "无法打开日志目录。"));
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-4 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{uiText("运行记录")}</h3>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            {uiText("实时")}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{entries.length} {uiText("条")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {uiText("自动滚动")}<Switch
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              aria-label={uiText("自动滚动运行记录")}
              className="scale-90"
            />
          </label>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => void openLogDirectory()}
            aria-label={uiText("打开运行记录目录")}
            title={uiText("打开日志目录")}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={clearing || entries.length === 0}
            onClick={() => void clearLogs()}
            aria-label={uiText("清空运行记录")}
            title={uiText("清空日志")}
          >
            {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="h-[340px] overflow-y-auto border-y border-border/80 bg-muted/20 font-mono text-[11px] leading-5"
        aria-live="polite"
        aria-label={uiText("实时运行记录")}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {uiText("正在读取日志")}</div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center font-sans text-xs text-muted-foreground">
            {uiText("还没有运行记录。使用 MasterGo 可编辑稿还原功能后，这里会显示处理过程和工具调用。")}</div>
        ) : (
          <div className="divide-y divide-border/50">
            {entries.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-4 px-0.5">
        <p className="truncate text-[11px] text-muted-foreground" title={logPath}>
          {logPath || "日志保存在本机应用日志目录"}
        </p>
        <p className="shrink-0 text-[11px] text-muted-foreground">{uiText("敏感凭据、图片数据和完整 HTML 不会写入日志")}</p>
      </div>
      {error ? <p className="text-xs leading-5 text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}

function LogRow({ entry }: { entry: PiAgentLogEntry }): React.ReactElement {
  const uiText = useUiText();

  const details = entry.details && Object.keys(entry.details).length > 0
    ? JSON.stringify(entry.details, null, 2)
    : "";
  return (
    <div className="grid grid-cols-[68px_38px_minmax(0,1fr)] gap-2 px-3 py-2 hover:bg-muted/35">
      <time className="tabular-nums text-muted-foreground" dateTime={entry.timestamp}>
        {formatLogTime(entry.timestamp)}
      </time>
      <span
        className={cn(
          "font-sans font-medium",
          entry.level === "error"
            ? "text-destructive"
            : entry.level === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
        )}
      >
        {EVENT_LABELS[entry.event]}
      </span>
      <div className="min-w-0">
        <div className={cn("break-words text-foreground", entry.level === "error" && "text-destructive")}>
          {entry.toolName ? <span className="mr-2 text-sky-700 dark:text-sky-400">[{entry.toolName}]</span> : null}
          {entry.summary}
          {typeof entry.durationMs === "number" ? (
            <span className="ml-2 text-muted-foreground">{entry.durationMs}ms</span>
          ) : null}
        </div>
        {details ? (
          <details className="mt-1 text-muted-foreground">
            <summary className="cursor-pointer select-none font-sans text-[11px] hover:text-foreground">{uiText("查看详情")}</summary>
            <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words border-l border-border pl-2 text-[10px] leading-4">
              {details}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function appendUniqueEntry(entries: PiAgentLogEntry[], entry: PiAgentLogEntry): PiAgentLogEntry[] {
  if (entries.some((item) => item.id === entry.id)) return entries;
  return [...entries, entry].slice(-1_000);
}

function mergeEntries(first: PiAgentLogEntry[], second: PiAgentLogEntry[]): PiAgentLogEntry[] {
  const byId = new Map<string, PiAgentLogEntry>();
  for (const entry of [...first, ...second]) byId.set(entry.id, entry);
  return [...byId.values()]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-1_000);
}

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
