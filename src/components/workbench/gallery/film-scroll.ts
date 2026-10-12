export function nearestFilmFrameIndex(
  frameCenters: number[],
  viewportCenter: number,
  fallbackIndex = 0
): number {
  let nearestIndex = fallbackIndex;
  let nearestDistance = Number.POSITIVE_INFINITY;
  frameCenters.forEach((center, index) => {
    if (!Number.isFinite(center)) return;
    const distance = Math.abs(center - viewportCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

export function projectFilmScrollLeft(
  scrollLeft: number,
  velocity: number,
  projectionMs: number,
  maxScrollLeft: number
): number {
  return Math.max(0, Math.min(maxScrollLeft, scrollLeft + velocity * projectionMs));
}

export interface FilmFrameMetrics {
  frameWidth: number;
  edgeSpace: number;
}

/** Keeps the active film frame large on wide displays without overflowing short windows. */
export function calculateFilmFrameMetrics(width: number, height: number): FilmFrameMetrics {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const widthRatio = safeWidth < 620 ? 0.8 : 0.68;
  const maxByHeight = Math.max(220, (safeHeight - 78) * 1.5);
  const frameWidth = Math.round(Math.max(220, Math.min(920, safeWidth * widthRatio, maxByHeight)));
  const edgeSpace = Math.max(16, Math.round((safeWidth - frameWidth) / 2));
  return { frameWidth, edgeSpace };
}
