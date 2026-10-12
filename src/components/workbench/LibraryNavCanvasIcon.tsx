import { useEffect, useRef, useState } from "react";

export type LibraryNavIconKind = "create" | "boards" | "assets" | "scenes" | "inspiration";

interface LibraryNavCanvasIconProps {
  kind: LibraryNavIconKind;
  active: boolean;
}

const ICON_SIZE = 18;
const ANIMATION_DURATION: Record<LibraryNavIconKind, number> = {
  create: 680,
  boards: 720,
  assets: 860,
  scenes: 780,
  inspiration: 800
};
const ACTIVE_COLOR_CLASS: Record<LibraryNavIconKind, string> = {
  create: "text-foreground",
  boards: "text-foreground",
  assets: "text-foreground",
  scenes: "text-foreground",
  inspiration: "text-foreground"
};

type IconRenderState = "inactive" | "animating" | "active";

function drawCreate(context: CanvasRenderingContext2D, progress: number, state: IconRenderState): void {
  const arrival = state === "animating" ? easeOutBack(staggeredProgress(progress, 0, 0.66)) : 1;
  const active = state !== "inactive";
  context.save();
  context.translate(8, 8);
  context.scale(Math.max(0.2, arrival), Math.max(0.2, arrival));
  context.rotate((1 - clamp(arrival)) * -0.4);
  context.translate(-8, -8);
  if (active) {
    context.save();
    context.globalAlpha = 0.12;
    starPath(context, 7, 8.6, 5.2);
    context.fill();
    context.restore();
  }
  starPath(context, 7, 8.6, 5.2);
  context.stroke();
  starPath(context, 12.6, 3.4, 2.2);
  context.stroke();
  context.restore();
}

function usePrefersReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (): void => setReduceMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return reduceMotion;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - clamp(value), 3);
}

function easeOutBack(value: number): number {
  const progress = clamp(value);
  const overshoot = 1.35;
  return 1 + (overshoot + 1) * Math.pow(progress - 1, 3) + overshoot * Math.pow(progress - 1, 2);
}

function staggeredProgress(progress: number, delay: number, duration: number): number {
  return clamp((progress - delay) / duration);
}

function drawBoards(context: CanvasRenderingContext2D, progress: number, state: IconRenderState): void {
  const cells = [
    { x: 1.5, y: 1.5, directionX: -1, directionY: -1 },
    { x: 9.25, y: 1.5, directionX: 1, directionY: -1 },
    { x: 1.5, y: 9.25, directionX: -1, directionY: 1 },
    { x: 9.25, y: 9.25, directionX: 1, directionY: 1 }
  ] as const;
  const active = state !== "inactive";

  cells.forEach((cell, index) => {
    const localProgress = state === "animating"
      ? staggeredProgress(progress, index * 0.1, 0.58)
      : 1;
    const arrival = easeOutCubic(localProgress);
    const scale = state === "animating" ? Math.max(0.12, easeOutBack(localProgress)) : 1;
    const centerX = cell.x + 2.625;
    const centerY = cell.y + 2.625;

    context.save();
    context.translate(
      centerX + cell.directionX * (1 - arrival) * 3.8,
      centerY + cell.directionY * (1 - arrival) * 3.8
    );
    context.rotate((1 - arrival) * cell.directionX * 0.38);
    context.scale(scale, scale);

    if (active) {
      context.save();
      context.globalAlpha = 0.14 + localProgress * 0.08;
      roundedRect(context, -2.625, -2.625, 5.25, 5.25, 0.8);
      context.fill();
      context.restore();
    }

    roundedRect(context, -2.625, -2.625, 5.25, 5.25, 0.8);
    context.stroke();
    context.restore();
  });
}

