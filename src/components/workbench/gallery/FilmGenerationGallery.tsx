import { useUiText } from "@/i18n";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, type AnimationPlaybackControls } from "framer-motion";
import { ChevronLeft, ChevronRight, ImageIcon, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { calculateFilmFrameMetrics, nearestFilmFrameIndex, projectFilmScrollLeft, type FilmFrameMetrics } from "@/components/workbench/gallery/film-scroll";
import { gallerySourceLabel, type BoardGalleryItem } from "@/lib/board-gallery";
import { cn } from "@/lib/utils";
import "./FilmGenerationGallery.css";

interface FilmGenerationGalleryProps {
  items: BoardGalleryItem[];
  activeIndex: number;
  imageUrls: Record<string, string | null | undefined>;
  reduceMotion: boolean;
  onActiveIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
}

interface FilmDragState {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  lastX: number;
  lastAt: number;
  velocity: number;
  moved: boolean;
}

const AUTO_ADVANCE_MS = 1900;
const AUTO_FEED_DURATION = 0.95;
const WHEEL_SNAP_MS = 110;
const FILM_HOLES = Array.from({ length: 10 }, (_, index) => index);
const DEFAULT_METRICS: FilmFrameMetrics = { frameWidth: 560, edgeSpace: 24 };

export const FilmGenerationGallery = memo(function FilmGenerationGallery({
  items,
  activeIndex,
  imageUrls,
  reduceMotion,
  onActiveIndexChange,
  onOpen
}: FilmGenerationGalleryProps): React.ReactElement {
  const uiText = useUiText();

  const [playing, setPlaying] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [metrics, setMetrics] = useState<FilmFrameMetrics>(DEFAULT_METRICS);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const wheelSnapTimerRef = useRef<number | null>(null);
  const dragRef = useRef<FilmDragState | null>(null);
  const suppressClickRef = useRef(false);
  const skipNextActiveScrollRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const soundtrackRef = useRef<FilmSoundtrack | null>(null);
  const activeItem = items[activeIndex];
  activeIndexRef.current = activeIndex;

  const stopScrollAnimation = useCallback(() => {
    scrollAnimationRef.current?.stop();
    scrollAnimationRef.current = null;
  }, []);

  const frameTargetScroll = useCallback((index: number): number | null => {
    const viewport = viewportRef.current;
    const frame = frameRefs.current[index];
    if (!viewport || !frame) return null;
    return frame.offsetLeft + frame.offsetWidth / 2 - viewport.clientWidth / 2;
  }, []);

  const scrollToFrame = useCallback((
    index: number,
    immediate = false,
    duration = 0.38,
    transport = false
  ) => {
    const viewport = viewportRef.current;
    const target = frameTargetScroll(index);
    if (!viewport || target === null) return;
    const boundedTarget = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, target));
    stopScrollAnimation();
    if (immediate || reduceMotion || Math.abs(viewport.scrollLeft - boundedTarget) < 1) {
      viewport.scrollLeft = boundedTarget;
      return;
    }
    scrollAnimationRef.current = animate(viewport.scrollLeft, boundedTarget, {
      duration,
      ease: transport ? [0.45, 0, 0.55, 1] : [0.16, 1, 0.3, 1],
      onUpdate: (value) => {
        viewport.scrollLeft = value;
      }
    });
  }, [frameTargetScroll, reduceMotion, stopScrollAnimation]);

  const selectFrame = useCallback((index: number, duration = 0.38, transport = false) => {
    const next = Math.max(0, Math.min(items.length - 1, index));
    if (next !== activeIndex) {
      skipNextActiveScrollRef.current = next;
      onActiveIndexChange(next);
    }
    scrollToFrame(next, false, duration, transport);
  }, [activeIndex, items.length, onActiveIndexChange, scrollToFrame]);

  const nearestIndexForScroll = useCallback((scrollLeft: number): number => {
    const viewport = viewportRef.current;
    if (!viewport) return activeIndex;
    const centers = frameRefs.current.map((frame) => (
      frame ? frame.offsetLeft + frame.offsetWidth / 2 : Number.NaN
    ));
    return nearestFilmFrameIndex(centers, scrollLeft + viewport.clientWidth / 2, activeIndex);
  }, [activeIndex]);

  const settleOnNearestFrame = useCallback((projectedScrollLeft?: number, duration = 0.34) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const index = nearestIndexForScroll(projectedScrollLeft ?? viewport.scrollLeft);
    selectFrame(index, duration);
  }, [nearestIndexForScroll, selectFrame]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = (): void => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const { frameWidth, edgeSpace } = calculateFilmFrameMetrics(width, height);
      setMetrics((current) => (
        current.frameWidth === frameWidth && current.edgeSpace === edgeSpace
          ? current
          : { frameWidth, edgeSpace }
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => scrollToFrame(activeIndexRef.current, true));
    return () => window.cancelAnimationFrame(frame);
  }, [metrics, scrollToFrame]);

  useEffect(() => {
    if (skipNextActiveScrollRef.current === activeIndex) {
      skipNextActiveScrollRef.current = null;
      return;
    }
    scrollToFrame(activeIndex);
  }, [activeIndex, scrollToFrame]);

  useEffect(() => {
    if (!playing || items.length <= 1) return;
    const timer = window.setTimeout(() => {
      if (activeIndex >= items.length - 1) {
        setPlaying(false);
        return;
      }
      selectFrame(activeIndex + 1, AUTO_FEED_DURATION, true);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, items.length, playing, selectFrame]);

  useEffect(() => {
    setPlaying(false);
    frameRefs.current.length = items.length;
  }, [items]);

  useEffect(() => {
    if (playing && musicEnabled) {
      void soundtrackRef.current?.play();
    } else {
      soundtrackRef.current?.pause();
    }
  }, [musicEnabled, playing]);

  useEffect(() => () => {
    stopScrollAnimation();
    void soundtrackRef.current?.dispose();
    if (wheelSnapTimerRef.current !== null) window.clearTimeout(wheelSnapTimerRef.current);
  }, [stopScrollAnimation]);

  const selectRelative = useCallback((offset: number) => {
    setPlaying(false);
    selectFrame(activeIndex + offset);
  }, [activeIndex, selectFrame]);

  function togglePlayback(): void {
    if (items.length <= 1) return;
    const nextPlaying = !playing;
    if (nextPlaying) {
      if (activeIndex >= items.length - 1) selectFrame(0, AUTO_FEED_DURATION, true);
      if (musicEnabled) void getSoundtrack().play();
    } else {
      soundtrackRef.current?.pause();
    }
    setPlaying(nextPlaying);
  }

  function getSoundtrack(): FilmSoundtrack {
    soundtrackRef.current ??= new FilmSoundtrack();
    return soundtrackRef.current;
  }

  function toggleMusic(): void {
    const nextEnabled = !musicEnabled;
    setMusicEnabled(nextEnabled);
    if (nextEnabled && playing) void getSoundtrack().play();
    else soundtrackRef.current?.pause();
  }

  function scheduleWheelSnap(): void {
    if (wheelSnapTimerRef.current !== null) window.clearTimeout(wheelSnapTimerRef.current);
    wheelSnapTimerRef.current = window.setTimeout(() => {
      wheelSnapTimerRef.current = null;
      settleOnNearestFrame(undefined, 0.3);
    }, WHEEL_SNAP_MS);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    stopScrollAnimation();
    setPlaying(false);
    if (wheelSnapTimerRef.current !== null) window.clearTimeout(wheelSnapTimerRef.current);
    viewport.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocity: 0,
      moved: false
    };
    viewport.dataset.dragging = "true";
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
    drag.velocity = (drag.lastX - event.clientX) / elapsed;
    drag.lastX = event.clientX;
    drag.lastAt = event.timeStamp;
    drag.moved ||= Math.abs(delta) > 4;
    viewport.scrollLeft = drag.startScrollLeft - delta;
  }

  function finishPointerDrag(event: React.PointerEvent<HTMLDivElement>): void {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    delete viewport.dataset.dragging;
    dragRef.current = null;
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    const projected = projectFilmScrollLeft(
      viewport.scrollLeft,
      drag.velocity,
      180,
      viewport.scrollWidth - viewport.clientWidth
    );
    settleOnNearestFrame(projected, Math.min(0.48, 0.26 + Math.abs(drag.velocity) * 0.08));
  }

  if (!activeItem) {
    return (
      <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 pt-20 text-center text-white/42">
        <ImageIcon className="h-6 w-6 text-white/35" />
        <p className="text-sm text-white/68">{uiText("当前筛选没有图片")}</p>
      </div>
    );
  }

  return (
    <section
      className="gallery-film relative flex h-full min-h-0 flex-col overflow-hidden px-5 pb-2 pt-[116px] max-[620px]:px-3 max-[620px]:pt-16"
      data-playing={playing ? "true" : "false"}
      aria-label={uiText("图片胶片回放")}
    >
      <div
        ref={viewportRef}
        className="gallery-film-viewport relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/45"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") selectRelative(-1);
          else if (event.key === "ArrowRight") selectRelative(1);
          else if (event.key === " ") {
            event.preventDefault();
            togglePlayback();
          }
        }}
        onWheel={(event) => {
          const viewport = viewportRef.current;
          if (!viewport || items.length <= 1) return;
          event.preventDefault();
          stopScrollAnimation();
          setPlaying(false);
          viewport.scrollLeft += Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
          scheduleWheelSnap();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          className="gallery-film-strip"
          style={{
            paddingInline: metrics.edgeSpace,
            minWidth: items.length * metrics.frameWidth + metrics.edgeSpace * 2
          }}
        >
          {items.map((item, index) => {
            const path = item.imagePath;
            const active = index === activeIndex;
            return (
              <button
                key={item.id}
                ref={(node) => { frameRefs.current[index] = node; }}
                type="button"
                className={cn("gallery-film-frame", active && "is-active")}
                style={{ width: metrics.frameWidth }}
                aria-label={uiText("第 {{ui:0}} 帧，{{ui:1}}{{ui:2}}", [index + 1, formatClock(item.createdAt), active ? "，点击打开图片" : ""])}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  if (active) onOpen(index);
                  else {
                    setPlaying(false);
                    selectFrame(index);
                  }
                }}
              >
                <FilmSprockets position="top" />
                <span className="gallery-film-window">
                  {imageUrls[path] ? (
                    <img
                      src={imageUrls[path] ?? undefined}
                      alt=""
                      className="h-full w-full object-contain"
                      loading={Math.abs(index - activeIndex) > 2 ? "lazy" : "eager"}
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-white/[0.025]">
                      <ImageIcon className="h-7 w-7 text-white/25" />
                    </span>
                  )}
                  <span className="gallery-film-exposure">
                      <span className="text-xs tabular-nums text-white/82">{formatClock(item.createdAt)}</span>
                      <span className="text-[11px] text-white/72">{gallerySourceLabel(item.source)}</span>
                  </span>
                </span>
                <span aria-hidden className="gallery-film-stock">ITERLAY 35</span>
                <span aria-hidden className="gallery-film-frame-number">{String(index + 1).padStart(2, "0")}</span>
                <FilmSprockets position="bottom" />
              </button>
            );
          })}
        </div>
      </div>

      <footer className="gallery-film-transport h-14 shrink-0">
        <div className="flex shrink-0 items-center gap-1">
          <TransportButton label={uiText("上一帧")} disabled={activeIndex <= 0} onClick={() => selectRelative(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </TransportButton>
          <TransportButton label={playing ? uiText("暂停回放") : uiText("播放图片")} disabled={items.length <= 1} onClick={togglePlayback} primary>
            {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
          </TransportButton>
          <TransportButton label={musicEnabled ? uiText("关闭背景音乐") : uiText("开启背景音乐")} disabled={false} onClick={toggleMusic}>
            {musicEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </TransportButton>
          <TransportButton label={uiText("下一帧")} disabled={activeIndex >= items.length - 1} onClick={() => selectRelative(1)}>
            <ChevronRight className="h-4 w-4" />
          </TransportButton>
        </div>
        <span className="hidden w-12 shrink-0 text-[10px] font-medium tabular-nums text-white/48 min-[720px]:block">
          {formatClock(activeItem.createdAt)}
        </span>
        <label className="flex min-w-0 flex-1 items-center">
          <span className="sr-only">{uiText("选择胶片帧")}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, items.length - 1)}
            step={1}
            value={activeIndex}
            disabled={items.length <= 1}
            onChange={(event) => {
              setPlaying(false);
              selectFrame(Number(event.target.value), 0.28);
            }}
            className="gallery-film-scrubber"
          />
        </label>
        <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/58">
          {String(activeIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
        </span>
      </footer>
    </section>
  );
});

function FilmSprockets({ position }: { position: "top" | "bottom" }): React.ReactElement {
  return (
    <span aria-hidden className={`gallery-film-sprockets gallery-film-sprockets--${position}`}>
      {FILM_HOLES.map((hole) => <span key={hole} className="gallery-film-sprocket" />)}
    </span>
  );
}

function TransportButton({
  label,
  disabled,
  primary = false,
  onClick,
  children
}: {
  label: string;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-white/72 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.1] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-24 motion-reduce:transform-none motion-reduce:transition-none",
        primary && "bg-white/[0.1] text-white hover:bg-white/[0.16]"
      )}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString((document.documentElement.lang || "zh-CN"), { hour: "2-digit", minute: "2-digit", hour12: false });
}

