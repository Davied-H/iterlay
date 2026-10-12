export interface ConnectionPathPoint {
  x: number;
  y: number;
}

export interface ConnectionPathProjection {
  point: ConnectionPathPoint;
  progress: number;
}

const QUADRATIC_SAMPLE_COUNT = 24;

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0.5));
}

function samePoint(a: ConnectionPathPoint, b: ConnectionPathPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function appendPoint(points: ConnectionPathPoint[], point: ConnectionPathPoint): void {
  if (!points.length || !samePoint(points[points.length - 1], point)) points.push(point);
}

/** Samples the M/L/Q commands emitted by React Flow's smooth-step path helper. */
export function sampleConnectionPath(path: string): ConnectionPathPoint[] {
  const tokens = path.match(/[MLQ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu) ?? [];
  const points: ConnectionPathPoint[] = [];
  let command = "";
  let index = 0;
  let current: ConnectionPathPoint = { x: 0, y: 0 };

  const readNumber = (): number | null => {
    if (index >= tokens.length || /^[MLQ]$/u.test(tokens[index])) return null;
    const value = Number(tokens[index]);
    index += 1;
    return Number.isFinite(value) ? value : null;
  };

  while (index < tokens.length) {
    if (/^[MLQ]$/u.test(tokens[index])) {
      command = tokens[index];
      index += 1;
    }

    if (command === "M" || command === "L") {
      const x = readNumber();
      const y = readNumber();
      if (x === null || y === null) break;
      current = { x, y };
      appendPoint(points, current);
      if (command === "M") command = "L";
      continue;
    }

    if (command === "Q") {
      const controlX = readNumber();
      const controlY = readNumber();
      const endX = readNumber();
      const endY = readNumber();
      if (controlX === null || controlY === null || endX === null || endY === null) break;
      const start = current;
      for (let sample = 1; sample <= QUADRATIC_SAMPLE_COUNT; sample += 1) {
        const t = sample / QUADRATIC_SAMPLE_COUNT;
        const inverse = 1 - t;
        appendPoint(points, {
          x: inverse * inverse * start.x + 2 * inverse * t * controlX + t * t * endX,
          y: inverse * inverse * start.y + 2 * inverse * t * controlY + t * t * endY
        });
      }
      current = { x: endX, y: endY };
      continue;
    }

    index += 1;
  }

  return points;
}

function pathLengths(points: ConnectionPathPoint[]): { cumulative: number[]; total: number } {
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    cumulative.push(total);
  }
  return { cumulative, total };
}

export function pointAtConnectionPathProgress(
  points: ConnectionPathPoint[],
  progress: number
): ConnectionPathPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const { cumulative, total } = pathLengths(points);
  if (total === 0) return points[0];
  const target = total * clampProgress(progress);
  for (let index = 1; index < points.length; index += 1) {
    if (cumulative[index] < target) continue;
    const segmentLength = cumulative[index] - cumulative[index - 1];
    const segmentProgress = segmentLength === 0 ? 0 : (target - cumulative[index - 1]) / segmentLength;
    return {
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * segmentProgress,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * segmentProgress
    };
  }
  return points[points.length - 1];
}

export function projectPointToConnectionPath(
  points: ConnectionPathPoint[],
  target: ConnectionPathPoint
): ConnectionPathProjection {
  if (points.length === 0) return { point: target, progress: 0.5 };
  if (points.length === 1) return { point: points[0], progress: 0 };
  const { cumulative, total } = pathLengths(points);
  let closestPoint = points[0];
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
    const segmentProgress = segmentLengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((target.x - start.x) * deltaX + (target.y - start.y) * deltaY) / segmentLengthSquared));
    const point = {
      x: start.x + deltaX * segmentProgress,
      y: start.y + deltaY * segmentProgress
    };
    const distanceSquared = (target.x - point.x) ** 2 + (target.y - point.y) ** 2;
    if (distanceSquared >= closestDistanceSquared) continue;
    closestDistanceSquared = distanceSquared;
    closestPoint = point;
    closestLength = cumulative[index - 1] + Math.sqrt(segmentLengthSquared) * segmentProgress;
  }

  return {
    point: closestPoint,
    progress: total === 0 ? 0 : clampProgress(closestLength / total)
  };
}
