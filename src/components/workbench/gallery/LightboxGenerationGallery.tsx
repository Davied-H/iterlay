import { useUiText } from "@/i18n";
import { memo, useEffect, useRef } from "react";
import { ImageIcon } from "lucide-react";
import { gallerySourceLabel, type BoardGalleryItem } from "@/lib/board-gallery";
import { cn } from "@/lib/utils";
import "./LightboxGenerationGallery.css";

interface LightboxGenerationGalleryProps {
  items: BoardGalleryItem[];
  activeIndex: number;
  imageUrls: Record<string, string | null | undefined>;
  onActiveIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
}

export const LightboxGenerationGallery = memo(function LightboxGenerationGallery({
  items,
  activeIndex,
  imageUrls,
  onActiveIndexChange,
  onOpen
}: LightboxGenerationGalleryProps): React.ReactElement {
  const uiText = useUiText();

  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

  if (items.length === 0) return <GalleryEmptyState />;

  return (
    <section className="gallery-lightbox" aria-label={uiText("灵感灯箱")}>
      <div className="gallery-lightbox__housing">
        <div className="gallery-lightbox__hardware" aria-hidden>
          <span className="gallery-lightbox__brand">ITERLAY · CONTACT</span>
          <span className="gallery-lightbox__ticks" />
          <span className="gallery-lightbox__power" />
        </div>

        <div className="gallery-lightbox__surface-scroll">
          <div
            className="gallery-lightbox__contact-sheet"
            role="listbox"
            aria-label={uiText("选择图片")}
          >
            {items.map((item, index) => {
              const imageUrl = imageUrls[item.imagePath];
              const active = index === activeIndex;
              return (
                <button
                  key={item.id}
                  ref={active ? activeRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => active ? onOpen(index) : onActiveIndexChange(index)}
                  className={cn("gallery-lightbox__photo", active && "is-active")}
                  title={item.prompt || gallerySourceLabel(item.source)}
                >
                  <span className="gallery-lightbox__photo-media">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.prompt || `${formatClock(item.createdAt)} 的${gallerySourceLabel(item.source)}图片`}
                        loading={index < 9 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                      />
                    ) : (
                      <span className="gallery-lightbox__photo-missing">
                        <ImageIcon aria-hidden />
                      </span>
                    )}
                    <span className="gallery-lightbox__photo-index" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="gallery-lightbox__photo-meta">
                      <time dateTime={item.createdAt}>{formatClock(item.createdAt)}</time>
                      <span>{gallerySourceLabel(item.source)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
});

function GalleryEmptyState(): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 pt-20 text-center text-white/42">
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

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString((document.documentElement.lang || "zh-CN"), { hour: "2-digit", minute: "2-digit", hour12: false });
}
