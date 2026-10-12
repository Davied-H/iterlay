export interface LatestFrameTask<T> {
  schedule: (value: T) => void;
  flush: (value?: T) => void;
  cancel: () => void;
}

/** Coalesces high-frequency pointer/drag input into at most one update per frame. */
export function createLatestFrameTask<T>(run: (value: T) => void): LatestFrameTask<T> {
  let frame: number | null = null;
  let latest: T | undefined;
  let hasLatest = false;

  const cancel = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    latest = undefined;
    hasLatest = false;
  };

  const commit = (): void => {
    frame = null;
    if (!hasLatest) return;
    const value = latest as T;
    latest = undefined;
    hasLatest = false;
    run(value);
  };

  return {
    schedule(value) {
      latest = value;
      hasLatest = true;
      if (frame === null) frame = requestAnimationFrame(commit);
    },
    flush(value) {
      if (value !== undefined) {
        latest = value;
        hasLatest = true;
      }
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      commit();
    },
    cancel
  };
}
