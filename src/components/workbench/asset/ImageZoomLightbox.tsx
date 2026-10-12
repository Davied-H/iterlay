import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DESKTOP_BREAKPOINT = 900;
const INSPECTOR_WIDTH = 304;
const ENTER_DURATION = 0.3;
const EXIT_DURATION = 0.22;

interface ZoomOriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImagePreviewMetadata {
  name?: string;
  model?: string;
  fileType?: string;
  fileSize?: string;
  resolution?: string;
  createdAt?: string;
  createdBy?: string;
}

interface ImageZoomLightboxProps {
  src: string;
  alt?: string;
  sourceRect?: ZoomOriginRect | null;
  imageWidth?: number;
  imageHeight?: number;
  title?: string;
  metadata?: ImagePreviewMetadata;
  showDetailsPanel?: boolean;
  currentIndex?: number;
  totalCount?: number;
  backdrop?: "solid" | "dim";
  closeButtonPlacement?: "viewport" | "image";
  onDownload?: () => Promise<void> | void;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

interface ViewportSize {
  width: number;
  height: number;
}

function getFittedRect(
  viewport: ViewportSize,
  ratio: number,
  showDetailsPanel: boolean
): ZoomOriginRect {
  const inspectorWidth = showDetailsPanel && viewport.width >= DESKTOP_BREAKPOINT
    ? INSPECTOR_WIDTH
    : 0;
  const stageWidth = viewport.width - inspectorWidth;
  const horizontalMargin = viewport.width < 640 ? 20 : 44;
  const verticalMargin = viewport.height < 620 ? 64 : 88;
  const maxWidth = Math.max(160, stageWidth - horizontalMargin * 2);
  const maxHeight = Math.max(160, viewport.height - verticalMargin * 2);
  let width = Math.min(maxWidth, maxHeight * ratio);
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return {
    left: (stageWidth - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height
  };
}

function inferFileType(src: string): string {
  const mimeMatch = src.match(/^data:image\/([^;,]+)/i);
  if (mimeMatch?.[1]) return mimeMatch[1].replace("jpeg", "jpg").toUpperCase();
  const path = src.split(/[?#]/)[0] ?? "";
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1];
  return extension ? extension.toUpperCase() : "IMAGE";
}

function inferName(src: string, alt?: string): string {
  if (alt?.trim()) return alt.trim();
  if (src.startsWith("data:")) return "图片预览";
  const fileName = decodeURIComponent(src.split(/[\\/]/).pop()?.split(/[?#]/)[0] ?? "");
  return fileName || "图片预览";
}

/**
 * 沉浸式图片查看器：作品舞台、元数据检查器和缩放工具条保持在同一层级。
 * 支持滚轮缩放、拖拽平移、双击复位、方向键切换和 Esc 关闭。
 */
export function ImageZoomLightbox({
  src,
  alt,
  sourceRect,
  imageWidth,
  imageHeight,
  title,
  metadata,
  showDetailsPanel = true,
  currentIndex = 1,
  totalCount = 1,
  backdrop = "solid",
  closeButtonPlacement = "viewport",
  onDownload,
  onPrevious,
  onNext,
  onClose
}: ImageZoomLightboxProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  const lastPos = useRef({ x: 0, y: 0 });
  const pendingDelta = useRef({ x: 0, y: 0 });
  const panRaf = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback((): void => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetView();
    setNaturalSize(null);
    setInfoOpen(false);
  }, [resetView, src]);

  useEffect(() => {
    function updateViewport(): void {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(
    () => () => {
      if (panRaf.current !== null) cancelAnimationFrame(panRaf.current);
    },
    []
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        if (infoOpen) setInfoOpen(false);
        else onClose();
      } else if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [infoOpen, onClose, onNext, onPrevious]);

  const setZoom = useCallback((nextScale: number): void => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    setScale(next);
    if (next <= MIN_SCALE) setTranslate({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.stopPropagation();
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current - event.deltaY * 0.0025));
      if (next <= MIN_SCALE) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (scale <= 1) return;
      event.preventDefault();
      setPanning(true);
      lastPos.current = { x: event.clientX, y: event.clientY };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [scale]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!panning) return;
    pendingDelta.current.x += event.clientX - lastPos.current.x;
    pendingDelta.current.y += event.clientY - lastPos.current.y;
    lastPos.current = { x: event.clientX, y: event.clientY };
    if (panRaf.current !== null) return;
    panRaf.current = requestAnimationFrame(() => {
      panRaf.current = null;
      const { x, y } = pendingDelta.current;
      pendingDelta.current = { x: 0, y: 0 };
      setTranslate((current) => ({ x: current.x + x, y: current.y + y }));
    });
  }, [panning]);

  const endPan = useCallback(() => {
    setPanning(false);
    if (panRaf.current !== null) {
      cancelAnimationFrame(panRaf.current);
      panRaf.current = null;
    }
    const { x, y } = pendingDelta.current;
    pendingDelta.current = { x: 0, y: 0 };
    if (x || y) setTranslate((current) => ({ x: current.x + x, y: current.y + y }));
  }, []);

  const resolvedWidth = imageWidth ?? naturalSize?.width;
  const resolvedHeight = imageHeight ?? naturalSize?.height;
  const providedRatio = resolvedWidth && resolvedHeight ? resolvedWidth / resolvedHeight : null;
  const sourceRatio = sourceRect && sourceRect.height > 0 ? sourceRect.width / sourceRect.height : null;
  const imageRatio = providedRatio ?? sourceRatio ?? 1;
  const fittedRect = getFittedRect(viewport, imageRatio, showDetailsPanel);
  const hasSourceTransition = Boolean(sourceRect && sourceRect.width > 0 && sourceRect.height > 0);
  const sourceTransform = hasSourceTransition && sourceRect
    ? {
        x: sourceRect.left - fittedRect.left,
        y: sourceRect.top - fittedRect.top,
        scaleX: sourceRect.width / fittedRect.width,
        scaleY: sourceRect.height / fittedRect.height,
        opacity: 0.92,
        borderRadius: 12
      }
    : { x: 0, y: 0, scaleX: 0.98, scaleY: 0.98, opacity: 0, borderRadius: 8 };
  const previewTitle = title?.trim() || metadata?.name?.trim() || inferName(src, alt);
  const details = useMemo(() => [
    { label: "名称", value: metadata?.name || previewTitle },
    { label: "模型", value: metadata?.model },
    { label: "文件类型", value: metadata?.fileType || inferFileType(src) },
    { label: "文件大小", value: metadata?.fileSize },
    {
      label: "分辨率",
      value: metadata?.resolution || (resolvedWidth && resolvedHeight
        ? `${Math.round(resolvedWidth)} × ${Math.round(resolvedHeight)}`
        : undefined)
    },
    { label: "创建时间", value: metadata?.createdAt },
    { label: "创建者", value: metadata?.createdBy }
  ].filter((item): item is { label: string; value: string } => Boolean(item.value)), [
    metadata,
    previewTitle,
    resolvedHeight,
    resolvedWidth,
    src
  ]);

  async function downloadImage(): Promise<void> {
    if (!onDownload || downloading) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-label="图片全屏预览"
      aria-modal="true"
      className={cn(
        "image-preview fixed inset-0 z-[60] isolate overflow-hidden text-white",
        backdrop === "dim" ? "bg-black/55" : "bg-black/70 dark:bg-black/80"
      )}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
      onClick={(event) => {
        if (event.target === containerRef.current) onClose();
      }}
      onWheel={handleWheel}
    >
      <div className="absolute left-1/2 top-5 z-20 -translate-x-1/2 rounded-full bg-white/[0.09] px-3 py-1.5 text-xs font-medium tabular-nums text-white/90">
        {Math.min(currentIndex, totalCount)} / {Math.max(totalCount, 1)}
      </div>

      <button
        type="button"
        autoFocus
        aria-label="关闭图片预览"
        onClick={onClose}
        style={closeButtonPlacement === "image"
          ? {
              left: Math.max(12, fittedRect.left + fittedRect.width - 52),
              top: Math.max(12, fittedRect.top + 12)
            }
          : undefined}
        className={cn(
          "absolute z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.09] text-white/75 transition-colors duration-150 hover:bg-white/[0.15] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          closeButtonPlacement === "viewport" && "right-4 top-4"
        )}
      >
        <X className="h-[18px] w-[18px]" />
      </button>

      {onPrevious ? (
        <button
          type="button"
          aria-label="上一张图片"
          onClick={onPrevious}
          className="absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.09] text-white/70 transition-colors hover:bg-white/[0.15] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      {onNext ? (
        <button
          type="button"
          aria-label="下一张图片"
          onClick={onNext}
          className={cn(
            "absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.09] text-white/70 transition-colors hover:bg-white/[0.15] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            showDetailsPanel && "min-[900px]:right-[324px]"
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      <motion.div
        className="absolute"
        style={{
          left: fittedRect.left,
          top: fittedRect.top,
          width: fittedRect.width,
          height: fittedRect.height,
          transformOrigin: "top left"
        }}
        initial={reduceMotion ? false : sourceTransform}
        animate={{ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, borderRadius: 8 }}
        exit={
          reduceMotion
            ? { opacity: 0 }
            : hasSourceTransition
              ? { ...sourceTransform, transition: { duration: EXIT_DURATION, ease: EASE_OUT } }
              : { opacity: 0, scaleX: 0.98, scaleY: 0.98, transition: { duration: EXIT_DURATION, ease: EASE_OUT } }
        }
        transition={{ duration: reduceMotion ? 0 : ENTER_DURATION, ease: EASE_OUT }}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className="h-full w-full select-none rounded-lg bg-card object-contain shadow-2xl"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: panning ? "none" : "transform 0.14s ease-out",
            cursor: scale > 1 ? (panning ? "grabbing" : "grab") : "zoom-in",
            willChange: "transform",
            touchAction: "none"
          }}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
            }
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (scale > 1) resetView();
            else setZoom(2.5);
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        />
      </motion.div>

      {showDetailsPanel ? <PreviewInspector title={previewTitle} details={details} /> : null}

      <motion.div
        className={cn(
          "absolute bottom-5 z-30 flex items-center gap-1 rounded-full bg-[#181818] p-1.5 shadow-lg",
          showDetailsPanel ? "left-[calc(50%-152px)] max-[899px]:left-1/2" : "left-1/2"
        )}
        initial={reduceMotion ? false : { opacity: 0, x: "-50%", y: 8 }}
        animate={{ opacity: 1, x: "-50%", y: 0 }}
        exit={{ opacity: 0, x: "-50%", y: 4 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : 0.08, ease: EASE_OUT }}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="max-w-44 truncate px-2 text-xs text-white/68 max-[540px]:hidden">{previewTitle}</span>
        <span className="mx-0.5 h-5 w-px bg-white/10 max-[540px]:hidden" aria-hidden />
        <PreviewTool label="缩小" disabled={scale <= MIN_SCALE} onClick={() => setZoom(scale - 0.25)}>
          <Minus />
        </PreviewTool>
        <button
          type="button"
          aria-label="复位缩放"
          onClick={resetView}
          className="h-8 min-w-12 rounded-full px-2 text-[11px] tabular-nums text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {Math.round(scale * 100)}%
        </button>
        <PreviewTool label="放大" disabled={scale >= MAX_SCALE} onClick={() => setZoom(scale + 0.25)}>
          <Plus />
        </PreviewTool>
        <PreviewTool label="适应画面" onClick={resetView}>
          {scale === 1 ? <Maximize2 /> : <RotateCcw />}
        </PreviewTool>
        {onDownload ? (
          <PreviewTool label="下载图片" disabled={downloading} onClick={() => void downloadImage()}>
            <Download />
          </PreviewTool>
        ) : null}
        {showDetailsPanel ? (
          <span className="min-[900px]:hidden">
            <PreviewTool label="图片信息" active={infoOpen} onClick={() => setInfoOpen((value) => !value)}>
              <Info />
            </PreviewTool>
          </span>
        ) : null}
      </motion.div>

      {showDetailsPanel ? (
        <AnimateMobileInspector open={infoOpen} title={previewTitle} details={details} onClose={() => setInfoOpen(false)} />
      ) : null}
    </motion.div>,
    document.body
  );
}

function PreviewInspector({
  title,
  details
}: {
  title: string;
  details: Array<{ label: string; value: string }>;
}): React.ReactElement {
  return (
    <aside className="absolute bottom-0 right-0 top-0 hidden w-[304px] overflow-y-auto border-l border-white/[0.07] bg-[#050505] px-7 pb-8 pt-24 min-[900px]:block">
      <h2 className="sr-only">{title} 图片信息</h2>
      <dl className="space-y-6">
        {details.map((detail) => (
          <div key={detail.label}>
            <dt className="text-xs text-white/48">{detail.label}</dt>
            <dd className="mt-1 break-words text-sm font-medium leading-5 text-white/92">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function AnimateMobileInspector({
  open,
  title,
  details,
  onClose
}: {
  open: boolean;
  title: string;
  details: Array<{ label: string; value: string }>;
  onClose: () => void;
}): React.ReactElement | null {
  if (!open) return null;
  return (
    <motion.aside
      aria-label={`${title} 图片信息`}
      className="absolute inset-x-3 bottom-20 z-20 max-h-[38vh] overflow-y-auto rounded-xl bg-[#181818] p-4 shadow-xl min-[900px]:hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="truncate text-sm font-medium text-white">{title}</h2>
        <button
          type="button"
          aria-label="关闭图片信息"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/55 hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
        {details.map((detail) => (
          <div key={detail.label} className="min-w-0">
            <dt className="text-[11px] text-white/45">{detail.label}</dt>
            <dd className="mt-1 break-words text-xs font-medium leading-4 text-white/88">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </motion.aside>
  );
}

function PreviewTool({
  label,
  active = false,
  disabled = false,
  onClick,
  children
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-white/62 transition-colors duration-150 hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-30",
        active && "bg-white/[0.12] text-white"
      )}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{children}</span>
    </button>
  );
}
