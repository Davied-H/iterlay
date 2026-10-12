export const GENERATION_ESTIMATE_MS = 2 * 60 * 1000;

export interface GenerationTiming {
  elapsedSeconds: number;
  remainingSeconds: number;
  elapsedLabel: string;
  remainingLabel: string;
  overdue: boolean;
}

export function getGenerationTiming(startedAt: number, now = Date.now()): GenerationTiming {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const estimateSeconds = GENERATION_ESTIMATE_MS / 1000;
  const remainingSeconds = Math.max(0, estimateSeconds - elapsedSeconds);

  return {
    elapsedSeconds,
    remainingSeconds,
    elapsedLabel: formatDuration(elapsedSeconds),
    remainingLabel: formatDuration(remainingSeconds),
    overdue: elapsedSeconds >= estimateSeconds
  };
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
