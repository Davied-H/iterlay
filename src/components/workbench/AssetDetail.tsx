import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  GitCompareArrows,
  LayoutGrid,
  Plus,
  Send,
  Trash2,
  X
} from "lucide-react";
import { toast } from "sonner";
import type {
  AssetComment,
  AssetDetailData,
  AssetLibraryItem,
  AssetReference,
  AssetTagInfo,
  AssetVersion,
  PromptSpec
} from "@shared/types";
import { gptImageUseCases } from "@shared/workflow";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { isSendEnter } from "@/lib/send-on-enter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getThumbHashRatio } from "@/lib/thumbhash-placeholder";
import { AssetOpsBar } from "@/components/workbench/asset/AssetOpsBar";
import { PromptWorkbench } from "@/components/workbench/asset/PromptWorkbench";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { LineageBreadcrumb } from "@/components/workbench/asset/LineageBreadcrumb";
import { VersionCompareSlider } from "@/components/workbench/asset/VersionCompareSlider";
import { composeShareCard } from "@/components/workbench/asset/share-card";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 列表卡片的视口矩形：详情大图从这里 FLIP 展开（DOMRect 结构兼容）。 */
interface EnterOriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ---------- Props ----------

interface AssetDetailProps {
  item: AssetLibraryItem;
  comments: AssetComment[];
  /** 仅首次挂载消费一次；prev/next 切换不重播。 */
  enterOrigin?: EnterOriginRect | null;
  onBack: () => void;
  onCopyText: (text: string) => void;
  onLocateAsset: (boardId: string, nodeId: string) => void;
  onAddComment: (imagePath: string, text: string) => void;
  onDeleteComment: (id: string) => void;
  onReusePrompt: (prompt: string, promptSpec?: PromptSpec) => void;
  onEditAsset: (boardId: string, nodeId: string) => void;
  onUseReference: (dataUrl: string) => void;
  onDeleteAsset: (boardId: string, nodeId: string) => void;
  onOpenAssetByNode?: (boardId: string, nodeId: string) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

// ---------- Helpers ----------

function getUseCaseLabel(slug?: string): string | undefined {
  if (!slug) return undefined;
  return gptImageUseCases.find((u) => u.slug === slug)?.label;
}

// ---------- Component ----------

export function AssetDetail({
  item,
  comments,
  enterOrigin,
  onBack,
  onCopyText,
  onLocateAsset,
  onAddComment,
  onDeleteComment,
  onReusePrompt,
  onEditAsset,
  onUseReference,
  onDeleteAsset,
  onOpenAssetByNode,
  hasPrev,
  hasNext,
  onPrev,
  onNext
}: AssetDetailProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [detail, setDetail] = useState<AssetDetailData | null>(null);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [shareCard, setShareCard] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(0);
  const [meta, setMeta] = useState<AssetTagInfo | null>(null);
  const [tagInput, setTagInput] = useState("");

  // ---------- 卡片 → 大图 FLIP 进场 ----------
  // object-contain 的最终显示矩形可由容器尺寸 + 宽高比精确预测，无需等大图加载；
  // 过渡层用列表已加载的缩略图飞行，落位后与真图交叉淡化。
  const imageAreaRef = useRef<HTMLDivElement>(null);
  const flipInitRef = useRef(false);
  const [flip, setFlip] = useState<{ from: EnterOriginRect; to: EnterOriginRect } | null>(null);
  const [flipLanded, setFlipLanded] = useState(false);

  useLayoutEffect(() => {
    if (flipInitRef.current) return;
    flipInitRef.current = true;
    if (!enterOrigin || reduceMotion) return;
    const container = imageAreaRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const padding = 32; // 大图容器 p-8
    const contentWidth = bounds.width - padding * 2;
    const contentHeight = bounds.height - padding * 2;
    if (contentWidth < 40 || contentHeight < 40) return;
    const ratio =
      item.width && item.height && item.height > 0
        ? item.width / item.height
        : (getThumbHashRatio(item.thumbHash) ?? 1);
    const width = Math.min(contentWidth, contentHeight * ratio);
    const height = width / ratio;
    setFlip({
      from: {
        left: enterOrigin.left - bounds.left,
        top: enterOrigin.top - bounds.top,
        width: enterOrigin.width,
        height: enterOrigin.height
      },
      to: {
        left: (bounds.width - width) / 2,
        top: (bounds.height - height) / 2,
        width,
        height
      }
    });
    // 仅首挂载消费：prev/next 与版本切换沿用原有淡入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemComments = comments.filter((c) => c.imagePath === item.imagePath);

  // Fetch detail data (versions + references).
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setCompareMode(false);
    (async () => {
      try {
        const data = await getImageWorkbenchApi().getAssetDetail(item.boardId, item.nodeId);
        if (cancelled) return;
        setDetail(data);
        setActiveVersionIdx(data.activeVersion);
        if (data.versions.length > 1) {
          setCompareA(0);
          setCompareB(data.activeVersion);
        }
      } catch {
        if (!cancelled) setDetail({ versions: [], activeVersion: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.boardId, item.nodeId]);

  // Fetch meta (favorite/tags).
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    (async () => {
      try {
        const m = await getImageWorkbenchApi().getAssetMeta(item.imagePath);
        if (!cancelled) setMeta(m);
      } catch {
        if (!cancelled) setMeta({ imagePath: item.imagePath, favorite: item.favorite, tags: item.tags });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.imagePath, item.favorite, item.tags]);

  const versions = useMemo(() => detail?.versions ?? [], [detail]);
  const hasVersions = versions.length > 1;
  const currentVersion: AssetVersion | undefined = versions[activeVersionIdx];
  const currentDataUrl = currentVersion?.dataUrl ?? item.dataUrl;
  const currentImagePath = currentVersion?.imagePath ?? item.imagePath;
  const currentPrompt = currentVersion?.prompt ?? item.prompt;
  const currentPromptSpec = currentVersion?.promptSpec;
  const currentReferences = currentVersion?.references ?? [];
  const currentUseCase = currentVersion?.useCase ?? item.useCase;
  const currentSize = currentVersion?.size ?? item.size;
  const currentModel = currentVersion?.model;
  const currentCreatedAt = currentVersion?.createdAt ?? item.createdAt;
  const isFavorite = meta?.favorite ?? item.favorite;
  const tags = meta?.tags ?? item.tags;

  // Keyboard: left/right for prev/next asset.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (shareCard) {
        if (e.key === "Escape") setShareCard(null);
        return;
      }
      if (lightboxSrc) return; // lightbox has its own Esc handler
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPrev, hasNext, onPrev, onNext, lightboxSrc, shareCard]);

  // ---------- Actions ----------

  const handleCopyImage = useCallback(async () => {
    try {
      const resp = await fetch(currentDataUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      iterlayToast.copied({ title: "已复制图片", detail: "可粘贴到其他应用" });
    } catch {
      // Fallback: copy data URL.
      void navigator.clipboard.writeText(currentDataUrl);
      iterlayToast.copied({ title: "已复制 Data URL" });
    }
  }, [currentDataUrl]);

  const handleDownload = useCallback(async () => {
    try {
      const result = await getImageWorkbenchApi().saveAsset(currentImagePath);
      if (result?.ok) iterlayToast.exported({ title: "图片已导出", path: result.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }, [currentImagePath]);

  const handleUseReference = useCallback(async () => {
    try {
      onUseReference(await imageUrlToDataUrl(currentDataUrl));
    } catch {
      toast.error("无法读取参考图。");
    }
  }, [currentDataUrl, onUseReference]);

  const handleToggleFavorite = useCallback(async () => {
    // Optimistic update.
    const prev = meta;
    setMeta((m) => m ? { ...m, favorite: !m.favorite } : null);
    try {
      const updated = await getImageWorkbenchApi().toggleAssetFavorite(item.imagePath);
      setMeta(updated);
    } catch {
      setMeta(prev);
      toast.error("操作失败");
    }
  }, [item.imagePath, meta]);

  const handleShareCard = useCallback(async () => {
    try {
      const metaLine = [
        currentSize,
        getUseCaseLabel(currentUseCase),
        currentModel,
        new Date(currentCreatedAt).toLocaleString()
      ]
        .filter(Boolean)
        .join(" · ");
      const cardDataUrl = await composeShareCard(currentDataUrl, currentPrompt, metaLine);
      // 先预览，再让用户决定下载/复制。
      setShareCard(cardDataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成分享卡失败");
    }
  }, [currentDataUrl, currentPrompt, currentSize, currentUseCase, currentModel, currentCreatedAt]);

  const downloadShareCard = useCallback(async () => {
    if (!shareCard) return;
    try {
      const result = await getImageWorkbenchApi().saveImageDataUrl(shareCard, "share-card.png");
      if (result?.ok) iterlayToast.exported({ title: "分享卡已导出", path: result.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }, [shareCard]);

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (tags.includes(tag)) {
      setTagInput("");
      return;
    }
    const nextTags = [...tags, tag];
    setMeta((m) => m ? { ...m, tags: nextTags } : null);
    setTagInput("");
    void getImageWorkbenchApi().setAssetTags(item.imagePath, nextTags).then(setMeta).catch(() => {
      toast.error("标签保存失败");
    });
  }, [tagInput, tags, item.imagePath]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const nextTags = tags.filter((t) => t !== tag);
      setMeta((m) => m ? { ...m, tags: nextTags } : null);
      void getImageWorkbenchApi().setAssetTags(item.imagePath, nextTags).then(setMeta).catch(() => {
        toast.error("标签保存失败");
      });
    },
    [tags, item.imagePath]
  );

  function submitComment(): void {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddComment(item.imagePath, trimmed);
    setDraft("");
  }

  // Auto-grow the comment composer with its content, capped so it never eats the panel.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // Lineage breadcrumb items.
  const lineageItems = useMemo(() => {
    if (versions.length === 0) return [];
    return versions.map((v, idx) => ({
      label: idx === 0 ? "原图" : `编辑${idx}`,
      current: idx === activeVersionIdx,
      onClick:
        idx !== activeVersionIdx
          ? () => setActiveVersionIdx(idx)
          : undefined
    }));
  }, [versions, activeVersionIdx]);

  // Meta line. 用例(useCase)不在此展示，仅保留尺寸/模型/时间。
  const metaParts = [
    currentSize,
    currentModel,
    new Date(currentCreatedAt).toLocaleString()
  ].filter(Boolean);

  const sectionReveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22, ease: EASE_OUT }
      };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 [-webkit-app-region:drag]">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 [-webkit-app-region:no-drag]"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          返回素材库
        </Button>
        <span className="text-sm font-semibold tracking-tight">素材详情</span>
        <div className="flex-1" />
        {/* Prev / Next */}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={!hasPrev}
                  onClick={onPrev}
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上一张 (←)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={!hasNext}
                  onClick={onNext}
                  aria-label="下一张"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>下一张 (→)</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: main image + version timeline */}
        <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
          <div
            ref={imageAreaRef}
            className="group relative flex min-h-0 flex-1 cursor-pointer items-center justify-center bg-black/10 p-8 dark:bg-black/40"
            onClick={() => setLightboxSrc(currentDataUrl)}
          >
            <motion.img
              key={currentDataUrl}
              src={currentDataUrl}
              alt="素材"
              draggable={false}
              className="max-h-full max-w-full rounded-xl object-contain shadow-[0_12px_48px_-16px_rgba(0,0,0,0.4)]"
              initial={reduceMotion ? false : { opacity: flip ? 0 : 0.55 }}
              animate={{ opacity: flip && !flipLanded ? 0 : 1 }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
            />
            {flip && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute z-10"
                style={{
                  left: flip.to.left,
                  top: flip.to.top,
                  width: flip.to.width,
                  height: flip.to.height,
                  transformOrigin: "center center"
                }}
                initial={{
                  x: flip.from.left + flip.from.width / 2 - (flip.to.left + flip.to.width / 2),
                  y: flip.from.top + flip.from.height / 2 - (flip.to.top + flip.to.height / 2),
                  scaleX: flip.from.width / flip.to.width,
                  scaleY: flip.from.height / flip.to.height,
                  opacity: 1
                }}
                animate={
                  flipLanded
                    ? { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0 }
                    : { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 }
                }
                transition={
                  flipLanded
                    ? { duration: 0.18, ease: EASE_OUT }
                    : { duration: 0.35, ease: EASE_OUT }
                }
                onAnimationComplete={() => {
                  if (!flipLanded) setFlipLanded(true);
                  else setFlip(null);
                }}
              >
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full rounded-xl object-cover"
                />
              </motion.div>
            )}
            <span className="pointer-events-none absolute bottom-10 right-10 rounded-md bg-background px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none">
              点击放大
            </span>
          </div>

          {/* Version timeline */}
          {hasVersions && (
            <motion.div {...sectionReveal} className="shrink-0 border-t border-border/70 px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto">
                  {versions.map((version, index) => {
                    const active = index === activeVersionIdx;
                    return (
                      <div key={index} className="group relative">
                        <button
                          type="button"
                          onClick={() => setActiveVersionIdx(index)}
                          title={index === 0 ? "原图" : `版本 ${index + 1}`}
                          className={cn(
                            "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted transition-[opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "opacity-100 shadow-sm"
                              : "opacity-70 hover:opacity-100"
                          )}
                        >
                          <img
                            src={version.dataUrl}
                            alt={`版本 ${index + 1}`}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                          <span className="absolute bottom-0.5 left-0.5 rounded bg-background px-1 text-[9px] font-medium tabular-nums text-muted-foreground">
                            v{index + 1}
                          </span>
                        </button>
                        {/* Hover download */}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const r = await getImageWorkbenchApi().saveAsset(version.imagePath);
                              if (r?.ok) iterlayToast.exported({ title: `v${index + 1} 已导出`, path: r.path });
                            } catch {
                              toast.error("导出失败");
                            }
                          }}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
                          aria-label={`下载版本 ${index + 1}`}
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Compare toggle */}
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={compareMode ? "default" : "outline"}
                        size="sm"
                        className="h-8 gap-1.5 px-2.5 text-xs"
                        onClick={() => setCompareMode((v) => !v)}
                      >
                        <GitCompareArrows className="h-3.5 w-3.5" />
                        对比
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>版本对比模式</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Compare slider */}
              <AnimatePresence>
                {compareMode && versions.length >= 2 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 flex items-center gap-2 mb-2">
                      <select
                        value={compareA}
                        onChange={(e) => setCompareA(Number(e.target.value))}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {versions.map((_, i) => (
                          <option key={i} value={i}>
                            v{i + 1}{i === 0 ? " 原图" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <select
                        value={compareB}
                        onChange={(e) => setCompareB(Number(e.target.value))}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {versions.map((_, i) => (
                          <option key={i} value={i}>
                            v{i + 1}{i === 0 ? " 原图" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <VersionCompareSlider
                      beforeSrc={versions[compareA]?.dataUrl ?? ""}
                      afterSrc={versions[compareB]?.dataUrl ?? ""}
                      beforeLabel={`v${compareA + 1}`}
                      afterLabel={`v${compareB + 1}`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        {/* Right: info panel */}
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-border">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Ops bar */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <AssetOpsBar
                favorite={isFavorite}
                canEdit
                onDownload={handleDownload}
                onCopyImage={() => void handleCopyImage()}
                onUseReference={() => void handleUseReference()}
                onEditInCanvas={() => onEditAsset(item.boardId, item.nodeId)}
                onToggleFavorite={() => void handleToggleFavorite()}
                onDelete={() => onDeleteAsset(item.boardId, item.nodeId)}
                onShareCard={() => void handleShareCard()}
              />
            </div>

            {/* Lineage breadcrumb */}
            {lineageItems.length > 1 && (
              <motion.div {...sectionReveal} className="border-b border-border px-5 py-3">
                <LineageBreadcrumb items={lineageItems} />
              </motion.div>
            )}

            {/* Prompt block + reference images (A2) — 提示词 primary, references below */}
            <motion.section {...sectionReveal} className="border-b border-border p-5">
              {/* Prompt workbench */}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold">提示词</span>
                {currentVersion && (
                  <Badge variant="muted" className="text-[10px]">
                    v{activeVersionIdx + 1}
                  </Badge>
                )}
              </div>
              <PromptWorkbench
                prompt={currentPrompt}
                promptSpec={currentPromptSpec}
                onCopyPrompt={() => onCopyText(currentPrompt)}
                onReuse={() => onReusePrompt(currentPrompt, currentPromptSpec)}
                onSendToEdit={() => onEditAsset(item.boardId, item.nodeId)}
              />

              {/* Reference images */}
              {currentReferences.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    引用图片 <span className="tabular-nums">{currentReferences.length}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentReferences.map((ref: AssetReference, index: number) => (
                      <ReferenceThumb
                        key={index}
                        reference={ref}
                        index={index}
                        onPreview={() => setLightboxSrc(ref.dataUrl)}
                        onOpenSource={
                          ref.sourceBoardId && ref.sourceNodeId && onOpenAssetByNode
                            ? () => onOpenAssetByNode(ref.sourceBoardId!, ref.sourceNodeId!)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.section>

            {/* Meta */}
            {metaParts.length > 0 && (
              <section className="border-b border-border px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                  {metaParts.map((part, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-muted-foreground/40">·</span>}
                      {part}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Source board */}
            <section className="border-b border-border p-5">
              <p className="text-xs font-medium text-muted-foreground">来源画板</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{item.boardName}</span>
                <Button
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                  onClick={() => onLocateAsset(item.boardId, item.nodeId)}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  进入并定位
                </Button>
              </div>
            </section>

            {/* Tags */}
            <section className="border-b border-border p-5">
              <p className="mb-2 text-xs font-medium text-muted-foreground">标签</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="gap-1 pr-1 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-accent"
                      aria-label={`移除标签 ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <form
                  className="inline-flex"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag();
                  }}
                >
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="添加标签"
                    className="h-6 w-20 px-1.5 text-xs"
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={!tagInput.trim()}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </form>
              </div>
            </section>

            {/* Comments */}
            <section className="p-5">
              <p className="mb-3 text-sm font-semibold">
                评论 <span className="text-xs font-normal text-muted-foreground">{itemComments.length}</span>
              </p>
              {itemComments.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  还没有评论，在下方写下第一条。
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {itemComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="group relative rounded-lg border border-border bg-muted/30 p-2.5 pr-8"
                    >
                      <p className="break-words text-sm leading-snug text-foreground">{comment.text}</p>
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => onDeleteComment(comment.id)}
                        aria-label="删除评论"
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Comment composer — single field, send lives inside */}
          <div className="shrink-0 border-t border-border px-5 py-3">
            <div className="relative overflow-hidden rounded-lg border border-input bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring">
              <Textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (!isSendEnter(e)) return;
                  e.preventDefault();
                  submitComment();
                }}
                rows={1}
                placeholder="写下评论…"
                className="min-h-[2.5rem] max-h-40 resize-none border-0 bg-transparent py-2 pl-3 pr-12 text-sm leading-6 focus-visible:ring-0"
              />
              <Button
                type="button"
                size="icon"
                className="absolute bottom-2 right-2 h-7 w-7 rounded-md transition-[transform,background-color] active:scale-90 disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
                disabled={!draft.trim()}
                onClick={submitComment}
                aria-label="发送评论 (Enter)"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-1.5 px-0.5 text-[11px] leading-none text-muted-foreground">
              Enter 发送 · Shift + Enter 换行
            </p>
          </div>
        </aside>
      </div>

      {/* Fullscreen zoom lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <ImageZoomLightbox
            src={lightboxSrc}
            alt="素材预览"
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </AnimatePresence>

      {/* 分享卡预览：合成后先看，再决定下载 / 复制 */}
      <AnimatePresence>
        {shareCard ? (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-black/70 p-8 dark:bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={() => setShareCard(null)}
          >
            <motion.img
              src={shareCard}
              alt="分享卡预览"
              className="max-h-[78vh] max-w-full rounded-xl border border-border object-contain shadow-2xl"
              draggable={false}
              initial={reduceMotion ? false : { scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE_OUT }}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Button variant="outline" onClick={() => setShareCard(null)}>
                关闭
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard.writeText(shareCard);
                  iterlayToast.copied({ title: "已复制分享卡 Data URL" });
                }}
              >
                <Copy className="h-4 w-4" />
                复制
              </Button>
              <Button className="gap-1.5" onClick={downloadShareCard}>
                <Download className="h-4 w-4" />
                下载
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------- Reference thumbnail sub-component ----------

function ReferenceThumb({
  reference,
  index,
  onPreview,
  onOpenSource
}: {
  reference: AssetReference;
  index: number;
  onPreview: () => void;
  onOpenSource?: () => void;
}): React.ReactElement {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onPreview}
        className="h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted transition-all hover:border-ring/60"
        title={`引用图 ${index + 1}`}
      >
        <img
          src={reference.dataUrl}
          alt={`引用图 ${index + 1}`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </button>
      {/* Download on hover */}
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            const r = await getImageWorkbenchApi().saveAsset(reference.imagePath);
            if (r?.ok) iterlayToast.exported({ title: "引用图已导出", path: r.path });
          } catch {
            toast.error("导出失败");
          }
        }}
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label="下载引用图"
      >
        <Download className="h-3 w-3" />
      </button>
      {/* Source link */}
      {onOpenSource && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSource();
          }}
          className="absolute -bottom-1 -right-1 rounded bg-background/90 px-1 py-0.5 text-[9px] font-medium text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          来源
        </button>
      )}
    </div>
  );
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败。"));
    reader.readAsDataURL(blob);
  });
}
