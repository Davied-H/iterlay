export interface PointerDragSession {
  cancel: () => void;
  dispose: () => void;
}

/** Window listeners survive header replacement while a dock detaches. */
export function startPointerDragSession(options: {
  target: HTMLElement;
  pointerId: number;
  onMove: (event: PointerEvent) => void;
  onEnd: () => void;
  onCancel: () => void;
}): PointerDragSession {
  const { target, pointerId } = options;
  let active = true;
  let frame: number | null = null;
  let pending: PointerEvent | null = null;

  const cleanup = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", visibility);
    target.removeEventListener("lostpointercapture", lostCapture);
    try {
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // The pointer/element may already have disappeared; still finish state.
    }
  };
  const finish = (reason: "end" | "cancel" | "dispose"): void => {
    if (!active) return;
    active = false;
    const finalMove = pending;
    pending = null;
    cleanup();
    if (reason === "end") {
      if (finalMove) options.onMove(finalMove);
      options.onEnd();
    } else if (reason === "cancel") {
      options.onCancel();
    }
  };
  const move = (event: PointerEvent): void => {
    if (!active || event.pointerId !== pointerId) return;
    // A pointerup outside the window may never arrive. Do not move on hover.
    if (event.pointerType !== "touch" && (event.buttons & 1) === 0) {
      finish("end");
      return;
    }
    pending = event;
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      const latest = pending;
      pending = null;
      if (active && latest) options.onMove(latest);
    });
  };
  const up = (event: PointerEvent): void => { if (event.pointerId === pointerId) finish("end"); };
  const cancel = (event: PointerEvent): void => { if (event.pointerId === pointerId) finish("cancel"); };
  const lostCapture = (event: PointerEvent): void => { if (event.pointerId === pointerId) finish("cancel"); };
  const blur = (): void => finish("cancel");
  const visibility = (): void => { if (document.hidden) finish("cancel"); };

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  target.addEventListener("lostpointercapture", lostCapture);
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Window listeners remain the fallback if capture is unavailable.
  }
  return { cancel: () => finish("cancel"), dispose: () => finish("dispose") };
}
