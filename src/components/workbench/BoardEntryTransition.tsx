import { useRef } from "react";
import { Flip, gsap, useGSAP } from "@/lib/gsap";

interface BoardEntryTransitionProps {
  origin: { left: number; top: number; width: number; height: number };
  thumbnailDataUrl?: string;
  onComplete: () => void;
}

export function BoardEntryTransition({
  origin,
  thumbnailDataUrl,
  onComplete
}: BoardEntryTransitionProps): React.ReactElement {
  const proxyRef = useRef<HTMLDivElement>(null);
  const comicPlaceholder = thumbnailDataUrl === "comic-drama:";

  useGSAP(() => {
    const proxy = proxyRef.current;
    if (!proxy) return;

    const start = Flip.getState(proxy);
    gsap.set(proxy, {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      borderRadius: 0
    });

    Flip.from(start, {
      duration: 0.56,
      ease: "power3.inOut",
      scale: true,
      simple: true,
      onComplete: () => {
        gsap.to(proxy, {
          opacity: 0,
          duration: 0.16,
          ease: "power2.out",
          onComplete
        });
      }
    });
  }, { scope: proxyRef });

  return (
    <div
      ref={proxyRef}
      aria-hidden
      data-board-entry-transition=""
      className="pointer-events-none fixed z-[80] overflow-hidden border border-border bg-muted shadow-2xl will-change-transform"
      style={{
        left: origin.left,
        top: origin.top,
        width: origin.width,
        height: origin.height,
        borderRadius: 12
      }}
    >
      {thumbnailDataUrl && !comicPlaceholder ? (
        <img
          src={thumbnailDataUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={comicPlaceholder ? "h-full w-full" : "h-full w-full bg-background"}
          style={comicPlaceholder ? {
            background: "radial-gradient(circle at 76% 24%, #2b3a3d 0, transparent 24%), radial-gradient(circle at 46% 72%, #182729 0, transparent 18%), #0b1213"
          } : undefined}
        />
      )}
      <div className="absolute inset-0 bg-background/10" />
    </div>
  );
}
