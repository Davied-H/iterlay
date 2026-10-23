import type { CollaborateSceneRequest, CollaborateSceneResult } from "../../shared/types.js";
import type { AssistantToolCall } from "../../shared/assistant-display.js";
import { getAssistantReferenceByteBudget } from "../../shared/reference-image-limits.js";
import { validateSceneCollaborationRequest } from "./assistant-request.js";
import type { AssetStore } from "../storage/asset-store.js";
import type { AssistantConversationStore } from "../storage/assistant-conversation-store.js";
import type { MemoryStore, MemoryEventInput } from "../storage/memory-store.js";
import type { SettingsStore } from "../storage/settings-store.js";

interface AssistantSessionDependencies {
  settings: Pick<SettingsStore, "getSettings">;
  memories: Pick<MemoryStore, "record" | "retrieve">;
  assets: Pick<AssetStore, "saveReferenceImageBytes">;
  assistantConversations: Pick<AssistantConversationStore, "add">;
  normalizeReference: (
    reference: CollaborateSceneRequest["referenceImages"][number], index: number, maxBytes: number
  ) => Promise<CollaborateSceneRequest["referenceImages"][number]>;
}

/** Assistant request preparation and persistence, independent of IPC and native image runtime. */
export function createAssistantSessionService(dependencies: AssistantSessionDependencies) {
  const { settings, memories, assets, assistantConversations, normalizeReference } = dependencies;
  const recordMemory = (input: MemoryEventInput): void => {
    if (!settings.getSettings().memoryEnabled) return;
    void memories.record(input).catch((error) => console.warn("记录助手记忆失败。", error));
  };
  const prepareMemoryRequest = async (request: CollaborateSceneRequest): Promise<CollaborateSceneRequest> => {
    const currentSettings = settings.getSettings();
    if (!currentSettings.memoryEnabled) return { ...request, memoryContext: [] };
    const queryText = [request.instruction, ...request.currentFields.map((field) => field.value)]
      .filter(Boolean)
      .join("\n");
    const memoryContext = await memories.retrieve(
      request.memoryQuery,
      currentSettings.memoryUsageLevel ?? "balanced",
      queryText
    );
    const draft = request.currentFields.map((field) => field.value.trim()).filter(Boolean).join("\n");
    if (draft) {
      recordMemory({
        type: "prompt_draft",
        surface: request.assistantSurface ?? "scene-template",
        content: draft,
        boardId: request.memoryQuery?.boardId,
        sceneId: request.memoryQuery?.sceneId,
        assetPath: request.memoryQuery?.assetPath
      });
    }
    return { ...request, memoryContext };
  };
  const prepareSceneCollaborationRequest = async (input: unknown): Promise<CollaborateSceneRequest> => {
    const validated = validateSceneCollaborationRequest(input);
    const perReferenceBudget = getAssistantReferenceByteBudget(validated.referenceImages.length);
    const referenceImages = await Promise.all(
      validated.referenceImages.map((reference, index) => normalizeReference(reference, index, perReferenceBudget))
    );
    return prepareMemoryRequest({ ...validated, referenceImages,
      screenCaptureAvailable: validated.assistantSurface !== "comic-drama" && settings.getSettings().assistantScreenAccess !== "deny" });
  };
  const recordAssistantResult = async (request: CollaborateSceneRequest, result: CollaborateSceneResult, toolCalls?: AssistantToolCall[], reasoningSummary?: string): Promise<void> => {
    const generatedPrompt = getPrimaryAssistantPrompt(result);
    const generated = [
      ...result.fields.map((field) => `${field.label}：${field.value}`),
      ...(result.detailedPrompt ? [result.detailedPrompt] : []),
      ...(result.directions ?? []).map((direction) => `${direction.title}：${direction.prompt}`)
    ].filter(Boolean).join("\n");
    const surface = request.assistantSurface ?? "scene-template";
    if (generated) {
      recordMemory({
        type: "assistant_generated",
        surface,
        content: generated,
        boardId: request.memoryQuery?.boardId,
        sceneId: request.memoryQuery?.sceneId,
        assetPath: request.memoryQuery?.assetPath
      });
    }
    if (request.recordInHistory === false) return;
    const savedReferences = request.referenceImages.length ? await assets.saveReferenceImageBytes(
      request.referenceImages.map((image) => ({
        id: crypto.randomUUID(), name: image.name, mimeType: image.mimeType,
        bytes: Buffer.from(image.dataBase64, "base64")
      }))
    ) : [];
    const conversation = await assistantConversations.add({
      surface,
      instruction: request.instruction,
      response: result.message,
      reasoningSummary,
      generatedPrompt,
      attachments: savedReferences.map((image, index) => ({
        id: image.id, src: "", path: image.path, name: image.name,
        role: request.assistantSurface === "canvas-edit" && index === 0 ? "edit-target" : "reference"
      })),
      toolCalls,
      conversationId: request.conversationId,
      memoryQuery: request.memoryQuery
    });
    if (!conversation) return;
    if (!settings.getSettings().memoryEnabled) return;
    await memories.record({
      type: "assistant_conversation",
      surface,
      content: [
        conversation.instruction ? `用户：${conversation.instruction}` : "",
        conversation.response ? `助手：${conversation.response}` : ""
      ].filter(Boolean).join("\n"),
      boardId: conversation.boardId,
      sceneId: conversation.sceneId,
      assetPath: conversation.assetPath,
      sourceId: conversation.id,
      occurredAt: conversation.occurredAt
    });
  };
  return { recordMemory, prepareSceneCollaborationRequest, recordAssistantResult };
}

function getPrimaryAssistantPrompt(result: CollaborateSceneResult): string {
  if (result.intent === "chat") return "";
  const fields = result.fields
    .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter((field) => field.label && field.value);
  if (fields.length === 1 && /^(?:完整)?提示词|prompt$/i.test(fields[0].label)) {
    return fields[0].value;
  }
  if (fields.length > 0) {
    return fields.map((field) => `${field.label}：${field.value}`).join("\n");
  }
  const detailedPrompt = result.detailedPrompt?.trim();
  if (detailedPrompt) return detailedPrompt;
  return result.directions?.length === 1 ? result.directions[0].prompt.trim() : "";
}

