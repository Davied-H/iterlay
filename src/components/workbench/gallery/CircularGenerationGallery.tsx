import { useUiText } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { ReactBitsCircularGallery, type ReactBitsCircularGalleryItem } from "@/components/workbench/gallery/ReactBitsCircularGallery";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { gsap, useGSAP } from "@/lib/gsap";

const FALLBACK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export interface CircularGenerationItem {
  id: string;
  imageUrl?: string | null;
  title: string;
  meta: string;
}

interface CircularGenerationGalleryProps {
  items: CircularGenerationItem[];
  activeIndex: number;
  reduceMotion: boolean;
  paused?: boolean;
  onActiveIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
}

export function CircularGenerationGallery({
  items,
  activeIndex,
  reduceMotion,
  paused = false,
  onActiveIndexChange,
  onOpen
}: CircularGenerationGalleryProps): React.ReactElement {
  const uiText = useUiText();

  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [activeCardHovered, setActiveCardHovered] = useState(false);
  const shortcutHintRef = useRef<HTMLDivElement>(null);
  const activeItem = items[activeIndex];
  const isLastItem = activeIndex === items.length - 1;
  const sceneSignature = items.map((item) => `${item.id}:${item.title}`).join("|");
  const galleryItems = useMemo<ReactBitsCircularGalleryItem[]>(() => items.map((item) => ({
    id: item.id,
    image: item.imageUrl || FALLBACK_IMAGE,
    text: item.title.length > 28 ? `${item.title.slice(0, 27)}…` : item.title
  })), [items]);

  useEffect(() => {
    setWebglUnavailable(false);
  }, [sceneSignature]);

  useGSAP(() => {
    const hint = shortcutHintRef.current;
    if (!hint) return;
    if (reduceMotion) {
      gsap.set(hint, { opacity: activeCardHovered ? 1 : 0, y: 0, scale: 1 });
      return;
    }
    gsap.to(hint, {
      opacity: activeCardHovered ? 1 : 0,
      y: activeCardHovered ? 0 : 6,
      scale: activeCardHovered ? 1 : 0.97,
      duration: activeCardHovered ? 0.24 : 0.16,
      ease: activeCardHovered ? "power3.out" : "power2.in",
      overwrite: true
    });
  }, { dependencies: [activeCardHovered, reduceMotion] });

  function selectRelative(offset: number): void {
    const next = Math.max(0, Math.min(items.length - 1, activeIndex + offset));
    if (next !== activeIndex) onActiveIndexChange(next);
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[240px] w-full flex-1 flex-col items-center justify-center gap-3 text-center text-white/42">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.055]">
          <ImageIcon className="h-5 w-5 text-white/45" />
        </span>
        <div>
          <p className="text-sm font-medium text-white/75">{uiText("当前筛选没有图片")}</p>
          <p className="mt-1 text-xs">{uiText("调整筛选或从时间线选择其他日期")}</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="relative h-full min-h-[240px] w-full flex-1 overflow-hidden">
        {webglUnavailable ? (
          <div className="grid h-full grid-cols-[repeat(auto-fit,minmax(180px,1fr))] content-center gap-3 overflow-y-auto p-8">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(index)}
                className="overflow-hidden rounded-md bg-white/[0.055] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
              >
                <div className="aspect-[3/2] bg-white/[0.04]">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <p className="truncate px-2.5 py-2 text-xs font-medium text-white/75">{item.title}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0">
            <ReactBitsCircularGallery
              items={galleryItems}
              activeIndex={activeIndex}
              bend={3}
              borderRadius={0.05}
              scrollSpeed={2}
              scrollEase={0.065}
              textColor="#d8d8d3"
              font="600 24px system-ui"
              reduceMotion={reduceMotion}
              paused={paused}
              onWebGLUnavailable={() => setWebglUnavailable(true)}
              onActiveHoverChange={setActiveCardHovered}
              onActiveIndexChange={onActiveIndexChange}
              onOpen={onOpen}
            />
          </div>
        )}

        {!webglUnavailable ? (
          <div
            ref={shortcutHintRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[12%] z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/85 px-2.5 py-1.5 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.15]"
          >
            <kbd className="flex h-5 min-w-5 items-center justify-center rounded bg-white/10 px-1 text-[11px] font-medium text-white/90 ring-1 ring-white/[0.15]">←</kbd>
            <kbd className="flex h-5 min-w-5 items-center justify-center rounded bg-white/10 px-1 text-[11px] font-medium text-white/90 ring-1 ring-white/[0.15]">→</kbd>
            <span className="ml-0.5 text-[11px] font-medium text-white/70">{uiText("图片")}</span>
            <span className="mx-0.5 h-3 w-px bg-white/15" />
            <kbd className="flex h-5 min-w-5 items-center justify-center rounded bg-white/10 px-1 text-[11px] font-medium text-white/90 ring-1 ring-white/[0.15]">↑</kbd>
            <kbd className="flex h-5 min-w-5 items-center justify-center rounded bg-white/10 px-1 text-[11px] font-medium text-white/90 ring-1 ring-white/[0.15]">↓</kbd>
            <span className="ml-0.5 text-[11px] font-medium text-white/70">{uiText("日期")}</span>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-16 max-[520px]:bottom-2 max-[520px]:px-14">
          <div className="flex min-w-0 flex-col items-center gap-2">
            <p className="max-w-xl truncate text-[11px] tabular-nums text-white/[0.62]">{activeItem?.meta}</p>
            <div
              className="pointer-events-auto flex h-9 w-[292px] max-w-[calc(100vw-7rem)] items-center gap-3 rounded-full bg-black/85 px-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.38)] ring-1 ring-white/20 max-[520px]:w-[240px]"
            >
              <div role="group" aria-label={uiText("选择图片")} className="flex min-w-0 flex-1 items-center gap-1">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onActiveIndexChange(index)}
                    aria-label={uiText("切换到第 {{ui:0}} 张：{{ui:1}}", [index + 1, item.title])}
                    aria-current={index === activeIndex ? "true" : undefined}
                    className="group flex h-5 min-w-0 flex-1 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <span
                      aria-hidden
                      className={`h-[3px] w-full rounded-full transition-[background-color,transform] duration-200 motion-reduce:transition-none ${
                        index === activeIndex
                          ? "scale-y-[1.66] bg-white"
                          : index < activeIndex
                            ? "bg-white/[0.55] group-hover:bg-white/[0.78]"
                            : "bg-white/[0.36] group-hover:bg-white/[0.68]"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span aria-hidden className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums text-white/[0.82]">
                {String(activeIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
            </div>
            <span className="sr-only" role="status" aria-live="polite">
              {uiText("第 ")}{activeIndex + 1} {uiText("张，共 ")}{items.length} {uiText("张")}{isLastItem ? uiText("，最后一张") : ""}
            </span>
          </div>
        </div>

        <GalleryArrow
          label={uiText("上一张图片")}
          side="left"
          disabled={activeIndex <= 0}
          onClick={() => selectRelative(-1)}
        />
        <GalleryArrow
          label={uiText("下一张图片")}
          side="right"
          disabled={activeIndex >= items.length - 1}
          onClick={() => selectRelative(1)}
        />
      </div>
    </TooltipProvider>
  );
}

function GalleryArrow({
  label,
  side,
  disabled,
  onClick
}: {
  label: string;
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}): React.ReactElement {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onClick}
          className={`group absolute ${side === "left" ? "left-[200px] max-[860px]:left-[170px] max-[620px]:left-4" : "right-4"} top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-white/[0.96] text-black shadow-[0_8px_30px_rgba(0,0,0,0.42)] ring-1 ring-black/[0.08] transition-[background-color,box-shadow] duration-200 hover:bg-white hover:text-black hover:shadow-[0_10px_36px_rgba(0,0,0,0.52)] focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-20`}
          aria-label={label}
        >
          <Icon className={`h-5 w-5 transition-transform duration-200 motion-reduce:transition-none ${side === "left" ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"}`} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
