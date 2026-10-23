export interface AssistantAttachmentSnapshot {
  id: string;
  src: string;
  name: string;
  role: "reference" | "edit-target";
}

export interface AssistantToolCall {
  id: string;
  name: string;
  status: "running" | "completed" | "error" | "cancelled";
  input?: string;
  output?: string;
}

/** Display-only details: never forward these records as model instructions. */
export function sanitizeAssistantToolDetails(value: unknown): string {
  const seen = new WeakSet<object>();
  let remaining = 500;
  const clean = (entry: unknown, depth: number): unknown => {
    if (depth > 6 || --remaining < 0) return "[truncated]";
    if (typeof entry === "string") {
      return entry
        .replace(/data:[^;\s]+;base64,[a-z0-9+/=\s]+/gi, "[image omitted]")
        .replace(/\b(?:sk-|sk_|ghp_|gho_)[a-z0-9_-]{8,}/gi, "[redacted]")
        .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/((?:api.?key|access.?token|refresh.?token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"',;\s}]+/gi, "$1[redacted]")
        .slice(0, 3000);
    }
    if (!entry || typeof entry !== "object") return entry;
    if (!Array.isArray(entry) && (entry as Record<string, unknown>).type === "image") {
      return { type: "image", data: "[image omitted]" };
    }
    if (seen.has(entry)) return "[circular]";
    seen.add(entry);
    if (Array.isArray(entry)) return entry.slice(0, 30).map((item) => clean(item, depth + 1));
    return Object.fromEntries(Object.entries(entry).slice(0, 40).map(([key, item]) => [
      key,
      /token|secret|password|authorization|cookie|api.?key|dataBase64|^data$|bytes/i.test(key)
        ? "[redacted]"
        : clean(item, depth + 1)
    ]));
  };
  return (typeof value === "string" ? String(clean(value, 0)) : JSON.stringify(clean(value, 0), null, 2) ?? "")
    .slice(0, 8000);
}

export function mergeAssistantToolCall(calls: AssistantToolCall[] = [], update: AssistantToolCall): AssistantToolCall[] {
  const existing = calls.find((call) => call.id === update.id);
  if (existing && existing.status !== "running" && update.status === "running") return calls;
  return existing
    ? calls.map((call) => call.id === update.id ? { ...call, ...update } : call)
    : [...calls, update].slice(-100);
}

export function settleAssistantToolCalls(calls: AssistantToolCall[] | undefined, status: "cancelled" | "error"): AssistantToolCall[] | undefined {
  return calls?.map((call) => call.status === "running" ? { ...call, status } : call);
}
