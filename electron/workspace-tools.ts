import { MAX_INLINE_MEDIA_DATA_URL_LENGTH } from "../shared/media-import.js";

type JsonObject = Record<string, unknown>;
type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function listWorkspaceTools(): JsonObject[] {
  return [
        tool("status", "Read local workspace status and protocol version."),
        tool("list_providers", "List saved providers without credentials.", { kind: { type: "string", enum: ["image", "video", "text", "audio"] } }),
        tool("get_provider", "Read saved Provider configuration without credentials.", { providerId: stringField("Provider ID") }, ["providerId"]),
        tool("configure_provider", "Atomically configure a video or TTS provider. Does not submit generation. Omitted fields and credentials are preserved; empty apiKey clears it.", {
          kind: { type: "string", enum: ["video", "audio"] },
          action: { type: "string", enum: ["upsert", "default", "remove"] },
          providerId: stringField("Existing ID or optional new ID"), name: stringField("Display name"),
          type: { type: "string", enum: ["ark", "fal", "openrouter", "minimax", "openai-compatible"] },
          baseUrl: stringField("HTTP(S) service URL"), model: stringField("Default model"),
          models: stringArrayField("Saved models", 0), voice: stringField("TTS voice ID"),
          speechEndpoint: stringField("TTS relative endpoint; defaults to /v1/audio/speech"),
          connectionProviderId: stringField("Video image connection ID; empty detaches"),
          apiKey: stringField("Credential to encrypt; empty clears; never returned"), setDefault: { type: "boolean" }
        }, ["kind"]),
        tool("list_models", "Read saved models for a provider.", { providerId: stringField("Provider ID") }, ["providerId"]),
        tool("list_tasks", "Read generation history."),
        tool("cancel_generation", "Cancel a locally queued image task before provider submission. Running requests are not cancelled and remote billing cannot be stopped or confirmed. Ctrl+C in the CLI only stops waiting.", {generationId:stringField("Image client task/generation ID")}, ["generationId"]),
        tool("list_modification_requests", "Read saved annotation/mask edit briefs. No generation is submitted. Only ready requests may be claimed.", {boardId:stringField("Optional board ID")}),
        tool("get_modification_request", "Read a brief with immutable sourcePath/sourceVersionId, relative regions, annotationPath/maskPath and required clarification. Use read_asset to inspect its managed images.", {requestId:stringField("Request ID")}, ["requestId"]),
        tool("claim_modification_request", "Atomically claim a ready brief. Other agents cannot claim it. Retain the returned claim.token; use the fixed sourcePath when editing. No model call is submitted.", {requestId:stringField("Request ID"),owner:stringField("Agent session identifier")}, ["requestId","owner"]),
        tool("clarify_modification_request", "Supply explicit user clarification to a needs-input/failed brief. Never invent missing instructions. Does not generate images.", {requestId:stringField("Request ID"),instruction:stringField("Clarified user instruction")}, ["requestId","instruction"]),
        tool("finish_modification_request", "Link a claimed brief to a succeeded edit task and its managed outputs, or record an error. Requires claim token. Results are appended to the original node once.", {requestId:stringField("Request ID"),claimToken:stringField("Claim token"),resultJobId:stringField("Succeeded edit generation job ID"),resultPaths:stringArrayField("Managed output paths",1),error:stringField("Failure description")}, ["requestId","claimToken"]),
        tool("create_canvas", "Create a persistent HTML/React/Vue code Canvas on the current board. Code is stored, not executed; user clicks Run in its isolated preview. React accepts JSX with default export or App; Vue accepts SFC script setup/template/style. Only built-in react, react-dom/client, vue imports are supported; no npm installation or network requests. Read get_board before editing existing nodes.", { boardId: stringField("Current board ID"), framework: { type: "string", enum: ["html", "react", "vue"] }, code: { type: "string", maxLength: 100000 }, title: stringField("Canvas title") }, ["boardId", "framework", "code"]),
        tool("update_canvas", "Update a Canvas node after reading get_board. Send full replacement code and expectedCode equal to the last read code to avoid overwriting manual edits. Does not execute code.", { boardId: stringField("Current board ID"), nodeId: stringField("Canvas node ID"), framework: { type: "string", enum: ["html", "react", "vue"] }, code: { type: "string", maxLength: 100000 }, expectedCode: stringField("Exact previous code read from get_board"), title: stringField("Optional title") }, ["boardId", "nodeId", "framework", "code", "expectedCode"]),
        tool("list_templates", "List reusable custom templates shared with the App. Legacy local templates migrate when the App workspace opens."),
        tool("get_template", "Read a saved reusable template.", { templateId: stringField("Template ID") }, ["templateId"]),
        ...["create_template", "update_template"].map(name => tool(name, "Save reusable rules in the App template library. No generation or model call. Updates preserve omitted fields.", {
          templateId: stringField("Existing template ID for update"), name: stringField("Template name"), description: stringField("Description"), prompt: stringField("Fixed reusable rules"),
          category: stringField("marketing/product/social/illustration/portrait/brand/concept/editing/other"), mode: { type: "string", enum: ["generate", "edit"] }, useCase: stringField("Image use case; defaults to other"),
          expectedPrompt: stringField("Optional previous prompt for optimistic concurrency"),
          extractionScenario: { type: "string", enum: ["design-language", "layout-skeleton", "series-template", "replica"] },
          fields: { type: "array", items: { type: "object", required: ["id", "label", "value"], properties: { id: stringField("Field ID"), label: stringField("Label"), value: stringField("Rule") } } }
        }, name === "create_template" ? ["name", "prompt"] : ["templateId"])),
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
        tool("read_asset", "Read a managed image as a data URL. Use the CLI assets export command to save a source, annotation or mask locally for visual inspection.", {path:stringField("Managed Iterlay image path")}, ["path"]),
        tool("get_generation_status", "Read an image generation or edit task. Poll this after generate_image or edit_image returns a generationId.", { generationId: stringField("Generation ID") }, ["generationId"]),
        tool("generate_image", "Start image generation using Iterlay's configured provider. Reference paths are managed Iterlay asset paths and remain visible on the board. Set background to transparent for a transparent PNG. Check the Provider capabilities with list_providers first; unsupported transparency requests fail instead of falling back to an opaque image. Returns immediately with a generationId; poll get_generation_status until terminal. Successful images are added to the board. Omit boardId to use the configured CLI default board.", { boardId: stringField("Target board ID"), prompt: stringField("Image prompt"), templateId: stringField("Optional saved template; prompt supplies this run content"), providerId: stringField("Provider ID"), quality: { type: "string", enum: ["auto", "low", "medium", "high"] }, style: stringField("Style"), referencePaths: { type: "array", items: { type: "string" }, description: "Managed Iterlay reference image paths" }, n: { type: "number", minimum: 1, maximum: 4 }, model: stringField("Optional model"), size: stringField("Optional size"), background: { type: "string", enum: ["auto", "opaque", "transparent"], description: "Requested output background; support depends on the active Provider" } }, ["prompt"]),
        tool("edit_image", "Edit a managed image. For a claimed annotation brief, supply modificationRequestId and claimToken: the app validates its fixed source, uses its mask/references and binds one execution key. Finish the request to append results once. Set background to transparent for a transparent PNG; check Provider capabilities with list_providers first. Unsupported transparency requests fail. This operation may incur provider charges.", { boardId: stringField("Target board ID"), sourcePath: stringField("Managed source image path"), prompt: stringField("Reviewed edit instruction"), templateId: stringField("Optional saved edit template"), providerId: stringField("Provider ID"), model: stringField("Model ID"), background: { type: "string", enum: ["auto", "opaque", "transparent"], description: "Requested output background; transparent produces PNG and requires Provider support" },modificationRequestId:stringField("Optional claimed modification request ID"),claimToken:stringField("Token returned only by claim_modification_request"),referencePaths:stringArrayField("Additional managed references when no modification request",0) }, ["boardId", "sourcePath", "prompt"]),
        tool("import_image", "Import a data URL image into Iterlay managed assets and optionally append it to a board. Maximum original file size: 20 MiB; independent of text limits.", { dataUrl: { ...stringField("Base64 image data URL; decoded file must be non-empty and at most 20 MiB"), maxLength: MAX_INLINE_MEDIA_DATA_URL_LENGTH }, boardId: stringField("Optional target board ID") }, ["dataUrl"]),
        tool("generate_video", "Start an asynchronous video generation task. Returns a videoGenerationId immediately; poll get_video_generation_status until terminal. Final results are managed local files, never remote provider URLs.", {
          boardId: stringField("Target board ID"),
          prompt: stringField("Video prompt"),
          mode: { type: "string", enum: ["generate", "remix", "extend"] },
          model: stringField("Optional video model"),
          aspectRatio: stringField("Optional aspect ratio, for example 16:9"),
          resolution: stringField("Optional resolution, for example 720p"),
          durationSeconds: { type: "number", minimum: 1, maximum: 60 },
          referenceImagePaths: { type: "array", items: { type: "string" }, description: "Managed reference image paths. Empty or omitted uses the requested board image or latest board image; set textOnly=true for text-only." },
          textOnly: { type: "boolean", description: "Explicitly generate without board image references" },
          referenceNodeIds: stringArrayField("Board image node IDs to animate; used when referenceImagePaths is omitted", 0),
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
        tool("import_video", "Import a video data URL into Iterlay managed storage and optionally append it to a board. Maximum original file size: 20 MiB; independent of text limits. Remote URLs are not accepted as final results.", { dataUrl: { ...stringField("Base64 MP4/MOV/WebM data URL; decoded file must be non-empty and at most 20 MiB"), maxLength: MAX_INLINE_MEDIA_DATA_URL_LENGTH }, boardId: stringField("Optional target board ID") }, ["dataUrl"]),
        tool("slice_image", "Locally slice a managed image into PNG assets and append to a board. No model call. Specify crops OR rows/columns (1-8); margin/gap are source pixels. Preserves the original. Returns images, crops and nodeIds in reading order.", {
          boardId: stringField("Target board ID"), nodeId: stringField("Source image node ID; alternatively sourcePath"), sourcePath: stringField("Managed source image path"),
          rows: { type: "integer", minimum: 1, maximum: 8 }, columns: { type: "integer", minimum: 1, maximum: 8 },
          margin: { type: "integer", minimum: 0 }, gap: { type: "integer", minimum: 0 },
          crops: { type: "array", minItems: 1, maxItems: 64, items: { type: "object", required: ["x", "y", "width", "height"], additionalProperties: false, properties: { x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 }, width: { type: "integer", minimum: 1 }, height: { type: "integer", minimum: 1 } } } }
        }, ["boardId"]),
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

