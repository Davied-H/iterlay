import { createInterface } from "node:readline";
import { callMcpBridge } from "./mcp-bridge-client.js";

type JsonObject = Record<string, unknown>;
type McpContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const MAX_MCP_IMAGE_BYTES = 8 * 1024 * 1024;

export interface McpServerRuntime {
  version: string;
  userDataPath: string;
  openIterlay(): Promise<void>;
}

/** JSON-RPC stdio endpoint shared by Electron and the lightweight Node launcher. */
export async function runMcpServer(runtime: McpServerRuntime): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => {
    void handleLine(runtime, line);
  });
  await new Promise<void>((resolve) => input.on("close", resolve));
}

async function handleLine(runtime: McpServerRuntime, line: string): Promise<void> {
  let request: JsonObject;
  try {
    request = JSON.parse(line) as JsonObject;
  } catch {
    return;
  }
  const id = request.id;
  if (typeof id !== "string" && typeof id !== "number") return;
  try {
    const result = await dispatch(runtime, String(request.method ?? ""), request.params);
    reply({ jsonrpc: "2.0", id, result });
  } catch (error) {
    reply({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: error instanceof Error ? error.message : "Iterlay MCP 请求失败。" }
    });
  }
}

async function dispatch(runtime: McpServerRuntime, method: string, params: unknown): Promise<JsonObject> {
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "iterlay", version: runtime.version }
    };
  }
  if (method === "notifications/initialized") return {};
  if (method === "tools/list") {
    return { tools: listMcpTools() };
  }
  if (method === "tools/call") return openIterlay(runtime, params);
  throw new Error(`不支持的 MCP 方法：${method}`);
}

export function listMcpTools(): JsonObject[] {
  return [
        tool("list_boards", "List Iterlay boards."),
        tool("get_active_board", "Read the board currently active in the Iterlay workspace, if any."),
        tool("get_board", "Read a board including its nodes and image URLs.", { boardId: stringField("Board ID") }, ["boardId"]),
        tool("get_board_layout", "Inspect a board's rendered bounds and report overlapping image nodes.", { boardId: stringField("Board ID") }, ["boardId"]),
        tool("open_board", "Open a board in Iterlay without changing its viewport.", { boardId: stringField("Board ID") }, ["boardId"]),
        tool("fit_board_view", "Open a board in Iterlay and fit all of its image nodes into the visible canvas.", { boardId: stringField("Board ID") }, ["boardId"]),
        tool("focus_nodes", "Open a board and focus selected nodes in the visible canvas.", { boardId: stringField("Board ID"), nodeIds: stringArrayField("Board node IDs", 1) }, ["boardId", "nodeIds"]),
        tool("move_image", "Move an image node to absolute canvas coordinates.", { boardId: stringField("Board ID"), nodeId: stringField("Image node ID"), x: numberField("Absolute canvas X coordinate"), y: numberField("Absolute canvas Y coordinate") }, ["boardId", "nodeId", "x", "y"]),
        tool("resize_image", "Resize an image node by display width while preserving its image aspect ratio.", { boardId: stringField("Board ID"), nodeId: stringField("Image node ID"), displayWidth: { type: "number", minimum: 120, maximum: 600, description: "Display width in canvas units" } }, ["boardId", "nodeId", "displayWidth"]),
        tool("arrange_images", "Arrange image nodes around their current center.", { boardId: stringField("Board ID"), nodeIds: stringArrayField("Image node IDs", 2), mode: { type: "string", enum: ["horizontal", "vertical", "grid"] }, gap: { type: "number", minimum: 0, maximum: 1000, description: "Gap between images; defaults to 40" } }, ["boardId", "nodeIds", "mode"]),
        tool("duplicate_images", "Duplicate image nodes, including their version history.", { boardId: stringField("Board ID"), nodeIds: stringArrayField("Image node IDs", 1), offset: { type: "number", minimum: -10000, maximum: 10000, description: "X and Y offset; defaults to 24" } }, ["boardId", "nodeIds"]),
        tool("trash_images", "Move image nodes to Iterlay's recoverable image trash.", { boardId: stringField("Board ID"), nodeIds: stringArrayField("Image node IDs", 1) }, ["boardId", "nodeIds"]),
        tool("restore_image", "Restore an image from Iterlay's recoverable image trash.", { trashId: stringField("Trashed image record ID returned by trash_images") }, ["trashId"]),
        tool("set_image_version", "Switch an image node to a zero-based version index.", { boardId: stringField("Board ID"), nodeId: stringField("Image node ID"), versionIndex: { type: "integer", minimum: 0, description: "Zero-based image version index" } }, ["boardId", "nodeId", "versionIndex"]),
        tool("create_board", "Create a new Iterlay board.", { name: stringField("Board name") }),
        tool("list_assets", "List searchable image assets.", { limit: { type: "number", minimum: 1, maximum: 100 } }),
        tool("get_generation_status", "Read an image generation or edit task. Poll this after generate_image or edit_image returns a generationId.", { generationId: stringField("Generation ID") }, ["generationId"]),
        tool("generate_image", "Start image generation using Iterlay's configured provider. Reference paths are managed Iterlay asset paths and remain visible on the board. Transparent output depends on the active Provider; the official Provider falls back to an opaque PNG. Returns immediately with a generationId; poll get_generation_status until terminal. Successful images are added to the board.", { boardId: stringField("Target board ID"), prompt: stringField("Image prompt"), referencePaths: { type: "array", items: { type: "string" }, description: "Managed Iterlay reference image paths" }, n: { type: "number", minimum: 1, maximum: 4 }, model: stringField("Optional model"), size: stringField("Optional size"), background: { type: "string", enum: ["auto", "opaque", "transparent"], description: "Requested output background; support depends on the active Provider" } }, ["boardId", "prompt"]),
        tool("edit_image", "Edit a managed image using Iterlay's configured provider.", { boardId: stringField("Target board ID"), sourcePath: stringField("Managed source image path"), prompt: stringField("Edit instruction") }, ["boardId", "sourcePath", "prompt"]),
        tool("import_image", "Import a data URL image into Iterlay managed assets and optionally append it to a board.", { dataUrl: stringField("Image data URL"), boardId: stringField("Optional target board ID") }, ["dataUrl"]),
        tool("generate_video", "Start an asynchronous video generation task. Returns a videoGenerationId immediately; poll get_video_generation_status until terminal. Final results are managed local files, never remote provider URLs.", {
          boardId: stringField("Target board ID"),
          prompt: stringField("Video prompt"),
          mode: { type: "string", enum: ["generate", "remix", "extend"] },
          model: stringField("Optional video model"),
          aspectRatio: stringField("Optional aspect ratio, for example 16:9"),
          resolution: stringField("Optional resolution, for example 720p"),
          durationSeconds: { type: "number", minimum: 1, maximum: 60 },
          referenceImagePaths: { type: "array", items: { type: "string" }, description: "Managed reference image paths" },
          firstFramePath: stringField("Optional managed first-frame image path"),
          lastFramePath: stringField("Optional managed last-frame image path"),
          sourceVideoPath: stringField("Managed source video path for remix or extend"),
          referenceVideoPaths: { type: "array", items: { type: "string" }, description: "Managed reference video paths" },
          referenceAudioPaths: { type: "array", items: { type: "string" }, description: "Managed reference audio paths" },
          generationNodeId: stringField("Video generation node ID for a board workflow"),
          targetVideoNodeId: stringField("Target video node ID for remix or extend"),
          generateAudio: { type: "boolean" },
          watermark: { type: "boolean" },
          providerId: stringField("Optional provider ID")
        }, ["boardId", "prompt"]),
        tool("get_video_generation_status", "Read a persisted video task. Poll until completed, failed, or cancelled. Completed results expose managed local paths only.", { videoGenerationId: stringField("Video generation ID") }, ["videoGenerationId"]),
        tool("stop_video_polling", "Stop this App session's local polling for a video task. This does not cancel the remote provider task.", { videoGenerationId: stringField("Video generation ID") }, ["videoGenerationId"]),
        tool("import_video", "Import a video data URL into Iterlay managed storage and optionally append it to a board. Remote URLs are not accepted as final results.", { dataUrl: stringField("Video data URL"), boardId: stringField("Optional target board ID") }, ["dataUrl"]),
        tool("export_assets", "Export selected managed image paths as a ZIP to Iterlay's download directory.", { paths: { type: "array", items: { type: "string" } } }, ["paths"]),
        tool("open_iterlay", "Open Iterlay visibly for the user.")
  ];
}

