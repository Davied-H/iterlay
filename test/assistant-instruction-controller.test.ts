import { describe, expect, it, vi } from "vitest";
import { createAssistantInstructionSender } from "../src/features/assistant/assistant-instruction";
import type { CollaborateSceneRequest } from "../shared/types";
const { start, readAsset } = vi.hoisted(() => ({ start: vi.fn<(...args: unknown[]) => unknown>(() => ({ dispose: vi.fn(), cancel: vi.fn(), respondToInteraction: vi.fn() })), readAsset: vi.fn() }));
vi.mock("../src/lib/scene-collaboration-stream", () => ({ startSceneCollaborationStream: start }));
vi.mock("../src/lib/image-workbench-api", () => ({ getImageWorkbenchApi: () => ({ readAssetDataUrl: readAsset }), getWorkbenchErrorMessage: (error: Error) => error.message }));

type Options = Parameters<typeof createAssistantInstructionSender>[0];
function options(patch: Partial<Options> = {}): Options {
  const setters = Object.fromEntries(["setAssistantIntentSuggestions", "setAssistantIntentSuggestionsLoading", "setAssistantInteraction", "setAssistantMessages", "setAssistantValue", "setAssistantStreaming", "setAssistantActivity", "setAssistantHasUnreadResult"].map((name) => [name, vi.fn()]));
  return {
    ...setters, assistantStreaming: false, assistantActivity: null,
    assistantIntentSuggestionRequestRef: { current: 0 }, assistantRequestVersionRef: { current: 0 }, assistantBackgroundRequestRef: { current: false }, assistantClarificationRoundsRef: { current: 0 }, assistantStreamRef: { current: null }, assistantOpenRef: { current: true },
    assistantMessages: [{ id: "valid", role: "user", content: "已有对话" }, { id: "streaming", role: "assistant", content: "未完成", streaming: true }, { id: "error", role: "assistant", content: "旧错误", tone: "error" }],
    assistantConversationId: "conversation", input: { workflowMode: "generate", prompt: "原始提示词", model: "model", size: "auto", n: 2, sceneId: "scene", referenceImages: Array.from({ length: 5 }, (_, index) => ({ id: String(index), name: `ref${index}`, mimeType: "image/png", dataBase64: "ref" })) },
    supportsPromptEnhancement: true, onOpenSettings: vi.fn(), boardId: "board", assistantAgentModeEnabled: true,
    editTarget: null, activeScene: null, locale: "en-US", promptDraftRef: { current: "原始提示词" }, isUiDesignMode: false, uiBriefPreview: null, fusionPromptContext: "用户选择的上下文", buildCurrentAssistantFields: () => [{ label: "当前提示词", value: "原始提示词" }], maxImageCount: 8, assistantSurface: "canvas-prompt", t: ((key: string) => key) as Options["t"], receivePromptAssistantResult: vi.fn(), receiveComicDramaAgentResult: vi.fn(), ...patch
  } as Options;
}
describe("assistant instruction execution", () => {
  it("preserves request context, bounded references and settled conversation history", async () => {
    start.mockClear();
    const deps = options();
    await createAssistantInstructionSender(deps)("  帮我完善  ", "显示内容", false, false, true);
    const request = start.mock.calls[0]?.[0] as unknown as CollaborateSceneRequest;
    expect(request).toMatchObject({ instruction: "帮我完善", locale: "en-US", conversationId: "conversation", recordInHistory: false, generationSettings: { count: 2, maxCount: 8 }, memoryQuery: { boardId: "board", sceneId: "scene" }, agentMode: true });
    expect(request.referenceImages).toHaveLength(4);
    expect(request.conversation).toEqual([{ role: "user", content: "已有对话" }]);
    expect(request.currentFields?.at(-1)).toEqual({ label: "当前提示词上下文", value: "用户选择的上下文" });
    expect(deps.assistantBackgroundRequestRef.current).toBe(true);
    expect(deps.setAssistantValue).not.toHaveBeenCalled();
  });
  it("keeps the edit target first and uses the edit workflow with three auxiliary images", async () => {
    start.mockClear();
    const deps = options({ assistantSurface: "canvas-edit", editTarget: { path: "/target.png", dataUrl: "data:image/png;base64,target" } });
    await createAssistantInstructionSender(deps)("修改背景");
    const request = start.mock.calls[0]?.[0] as unknown as CollaborateSceneRequest;
    expect(request.workflowMode).toBe("edit");
    expect(request.referenceImages).toHaveLength(4);
    expect(request.referenceImages[0]).toEqual({ name: "当前编辑目标图", mimeType: "image/png", dataBase64: "target" });
    expect(request.memoryQuery?.assetPath).toBe("/target.png");
    expect(request.agentMode).toBe(false);
  });
  it("does not start a stream when cancellation occurs during async target loading", async () => {
    start.mockClear();
    let resolve!: (value: string) => void;
    readAsset.mockReturnValueOnce(new Promise<string>((yes) => { resolve = yes; }));
    const deps = options({ assistantSurface: "canvas-edit", editTarget: { path: "/target.png", dataUrl: "asset://target" } });
    const pending = createAssistantInstructionSender(deps)("修改背景");
    deps.assistantRequestVersionRef.current += 1;
    resolve("data:image/png;base64,target");
    await pending;
    expect(start).not.toHaveBeenCalled();
  });
  it("does not submit while another assistant action is active", async () => {
    start.mockClear();
    const deps = options({ assistantActivity: "正在应用" });
    await createAssistantInstructionSender(deps)("修改背景");
    expect(start).not.toHaveBeenCalled();
    expect(deps.setAssistantMessages).not.toHaveBeenCalled();
  });
});
