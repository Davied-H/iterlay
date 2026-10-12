import { useCallback, useEffect, useRef } from "react";

export const NODE_INPUT_COMMIT_DELAY_MS = 400;

export function useDebouncedNodeCommit<T>(
  onCommit: (value: T) => void,
  delay = NODE_INPUT_COMMIT_DELAY_MS,
  onFirstChange?: () => void
): { schedule: (value: T) => void; flush: () => void; finish: () => void; cancel: () => void } {
  const commitRef = useRef(onCommit);
  const firstChangeRef = useRef(onFirstChange);
  const pendingRef = useRef<T | undefined>(undefined);
  const timerRef = useRef<number | null>(null);
  const firstChangeFrameRef = useRef<number | null>(null);
  const firstChangeTimerRef = useRef<number | null>(null);
  const firstChangePendingRef = useRef(false);
  const sessionDirtyRef = useRef(false);
  commitRef.current = onCommit;
  firstChangeRef.current = onFirstChange;

  const cancelScheduledFirstChange = useCallback(() => {
    if (firstChangeFrameRef.current !== null) {
      window.cancelAnimationFrame(firstChangeFrameRef.current);
      firstChangeFrameRef.current = null;
    }
    if (firstChangeTimerRef.current !== null) {
      window.clearTimeout(firstChangeTimerRef.current);
      firstChangeTimerRef.current = null;
    }
  }, []);

  const runFirstChange = useCallback(() => {
    cancelScheduledFirstChange();
    if (!firstChangePendingRef.current) return;
    firstChangePendingRef.current = false;
    firstChangeRef.current?.();
  }, [cancelScheduledFirstChange]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    cancelScheduledFirstChange();
    firstChangePendingRef.current = false;
    pendingRef.current = undefined;
    sessionDirtyRef.current = false;
  }, [cancelScheduledFirstChange]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    runFirstChange();
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending !== undefined) commitRef.current(pending);
  }, [runFirstChange]);

  const schedule = useCallback((value: T) => {
    if (!sessionDirtyRef.current) {
      sessionDirtyRef.current = true;
      firstChangePendingRef.current = true;

      if (typeof window.requestAnimationFrame === "function") {
        // The second frame runs after the freshly typed value has had a chance to paint.
        firstChangeFrameRef.current = window.requestAnimationFrame(() => {
          firstChangeFrameRef.current = window.requestAnimationFrame(runFirstChange);
        });
      } else {
        firstChangeTimerRef.current = window.setTimeout(runFirstChange, 0);
      }
    }
    pendingRef.current = value;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, delay);
  }, [delay, flush, runFirstChange]);

  const finish = useCallback(() => {
    flush();
    sessionDirtyRef.current = false;
  }, [flush]);

  useEffect(() => () => flush(), [flush]);
  return { schedule, flush, finish, cancel };
}