function drawAssets(context: CanvasRenderingContext2D, progress: number, state: IconRenderState): void {
  const active = state !== "inactive";
  const arrival = state === "animating" ? easeOutCubic(staggeredProgress(progress, 0, 0.68)) : 1;
  const scale = state === "animating"
    ? Math.max(0.35, easeOutBack(staggeredProgress(progress, 0, 0.68)))
    : 1;

  context.save();
  context.translate(8, 8);
  context.rotate((1 - arrival) * -0.28);
  context.scale(scale, scale);
  context.translate(-8, -8);

  if (active) {
    context.save();
    context.globalAlpha = 0.08;
    roundedRect(context, 1.25, 1.25, 13.5, 13.5, 1.65);
    context.fill();
    context.restore();
  }
  roundedRect(context, 1.25, 1.25, 13.5, 13.5, 1.65);
  context.stroke();

  const sunProgress = state === "animating" ? easeOutBack(staggeredProgress(progress, 0.2, 0.62)) : 1;
  const sunX = 4 + (10.9 - 4) * sunProgress;
  const sunY = 11.8 + (5.05 - 11.8) * sunProgress;
  if (active) {
    context.save();
    context.globalAlpha = 0.18;
    context.beginPath();
    context.arc(sunX, sunY, 1.25, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.beginPath();
  context.arc(sunX, sunY, 1.25, 0, Math.PI * 2);
  context.stroke();

  if (state === "animating") {
    const burst = Math.sin(staggeredProgress(progress, 0.5, 0.42) * Math.PI);
    context.save();
    context.globalAlpha = burst * 0.78;
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI / 4) * index;
      const inner = 2 + burst * 0.2;
      const outer = 2.65 + burst * 0.55;
      context.beginPath();
      context.moveTo(sunX + Math.cos(angle) * inner, sunY + Math.sin(angle) * inner);
      context.lineTo(sunX + Math.cos(angle) * outer, sunY + Math.sin(angle) * outer);
      context.stroke();
    }
    context.restore();
  }

  context.beginPath();
  context.moveTo(2.8, 12.7);
  context.lineTo(6.25, 8.85);
  context.lineTo(8.7, 11.2);
  context.lineTo(10.3, 9.65);
  context.lineTo(13.4, 12.7);
  context.stroke();
  context.restore();
}

function starPath(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number
): void {
  const inner = radius * 0.23;
  context.beginPath();
  context.moveTo(centerX, centerY - radius);
  context.quadraticCurveTo(centerX, centerY - inner, centerX + radius, centerY);
  context.quadraticCurveTo(centerX + inner, centerY, centerX, centerY + radius);
  context.quadraticCurveTo(centerX, centerY + inner, centerX - radius, centerY);
  context.quadraticCurveTo(centerX - inner, centerY, centerX, centerY - radius);
  context.closePath();
}

function drawScenes(context: CanvasRenderingContext2D, progress: number, state: IconRenderState): void {
  const stars = [
    { x: 6.1, y: 8.4, radius: 4.25, delay: 0 },
    { x: 11.9, y: 3.6, radius: 2.05, delay: 0.16 },
    { x: 12.25, y: 12.4, radius: 1.55, delay: 0.3 }
  ];
  const active = state !== "inactive";
  const arrival = state === "animating" ? easeOutCubic(staggeredProgress(progress, 0, 0.75)) : 1;
  const clusterScale = state === "animating"
    ? Math.max(0.42, easeOutBack(staggeredProgress(progress, 0, 0.72)))
    : 1;

  context.save();
  context.translate(8, 8);
  context.rotate((1 - arrival) * -0.55);
  context.scale(clusterScale, clusterScale);
  context.translate(-8, -8);

  stars.forEach((star) => {
    const localProgress = state === "animating"
      ? staggeredProgress(progress, star.delay, 0.48)
      : 1;
    const scale = state === "animating" ? Math.max(0.12, easeOutBack(localProgress)) : 1;
    context.save();
    context.globalAlpha = state === "animating" ? clamp(localProgress * 1.6) : 1;
    starPath(context, star.x, star.y, star.radius * scale);
    if (active) {
      context.save();
      context.globalAlpha = 0.12;
      context.fill();
      context.restore();
    }
    context.stroke();
    context.restore();
  });
  context.restore();

  if (state === "animating") {
    const burst = Math.sin(staggeredProgress(progress, 0.28, 0.45) * Math.PI);
    context.save();
    context.globalAlpha = burst * 0.72;
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI / 4) * index;
      context.beginPath();
      context.moveTo(8 + Math.cos(angle) * 5.1, 8 + Math.sin(angle) * 5.1);
      context.lineTo(8 + Math.cos(angle) * (6.4 + burst), 8 + Math.sin(angle) * (6.4 + burst));
      context.stroke();
    }
    context.restore();
  }
}

