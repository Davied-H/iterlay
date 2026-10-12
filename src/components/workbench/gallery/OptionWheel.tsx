import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import "./OptionWheel.css";

type Side = "left" | "right";

interface OptionWheelProps {
  items: string[];
  defaultSelected?: number;
  onChange?: (index: number, item: string) => void;
  textColor?: string;
  activeColor?: string;
  side?: Side;
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
  ariaLabel?: string;
  className?: string;
}

interface WheelConfig {
  count: number;
  items: string[];
  rowH: number;
  curve: number;
  tilt: number;
  blur: number;
  fade: number;
  minOpacity: number;
  side: Side;
  loop: boolean;
  smoothing: number;
  draggable: boolean;
  soundUrl: string;
  soundVolume: number;
}

export function OptionWheel({
  items,
  defaultSelected = 0,
  onChange,
  textColor = "#b7c0cc",
  activeColor = "#eef2f6",
  side = "left",
  fontSize = 3,
  spacing = 1.4,
  curve = 1,
  tilt = 6,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.05,
  smoothing = 200,
  inset = 80,
  loop = false,
  draggable = true,
  soundUrl = "",
  soundVolume = 0.5,
  ariaLabel = "选项滚轮",
  className = ""
}: OptionWheelProps): React.ReactElement {
  const safeDefault = Math.max(0, Math.min(items.length - 1, defaultSelected));
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef(safeDefault);
  const targetRef = useRef(safeDefault);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const cfgRef = useRef<WheelConfig>({} as WheelConfig);
  const onChangeRef = useRef(onChange);
  const selectedRef = useRef(safeDefault);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const dragMovedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const lastTickRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(safeDefault);
  const [isDragging, setIsDragging] = useState(false);
  const remPx = typeof window !== "undefined"
    ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    : 16;

  onChangeRef.current = onChange;
  cfgRef.current = {
    count: items.length,
    items,
    rowH: Math.max(fontSize * spacing * remPx, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume
  };

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const cfg = cfgRef.current;
    const tau = Math.max(cfg.smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);
    const target = targetRef.current;
    const current = posRef.current;
    let next = current + (target - current) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    posRef.current = next;

    const mirror = cfg.side === "right" ? -1 : 1;
    const tiltRad = (cfg.tilt * Math.PI) / 180;
    const radius = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;
    for (let index = 0; index < cfg.count; index += 1) {
      const element = itemRefs.current[index];
      if (!element) continue;
      let distanceFromTarget = index - next;
      if (cfg.loop && cfg.count > 1) {
        distanceFromTarget = ((distanceFromTarget % cfg.count) + cfg.count) % cfg.count;
        if (distanceFromTarget > cfg.count / 2) distanceFromTarget -= cfg.count;
      }
      const distance = Math.abs(distanceFromTarget);
      let x = 0;
      let y = distanceFromTarget * cfg.rowH;
      let rotation = 0;
      if (radius > 0) {
        const angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, distanceFromTarget * tiltRad));
        y = radius * Math.sin(angle);
        x = -mirror * radius * (1 - Math.cos(angle)) * cfg.curve;
        rotation = (mirror * angle * 180) / Math.PI;
      }
      element.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rotation.toFixed(3)}deg)`;
      element.style.opacity = String(Math.max(cfg.minOpacity, 1 - distance * cfg.fade));
      element.style.filter = cfg.blur > 0 ? `blur(${(distance * cfg.blur).toFixed(2)}px)` : "none";
      element.style.setProperty("--ow-p", Math.max(0, 1 - Math.min(distance, 1)).toFixed(4));
    }
    rafRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const playTick = useCallback(() => {
    const config = cfgRef.current;
    if (!config.soundUrl) return;
    const now = performance.now();
    if (now - lastTickRef.current < 70) return;
    lastTickRef.current = now;
    if (!audioRef.current || audioUrlRef.current !== config.soundUrl) {
      audioRef.current = new Audio(config.soundUrl);
      audioRef.current.preload = "auto";
      audioUrlRef.current = config.soundUrl;
    }
    const audio = audioRef.current;
    audio.volume = Math.min(Math.max(config.soundVolume, 0), 1);
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  const applyTarget = useCallback((value: number, snap: boolean) => {
    const config = cfgRef.current;
    if (config.count === 0) return;
    let next = value;
    if (!config.loop) next = Math.min(Math.max(next, 0), Math.max(config.count - 1, 0));
    if (snap) next = Math.round(next);
    targetRef.current = next;
    const index = ((Math.round(next) % config.count) + config.count) % config.count;
    if (index !== selectedRef.current) {
      selectedRef.current = index;
      setSelectedIndex(index);
      onChangeRef.current?.(index, config.items[index]);
      playTick();
    }
    startLoop();
  }, [playTick, startLoop]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const config = cfgRef.current;
      const delta = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
      const step = Math.max(-1, Math.min(1, delta / config.rowH));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!cfgRef.current.draggable) return;
    dragRef.current = { y: event.clientY, start: targetRef.current, id: event.pointerId };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientY - drag.y;
    if (!dragMovedRef.current && Math.abs(delta) > 4) {
      dragMovedRef.current = true;
      rootRef.current?.setPointerCapture(drag.id);
    }
    if (dragMovedRef.current) applyTarget(drag.start - delta / cfgRef.current.rowH, false);
  }, [applyTarget]);

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  }, [applyTarget]);

  const handleItemClick = useCallback((index: number) => {
    if (dragMovedRef.current) return;
    const config = cfgRef.current;
    const current = targetRef.current;
    let distance = index - (((current % config.count) + config.count) % config.count);
    if (config.loop && config.count > 1) {
      if (distance > config.count / 2) distance -= config.count;
      else if (distance < -config.count / 2) distance += config.count;
    }
    applyTarget(current + distance, true);
  }, [applyTarget]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta: number | null = null;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") delta = -1;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") delta = 1;
    if (delta === null) return;
    event.preventDefault();
    applyTarget(Math.round(targetRef.current) + delta, true);
  }, [applyTarget]);

  useLayoutEffect(() => {
    const now = performance.now();
    lastRef.current = now;
    runFrame(now);
  }, [blur, curve, fade, fontSize, inset, items, loop, minOpacity, runFrame, side, smoothing, spacing, tilt]);

  useEffect(() => {
    if (items.length === 0) return;
    const next = Math.max(0, Math.min(items.length - 1, defaultSelected));
    if (next === selectedRef.current && next === targetRef.current) return;
    selectedRef.current = next;
    targetRef.current = next;
    setSelectedIndex(next);
    startLoop();
  }, [defaultSelected, items.length, startLoop]);

  useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    audioRef.current?.pause();
  }, []);

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`option-wheel${side === "right" ? " option-wheel--right" : ""}${isDragging ? " option-wheel--dragging" : ""}${className ? ` ${className}` : ""}`}
      style={{
        "--ow-text-color": textColor,
        "--ow-active-color": activeColor,
        "--ow-font-size": `${fontSize}rem`,
        "--ow-inset": `${inset}px`
      } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((label, index) => (
        <div
          key={`${label}-${index}`}
          ref={(element) => { itemRefs.current[index] = element; }}
          role="option"
          aria-selected={selectedIndex === index}
          className={`option-wheel__item${selectedIndex === index ? " option-wheel__item--selected" : ""}`}
          onClick={() => handleItemClick(index)}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
