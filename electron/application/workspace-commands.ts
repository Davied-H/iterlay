import { calculateSliceGrid, validateCropRect, MAX_SLICE_COUNT } from "../../shared/image-slicing.js";
import { imageDimensionsFromHeader } from "../media/image-metadata.js";
import type { ImageCropRect } from "../../shared/types.js";
import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  GenerateImageInput,
  GenerateResponse,
  GenerationJob,
  ReferenceImagePayload,
  VideoGenerationInput
} from "../../shared/types.js";
import { isBoardImageNode } from "../../shared/types.js";
import { writeJsonAtomic } from "../storage/atomic-json.js";
import { pendingVideoJobId } from "../../shared/video-generation-placeholder.js";
import type { WorkspaceApi } from "./workbench-api.js";

export interface WorkbenchEvent { type: string; [key: string]: unknown }
export interface GenerationRecord {
  requestHash?: string; generationId: string; status: "running" | "succeeded" | "failed" | "cancelled" | "unknown"; boardId?: string;
  prompt?: string; createdAt: string; completedAt?: string; error?: string;
  job?: GenerationJob; images?: GenerateResponse["images"]; warnings?: string[];
}
interface CommandDependencies {
  api: WorkspaceApi;
  emit: (event: WorkbenchEvent) => void;
  flush: () => Promise<void>;
  taskDirectory?: string;
}
function string(value: unknown, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > 100_000) throw new Error("工具参数必须是受限长度的字符串。");
  return value;
}
function strings(value: unknown, max = 1000): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some((v) => typeof v !== "string")) throw new Error("工具数组参数无效。");
  return value;
}
function number(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("工具数值参数必须是有限数字。");
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (!values.includes(value as T)) throw new Error("工具选项参数无效。");
  return value as T;
}

