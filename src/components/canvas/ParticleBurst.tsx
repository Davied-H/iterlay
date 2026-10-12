import { useEffect, useRef } from "react";

export interface ParticleBurstTrigger {
  text: string;
  /** Content-area rect of the textarea in viewport coordinates. */
  rect: { left: number; top: number; width: number; height: number };
  /** React Flow node the particles track and converge onto. Omit to disperse upward. */
  targetNodeId?: string;
  /** Particle color as an "r,g,b" string (matches the current theme's foreground). */
  color: string;
  nonce: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
  delay: number;
}

const FONT = "14px Inter, ui-sans-serif, system-ui, sans-serif";
const LINE_HEIGHT = 24;
const SAMPLE_STEP = 3;
const MAX_PARTICLES = 800;
const MAX_CANVAS_PIXELS = 1_500_000;
const MAX_DEVICE_PIXEL_RATIO = 1.25;
const TARGET_WAIT_MS = 1_500;
const TARGET_SAMPLE_INTERVAL_MS = 34;
const TARGET_SEARCH_INTERVAL_MS = 100;
const REGION_PADDING = 120;

interface ParticlePoint {
  x: number;
  y: number;
}

export interface ParticleCanvasRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function findParticleTargetNode(
  targetNodeId: string,
  root: ParentNode = document
): HTMLElement | undefined {
  const nodes = root.querySelectorAll<HTMLElement>(".react-flow__node[data-id]");
  return Array.from(nodes).find((node) => node.dataset.id === targetNodeId);
}

