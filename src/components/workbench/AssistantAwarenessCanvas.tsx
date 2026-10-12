import { useEffect, useRef } from "react";

const ICON_SIZE = 18;
const MAX_PIXEL_RATIO = 2;
const TAU = Math.PI * 2;

interface AssistantAwarenessCanvasProps {
  active: boolean;
  reduceMotion: boolean;
  className?: string;
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D
): void {
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
  const backingSize = Math.round(ICON_SIZE * pixelRatio);
  if (canvas.width !== backingSize || canvas.height !== backingSize) {
    canvas.width = backingSize;
    canvas.height = backingSize;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
}

function drawAwarenessFrame(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  elapsed: number,
  staticFrame: boolean
): void {
  prepareCanvas(canvas, context);
  const color = getComputedStyle(canvas).color;
  const phase = staticFrame ? 0.75 : elapsed / 920;
  const center = ICON_SIZE / 2;
  const rotation = phase * TAU;

  context.save();
  context.translate(center, center);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";

  context.rotate(rotation);
  context.globalAlpha = 0.28;
  context.lineWidth = 1.15;
  context.beginPath();
  context.arc(0, 0, 6, -0.2, Math.PI * 1.42);
  context.stroke();
  const arcEnd = Math.PI * 1.42;
  context.globalAlpha = 0.9;
  context.beginPath();
  context.arc(Math.cos(arcEnd) * 6, Math.sin(arcEnd) * 6, 1.05, 0, TAU);
  context.fill();
  context.restore();

  const pulse = staticFrame ? 1 : 0.9 + Math.sin(phase * TAU * 1.4) * 0.1;
  const outerRadius = 3.25 * pulse;
  const innerRadius = 1.15;
  context.save();
  context.translate(center, center);
  context.rotate(staticFrame ? 0 : -rotation * 0.18);
  context.globalAlpha = staticFrame ? 0.82 : 0.72 + Math.sin(phase * TAU) * 0.12;
  context.fillStyle = color;
  context.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + index * (Math.PI / 4);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

export function AssistantAwarenessCanvas({
  active,
  reduceMotion,
  className
}: AssistantAwarenessCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let animationFrame = 0;
    let startedAt: number | null = null;

    const drawStatic = (): void => drawAwarenessFrame(canvas, context, 0, true);
    if (!active || reduceMotion) {
      drawStatic();
      return;
    }

    const draw = (timestamp: number): void => {
      startedAt ??= timestamp;
      drawAwarenessFrame(canvas, context, timestamp - startedAt, false);
      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
      data-assistant-awareness-canvas={active ? "active" : "idle"}
      className={className}
    />
  );
}