class FilmSoundtrack {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private chordTimer: number | null = null;
  private chordIndex = 0;
  private running = false;

  async play(): Promise<void> {
    this.ensureAudioGraph();
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    if (context.state === "suspended") await context.resume();
    if (this.running) return;
    this.running = true;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(0.55, now + 0.45);
    this.scheduleChord();
    this.chordTimer = window.setInterval(() => this.scheduleChord(), 3200);
  }

  pause(): void {
    this.running = false;
    if (this.chordTimer !== null) {
      window.clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  }

  async dispose(): Promise<void> {
    this.pause();
    this.noise?.stop();
    this.noise = null;
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
    this.master = null;
  }

  private ensureAudioGraph(): void {
    if (this.context) return;
    const context = new AudioContext();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = 0.0001;
    compressor.threshold.value = -22;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    master.connect(compressor).connect(context.destination);
    this.context = context;
    this.master = master;
    this.noise = this.createTapeNoise(context, master);
  }

  private createTapeNoise(context: AudioContext, destination: AudioNode): AudioBufferSourceNode {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.42;
    gain.gain.value = 0.008;
    source.connect(filter).connect(gain).connect(destination);
    source.start();
    return source;
  }

  private scheduleChord(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.running) return;
    const progression = [
      [130.81, 164.81, 196, 246.94],
      [110, 130.81, 164.81, 220],
      [98, 123.47, 146.83, 196],
      [116.54, 146.83, 174.61, 220]
    ];
    const chord = progression[this.chordIndex % progression.length];
    const now = context.currentTime;
    chord.forEach((frequency, voiceIndex) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      oscillator.type = voiceIndex === 0 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = voiceIndex % 2 === 0 ? -4 : 4;
      filter.type = "lowpass";
      filter.frequency.value = 1050;
      filter.Q.value = 0.7;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(voiceIndex === 0 ? 0.032 : 0.018, now + 0.48);
      envelope.gain.setValueAtTime(voiceIndex === 0 ? 0.032 : 0.018, now + 2.35);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
      oscillator.connect(filter).connect(envelope).connect(master);
      oscillator.start(now);
      oscillator.stop(now + 3.65);
    });
    this.chordIndex += 1;
  }
}
