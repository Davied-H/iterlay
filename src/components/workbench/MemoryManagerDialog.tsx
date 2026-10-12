import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";
import type {
  AssistantMemoryDetail,
  AssistantMemoryEvidence,
  AssistantMemoryStats
} from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

interface MemoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatsChange?: (stats: AssistantMemoryStats) => void;
}

const STATUS_META: Record<AssistantMemoryDetail["status"], { label: string; className: string }> = {
  active: { label: "有效", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  candidate: { label: "候选", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  expired: { label: "已过期", className: "bg-muted text-muted-foreground" }
};

const KIND_LABEL: Record<AssistantMemoryDetail["kind"], string> = {
  episodic: "近期经历",
  semantic: "偏好认知",
  procedural: "创作经验"
};

const SCOPE_LABEL: Record<AssistantMemoryDetail["scope"], string> = {
  asset: "当前素材",
  board: "当前画板",
  scene: "当前模板",
  global: "全局"
};

const EVENT_LABEL: Record<AssistantMemoryEvidence["type"], string> = {
  prompt_draft: "提示词草稿",
  prompt_submitted: "提交提示词",
  assistant_generated: "助手生成",
  assistant_conversation: "助手对话",
  comment_added: "作品评论",
  generation_succeeded: "生成成功",
  generation_failed: "生成失败"
};

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间未知";
  return new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function EvidenceIcon({ evidence }: { evidence: AssistantMemoryEvidence }): React.ReactElement {
  if (evidence.type === "comment_added" || evidence.type === "assistant_conversation") {
    return <MessageSquareText className="h-3.5 w-3.5" />;
  }
  if (evidence.type === "generation_succeeded") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (evidence.type === "assistant_generated") return <Sparkles className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

export function MemoryManagerDialog({
  open,
  onOpenChange,
  onStatsChange
}: MemoryManagerDialogProps): React.ReactElement {
  const [memories, setMemories] = useState<AssistantMemoryDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    void getImageWorkbenchApi().listMemories()
      .then((items) => {
        if (cancelled) return;
        setMemories(items);
        setSelectedId((current) => current && items.some((item) => item.id === current)
          ? current
          : items[0]?.id ?? null);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getWorkbenchErrorMessage(loadError, "读取记忆失败。"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredMemories = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return memories;
    return memories.filter((memory) => [
      memory.content,
      memory.generationReason,
      KIND_LABEL[memory.kind],
      SCOPE_LABEL[memory.scope],
      ...memory.evidence.map((evidence) => evidence.summary)
    ].some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [memories, query]);

  const selected = memories.find((memory) => memory.id === selectedId) ?? null;

  async function organizeMemories(): Promise<void> {
    setOrganizing(true);
    setError(null);
    setNotice(null);
    try {
      const api = getImageWorkbenchApi();
      const result = await api.generateMemories();
      const items = await api.listMemories();
      setMemories(items);
      setSelectedId((current) => current && items.some((item) => item.id === current)
        ? current
        : items[0]?.id ?? null);
      onStatsChange?.(result.stats);
      if (result.generatedMemoryCount === 0) {
        setNotice("现有记录中没有足够可靠的新结论，已保留原有记忆。");
      }
    } catch (organizeError) {
      setError(getWorkbenchErrorMessage(organizeError, "整理记忆失败。"));
    } finally {
      setOrganizing(false);
    }
  }

  async function generateMemories(): Promise<void> {
    setOrganizing(true);
    setError(null);
    setNotice(null);
    try {
      const api = getImageWorkbenchApi();
      const result = await api.generateMemories();
      const items = await api.listMemories();
      setMemories(items);
      setSelectedId(items[0]?.id ?? null);
      onStatsChange?.(result.stats);
      if (result.generatedMemoryCount === 0) {
        setNotice("暂时没有可用于生成记忆的历史记录。继续创作或与助手对话后再试。");
      }
    } catch (generateError) {
      setError(getWorkbenchErrorMessage(generateError, "生成记忆失败。"));
    } finally {
      setOrganizing(false);
    }
  }

  async function deleteMemory(memory: AssistantMemoryDetail): Promise<void> {
    if (!window.confirm("删除这条记忆？删除后，相同的已有来源记录不会再次生成它。")) return;
    setDeletingId(memory.id);
    setError(null);
    try {
      const api = getImageWorkbenchApi();
      const result = await api.deleteMemory(memory.id);
      if (!result.ok) throw new Error("这条记忆已不存在。");
      const next = memories.filter((item) => item.id !== memory.id);
      setMemories(next);
      setSelectedId(next[0]?.id ?? null);
      onStatsChange?.(await api.getMemoryStats());
    } catch (deleteError) {
      setError(getWorkbenchErrorMessage(deleteError, "删除记忆失败。"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/40 dark:bg-black/70"
        className="flex h-[min(680px,calc(100vh-40px))] w-[min(940px,calc(100vw-40px))] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border/80 p-0 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-5 border-b border-border/70 px-6 py-4 pr-14">
          <DialogHeader className="min-w-0">
            <DialogTitle>记忆管理</DialogTitle>
            <DialogDescription>查看助手记住了什么，以及每条记忆的生成依据。</DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || organizing}
            onClick={() => void (memories.length === 0 ? generateMemories() : organizeMemories())}
          >
            {organizing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : memories.length === 0
                ? <Sparkles className="h-3.5 w-3.5" />
                : <RefreshCw className="h-3.5 w-3.5" />}
            {memories.length === 0 ? "一键生成" : "一键整理"}
          </Button>
        </div>

        {error ? (
          <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-6 py-2.5 text-xs text-destructive">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="shrink-0 border-b border-border/60 bg-muted/35 px-6 py-2.5 text-xs text-muted-foreground">
            {notice}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border/70 bg-muted/20">
            <div className="shrink-0 border-b border-border/60 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索记忆或来源"
                  aria-label="搜索记忆或来源"
                  className="h-8 bg-background pl-8 text-xs"
                />
              </div>
              <p className="mt-2 px-0.5 text-[11px] text-muted-foreground">
                {query.trim() ? `${filteredMemories.length} 条匹配` : `共 ${memories.length} 条记忆`}
              </p>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {loading ? (
                <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在读取记忆…
                </div>
              ) : filteredMemories.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <FileText className="mx-auto h-5 w-5 text-muted-foreground/60" />
                  <p className="mt-3 text-xs font-medium">{memories.length === 0 ? "还没有记忆" : "没有匹配的记忆"}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {memories.length === 0 ? "点击一键生成，从已有提示词、生成记录和助手对话中整理。" : "试试搜索提示词、评论或来源类型。"}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredMemories.map((memory) => {
                    const status = STATUS_META[memory.status];
                    const isSelected = memory.id === selectedId;
                    return (
                      <button
                        key={memory.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedId(memory.id)}
                        className={cn(
                          "w-full border-b border-border/50 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/55"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", status.className)}>{status.label}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(memory.lastReinforcedAt)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 break-words text-xs font-medium leading-5">{memory.content}</p>
                        <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
                          {KIND_LABEL[memory.kind]} · {SCOPE_LABEL[memory.scope]} · {memory.evidenceCount} 条依据
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </aside>

          <main className="min-h-0 min-w-0 bg-background">
            {selected ? (
              <ScrollArea className="h-full">
                <div className="px-7 py-6">
                  <div className="flex items-start justify-between gap-5 border-b border-border/60 pb-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={cn("rounded px-1.5 py-0.5 font-medium", STATUS_META[selected.status].className)}>
                          {STATUS_META[selected.status].label}
                        </span>
                        <span>{KIND_LABEL[selected.kind]}</span>
                        <span>·</span>
                        <span>{SCOPE_LABEL[selected.scope]}</span>
                      </div>
                      <p className="mt-3 break-words text-sm font-medium leading-6 text-foreground">{selected.content}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={deletingId === selected.id}
                      onClick={() => void deleteMemory(selected)}
                    >
                      {deletingId === selected.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                      删除记忆
                    </Button>
                  </div>

                  <section className="border-b border-border/60 py-5">
                    <h3 className="text-xs font-semibold">如何生成</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.generationReason}</p>
                    <dl className="mt-4 grid grid-cols-3 gap-4 text-[11px]">
                      <div>
                        <dt className="text-muted-foreground">可信度</dt>
                        <dd className="mt-1 font-medium text-foreground">{Math.round(selected.confidence * 100)}%</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">强化 / 降权</dt>
                        <dd className="mt-1 font-medium text-foreground">{selected.positiveSignals} / {selected.negativeSignals}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">保留至</dt>
                        <dd className="mt-1 font-medium text-foreground">{new Date(selected.expiresAt).toLocaleDateString((document.documentElement.lang || "zh-CN"))}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-semibold">来源记录</h3>
                      <span className="text-[11px] text-muted-foreground">{selected.evidence.length} 条</span>
                    </div>
                    <ol className="mt-4 space-y-0">
                      {selected.evidence.map((evidence, index) => (
                        <li key={evidence.id} className="relative flex gap-3 pb-5 last:pb-0">
                          {index < selected.evidence.length - 1 ? (
                            <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-border" />
                          ) : null}
                          <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                            <EvidenceIcon evidence={evidence} />
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[11px] font-medium text-foreground">{EVENT_LABEL[evidence.type]}</span>
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock3 className="h-3 w-3" />
                                {formatDateTime(evidence.occurredAt)}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{evidence.summary}</p>
                            {evidence.assetPath ? (
                              <p className="mt-1 truncate text-[10px] text-muted-foreground/75" title={evidence.assetPath}>{evidence.assetPath}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center">
                <div>
                  <FileText className="mx-auto h-6 w-6 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium">选择一条记忆查看详情</p>
                  <p className="mt-1 text-xs text-muted-foreground">可以查看提炼原因、可信度和完整来源记录。</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
