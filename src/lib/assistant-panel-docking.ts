export type AssistantDockSide = "left" | "right";

export interface AssistantDockLayout {
  side: AssistantDockSide;
  width: number;
}

export const ASSISTANT_DOCK_LAYOUT_STORAGE_KEY = "iterlay.assistantDockLayout";
export const ASSISTANT_DOCK_THRESHOLD = 72;
export const ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH = 760;
export const ASSISTANT_DOCK_MIN_WIDTH = 320;
export const ASSISTANT_DOCK_MAX_WIDTH = 480;

interface AssistantDockMagnetInput {
  panelLeft: number;
  panelWidth: number;
  viewportWidth: number;
  leftAvailable?: boolean;
  rightAvailable?: boolean;
  threshold?: number;
}

export interface AssistantDockMagnet {
  side: AssistantDockSide;
  left: number;
  strength: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function edgeStrength(distance: number, threshold: number): number {
  const proximity = 1 - clamp(distance / threshold, 0, 1);
  return proximity * proximity;
}

function isAssistantDockLayout(value: unknown): value is AssistantDockLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<AssistantDockLayout>;
  return (
    (layout.side === "left" || layout.side === "right")
    && Number.isFinite(layout.width)
    && (layout.width as number) > 0
  );
}

export function readAssistantDockLayout(
  storage?: Pick<Storage, "getItem">
): AssistantDockLayout | null {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return null;
    const raw = target.getItem(ASSISTANT_DOCK_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAssistantDockLayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAssistantDockLayout(
  layout: AssistantDockLayout | null,
  storage?: Pick<Storage, "setItem" | "removeItem">
): void {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return;
    if (layout === null) {
      target.removeItem(ASSISTANT_DOCK_LAYOUT_STORAGE_KEY);
      return;
    }
    if (isAssistantDockLayout(layout)) {
      target.setItem(ASSISTANT_DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }
  } catch {
    // 本地存储不可用时，停靠偏好仍会保留到当前应用会话结束。
  }
}

/**
 * Resolves the edge preview and a gently attracted horizontal position.
 * The squared proximity keeps the panel responsive at the outer edge of the
 * hot zone, then makes the final alignment decisive without elastic motion.
 */
export function resolveAssistantDockMagnet({
  panelLeft,
  panelWidth,
  viewportWidth,
  leftAvailable = true,
  rightAvailable = true,
  threshold = ASSISTANT_DOCK_THRESHOLD
}: AssistantDockMagnetInput): AssistantDockMagnet | null {
  if (
    viewportWidth < ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH
    || panelWidth <= 0
    || threshold <= 0
  ) return null;

  const leftDistance = Math.max(0, panelLeft);
  const rightTarget = viewportWidth - panelWidth;
  const rightDistance = Math.max(0, rightTarget - panelLeft);
  const candidates = [
    ...(leftAvailable && leftDistance <= threshold
      ? [{ side: "left" as const, distance: leftDistance, target: 0 }]
      : []),
    ...(rightAvailable && rightDistance <= threshold
      ? [{ side: "right" as const, distance: rightDistance, target: rightTarget }]
      : [])
  ].sort((a, b) => a.distance - b.distance);
  const candidate = candidates[0];
  if (!candidate) return null;

  const strength = edgeStrength(candidate.distance, threshold);
  const pull = strength * 0.72;
  return {
    side: candidate.side,
    left: panelLeft + (candidate.target - panelLeft) * pull,
    strength
  };
}

export function resolveAssistantDockWidth(
  preferredWidth: number | null | undefined,
  viewportWidth: number
): number {
  const availableWidth = Math.max(ASSISTANT_DOCK_MIN_WIDTH, viewportWidth - 320);
  const maximum = Math.min(ASSISTANT_DOCK_MAX_WIDTH, availableWidth);
  return clamp(preferredWidth ?? 360, ASSISTANT_DOCK_MIN_WIDTH, maximum);
}
