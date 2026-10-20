import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Images, Loader2, RotateCcw, Search, Star, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { AssetComment, AssetLibraryItem, AssetTagInfo, PromptSpec } from "@shared/types";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { AssetDetail } from "@/components/workbench/AssetDetail";
import { AssetCard } from "@/components/workbench/asset/AssetCard";
import { useMasonryGrid } from "@/components/workbench/asset/useMasonryGrid";
import { getThumbHashRatio } from "@/lib/thumbhash-placeholder";
import {
  ADDITION_MAX_DELAY,
  ADDITION_STAGGER,
  EASE_OUT,
  ENTRANCE_MAX_DELAY,
  ENTRANCE_STAGGER,
  ENTRANCE_VIEWPORT_MARGIN,
  ENTRANCE_Y
} from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LibraryFilterTabs } from "@/components/workbench/LibraryFilterTabs";
import { cn } from "@/lib/utils";

type SourceFilter = "all" | "generated" | "upload" | "slice";
type MediaFilter = "all" | "image" | "video";

const MEDIA_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" }
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "generated", label: "生成" },
  { value: "upload", label: "上传" },
  { value: "slice", label: "切图" }
];

const PAGE_SIZE = 40;
const SEARCH_PAGE_SIZE = 100;

const SOURCE_SEARCH_LABELS: Record<AssetLibraryItem["source"], string> = {
  generated: "生成 AI",
  upload: "上传 本地",
  slice: "切图 切片"
};

