import type {
  CollaborateSceneRequest,
  CollaborateSceneResult,
  CollaborateSceneStreamEvent
} from "@shared/types";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";

export interface SceneCollaborationStreamHandlers {
  onTool?: (tool: import("@shared/assistant-display").AssistantToolCall) => void;
  onDelta: (delta: string) => void;
  onReasoningSummary?: (delta: string) => void;
  onFields?: (fields: CollaborateSceneResult["fields"]) => void;
  onActivity?: (label: string) => void;
  onInteraction?: (interactionId: string, interaction: CollaborateSceneResult["interaction"]) => void;
  onComicMutation?: (result: Extract<CollaborateSceneStreamEvent, { type: "comic-mutation" }>["result"]) => void;
  onResult: (result: CollaborateSceneResult) => void;
  onError: (message: string) => void;
  onCancelled?: () => void;
}

export interface SceneCollaborationStreamHandle {
  cancel: () => void;
  dispose: () => void;
  respondToInteraction: (
    interactionId: string,
    action: "submit" | "dismiss",
    values?: Record<string, string | string[]>
  ) => void;
}

export function startSceneCollaborationStream(
  request: CollaborateSceneRequest,
  handlers: SceneCollaborationStreamHandlers
): SceneCollaborationStreamHandle {
  const api = getImageWorkbenchApi();
  const requestId = crypto.randomUUID();
  let active = true;

  const unsubscribe = api.onSceneCollaborationEvent((event: CollaborateSceneStreamEvent) => {
    if (!active || event.requestId !== requestId) return;
    if (event.type === "tool") {
      handlers.onTool?.(event.tool);
      return;
    }
    if (event.type === "delta") {
      handlers.onDelta(event.delta);
      return;
    }
    if (event.type === "reasoning-summary") {
      handlers.onReasoningSummary?.(event.delta);
      return;
    }
    if (event.type === "fields") {
      handlers.onFields?.(event.fields);
      return;
    }
    if (event.type === "activity") {
      handlers.onActivity?.(event.label);
      return;
    }
    if (event.type === "interaction") {
      handlers.onInteraction?.(event.interactionId, event.interaction);
      return;
    }
    if (event.type === "comic-mutation") {
      handlers.onComicMutation?.(event.result);
      return;
    }

    active = false;
    unsubscribe();
    if (event.type === "result") handlers.onResult(event.result);
    else if (event.type === "error") handlers.onError(event.message);
    else handlers.onCancelled?.();
  });

  api.startSceneCollaboration(requestId, request);

  return {
    cancel: () => {
      if (active) api.cancelSceneCollaboration(requestId);
    },
    dispose: () => {
      if (!active) return;
      active = false;
      unsubscribe();
      api.cancelSceneCollaboration(requestId);
    },
    respondToInteraction: (interactionId, action, values) => {
      if (active) api.respondSceneCollaborationInteraction(requestId, interactionId, action, values);
    }
  };
}