/** Typed command dispatch; all mutations use the same service as UI IPC. */
export class WorkspaceCommands {
  private readonly videoStatuses = new Map<string, string>();
  private readonly tasks = new Map<string, GenerationRecord>();
  private readonly submissions = new Map<string, { hash: string; promise: Promise<GenerationRecord> }>();
  private defaultBoardResolution?: Promise<string>;
  constructor(private readonly dependencies: CommandDependencies) {}
  async call(method: string, a: Record<string, unknown>): Promise<unknown> {
    const { api } = this.dependencies;
    const emit = (event: WorkbenchEvent) => this.dependencies.emit({ ...event, ...(a.preserveView === true ? { preserveView: true } : {}) });
    const boardId = string(a.boardId);
    const nodeId = string(a.nodeId);
    const mutate = async (action: () => Promise<unknown>, detail: Record<string, unknown> = {}) => {
      await this.dependencies.flush();
      const result = await action();
      emit({ type: "board-updated", boardId, ...detail });
      return result;
    };
    switch (method) {
      case "status": {
        const settings = await api.getSettings();
        return { protocolVersion: 1, activeProviderId: settings.activeProviderId, boardCount: (await api.listBoards()).length };
      }
      case "configure_provider": return api.configureProvider(a);
      case "get_provider": {
        const settings = await api.getSettings();
        const provider = [...settings.providers, ...(settings.videoProviders ?? []), ...(settings.textProviders ?? []), ...(settings.audioProviders ?? [])].find((p) => p.id === string(a.providerId));
        if (!provider) throw new Error("Provider 不存在。");
        const fields = new Set(["id", "name", "type", "baseUrl", "model", "models", "voice", "speechEndpoint", "connectionProviderId", "authProviderId", "generationEndpoint", "referenceEndpoint", "apiMode", "supportsReferenceImages"]);
        return { ...Object.fromEntries(Object.entries(provider).filter(([key]) => fields.has(key))), authConfigured: Boolean(settings.providerKeyStatus?.[provider.id]) };
      }
      case "list_providers": {
        const settings = await api.getSettings();
        const kinds = a.kind ? [choice(a.kind, ["image", "video", "text", "audio"] as const, "image")] : ["image", "video", "text", "audio"];
        const safe = settings as typeof settings & { providerKeyStatus?: Record<string, boolean>; codexAuthStatusByProviderId?: Record<string, { connected?: boolean }> };
        return kinds.flatMap((kind) => {
          const providers = kind === "image" ? settings.providers : kind === "video" ? settings.videoProviders ?? [] : kind === "audio" ? settings.audioProviders ?? [] : settings.textProviders ?? [];
          const activeId = kind === "image" ? settings.activeProviderId : kind === "video" ? settings.activeVideoProviderId : kind === "audio" ? settings.activeAudioProviderId : settings.activeTextProviderId;
          return providers.filter((p) => p.type !== "official").map((p) => ({ id: p.id, name: p.name, kind, type: p.type, model: p.model, isDefault: p.id === activeId, authConfigured: Boolean(safe.providerKeyStatus?.[p.id] || safe.codexAuthStatusByProviderId?.[p.id]?.connected) }));
        });
      }
      case "list_models": {
        const settings = await api.getSettings();
        const provider = [...settings.providers, ...(settings.videoProviders ?? []), ...(settings.textProviders ?? []), ...(settings.audioProviders ?? [])].find((p) => p.id === string(a.providerId));
        if (!provider) throw new Error("Provider 不存在。");
        return { providerId: provider.id, defaultModel: provider.model, models: [...new Set([provider.model, ...("models" in provider && Array.isArray(provider.models) ? provider.models : [])])].filter(Boolean), source: "saved" };
      }
      case "read_asset": return { dataUrl: await api.readAssetDataUrl(string(a.path)) };
      case "list_tasks": return api.listHistory();
      case "cancel_generation": return api.cancelImageGeneration(string(a.generationId));
      case "list_modification_requests": return api.listModificationRequests(boardId || undefined);
      case "get_modification_request": return api.getModificationRequest(string(a.requestId));
      case "claim_modification_request": return api.claimModificationRequest(string(a.requestId),string(a.owner));
      case "clarify_modification_request": return api.clarifyModificationRequest(string(a.requestId),string(a.instruction));
      case "finish_modification_request": {
        const request=await api.getModificationRequest(string(a.requestId));
        return mutate(()=>api.finishModificationRequest({id:request.id,claimToken:string(a.claimToken),resultJobId:string(a.resultJobId)||undefined,resultPaths:strings(a.resultPaths),error:string(a.error)||undefined}),{boardId:request.boardId});
      }
      case "create_canvas": case "update_canvas": {
        if (!boardId) throw new Error("请指定目标画板。");
        if (method === "update_canvas" && (!nodeId || typeof a.expectedCode !== "string")) throw new Error("修改 Canvas 前请读取当前代码。");
        return mutate(() => api.writeCanvasNode({ boardId, ...(method === "update_canvas" ? { nodeId, expectedCode: string(a.expectedCode) } : {}),
          framework: choice(a.framework, ["html", "react", "vue"] as const, "html"), code: string(a.code),
          ...(a.title === undefined ? {} : { title: string(a.title) }) }));
      }
      case "list_templates": return api.listTemplates();
      case "get_template": return api.getTemplate(string(a.templateId));
      case "create_template": case "update_template": {
        const allowed = ["name", "description", "prompt", "category", "mode", "useCase", "fields", "extractionScenario"];
        const input = Object.fromEntries(Object.entries(a).filter(([key]) => allowed.includes(key)));
        const result = method === "create_template" ? await api.createTemplate(input) : await api.updateTemplate(string(a.templateId), input, a.expectedPrompt === undefined ? undefined : string(a.expectedPrompt));
        emit({ type: "templates-updated" }); return result;
      }
      case "list_boards": return api.listBoards();
      case "resolve_generation_board": return { boardId: await this.resolveGenerationBoard(boardId, a.preserveView === true) };
      case "get_active_board": {
        const state = await api.getBoardsState();
        return state.lastOpenedBoardId ? api.getBoard(state.lastOpenedBoardId) : null;
      }
      case "get_board": return api.getBoard(boardId);
      case "get_board_layout": {
        const board = await api.getBoard(boardId);
        if (!board) return null;
        const nodes = board.nodes.map((node) => ({
          id: node.id, x: node.x, y: node.y,
          width: Math.max(1, node.displayWidth ?? 264),
          height: "width" in node && node.width && node.height ? (node.displayWidth ?? 264) * node.height / node.width : node.displayHeight ?? 264
        }));
        const overlaps: string[][] = [];
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          const x = nodes[i], y = nodes[j];
          if (x.x < y.x + y.width + 40 && x.x + x.width + 40 > y.x && x.y < y.y + y.height + 40 && x.y + x.height + 40 > y.y) overlaps.push([x.id, y.id]);
        }
        const x = nodes.length ? Math.min(...nodes.map((n) => n.x)) : 0;
        const y = nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0;
        return { boardId, nodeCount: nodes.length, overlappingNodePairs: overlaps,
          bounds: nodes.length ? { x, y, width: Math.max(...nodes.map((n) => n.x + n.width)) - x, height: Math.max(...nodes.map((n) => n.y + n.height)) - y } : null };
      }
      case "open_board": case "focus_nodes": case "fit_board_view": {
        const board = await api.getBoard(boardId);
        if (!board) throw new Error("画板不存在或已移入回收站。");
        const nodeIds = method === "focus_nodes" ? [...new Set(strings(a.nodeIds))] : method === "fit_board_view" ? board.nodes.map((n) => n.id) : [];
        if (nodeIds.some((id) => !board.nodes.some((n) => n.id === id))) throw new Error("画板中不存在指定节点。");
        emit({ type: method === "open_board" ? "open-board" : method === "focus_nodes" ? "focus-nodes" : "fit-board-view", boardId, nodeIds });
        return { boardId, nodeIds, nodeCount: board.nodes.length, requested: true };
      }
      case "move_image": return mutate(() => api.moveBoardImage(boardId, nodeId, number(a.x), number(a.y)), { movedNodeId: nodeId, x: a.x, y: a.y });
      case "resize_image": return mutate(() => api.resizeBoardImage(boardId, nodeId, number(a.displayWidth)));
      case "arrange_images": return mutate(() => api.arrangeBoardImages(boardId, strings(a.nodeIds), choice(a.mode, ["horizontal", "vertical", "grid"], "grid"), a.gap === undefined ? undefined : number(a.gap)));
      case "duplicate_images": return mutate(() => api.duplicateBoardImages(boardId, strings(a.nodeIds), a.offset === undefined ? undefined : number(a.offset)));
      case "trash_images": return mutate(() => api.trashBoardImages(boardId, strings(a.nodeIds)));
      case "set_image_version": return mutate(() => api.setBoardImageVersion(boardId, nodeId, number(a.versionIndex)));
      case "restore_image": {
        const id = string(a.trashId);
        const record = (await api.listTrashedBoardImages()).find((r) => r.id === id);
        if (!record) throw new Error("回收站中不存在指定图片。");
        await this.dependencies.flush();
        const result = await api.restoreTrashedBoardImage(id);
        emit({ type: "board-updated", boardId: record.boardId });
        return result;
      }
      case "create_board": {
        const board = await api.createBoard(string(a.name, "未命名画板"));
        emit({ type: "board-created", boardId: board.id, name: board.name });
        return board;
      }
      case "list_assets": return api.listAssets(undefined, number(a.limit, 40));
      case "slice_image": return mutate(async () => {
        const board = await api.getBoard(boardId);
        if (!board) throw new Error("画板不存在。");
        const source = nodeId ? board.nodes.find((n) => n.id === nodeId && isBoardImageNode(n)) : undefined;
        if (nodeId && !source) throw new Error("源图片节点不存在。");
        const sourcePath = string(a.sourcePath) || (source && isBoardImageNode(source) ? source.imagePath : "");
        if (!sourcePath) throw new Error("缺少受管源图片路径或节点 ID。");
        if (source && isBoardImageNode(source) && sourcePath !== source.imagePath) throw new Error("源路径与节点不一致。");
        const dataUrl = await api.readAssetDataUrl(sourcePath);
        const size = imageDimensionsFromHeader(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
        if (!size) throw new Error("无法读取源图片尺寸。");
        if (a.crops !== undefined && [a.rows, a.columns, a.margin, a.gap].some((v) => v !== undefined)) throw new Error("裁切区域与宫格参数不能同时使用。");
        let crops: ImageCropRect[];
        if (a.crops !== undefined) {
          if (!Array.isArray(a.crops) || !a.crops.length || a.crops.length > MAX_SLICE_COUNT) throw new Error("裁切区域数量无效。");
          crops = a.crops.map((value: unknown) => {
            if (!value || typeof value !== "object") throw new Error("裁切区域无效。");
            const rect = value as Record<string, unknown>;
            return { x: number(rect.x), y: number(rect.y), width: number(rect.width), height: number(rect.height) };
          });
        } else crops = calculateSliceGrid({ ...size, rows: number(a.rows), columns: number(a.columns), margin: number(a.margin, 0), gap: number(a.gap, 0) });
        crops.forEach((crop) => validateCropRect(crop, size.width, size.height));
        const images = await api.sliceImage({ sourcePath, crops });
        if (images.length !== crops.length) throw new Error("切图结果数量不完整。");
        const sourceNode = source ?? board.nodes.find((n) => isBoardImageNode(n) && n.imagePath === sourcePath);
        const nodeIds = images.map(() => crypto.randomUUID());
        await api.appendBoardNodes(boardId, images.map((image, index) => ({
          id: nodeIds[index], imagePath: image.path, width: image.width, height: image.height,
          jobId: "slice-" + nodeIds[index], source: "slice" as const,
          ...(sourceNode ? { derivation: { sourceNodeId: sourceNode.id, sourceImagePath: sourcePath, crop: crops[index] } } : {})
        })));
        return { boardId, sourcePath, nodeIds, images, crops };
      });
      case "export_assets": return api.saveAssetsAsZip(strings(a.paths));
      case "open_iterlay": return true;
      case "import_image": return mutate(async () => {
        const image = await api.importUploadedImage(string(a.dataUrl));
        if (boardId) await api.appendBoardNodes(boardId, [{ id: crypto.randomUUID(), imagePath: image.path, jobId: "import-" + crypto.randomUUID(), source: "upload" }]);
        return image;
      });
      case "import_video": return mutate(async () => {
        const match = /^data:(video\/(?:mp4|quicktime|webm));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(string(a.dataUrl));
        if (!match) throw new Error("仅支持 mp4、mov 或 webm 的视频 data URL。");
        const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
        const video = await api.importVideo(bytes.buffer, match[1]);
        if (boardId) await api.appendBoardNodes(boardId, [{ id: crypto.randomUUID(), type: "video", videoPath: video.path, jobId: "import-" + crypto.randomUUID(), source: "upload", mimeType: video.mimeType }]);
        return video;
      });
      case "generate_image": case "edit_image": return this.startGeneration(a, method === "edit_image");
      case "get_generation_status": return this.generationStatus(string(a.generationId));
      case "generate_video": {
        const targetBoardId = await this.resolveGenerationBoard(boardId, a.preserveView === true);
        const input: VideoGenerationInput = {
          mode: choice(a.mode, ["generate", "remix", "extend"] as const, "generate"),
          prompt: string(a.prompt), model: string(a.model), aspectRatio: string(a.aspectRatio, "16:9"),
          resolution: string(a.resolution, "720p"), durationSeconds: number(a.durationSeconds, 5),
          referenceImagePaths: strings(a.referenceImagePaths, 4), referenceVideoPaths: strings(a.referenceVideoPaths, 4),
          referenceAudioPaths: strings(a.referenceAudioPaths, 4), sourceVideoPath: string(a.sourceVideoPath) || undefined,
          firstFramePath: string(a.firstFramePath) || undefined, lastFramePath: string(a.lastFramePath) || undefined,
          generationNodeId: string(a.generationNodeId) || undefined, targetVideoNodeId: string(a.targetVideoNodeId) || undefined,
          generateAudio: a.generateAudio === true, watermark: a.watermark === true, providerId: string(a.providerId) || undefined, boardId: targetBoardId
        };
        await this.dependencies.flush();
        const referenceBoard = await api.getBoard(targetBoardId);
        const boardImages = referenceBoard?.nodes.filter(isBoardImageNode).filter((node) => node.imagePath) ?? [];
        // Older assistants omitted media arguments. Prefer the requested node, otherwise
        // the most recently added image; never send every unrelated image on a board.
        if (a.textOnly !== true && input.referenceImagePaths.length === 0 && !input.firstFramePath && !input.lastFramePath && input.mode === "generate") {
          const requested = strings(a.referenceNodeIds);
          const incoming = referenceBoard?.connections?.filter((connection) => connection.kind === "reference"
            && connection.target === input.generationNodeId) ?? [];
          const sources = requested.length
            ? boardImages.filter((node) => requested.includes(node.id))
            : nodeId ? boardImages.filter((node) => node.id === nodeId)
              : input.generationNodeId ? boardImages.filter((node) => incoming.some((connection) => connection.source === node.id))
                : boardImages.slice(-1);
          input.firstFramePath = sources.find((node) => incoming.some((connection) => connection.source === node.id
            && connection.targetHandle === "target-start-frame"))?.imagePath;
          input.lastFramePath = sources.find((node) => incoming.some((connection) => connection.source === node.id
            && connection.targetHandle === "target-end-frame"))?.imagePath;
          input.referenceImagePaths = sources.filter((node) => node.imagePath !== input.firstFramePath
            && node.imagePath !== input.lastFramePath).map((node) => node.imagePath);
        }
        // Tool submissions need the same durable canvas anchor as UI submissions.
        // Publish it before awaiting the provider so even a slow submit is visible.
        const createdNodeId = !input.generationNodeId ? crypto.randomUUID() : undefined;
        if (createdNodeId) {
          input.generationNodeId = createdNodeId;
          await this.dependencies.flush();
          await api.appendBoardNodes(targetBoardId, [{
            id: createdNodeId, type: "video-generation", title: "视频生成", displayWidth: 340,
            mode: input.mode, prompt: input.prompt, model: input.model, providerId: input.providerId,
            duration: input.durationSeconds, aspectRatio: input.aspectRatio, resolution: input.resolution,
            generateAudio: input.generateAudio, watermark: input.watermark,
            referenceVideoPaths: input.referenceVideoPaths, referenceAudioPaths: input.referenceAudioPaths,
            sourceVideoPath: input.sourceVideoPath, targetVideoNodeId: input.targetVideoNodeId, status: "submitting"
          }, {
            id: `video-output-${pendingVideoJobId(createdNodeId)}`, type: "video", videoPath: "",
            jobId: pendingVideoJobId(createdNodeId), source: "generated", generationNodeId: createdNodeId,
            aspectRatio: input.aspectRatio, status: "submitting"
          }]);
          const board = await api.getBoard(targetBoardId);
          if (board) {
            const sources = boardImages.filter((node) => input.referenceImagePaths.includes(node.imagePath)
              || node.imagePath === input.firstFramePath || node.imagePath === input.lastFramePath);
            const anchor = sources.at(-1);
            const x = anchor ? anchor.x + (anchor.displayWidth ?? 264) + 96 : undefined;
            let y = anchor?.y ?? 0;
            if (x !== undefined) {
              // Keep the chain near its source without covering an existing card.
              const obstacles = board.nodes.filter((node) => node.id !== createdNodeId
                && node.id !== `video-output-${pendingVideoJobId(createdNodeId)}`);
              while (obstacles.some((node) => node.x < x + 800 && node.x + (node.displayWidth ?? 340) > x
                && node.y < y + 640 && node.y + (node.displayHeight ?? 640) > y)) y += 680;
            }
            await api.saveBoard({ id: board.id,
              nodes: board.nodes.map((node) => x === undefined ? node : node.id === createdNodeId
                ? { ...node, x, y } : node.id === `video-output-${pendingVideoJobId(createdNodeId)}`
                  ? { ...node, x: x + 436, y } : node),
              connections: [...(board.connections ?? []), ...sources.flatMap((source) => {
                const handles = [
                  ...(source.imagePath === input.firstFramePath ? ["target-start-frame"] : []),
                  ...(source.imagePath === input.lastFramePath ? ["target-end-frame"] : []),
                  ...(input.referenceImagePaths.includes(source.imagePath) ? ["target-reference"] : [])
                ];
                return handles.map((targetHandle) => ({ id: crypto.randomUUID(), source: source.id,
                  target: createdNodeId, kind: "reference" as const, sourceHandle: "source-right", targetHandle }));
              })]
            });
          }
          emit({ type: "board-updated", boardId: targetBoardId,
            nodeIds: [`video-output-${pendingVideoJobId(createdNodeId)}`] });
        } else {
          emit({ type: "board-updated", boardId: targetBoardId, nodeIds: [input.generationNodeId] });
        }
        let job;
        try {
          // The renderer may have reloaded the anchor; drain its saves before the
          // service atomically installs the job's output placeholder.
          await this.dependencies.flush();
          job = await api.startVideoGeneration(input);
        } catch (error) {
          if (createdNodeId) {
            await this.dependencies.flush();
            const board = await api.getBoard(targetBoardId);
            if (board) await api.saveBoard({ id: board.id, nodes: board.nodes.map((node) =>
              (node.id === createdNodeId && node.type === "video-generation")
                || (node.type === "video" && node.generationNodeId === createdNodeId && !node.videoPath)
                ? { ...node, status: "failed" as const, error: error instanceof Error ? error.message : String(error) } : node) });
            emit({ type: "board-updated", boardId: targetBoardId, nodeIds: [createdNodeId] });
          }
          throw error;
        }
        this.videoStatuses.set(job.id, job.status);
        emit({ type: "board-updated", boardId: targetBoardId,
          nodeIds: [input.mode === "remix" && input.targetVideoNodeId ? input.targetVideoNodeId : `video-output-${job.id}`] });
        if (!["completed", "failed", "cancelled"].includes(job.status)) {
          this.watchVideoJob(job.id, a.preserveView === true);
        }
        return { videoGenerationId: job.id, status: job.status, boardId: targetBoardId, job };
      }
      case "get_video_generation_status": {
        const job = await api.getVideoJob(string(a.videoGenerationId));
        if (!job) return null;
        let outputNodeId: string | undefined;
        let appended = false;
        if (job.status === "completed" && job.outputVideoPath && job.input.boardId) {
          const board = await api.getBoard(job.input.boardId);
          outputNodeId = board?.nodes.find((n) => n.type === "video" && n.videoPath === job.outputVideoPath)?.id;
          if (board && !outputNodeId && (job.input.mode ?? "generate") === "generate") {
            await this.dependencies.flush();
            outputNodeId = "video-" + job.id;
            await api.appendBoardNodes(board.id, [{ id: outputNodeId, type: "video", videoPath: job.outputVideoPath, posterPath: job.outputPosterPath,
              jobId: job.id, source: "generated", mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs }]);
            appended = true;
          }
        }
        if (job.input.boardId && (appended || this.videoStatuses.get(job.id) !== job.status)) {
          emit({ type: "board-updated", boardId: job.input.boardId,
            ...(outputNodeId ? { nodeIds: [outputNodeId] } : {}) });
        }
        this.videoStatuses.set(job.id, job.status);
        return { videoGenerationId: job.id, status: job.status, boardId: job.input.boardId, job,
          video: job.outputVideoPath ? { path: job.outputVideoPath, posterPath: job.outputPosterPath, mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs } : undefined };
      }
      case "stop_video_polling": return { ...await api.stopVideoPolling(string(a.videoGenerationId)), videoGenerationId: a.videoGenerationId, remoteCancelled: false, message: "仅停止本机轮询，远端任务不会被取消。" };
      default: throw new Error(`未知的 工作台 工具：${method}`);
    }
  }

