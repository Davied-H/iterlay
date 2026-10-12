import { describe, expect, it } from "vitest";
import {
  extractAssistantMemoriesWith,
  parseAssistantMemoryExtraction,
  type TextTransport
} from "../electron/providers/text-assistant.js";

describe("assistant memory extraction", () => {
  it("keeps distilled conclusions and valid evidence references", () => {
    const result = parseAssistantMemoryExtraction(JSON.stringify({
      memories: [
        {
          kind: "semantic",
          scope: "board",
          content: "偏好克制留白的产品构图，并使用柔和侧光突出材质。",
          confidence: 0.84,
          sourceIds: ["job-a", "missing"]
        }
      ]
    }), new Set(["job-a"]));

    expect(result).toEqual([{
      kind: "semantic",
      scope: "board",
      content: "偏好克制留白的产品构图，并使用柔和侧光突出材质。",
      confidence: 0.84,
      sourceIds: ["job-a"]
    }]);
  });

  it("asks the text model to summarize sources instead of copying them", async () => {
    let messages: readonly unknown[] = [];
    const transport: TextTransport = {
      async complete(input) {
        messages = input;
        return JSON.stringify({
          memories: [{
            kind: "procedural",
            scope: "global",
            content: "制作产品图时先固定主体比例，再通过柔和侧光调整材质层次。",
            confidence: 0.76,
            sourceIds: ["job-a"]
          }]
        });
      },
      async completeStream() {
        return "";
      }
    };

    const result = await extractAssistantMemoriesWith(transport, [{
      id: "job-a",
      type: "generation_succeeded",
      content: "白色陶瓷杯，固定主体比例，柔和左侧窗光",
      occurredAt: "2026-07-18T10:00:00.000Z",
      scope: "board"
    }]);

    expect(result[0].content).toContain("先固定主体比例");
    expect(JSON.stringify(messages)).toContain("不要复制整段原始提示词或对话");
  });
});
