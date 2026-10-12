import { describe, expect, it } from "vitest";
import { mergeAssistantToolCall, sanitizeAssistantToolDetails, settleAssistantToolCalls } from "../shared/assistant-display";
import { settleCancelledAssistantMessages } from "../src/lib/prompt-assistant";
import { buildAssistantHistory } from "../src/lib/assistant-history";
import { canvasToolShortcut } from "../src/components/canvas/canvas-tool-mode";

describe("assistant display records", () => {
  it("redacts credentials and images, bounds nested and cyclic output", () => {
    const record: Record<string, unknown> = {
      apiKey: "secret-value", token: "secret-token", dataBase64: "image-secret",
      text: "Bearer a-private-token", image: "data:image/png;base64,AAAA",
      nested: { authorization: "private" }, long: "x".repeat(20_000)
    };
    record.self = record;
    const output = sanitizeAssistantToolDetails(record);
    expect(output).not.toMatch(/secret-value|secret-token|image-secret|a-private-token/);
    expect(output).toContain("[redacted]");
    expect(output.length).toBeLessThanOrEqual(8000);
  });

  it("merges by tool id and ignores late starts after terminal state", () => {
    const running = { id: "1", name: "inspect", status: "running" as const, input: "{}" };
    const finished = mergeAssistantToolCall([running], { ...running, status: "completed", output: "done" });
    expect(finished).toHaveLength(1);
    expect(finished[0].input).toBe("{}");
    expect(mergeAssistantToolCall(finished, running)).toBe(finished);
    expect(settleAssistantToolCalls([running], "cancelled")?.[0].status).toBe("cancelled");
  });

  it("retains tool-only messages after cancellation", () => {
    const result = settleCancelledAssistantMessages([{
      content: "", streaming: true,
      toolCalls: [{ id: "1", name: "inspect", status: "running" as const }]
    }]);
    expect(result).toHaveLength(1);
    expect(result[0].streaming).toBe(false);
    expect(result[0].toolCalls[0].status).toBe("cancelled");
  });

  it("restores optional image and tool records without changing old history", () => {
    const history = buildAssistantHistory([{
      id: "r1", conversationId: "c1", surface: "canvas-prompt", instruction: "图片", response: "回复",
      occurredAt: "2026-09-10T00:00:00Z", generatedPrompt: "prompt",
      attachments: [{ id: "a", src: "iterlay-asset://local/a", name: "图片", role: "reference" }],
      toolCalls: [{ id: "t", name: "inspect", status: "completed" }]
    }]);
    expect(history[0].messages[0].attachments?.[0].name).toBe("图片");
    expect(history[0].messages[1].toolCalls?.[0].status).toBe("completed");
    expect(history[0].messages[1].generatedPrompt).toBe("prompt");
  });
});

describe("canvas select and pan shortcuts", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false };
  it("uses V and H without stealing modified or composition keys", () => {
    expect(canvasToolShortcut({ ...base, key: "v" })).toBe("select");
    expect(canvasToolShortcut({ ...base, key: "h" })).toBe("pan");
    expect(canvasToolShortcut({ ...base, key: "h", metaKey: true })).toBeNull();
    expect(canvasToolShortcut({ ...base, key: "h", isComposing: true })).toBeNull();
    expect(canvasToolShortcut({ ...base, key: "h", repeat: true })).toBeNull();
  });
});