function drawInspiration(context: CanvasRenderingContext2D, progress: number, state: IconRenderState): void {
  const active = state !== "inactive";
  const bulbProgress = state === "animating" ? easeOutBack(staggeredProgress(progress, 0, 0.62)) : 1;
  const rayProgress = state === "animating" ? easeOutCubic(staggeredProgress(progress, 0.24, 0.58)) : 1;
  const glow = state === "animating" ? clamp(staggeredProgress(progress, 0.12, 0.68)) : 1;

  context.save();
  context.translate(8, 8);
  context.scale(Math.max(0.18, bulbProgress), Math.max(0.18, bulbProgress));
  context.translate(-8, -8);

  if (active) {
    context.save();
    context.globalAlpha = 0.1 * glow;
    context.beginPath();
    context.arc(8, 7.15, 4.7, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  context.beginPath();
  context.arc(8, 7.15, 3.35, Math.PI * 0.88, Math.PI * 2.12);
  context.stroke();
  context.beginPath();
  context.moveTo(5.85, 9.68);
  context.quadraticCurveTo(6.55, 10.46, 6.55, 11.35);
  context.lineTo(9.45, 11.35);
  context.quadraticCurveTo(9.45, 10.46, 10.15, 9.68);
  context.stroke();
  context.beginPath();
  context.moveTo(6.55, 12.95);
  context.lineTo(9.45, 12.95);
  context.moveTo(6.85, 14.35);
  context.lineTo(9.15, 14.35);
  context.stroke();
  context.restore();

  const rays = [
    { x1: 8, y1: 1.05, x2: 8, y2: -0.3 },
    { x1: 3.75, y1: 2.9, x2: 2.72, y2: 1.87 },
    { x1: 12.25, y1: 2.9, x2: 13.28, y2: 1.87 },
    { x1: 2.28, y1: 7.15, x2: 0.9, y2: 7.15 },
    { x1: 13.72, y1: 7.15, x2: 15.1, y2: 7.15 }
  ];
  rays.forEach((ray, index) => {
    const localProgress = state === "animating"
      ? staggeredProgress(rayProgress, index * 0.1, 0.52)
      : 1;
    const length = easeOutCubic(localProgress);
    context.save();
    context.globalAlpha = state === "animating" ? localProgress : 1;
    context.beginPath();
    context.moveTo(ray.x1, ray.y1);
    context.lineTo(ray.x1 + (ray.x2 - ray.x1) * length, ray.y1 + (ray.y2 - ray.y1) * length);
    context.stroke();
    context.restore();
  });
}

function drawIcon(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  kind: LibraryNavIconKind,
  progress: number,
  state: IconRenderState
): void {
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const backingSize = Math.round(ICON_SIZE * pixelRatio);
  if (canvas.width !== backingSize || canvas.height !== backingSize) {
    canvas.width = backingSize;
    canvas.height = backingSize;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
  context.translate(1, 1);
  context.strokeStyle = getComputedStyle(canvas).color;
  context.fillStyle = getComputedStyle(canvas).color;
  context.lineWidth = 1.45;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (kind === "create") drawCreate(context, progress, state);
  else if (kind === "boards") drawBoards(context, progress, state);
  else if (kind === "assets") drawAssets(context, progress, state);
  else if (kind === "scenes") drawScenes(context, progress, state);
  else drawInspiration(context, progress, state);
}

export function LibraryNavCanvasIcon({ kind, active }: LibraryNavCanvasIconProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const shouldAnimate = active && !reduceMotion;
    let animationFrame = 0;
    let startTime: number | null = null;

    const drawResting = (): void => {
      drawIcon(canvas, context, kind, 1, active ? "active" : "inactive");
    };
    const requestRestingDraw = (): void => {
      window.requestAnimationFrame(drawResting);
    };

    if (shouldAnimate) {
      const drawFrame = (timestamp: number): void => {
        startTime ??= timestamp;
        const progress = clamp((timestamp - startTime) / ANIMATION_DURATION[kind]);
        drawIcon(canvas, context, kind, progress, "animating");
        if (progress < 1) animationFrame = window.requestAnimationFrame(drawFrame);
        else drawResting();
      };
      animationFrame = window.requestAnimationFrame(drawFrame);
    } else {
      drawResting();
    }

    const owner = canvas.closest("button");
    owner?.addEventListener("pointerenter", requestRestingDraw);
    owner?.addEventListener("pointerleave", requestRestingDraw);
    owner?.addEventListener("focus", requestRestingDraw);
    owner?.addEventListener("blur", requestRestingDraw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      owner?.removeEventListener("pointerenter", requestRestingDraw);
      owner?.removeEventListener("pointerleave", requestRestingDraw);
      owner?.removeEventListener("focus", requestRestingDraw);
      owner?.removeEventListener("blur", requestRestingDraw);
    };
  }, [active, kind, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
      data-library-nav-icon={kind}
      data-active={active ? "true" : "false"}
      className={`pointer-events-none h-[18px] w-[18px] shrink-0 ${active ? ACTIVE_COLOR_CLASS[kind] : ""}`}
    />
  );
}
