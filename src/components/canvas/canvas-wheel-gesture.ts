export const CANVAS_WHEEL_GESTURE_IDLE_MS = 180;

export type CanvasWheelGestureAction = "passthrough" | "redirect-to-canvas" | "block-canvas";

export interface CanvasWheelGestureInput {
  blockedByCanvasBoundary: boolean;
  hasLocalScroller: boolean;
  bypassLock?: boolean;
}

type CanvasWheelGestureOwner = "canvas" | "local" | null;

export class CanvasWheelGestureLock {
  private owner: CanvasWheelGestureOwner = null;
  private expiresAt = 0;

  constructor(private readonly idleMs = CANVAS_WHEEL_GESTURE_IDLE_MS) {}

  resolve(input: CanvasWheelGestureInput, now = performance.now()): CanvasWheelGestureAction {
    if (input.bypassLock) {
      this.reset();
      return input.blockedByCanvasBoundary ? "redirect-to-canvas" : "passthrough";
    }

    if (now > this.expiresAt) this.owner = null;

    if (this.owner === "canvas") {
      this.expiresAt = now + this.idleMs;
      return input.blockedByCanvasBoundary ? "redirect-to-canvas" : "passthrough";
    }

    if (this.owner === "local") {
      if (input.blockedByCanvasBoundary && !input.hasLocalScroller) {
        this.owner = "canvas";
        this.expiresAt = now + this.idleMs;
        return "redirect-to-canvas";
      }
      this.expiresAt = now + this.idleMs;
      return input.blockedByCanvasBoundary ? "passthrough" : "block-canvas";
    }

    if (input.blockedByCanvasBoundary) {
      if (input.hasLocalScroller) {
        this.owner = "local";
        this.expiresAt = now + this.idleMs;
        return "passthrough";
      }
      this.owner = "canvas";
      this.expiresAt = now + this.idleMs;
      return "redirect-to-canvas";
    }

    this.owner = "canvas";
    this.expiresAt = now + this.idleMs;
    return "passthrough";
  }

  reset(): void {
    this.owner = null;
    this.expiresAt = 0;
  }
}

const LOCAL_SCROLL_CONTAINER_SELECTOR = [
  ".canvas-overlay-menu",
  "[data-canvas-wheel-scroll]",
  "[role='listbox']",
  "[role='menu']"
].join(",");

export function isBlockedCanvasWheelTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".nowheel"));
}

function canScrollInDirection(
  position: number,
  viewportSize: number,
  contentSize: number,
  delta: number
): boolean {
  if (delta === 0 || contentSize <= viewportSize) return false;
  const maxPosition = contentSize - viewportSize;
  return delta < 0 ? position > 0 : position < maxPosition;
}

function hasScrollableOverflow(element: Element, deltaX: number, deltaY: number): boolean {
  const style = window.getComputedStyle(element);
  const canScrollX = /^(auto|scroll|overlay)$/.test(style.overflowX)
    && canScrollInDirection(element.scrollLeft, element.clientWidth, element.scrollWidth, deltaX);
  const canScrollY = /^(auto|scroll|overlay)$/.test(style.overflowY)
    && canScrollInDirection(element.scrollTop, element.clientHeight, element.scrollHeight, deltaY);
  return canScrollX || canScrollY;
}

export function hasLocalWheelScroller(
  target: EventTarget | null,
  activeElement: Element | null,
  canvasRoot: Element,
  deltaX: number,
  deltaY: number
): boolean {
  if (!(target instanceof Element)) return false;

  let candidate: Element | null = target;
  while (candidate && candidate !== canvasRoot) {
    if (hasScrollableOverflow(candidate, deltaX, deltaY)) {
      const containsFocus = Boolean(activeElement && (candidate === activeElement || candidate.contains(activeElement)));
      const belongsToMenu = Boolean(candidate.closest(LOCAL_SCROLL_CONTAINER_SELECTOR));
      if (containsFocus || belongsToMenu) return true;
    }
    candidate = candidate.parentElement;
  }

  return false;
}

export function cloneWheelEvent(event: WheelEvent): WheelEvent {
  return new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode
  });
}
