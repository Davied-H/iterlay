import { useUiText } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface VersionCompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** 在已有固定尺寸预览框内铺满；素材详情默认仍按图片宽高比自适应。 */
  fill?: boolean;
  className?: string;
}

/**
 * 前后对比滑块：两张图都绝对定位、同尺寸铺满、object-contain，用 clip-path 裁上层，
 * 保证两图像素级对齐（不会像"裁容器宽度 + 图片自适应"那样把某张图压缩）。
 * 容器宽高比按图片自然比例取，避免竖图被塞进横版框里错位。
 */
export function VersionCompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  fill = false,
  className
}: VersionCompareSliderProps): React.ReactElement {
  const uiText = useUiText();

  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50); // 0–100，左侧显示 before 的比例
  const [ratio, setRatio] = useState<number | null>(null);
  const dragging = useRef(false);
  const dragRect = useRef<DOMRect | null>(null);
  const pendingClientX = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  const updatePosition = useCallback((clientX: number, rect = dragRect.current) => {
    if (!rect || rect.width === 0) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  const schedulePositionUpdate = useCallback(
    (clientX: number) => {
      pendingClientX.current = clientX;
      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (pendingClientX.current !== null) updatePosition(pendingClientX.current);
      });
    },
    [updatePosition]
  );

  useEffect(
    () => () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      dragRect.current = containerRef.current?.getBoundingClientRect() ?? null;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current) schedulePositionUpdate(e.clientX);
    },
    [schedulePositionUpdate]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    dragRect.current = null;
    pendingClientX.current = null;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - 2));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + 2));
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative mx-auto w-full max-w-full cursor-ew-resize select-none overflow-hidden rounded-xl border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        fill && "h-full max-h-none",
        className
      )}
      style={fill ? undefined : { aspectRatio: ratio ? String(ratio) : "1 / 1", maxHeight: "60vh" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-label={uiText("版本对比滑块")}
      aria-valuenow={Math.round(position)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* After（底层，铺满） */}
      <img
        src={afterSrc}
        alt={afterLabel ?? "之后"}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        draggable={false}
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
        }}
      />

      {/* Before（上层，同尺寸铺满，clip-path 裁到左侧 position%） */}
      <img
        src={beforeSrc}
        alt={beforeLabel ?? "之前"}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />

      {/* 分隔手柄 */}
      <div
        className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-foreground/70"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-foreground">
            <path d="M5 4L2 8L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 4L14 8L11 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* 标签 */}
      {beforeLabel ? (
        <span
          className={cn(
            "pointer-events-none absolute left-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur transition-opacity",
            position < 12 && "opacity-0"
          )}
        >
          {beforeLabel}
        </span>
      ) : null}
      {afterLabel ? (
        <span
          className={cn(
            "pointer-events-none absolute right-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur transition-opacity",
            position > 88 && "opacity-0"
          )}
        >
          {afterLabel}
        </span>
      ) : null}
    </div>
  );
}
