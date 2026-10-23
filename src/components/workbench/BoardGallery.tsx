import { useUiText } from "@/i18n";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Copy, ListFilter, RotateCcw, Sparkles, X } from "lucide-react";
import type {
  AssetLibraryItem,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GenerationJob,
  SceneAssistantReference
} from "@shared/types";
import { AiAssistant, type AiAssistantMessage } from "@/components/assistant/AiAssistant";
import { CircularGenerationGallery, type CircularGenerationItem } from "@/components/workbench/gallery/CircularGenerationGallery";
import { FilmGenerationGallery } from "@/components/workbench/gallery/FilmGenerationGallery";
import { GalleryModeSwitcher, type GalleryMode } from "@/components/workbench/gallery/GalleryModeSwitcher";
import { GenerationStack } from "@/components/workbench/gallery/GenerationStack";
import { LightboxGenerationGallery } from "@/components/workbench/gallery/LightboxGenerationGallery";
import { TimelineWheel, type TimelineBucket } from "@/components/workbench/gallery/TimelineWheel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildBoardGalleryItems,
  countBoardGallerySources,
  filterBoardGalleryItems,
  gallerySourceLabel,
  type BoardGalleryItem,
  type GallerySourceCounts,
  type GallerySourceFilter
} from "@/lib/board-gallery";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { loadGalleryThumbnail } from "@/lib/gallery-preload";
import { cn } from "@/lib/utils";

interface BoardGalleryProps {
  active: boolean;
  boardId: string;
  boardName: string;
  history: GenerationJob[];
  canCollaborate: boolean;
  onCollaborate: (request: Omit<CollaborateSceneRequest, "providerId">) => Promise<CollaborateSceneResult>;
  onLocate: (nodeId: string) => void;
  onReuse: (job: GenerationJob) => void;
  onCopyText: (text: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const GALLERY_CONTEXT_LIMIT = 18;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const SOURCE_FILTERS: Array<{ value: GallerySourceFilter; label: string }> = [
  { value: "all", label: "全部图片" },
  { value: "generated", label: "AI 生成" },
  { value: "upload", label: "本地上传" },
  { value: "slice", label: "切图" }
];

export function BoardGallery({
  active,
  boardId,
  boardName,
  history,
  canCollaborate,
  onCollaborate,
  onLocate,
  onReuse,
  onCopyText,
  onOpenSettings,
  onClose
}: BoardGalleryProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const [boardAssets, setBoardAssets] = useState<AssetLibraryItem[] | null>(null);
  const [sourceFilter, setSourceFilter] = useState<GallerySourceFilter>("all");
  const galleryItems = useMemo(
    () => buildBoardGalleryItems(boardId, history, boardAssets ?? []),
    [boardAssets, boardId, history]
  );
  const sourceCounts = useMemo(() => countBoardGallerySources(galleryItems), [galleryItems]);
  const reviewItems = useMemo(
    () => filterBoardGalleryItems(galleryItems, sourceFilter),
    [galleryItems, sourceFilter]
  );
  const allDayKeys = useMemo(
    () => Array.from(new Set(reviewItems.map((item) => localDayKey(item.createdAt)))),
    [reviewItems]
  );
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => allDayKeys[0] ?? null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>("orbit");
  const [stackOpen, setStackOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantValue, setAssistantValue] = useState("");
  const [assistantStreaming, setAssistantStreaming] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AiAssistantMessage[]>([]);
  const [imageUrlByPath, setImageUrlByPath] = useState<Record<string, string | null | undefined>>({});
  const imageUrlByPathRef = useRef(imageUrlByPath);
  const assistantRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setBoardAssets(null);
    setSourceFilter("all");
    setImageUrlByPath({});
    void loadBoardAssets(boardId).then((assets) => {
      if (!cancelled) setBoardAssets(assets);
    }).catch(() => {
      if (!cancelled) setBoardAssets([]);
    });
    return () => { cancelled = true; };
  }, [boardId]);

  useEffect(() => {
    imageUrlByPathRef.current = imageUrlByPath;
  }, [imageUrlByPath]);

  useEffect(() => {
    if (active) return;
    setImageUrlByPath((current) => {
      if (!Object.values(current).some((url) => url === null)) return current;
      return Object.fromEntries(
        Object.entries(current).map(([path, url]) => [path, url === null ? undefined : url])
      );
    });
  }, [active]);

  useEffect(() => {
    if (selectedDayKey && allDayKeys.includes(selectedDayKey)) return;
    setSelectedDayKey(allDayKeys[0] ?? null);
  }, [allDayKeys, selectedDayKey]);

