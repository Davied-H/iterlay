import type { BoardDetail } from "@shared/types";
import type { CreationArtifact, CreationSession, CreationSessionMessage } from "@shared/creation-session";
import type { AssistantToolCall } from "@shared/assistant-display";

export interface AgentMediaTaskIdentity {
  kind: "image" | "video";
  id: string;
  boardId?: string;
  prompt: string;
}

export function agentMediaTaskFromTool(call: AssistantToolCall): AgentMediaTaskIdentity | null {
  if (call.status !== "completed" || !["generate_image", "edit_image", "generate_video"].includes(call.name)) return null;
  try {
    const output = JSON.parse(call.output || "null");
    const raw = typeof output?.content?.[0]?.text === "string" ? JSON.parse(output.content[0].text) : output;
    const id = call.name === "generate_video" ? raw?.videoGenerationId : raw?.generationId;
    if (typeof id !== "string" || !id) return null;
    const input = JSON.parse(call.input || "{}");
    return { id, kind: call.name === "generate_video" ? "video" : "image",
      boardId: typeof raw.boardId === "string" ? raw.boardId : typeof input.boardId === "string" ? input.boardId : undefined,
      prompt: typeof input.prompt === "string" ? input.prompt : "" };
  } catch { return null; }
}

export function makeCreationSession(id = crypto.randomUUID()): CreationSession {
  const now = new Date().toISOString();
  return { id, title: "新对话", createdAt: now, updatedAt: now, draft: "", queued: [], references: [], messages: [], events: [], artifacts: [] };
}

export function creationTitle(messages: CreationSessionMessage[]): string {
  const first = messages.find((message) => message.role === "user")?.content.trim();
  return first ? first.split(/\r?\n/u, 1)[0].slice(0, 48) : "新对话";
}

export function mergeCreationTool(calls: AssistantToolCall[] = [], update: AssistantToolCall): AssistantToolCall[] {
  const existing = calls.find((call) => call.id === update.id);
  if (existing && existing.status !== "running" && update.status === "running") return calls;
  return existing
    ? calls.map((call) => call.id === update.id ? { ...call, ...update } : call)
    : [...calls, update].slice(-100);
}

export function artifactsFromBoard(
  board: BoardDetail,
  imageIds: string[],
  videoJobId: string | undefined,
  prompt: string
): CreationArtifact[] {
  const now = new Date().toISOString();
  const nodes = board.nodes;
  const images = imageIds.flatMap((id): CreationArtifact[] => {
    const node = nodes.find((item) => item.id === id);
    if (!node || !("imagePath" in node)) return [];
    return [{ id, kind: "image", mediaType: "image", boardId: board.id, boardName: board.name, nodeId: id,
      jobId: node.jobId, path: node.imagePath, prompt, status: "ready", createdAt: now }];
  });
  if (!videoJobId) return images;
  const node = nodes.find((item) => "jobId" in item && item.jobId === videoJobId && "videoPath" in item);
  return [...images, { id: videoJobId, kind: "video", mediaType: "video", boardId: board.id, boardName: board.name,
    nodeId: node?.id, jobId: videoJobId, path: node && "videoPath" in node ? node.videoPath : undefined,
    prompt, status: node ? "ready" : "pending", createdAt: now }];
}

export function artifactUrl(board: BoardDetail, artifact: CreationArtifact): string | undefined {
  if (!artifact.path) return undefined;
  return artifact.mediaType === "video" || artifact.kind === "video" ? board.media?.[artifact.path] : board.images[artifact.path];
}
