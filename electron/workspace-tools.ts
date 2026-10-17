type JsonObject = Record<string, unknown>;
type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function listWorkspaceTools(): JsonObject[] {
  return [
        tool("status", "Read local workspace status and protocol version."),
        tool("list_providers", "List saved providers without credentials.", { kind: { type: "string", enum: ["image", "video", "text"] } }),
        tool("list_models", "Read saved models for a provider.", { providerId: stringField("Provider ID") }, ["providerId"]),
        tool("list_tasks", "Read generation history."),
        tool("list_boards", "List Iterlay boards."),
        tool("resolve_generation_board", "Resolve the configured CLI default board, or reuse/create CLI 创作 when unset. An explicit boardId takes priority. Missing configured boards fail before generation.", { boardId: stringField("Optional target board ID") }),
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
        tool("generate_image", "Start image generation using Iterlay's configured provider. Reference paths are managed Iterlay asset paths and remain visible on the board. Transparent output depends on the active Provider; the official Provider falls back to an opaque PNG. Returns immediately with a generationId; poll get_generation_status until terminal. Successful images are added to the board. Omit boardId to use the configured CLI default board.", { boardId: stringField("Target board ID"), prompt: stringField("Image prompt"), providerId: stringField("Provider ID"), quality: { type: "string", enum: ["auto", "low", "medium", "high"] }, style: stringField("Style"), referencePaths: { type: "array", items: { type: "string" }, description: "Managed Iterlay reference image paths" }, n: { type: "number", minimum: 1, maximum: 4 }, model: stringField("Optional model"), size: stringField("Optional size"), background: { type: "string", enum: ["auto", "opaque", "transparent"], description: "Requested output background; support depends on the active Provider" } }, ["prompt"]),
        tool("edit_image", "Edit a managed image using Iterlay's configured provider.", { boardId: stringField("Target board ID"), sourcePath: stringField("Managed source image path"), prompt: stringField("Edit instruction"), providerId: stringField("Provider ID"), model: stringField("Model ID") }, ["boardId", "sourcePath", "prompt"]),
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
        }, ["prompt"]),
        tool("get_video_generation_status", "Read a persisted video task. Poll until completed, failed, or cancelled. Completed results expose managed local paths only.", { videoGenerationId: stringField("Video generation ID") }, ["videoGenerationId"]),
        tool("stop_video_polling", "Stop this App session's local polling for a video task. This does not cancel the remote provider task.", { videoGenerationId: stringField("Video generation ID") }, ["videoGenerationId"]),
        tool("import_video", "Import a video data URL into Iterlay managed storage and optionally append it to a board. Remote URLs are not accepted as final results.", { dataUrl: stringField("Video data URL"), boardId: stringField("Optional target board ID") }, ["dataUrl"]),
        tool("export_assets", "Export selected managed image paths as a ZIP to Iterlay's download directory.", { paths: { type: "array", items: { type: "string" } } }, ["paths"]),
        tool("open_iterlay", "Open Iterlay visibly for the user.")
  ];
}

export function buildToolContent(result: unknown): ToolContent[] {
  if (!isRecord(result)) return [{ type: "text", text: JSON.stringify(result) }];
  const imageDataUrls = Array.isArray(result.previewImageDataUrls) ? result.previewImageDataUrls : [];
  const summary = { ...result };
  delete summary.previewImageDataUrls;
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(summary) }];
  for (const value of imageDataUrls) {
    if (typeof value !== "string") continue;
    const image = parseImageDataUrl(value);
    if (image) content.push(image);
  }
  return content;
}

function parseImageDataUrl(value: string): Extract<ToolContent, { type: "image" }> | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (!match) return null;
  const data = match[2];
  if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) return null;
  return { type: "image", mimeType: match[1], data };
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

