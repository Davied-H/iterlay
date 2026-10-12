import {
  DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS,
  type ClockObservation
} from "../../shared/licensing.js";

export interface ClockRollbackCheck {
  rolledBack: boolean;
  now: string;
  lastObservedAt?: string;
  rollbackMs: number;
  observation: ClockObservation;
}

export function detectClockRollback(
  now: Date | string | number,
  previous?: ClockObservation | null,
  toleranceMs = DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS
): ClockRollbackCheck {
  if (!Number.isFinite(toleranceMs) || toleranceMs < 0) throw new TypeError("toleranceMs 必须是非负数");
  const nowMs = toTimestamp(now, "now");
  const previousMs = previous ? toTimestamp(previous.lastObservedAt, "lastObservedAt") : undefined;
  const rollbackMs = previousMs === undefined ? 0 : Math.max(0, previousMs - nowMs);
  const rolledBack = rollbackMs > toleranceMs;
  const highWaterMs = previousMs === undefined ? nowMs : Math.max(nowMs, previousMs);
  return {
    rolledBack,
    now: new Date(nowMs).toISOString(),
    lastObservedAt: previous?.lastObservedAt,
    rollbackMs,
    observation: { lastObservedAt: new Date(highWaterMs).toISOString() }
  };
}

export class ClockRollbackDetector {
  private observation?: ClockObservation;

  constructor(
    initialObservation?: ClockObservation | null,
    private readonly toleranceMs = DEFAULT_CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    this.observation = initialObservation ?? undefined;
  }

  observe(now: Date | string | number = Date.now()): ClockRollbackCheck {
    const result = detectClockRollback(now, this.observation, this.toleranceMs);
    this.observation = result.observation;
    return result;
  }

  snapshot(): ClockObservation | undefined {
    return this.observation ? { ...this.observation } : undefined;
  }
}

function toTimestamp(value: Date | string | number, field: string): number {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${field} 不是有效时间`);
  return timestamp;
}
