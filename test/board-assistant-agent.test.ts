import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "typebox";
import { ProviderError } from "../electron/providers/errors.js";
import {
  collaborateSceneAgentWith,
  collaborateSceneAgentStreamWith,
  searchPublicWeb,
  type PiAgentResourceOptions,
  type TextTransport
} from "../electron/providers/text-assistant.js";

describe("board assistant Pi Agent", () => {
  it("finishes through the typed result tool", async () => {
    const complete = vi.fn(async () => JSON.stringify({
      text: "提交最终结果",
      toolCalls: [{
        name: "finish_assistant_result",
        arguments: {
          result: {
            message: "当前画板适合先明确主体和构图。",
            intent: "chat",
            goal: "explain",
            commitment: "advise_only",
            fields: []
          }
        }
      }]
    }));
    const transport: TextTransport = {
      complete,
      completeStream: async () => {
        throw new Error("unexpected stream call");
      }
    };

    const result = await collaborateSceneAgentWith(transport, {
      instruction: "解释一下当前应该先做什么",
      referenceImages: [],
      currentFields: [],
      workflowMode: "generate",
      assistantSurface: "canvas-prompt",
      agentMode: true
    });

    expect(result).toMatchObject({
      message: "当前画板适合先明确主体和构图。",
      intent: "chat",
      commitment: "advise_only",
      fields: []
    });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("drops legacy comic-drama plan actions from Agent-mode results", async () => {
    const complete = vi.fn(async () => JSON.stringify({
      text: "提交漫剧计划",
      toolCalls: [{
        name: "finish_assistant_result",
        arguments: {
          result: {
            message: "我已整理成可检查的设定方案。",
            intent: "direct",
            goal: "create",
            commitment: "prepare_only",
            fields: [
              { label: "剧名", value: "雨夜来信" },
              { label: "梗概", value: "旧物修复师收到一封迟到十年的信。" }
            ],
            actions: [{
              type: "comic_drama_plan",
              operation: "update-setting",
              instruction: "剧名：雨夜来信\n梗概：旧物修复师收到一封迟到十年的信。"
            }]
          }
        }
      }]
    }));
    const transport: TextTransport = {
      complete,
      completeStream: async () => {
        throw new Error("unexpected stream call");
      }
    };

    const result = await collaborateSceneAgentWith(transport, {
      instruction: "主角是旧物修复师，他收到一封迟到十年的信",
      referenceImages: [],
      currentFields: [{ label: "当前阶段", value: "setting" }],
      workflowMode: "generate",
      assistantSurface: "comic-drama",
      agentMode: true
    });

    expect(result.actions).toBeUndefined();
  });

  it("parses bounded public web search results", async () => {
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example article</a>
        <div class="result__snippet">A useful public source.</div>
      </div>
      <div class="result">
        <a class="result__a" href="file:///tmp/private">Blocked result</a>
      </div>
    `;
    const results = await searchPublicWeb(
      "design systems",
      3,
      undefined,
      vi.fn(async () => new Response(html, { status: 200 })) as typeof fetch
    );

    expect(results).toEqual([{
      title: "Example article",
      url: "https://example.com/article",
      snippet: "A useful public source."
    }]);
  });

  it("loads an explicitly enabled Pi extension tool into the agent loop", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-agent-extension-"));
    try {
      const agentDir = path.join(root, "agent");
      const extensionPath = path.join(agentDir, "extensions", "fixture.ts");
      await mkdir(path.dirname(extensionPath), { recursive: true });
      await writeFile(extensionPath, `export default function (pi) {
        pi.registerTool({
          name: "fixture_tool",
          label: "Fixture",
          description: "Run fixture extension",
          parameters: { type: "object", properties: {} },
          execute: async () => ({ content: [{ type: "text", text: "fixture-result" }], details: {} })
        });
      }\n`, "utf8");
      let turn = 0;
      const complete = vi.fn(async () => {
        turn += 1;
        if (turn === 1) {
          return JSON.stringify({
            text: "先调用扩展",
            toolCalls: [{ name: "fixture_tool", arguments: {} }]
          });
        }
        return JSON.stringify({
          text: "提交结果",
          toolCalls: [{
            name: "finish_assistant_result",
            arguments: {
              result: {
                message: "扩展工具已执行。",
                intent: "chat",
                goal: "explain",
                commitment: "advise_only",
                fields: []
              }
            }
          }]
        });
      });
      const transport: TextTransport = {
        complete,
        completeStream: async () => {
          throw new Error("unexpected stream call");
        }
      };

      const result = await collaborateSceneAgentWith(
        transport,
        {
          instruction: "运行扩展工具",
          referenceImages: [],
          currentFields: [],
          workflowMode: "generate",
          assistantSurface: "canvas-prompt",
          agentMode: true
        },
        undefined,
        [],
        {
          cwd: root,
          agentDir,
          settings: {
            providers: [],
            activeProviderId: "",
            textProviders: [],
            activeTextProviderId: "",
            videoProviders: [],
            activeVideoProviderId: "",
            language: "system",
            theme: "system",
            promptDockAutoCollapse: false,
            canvasThumbnailPreview: true,
            piAgentBuiltinTools: [],
            piAgentIterlayTools: [],
            piAgentSkillPaths: [],
            piAgentExtensionPaths: [extensionPath]
          }
        }
      );

      expect(result.message).toBe("扩展工具已执行。");
      expect(complete).toHaveBeenCalledTimes(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("pauses for the host interaction extension and resumes with submitted values", async () => {
    let turn = 0;
    const complete = vi.fn(async () => {
      turn += 1;
      if (turn === 1) {
        return JSON.stringify({
          text: "需要确认一个选项",
          toolCalls: [{
            name: "present_choices",
            arguments: {
              title: "选择方向",
              fieldId: "direction",
              label: "方向",
              options: [
                { label: "克制", value: "quiet" },
                { label: "大胆", value: "bold" }
              ]
            }
          }]
        });
      }
      return JSON.stringify({
        text: "提交结果",
        toolCalls: [{
          name: "finish_assistant_result",
          arguments: {
            result: {
              message: "已按克制方向继续。",
              intent: "chat",
              goal: "explain",
              commitment: "advise_only",
              fields: []
            }
          }
        }]
      });
    });
    const presentInteraction = vi.fn(async () => ({
      action: "submit" as const,
      values: { direction: "quiet" }
    }));
    const transport: TextTransport = {
      complete,
      completeStream: async () => {
        throw new Error("unexpected stream call");
      }
    };

    const result = await collaborateSceneAgentWith(
      transport,
      {
        instruction: "帮我选择一个方向",
        referenceImages: [],
        currentFields: [],
        workflowMode: "generate",
        assistantSurface: "canvas-prompt"
      },
      undefined,
      [],
      {
        cwd: process.cwd(),
        agentDir: path.join(process.cwd(), ".test-agent"),
        settings: {
          providers: [],
          activeProviderId: "",
          textProviders: [],
          activeTextProviderId: "",
          videoProviders: [],
          activeVideoProviderId: "",
          language: "system",
          theme: "system",
          promptDockAutoCollapse: false,
          canvasThumbnailPreview: true,
          piAgentBuiltinTools: [],
          piAgentIterlayTools: [],
          piAgentSkillPaths: [],
          piAgentExtensionPaths: []
        },
        presentInteraction
      }
    );

    expect(presentInteraction).toHaveBeenCalledWith(expect.objectContaining({
      type: "form",
      title: "选择方向"
    }));
    expect(result.message).toBe("已按克制方向继续。");
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

const recoveryRequest = {
  instruction: "画一只机械章鱼在轨道空间站外维修太阳翼",
  referenceImages: [],
  currentFields: [],
  workflowMode: "generate" as const,
  assistantSurface: "canvas-prompt" as const,
  agentMode: true
};
const validResult = {
  message: "已整理创作方向。",
  intent: "chat",
  goal: "explain",
  commitment: "advise_only",
  fields: []
};
const finishDecision = (result: unknown = validResult) => JSON.stringify({
  text: "提交结果",
  toolCalls: [{ name: "finish_assistant_result", arguments: { result } }]
});
const textDecision = JSON.stringify({ text: "机械章鱼维修太阳翼，地球在下方发光。", toolCalls: [] });
function recoveryTransport(complete: TextTransport["complete"]): TextTransport {
  return { complete, completeStream: async () => { throw new Error("unexpected stream"); } };
}
function recoveryResources(maxTurns = 12): PiAgentResourceOptions {
  return {
    cwd: process.cwd(),
    agentDir: path.join(process.cwd(), ".test-agent"),
    settings: {
      providers: [], activeProviderId: "", textProviders: [], activeTextProviderId: "",
      videoProviders: [], activeVideoProviderId: "", language: "system", theme: "system",
      promptDockAutoCollapse: false, canvasThumbnailPreview: true,
      piAgentBuiltinTools: [], piAgentSkillPaths: [], piAgentExtensionPaths: [], piAgentMaxTurns: maxTurns
    },
    recordLog: vi.fn(),
    presentActivity: vi.fn()
  };
}

describe("board assistant result recovery", () => {
  it("repairs a text-only stop in the same context and emits only the validated result", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(textDecision)
      .mockResolvedValueOnce(finishDecision());
    const onDelta = vi.fn();
    const onFields = vi.fn();
    const resources = recoveryResources();
    const result = await collaborateSceneAgentStreamWith(
      recoveryTransport(complete), recoveryRequest, onDelta, undefined, onFields, [], resources
    );
    expect(result.message).toBe(validResult.message);
    expect(complete).toHaveBeenCalledTimes(2);
    const retryContext = JSON.stringify(complete.mock.calls[1][0]);
    expect(retryContext).toContain("机械章鱼维修太阳翼");
    expect(retryContext).toContain("禁止重新执行");
    expect(retryContext).not.toContain('"name":"web_search"');
    expect(onDelta).toHaveBeenCalledOnce();
    expect(onDelta).toHaveBeenCalledWith(validResult.message);
    expect(onFields).toHaveBeenCalledOnce();
    expect(onFields).toHaveBeenCalledWith([]);
    expect(resources.recordLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: "text_only_stop" })
    }));
  });

  it.each([
    null,
    { ...validResult, message: " " },
    { ...validResult, fields: [{ label: "主体", value: 123 }] },
    { ...validResult, intent: "invented" },
    { ...validResult, actions: [{ type: "set_generation_count", count: -1 }] },
    { ...validResult, interaction: { type: "confirm", title: "确认生成" } }
  ])("repairs invalid result %j instead of silently accepting it", async (invalid) => {
    const complete = vi.fn()
      .mockResolvedValueOnce(finishDecision(invalid))
      .mockResolvedValueOnce(finishDecision());
    const resources = recoveryResources();
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), recoveryRequest, undefined, [], resources
    )).resolves.toMatchObject(validResult);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(resources.recordLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: "invalid_result" })
    }));
  });

  it("repairs malformed decision JSON with bounded requests", async () => {
    const complete = vi.fn().mockResolvedValueOnce("{broken").mockResolvedValueOnce(finishDecision());
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), recoveryRequest
    )).resolves.toMatchObject(validResult);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("stops after exactly two repairs and retains the unverified draft as an error", async () => {
    const complete = vi.fn().mockResolvedValue(textDecision);
    const onDelta = vi.fn();
    const onFields = vi.fn();
    await expect(collaborateSceneAgentStreamWith(
      recoveryTransport(complete), recoveryRequest, onDelta, undefined, onFields
    )).rejects.toMatchObject({
      code: "ASSISTANT_RESULT_INCOMPLETE",
      message: expect.stringContaining("未校验的回复草稿")
    });
    expect(complete).toHaveBeenCalledTimes(3);
    expect(onDelta).not.toHaveBeenCalled();
    expect(onFields).not.toHaveBeenCalled();
  });

  it("does not repeat side effects, even if the model requests them during recovery", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "已受理，任务 ID 为 job-123，尚未完成" }],
      details: { taskId: "job-123" }
    }));
    const tool = {
      name: "generate_fixture", label: "生成", description: "创建一次生成任务",
      parameters: Type.Object({}), execute
    };
    const operation = JSON.stringify({
      text: "发起生成", toolCalls: [{ name: tool.name, arguments: {} }]
    });
    const complete = vi.fn()
      .mockResolvedValueOnce(operation)
      .mockResolvedValueOnce(textDecision)
      .mockResolvedValueOnce(operation)
      .mockResolvedValueOnce(finishDecision());
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), recoveryRequest, undefined, [tool], recoveryResources()
    )).resolves.toMatchObject(validResult);
    expect(execute).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(complete.mock.calls[3][0])).toContain("job-123");
  });

  it("reserves a result-only recovery budget when execution turns are exhausted", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text" as const, text: "done" }], details: {} }));
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        text: "读取画板",
        toolCalls: [{ name: "read_fixture", arguments: {} }]
      }))
      .mockResolvedValueOnce(finishDecision());
    const resources = recoveryResources(1);
    await expect(collaborateSceneAgentWith(recoveryTransport(complete), recoveryRequest, undefined, [{
      name: "read_fixture", label: "读取", description: "读取状态", parameters: Type.Object({}), execute
    }], resources)).resolves.toMatchObject(validResult);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledOnce();
    expect(resources.recordLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: "turn_limit" })
    }));
  });

  it("does not reintroduce generation actions or a director request after result recovery", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(textDecision)
      .mockResolvedValueOnce(finishDecision({
        ...validResult,
        intent: "direct",
        commitment: "execute_now",
        fields: [{ label: "提示词", value: "机械章鱼维修太阳翼" }],
        actions: [{ type: "generate" }, { type: "generate_directions", directionIds: ["one"] }]
      }));
    const result = await collaborateSceneAgentWith(
      recoveryTransport(complete), { ...recoveryRequest, instruction: "立即生成机械章鱼" }
    );
    expect(result.commitment).toBe("prepare_only");
    expect(result.actions).toEqual([]);
    expect(result.fields).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("preserves upstream errors instead of misreporting missing results or retrying", async () => {
    const upstream = new ProviderError("RATE_LIMITED", "请求频率过高", 429);
    const complete = vi.fn().mockRejectedValue(upstream);
    const resources = recoveryResources();
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), recoveryRequest, undefined, [], resources
    )).rejects.toBe(upstream);
    expect(complete).toHaveBeenCalledOnce();
    expect(resources.recordLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: "upstream_error", code: "RATE_LIMITED" })
    }));
  });

  it("does not retry an upstream error during recovery", async () => {
    const upstream = new ProviderError("NETWORK_ERROR", "连接已断开");
    const complete = vi.fn().mockResolvedValueOnce(textDecision).mockRejectedValue(upstream);
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), recoveryRequest
    )).rejects.toBe(upstream);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("makes no request when cancelled before starting", async () => {
    const controller = new AbortController();
    controller.abort();
    const complete = vi.fn();
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), recoveryRequest, controller.signal
    )).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("does not repair or emit results after cancellation during completion", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => {
      controller.abort();
      return finishDecision();
    });
    const onDelta = vi.fn();
    const onFields = vi.fn();
    const resources = recoveryResources();
    await expect(collaborateSceneAgentStreamWith(
      recoveryTransport(complete), recoveryRequest, onDelta, controller.signal, onFields, [], resources
    )).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    expect(complete).toHaveBeenCalledOnce();
    expect(onDelta).not.toHaveBeenCalled();
    expect(onFields).not.toHaveBeenCalled();
    expect(resources.recordLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ reason: "cancelled" })
    }));
  });

  it("logs only completion metadata, not model output or user content", async () => {
    const secret = "private-fixture-do-not-log";
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ text: secret, toolCalls: [] }));
    const resources = recoveryResources();
    await expect(collaborateSceneAgentWith(
      recoveryTransport(complete), { ...recoveryRequest, instruction: secret }, undefined, [], resources
    )).rejects.toMatchObject({ code: "ASSISTANT_RESULT_INCOMPLETE" });
    expect(JSON.stringify(vi.mocked(resources.recordLog!).mock.calls)).not.toContain(secret);
  });
});
