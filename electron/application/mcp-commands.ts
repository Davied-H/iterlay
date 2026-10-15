import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  GenerateImageInput,
  GenerateResponse,
  GenerationJob,
  ReferenceImagePayload,
  VideoGenerationInput
} from "../../shared/types.js";
import { writeJsonAtomic } from "../storage/atomic-json.js";
import type { McpWorkbenchApi } from "./workbench-api.js";

export interface WorkbenchEvent { type: string; [key: string]: unknown }
interface GenerationRecord {
  generationId: string; status: "running" | "succeeded" | "failed"; boardId?: string;
  prompt?: string; createdAt: string; completedAt?: string; error?: string;
  job?: GenerationJob; images?: GenerateResponse["images"]; warnings?: string[];
}
interface CommandDependencies {
  api: McpWorkbenchApi;
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
export class McpCommands {
  private readonly tasks = new Map<string, GenerationRecord>();
  constructor(private readonly dependencies: CommandDependencies) {}
  async call(method: string, a: Record<string, unknown>): Promise<unknown> {
    const { api, emit } = this.dependencies;
    const boardId = string(a.boardId);
    const nodeId = string(a.nodeId);
    const mutate = async (action: () => Promise<unknown>, detail: Record<string, unknown> = {}) => {
      await this.dependencies.flush();
      const result = await action();
      emit({ type: "board-updated", boardId, ...detail });
      return result;
    };
    switch (method) {
      case "list_boards": return api.listBoards();
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
        const input: VideoGenerationInput = {
          mode: choice(a.mode, ["generate", "remix", "extend"] as const, "generate"),
          prompt: string(a.prompt), model: string(a.model), aspectRatio: string(a.aspectRatio, "16:9"),
          resolution: string(a.resolution, "720p"), durationSeconds: number(a.durationSeconds, 5),
          referenceImagePaths: strings(a.referenceImagePaths, 4), referenceVideoPaths: strings(a.referenceVideoPaths, 4),
          referenceAudioPaths: strings(a.referenceAudioPaths, 4), sourceVideoPath: string(a.sourceVideoPath) || undefined,
          firstFramePath: string(a.firstFramePath) || undefined, lastFramePath: string(a.lastFramePath) || undefined,
          generationNodeId: string(a.generationNodeId) || undefined, targetVideoNodeId: string(a.targetVideoNodeId) || undefined,
          generateAudio: a.generateAudio === true, watermark: a.watermark === true, providerId: string(a.providerId) || undefined, boardId
        };
        const job = await api.startVideoGeneration(input);
        return { videoGenerationId: job.id, status: job.status, boardId, job };
      }
      case "get_video_generation_status": {
        const job = await api.getVideoJob(string(a.videoGenerationId));
        if (!job) return null;
        if (job.status === "completed" && job.outputVideoPath && job.input.boardId && (job.input.mode ?? "generate") === "generate") {
          const board = await api.getBoard(job.input.boardId);
          if (board && !board.nodes.some((n) => n.type === "video" && n.videoPath === job.outputVideoPath)) {
            await this.dependencies.flush();
            await api.appendBoardNodes(board.id, [{ id: "video-" + job.id, type: "video", videoPath: job.outputVideoPath, posterPath: job.outputPosterPath,
              jobId: job.id, source: "generated", mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs }]);
            emit({ type: "board-updated", boardId: board.id });
          }
        }
        return { videoGenerationId: job.id, status: job.status, boardId: job.input.boardId, job,
          video: job.outputVideoPath ? { path: job.outputVideoPath, posterPath: job.outputPosterPath, mimeType: job.mimeType, width: job.width, height: job.height, durationMs: job.durationMs } : undefined };
      }
      case "stop_video_polling": return { ...await api.stopVideoPolling(string(a.videoGenerationId)), videoGenerationId: a.videoGenerationId, remoteCancelled: false, message: "仅停止本机轮询，远端任务不会被取消。" };
      default: throw new Error(`未知的 MCP 工具：${method}`);
    }
  }