  /** Canvas visibility must not depend on the assistant remembering to poll. */
  private watchVideoJob(id: string, preserveView: boolean): void {
    const timer = setTimeout(() => {
      void this.call("get_video_generation_status", { videoGenerationId: id, preserveView })
        .then((result) => {
          const status = (result as { status?: string } | null)?.status;
          if (status && !["completed", "failed", "cancelled"].includes(status)) this.watchVideoJob(id, preserveView);
        }).catch(() => { /* Explicit status queries and persisted task recovery remain available. */ });
    }, 2_000);
    timer.unref();
  }

  /** Resolve once in the App so CLI and raw workspace calls share the same destination. */
  private async resolveGenerationBoard(explicitBoardId: string, preserveView = false): Promise<string> {
    const { api, emit } = this.dependencies;
    const configured = explicitBoardId || (await api.getSettings()).cliDefaultBoardId;
    if (configured) {
      if (!await api.getBoard(configured)) throw new Error(explicitBoardId
        ? "画板不存在或已移入回收站。"
        : "CLI 默认画板不存在或已移入回收站，请在设置 → Coding Agent 中重新选择，或使用 --board 指定画板。");
      return configured;
    }
    // Concurrent first-time submissions must not create multiple CLI boards.
    if (this.defaultBoardResolution) return this.defaultBoardResolution;
    const pending = (async () => {
      const existing = (await api.listBoards()).find((board) => board.name === "CLI 创作");
      if (existing) return existing.id;
      const board = await api.createBoard("CLI 创作");
      emit({ type: "board-created", boardId: board.id, name: board.name, ...(preserveView ? { preserveView: true } : {}) });
      return board.id;
    })();
    this.defaultBoardResolution = pending;
    try { return await pending; }
    finally { this.defaultBoardResolution = undefined; }
  }

