import type { CollaborateSceneRequest } from "./types.js";

export const SCENE_COLLABORATION_START_CHANNEL = "scene:collaborate:start";
export const SCENE_COLLABORATION_CANCEL_CHANNEL = "scene:collaborate:cancel";
export const SCENE_COLLABORATION_EVENT_CHANNEL = "scene:collaborate:event";
export const SCENE_COLLABORATION_INTERACTION_RESPONSE_CHANNEL = "scene:collaborate:interaction-response";
export const SCENE_COLLABORATION_STEER_CHANNEL = "scene:collaborate:steer";

export interface StartSceneCollaborationPayload {
  requestId: string;
  request: CollaborateSceneRequest;
}

export interface SceneCollaborationInteractionResponsePayload {
  requestId: string;
  interactionId: string;
  action: "submit" | "dismiss";
  values?: Record<string, string | string[]>;
}
