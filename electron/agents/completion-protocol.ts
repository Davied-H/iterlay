import type { Context as PiContext } from "./tool-runtime.js";

/** Pure JSON adapter shared by agent integrations; no bridge or SDK runtime is loaded. */
interface PiAgentDecision {
  text: string;
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export function parsePiAgentDecision(
  raw: string,
  allowedToolNames: ReadonlySet<string>
): PiAgentDecision {
  const candidates = [
    ...[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)]
      .map((match) => match[1]?.trim())
      .filter((candidate): candidate is string => Boolean(candidate)),
    raw.trim(),
    raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1).trim()
  ].filter(Boolean);
  let parsed: unknown;
  let latestError: unknown;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch (error) {
      latestError = error;
    }
  }
  if (!isRecord(parsed)) {
    throw new Error(`Pi Agent 未返回有效的工具决策 JSON：${String(latestError ?? raw.slice(0, 240))}`);
  }

  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  const rawToolCalls = parsed.toolCalls;
  if (!Array.isArray(rawToolCalls)) {
    throw new Error("Pi Agent 决策缺少 toolCalls 数组。");
  }
  if (rawToolCalls.length > 1) {
    throw new Error("Pi Agent 每轮只能调用一个工具。");
  }
  const toolCalls = rawToolCalls.map((toolCall) => {
    if (!isRecord(toolCall) || typeof toolCall.name !== "string") {
      throw new Error("Pi Agent 返回了无效的工具调用。");
    }
    if (!allowedToolNames.has(toolCall.name)) {
      throw new Error(`Pi Agent 请求了未授权工具：${toolCall.name}`);
    }
    if (!isRecord(toolCall.arguments)) {
      throw new Error(`Pi Agent 工具 ${toolCall.name} 的 arguments 必须是对象。`);
    }
    return {
      name: toolCall.name,
      arguments: toolCall.arguments
    };
  });
  if (!text && toolCalls.length === 0) {
    throw new Error("Pi Agent 决策既没有说明，也没有工具调用。");
  }
  return { text, toolCalls };
}

export function convertPiContextToCompletionMessages(
  context: PiContext,
  terminalToolNames: string[] = ["complete_reconstruction", "report_failure"]
): unknown[] {
  const tools = (context.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
  const messages: unknown[] = [{
    role: "system",
    content: [
      context.systemPrompt ?? "",
      "你通过 JSON 工具决策协议与 Pi Agent Core 连接。",
      "每次响应必须只输出一个 JSON 对象，不要 Markdown、代码围栏或额外文字。",
      "格式：{\"text\":\"本轮简短判断\",\"toolCalls\":[{\"name\":\"工具名\",\"arguments\":{}}]}。",
      `toolCalls 必须是数组且最多一个；需要结束必须调用 ${terminalToolNames.join(" 或 ")}，不能只输出文字。`,
      `可用工具：${JSON.stringify(tools)}`
    ].filter(Boolean).join("\n\n")
  }];

  for (const message of context.messages) {
    if (message.role === "user") {
      messages.push({
        role: "user",
        content: typeof message.content === "string"
          ? message.content
          : message.content.map((block) => (
              block.type === "text"
                ? { type: "text", text: block.text }
                : {
                    type: "image_url",
                    image_url: {
                      url: `data:${block.mimeType};base64,${block.data}`,
                      detail: "high"
                    }
                  }
            ))
      });
      continue;
    }
    if (message.role === "assistant") {
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const toolCalls = message.content
        .filter((block) => block.type === "toolCall")
        .map((block) => ({ name: block.name, arguments: block.arguments }));
      messages.push({
        role: "assistant",
        content: JSON.stringify({ text, toolCalls })
      });
      continue;
    }
    const resultText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const resultImages = message.content
      .filter((block) => block.type === "image")
      .map((block) => ({
        type: "image_url",
        image_url: {
          url: `data:${block.mimeType};base64,${block.data}`,
          detail: "high"
        }
      }));
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: [
            `Pi 工具结果：${message.toolName}`,
            `isError: ${message.isError}`,
            resultText
          ].join("\n\n")
        },
        ...resultImages
      ]
    });
  }
  return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
