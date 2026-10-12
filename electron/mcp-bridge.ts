import { randomBytes } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import type { BrowserWindow } from "electron";

const BRIDGE_FILE = "mcp-bridge.json";

interface BridgeInfo { port: number; token: string; }

export async function startMcpBridge(window: BrowserWindow, userDataPath: string): Promise<() => void> {
  const token = randomBytes(32).toString("base64url");
  const bridgePath = path.join(userDataPath, BRIDGE_FILE);
  const server = createServer((request, response) => {
    void handleRequest(window, token, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法启动本地 MCP 桥接服务。");
  await writeFile(bridgePath, JSON.stringify({ port: address.port, token }), { encoding: "utf8", mode: 0o600 });
  return () => {
    server.close();
    void unlink(bridgePath).catch(() => undefined);
  };
}

export async function callMcpBridge(userDataPath: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  const bridgePath = path.join(userDataPath, BRIDGE_FILE);
  const info = JSON.parse(await readFile(bridgePath, "utf8")) as BridgeInfo;
  const response = await fetch(`http://127.0.0.1:${info.port}/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
    body: JSON.stringify({ method, args })
  });
  const body = await response.json() as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || "Iterlay 未能完成 MCP 请求。");
  return body.result;
}

async function handleRequest(
  window: BrowserWindow,
  token: string,
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse
): Promise<void> {
  if (request.method !== "POST" || request.url !== "/call" || request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { method?: string; args?: Record<string, unknown> };
    const result = await invokeRenderer(window, requestBody.method ?? "", requestBody.args ?? {});
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ result }));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "请求失败。" }));
  }
}

async function invokeRenderer(window: BrowserWindow, method: string, args: Record<string, unknown>): Promise<unknown> {
  if (window.isDestroyed()) throw new Error("Iterlay 窗口不可用，请重新打开 App。 ");
  const call = buildRendererCall(method, args);
  return window.webContents.executeJavaScript(call, true);
}

export function buildRendererCall(method: string, args: Record<string, unknown>): string {
  const a = JSON.stringify(args).replace(/</gu, "\\u003c");
  const api = "window.imageWorkbench";
  const calls: Record<string, string> = {
    list_boards: `${api}.listBoards()`,
    get_active_board: `${api}.getBoardsState().then((state) => state.lastOpenedBoardId ? ${api}.getBoard(state.lastOpenedBoardId) : null)`,
    get_board: `${api}.getBoard(${a}.boardId)`,
    get_board_layout: buildBoardLayoutCall(a),
    open_board: buildOpenBoardCall(a, false),
    fit_board_view: `${api}.getBoard(${a}.boardId).then((board) => { if (!board) throw new Error("画板不存在或已移入回收站。"); emitMcpEvent("fit-board-view", { boardId: board.id, nodeIds: board.nodes.map((node) => node.id) }); return { boardId: board.id, nodeCount: board.nodes.length, requested: true }; })`,
    focus_nodes: buildOpenBoardCall(a, true),
    move_image: buildBoardMutationCall(`${a}.boardId`, `${api}.moveBoardImage(${a}.boardId, ${a}.nodeId, ${a}.x, ${a}.y)`, `{ movedNodeId: ${a}.nodeId, x: ${a}.x, y: ${a}.y }`),
    resize_image: buildBoardMutationCall(`${a}.boardId`, `${api}.resizeBoardImage(${a}.boardId, ${a}.nodeId, ${a}.displayWidth)`),
    arrange_images: buildBoardMutationCall(`${a}.boardId`, `${api}.arrangeBoardImages(${a}.boardId, ${a}.nodeIds, ${a}.mode, ${a}.gap)`),
    duplicate_images: buildBoardMutationCall(`${a}.boardId`, `${api}.duplicateBoardImages(${a}.boardId, ${a}.nodeIds, ${a}.offset)`),
    trash_images: buildBoardMutationCall(`${a}.boardId`, `${api}.trashBoardImages(${a}.boardId, ${a}.nodeIds)`),
    restore_image: buildRestoreImageCall(a),
    set_image_version: buildBoardMutationCall(`${a}.boardId`, `${api}.setBoardImageVersion(${a}.boardId, ${a}.nodeId, ${a}.versionIndex)`),
    create_board: `${api}.createBoard(${a}.name).then((board) => { emitMcpEvent("board-created", { boardId: board.id, name: board.name }); return board; })`,
    list_assets: `${api}.listAssets(undefined, ${a}.limit)`,
    get_generation_status: buildGenerationStatusCall(a),
    import_image: `${api}.importUploadedImage(${a}.dataUrl).then(async (image) => { if (${a}.boardId) await ${api}.appendBoardNodes(${a}.boardId, [{ id: crypto.randomUUID(), imagePath: image.path, jobId: "import-" + crypto.randomUUID(), source: "upload" }]); return image; })`,
    import_video: buildImportVideoCall(a),
    export_assets: `${api}.saveAssetsAsZip(${a}.paths)`,
    open_iterlay: `true`,
    generate_image: buildGenerationCall(a, false),
    edit_image: buildGenerationCall(a, true),
    generate_video: buildVideoGenerationCall(a),
    get_video_generation_status: buildVideoGenerationStatusCall(a),
    stop_video_polling: `${api}.stopVideoPolling(${a}.videoGenerationId).then((result) => ({ ...result, videoGenerationId: ${a}.videoGenerationId, remoteCancelled: false, message: "仅停止本机当前会话的轮询，远端任务不会被取消；稍后可查询或恢复。" }))`
  };
  const expression = calls[method];
  if (!expression) throw new Error(`未知的 MCP 工具：${method}`);
  return `Promise.resolve((() => { const emitMcpEvent = (type, detail) => window.dispatchEvent(new CustomEvent("iterlay:mcp", { detail: { type, ...detail } })); return ${expression}; })())`;
}

function buildBoardMutationCall(boardId: string, mutation: string, eventDetail = "{}"): string {
  return `(() => new Promise((resolve, reject) => { const timeout = window.setTimeout(() => reject(new Error("等待 Iterlay 画板保存超时。")), 10000); emitMcpEvent("board-mutation-requested", { boardId: ${boardId}, resolve: () => { window.clearTimeout(timeout); resolve(true); }, reject: (message) => { window.clearTimeout(timeout); reject(new Error(message || "Iterlay 无法准备画板变更。")); } }); }).then(() => ${mutation}).then((result) => { emitMcpEvent("board-updated", { boardId: ${boardId}, ...${eventDetail} }); return result; }))()`;
}

function buildRestoreImageCall(args: string): string {
  const api = "window.imageWorkbench";
  return `${api}.listTrashedBoardImages().then((records) => { const record = records.find((item) => item.id === ${args}.trashId); if (!record) throw new Error("回收站中不存在指定图片。"); return ${buildBoardMutationCall("record.boardId", `${api}.restoreTrashedBoardImage(${args}.trashId)`)}; })`;
}

function buildOpenBoardCall(args: string, focus: boolean): string {
  const api = "window.imageWorkbench";
  return `${api}.getBoard(${args}.boardId).then((board) => { if (!board) throw new Error("画板不存在或已移入回收站。"); const requestedIds = ${focus ? `Array.isArray(${args}.nodeIds) ? [...new Set(${args}.nodeIds)] : []` : "[]"}; const missingIds = requestedIds.filter((id) => !board.nodes.some((node) => node.id === id)); if (missingIds.length > 0) throw new Error("画板中不存在节点：" + missingIds.join(", ")); emitMcpEvent(${focus ? '"focus-nodes"' : '"open-board"'}, { boardId: board.id, nodeIds: requestedIds }); return { boardId: board.id, nodeIds: requestedIds, requested: true }; })`;
}

function buildVideoGenerationCall(args: string): string {
  const api = "window.imageWorkbench";
  return `${api}.startVideoGeneration({ mode: ${args}.mode || "generate", prompt: ${args}.prompt, model: ${args}.model || "", aspectRatio: ${args}.aspectRatio || "16:9", resolution: ${args}.resolution || "720p", durationSeconds: Math.max(1, Number(${args}.durationSeconds) || 5), referenceImagePaths: Array.isArray(${args}.referenceImagePaths) ? ${args}.referenceImagePaths : [], firstFramePath: ${args}.firstFramePath, lastFramePath: ${args}.lastFramePath, sourceVideoPath: ${args}.sourceVideoPath, referenceVideoPaths: Array.isArray(${args}.referenceVideoPaths) ? ${args}.referenceVideoPaths : [], referenceAudioPaths: Array.isArray(${args}.referenceAudioPaths) ? ${args}.referenceAudioPaths : [], generationNodeId: ${args}.generationNodeId, targetVideoNodeId: ${args}.targetVideoNodeId, generateAudio: ${args}.generateAudio === true, watermark: ${args}.watermark === true, providerId: ${args}.providerId, generationAttemptId: ${args}.generationAttemptId, inputFingerprint: ${args}.inputFingerprint, quoteId: ${args}.quoteId, quoteExpiresAt: ${args}.quoteExpiresAt, idempotencyKey: ${args}.idempotencyKey, priceSnapshot: ${args}.priceSnapshot, quoteBoardId: ${args}.quoteBoardId, quoteRequestScope: ${args}.quoteRequestScope, quotePurpose: ${args}.quotePurpose, quoteOperation: ${args}.quoteOperation, boardId: ${args}.boardId }).then((job) => ({ videoGenerationId: job.id, status: job.status, boardId: job.input.boardId, job: { id: job.id, status: job.status, createdAt: job.createdAt, completedAt: job.completedAt, input: job.input, providerId: job.providerId, providerName: job.providerName, model: job.model, remoteTaskId: job.remoteTaskId, outputVideoPath: job.outputVideoPath, outputPosterPath: job.outputPosterPath, mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs, error: job.error } }))`;
}

function buildVideoGenerationStatusCall(args: string): string {
  const api = "window.imageWorkbench";
  return `${api}.getVideoJob(${args}.videoGenerationId).then(async (job) => { if (!job) return null; if (job.status === "completed" && job.outputVideoPath && job.input.boardId && (job.input.mode || "generate") === "generate") { const board = await ${api}.getBoard(job.input.boardId); if (board && !board.nodes.some((node) => node.type === "video" && node.videoPath === job.outputVideoPath)) await ${api}.appendBoardNodes(job.input.boardId, [{ id: "video-" + job.id, type: "video", videoPath: job.outputVideoPath, posterPath: job.outputPosterPath, jobId: job.id, source: "generated", mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs }]); } const safeJob = { id: job.id, status: job.status, createdAt: job.createdAt, completedAt: job.completedAt, input: job.input, providerId: job.providerId, providerName: job.providerName, model: job.model, remoteTaskId: job.remoteTaskId, outputVideoPath: job.outputVideoPath, outputPosterPath: job.outputPosterPath, mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs, error: job.error }; return { videoGenerationId: job.id, status: job.status, boardId: job.input.boardId, job: safeJob, video: job.outputVideoPath ? { path: job.outputVideoPath, posterPath: job.outputPosterPath, mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs } : undefined }; })`;
}

function buildImportVideoCall(args: string): string {
  const api = "window.imageWorkbench";
  return `(() => { const match = /^data:(video\\/(?:mp4|quicktime|webm));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(${args}.dataUrl || ""); if (!match) throw new Error("仅支持 mp4、mov 或 webm 的视频 data URL。"); const binary = atob(match[2]); const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0)); return ${api}.importVideo(bytes.buffer, match[1]).then(async (video) => { if (${args}.boardId) await ${api}.appendBoardNodes(${args}.boardId, [{ id: crypto.randomUUID(), type: "video", videoPath: video.path, jobId: "import-" + crypto.randomUUID(), source: "upload", mimeType: video.mimeType }]); return { path: video.path, mimeType: video.mimeType, boardId: ${args}.boardId }; }); })()`;
}

function buildGenerationCall(args: string, edit: boolean): string {
  const api = "window.imageWorkbench";
  const source = edit
    ? `${api}.readAssetDataUrl(${args}.sourcePath).then((dataUrl) => ({ id: crypto.randomUUID(), name: "source.png", mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png", dataBase64: dataUrl.split(",")[1], role: "edit-target" }))`
    : `Promise.all((Array.isArray(${args}.referencePaths) ? ${args}.referencePaths : []).map((sourcePath) => ${api}.readAssetDataUrl(sourcePath).then((dataUrl) => ({ id: crypto.randomUUID(), name: "reference.png", mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png", dataBase64: dataUrl.split(",")[1], role: "reference" }))))`;
  // Keep the work in the renderer after this bridge request returns. Coding agents often
  // impose a shorter tool timeout than an image provider needs to finish a generation.
  const persistResult = edit
    ? `const board = await ${api}.getBoard(input.boardId); const target = board?.nodes.find((node) => node.imagePath === ${args}.sourcePath || node.versions?.some((version) => version.imagePath === ${args}.sourcePath)); if (!target) throw new Error("编辑目标不在指定画板中。"); await ${api}.appendBoardNodeVersions(input.boardId, target.id, result.images.map((output) => ({ imagePath: output.path, jobId: result.job.id, width: target.width, height: target.height })));`
    : `if (input.boardId && result.job.providerId !== "iterlay-official") await ${api}.appendBoardNodes(input.boardId, result.images.map((output) => ({ id: crypto.randomUUID(), imagePath: output.path, jobId: result.job.id, source: "generated" })));`;
  return `(() => { const store = window.__iterlayMcpGenerations || (window.__iterlayMcpGenerations = {}); const operationId = crypto.randomUUID(); const input = { workflowMode: ${edit ? '"edit"' : '"generate"'}, creationMode: "general", useCase: ${args}.useCase || "ads-marketing", promptSpec: { primaryRequest: ${args}.prompt }, prompt: ${args}.prompt, model: ${args}.model || "", size: ${args}.size || "auto", n: Math.max(1, Math.min(Number(${args}.n || 1), 4)), quality: ${args}.quality || "high", style: ${args}.style || "natural", background: ["auto", "opaque", "transparent"].includes(${args}.background) ? ${args}.background : "auto", outputFormat: "png", boardId: ${args}.boardId, providerId: ${args}.providerId, referenceImages: [] }; store[operationId] = { generationId: operationId, status: "running", boardId: input.boardId, prompt: input.prompt, createdAt: new Date().toISOString() }; emitMcpEvent("generation-started", { operationId, boardId: input.boardId, prompt: input.prompt, count: input.n, size: input.size, mode: input.workflowMode, sourcePath: ${edit ? `${args}.sourcePath` : "undefined"} }); void ${source}.then(async (references) => { input.referenceImages = ${edit ? "[references]" : "references"}.flat(); const settings = await ${api}.getSettings(); const provider = settings.providers?.find((candidate) => candidate.id === (input.providerId || settings.activeProviderId)); if (provider) input.providerId = provider.id; if (provider?.type === "official" && input.background === "transparent") input.background = "auto"; if (provider?.type === "official") { const fingerprintSource = JSON.stringify({ boardId: input.boardId, prompt: input.prompt, model: input.model || provider.model || "", size: input.size, count: input.n, workflowMode: input.workflowMode, background: input.background, outputFormat: input.outputFormat, referencePaths: ${edit ? `[${args}.sourcePath]` : `(Array.isArray(${args}.referencePaths) ? ${args}.referencePaths : [])`} }); const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintSource)); const inputFingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); const generationAttemptId = crypto.randomUUID(); const requestScope = inputFingerprint; const quote = await ${api}.quotePaidMedia({ kind: "image", clientRequestId: generationAttemptId, inputFingerprint, boardId: input.boardId || "global", requestScope, operation: "image:generate", providerId: provider.id, imageCount: input.n, model: input.model || provider.model || "", stage: "first-frame" }); Object.assign(input, { generationAttemptId, inputFingerprint, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: [generationAttemptId, inputFingerprint, quote.quoteId].join(":"), priceSnapshot: quote.priceSnapshot, quoteBoardId: input.boardId || "global", quoteRequestScope: requestScope, quotePurpose: "first-frame", quoteOperation: "image:generate" }); } const result = await ${api}.generateImage(input); ${persistResult} if (input.boardId) emitMcpEvent("board-updated", { operationId, boardId: input.boardId }); const mcpImageDataUrls = await Promise.all(result.images.map((output) => ${api}.readAssetDataUrl(output.path))); store[operationId] = { generationId: operationId, status: "succeeded", boardId: input.boardId, job: result.job, images: result.images, warnings: result.warnings, mcpImageDataUrls }; emitMcpEvent("generation-finished", { operationId, boardId: input.boardId, count: result.images.length, mode: input.workflowMode, sourcePath: ${edit ? `${args}.sourcePath` : "undefined"} }); }).catch((error) => { const message = error instanceof Error ? error.message : "生成失败"; store[operationId] = { ...store[operationId], status: "failed", error: message, completedAt: new Date().toISOString() }; emitMcpEvent("generation-finished", { operationId, boardId: input.boardId, error: message, mode: input.workflowMode, sourcePath: ${edit ? `${args}.sourcePath` : "undefined"} }); }); return store[operationId]; })()`;
}

function buildGenerationStatusCall(args: string): string {
  const api = "window.imageWorkbench";
  return `(() => { const store = window.__iterlayMcpGenerations || {}; const task = store[${args}.generationId]; if (task) return task; return ${api}.listHistory().then((jobs) => { const job = jobs.find((candidate) => candidate.id === ${args}.generationId); return job ? { generationId: job.id, status: job.status, job, images: job.outputImagePaths.map((path) => ({ path })) } : null; }); })()`;
}

function buildBoardLayoutCall(args: string): string {
  const api = "window.imageWorkbench";
  return `${api}.getBoard(${args}.boardId).then((board) => { if (!board) return null; const defaultWidth = 264; const gap = 40; const nodes = board.nodes.map((node) => { const width = Math.max(1, Number(node.displayWidth) || defaultWidth); const height = node.width && node.height ? width * node.height / node.width : width; return { id: node.id, x: node.x, y: node.y, width, height }; }); const overlaps = []; for (let left = 0; left < nodes.length; left += 1) { for (let right = left + 1; right < nodes.length; right += 1) { const a = nodes[left]; const b = nodes[right]; if (a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y) overlaps.push([a.id, b.id]); } } const bounds = nodes.length ? { x: Math.min(...nodes.map((node) => node.x)), y: Math.min(...nodes.map((node) => node.y)), width: Math.max(...nodes.map((node) => node.x + node.width)) - Math.min(...nodes.map((node) => node.x)), height: Math.max(...nodes.map((node) => node.y + node.height)) - Math.min(...nodes.map((node) => node.y)) } : null; return { boardId: board.id, nodeCount: nodes.length, bounds, overlappingNodePairs: overlaps }; })`;
}
