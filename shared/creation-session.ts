import type { AssistantToolCall } from "./assistant-display.js";
import type { SceneAssistantReference } from "./contracts/assistant.js";
import type { SceneAssistantInteraction } from "./contracts/assistant.js";

export interface CreationReference {
  id: string;
  kind: "upload" | "board-image" | "artifact" | "template";
  role: "reference" | "edit-target";
  name: string;
  mimeType: string;
  boardId?: string;
  nodeId?: string;
  sceneId?: string;
  imagePath?: string;
  previewUrl?: string;
  /** Transient while a draft is open; media bytes never enter the session file. */
  dataBase64?: string;
}

export interface CreationArtifact {
  id: string;
  kind: "image" | "video" | "comic-drama" | (string & {});
  mediaType?: "image" | "video" | "project";
  pluginId?: string;
  boardId: string;
  boardName: string;
  nodeId?: string;
  jobId?: string;
  path?: string;
  prompt: string;
  status: "pending" | "ready" | "failed";
  createdAt: string;
}

export type CreationEvent =
  | { id: string; kind: "run"; runId: string; status: "running" | "completed" | "failed" | "cancelled"; label: string; at: string }
  | { id: string; kind: "tool"; runId: string; call: AssistantToolCall; at: string }
  | { id: string; kind: "artifact"; runId: string; artifactId: string; at: string }
  | { id: string; kind: "interaction"; runId: string; status: "requested" | "resolved"; label: string; at: string };

export interface CreationSessionMessage {
  id: string;
  role: "user" | "assistant" | "error" | "result";
  content: string;
  prompt?: string;
  confirmed?: boolean;
  toolCalls?: AssistantToolCall[];
  reasoningSummary?: string;
  activitySteps?: string[];
  artifactIds?: string[];
  mediaType?: "image" | "video";
  comicDrama?: boolean;
  formInteraction?: Extract<SceneAssistantInteraction, { type: "form" }>;
}

export interface CreationSession {
  id: string;
  title: string;
  projectId?: string;
  pinned?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  boardId?: string;
  draft: string;
  queued: string[];
  references: CreationReference[];
  messages: CreationSessionMessage[];
  events: CreationEvent[];
  artifacts: CreationArtifact[];
  /** A run interrupted by a process exit is shown as interrupted on recovery. */
  activeRunId?: string;
}

export interface CreationReferencePayload extends SceneAssistantReference {
  id: string;
  role: CreationReference["role"];
}
