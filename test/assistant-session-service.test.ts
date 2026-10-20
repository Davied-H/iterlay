import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssistantSessionService } from "../electron/application/assistant-session";
import { AssetStore } from "../electron/storage/asset-store";
import { AssistantConversationStore } from "../electron/storage/assistant-conversation-store";
import type { AppSettings, CollaborateSceneRequest, CollaborateSceneResult } from "../shared/types";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const request: CollaborateSceneRequest = {
  instruction: "优化这张图", workflowMode: "edit", assistantSurface: "canvas-edit", currentFields: [],
  memoryQuery: { boardId: "board" }, conversationId: "conversation",
  referenceImages: [{ name: "source.png", mimeType: "image/png", dataBase64: Buffer.from("image").toString("base64") }]
};
const result: CollaborateSceneResult = {
  intent: "direct", message: "优化结果", fields: [{ label: "提示词", value: "保留主体，调整光线" }]
};

async function fixture(memoryEnabled = true) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "iterlay-assistant-session-"));
  directories.push(dir);
  const conversations = new AssistantConversationStore(dir);
  const memories = { record: vi.fn(async () => undefined), retrieve: vi.fn(async () => []) };
  const normalizeReference = vi.fn(async (reference: CollaborateSceneRequest["referenceImages"][number]) => reference);
  const service = createAssistantSessionService({
    settings: { getSettings: () => ({ memoryEnabled } as AppSettings) }, memories,
    assets: new AssetStore(dir), assistantConversations: conversations, normalizeReference
  });
  return { service, conversations, memories, normalizeReference };
}

describe("assistant session application service", () => {
  it("validates before image work, preserves scope and retrieves memory", async () => {
    const { service, normalizeReference, memories } = await fixture();
    await expect(service.prepareSceneCollaborationRequest({ ...request, locale: "invalid" })).rejects.toThrow("界面语言");
    expect(normalizeReference).not.toHaveBeenCalled();
    const prepared = await service.prepareSceneCollaborationRequest(request);
    expect(normalizeReference).toHaveBeenCalledTimes(1);
    expect(prepared.memoryContext).toEqual([]);
    expect(memories.retrieve).toHaveBeenCalledWith({ boardId: "board" }, "balanced", "优化这张图");
  });

  it("persists controlled attachments and generated prompt with conversation scope", async () => {
    const { service, conversations, memories } = await fixture();
    await service.recordAssistantResult(request, result, [], "判断摘要");
    const records = await conversations.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ conversationId: "conversation", boardId: "board", generatedPrompt: "保留主体，调整光线", reasoningSummary: "判断摘要" });
    expect(records[0].attachments![0]).toMatchObject({ name: "source.png", role: "edit-target", src: "" });
    expect((await readFile(records[0].attachments![0].path!)).toString()).toBe("image");
    expect(memories.record).toHaveBeenCalledWith(expect.objectContaining({ type: "assistant_conversation", sourceId: records[0].id }));
  });

  it("keeps conversation history when memory is disabled and honors recordInHistory=false", async () => {
    const { service, conversations, memories } = await fixture(false);
    await service.prepareSceneCollaborationRequest(request);
    await service.recordAssistantResult(request, result);
    expect(await conversations.list()).toHaveLength(1);
    expect(memories.retrieve).not.toHaveBeenCalled();
    expect(memories.record).not.toHaveBeenCalled();
    await service.recordAssistantResult({ ...request, recordInHistory: false }, result);
    expect(await conversations.list()).toHaveLength(1);
  });
});
