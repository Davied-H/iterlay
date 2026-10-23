import { describe, expect, it, vi } from "vitest";
import { buildSceneCollaborationMessages, collaborateSceneStreamWith, parseSceneCollaboration, shouldReviewSceneCollaboration } from "../electron/providers/text-assistant";
import { validateSceneCollaborationRequest } from "../electron/application/assistant-request";
import type { CollaborateSceneRequest } from "../shared/types";

const request: CollaborateSceneRequest = { instruction: "直接生成一个视频", creationWorkflow: true, workflowMode: "generate", assistantSurface: "canvas-prompt", referenceImages: [], currentFields: [], clarificationRounds: 1 };

describe("staged creation workflow", () => {
  it("preserves the entry flag through validation and gives it precedence over immediate execution rules", () => {
    const validated = validateSceneCollaborationRequest(request);
    expect(validated.creationWorkflow).toBe(true);
    const system = String(buildSceneCollaborationMessages(validated)[0].content);
    expect(system).toContain("不是固定关卡");
    expect(system).toContain("不限定对话轮数");
    expect(system).not.toContain("允许最多两轮");
    expect(system).not.toContain("约 120 字");
    expect(system).toContain("generate_image、edit_image、generate_video");
    expect(system).toContain("最终回复只总结结果");
    expect(shouldReviewSceneCollaboration(request, { message: "先确认方案", fields: [], intent: "creative", interaction: { type: "form", title: "确认风格", fields: [{ id: "style", label: "风格", type: "text" }] } })).toBe(false);
  });
  it("streams message deltas before finishing and respects the model execution decision without adding a confirmation gate", async () => {
    const result = { message: "需求已梳理。将生成5秒咖啡视频，请确认方案。", mediaType: "video", videoSettings: { durationSeconds: 5, aspectRatio: "9:16", resolution: "720p" }, fields: [{ label: "提示词", value: "热咖啡升起蒸汽，镜头缓慢推进" }], intent: "direct", commitment: "execute_now", actions: [{ type: "generate" }] };
    const raw = JSON.stringify(result);
    const deltas: string[] = [];
    const transport = { complete: vi.fn(), completeStream: vi.fn(async (_messages: unknown, _options: unknown, onChunk: (chunk: string) => void) => {
      onChunk(raw.slice(0, 28));
      expect(deltas.join("")).toContain("需求已梳理");
      onChunk(raw.slice(28));
      return raw;
    }) };
    const completed = await collaborateSceneStreamWith(transport, request, (delta) => deltas.push(delta));
    expect(deltas.join("")).toBe(result.message);
    expect(completed.mediaType).toBe("video");
    expect(completed.videoSettings).toEqual(result.videoSettings);
    expect(completed.commitment).toBe("execute_now");
    expect(completed.actions).toEqual([{ type: "generate" }]);
    expect(transport.complete).not.toHaveBeenCalled();
  });
  it("discards invalid video parameters rather than forwarding them to the provider", () => {
    const result = parseSceneCollaboration(JSON.stringify({ message: "方案", fields: [], mediaType: "video", videoSettings: { durationSeconds: -3, aspectRatio: "invalid", resolution: "100p" } }));
    expect(result.videoSettings).toEqual({});
  });
});

it("keeps a later clarification and all requested fields instead of forcing a plan by round count", async () => {
  const result = { message: "还需要确认交付约束。", intent: "creative", fields: [], interaction: { type: "form", title: "补充交付信息", fields: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, label: `问题${index}`, type: "text" })) } };
  const raw = JSON.stringify(result);
  const transport = { complete: vi.fn(), completeStream: vi.fn(async (_messages: unknown, _options: unknown, onChunk: (chunk: string) => void) => { onChunk(raw); return raw; }) };
  const completed = await collaborateSceneStreamWith(transport, { ...request, clarificationRounds: 4 }, () => {});
  expect(completed.interaction?.type).toBe("form");
  if (completed.interaction?.type === "form") expect(completed.interaction.fields).toHaveLength(5);
  expect(completed.fields).toEqual([]);
  expect(transport.complete).not.toHaveBeenCalled();
});
