import { useEffect, useState } from "react";
export interface PluginContext {
  boardId: string;
  selectedNodeIds: string[];
  theme: "light" | "dark";
  locale: string;
}
export interface PluginBoardSnapshot {
  boardId: string;
  revision: number;
  nodes: Array<{ id: string; type: string; [key: string]: unknown }>;
  connections: unknown[];
  groups: unknown[];
}

let nextId = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
let context: PluginContext | null = null;
window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.source !== "iterlay-host") return;
  const message = event.data;
  if (message.type === "response") {
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error)); else item.resolve(message.result);
  } else {
    if (message.type === "context") context = message.context;
    for (const listener of listeners) listener(message);
  }
});
function call<T>(method: string, params: unknown = null): Promise<T> {
  const id = String(++nextId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("宿主响应超时，请重新打开工具。")); }, 60_000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    window.parent.postMessage({ source: "iterlay-plugin", id, method, params }, "*");
  });
}
export const iterlay = {
  workspace: { back: () => call<void>("workspace.back"), manage: () => call<void>("workspace.manage"), export: () => call<void>("workspace.export") },
  context: { get: () => call<PluginContext>("context.get") },
  board: {
    previews: () => call<Record<string, string>>("board.previews"),
    snapshot: <T = PluginBoardSnapshot>() => call<T>("board.snapshot"),
    applyPlan: (plan: unknown) => call("board.applyPlan", plan),
    select: (nodeIds: string[]) => call("board.select", { nodeIds })
  },
  storage: {
    get: <T>(scope: "settings" | "board") => call<T | null>("storage.get", { scope }),
    set: (scope: "settings" | "board", value: unknown) => call<void>("storage.set", { scope, value })
  },
  assistant: {
    start: (instruction: string, conversation: Array<{ role: "user" | "assistant"; content: string }>, conversationId: string, options?: { currentFields: Array<{ label: string; value: string }> }) => call<void>("assistant.start", { instruction, conversation, conversationId, ...options }),
    cancel: () => call<void>("assistant.cancel"),
    respond: (interactionId: string, action: "submit" | "dismiss", values?: Record<string, string | string[]>) => call<void>("assistant.respond", { interactionId, action, values })
  },
  onEvent(listener: (event: { type: string; [key: string]: unknown }) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
};
export function usePluginContext() {
  const [value, setValue] = useState(context);
  useEffect(() => {
    const dispose = iterlay.onEvent(event => { if (event.type === "context") setValue(event.context as PluginContext); });
    void iterlay.context.get().then(setValue).catch(() => undefined);
    return dispose;
  }, []);
  return value;
}

/** Optional pure policies exposed to legacy host entry points through the installed sandbox. */
export function registerCapability<TInput, TResult>(name: string, handler: (input: TInput) => TResult | Promise<TResult>): () => void {
  const receive = (event: MessageEvent): void => {
    if (event.source !== window.parent || event.data?.source !== "iterlay-host"
      || event.data.type !== "capability" || event.data.capability !== name || typeof event.data.id !== "string") return;
    const id = event.data.id;
    void Promise.resolve().then(() => handler(event.data.input as TInput)).then(
      result => window.parent.postMessage({ source: "iterlay-plugin", type: "capability-result", id, result }, "*"),
      reason => window.parent.postMessage({ source: "iterlay-plugin", type: "capability-result", id, error: reason instanceof Error ? reason.message : String(reason) }, "*")
    );
  };
  window.addEventListener("message", receive);
  return () => window.removeEventListener("message", receive);
}
