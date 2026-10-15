import { useUiText } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { Compass, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import type { InspirationSource } from "@shared/inspiration-sources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { toast } from "sonner";

const ACCENT_CLASS = "text-muted-foreground";

/** 来源由 Manage 下发；在本地筛选以避免每次输入都产生网络请求。 */
export function InspirationSources(): React.ReactElement {
  const uiText = useUiText();

  const [sources, setSources] = useState<InspirationSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const visibleSources = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return sources;
    return sources.filter((source) => [source.name, source.category, source.description, new URL(source.url).host].join(" ").toLocaleLowerCase().includes(keyword));
  }, [query, sources]);

  useEffect(() => {
    let active = true;
    void getImageWorkbenchApi().listInspirationSources()
      .then((items) => { if (active) setSources(items); })
      .catch((error) => { if (active) toast.error(getWorkbenchErrorMessage(error, "无法读取灵感来源。")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function openSource(id: string): Promise<void> {
    if (openingId) return;
    setOpeningId(id);
    try { await getImageWorkbenchApi().openInspirationSource(id); } catch (error) { toast.error(getWorkbenchErrorMessage(error, "无法打开灵感来源。")); } finally { setOpeningId(null); }
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[oklch(var(--workspace-surface))]">
    <header className="window-titlebar-overlay-safe flex h-12 shrink-0 items-center gap-4 border-b border-border bg-background px-4 [-webkit-app-region:drag]">
      <div className="flex shrink-0 items-center gap-2">
        <Compass className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight">{uiText("灵感来源")}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{loading ? uiText("正在读取") : uiText("{{ui:0}}{{ui:1}} 个来源", [visibleSources.length, query.trim() ? ` / ${sources.length}` : ""])}</span>
      </div>
      <label className="ml-auto flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-input bg-muted/55 px-2.5 text-muted-foreground transition-colors focus-within:border-ring focus-within:bg-background [-webkit-app-region:no-drag]">
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">{uiText("搜索灵感来源")}</span>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={uiText("搜索名称、分类或网站")} className="h-auto min-w-0 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0" aria-label={uiText("搜索灵感来源")} />
      </label>
    </header>
    <section
      aria-label={uiText("已接入的灵感来源")}
      className="mx-auto grid w-full max-w-[1440px] [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3 px-3 py-4 sm:gap-4 sm:px-5 sm:py-5 lg:px-8 lg:py-7"
    >
      {loading ? Array.from({ length: 8 }, (_, index) => (
        <article key={index} aria-hidden="true" className="flex min-h-48 flex-col rounded-md border border-[oklch(var(--library-divider))] bg-card p-4 dark:border-border">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="block h-3.5 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <span className="block h-3 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <span className="block h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="h-3 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <span className="h-8 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </article>
      )) : null}
      {!loading ? visibleSources.map((source) => {
        const opening = openingId === source.id;
        const host = new URL(source.url).host;
        return <article key={source.id} className="flex min-h-48 min-w-0 flex-col rounded-md border border-[oklch(var(--library-divider))] bg-card p-4 dark:border-border">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded", ACCENT_CLASS)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {source.iconUrl ? <img src={source.iconUrl} alt="" className="absolute inset-0 h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">{source.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{source.category}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-4 text-muted-foreground">{uiText("外部来源")}</span>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-foreground/75 [overflow-wrap:anywhere]">{source.description}</p>
          <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-border pt-4">
            <span className="min-w-0 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{host}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={opening}
              onClick={() => void openSource(source.id)}
              className="h-8 shrink-0 whitespace-nowrap px-2.5"
              aria-label={`${opening ? "正在打开" : "浏览"}${source.name}`}
              title={uiText("浏览 {{ui:0}}", [source.name])}
            >
              {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
              {opening ? uiText("打开中") : uiText("浏览")}
            </Button>
          </div>
        </article>;
      }) : null}
      {!loading && visibleSources.length === 0 ? <p className="col-span-full py-16 text-center text-sm text-muted-foreground">{uiText("未找到匹配的灵感来源")}</p> : null}
    </section>
  </div>;
}