  const visibleItems = useMemo(
    () => selectedDayKey ? reviewItems.filter((item) => localDayKey(item.createdAt) === selectedDayKey) : [],
    [reviewItems, selectedDayKey]
  );
  const timelineBuckets = useMemo<TimelineBucket[]>(() => {
    const counts = new Map<string, number>();
    for (const item of reviewItems) {
      const key = localDayKey(item.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return allDayKeys.map((key) => ({
      key,
      label: formatTimelineLabel(key),
      count: counts.get(key) ?? 0
    }));
  }, [allDayKeys, reviewItems]);
  const activeItem = visibleItems[activeIndex];
  const filterLabel = SOURCE_FILTERS.find((option) => option.value === sourceFilter)?.label ?? "全部图片";
  const scopeLabel = `${boardName} · ${filterLabel} · ${selectedDayKey ? formatTimelineLabel(selectedDayKey) : "暂无记录"}`;

  useEffect(() => {
    setActiveIndex(0);
    setStackOpen(false);
  }, [selectedDayKey]);

  const selectRelativeDay = useCallback((offset: number): void => {
    setSelectedDayKey((current) => {
      const currentIndex = Math.max(0, allDayKeys.indexOf(current ?? ""));
      const nextIndex = Math.max(0, Math.min(allDayKeys.length - 1, currentIndex + offset));
      return allDayKeys[nextIndex] ?? current;
    });
  }, [allDayKeys]);

  useEffect(() => {
    if (activeIndex >= visibleItems.length) setActiveIndex(Math.max(0, visibleItems.length - 1));
  }, [activeIndex, visibleItems.length]);

  useEffect(() => {
    if (!active) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        )
      );
      const unmodified = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if (!typing && unmodified && !stackOpen && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        selectRelativeDay(event.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (
        !typing &&
        unmodified &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Escape") return;
      if (stackOpen) setStackOpen(false);
      else if (assistantOpen) setAssistantOpen(false);
      else onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, assistantOpen, onClose, selectRelativeDay, stackOpen]);

  const loadThumbnail = useCallback((path: string): Promise<string | undefined> => {
    return loadGalleryThumbnail(path);
  }, []);

  const requestedThumbnailPaths = useMemo(() => {
    return visibleItems.map((item) => item.imagePath);
  }, [visibleItems]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const missing = requestedThumbnailPaths.filter((path) => imageUrlByPathRef.current[path] === undefined);
    void (async () => {
      for (let offset = 0; offset < missing.length; offset += 8) {
        const batch = missing.slice(offset, offset + 8);
        const results = await Promise.all(batch.map(async (path) => ({ path, url: await loadThumbnail(path) })));
        if (cancelled) return;
        setImageUrlByPath((current) => {
          const next = { ...current };
          for (const { path, url } of results) next[path] = url ?? null;
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [active, loadThumbnail, requestedThumbnailPaths]);

  const circularItems = useMemo<CircularGenerationItem[]>(() => visibleItems.map((item) => ({
    id: item.id,
    imageUrl: imageUrlByPath[item.imagePath],
    title: galleryItemTitle(item),
    meta: `${formatClock(item.createdAt)} · ${gallerySourceLabel(item.source)}`
  })), [imageUrlByPath, visibleItems]);

  useEffect(() => {
    assistantRequestRef.current += 1;
    setAssistantStreaming(false);
    setAssistantValue("");
    setAssistantMessages([{
      id: crypto.randomUUID(),
      role: "assistant",
      content: buildGalleryGreeting(scopeLabel, visibleItems.length)
    }]);
  }, [scopeLabel, visibleItems.length]);

  const selectImage = useCallback((index: number): void => {
    setActiveIndex(index);
    setStackOpen(false);
  }, []);

  const openImage = useCallback((index: number): void => {
    setActiveIndex(index);
    setStackOpen(true);
  }, []);

  const changeGalleryMode = useCallback((mode: GalleryMode): void => {
    setStackOpen(false);
    startTransition(() => setGalleryMode(mode));
  }, []);

  async function submitAssistant(): Promise<void> {
    const instruction = assistantValue.trim();
    if (!instruction || assistantStreaming) return;
    if (!canCollaborate) {
      onOpenSettings();
      return;
    }
    const requestVersion = assistantRequestRef.current + 1;
    assistantRequestRef.current = requestVersion;
    const assistantMessageId = crypto.randomUUID();
    const conversation = assistantMessages
      .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: instruction },
      { id: assistantMessageId, role: "assistant", content: "", streaming: true }
    ]);
    setAssistantValue("");
    setAssistantStreaming(true);

    try {
      const referencePaths = (activeItem ? [activeItem.imagePath] : visibleItems.map((item) => item.imagePath))
        .filter(Boolean)
        .slice(0, 4);
      const references = (await Promise.all(referencePaths.map((path, index) => readAssistantReference(path, index))))
        .filter((reference): reference is SceneAssistantReference => Boolean(reference));
      if (assistantRequestRef.current !== requestVersion) return;
      const result = await onCollaborate({
        instruction,
        referenceImages: references,
        currentFields: [
          { label: "画廊回顾范围", value: scopeLabel },
          { label: "范围内图片", value: buildGalleryContext(visibleItems) },
          ...(activeItem ? [{
            label: "当前选中图片",
            value: `${formatClock(activeItem.createdAt)}｜${gallerySourceLabel(activeItem.source)}｜${activeItem.prompt || "无提示词"}`
          }] : [])
        ],
        conversation,
        assistantSurface: "gallery-review",
        workflowMode: "generate",
        useCase: "other"
      });
      if (assistantRequestRef.current !== requestVersion) return;
      setAssistantMessages((current) => current.map((message) => (
        message.id === assistantMessageId
          ? { ...message, content: result.message, streaming: false }
          : message
      )));
    } catch (error) {
      if (assistantRequestRef.current !== requestVersion) return;
      const message = getWorkbenchErrorMessage(error, "创作回顾助手暂时不可用。");
      setAssistantMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? { ...item, content: message, streaming: false, tone: "error" }
          : item
      )));
    } finally {
      if (assistantRequestRef.current === requestVersion) setAssistantStreaming(false);
    }
  }

  function stopAssistant(): void {
    assistantRequestRef.current += 1;
    setAssistantStreaming(false);
    setAssistantMessages((current) => current.map((message) => (
      message.streaming ? { ...message, streaming: false } : message
    )));
  }

  return (
    <section
      data-board-gallery=""
      data-gallery-mode={galleryMode}
      aria-label={uiText("{{ui:0}}的图片画廊", [boardName])}
      className="dark absolute inset-0 z-40 isolate flex overflow-hidden bg-black text-foreground"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[176px] bg-black max-[760px]:h-[132px]"
      />

      <TooltipProvider delayDuration={220}>
        <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-2 px-4 pl-[84px] [-webkit-app-region:drag]">
          <button
            type="button"
            onClick={onClose}
            className="group flex h-8 items-center gap-2 rounded-md px-2 text-sm text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 [-webkit-app-region:no-drag]"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
            <span className="max-[560px]:sr-only">{uiText("返回画板")}</span>
          </button>
          <div className="pointer-events-none min-w-0 max-w-[240px] max-[760px]:hidden">
            <p className="truncate text-xs font-medium text-white/78">{boardName}</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-white/34">{galleryItems.length} {uiText("张图片")}</p>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 [-webkit-app-region:no-drag]">
            <GalleryModeSwitcher value={galleryMode} onChange={changeGalleryMode} />
          </div>
          <div className="ml-auto flex items-center gap-1 [-webkit-app-region:no-drag]">
            <GallerySourceMenu
              value={sourceFilter}
              counts={sourceCounts}
              onChange={setSourceFilter}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 text-white/60 hover:bg-white/[0.07] hover:text-white",
                    assistantOpen && "bg-white/[0.09] text-white"
                  )}
                  data-tour="gallery-assistant"
                  onClick={() => setAssistantOpen((value) => !value)}
                  aria-label={assistantOpen ? uiText("关闭 AI 回顾助手") : uiText("打开 AI 回顾助手")}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{assistantOpen ? uiText("关闭 AI 回顾助手") : uiText("AI 回顾助手")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/60 hover:bg-white/[0.07] hover:text-white"
                  onClick={onClose}
                  aria-label={uiText("关闭画廊")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{uiText("关闭画廊 (G)")}</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <TimelineWheel buckets={timelineBuckets} selectedKey={selectedDayKey} onSelect={setSelectedDayKey} />

        <main className="relative flex min-w-0 flex-1 flex-col pl-[360px] max-[860px]:pl-[300px] max-[620px]:pl-0">
          <div className={cn(
            "relative flex min-h-0 flex-1 flex-col pt-14",
            galleryMode === "orbit" && "-ml-[180px] max-[860px]:-ml-[150px] max-[620px]:ml-0"
          )} data-tour="gallery-generations">
            {boardAssets === null ? (
              <GalleryLoadingState />
            ) : galleryMode === "lightbox" ? (
              <LightboxGenerationGallery
                items={visibleItems}
                activeIndex={activeIndex}
                imageUrls={imageUrlByPath}
                onActiveIndexChange={selectImage}
                onOpen={openImage}
              />
            ) : galleryMode === "orbit" ? (
              <CircularGenerationGallery
                items={circularItems}
                activeIndex={activeIndex}
                reduceMotion={reduceMotion}
                paused={stackOpen}
                onActiveIndexChange={selectImage}
                onOpen={openImage}
              />
            ) : (
              <FilmGenerationGallery
                items={visibleItems}
                activeIndex={activeIndex}
                imageUrls={imageUrlByPath}
                reduceMotion={reduceMotion}
                onActiveIndexChange={selectImage}
                onOpen={openImage}
              />
            )}
            <GenerationStack
              open={stackOpen && Boolean(activeItem)}
              title={activeItem ? galleryItemTitle(activeItem) : uiText("图片")}
              imagePaths={activeItem ? [activeItem.imagePath] : []}
              imageUrls={imageUrlByPath}
              onClose={() => setStackOpen(false)}
            />
          </div>

          <PromptInspector
            item={activeItem}
            boardName={boardName}
            onCopyText={onCopyText}
            onLocate={onLocate}
            onReuse={onReuse}
          />
        </main>

        <AnimatePresence>
          {assistantOpen ? (
            <motion.aside
              className="gallery-assistant-shell assistant-panel-shell absolute bottom-5 right-5 top-16 z-30 w-[360px] max-w-[calc(100vw-40px)] overflow-hidden max-[640px]:left-5 max-[640px]:w-auto"
              initial={reduceMotion ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
            >
              <AiAssistant
                variant="docked"
                title={uiText("创作回顾助手")}
                subtitle={scopeLabel}
                messages={assistantMessages}
                value={assistantValue}
                placeholder={uiText("比较结果、总结提示词或回顾创作变化…")}
                streaming={assistantStreaming}
                compact
                className="h-full"
                onValueChange={setAssistantValue}
                onSubmit={() => void submitAssistant()}
                onStop={stopAssistant}
                onClose={() => setAssistantOpen(false)}
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </TooltipProvider>
    </section>
  );
}

function GallerySourceMenu({
  value,
  counts,
  onChange
}: {
  value: GallerySourceFilter;
  counts: GallerySourceCounts;
  onChange: (value: GallerySourceFilter) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const label = SOURCE_FILTERS.find((option) => option.value === value)?.label ?? "全部图片";
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-8 gap-1.5 px-2 text-xs text-white/60 hover:bg-white/[0.07] hover:text-white",
                value !== "all" && "bg-white/[0.09] text-white"
              )}
              aria-label={uiText("筛选图片，当前：{{ui:0}}", [label])}
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span className="max-[760px]:sr-only">{label}</span>
              <span className="tabular-nums text-white/38 max-[760px]:sr-only">{counts[value]}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{uiText("筛选图片")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="dark min-w-[180px] border-white/10 bg-neutral-950 text-white">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as GallerySourceFilter)}>
          {SOURCE_FILTERS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              disabled={option.value !== "all" && counts[option.value] === 0}
              className="gap-3 text-xs text-white/72 focus:bg-white/[0.09] focus:text-white data-[disabled]:opacity-35"
            >
              <span className="flex-1">{uiText(option.label)}</span>
              <span className="tabular-nums text-white/38">{counts[option.value]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GalleryLoadingState(): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="flex h-full min-h-[240px] flex-1 items-center justify-center" aria-label={uiText("正在加载画板图片")}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/60 motion-reduce:animate-none" />
    </div>
  );
}

function PromptInspector({
  item,
  boardName,
  onCopyText,
  onLocate,
  onReuse
}: {
  item?: BoardGalleryItem;
  boardName: string;
  onCopyText: (text: string) => void;
  onLocate: (nodeId: string) => void;
  onReuse: (job: GenerationJob) => void;
}): React.ReactElement {
  const uiText = useUiText();

  if (!item) {
    return (
      <section className="flex h-[116px] shrink-0 items-center justify-center px-8 pb-4 text-center text-sm text-white/44 max-[520px]:px-5">
        {uiText("当前筛选范围没有图片")}</section>
    );
  }
  const reusableJob = item.source === "generated" ? item.job : undefined;

  return (
    <section
      data-tour="gallery-prompt-actions"
      className="relative z-10 flex min-h-[116px] shrink-0 items-start gap-6 px-8 pb-5 pt-3 max-[760px]:gap-3 max-[520px]:px-5"
    >
      <div aria-hidden className="absolute inset-x-8 top-0 h-px bg-white/[0.08] max-[520px]:inset-x-5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-[11px] tabular-nums text-white/42">
          <span className="truncate">{boardName}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{new Date(item.createdAt).toLocaleString((document.documentElement.lang || "zh-CN"), { hour12: false })}</span>
          <span aria-hidden className="max-[600px]:hidden">·</span>
          <span className="shrink-0 max-[600px]:hidden">{gallerySourceLabel(item.source)}</span>
        </div>
        <p className={cn(
          "mt-2 line-clamp-2 max-w-[74ch] break-words text-[13px] leading-5",
          item.prompt ? "text-white/82" : "text-white/42"
        )}>
          {item.prompt || galleryItemDescription(item)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-1">
        {item.prompt ? (
          <InspectorAction label={uiText("复制提示词")} onClick={() => onCopyText(item.prompt)}>
            <Copy className="h-3.5 w-3.5" />
          </InspectorAction>
        ) : null}
        {reusableJob ? (
          <InspectorAction label={uiText("复用提示词")} onClick={() => onReuse(reusableJob)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </InspectorAction>
        ) : null}
        <InspectorAction label={uiText("回到画板定位")} onClick={() => onLocate(item.nodeId)}>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </InspectorAction>
      </div>
    </section>
  );
}

function InspectorAction({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/48 hover:bg-white/[0.07] hover:text-white"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

async function loadBoardAssets(boardId: string): Promise<AssetLibraryItem[]> {
  if (!boardId) return [];
  const api = getImageWorkbenchApi();
  const assets: AssetLibraryItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listAssets(cursor, 100);
    assets.push(...page.items.filter((item) => item.boardId === boardId));
    cursor = page.nextCursor;
  } while (cursor);
  return assets;
}

function localDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimelineLabel(key: string): string {
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const today = new Date();
  const todayKey = localDayKey(today.toISOString());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday.toISOString());
  if (key === todayKey) return "今天";
  if (key === yesterdayKey) return "昨天";
  if (date.getFullYear() === today.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return `${date.getFullYear()} / ${date.getMonth() + 1} / ${date.getDate()}`;
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString((document.documentElement.lang || "zh-CN"), { hour: "2-digit", minute: "2-digit", hour12: false });
}

function promptTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "未命名生成";
  const firstPhrase = normalized.split(/[，。；\n]/)[0]?.trim() || normalized;
  return firstPhrase.length > 28 ? `${firstPhrase.slice(0, 28)}…` : firstPhrase;
}

function galleryItemTitle(item: BoardGalleryItem): string {
  if (item.prompt) return promptTitle(item.prompt);
  if (item.source === "upload") return "本地上传图片";
  if (item.source === "slice") return "切图图片";
  return "未命名生成";
}

function galleryItemDescription(item: BoardGalleryItem): string {
  if (item.source === "upload") return "从本地添加到画板的图片。";
  if (item.source === "slice") return "由画板中的图片切分得到。";
  return "这张生成图片没有记录提示词。";
}

function buildGalleryGreeting(scopeLabel: string, count: number): string {
  if (count === 0) return `当前范围是 **${scopeLabel}**，这里还没有图片。调整筛选或切换时间后，我可以继续帮你回顾。`;
  return `当前正在回顾 **${scopeLabel}** 的 ${count} 张图片。你可以让我比较视觉结果、总结创作演进，或找出值得延续的方向。`;
}

function buildGalleryContext(items: BoardGalleryItem[]): string {
  if (items.length === 0) return "当前范围没有图片。";
  const lines = items.slice(0, GALLERY_CONTEXT_LIMIT).map((item, index) => (
    `${index + 1}. ${formatClock(item.createdAt)}｜${gallerySourceLabel(item.source)}｜${item.prompt || "无提示词"}`
  ));
  if (items.length > GALLERY_CONTEXT_LIMIT) lines.push(`另有 ${items.length - GALLERY_CONTEXT_LIMIT} 张图片未逐条展开。`);
  return lines.join("\n");
}

async function readAssistantReference(path: string, index: number): Promise<SceneAssistantReference | null> {
  try {
    const dataUrl = await getImageWorkbenchApi().readAssetDataUrl(path);
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) return null;
    return { name: `画廊图片 ${index + 1}`, mimeType: match[1], dataBase64: match[2] };
  } catch {
    return null;
  }
}
