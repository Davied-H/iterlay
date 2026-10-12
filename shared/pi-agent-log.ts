export const PI_AGENT_LOG_EVENT_CHANNEL = "pi-agent-log:event";

export type PiAgentLogLevel = "info" | "warn" | "error";

export type PiAgentLogEvent =
  | "agent_start"
  | "image_ready"
  | "model_start"
  | "model_end"
  | "turn_start"
  | "decision"
  | "tool_start"
  | "tool_end"
  | "agent_end"
  | "error";

export interface PiAgentLogEntry {
  id: string;
  timestamp: string;
  taskId?: string;
  level: PiAgentLogLevel;
  event: PiAgentLogEvent;
  summary: string;
  toolName?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface PiAgentLogInput {
  taskId?: string;
  level?: PiAgentLogLevel;
  event: PiAgentLogEvent;
  summary: string;
  toolName?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface PiAgentLogSnapshot {
  entries: PiAgentLogEntry[];
  logPath: string;
}