  private async startGeneration(a: Record<string, unknown>, edit: boolean): Promise<GenerationRecord> {
    const requestId = a.requestId === undefined ? crypto.randomUUID() : string(a.requestId);
    if (!/^[a-zA-Z0-9-]{1,100}$/u.test(requestId)) throw new Error("请求 ID 无效。");
    const hash = createHash("sha256").update(JSON.stringify({ edit, args: Object.fromEntries(Object.entries(a).filter(([key]) => key !== "requestId").sort(([left], [right]) => left.localeCompare(right))) })).digest("hex");
    const pending = this.submissions.get(requestId);
    if (pending) { if (pending.hash !== hash) throw new Error("请求 ID 已用于不同参数。"); return pending.promise; }
    const promise = (async () => {
      let existing = this.tasks.get(requestId);
      if (!existing && this.dependencies.taskDirectory) {
        try { existing = JSON.parse(await readFile(path.join(this.dependencies.taskDirectory, requestId + ".json"), "utf8")) as GenerationRecord; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      if (existing) { if (existing.requestHash !== hash) throw new Error("请求 ID 已用于不同参数。"); return existing; }
      return this.performGeneration(a, edit, requestId, hash);
    })();
    this.submissions.set(requestId, { hash, promise });
    try { return await promise; } finally { this.submissions.delete(requestId); }
  }

  private async performGeneration(a: Record<string, unknown>, edit: boolean, requestId: string, requestHash: string): Promise<GenerationRecord> {
    const { api } = this.dependencies;
    const emit = (event: WorkbenchEvent) => this.dependencies.emit({ ...event, ...(a.preserveView === true ? { preserveView: true } : {}) });
    const template = a.templateId === undefined ? undefined : await api.getTemplate(string(a.templateId));
    if (template && template.mode !== (edit ? "edit" : "generate")) throw new Error("模板创作模式与当前命令不匹配。");
    const boardId = await this.resolveGenerationBoard(string(a.boardId), a.preserveView === true);
    const sourcePath = string(a.sourcePath);
    const prepared = a.modificationRequestId ? await api.prepareModificationRequest(string(a.modificationRequestId),string(a.claimToken)) : undefined;
    if (prepared && (!edit || prepared.boardId!==boardId || prepared.sourcePath!==sourcePath)) throw new Error("修改请求的画板或固定源版本与执行参数不一致。");
    const references = edit ? [sourcePath,...(prepared ? [prepared.maskPath,...prepared.referencePaths].filter((value):value is string=>Boolean(value)) : strings(a.referencePaths,3))] : strings(a.referencePaths,4);
    if (references.length>4) throw new Error("修改请求的源图、蒙版和参考图片合计最多4张。");
    const content = string(a.prompt,prepared?.instruction??"");
    const prompt = template ? `模板固定规则：\n${template.prompt}\n\n本次创作内容：\n${content}` : content;
    if (!prompt.trim() || !boardId || (edit && !sourcePath)) throw new Error("生成缺少画板、提示词或编辑目标。");
    const settings = await api.getSettings();
    const provider = settings.providers.find((p) => p.id === (a.providerId || settings.activeProviderId));
    if (!provider || provider.type === "official") throw new Error("请配置自有图片 Provider。");
    const board = await api.getBoard(boardId);
    if (!board) throw new Error("画板不存在或已移入回收站。");
    const target = edit ? board.nodes.filter(isBoardImageNode).find((n) => n.imagePath === sourcePath || n.versions?.some((v) => v.imagePath === sourcePath)) : undefined;
    if (edit && !target) throw new Error("编辑目标不在指定画板中。");
    await this.dependencies.flush();
    this.prune();
    if (this.tasks.size >= 128) throw new Error("生成任务过多，请等待已提交任务完成。");
    const count = number(a.n, 1);
    if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("图片数量必须是 1 到 4 的整数。");
    const input: GenerateImageInput = {
      clientTaskId: requestId,
      sceneId: template?.id, useCase: template?.useCase,
      editSource: edit && target ? { nodeId: target.id, boardId, imagePath: sourcePath,
        jobId: target.versions?.find((version) => version.imagePath === sourcePath)?.jobId ?? target.jobId } : undefined,
      modificationRequestId: prepared?.id, idempotencyKey: prepared?.executionKey,
      workflowMode: edit ? "edit" : "generate", creationMode: "general", promptSpec: { primaryRequest: prompt },
      prompt, model: string(a.model, provider.model), size: string(a.size, "auto"),
      n: count, quality: choice(a.quality, ["auto", "low", "medium", "high"] as const, "high"),
      style: string(a.style, "natural"), background: choice(a.background, ["auto", "opaque", "transparent"] as const, "auto"), outputFormat: "png",
      boardId, providerId: provider.id, referenceImages: []
    };
    const record: GenerationRecord = { requestHash, generationId: requestId, status: "running", boardId, prompt, createdAt: new Date().toISOString() };
    await this.remember(record);
    emit({ type: "generation-started", operationId: record.generationId, boardId, prompt, count: input.n, size: input.size, mode: input.workflowMode, sourcePath: edit ? sourcePath : undefined });
    let submittedToBackend = false;
    void (async () => {
      const referenceImages: ReferenceImagePayload[] = await Promise.all(references.map(async (file) => {
        const url = await api.readAssetDataUrl(file);
        const match = /^data:([^;]+);base64,(.+)$/u.exec(url);
        if (!match) throw new Error("参考图数据无效。");
        return { id: crypto.randomUUID(), name: path.basename(file), mimeType: match[1], dataBase64: match[2], role: edit && file===sourcePath ? "edit-target" : "reference" };
      }));
      submittedToBackend = true;
      const result = await api.generateImage({ ...input, referenceImages });
      await this.dependencies.flush();
      if (edit && target && !prepared) await api.appendBoardNodeVersions(boardId, target.id, result.images.map((image) => ({ imagePath: image.path, jobId: result.job.id, width: "width" in target ? target.width : undefined, height: "height" in target ? target.height : undefined })));
      else if (!prepared) await api.appendBoardNodes(boardId, result.images.map((image) => ({ id: crypto.randomUUID(), imagePath: image.path, jobId: result.job.id, source: "generated" })));
      await this.remember({ ...record, status: "succeeded", completedAt: new Date().toISOString(), job: result.job,
        images: result.images.map((image) => ({ ...image, dataUrl: "" })), warnings: result.warnings });
      emit({ type: "board-updated", boardId, operationId: record.generationId });
      emit({ type: "generation-finished", boardId, operationId: record.generationId, count: result.images.length, mode: input.workflowMode, sourcePath: edit ? sourcePath : undefined });
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = error instanceof Error && error.name === "GenerationCancelledError" || message.includes("已取消排队任务");
      const status = cancelled ? "cancelled" : submittedToBackend ? "unknown" : "failed";
      await this.remember({ ...record, status, completedAt: new Date().toISOString(), error: message }).catch(() => undefined);
      emit({ type: "generation-finished", boardId, operationId: record.generationId, error: message, mode: input.workflowMode, sourcePath: edit ? sourcePath : undefined });
    });
    return record;
  }

  private async generationStatus(id: string): Promise<unknown> {
    if (!/^[a-zA-Z0-9-]{1,100}$/u.test(id)) throw new Error("任务 ID 无效。");
    let task = this.tasks.get(id);
    if (!task && this.dependencies.taskDirectory) {
      try { task = JSON.parse(await readFile(path.join(this.dependencies.taskDirectory, id + ".json"), "utf8")) as GenerationRecord; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    if (task?.status === "running" && !this.tasks.has(id)) {
      task = { ...task, status: "unknown", error: "应用已重启，远端结果与费用状态待确认。请检查 Provider 和生成历史，勿直接重复提交。" };
      await this.remember(task);
    }
    if (task?.status === "unknown") {
      const historical = (await this.dependencies.api.listHistory()).find((job) => job.input.clientTaskId === id);
      if (historical && ["succeeded", "cancelled", "failed"].includes(historical.status)) {
        task = { ...task, status: historical.status as "succeeded" | "cancelled" | "failed", job: historical,
          error: historical.error, completedAt: historical.completedAt,
          images: historical.outputImagePaths.map((file) => ({ path: file, dataUrl: "" })) };
        await this.remember(task);
      }
    }
    if (!task) {
      const job = (await this.dependencies.api.listHistory()).find((j) => j.id === id);
      return job ? { generationId: job.id, status: job.status, job, images: job.outputImagePaths.map((file) => ({ path: file })) } : null;
    }
    const previewImageDataUrls: string[] = [];
    let remaining = 8 * 1024 * 1024;
    for (const image of task.images ?? []) {
      const data = await this.dependencies.api.readAssetDataUrl(image.path);
      if (data.length > remaining) break;
      remaining -= data.length;
      previewImageDataUrls.push(data);
    }
    return { ...task, previewImageDataUrls };
  }
  private async remember(record: GenerationRecord): Promise<void> {
    if (this.dependencies.taskDirectory) {
      await mkdir(this.dependencies.taskDirectory, { recursive: true });
      await writeJsonAtomic(path.join(this.dependencies.taskDirectory, record.generationId + ".json"), record);
    }
    this.tasks.set(record.generationId, record);
  }
  private prune(): void {
    for (const [id, task] of this.tasks) {
      if (task.status !== "running" && (this.tasks.size >= 128 || Date.now() - Date.parse(task.completedAt ?? task.createdAt) > 15 * 60_000)) this.tasks.delete(id);
    }
  }
}