function particleTargetCenter(node: HTMLElement): ParticlePoint | undefined {
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function getParticleTargetCenter(targetNodeId: string, root: ParentNode = document): { x: number; y: number } | undefined {
  const node = findParticleTargetNode(targetNodeId, root);
  return node ? particleTargetCenter(node) : undefined;
}

export function getParticleCanvasRegion(
  rect: ParticleBurstTrigger["rect"],
  target: ParticlePoint | undefined,
  viewport: { width: number; height: number },
  waitsForTarget: boolean
): ParticleCanvasRegion {
  if (waitsForTarget && !target) {
    return { left: 0, top: 0, width: viewport.width, height: viewport.height };
  }

  const minX = Math.min(rect.left, target?.x ?? rect.left) - REGION_PADDING;
  const maxX = Math.max(rect.left + rect.width, target?.x ?? rect.left + rect.width) + REGION_PADDING;
  const minY = Math.min(rect.top, target?.y ?? rect.top - REGION_PADDING) - REGION_PADDING;
  const maxY = Math.max(rect.top + rect.height, target?.y ?? rect.top + rect.height) + REGION_PADDING;
  const left = Math.max(0, minX);
  const top = Math.max(0, minY);
  const right = Math.min(viewport.width, maxX);
  const bottom = Math.min(viewport.height, maxY);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

/**
 * On each new trigger, rasterizes the submitted prompt text, samples it into particles,
 * and disperses them upward — the "text turns to particles" effect. Fully self-cleaning;
 * respects prefers-reduced-motion (renders nothing).
 */
export function ParticleBurst({
  trigger,
  onComplete
}: {
  trigger: ParticleBurstTrigger | null;
  onComplete?: (nonce: number) => void;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!trigger || !trigger.text.trim()) return;
    let cancelled = false;
    let completed = false;
    const complete = (): void => {
      if (completed || cancelled) return;
      completed = true;
      onCompleteRef.current?.(trigger.nonce);
    };
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      complete();
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      complete();
      return;
    }

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const { color, targetNodeId } = trigger;
    let targetNode = targetNodeId ? findParticleTargetNode(targetNodeId) : undefined;
    let sampledTarget = targetNode ? particleTargetCenter(targetNode) : undefined;
    const region = getParticleCanvasRegion(trigger.rect, sampledTarget, viewport, Boolean(targetNodeId));
    const pixelBudgetDpr = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, region.width * region.height));
    const dpr = Math.max(
      0.5,
      Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO, pixelBudgetDpr)
    );
    canvas.width = Math.max(1, Math.floor(region.width * dpr));
    canvas.height = Math.max(1, Math.floor(region.height * dpr));
    canvas.style.left = `${region.left}px`;
    canvas.style.top = `${region.top}px`;
    canvas.style.width = `${region.width}px`;
    canvas.style.height = `${region.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles = sampleTextToParticles({
      ...trigger,
      rect: {
        ...trigger.rect,
        left: trigger.rect.left - region.left,
        top: trigger.rect.top - region.top
      }
    });
    if (particles.length === 0) {
      complete();
      return;
    }

    let frame = 0;
    let targetMissingSince: number | undefined;
    let lastTargetSampleAt = Number.NEGATIVE_INFINITY;
    let lastTargetSearchAt = Number.NEGATIVE_INFINITY;

    const tick = (now: number): void => {
      if (cancelled) return;
      ctx.clearRect(0, 0, region.width, region.height);
      if (targetNodeId && (!targetNode || !targetNode.isConnected) && now - lastTargetSearchAt >= TARGET_SEARCH_INTERVAL_MS) {
        targetNode = findParticleTargetNode(targetNodeId);
        lastTargetSearchAt = now;
      }
      if (targetNodeId && targetNode && now - lastTargetSampleAt >= TARGET_SAMPLE_INTERVAL_MS) {
        sampledTarget = particleTargetCenter(targetNode);
        lastTargetSampleAt = now;
      }
      const target = sampledTarget
        ? { x: sampledTarget.x - region.left, y: sampledTarget.y - region.top }
        : undefined;
      if (targetNodeId && !target) {
        targetMissingSince ??= now;
        if (now - targetMissingSince < TARGET_WAIT_MS) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          complete();
        }
        return;
      }
      targetMissingSince = undefined;

      let alive = 0;
      for (const p of particles) {
        if (frame < p.delay) {
          ctx.fillStyle = `rgba(${color},1)`;
          ctx.fillRect(p.x, p.y, p.size, p.size);
          alive += 1;
          continue;
        }
        if (target) {
          // Re-read the moving node center every frame so viewport animations cannot stale the target.
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          p.vx += (dx / dist) * 0.9;
          p.vy += (dy / dist) * 0.9;
          p.vx *= 0.93;
          p.vy *= 0.93;
          p.x += p.vx;
          p.y += p.vy;
          p.life -= dist < 46 ? 0.09 : p.decay * 0.5;
        } else {
          // No target: disperse upward and fade.
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.012;
          p.vx *= 0.99;
          p.life -= p.decay;
        }
        if (p.life > 0) {
          alive += 1;
          const alpha = Math.min(1, p.life * 1.6);
          const size = p.size * (0.55 + p.life * 0.45);
          ctx.fillStyle = `rgba(${color},${alpha})`;
          ctx.fillRect(p.x, p.y, size, size);
        }
      }
      frame += 1;
      if (alive > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, region.width, region.height);
        complete();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, region.width, region.height);
    };
  }, [trigger]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed z-[70]" aria-hidden />;
}

function sampleTextToParticles(trigger: ParticleBurstTrigger): Particle[] {
  const { rect, text } = trigger;
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.ceil(rect.width));
  off.height = Math.max(1, Math.ceil(rect.height));
  const octx = off.getContext("2d");
  if (!octx) return [];

  octx.font = FONT;
  octx.textBaseline = "top";
  octx.fillStyle = "#fff";

  // Character-by-character wrap (handles CJK without spaces).
  let line = "";
  let y = 0;
  for (const ch of text) {
    if (ch === "\n") {
      if (line) octx.fillText(line, 0, y);
      line = "";
      y += LINE_HEIGHT;
      continue;
    }
    const candidate = line + ch;
    if (octx.measureText(candidate).width > off.width && line) {
      octx.fillText(line, 0, y);
      line = ch;
      y += LINE_HEIGHT;
    } else {
      line = candidate;
    }
    if (y > off.height) break;
  }
  if (line && y <= off.height) octx.fillText(line, 0, y);

  const data = octx.getImageData(0, 0, off.width, off.height).data;
  const converging = Boolean(trigger.targetNodeId);
  const particles: Particle[] = [];
  let sampledPixels = 0;
  for (let py = 0; py < off.height; py += SAMPLE_STEP) {
    for (let px = 0; px < off.width; px += SAMPLE_STEP) {
      const alpha = data[(py * off.width + px) * 4 + 3];
      if (alpha > 120) {
        sampledPixels += 1;
        const particle = {
          x: rect.left + px,
          y: rect.top + py,
          // Converging bursts scatter outward first; dispersing bursts drift upward.
          vx: (Math.random() - 0.5) * (converging ? 3.2 : 1.1),
          vy: converging ? (Math.random() - 0.5) * 3.2 - 0.8 : -(0.35 + Math.random() * 1.3),
          size: SAMPLE_STEP * (0.7 + Math.random() * 0.5),
          life: 1,
          decay: 0.018 + Math.random() * 0.012,
          delay: Math.floor(Math.random() * 8)
        };
        // Reservoir sampling keeps the whole glyph represented without allowing long
        // prompts to create thousands of animated objects.
        if (particles.length < MAX_PARTICLES) {
          particles.push(particle);
        } else {
          const replacement = Math.floor(Math.random() * sampledPixels);
          if (replacement < MAX_PARTICLES) particles[replacement] = particle;
        }
      }
    }
  }
  return particles;
}
