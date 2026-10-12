import { describe, expect, it } from "vitest";
import {
  ASSISTANT_PROMPT_IDLE_MS,
  buildAssistantContextSignature,
  getAssistantAwarenessCopy,
  shouldScheduleAssistantPromptAnalysis
} from "../src/lib/assistant-awareness";

describe("background assistant awareness", () => {
  const signature = buildAssistantContextSignature({
    surface: "canvas-prompt",
    editTargetSignature: "",
    prompt: "  设计一张克制的产品主视觉  ",
    referenceSignature: "ref-1|ref-2"
  });

  it("waits briefly before analyzing a meaningful untouched context", () => {
    expect(ASSISTANT_PROMPT_IDLE_MS).toBe(2_800);
    expect(signature).toContain("设计一张克制的产品主视觉");
    expect(shouldScheduleAssistantPromptAnalysis({
      supportsPromptEnhancement: true,
      prompt: "设计一张克制的产品主视觉",
      working: false,
      contextSignature: signature,
      analyzedContextSignature: "",
      submittedContextSignature: ""
    })).toBe(true);
  });

  it("does not repeat analyzed, submitted, empty, unsupported, or active work", () => {
    const base = {
      supportsPromptEnhancement: true,
      prompt: "设计一张克制的产品主视觉",
      working: false,
      contextSignature: signature,
      analyzedContextSignature: "",
      submittedContextSignature: ""
    };
    expect(shouldScheduleAssistantPromptAnalysis({ ...base, analyzedContextSignature: signature })).toBe(false);
    expect(shouldScheduleAssistantPromptAnalysis({ ...base, submittedContextSignature: signature })).toBe(false);
    expect(shouldScheduleAssistantPromptAnalysis({ ...base, prompt: "" })).toBe(false);
    expect(shouldScheduleAssistantPromptAnalysis({ ...base, supportsPromptEnhancement: false })).toBe(false);
    expect(shouldScheduleAssistantPromptAnalysis({ ...base, working: true })).toBe(false);
  });

  it("exposes working and unread output through the hidden toolbar button", () => {
    expect(getAssistantAwarenessCopy({ visible: false, working: true, unread: false })).toEqual({
      toolbarLabel: "AI",
      buttonLabel: "打开 AI 助手，当前正在理解",
      liveStatus: "AI 助手正在理解当前内容"
    });
    expect(getAssistantAwarenessCopy({ visible: false, working: false, unread: true })).toEqual({
      toolbarLabel: "AI",
      buttonLabel: "打开 AI 助手，已有新建议",
      liveStatus: "AI 助手已有新建议"
    });
  });
});
