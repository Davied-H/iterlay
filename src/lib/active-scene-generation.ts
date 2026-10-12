import { useSyncExternalStore } from "react";

export interface ActiveSceneGeneration {
  id: string;
  sceneId: string;
  source: "creator" | "detail";
  requestedCount: number;
  startedAt: number;
}

type ActiveSceneGenerationInput = Omit<ActiveSceneGeneration, "id" | "startedAt"> & {
  id?: string;
  startedAt?: number;
};

let fallbackId = 0;
let snapshot: Readonly<Record<string, ActiveSceneGeneration>> = {};
const listeners = new Set<() => void>();

function createGenerationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `scene-generation-${fallbackId}`;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function startActiveSceneGeneration(input: ActiveSceneGenerationInput): ActiveSceneGeneration {
  const generation: ActiveSceneGeneration = {
    ...input,
    id: input.id ?? createGenerationId(),
    startedAt: input.startedAt ?? Date.now()
  };
  snapshot = { ...snapshot, [generation.sceneId]: generation };
  emit();
  return generation;
}

export function finishActiveSceneGeneration(sceneId: string, generationId: string): void {
  if (snapshot[sceneId]?.id !== generationId) return;
  const next = { ...snapshot };
  delete next[sceneId];
  snapshot = next;
  emit();
}

export function getActiveSceneGenerations(): Readonly<Record<string, ActiveSceneGeneration>> {
  return snapshot;
}

export function subscribeActiveSceneGenerations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveSceneGeneration(sceneId?: string): ActiveSceneGeneration | undefined {
  const generations = useSyncExternalStore(
    subscribeActiveSceneGenerations,
    getActiveSceneGenerations,
    getActiveSceneGenerations
  );
  return sceneId ? generations[sceneId] : undefined;
}