async function openIterlay(runtime: McpServerRuntime, params: unknown): Promise<JsonObject> {
  const request = isRecord(params) ? params : {};
  if (typeof request.name !== "string") throw new Error("缺少 Iterlay 工具名称。");
  const args = isRecord(request.arguments) ? request.arguments : {};
  if (request.name === "open_iterlay") await runtime.openIterlay();
  const result = await callWhenBridgeReady(runtime, request.name, args);
  return { content: buildToolContent(result) };
}

export function buildToolContent(result: unknown): McpContent[] {
  if (!isRecord(result)) return [{ type: "text", text: JSON.stringify(result) }];
  const imageDataUrls = Array.isArray(result.mcpImageDataUrls) ? result.mcpImageDataUrls : [];
  const summary = { ...result };
  delete summary.mcpImageDataUrls;
  const content: McpContent[] = [{ type: "text", text: JSON.stringify(summary) }];
  for (const value of imageDataUrls) {
    if (typeof value !== "string") continue;
    const image = parseImageDataUrl(value);
    if (image) content.push(image);
  }
  return content;
}

function parseImageDataUrl(value: string): Extract<McpContent, { type: "image" }> | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (!match) return null;
  const data = match[2];
  if (Buffer.byteLength(data, "base64") > MAX_MCP_IMAGE_BYTES) return null;
  return { type: "image", mimeType: match[1], data };
}

async function callWhenBridgeReady(runtime: McpServerRuntime, method: string, args: Record<string, unknown>): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await callMcpBridge(runtime.userDataPath, method, args);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await runtime.openIterlay();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`无法连接 Iterlay App：${lastError instanceof Error ? lastError.message : "请先启动 Iterlay。"}`);
}

function tool(name: string, description: string, properties: JsonObject = {}, required: string[] = []): JsonObject {
  return { name, description, inputSchema: { type: "object", properties, ...(required.length ? { required } : {}) } };
}

function stringField(description: string): JsonObject {
  return { type: "string", description };
}

function numberField(description: string): JsonObject {
  return { type: "number", description };
}

function stringArrayField(description: string, minItems: number): JsonObject {
  return { type: "array", items: { type: "string" }, minItems, uniqueItems: true, description };
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reply(message: JsonObject): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
