import { describe, expect, it } from "vitest";
import type { CollaborateSceneRequest } from "../shared/types";
import { buildSceneCollaborationMessages } from "../electron/providers/text-assistant";

describe("gallery review assistant", () => {
  it("uses a dedicated read-only system prompt", () => {
    const request: CollaborateSceneRequest = {
      instruction: "总结今天的生成方向",
      referenceImages: [],
      currentFields: [
        { label: "画廊回顾范围", value: "全部画板 · 今天" },
        { label: "范围内生成记录", value: "1. 14:30｜品牌视觉｜4 张｜磨砂玻璃瓶" }
      ],
      assistantSurface: "gallery-review",
      workflowMode: "generate",
      useCase: "other"
    };

    const messages = buildSceneCollaborationMessages(request);
    const system = String(messages[0]?.content ?? "");
    const user = messages[1]?.content as Array<{ type: string; text?: string }>;

    expect(system).toContain("创作回顾助手");
    expect(system).toContain("只读的画廊回顾模式");
    expect(system).toContain("intent 固定为 chat");
    expect(system).toContain("fields 固定为空数组");
    expect(system).not.toContain("应用提示词");
    expect(user[0]?.text).toContain('"assistantSurface":"gallery-review"');
  });

  it("instructs the assistant to follow the requested UI locale", () => {
    const messages = buildSceneCollaborationMessages({
      instruction: "Summarize this board",
      locale: "en-US",
      referenceImages: [],
      currentFields: [],
      assistantSurface: "gallery-review",
      workflowMode: "generate",
      useCase: "other"
    });

    expect(String(messages[0]?.content ?? ""))
      .toContain("must be written in natural English");
  });
});
