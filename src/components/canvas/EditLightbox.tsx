import { useUiText } from "@/i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, Clock3, Download, GitCompareArrows, Loader2, Maximize2, X } from "lucide-react";
import type { EditInfoMode, JobPromptInfo } from "@shared/types";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { getGenerationTiming } from "@/lib/generation-timing";
import { MAX_CONCURRENT_GENERATIONS } from "@/lib/generation-queue";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { VersionCompareSlider } from "@/components/workbench/asset/VersionCompareSlider";
import { getPendingEditCount, type GeneratedImage, type ImageVersion } from "./ImageNode";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** 图片与容器上沿的留白。 */
const TOP_MARGIN = 24;
/** 图片两侧留白（每侧）。 */
const SIDE_MARGIN = 60;
/** 图片与底部 Dock 之间至少保留的呼吸空间。 */
const PREVIEW_DOCK_GAP = 20;
/** 多版本条占用的额外空间（间距 + 缩略图）。 */
const VERSION_STRIP_SPACE = 80;
/** 找不到底部编辑 dock 时的兜底预留高度。 */
const FALLBACK_DOCK_RESERVE = 300;
/** 找不到顶栏时按 h-12 兜底，避免预览进入窗口拖拽区。 */
const FALLBACK_TOPBAR_HEIGHT = 48;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface EditLightboxProps {
  image: GeneratedImage;
  /** 进入动画的起点（画布节点在容器内的位置）；缺省时直接淡入。 */
  sourceRect: Rect | null;
  /** 点击图片查看提示词的方式：flip=翻转背面 / panel=右侧打字机面板。 */
  infoMode: EditInfoMode;
  onSwitchVersion: (imageId: string, index: number) => void;
  onDownload: (path: string) => Promise<void> | void;
  onClose: () => void;
}

interface VersionPreviewImageProps {
  src: string;
  imageKey: string;
  reduceMotion: boolean;
  onNaturalSize: (imageKey: string, width: number, height: number) => void;
}

/** 版本切换时保留上一帧，与新版本短暂叠加，避免主图闪白或硬切。 */
function VersionPreviewImage({
  src,
  imageKey,
  reduceMotion,
  onNaturalSize
}: VersionPreviewImageProps): React.ReactElement {
  const uiText = useUiText();

  return (
    <AnimatePresence initial={false} mode="sync">
      <motion.img
        key={imageKey}
        src={src}
        alt={uiText("正在编辑的图片")}
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            onNaturalSize(imageKey, naturalWidth, naturalHeight);
          }
        }}
        initial={reduceMotion ? false : { opacity: 0, scale: 1.008 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.996 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE_OUT }}
      />
    </AnimatePresence>
  );
}

function ImageDimensionBadge({
  width,
  height,
  className
}: {
  width?: number;
  height?: number;
  className?: string;
}): React.ReactElement | null {
  const uiText = useUiText();

  if (!width || !height) return null;
  const label = `${Math.round(width)} × ${Math.round(height)}`;

  return (
    <span
      aria-label={uiText("图片尺寸 {{ui:0}} 像素", [label])}
      className={cn(
        "pointer-events-none absolute z-20 rounded-md bg-background/80 px-2 py-1 text-[11px] tabular-nums text-muted-foreground opacity-0 backdrop-blur transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none",
        className
      )}
    >
      {label} px
    </span>
  );
}

function useEditingTiming(active: boolean, startedAt?: number): ReturnType<typeof getGenerationTiming> {
  const fallbackStartedAtRef = useRef(Date.now());
  const resolvedStartedAt = startedAt ?? fallbackStartedAtRef.current;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, resolvedStartedAt]);

  return getGenerationTiming(resolvedStartedAt, now);
}

