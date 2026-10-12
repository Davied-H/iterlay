import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImageOff, Play, Scissors, Star, Trash2, Upload, Video } from "lucide-react";
import type { AssetLibraryItem } from "@shared/types";
import type { MasonryRect } from "@/lib/masonry";
import { getThumbHashDataUrl } from "@/lib/thumbhash-placeholder";
import {
  EASE_OUT,
  EASE_OUT_EXPO,
  ENTRANCE_BLUR,
  ENTRANCE_DURATION,
  ENTRANCE_Y,
  EXIT_DURATION,
  HOVER_DURATION,
  HOVER_SCALE,
  IMAGE_REVEAL_DURATION,
  REFLOW_DURATION
} from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface AssetCardProps {
  item: AssetLibraryItem;
  rect: MasonryRect;
  /** null = 不播进场（该卡片已进过场）；数字 = 进场错峰 delay（秒）。 */
  entranceDelay: number | null;
  /** 首屏批进场带上移；后续新增（筛选/翻页/滚入）只淡入。 */
  entranceWithLift: boolean;
  /** 首屏进场的纵向起点偏移；素材库按卡片位置换算到视口底部之外。 */
  entranceOffset?: number;
  /** false 时位置直接跳变（容器 resize / 减少动效）。 */
  animatePosition: boolean;
  reduceMotion: boolean;
  onOpen: (item: AssetLibraryItem, element: HTMLElement) => void;
  onToggleFavorite: (item: AssetLibraryItem) => void;
  onDelete: (item: AssetLibraryItem) => void;
}

/**
 * 退场按触发原因区分：筛选移除播缩小淡出；滚动剔除（虚拟化窗口收缩）立即卸载。
 * filterExit 由 AnimatePresence 的 custom 传入，卸载时仍能拿到最新值。
 */
const cardVariants = {
  exit: (filterExit: boolean) =>
    filterExit
      ? { opacity: 0, scale: 0.9, transition: { duration: EXIT_DURATION, ease: EASE_OUT } }
      : { opacity: 0, transition: { duration: 0 } }
};

