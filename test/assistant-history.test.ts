import { describe, expect, it } from "vitest";
import { buildAssistantHistory, getLatestAssistantConversation } from "../src/lib/assistant-history";
import type { AssistantConversationRecord } from "../shared/types";
import { settleCancelledAssistantMessages } from "../src/lib/prompt-assistant";

function record(
  id: string,
  conversationId: string,
  instruction: string,
  response: string,
  occurredAt: string,
  generatedPrompt?: string
): AssistantConversationRecord {
  return {
    id,
    conversationId,
    instruction,
    response,
    generatedPrompt,
    occurredAt,
    surface: "canvas-prompt",
    boardId: "board-a"
  };
}

describe("buildAssistantHistory", () => {
  it("retains an already received summary when cancelled before answer text arrives", () => {
    expect(settleCancelledAssistantMessages([
      { content: "", reasoningSummary: "已有摘要", streaming: true }
    ])).toEqual([{ content: "已停止回复。", reasoningSummary: "已有摘要", streaming: false }]);
  });
  it("restores summaries separately from answers and conversation previews", () => {
    const saved = record("summary", "thread", "做静物", "完成。", "2026-07-21T10:00:00.000Z");
    saved.reasoningSummary = "上游返回的摘要";
    const history = buildAssistantHistory([saved]);
    expect(history[0].preview).toBe("完成。");
    expect(history[0].messages[1]).toMatchObject({ content: "完成。", reasoningSummary: "上游返回的摘要" });
    expect(history[0].messages[0].reasoningSummary).toBeUndefined();
  });
  it("groups exchanges by conversation and restores messages in chronological order", () => {
    const history = buildAssistantHistory([
      record("2", "thread-a", "再增加电影感", "已补充浅景深。", "2026-07-21T10:02:00.000Z"),
      record("3", "thread-b", "做一张雪山构图", "可以从远景开始。", "2026-07-21T11:00:00.000Z"),
      record("1", "thread-a", "做一张雨夜街头", "我会保留冷色霓虹。", "2026-07-21T10:00:00.000Z")
    ]);

    expect(history.map((conversation) => conversation.id)).toEqual(["thread-b", "thread-a"]);
    expect(history[1]).toMatchObject({
      title: "做一张雨夜街头",
      preview: "已补充浅景深。",
      exchangeCount: 2
    });
    expect(history[1]?.messages.map((message) => message.content)).toEqual([
      "做一张雨夜街头",
      "我会保留冷色霓虹。",
      "再增加电影感",
      "已补充浅景深。"
    ]);
  });

  it("restores generated prompts separately from assistant copy", () => {
    const history = buildAssistantHistory([
      record(
        "1",
        "thread-a",
        "设计九宫格表情包",
        "我已经整理成可直接使用的提示词。",
        "2026-07-21T10:00:00.000Z",
        "生成一张 3×3 九宫格表情包，保持极简黑白手绘风格。"
      )
    ]);

    expect(history[0]?.messages[1]).toMatchObject({
      role: "assistant",
      content: "我已经整理成可直接使用的提示词。",
      generatedPrompt: "生成一张 3×3 九宫格表情包，保持极简黑白手绘风格。"
    });
  });

  it("splits prompts stored by older versions from the visible response", () => {
    const history = buildAssistantHistory([
      record(
        "1",
        "thread-a",
        "继续完善",
        "我已经整理好了。\n\n提示词：保留两只戴墨镜的小狗，生成 3×3 九宫格。",
        "2026-07-21T10:00:00.000Z"
      )
    ]);

    expect(history[0]?.messages[1]).toMatchObject({
      content: "我已经整理好了。",
      generatedPrompt: "保留两只戴墨镜的小狗，生成 3×3 九宫格。"
    });
  });

  it("selects the most recently updated conversation for the current board scope", () => {
    const latest = getLatestAssistantConversation([
      record("1", "thread-earlier", "画一盏台灯", "已整理构图。", "2026-07-21T10:00:00.000Z"),
      record("2", "thread-current", "改为夜景", "已保留台灯主体。", "2026-07-21T11:00:00.000Z"),
      record("3", "thread-earlier", "增加窗光", "已增加柔光。", "2026-07-21T10:30:00.000Z")
    ]);

    expect(latest).toMatchObject({
      id: "thread-current",
      title: "改为夜景",
      exchangeCount: 1
    });
  });

  it("retains the source board identity for cross-board history", () => {
    const history = buildAssistantHistory([
      record("1", "thread-a", "画一盏台灯", "已整理构图。", "2026-07-21T10:00:00.000Z")
    ], new Map([["board-a", "夜景探索"]]));

    expect(history[0]).toMatchObject({ boardId: "board-a", boardName: "夜景探索" });
  });
});