  private async startGeneration(a: Record<string, unknown>, edit: boolean): Promise<GenerationRecord> {
    const { api, emit } = this.dependencies;
    const boardId = string(a.boardId);
    const sourcePath = string(a.sourcePath);
    const references = edit ? [sourcePath] : strings(a.referencePaths, 4);
    const prompt = string(a.prompt);
    if (!prompt.trim() || !boardId || (edit && !sourcePath)) throw new Error("生成缺少画板、提示词或编辑目标。");
    const settings = await api.getSettings();
    const provider = settings.providers.find((p) => p.id === (a.providerId || settings.activeProviderId));
    if (!provider || provider.type === "official") throw new Error("请配置自有图片 Provider。");
    const board = await api.getBoard(boardId);
    if (!board) throw new Error("画板不存在或已移入回收站。");
    const target = edit ? board.nodes.find((n) => "imagePath" in n && (n.imagePath === sourcePath || n.versions?.some((v) => v.imagePath === sourcePath))) : undefined;
    if (edit && !target) throw new Error("编辑目标不在指定画板中。");
    await this.dependencies.flush();
    this.prune();
    if (this.tasks.size >= 128) throw new Error("生成任务过多，请等待已提交任务完成。");
    const input: GenerateImageInput = {
      workflowMode: edit ? "edit" : "generate", creationMode: "general", promptSpec: { primaryRequest: prompt },
      prompt, model: string(a.model, provider.model), size: string(a.size, "auto"),
      n: Math.max(1, Math.min(4, Math.trunc(number(a.n, 1)))), quality: choice(a.quality, ["auto", "low", "medium", "high"] as const, "high"),
      style: string(a.style, "natural"), background: choice(a.background, ["auto", "opaque", "transparent"] as const, "auto"), outputFormat: "png",
      boardId, providerId: provider.id, referenceImages: []
    };
    const record: GenerationRecord = { generationId: crypto.randomUUID(), status: "running", boardId, prompt, createdAt: new Date().toISOString() };
    await this.remember(record);
    emit({ type: "generation-started", operationId: record.generationId, boardId, prompt, count: input.n, size: input.size, mode: input.workflowMode, sourcePath: edit ? sourcePath : undefined });
    void (async () => {
      const referenceImages: ReferenceImagePayload[] = await Promise.all(references.map(async (file) => {
        const url = await api.readAssetDataUrl(file);
        const match = /^data:([^;]+);base64,(.+)$/u.exec(url);
        if (!match) throw new Error("参考图数据无效。");
        return { id: crypto.randomUUID(), name: path.basename(file), mimeType: match[1], dataBase64: match[2], role: edit ? "edit-target" : "reference" };
      }));
      const result = await api.generateImage({ ...input, referenceImages });
      await this.dependencies.flush();
      if (edit && target) await api.appendBoardNodeVersions(boardId, target.id, result.images.map((image) => ({ imagePath: image.path, jobId: result.job.id, width: "width" in target ? target.width : undefined, height: "height" in target ? target.height : undefined })));
      else await api.appendBoardNodes(boardId, result.images.map((image) => ({ id: crypto.randomUUID(), imagePath: image.path, jobId: result.job.id, source: "generated" })));
      await this.remember({ ...record, status: "succeeded", completedAt: new Date().toISOString(), job: result.job,
        images: result.images.map((image) => ({ ...image, dataUrl: "" })), warnings: result.warnings });
      emit({ type: "board-updated", boardId, operationId: record.generationId });
      emit({ type: "generation-finished", boardId, operationId: record.generationId, count: result.images.length, mode: input.workflowMode, sourcePath: edit ? sourcePath : undefined });
    })().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await this.remember({ ...record, status: "failed", completedAt: new Date().toISOString(), error: message }).catch(() => undefined);
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
    if (task?.status === "running" && !this.tasks.has(id)) task = { ...task, status: "failed", error: "应用已重启，生成记录中断，请检查生成历史后重试。" };
    if (!task) {
      const job = (await this.dependencies.api.listHistory()).find((j) => j.id === id);
      return job ? { generationId: job.id, status: job.status, job, images: job.outputImagePaths.map((file) => ({ path: file })) } : null;
    }
    const mcpImageDataUrls: string[] = [];
    let remaining = 8 * 1024 * 1024;
    for (const image of task.images ?? []) {
      const data = await this.dependencies.api.readAssetDataUrl(image.path);
      if (data.length > remaining) break;
      remaining -= data.length;
      mcpImageDataUrls.push(data);
    }
    return { ...task, mcpImageDataUrls };
  }
  private async remember(record: GenerationRecord): Promise<void> {
    this.tasks.set(record.generationId, record);
    if (this.dependencies.taskDirectory) {
      await mkdir(this.dependencies.taskDirectory, { recursive: true });
      await writeJsonAtomic(path.join(this.dependencies.taskDirectory, record.generationId + ".json"), record);
    }
  }
  private prune(): void {
    for (const [id, task] of this.tasks) {
      if (task.status !== "running" && (this.tasks.size >= 128 || Date.now() - Date.parse(task.completedAt ?? task.createdAt) > 15 * 60_000)) this.tasks.delete(id);
    }
  }
}