/** 编辑会话的聚焦层：图片从画布节点 FLIP 放大到中央，底部版本条可切换/回滚；点击图片查看提示词。 */
export function EditLightbox({
  image,
  sourceRect,
  infoMode,
  onSwitchVersion,
  onDownload,
  onClose
}: EditLightboxProps): React.ReactElement {
  const uiText = useUiText();

  const containerRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [info, setInfo] = useState<JobPromptInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomSourceRect, setZoomSourceRect] = useState<Rect | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(0);
  const [loadedSize, setLoadedSize] = useState<{ imageKey: string; width: number; height: number } | null>(null);
  const reduceMotion = useReducedMotion();
  const pendingEditCount = getPendingEditCount(image);
  const queuedEditCount = Math.min(pendingEditCount, image.queuedEditCount ?? 0);
  const allEditsQueued = pendingEditCount > 0 && queuedEditCount === pendingEditCount;
  const editingTiming = useEditingTiming(Boolean(image.editing) && !allEditsQueued, image.editingStartedAt);

  const versions: ImageVersion[] = image.versions ?? [
    { path: image.path, dataUrl: image.dataUrl, jobId: image.jobId, width: image.width, height: image.height }
  ];
  const activeVersion = image.activeVersion ?? versions.length - 1;
  const activeJobId = versions[activeVersion]?.jobId ?? image.jobId;
  const currentSrc = versions[activeVersion]?.dataUrl || image.dataUrl;
  const currentKey = versions[activeVersion]?.path || image.dataUrl;
  const currentPath = versions[activeVersion]?.path || image.path;
  const loadedCurrentSize = loadedSize?.imageKey === currentKey ? loadedSize : null;
  const currentWidth = versions[activeVersion]?.width ?? image.width ?? loadedCurrentSize?.width;
  const currentHeight = versions[activeVersion]?.height ?? image.height ?? loadedCurrentSize?.height;
  // 单版本时编辑卡片已有缩略图，不再重复展示；生成中的占位版本仍需保留。
  const showVersionStrip = versions.length > 1 || pendingEditCount > 0;

  useEffect(() => {
    setCompareMode(false);
    setCompareA(0);
    setCompareB(activeVersion > 0 ? activeVersion : Math.max(0, versions.length - 1));
  }, [activeVersion, image.id, versions.length]);

  useEffect(() => {
    if (compareA >= versions.length) setCompareA(0);
    if (compareB >= versions.length) setCompareB(Math.max(0, versions.length - 1));
    if (versions.length < 2) setCompareMode(false);
  }, [compareA, compareB, versions.length]);

  // 新会话、版本或展示模式变化时收起提示词，避免沿用上一张图的打开状态。
  useEffect(() => {
    setInfoOpen(false);
  }, [activeJobId, image.id, infoMode]);

  // 拉取当前版本的提示词与引用图（懒加载，点击查看时已就绪）。
  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    if (!activeJobId) {
      setInfo({ prompt: "", referenceImages: [] });
      return;
    }
    (async () => {
      try {
        const data = await getImageWorkbenchApi().getJobPrompt(activeJobId);
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setInfo({ prompt: "", referenceImages: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeJobId]);

  // 依据容器尺寸和图片比例计算聚焦后的目标矩形；底部预留量按 dock 实测高度动态调整。
  useLayoutEffect(() => {
    function compute(): void {
      const container = containerRef.current;
      if (!container) return;
      const dock = document.querySelector<HTMLElement>("[data-edit-dock]");
      const dockReserve = dock
        ? Math.max(0, window.innerHeight - dock.getBoundingClientRect().top)
        : FALLBACK_DOCK_RESERVE;
      const topbar = document.querySelector<HTMLElement>("[data-workspace-topbar]");
      const topbarInset = topbar?.getBoundingClientRect().bottom ?? FALLBACK_TOPBAR_HEIGHT;
      const availableWidth = Math.max(120, container.clientWidth - SIDE_MARGIN * 2);
      const availableHeight = Math.max(
        120,
        container.clientHeight -
          topbarInset -
          TOP_MARGIN -
          PREVIEW_DOCK_GAP -
          (showVersionStrip ? VERSION_STRIP_SPACE : 0) -
          dockReserve
      );
      const ratio = currentWidth && currentHeight ? currentWidth / currentHeight : 1;
      let width = Math.min(availableWidth, availableHeight * ratio);
      let height = width / ratio;
      if (height > availableHeight) {
        height = availableHeight;
        width = height * ratio;
      }
      setTargetRect({
        left: (container.clientWidth - width) / 2,
        top: topbarInset + TOP_MARGIN + (availableHeight - height) / 2,
        width,
        height
      });
    }
    compute();
    window.addEventListener("resize", compute);
    const dock = document.querySelector<HTMLElement>("[data-edit-dock]");
    const observer = dock && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => compute()) : null;
    if (dock) observer?.observe(dock);
    return () => {
      window.removeEventListener("resize", compute);
      observer?.disconnect();
    };
  }, [currentHeight, currentWidth, showVersionStrip]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        // Esc 按视觉层级依次退出放大、提示词展示和编辑会话。
        if (zoomOpen) setZoomOpen(false);
        else if (infoOpen) setInfoOpen(false);
        else if (compareMode) setCompareMode(false);
        else onClose();
        return;
      }

      if (event.defaultPrevented || event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (
        element &&
        (element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA" ||
          element.tagName === "SELECT" ||
          element.isContentEditable)
      ) {
        return;
      }

      const nextVersion = activeVersion + (event.key === "ArrowLeft" ? -1 : 1);
      if (nextVersion < 0 || nextVersion >= versions.length) return;
      event.preventDefault();
      setInfoOpen(false);
      onSwitchVersion(image.id, nextVersion);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeVersion, compareMode, image.id, infoOpen, onClose, onSwitchVersion, versions.length, zoomOpen]);

  const initialRect = reduceMotion ? targetRect : sourceRect ?? targetRect;
  const canShowPromptInfo = Boolean(info && (info.prompt.trim() || info.referenceImages.length > 0));

  function handleNaturalSize(imageKey: string, width: number, height: number): void {
    setLoadedSize((current) => {
      if (current?.imageKey === imageKey && current.width === width && current.height === height) return current;
      return { imageKey, width, height };
    });
  }

  async function downloadCurrentVersion(): Promise<void> {
    if (!currentPath || downloading) return;
    setDownloading(true);
    try {
      await onDownload(currentPath);
    } finally {
      setDownloading(false);
    }
  }

  const editingOverlay = image.editing ? (
    <div
      data-editing-status
      aria-busy="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-background/70 px-3 py-2 text-muted-foreground backdrop-blur"
    >
      {allEditsQueued
        ? <Clock3 aria-hidden className="h-3.5 w-3.5 shrink-0" />
        : <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin" />}
      <div className="min-w-0 text-center">
        <p className="text-xs font-medium leading-4">
          {allEditsQueued ? uiText("编辑任务排队中") : uiText("正在应用编辑{{ui:0}}", [queuedEditCount ? ` · ${queuedEditCount} 个版本排队中` : ""])}
        </p>
        {allEditsQueued ? (
          <p className="text-pretty text-[11px] leading-4">{uiText("已有 ")}{MAX_CONCURRENT_GENERATIONS} {uiText("个任务正在处理，稍后自动开始")}</p>
        ) : editingTiming.overdue ? (
          <p className="text-pretty text-[11px] leading-4">
            {uiText("已用 ")}<time className="tabular-nums">{editingTiming.elapsedLabel}</time> {uiText("· 比预计久一点，任务仍在处理中")}</p>
        ) : (
          <p className="text-[11px] leading-4">
            {uiText("已用 ")}<time className="tabular-nums">{editingTiming.elapsedLabel}</time> {uiText("· 预计剩余")}{" "}
            <time className="tabular-nums">{editingTiming.remainingLabel}</time>
          </p>
        )}
      </div>
    </div>
  ) : null;

  return (
    <motion.div ref={containerRef} className="absolute inset-0 z-[15]" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {/* 点击变暗的背景退出编辑；图片和版本条不冒泡。 */}
      <motion.div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />

      {targetRect && initialRect ? (
        <motion.div
          ref={previewFrameRef}
          className="absolute"
          style={{ perspective: 1600 }}
          initial={{ ...initialRect, opacity: sourceRect ? 1 : 0 }}
          animate={{ ...targetRect, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: EASE_OUT }}
          onClick={(event) => event.stopPropagation()}
        >
          {compareMode ? (
            <motion.div
              key="compare"
              className="group relative h-full w-full rounded-2xl bg-card shadow-xl"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: EASE_OUT }}
            >
              <VersionCompareSlider
                beforeSrc={versions[compareA]?.dataUrl ?? currentSrc}
                afterSrc={versions[compareB]?.dataUrl ?? currentSrc}
                beforeLabel={`v${compareA + 1}${compareA === 0 ? ` ${uiText("原图")}` : ""}`}
                afterLabel={`v${compareB + 1}${compareB === 0 ? ` ${uiText("原图")}` : ""}`}
                fill
                className="rounded-2xl border-0 bg-card"
              />
              <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none">
                <div className="flex max-w-full items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[10px] tabular-nums text-muted-foreground backdrop-blur">
                  <CompareDimension version={versions[compareA]} label={`v${compareA + 1}`} />
                  <span aria-hidden>·</span>
                  <CompareDimension version={versions[compareB]} label={`v${compareB + 1}`} />
                </div>
              </div>
            </motion.div>
          ) : infoMode === "flip" && canShowPromptInfo ? (
            <motion.div
              className="relative h-full w-full [transform-style:preserve-3d]"
              animate={{ rotateY: infoOpen ? 180 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE_OUT }}
            >
              {/* 正面：图片 */}
              <div
                onClick={() => setInfoOpen((value) => !value)}
                className="group absolute inset-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-2xl [backface-visibility:hidden]"
              >
                <VersionPreviewImage
                  src={currentSrc}
                  imageKey={currentKey}
                  reduceMotion={Boolean(reduceMotion)}
                  onNaturalSize={handleNaturalSize}
                />
                <ImageDimensionBadge width={currentWidth} height={currentHeight} className="left-2 top-2" />
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  {uiText("点击查看提示词")}</span>
                {editingOverlay}
              </div>
              {/* 背面：提示词 + 引用图 */}
              <div
                onClick={() => setInfoOpen((value) => !value)}
                className="absolute inset-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden]"
              >
                <PromptInfo info={info} footer={uiText("点击返回图片")} />
              </div>
            </motion.div>
          ) : (
            <div
              onClick={canShowPromptInfo ? () => setInfoOpen((value) => !value) : undefined}
              className={cn(
                "group relative block h-full w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
                canShowPromptInfo && "cursor-pointer"
              )}
            >
              <VersionPreviewImage
                src={currentSrc}
                imageKey={currentKey}
                reduceMotion={Boolean(reduceMotion)}
                onNaturalSize={handleNaturalSize}
              />
              <ImageDimensionBadge width={currentWidth} height={currentHeight} className="left-2 top-2" />
              {canShowPromptInfo ? (
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  {uiText("点击查看提示词")}</span>
              ) : null}
              {editingOverlay}
            </div>
          )}

          <TooltipProvider delayDuration={200}>
            <div
              data-tour="edit-tools"
              className="absolute left-full top-0 z-20 ml-3 flex flex-col items-center gap-1 rounded-md border border-border bg-background p-1 shadow-md"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={uiText("下载当前图片")}
                    disabled={!currentPath || downloading}
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadCurrentVersion();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    {downloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{uiText("下载当前图片")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={uiText("放大预览")}
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = previewFrameRef.current?.getBoundingClientRect();
                      setZoomSourceRect(
                        rect
                          ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                          : null
                      );
                      setZoomOpen(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{uiText("放大预览")}</TooltipContent>
              </Tooltip>
              {versions.length > 1 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={compareMode ? uiText("退出版本对比") : uiText("版本对比")}
                      aria-pressed={compareMode}
                      onClick={(event) => {
                        event.stopPropagation();
                        setInfoOpen(false);
                        setCompareA(0);
                        setCompareB(activeVersion > 0 ? activeVersion : versions.length - 1);
                        setCompareMode((value) => !value);
                      }}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        compareMode && "bg-accent text-foreground"
                      )}
                    >
                      <GitCompareArrows className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{compareMode ? uiText("退出版本对比") : uiText("版本对比")}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </TooltipProvider>
        </motion.div>
      ) : null}

      {/* 右侧打字机面板（panel 模式）。 */}
      <AnimatePresence>
        {infoMode === "panel" && infoOpen && canShowPromptInfo ? (
          <motion.aside
            className="absolute bottom-4 right-4 top-16 z-10 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE_OUT }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold">{uiText("提示词")}</span>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                aria-label={uiText("收起")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <TypedPrompt prompt={info?.prompt ?? ""} loading={info === null} reduceMotion={Boolean(reduceMotion)} />
              {info && info.referenceImages.length > 0 ? (
                <>
                  <p className="mb-2 mt-5 text-sm font-semibold">{uiText("引用图片")}</p>
                  <div className="flex flex-wrap gap-2">
                    {info.referenceImages.map((src, index) => (
                      <div key={index} className="h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted">
                        <img src={src} alt={uiText("引用图 {{ui:0}}", [index + 1])} className="h-full w-full object-cover" draggable={false} />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* 版本条：v1 原图起，点击切换激活版本（即回滚/前进）。 */}
      {showVersionStrip && targetRect ? (
        <motion.div
          className="absolute inset-x-0 flex justify-center"
          style={{ top: targetRect.top + targetRect.height + 12 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, delay: reduceMotion ? 0 : 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex max-w-[70%] items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur">
            {compareMode ? (
              <VersionCompareControls
                versions={versions}
                compareA={compareA}
                compareB={compareB}
                onCompareAChange={setCompareA}
                onCompareBChange={setCompareB}
              />
            ) : versions.map((version, index) => {
              const active = index === activeVersion;
              return (
                <button
                  key={version.path || index}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSwitchVersion(image.id, index)}
                  title={index === 0 ? uiText("原图") : uiText("版本 {{ui:0}}", [index + 1])}
                  className={cn(
                    "relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-opacity duration-200 focus-visible:outline-none motion-reduce:transition-none",
                    active
                      ? "opacity-100"
                      : "opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <img
                    src={version.dataUrl}
                    alt={uiText("版本 {{ui:0}}", [index + 1])}
                    className="h-full w-full object-cover"
                    draggable={false}
                    decoding="async"
                  />
                  <span className="absolute bottom-0.5 left-0.5 z-20 rounded bg-background/85 px-1 text-[9px] font-medium tabular-nums text-muted-foreground">
                    v{index + 1}
                  </span>
                </button>
              );
            })}
            {!compareMode ? Array.from({ length: pendingEditCount }, (_, index) => (
              <div
                key={`pending-edit-${index}`}
                aria-label={index >= pendingEditCount - queuedEditCount
                  ? (pendingEditCount > 1 ? `新版本 ${index + 1} 排队中` : "新版本排队中")
                  : (pendingEditCount > 1 ? `新版本 ${index + 1} 正在生成` : "新版本正在生成")}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border"
              >
                {index >= pendingEditCount - queuedEditCount
                  ? <Clock3 className="h-4 w-4 text-muted-foreground" />
                  : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />}
              </div>
            )) : null}
          </div>
        </motion.div>
      ) : null}

      <AnimatePresence>
        {zoomOpen ? (
          <ImageZoomLightbox
            src={currentSrc}
            alt={uiText("当前编辑图片的放大预览")}
            sourceRect={zoomSourceRect}
            imageWidth={currentWidth}
            imageHeight={currentHeight}
            onClose={() => setZoomOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function CompareDimension({ version, label }: { version?: ImageVersion; label: string }): React.ReactElement {
  const dimensions = version?.width && version.height
    ? `${Math.round(version.width)} × ${Math.round(version.height)} px`
    : "尺寸未知";
  return <span>{label} {dimensions}</span>;
}

function VersionCompareControls({
  versions,
  compareA,
  compareB,
  onCompareAChange,
  onCompareBChange
}: {
  versions: ImageVersion[];
  compareA: number;
  compareB: number;
  onCompareAChange: (index: number) => void;
  onCompareBChange: (index: number) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const options = versions.map((_, index) => (
    <option key={index} value={index}>
      v{index + 1}{index === 0 ? uiText(" 原图") : ""}
    </option>
  ));

  return (
    <div className="flex h-12 items-center gap-2 px-1">
      <label className="sr-only" htmlFor="edit-compare-before">{uiText("左侧对比版本")}</label>
      <select
        id="edit-compare-before"
        value={compareA}
        onChange={(event) => onCompareAChange(Number(event.target.value))}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options}
      </select>
      <GitCompareArrows aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <label className="sr-only" htmlFor="edit-compare-after">{uiText("右侧对比版本")}</label>
      <select
        id="edit-compare-after"
        value={compareB}
        onChange={(event) => onCompareBChange(Number(event.target.value))}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options}
      </select>
    </div>
  );
}

/** 翻转背面的提示词 + 引用图内容。 */
function PromptInfo({ info, footer }: { info: JobPromptInfo | null; footer?: string }): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="flex h-full w-full flex-col p-5 text-left">
      <p className="mb-2 shrink-0 text-sm font-semibold">{uiText("提示词")}</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {info === null ? (
          <p className="text-sm text-muted-foreground">{uiText("加载中…")}</p>
        ) : (
          <>
            <CollapsiblePrompt prompt={info.prompt} />
            {info.referenceImages.length > 0 ? (
              <>
                <p className="mb-2 mt-5 text-sm font-semibold">{uiText("引用图片")}</p>
                <div className="flex flex-wrap gap-2">
                  {info.referenceImages.map((src, index) => (
                    <div key={index} className="h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted">
                      <img src={src} alt={uiText("引用图 {{ui:0}}", [index + 1])} className="h-full w-full object-cover" draggable={false} />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
      {footer ? <p className="mt-3 shrink-0 text-center text-[11px] text-muted-foreground">{footer}</p> : null}
    </div>
  );
}

/** 默认展示五行；展开后提示词在自身区域内滚动，避免把引用图挤出卡片。 */
function CollapsiblePrompt({
  prompt,
  typing = false
}: {
  prompt: string;
  typing?: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  const contentRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [prompt]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || expanded) return;
    setOverflowing(content.scrollHeight > content.clientHeight + 1);
  }, [expanded, prompt]);

  if (!prompt) return <p className="text-sm text-muted-foreground">{uiText("（无提示词）")}</p>;

  return (
    <div className="min-w-0">
      <p
        ref={contentRef}
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground",
          expanded ? "max-h-52 overflow-y-auto overscroll-contain pr-1" : "line-clamp-5"
        )}
      >
        {prompt}
        {typing ? <span className="ml-0.5 inline-block animate-pulse text-muted-foreground">▍</span> : null}
      </p>
      {overflowing ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? uiText("收起") : uiText("查看更多")}
          {expanded ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

/** 打字机展示提示词：逐字揭示，减弱动态时直接全量显示。 */
function TypedPrompt({
  prompt,
  loading,
  reduceMotion
}: {
  prompt: string;
  loading: boolean;
  reduceMotion: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  const [shown, setShown] = useState("");

  useEffect(() => {
    if (reduceMotion || !prompt) {
      setShown(prompt);
      return;
    }
    setShown("");
    // 总时长约 1.6s：按长度算步进，长提示词也不至于太慢。
    const step = Math.max(1, Math.ceil(prompt.length / 80));
    let index = 0;
    const timer = setInterval(() => {
      index += step;
      setShown(prompt.slice(0, index));
      if (index >= prompt.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [prompt, reduceMotion]);

  if (loading) return <p className="text-sm text-muted-foreground">{uiText("加载中…")}</p>;
  if (!prompt) return <p className="text-sm text-muted-foreground">{uiText("（无提示词）")}</p>;

  return <CollapsiblePrompt prompt={shown} typing={shown.length < prompt.length} />;
}
