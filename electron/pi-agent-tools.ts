import type { AgentTool } from "./agents/tool-runtime.js";
import type { TSchema } from "typebox";
import { callLocalApi } from "./local-api-client.js";
import { buildToolContent, listWorkspaceTools } from "./workspace-tools.js";

type JsonObject = Record<string, unknown>;
type LocalApiCall = (
  userDataPath: string,
  method: string,
  args: Record<string, unknown>
) => Promise<unknown>;

const BOARD_WRITE_TOOLS = new Set([
  "create_canvas",
  "update_canvas",
  "move_image",
  "resize_image",
  "arrange_images",
  "duplicate_images",
  "trash_images",
  "set_image_version",
  "generate_image",
  "edit_image",
  "generate_video",
  "import_image",
  "import_video"
]);

const SEQUENTIAL_TOOLS = new Set([
  ...BOARD_WRITE_TOOLS,
  "restore_image",
  "create_board",
  "open_board",
  "fit_board_view",
  "focus_nodes",
  "stop_video_polling",
  "export_assets",
  "open_iterlay"
]);

export interface IterlayAgentToolOptions {
  boardId?: string;
  preserveView?: boolean;
}

export function createIterlayAgentTools(
  userDataPath: string,
  options: IterlayAgentToolOptions = {},
  callBridge: LocalApiCall = callLocalApi
): AgentTool[] {
  return listWorkspaceTools().map((definition) => {
    const name = stringValue(definition.name);
    const description = stringValue(definition.description);
    const inputSchema = isRecord(definition.inputSchema)
      ? definition.inputSchema
      : { type: "object", properties: {} };
    return {
      name,
      label: toolLabel(name),
      description,
      parameters: inputSchema as TSchema,
      executionMode: SEQUENTIAL_TOOLS.has(name) ? "sequential" : "parallel",
      execute: async (_toolCallId, rawArgs) => {
        const args = isRecord(rawArgs) ? rawArgs : {};
        assertBoardScope(name, args, options.boardId);
        const result = await callBridge(userDataPath, name, options.preserveView ? { ...args, preserveView: true } : args);
        return {
          content: buildToolContent(result),
          details: { toolName: name }
        };
      }
    } satisfies AgentTool;
  });
}

function assertBoardScope(name: string, args: JsonObject, boardId?: string): void {
  if (!boardId || !BOARD_WRITE_TOOLS.has(name)) return;
  if (args.boardId !== boardId) {
    throw new Error(`工具 ${name} 只能操作当前画板 ${boardId}。`);
  }
}

function toolLabel(name: string): string {
  return name.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Iterlay 工作台 工具定义无效。");
  return value.trim();
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
