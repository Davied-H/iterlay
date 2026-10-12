import { useSyncExternalStore } from "react";

export type PiTemplateAgentPhase = "extract" | "generate" | "review" | "refine" | "paused" | "complete" | "error";

export interface PiTemplateAgentLog {
  id: string;
  timestamp: number;
  phase: PiTemplateAgentPhase;
  detail: string;
}

export interface PiTemplateAgentTask {
  id: string;
  phase: PiTemplateAgentPhase;
  title: string;
  detail: string;
  attempt: number;
  startedAt: number;
  updatedAt: number;
  templateName?: string;
  logs: PiTemplateAgentLog[];
}

const STORAGE_KEY = "iterlay.template-agent-tasks.v1";
const MAX_TASKS = 30;
let tasks = recoverInterruptedTasks(readTasks());
let activeTaskId: string | null = tasks.find((task) => isRunning(task.phase))?.id ?? null;
const listeners = new Set<() => void>();

function isTerminal(phase: PiTemplateAgentPhase): boolean {
  return phase === "complete" || phase === "error";
}

function isRunning(phase: PiTemplateAgentPhase): boolean {
  return !isTerminal(phase) && phase !== "paused";
}

function readTasks(): PiTemplateAgentTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isTask).slice(0, MAX_TASKS) : [];
  } catch {
    return [];
  }
}

// Agent calls run in the renderer. They cannot survive an app restart, so a
// persisted in-progress task must not be presented as still executing.
function recoverInterruptedTasks(storedTasks: PiTemplateAgentTask[]): PiTemplateAgentTask[] {
  return storedTasks.map((task) => {
    if (!isRunning(task.phase)) return task;
    const detail = "任务因应用重启或页面刷新而停止；已保留已生成的模板和验证稿。";
    return {
      ...task,
      phase: "error",
      title: "模板智能创建已中断",
      detail,
      updatedAt: Date.now(),
      logs: [...task.logs, newLog("error", detail)]
    };
  });
}

function isTask(value: unknown): value is PiTemplateAgentTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<PiTemplateAgentTask>;
  return typeof task.id === "string" && typeof task.title === "string" && typeof task.detail === "string"
    && typeof task.startedAt === "number" && typeof task.updatedAt === "number" && Array.isArray(task.logs);
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* Task history is best-effort. */
  }
}

function emit(): void {
  persist();
  listeners.forEach((listener) => listener());
}

function newLog(phase: PiTemplateAgentPhase, detail: string): PiTemplateAgentLog {
  return { id: crypto.randomUUID(), timestamp: Date.now(), phase, detail };
}

export function startPiTemplateAgent(detail: string): PiTemplateAgentTask {
  const log = newLog("extract", detail);
  const task: PiTemplateAgentTask = {
    id: crypto.randomUUID(),
    phase: "extract",
    title: "模板智能创建正在运行",
    detail,
    attempt: 1,
    startedAt: log.timestamp,
    updatedAt: log.timestamp,
    logs: [log]
  };
  activeTaskId = task.id;
  tasks = [task, ...tasks].slice(0, MAX_TASKS);
  emit();
  return task;
}

export function updatePiTemplateAgent(id: string, patch: Partial<Omit<PiTemplateAgentTask, "id" | "startedAt" | "updatedAt" | "logs">>): void {
  const current = tasks.find((task) => task.id === id);
  if (!current || current.phase === "paused") return;
  const detail = patch.detail ?? current.detail;
  const phase = patch.phase ?? current.phase;
  const changed = phase !== current.phase || detail !== current.detail;
  const updatedAt = Date.now();
  const next: PiTemplateAgentTask = {
    ...current,
    ...patch,
    updatedAt,
    logs: changed ? [...current.logs, newLog(phase, detail)] : current.logs
  };
  tasks = tasks.map((task) => task.id === id ? next : task);
  if (!isRunning(phase) && activeTaskId === id) {
    activeTaskId = tasks.find((task) => isRunning(task.phase))?.id ?? null;
  }
  emit();
}

export function dismissPiTemplateAgent(id?: string): void {
  if (id && activeTaskId !== id) return;
  activeTaskId = null;
  emit();
}

export function removePiTemplateAgentTask(id: string): void {
  const task = tasks.find((item) => item.id === id);
  if (!task || (task.phase !== "paused" && !isTerminal(task.phase))) return;
  tasks = tasks.filter((item) => item.id !== id);
  emit();
}

export function pausePiTemplateAgentTask(id: string): void {
  const task = tasks.find((item) => item.id === id);
  if (!task || !isRunning(task.phase)) return;
  const detail = "任务已暂停；当前请求如已发出，将在返回后停止，后续阶段不会继续执行。";
  const next: PiTemplateAgentTask = {
    ...task,
    phase: "paused",
    detail,
    updatedAt: Date.now(),
    logs: [...task.logs, newLog("paused", detail)]
  };
  tasks = tasks.map((item) => item.id === id ? next : item);
  if (activeTaskId === id) {
    activeTaskId = tasks.find((item) => isRunning(item.phase))?.id ?? null;
  }
  emit();
}

export function canContinuePiTemplateAgentTask(id: string): boolean {
  return tasks.some((task) => task.id === id && isRunning(task.phase));
}

export function getPiTemplateAgentTask(): PiTemplateAgentTask | null {
  return activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? null : null;
}

export function getPiTemplateAgentTasks(): readonly PiTemplateAgentTask[] {
  return tasks;
}

export function subscribePiTemplateAgent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePiTemplateAgentTask(): PiTemplateAgentTask | null {
  return useSyncExternalStore(subscribePiTemplateAgent, getPiTemplateAgentTask, getPiTemplateAgentTask);
}

export function usePiTemplateAgentTasks(): readonly PiTemplateAgentTask[] {
  return useSyncExternalStore(subscribePiTemplateAgent, getPiTemplateAgentTasks, getPiTemplateAgentTasks);
}