function getAssetSearchText(item: AssetLibraryItem): string {
  const fileName = item.imagePath.split(/[\\/]/u).pop() ?? "";
  return [
    item.prompt,
    item.boardName,
    item.tags.join(" "),
    SOURCE_SEARCH_LABELS[item.source],
    item.useCase,
    item.size,
    item.mediaType === "video" ? "视频 video" : "图片 image",
    fileName
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

interface AssetLibraryProps {
  playInitialEntrance: boolean;
  onInitialEntrancePlayed: () => void;
  comments: AssetComment[];
  onCopyText: (text: string) => void;
  onLocateAsset: (boardId: string, nodeId: string) => void;
  onAddComment: (imagePath: string, text: string) => void;
  onDeleteComment: (id: string) => void;
  onReusePrompt: (prompt: string, promptSpec?: PromptSpec) => void;
  onEditAsset: (boardId: string, nodeId: string) => void;
  onUseReference: (dataUrl: string) => void;
  onDeleteAsset: (boardId: string, nodeId: string) => Promise<void>;
}

/** 素材库：最短列优先的真瀑布流（绝对定位 + 视口窗口化），点开进入详情。 */
export function AssetLibrary({
  playInitialEntrance,
  onInitialEntrancePlayed,
  comments,
  onCopyText,
  onLocateAsset,
  onAddComment,
  onDeleteComment,
  onReusePrompt,
  onEditAsset,
  onUseReference,
  onDeleteAsset
}: AssetLibraryProps): React.ReactElement {
  const uiText = useUiText();

  const [assets, setAssets] = useState<AssetLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssetLibraryItem | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [hydratingSearch, setHydratingSearch] = useState(false);
  const [metaMap, setMetaMap] = useState<Map<string, AssetTagInfo>>(new Map());
  const reduceMotion = useReducedMotion();

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const enterOriginRef = useRef<DOMRect | null>(null);
  const playInitialEntranceRef = useRef(playInitialEntrance);
  const initialPopulationDoneRef = useRef(false);
  const normalizedQuery = submittedQuery.toLocaleLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const hasCustomizedView = mediaFilter !== "all"
    || sourceFilter !== "all"
    || favoriteOnly
    || selectedTag !== null
    || query.length > 0
    || submittedQuery.length > 0;

  const resetView = useCallback(() => {
    setMediaFilter("all");
    setSourceFilter("all");
    setFavoriteOnly(false);
    setSelectedTag(null);
    setQuery("");
    setSubmittedQuery("");
    setHydratingSearch(false);
  }, []);

  const submitSearch = useCallback(() => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      setQuery("");
      setSubmittedQuery("");
      return;
    }
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
  }, [query]);

  // Fetch assets + meta on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [page, metas] = await Promise.all([
          getImageWorkbenchApi().listAssets(undefined, PAGE_SIZE),
          getImageWorkbenchApi().listAssetMeta()
        ]);
        if (cancelled) return;
        // Merge meta into items.
        const metaByPath = new Map(metas.map((m) => [m.imagePath, m]));
        const merged = page.items.map((item) => {
          const m = metaByPath.get(item.imagePath);
          return m ? { ...item, favorite: m.favorite, tags: m.tags } : item;
        });
        setAssets(merged);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
        setMetaMap(metaByPath);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "素材加载失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || hasSearchQuery) return;
    setLoadingMore(true);
    try {
      const page = await getImageWorkbenchApi().listAssets(nextCursor, PAGE_SIZE);
      setAssets((current) => {
        const known = new Set(current.map((item) => item.imagePath));
        const additions = page.items
          .filter((item) => !known.has(item.imagePath))
          .map((item) => {
            const meta = metaMap.get(item.imagePath);
            return meta ? { ...item, favorite: meta.favorite, tags: meta.tags } : item;
          });
        return [...current, ...additions];
      });
      setTotal(page.total);
      setNextCursor(page.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translateSourceText("更多素材加载失败。"));
    } finally {
      setLoadingMore(false);
    }
  }, [hasSearchQuery, loadingMore, metaMap, nextCursor]);

  // 搜索时补齐当前快照的剩余分页，保证关键词作用于完整素材库而不只限于首屏。
  useEffect(() => {
    if (!hasSearchQuery || loading || !nextCursor) return;
    let cancelled = false;
    setHydratingSearch(true);

    void (async () => {
      try {
        let cursor: string | undefined = nextCursor;
        const additions: AssetLibraryItem[] = [];
        let latestTotal = total;
        while (cursor) {
          const page = await getImageWorkbenchApi().listAssets(cursor, SEARCH_PAGE_SIZE);
          additions.push(...page.items);
          latestTotal = page.total;
          cursor = page.nextCursor;
        }
        if (cancelled) return;
        setAssets((current) => {
          const merged = new Map(current.map((item) => [item.imagePath, item]));
          additions.forEach((item) => merged.set(item.imagePath, item));
          return Array.from(merged.values());
        });
        setTotal(latestTotal);
        setNextCursor(undefined);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : translateSourceText("搜索素材失败。"));
      } finally {
        if (!cancelled) setHydratingSearch(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSearchQuery, loading, nextCursor, total]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (
        !selected
        && (event.metaKey || event.ctrlKey)
        && event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  // Derive all unique tags from assets.
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of assets) {
      for (const tag of item.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [assets]);

  // 存在上传/切图素材时才展示「来源」分段筛选，避免纯生成画板出现无谓噪音。
  const hasAlternateSources = useMemo(() => assets.some((a) => a.source !== "generated"), [assets]);

  // Filtered assets.
  const filteredAssets = useMemo(() => {
    let filtered = assets;
    if (mediaFilter !== "all") {
      filtered = filtered.filter((item) => (item.mediaType ?? "image") === mediaFilter);
    }
    if (sourceFilter !== "all") filtered = filtered.filter((a) => a.source === sourceFilter);
    if (favoriteOnly) filtered = filtered.filter((a) => a.favorite);
    if (selectedTag) filtered = filtered.filter((a) => a.tags.includes(selectedTag));
    if (hasSearchQuery) {
      const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);
      filtered = filtered.filter((item) => {
        const searchText = getAssetSearchText(item);
        return tokens.every((token) => searchText.includes(token));
      });
    }
    return filtered;
  }, [assets, favoriteOnly, hasSearchQuery, mediaFilter, normalizedQuery, selectedTag, sourceFilter]);

  // ---------- 瀑布流布局与窗口化 ----------

  // 宽高比三级兜底：节点宽高 → thumbhash 近似比例 → 1:1。
  const masonryItems = useMemo(
    () =>
      filteredAssets.map((item) => ({
        key: item.imagePath,
        ratio:
          item.width && item.height && item.height > 0
            ? item.width / item.height
            : (getThumbHashRatio(item.thumbHash) ?? 1)
      })),
    [filteredAssets]
  );

  const { layout, visibleKeys, totalHeight, viewportHeight } = useMasonryGrid({
    items: masonryItems,
    scrollRef
  });

  const visibleItems = useMemo(
    () => filteredAssets.filter((item) => visibleKeys.has(item.imagePath)),
    [filteredAssets, visibleKeys]
  );

  // ---------- 卡片动画状态机 ----------
  // hasEntered：进过场的卡片不再重播进场（修掉旧版每次筛选重播 stagger 的问题）。
  // entranceDone：首屏批播完后，后续新增只做错峰淡入。
  const hasEnteredRef = useRef(new Set<string>());
  const entranceDoneRef = useRef(false);
  const [generation, setGeneration] = useState(0);
  const [filterExitActive, setFilterExitActive] = useState(false);
  const filterExitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (visibleItems.length === 0) return;
    const isInitialPopulation = !initialPopulationDoneRef.current;
    for (const item of visibleItems) hasEnteredRef.current.add(item.imagePath);
    entranceDoneRef.current = true;
    initialPopulationDoneRef.current = true;
    if (isInitialPopulation && playInitialEntranceRef.current) onInitialEntrancePlayed();
  }, [generation, onInitialEntrancePlayed, visibleItems]);

  // 筛选切换：回顶；浅滚动时开启退场动画窗口（FLIP 滑移），深滚动时整批重挂载只淡入。
  const filterKey = `${mediaFilter}|${sourceFilter}|${favoriteOnly ? 1 : 0}|${selectedTag ?? ""}|${normalizedQuery}`;
  const previousFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (previousFilterKeyRef.current === filterKey) return;
    previousFilterKeyRef.current = filterKey;
    const element = scrollRef.current;
    const deepScrolled = element ? element.scrollTop > element.clientHeight * 1.5 : false;
    element?.scrollTo({ top: 0 });
    if (deepScrolled) {
      // 深滚动位置切筛选：留存卡片会跨上千 px 飞行，观感差于直接重挂载淡入。
      hasEnteredRef.current.clear();
      setGeneration((value) => value + 1);
    } else {
      setFilterExitActive(true);
      if (filterExitTimerRef.current) window.clearTimeout(filterExitTimerRef.current);
      filterExitTimerRef.current = window.setTimeout(() => setFilterExitActive(false), 350);
    }
  }, [filterKey]);

  useEffect(
    () => () => {
      if (filterExitTimerRef.current) window.clearTimeout(filterExitTimerRef.current);
    },
    []
  );

  // ---------- 无限滚动 ----------
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // nextCursor 每页变化都会重建 observer：解决「哨兵一直在 rootMargin 内不再触发」的经典问题。
  useEffect(() => {
    const rootElement = scrollRef.current;
    const target = sentinelRef.current;
    if (!rootElement || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreRef.current();
      },
      { root: rootElement, rootMargin: "600px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [nextCursor, loading]);

  // Selected index in filtered list.
  const selectedIndex = selected
    ? filteredAssets.findIndex((a) => a.imagePath === selected.imagePath)
    : -1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < filteredAssets.length - 1;

  const onPrev = useCallback(() => {
    if (selectedIndex > 0) {
      enterOriginRef.current = null;
      setSelected(filteredAssets[selectedIndex - 1]);
    }
  }, [selectedIndex, filteredAssets]);

  const onNext = useCallback(() => {
    if (selectedIndex < filteredAssets.length - 1) {
      enterOriginRef.current = null;
      setSelected(filteredAssets[selectedIndex + 1]);
    }
  }, [selectedIndex, filteredAssets]);

  // Open asset by board+node (for lineage jump).
  const onOpenAssetByNode = useCallback(
    async (boardId: string, nodeId: string) => {
      const match = assets.find((a) => a.boardId === boardId && a.nodeId === nodeId);
      if (match) {
        setSelected(match);
        return;
      }
      try {
        const item = await getImageWorkbenchApi().getAsset(boardId, nodeId);
        if (!item) return;
        setAssets((current) => current.some((candidate) => candidate.imagePath === item.imagePath) ? current : [...current, item]);
        setSelected(item);
      } catch {
        toast.error(translateSourceText("来源素材已不可用。"));
      }
    },
    [assets]
  );

  // Sync meta after detail changes (favorite/tags toggled in detail view).
  const refreshMeta = useCallback(async () => {
    try {
      const metas = await getImageWorkbenchApi().listAssetMeta();
      const metaByPath = new Map(metas.map((m) => [m.imagePath, m]));
      setMetaMap(metaByPath);
      setAssets((prev) =>
        prev.map((item) => {
          const m = metaByPath.get(item.imagePath);
          return m ? { ...item, favorite: m.favorite, tags: m.tags } : item;
        })
      );
      // Also update selected if it exists.
      setSelected((prev) => {
        if (!prev) return prev;
        const m = metaByPath.get(prev.imagePath);
        return m ? { ...prev, favorite: m.favorite, tags: m.tags } : prev;
      });
    } catch {
      // silent
    }
  }, []);

  // 从详情返回只刷新元数据，列表保持原位且不重播整批进场。
  const handleBack = useCallback(() => {
    setSelected(null);
    void refreshMeta();
  }, [refreshMeta]);

  const handleOpen = useCallback((item: AssetLibraryItem, element: HTMLElement) => {
    if (item.mediaType === "video") {
      onLocateAsset(item.boardId, item.nodeId);
      return;
    }
    enterOriginRef.current = element.getBoundingClientRect();
    setSelected(item);
  }, [onLocateAsset]);

  const handleToggleFavorite = useCallback(
    (item: AssetLibraryItem) => {
      void (async () => {
        try {
          await getImageWorkbenchApi().toggleAssetFavorite(item.imagePath);
          await refreshMeta();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : translateSourceText("收藏操作失败。"));
        }
      })();
    },
    [refreshMeta]
  );

  const handleDelete = useCallback(
    async (item: AssetLibraryItem) => {
      setAssets((current) => current.filter((candidate) => candidate.imagePath !== item.imagePath));
      setTotal((current) => Math.max(0, current - 1));
      setSelected((current) => (current?.imagePath === item.imagePath ? null : current));
      try {
        await onDeleteAsset(item.boardId, item.nodeId);
      } catch (err) {
        setAssets((current) =>
          current.some((candidate) => candidate.imagePath === item.imagePath) ? current : [...current, item]
        );
        setTotal((current) => current + 1);
        toast.error(err instanceof Error ? err.message : translateSourceText("删除素材失败。"));
      }
    },
    [onDeleteAsset]
  );

  // 进场错峰：只对「尚未进过场」的可见卡片编号（首屏批带上移，之后的新增只淡入）。
  const isInitialPopulation = !initialPopulationDoneRef.current;
  const firstBatch = isInitialPopulation && playInitialEntranceRef.current && !entranceDoneRef.current;
  const entranceViewportBottom =
    (scrollRef.current?.scrollTop ?? 0) + viewportHeight + ENTRANCE_VIEWPORT_MARGIN;
  let pendingEntranceIndex = 0;
  const cards = visibleItems.map((item) => {
    const cardRect = layout.rects.get(item.imagePath);
    if (!cardRect) return null;
    let entranceDelay: number | null = null;
    // 后续挂载时首批卡片直接显示；首次应用进入才执行整批上移动画。
    if (!hasEnteredRef.current.has(item.imagePath) && (!isInitialPopulation || firstBatch)) {
      const index = pendingEntranceIndex;
      pendingEntranceIndex += 1;
      entranceDelay = firstBatch
        ? Math.min(index * ENTRANCE_STAGGER, ENTRANCE_MAX_DELAY)
        : Math.min(index * ADDITION_STAGGER, ADDITION_MAX_DELAY);
    }
    return (
      <AssetCard
        key={`g${generation}:${item.imagePath}`}
        item={item}
        rect={cardRect}
        entranceDelay={entranceDelay}
        entranceWithLift={firstBatch}
        entranceOffset={Math.max(
          ENTRANCE_Y,
          entranceViewportBottom - cardRect.y
        )}
        animatePosition
        reduceMotion={Boolean(reduceMotion)}
        onOpen={handleOpen}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDelete}
      />
    );
  });

  // 列表常驻 + 详情覆盖层保留滚动位置，详情返回不重挂载卡片。
  // 覆盖层淡入期间由 AssetDetail 内的 enterOrigin FLIP 完成卡片 → 大图的展开。
  return (
    <div className="relative flex h-full flex-col">
      <div className="library-content flex h-full min-h-0 flex-col" inert={selected ? true : undefined}>
      <header className="workbench-page-header window-titlebar-overlay-safe flex h-12 shrink-0 items-center gap-3 px-4 [-webkit-app-region:drag]">
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">{uiText("素材库")}</span>
          <span className="relative grid text-xs tabular-nums text-muted-foreground">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              {total} / {total} {uiText("项素材")}</span>
            <span className="col-start-1 row-start-1">
              {filteredAssets.length}{total > assets.length ? ` / ${total}` : ""} {uiText("项素材")}</span>
          </span>
        </div>

        {/* Filter bar */}
        {!loading && !error && assets.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden [-webkit-app-region:no-drag]">
            <LibraryFilterTabs
              value={mediaFilter}
              options={MEDIA_OPTIONS}
              ariaLabel={uiText("素材类型")}
              onValueChange={setMediaFilter}
            />
            <span className="h-4 w-px shrink-0 bg-border" />
            {/* 来源分段：仅当存在上传素材时展示，避免无谓噪音 */}
            {hasAlternateSources && (
              <LibraryFilterTabs
                value={sourceFilter}
                options={SOURCE_OPTIONS}
                ariaLabel={uiText("素材来源")}
                onValueChange={setSourceFilter}
              />
            )}
            {/* 收藏切换：与来源正交，独立开关 */}
            <Button
              variant={favoriteOnly ? "default" : "outline"}
              size="sm"
              className="h-7 shrink-0 gap-1 px-2.5 text-xs"
              aria-pressed={favoriteOnly}
              onClick={() => setFavoriteOnly((v) => !v)}
            >
              <Star className={cn("h-3 w-3", favoriteOnly && "fill-current")} />
              {uiText("收藏")}</Button>
            {allTags.length > 0 && (
              <>
                <span className="h-4 w-px shrink-0 bg-border" />
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTag === tag ? "default" : "outline"}
                      className="shrink-0 cursor-pointer whitespace-nowrap text-[10px]"
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
              disabled={!hasCustomizedView}
              onClick={resetView}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {uiText("重置")}</Button>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-6 pb-24">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredAssets.length === 0 && hydratingSearch ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            {uiText("正在搜索全部素材")}</div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
              {mediaFilter === "video" ? <Video className="h-6 w-6" /> : <Images className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {assets.length === 0 ? uiText("还没有素材") : uiText("没有匹配的素材")}
              </p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {assets.length === 0
                  ? uiText("生成或导入的图片与视频会自动汇集到这里。")
                  : hasSearchQuery
                    ? uiText("尝试换个关键词，或调整当前筛选条件。")
                    : uiText("尝试切换筛选条件。")}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative" style={{ height: totalHeight }}>
              <AnimatePresence initial={playInitialEntranceRef.current} custom={filterExitActive && !reduceMotion}>
                {cards}
              </AnimatePresence>
            </div>
            {nextCursor && <div ref={sentinelRef} aria-hidden className="h-px" />}
            {loadingMore && (
              <div className="flex justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {!loading && !error && assets.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-6">
          <form
            role="search"
            className="pointer-events-auto w-[min(520px,100%)]"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || !event.currentTarget.value) return;
                  event.preventDefault();
                  setQuery("");
                  setSubmittedQuery("");
                }}
                placeholder={uiText("搜索提示词、标签或画板")}
                aria-label={uiText("搜索素材")}
                aria-busy={hydratingSearch}
                className={cn(
                  "h-12 rounded-2xl border-border/80 bg-card/95 pl-11 text-sm shadow-[0_2px_10px_hsl(0_0%_0%/0.14)] backdrop-blur-md placeholder:text-muted-foreground transition-[border-color,background-color,box-shadow] duration-200 ease-out focus-visible:border-foreground/40 focus-visible:shadow-[0_2px_12px_hsl(0_0%_0%/0.18)] motion-reduce:transition-none",
                  query && "pr-[84px]"
                )}
              />
              {query ? (
                <button
                  type="button"
                  aria-label={uiText("清除搜索")}
                  title={uiText("清除搜索")}
                  className="absolute right-12 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setQuery("");
                    setSubmittedQuery("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!query.trim() || hydratingSearch}
                aria-label={hydratingSearch ? uiText("正在搜索素材") : uiText("搜索素材")}
                className={cn(
                  "absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md transition-[color,background-color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default motion-reduce:transition-none",
                  query.trim()
                    ? "bg-foreground text-background hover:bg-foreground/85"
                    : "bg-muted text-muted-foreground/55"
                )}
              >
                {hydratingSearch ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            key="asset-detail"
            className="absolute inset-0 z-40 bg-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
          >
            <AssetDetail
              key={`${selected.boardId}:${selected.nodeId}`}
              item={selected}
              comments={comments}
              enterOrigin={enterOriginRef.current}
              onBack={handleBack}
              onCopyText={onCopyText}
              onLocateAsset={onLocateAsset}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              onReusePrompt={onReusePrompt}
              onEditAsset={onEditAsset}
              onUseReference={onUseReference}
              onDeleteAsset={(boardId, nodeId) => {
                const item = assets.find((candidate) => candidate.boardId === boardId && candidate.nodeId === nodeId);
                if (item) void handleDelete(item);
              }}
              onOpenAssetByNode={onOpenAssetByNode}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={onPrev}
              onNext={onNext}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
