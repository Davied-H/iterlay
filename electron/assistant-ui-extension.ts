import type { InlineExtension } from "./agents/coding-runtime.js";
import { Type } from "typebox";
import { assistantResultSchema } from "./assistant-result-schema.js";
import type { CollaborateSceneResult, SceneAssistantDirection, SceneAssistantInteraction } from "../shared/types.js";

export interface AssistantUiExtensionCallbacks {
  presentInteraction: (
    interaction: SceneAssistantInteraction
  ) => Promise<{ action: "submit" | "dismiss"; values?: Record<string, string | string[]> }>;
  presentActivity?: (label: string) => void;
  presentDirections?: (directions: SceneAssistantDirection[]) => void;
  finish: (result: unknown) => Promise<CollaborateSceneResult>;
}

export function createAssistantUiExtension(callbacks: AssistantUiExtensionCallbacks): InlineExtension {
  return {
    name: "iterlay-assistant-ui",
    factory: (pi) => {
      pi.registerTool({
        name: "present_form",
        label: "显示输入表单",
        description: "使用 Iterlay 现有底部表单向用户收集一个或两个决定性信息，并等待用户提交。",
        parameters: Type.Object({
          title: Type.String({ minLength: 1 }),
          description: Type.Optional(Type.String()),
          submitLabel: Type.Optional(Type.String()),
          cancelLabel: Type.Optional(Type.String()),
          fields: Type.Array(Type.Object({
            id: Type.String({ minLength: 1 }),
            label: Type.String({ minLength: 1 }),
            type: Type.Union([Type.Literal("text"), Type.Literal("textarea"), Type.Literal("select")]),
            placeholder: Type.Optional(Type.String()),
            required: Type.Optional(Type.Boolean()),
            multiple: Type.Optional(Type.Boolean()),
            options: Type.Optional(Type.Array(Type.Object({
              label: Type.String({ minLength: 1 }),
              value: Type.String({ minLength: 1 })
            })))
          }), { minItems: 1, maxItems: 2 })
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, params) => {
          const response = await callbacks.presentInteraction({
            type: "form",
            title: params.title,
            description: params.description,
            submitLabel: params.submitLabel,
            cancelLabel: params.cancelLabel,
            fields: params.fields
          });
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
            details: response
          };
        }
      });

      pi.registerTool({
        name: "present_choices",
        label: "显示选项",
        description: "使用 Iterlay 现有底部选择器让用户选择一个或多个选项，并等待提交。",
        parameters: Type.Object({
          title: Type.String({ minLength: 1 }),
          description: Type.Optional(Type.String()),
          fieldId: Type.String({ minLength: 1 }),
          label: Type.String({ minLength: 1 }),
          multiple: Type.Optional(Type.Boolean()),
          options: Type.Array(Type.Object({
            label: Type.String({ minLength: 1 }),
            value: Type.String({ minLength: 1 })
          }), { minItems: 2, maxItems: 12 })
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, params) => {
          const response = await callbacks.presentInteraction({
            type: "form",
            title: params.title,
            description: params.description,
            submitLabel: "继续",
            cancelLabel: "暂不选择",
            fields: [{
              id: params.fieldId,
              label: params.label,
              type: "select",
              multiple: params.multiple,
              required: true,
              options: params.options
            }]
          });
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
            details: response
          };
        }
      });

      pi.registerTool({
        name: "present_confirmation",
        label: "请求确认",
        description: "使用 Iterlay 现有底部确认框请求用户确认，并等待用户操作。",
        parameters: Type.Object({
          title: Type.String({ minLength: 1 }),
          description: Type.Optional(Type.String()),
          confirmLabel: Type.Optional(Type.String()),
          cancelLabel: Type.Optional(Type.String())
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, params) => {
          const response = await callbacks.presentInteraction({
            type: "confirm",
            title: params.title,
            description: params.description,
            confirmLabel: params.confirmLabel,
            cancelLabel: params.cancelLabel
          });
          return {
            content: [{ type: "text", text: JSON.stringify(response) }],
            details: response
          };
        }
      });

      pi.registerTool({
        name: "present_activity",
        label: "更新活动状态",
        description: "更新助手当前正在进行的工作说明。",
        parameters: Type.Object({ label: Type.String({ minLength: 1, maxLength: 120 }) }),
        execute: async (_toolCallId, params) => {
          callbacks.presentActivity?.(params.label);
          return { content: [{ type: "text", text: "活动状态已更新。" }], details: {} };
        }
      });

      pi.registerTool({
        name: "present_directions",
        label: "显示创意方向",
        description: "把结构化创意方向交给 Iterlay 现有方向卡片展示。",
        parameters: Type.Object({
          directions: Type.Array(Type.Object({
            id: Type.String({ minLength: 1 }),
            title: Type.String({ minLength: 1 }),
            description: Type.Optional(Type.String()),
            prompt: Type.String({ minLength: 1 })
          }), { minItems: 1, maxItems: 4 })
        }),
        execute: async (_toolCallId, params) => {
          callbacks.presentDirections?.(params.directions);
          return {
            content: [{ type: "text", text: "创意方向已交给界面展示。" }],
            details: { count: params.directions.length }
          };
        }
      });

      pi.registerTool({
        name: "finish_assistant_result",
        label: "完成助手回复",
        description: "提交经过结构校验的最终 Iterlay 助手结果。",
        parameters: Type.Object({ result: assistantResultSchema }),
        executionMode: "sequential",
        execute: async (_toolCallId, params) => {
          const result = await callbacks.finish(params.result);
          return {
            content: [{ type: "text", text: "助手结果已通过结构校验。" }],
            details: { fieldCount: result.fields.length },
            terminate: true
          };
        }
      });
    }
  };
}