function AssetCardComponent({
  item,
  rect,
  entranceDelay,
  entranceWithLift,
  entranceOffset = ENTRANCE_Y,
  animatePosition,
  reduceMotion,
  onOpen,
  onToggleFavorite,
  onDelete
}: AssetCardProps): React.ReactElement {
  const [revealed, setRevealed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const instantRevealRef = useRef(false);
  const isVideo = item.mediaType === "video";

  useEffect(() => {
    instantRevealRef.current = false;
    setRevealed(false);
    setLoadFailed(false);
  }, [item.thumbnailUrl, item.dataUrl]);

  // 缓存命中的图片在挂载时已 complete：直接显示，不再播渐显（防二次闪烁）。
  const handleImageRef = (node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) {
      instantRevealRef.current = true;
      setRevealed(true);
    }
  };

  const placeholder = isVideo ? undefined : getThumbHashDataUrl(item.thumbHash);
  const positionTransition =
    animatePosition && !reduceMotion
      ? { duration: REFLOW_DURATION, ease: EASE_OUT }
      : { duration: 0 };

  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ willChange: "transform, width, height, opacity" }}
      initial={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
      animate={{
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: 1,
        scale: 1
      }}
      transition={{
        x: positionTransition,
        y: positionTransition,
        width: positionTransition,
        height: positionTransition,
        opacity: { duration: 0 },
        scale: { duration: 0 }
      }}
      variants={cardVariants}
      exit="exit"
    >
      <motion.div
        className="group relative h-full w-full"
        initial={
          entranceDelay === null
            ? false
            : entranceWithLift
              ? { opacity: 0, y: entranceOffset, filter: `blur(${ENTRANCE_BLUR}px)` }
              : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        whileHover={reduceMotion ? undefined : { scale: HOVER_SCALE }}
        transition={{
          duration: reduceMotion ? 0 : ENTRANCE_DURATION,
          ease: entranceWithLift ? EASE_OUT_EXPO : EASE_OUT,
          delay: reduceMotion ? 0 : (entranceDelay ?? 0),
          scale: { duration: reduceMotion ? 0 : HOVER_DURATION, ease: EASE_OUT }
        }}
      >
        <button
          type="button"
          onClick={(event) => onOpen(item, event.currentTarget)}
          aria-label={item.prompt || "查看素材"}
          className="absolute inset-0 block h-full w-full overflow-hidden rounded-xl border border-transparent bg-card shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-ring/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {!isVideo && item.hasAlpha && <span aria-hidden className="asset-checkerboard absolute inset-0" />}
          {/* 占位与真图保持同层，由外层统一执行 React Bits 风格的悬停回缩。 */}
          <span className="absolute inset-0 block">
            {placeholder && (
              <img
                src={placeholder}
                alt=""
                aria-hidden
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {isVideo ? (
              <video
                src={item.dataUrl}
                poster={item.posterUrl || undefined}
                preload="metadata"
                muted
                playsInline
                onLoadedData={() => {
                  setLoadFailed(false);
                  setRevealed(true);
                }}
                onError={() => {
                  setLoadFailed(true);
                  setRevealed(false);
                }}
                className="absolute inset-0 h-full w-full object-cover transition-opacity"
                style={{ opacity: revealed ? 1 : 0 }}
              />
            ) : (
              <img
                ref={handleImageRef}
                src={item.thumbnailUrl}
                alt={item.prompt || "素材"}
                draggable={false}
                onLoad={() => {
                  setLoadFailed(false);
                  setRevealed(true);
                }}
                onError={() => {
                  setLoadFailed(true);
                  setRevealed(false);
                }}
                className="absolute inset-0 h-full w-full object-cover transition-opacity"
                style={{
                  opacity: revealed ? 1 : 0,
                  transitionDuration:
                    instantRevealRef.current || reduceMotion
                      ? "0ms"
                      : `${IMAGE_REVEAL_DURATION * 1000}ms`
                }}
              />
            )}
          </span>
          {!revealed && !loadFailed && <span aria-hidden className="asset-shimmer" />}
          {loadFailed ? (
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/90 text-muted-foreground">
              {isVideo ? <Video className="h-5 w-5" aria-hidden="true" /> : <ImageOff className="h-5 w-5" aria-hidden="true" />}
              <span className="text-[11px] font-medium">预览不可用</span>
            </span>
          ) : null}
          {isVideo && revealed ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-sm">
                <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
              </span>
            </span>
          ) : null}
          {isVideo ? (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {item.durationMs ? `${Math.max(1, Math.round(item.durationMs / 1_000))}s` : "视频"}
            </span>
          ) : null}
          {/* hover：底部深色渐变遮罩 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 via-black/25 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
          />
          {/* 来源角标 */}
          {item.source === "upload" && (
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Upload className="h-3 w-3" />
              上传
            </span>
          )}
          {item.source === "slice" && (
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Scissors className="h-3 w-3" />
              切图
            </span>
          )}
        </button>
        {/* 操作不能嵌进主按钮；收藏状态保留常显，删除仅在悬停或键盘聚焦时露出。 */}
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(item);
            }}
            aria-label={item.favorite ? "取消收藏" : "收藏"}
            aria-pressed={item.favorite}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full bg-background transition-[opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              item.favorite
                ? "opacity-100"
                : "translate-y-1 opacity-0 focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
            )}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                item.favorite ? "fill-current text-[hsl(var(--favorite))]" : "text-foreground"
              )}
            />
          </button>
          <button
            type="button"
            title="删除"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item);
            }}
            aria-label="删除"
            className="translate-y-1 flex h-7 w-7 items-center justify-center rounded-full bg-background text-destructive opacity-0 transition-[opacity,transform,background-color] duration-150 hover:bg-destructive/10 focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export const AssetCard = memo(AssetCardComponent);
