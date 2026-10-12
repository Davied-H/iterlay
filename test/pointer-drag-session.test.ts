// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPointerDragSession, type PointerDragSession } from "../src/lib/pointer-drag-session";

let session: PointerDragSession | undefined;
let target: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
const move = vi.fn(), end = vi.fn(), cancel = vi.fn();
const dispatch = (type: string, values: Partial<PointerEvent> = {}, destination: EventTarget = window) => {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerId: 7, pointerType: "mouse", buttons: 1, clientX: 50, clientY: 60 }, values);
  destination.dispatchEvent(event);
};
const tick = () => {
  const current = [...frames.values()];
  frames.clear();
  current.forEach(callback => callback(0));
};
beforeEach(() => {
  vi.clearAllMocks();
  frames = new Map();
  let sequence = 0, captured = false;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  target = document.createElement("div");
  document.body.append(target);
  target.setPointerCapture = vi.fn(() => { captured = true; });
  target.hasPointerCapture = vi.fn(() => captured);
  target.releasePointerCapture = vi.fn(() => {
    captured = false;
    dispatch("lostpointercapture", {}, target);
  });
  session = startPointerDragSession({ target, pointerId: 7, onMove: move, onEnd: end, onCancel: cancel });
});
afterEach(() => { session?.dispose(); target.remove(); vi.restoreAllMocks(); });

describe("window pointer drag session", () => {
  it("coalesces high-frequency moves into one latest-position update per frame", () => {
    for (let index = 0; index < 100; index++) dispatch("pointermove", { clientX: index });
    expect(move).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    tick();
    expect(move).toHaveBeenCalledTimes(1);
    expect(move.mock.calls[0][0].clientX).toBe(99);
  });

  it("flushes the final held move on pointerup and never follows subsequent hover", () => {
    dispatch("pointermove", { clientX: 90 });
    dispatch("pointerup", { buttons: 0 });
    expect(move).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    dispatch("pointermove", { clientX: 400, buttons: 0 });
    tick();
    expect(move).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("stops on buttons=0 even when pointerup was lost, without moving to hover coordinates", () => {
    dispatch("pointermove", { clientX: 90 });
    tick();
    dispatch("pointermove", { clientX: 999, buttons: 0 });
    dispatch("pointermove", { clientX: 1000, buttons: 1 });
    tick();
    expect(move).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "visibilitychange"])("cancels pending work on %s and removes all listeners", (type) => {
    dispatch("pointermove");
    if (type === "visibilitychange") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event(type));
    } else if (type === "blur") window.dispatchEvent(new Event(type));
    else dispatch(type, {}, type === "lostpointercapture" ? target : window);
    tick();
    dispatch("pointermove");
    dispatch("pointerup");
    tick();
    expect(move).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });

  it("ignores other pointers and silently disposes on unmount", () => {
    dispatch("pointermove", { pointerId: 8 });
    dispatch("pointerup", { pointerId: 8 });
    expect(end).not.toHaveBeenCalled();
    dispatch("pointermove");
    session!.dispose();
    tick();
    expect(move).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps the window fallback when setPointerCapture fails", () => {
    session!.dispose();
    target.setPointerCapture = vi.fn(() => { throw new Error("capture unavailable"); });
    session = startPointerDragSession({ target, pointerId: 7, onMove: move, onEnd: end, onCancel: cancel });
    dispatch("pointermove");
    tick();
    dispatch("pointerup", { buttons: 0 });
    expect(move).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("finishes even if capture release races with pointer removal", () => {
    target.releasePointerCapture = vi.fn(() => { throw new Error("pointer removed"); });
    dispatch("pointerup", { buttons: 0 });
    expect(end).toHaveBeenCalledTimes(1);
    dispatch("pointermove");
    tick();
    expect(move).not.toHaveBeenCalled();
  });
});
