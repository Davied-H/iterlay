import { convertPiContextToCompletionMessages, parsePiAgentDecision } from "./agents/completion-protocol.js";
export { convertPiContextToCompletionMessages, parsePiAgentDecision } from "./agents/completion-protocol.js";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Agent, type AgentEvent, type AgentTool } from "./agents/tool-runtime.js";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
  type FauxContentBlock,
  type FauxResponseFactory
} from "./agents/tool-runtime.js";
import { parse as parseHtml } from "node-html-parser";
import { Type } from "typebox";
import type {
  MasterGoConnectionState,
  MasterGoReconstructionPreparation,
  MasterGoReconstructionMode,
  MasterGoReconstructionRequest,
  MasterGoReconstructionStage,
  MasterGoReconstructionTask,
  PrepareMasterGoReconstructionRequest
} from "../shared/mastergo-reconstruction.js";
import type { TextTransport } from "./providers/text-assistant.js";
import type { PiAgentLogInput } from "../shared/pi-agent-log.js";
import { PiAgentEvolutionStore, type PiAgentEvolutionOutcome } from "./pi-agent-evolution.js";

const MASTERGO_ADAPTER_VERSION = "1.0.26";
const DEFAULT_PORT = 50_678;
const DISCOVERY_PORT_COUNT = 41;
const PROBE_TIMEOUT_MS = 2_000;
const CONNECTION_CACHE_MS = 4_000;
const PI_AGENT_MAX_TURNS = 24;
const PI_AGENT_MAX_WAIT_MS = 5_000;
const MAX_ANALYSIS_REGIONS = 80;
const MAX_LOCAL_ASSETS = 12;
const MASTERGO_LOCAL_ASSET_MAX_BYTES = 5 * 1024 * 1024;
const require = createRequire(import.meta.url);

interface PreparationState {
  id: string;
  requirement: string;
  mode: MasterGoReconstructionMode;
  targetName: string;
  width?: number;
  height?: number;
  createdAt: number;
}

export interface MasterGoImageProcessor {
  getSize(sourcePath: string): Promise<{ width: number; height: number }>;
  crop(
    sourcePath: string,
    rect: { x: number; y: number; width: number; height: number },
    options?: {
      removeConnectedBackground?: boolean;
      segmentationMode?: "connected-color" | "foreground-instance" | "person-instance";
      fillSubjectInterior?: boolean;
    }
  ): Promise<Buffer>;
  repairSubject?(
    sourcePath: string,
    region: MasterGoAnalysisRegion,
    extracted: Buffer,
    localSegmentationSucceeded: boolean
  ): Promise<Buffer>;
  cleanBackground?(
    sourcePath: string,
    subjects: readonly {
      bytes: Buffer;
      name: string;
      description: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[]
  ): Promise<Buffer>;
}

export type MasterGoAnalysisRegionKind = "ui" | "text" | "image" | "logo" | "decoration";
export type MasterGoAnalysisRegionHandling = "editable" | "local-asset";
export type MasterGoAssetBackgroundMode = "preserve" | "remove-connected";

export interface MasterGoAnalysisRegion {
  name: string;
  kind: MasterGoAnalysisRegionKind;
  x: number;
  y: number;
  width: number;
  height: number;
  handling: MasterGoAnalysisRegionHandling;
  backgroundMode: MasterGoAssetBackgroundMode;
  containsEmbeddedUi: boolean;
  description: string;
}

export interface MasterGoUiAnalysis {
  canvasWidth: number;
  canvasHeight: number;
  regions: MasterGoAnalysisRegion[];
}

export interface PhotoForegroundInventoryItem {
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MasterGoLocalAsset extends MasterGoAnalysisRegion {
  src: string;
}

interface TaskState {
  snapshot: MasterGoReconstructionTask;
  controller: AbortController;
  run?: Promise<void>;
}

type MasterGoToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

interface MasterGoToolResult {
  content: MasterGoToolContent[];
  isError?: boolean;
}

interface MasterGoProbeResult {
  status: "connected" | "offline-canvas" | "unavailable";
  documentName?: string;
  documentId?: string;
}

export class MasterGoBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private endpoint: string | null = null;
  private connectionCache: { expiresAt: number; value: MasterGoConnectionState } | null = null;
  private readonly preparations = new Map<string, PreparationState>();
  private readonly tasks = new Map<string, TaskState>();

  constructor(
    private readonly workspaceDir: string,
    private readonly appVersion: string,
    private readonly logPiAgent: ((entry: PiAgentLogInput) => void) | undefined,
    private readonly imageProcessor: MasterGoImageProcessor,
    private readonly evolutionStore?: PiAgentEvolutionStore
  ) {}

  async start(): Promise<void> {
    await mkdir(this.workspaceDir, { recursive: true });
    await access(require.resolve("@mastergo/vibe-mcp"));
    await this.evolutionStore?.start();
  }

  async stop(): Promise<void> {
    for (const task of this.tasks.values()) task.controller.abort();
    await Promise.allSettled(
      [...this.tasks.values()]
        .map((task) => task.run)
        .filter((run): run is Promise<void> => Boolean(run))
    );
    this.preparations.clear();
    await this.closeClient();
    await this.evolutionStore?.flush();
  }

  async getConnection(force = false): Promise<MasterGoConnectionState> {
    if (!force && this.connectionCache && this.connectionCache.expiresAt > Date.now()) {
      return this.connectionCache.value;
    }

    const discovery = await discoverMasterGoEndpoint(this.endpoint);
    const endpoint = discovery.connectedEndpoint;
    if (!endpoint) {
      await this.closeClient();
      return this.cacheConnection({
        status: "disconnected",
        reason: discovery.serviceEndpoint ? "canvas-offline" : "mastergo-not-open",
        message: discovery.serviceEndpoint
          ? "MasterGo 已启动，但当前画布显示“ＭCP 未连接”。请在 MasterGo 顶栏点击该状态并完成连接。"
          : "未检测到 MasterGo 本地 MCP 服务。请打开 MasterGo 客户端和目标文件。"
      });
    }

    try {
      await this.ensureClient(endpoint);
      const documentName = discovery.connectedProbe?.documentName;
      const documentId = discovery.connectedProbe?.documentId;
      const targetName = documentName
        ? `${documentName} · 当前打开页面`
        : "当前打开的 MasterGo 页面";
      return this.cacheConnection({
        status: "connected",
        endpoint,
        adapterVersion: MASTERGO_ADAPTER_VERSION,
        target: {
          id: "current-page",
          name: targetName,
          description: documentId
            ? `MasterGo 文件 ID：${documentId}。生成期间请保持该文件和页面处于打开状态。`
            : "生成期间请保持该文件和页面处于打开状态。",
          ...(documentName ? { documentName } : {}),
          ...(documentId ? { documentId } : {})
        }
      });
    } catch (error) {
      await this.closeClient();
      return this.cacheConnection({
        status: "disconnected",
        reason: "adapter-unavailable",
        message: normalizeMasterGoError(error, "MasterGo 官方 MCP 适配器启动失败。")
      });
    }
  }

  async prepareReconstruction(
    request: PrepareMasterGoReconstructionRequest
  ): Promise<MasterGoReconstructionPreparation> {
    const connection = await this.getConnection(true);
    if (connection.status !== "connected") throw new Error(connection.message);
    const requirement = buildPageRequirement(request);

    const id = randomUUID();
    this.preparations.set(id, {
      id,
      requirement,
      mode: request.mode,
      targetName: connection.target.name,
      width: request.width,
      height: request.height,
      createdAt: Date.now()
    });
    this.prunePreparations();
    return {
      id,
      target: "current-page",
      targetName: connection.target.name,
      mode: "free-draw",
      modeName: request.mode === "photo-layers" ? "照片分层" : "高保真自由绘制",
      modeDescription: request.mode === "photo-layers"
        ? "保留完整原图背景，并把照片主体拆成可独立移动的位图图层。"
        : "按原图拆分为文字、容器、图标和图片图层，所有 UI 元素均可编辑。"
    };
  }

  startReconstruction(
    request: MasterGoReconstructionRequest,
    textTransport: TextTransport
  ): MasterGoReconstructionTask {
    const preparation = this.preparations.get(request.preparationId);
    if (!preparation) throw new Error("本次 MasterGo 准备状态已失效，请重新检查后再试。");
    if (preparation.mode !== request.mode) {
      throw new Error("生成类型已发生变化，请重新准备后再开始还原。");
    }
    if (request.target !== "current-page") throw new Error("当前只支持写入 MasterGo 当前打开的页面。");
    if (!request.frameName.trim()) throw new Error("请输入设计稿名称。");
    if (!request.sourcePath.trim()) throw new Error("待还原图片不存在。");
    if (
      preparation.width && request.width
      && (preparation.width !== request.width || preparation.height !== request.height)
    ) {
      throw new Error("图片尺寸已发生变化，请重新检查后再试。");
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const state: TaskState = {
      controller: new AbortController(),
      snapshot: {
        id,
        status: "running",
        stage: "queued",
        progress: 5,
        message: "正在创建还原任务",
        createdAt: now,
        updatedAt: now
      }
    };
    this.tasks.set(id, state);
    this.preparations.delete(preparation.id);
    state.run = this.runReconstruction(state, request, preparation, textTransport);
    void state.run;
    return structuredClone(state.snapshot);
  }

  getTask(id: string): MasterGoReconstructionTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error("MasterGo 还原任务不存在。");
    return structuredClone(task.snapshot);
  }

  async readLayerAsset(pathname: string): Promise<string> {
    if (!/^\.\/asset\/[A-Za-z0-9_-]+\/[^/]+\.png$/u.test(pathname)) {
      throw new Error("分层素材路径无效。");
    }
    const root = path.resolve(this.workspaceDir, ".mastergo", "created");
    const assetPath = path.resolve(root, pathname.slice(2));
    if (!assetPath.startsWith(`${root}${path.sep}`)) throw new Error("分层素材路径无效。");
    return `data:image/png;base64,${(await readFile(assetPath)).toString("base64")}`;
  }

  async readLayerAssetBytes(pathname: string): Promise<Buffer> {
    if (!/^\.\/asset\/[A-Za-z0-9_-]+\/[^/]+\.png$/u.test(pathname)) {
      throw new Error("分层素材路径无效。");
    }
    const root = path.resolve(this.workspaceDir, ".mastergo", "created");
    const assetPath = path.resolve(root, pathname.slice(2));
    if (!assetPath.startsWith(`${root}${path.sep}`)) throw new Error("分层素材路径无效。");
    return readFile(assetPath);
  }

  async renderEditedHtml(taskId: string, html: string): Promise<string> {
    const state = this.tasks.get(taskId);
    const result = state?.snapshot.result;
    if (!state || state.snapshot.status !== "completed" || result?.mode !== "ui" || !result.targetNodeId) {
      throw new Error("该任务没有可更新的 HTML 设计稿。");
    }
    const code = extractMasterGoHtml(html);
    if (code.length < 200 || code.length > 2_000_000) throw new Error("HTML 内容无效。");
    await this.callTool("agent_update_node", {
      targetNodeId: result.targetNodeId,
      code,
      projectDir: this.workspaceDir
    });
    const screenshotResult = await this.callToolResult("get_screenshot", {
      projectDir: this.workspaceDir,
      targetNodeId: result.targetNodeId
    });
    const screenshot = await loadMasterGoScreenshot(screenshotResult, this.workspaceDir);
    state.snapshot = {
      ...state.snapshot,
      updatedAt: new Date().toISOString(),
      result: { ...result, html: code, htmlLength: code.length }
    };
    return `data:${screenshot.mimeType};base64,${screenshot.data}`;
  }

  cancelTask(id: string): MasterGoReconstructionTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error("MasterGo 还原任务不存在。");
    if (task.snapshot.stage === "submitting" || task.snapshot.stage === "rendering") {
      return structuredClone(task.snapshot);
    }
    if (task.snapshot.status === "running") task.controller.abort();
    return structuredClone(task.snapshot);
  }

  private async runReconstruction(
    state: TaskState,
    request: MasterGoReconstructionRequest,
    preparation: PreparationState,
    textTransport: TextTransport
  ): Promise<void> {
    let htmlLength = 0;
    let generatedHtml = "";
    let placeholderNodeId = "";
    let submissionStarted = false;
    let submittedTargetNodeId = "";
    let lastInspectedTargetNodeId = "";
    let agentCompleted = false;
    let agentFailure = "";
    let masterGoPrepared = false;
    let uiAnalysis: MasterGoUiAnalysis | null = null;
    let localAssets: MasterGoLocalAsset[] = [];
    let lastInspectedHtml = "";
    let lastVisualReviewedTargetNodeId = "";
    let revisionCount = 0;
    let photoAnalysisAttempts = 0;
    let analysisRegionCount = 0;
    const evolutionEnabled = request.evolutionEnabled !== false;
    const fauxProvider = registerFauxProvider({
      api: `iterlay-mastergo-${state.snapshot.id}`,
      provider: "iterlay",
      models: [{
        id: "editable-ui-reconstruction",
        name: "Iterlay MasterGo Reconstruction",
        input: ["text", "image"],
        contextWindow: 128_000,
        maxTokens: 32_000
      }],
      tokensPerSecond: 100_000
    });
    this.logPiAgent?.({
      taskId: state.snapshot.id,
      event: "agent_start",
      summary: `开始还原“${request.frameName.trim()}”`,
      details: {
        sourceName: request.sourceName,
        frameName: request.frameName.trim(),
        strategy: request.strategy,
        mode: request.mode,
        evolutionEnabled
      }
    });
    try {
      await access(request.sourcePath);
      this.updateTask(state, "preparing", 10, "正在读取本地图片");
      const imageReadStartedAt = Date.now();
      const actualSize = await this.imageProcessor.getSize(request.sourcePath);
      assertValidCanvasSize(actualSize.width, actualSize.height);
      if (
        request.width && request.height
        && (request.width !== actualSize.width || request.height !== actualSize.height)
      ) {
        throw new Error(
          `图片实际尺寸为 ${actualSize.width}×${actualSize.height}px，与画板记录不一致，请重新打开后再试。`
        );
      }
      const image = await loadImageInput(request.sourcePath);
      let photoForegroundInventory: PhotoForegroundInventoryItem[] = [];
      if (request.mode === "photo-layers") {
        this.updateTask(state, "preparing", 14, "正在预检照片中的显著主体");
        try {
          photoForegroundInventory = await analyzePhotoForegroundInventory(
            textTransport,
            image,
            actualSize,
            state.controller.signal
          );
        } catch (error) {
          this.logPiAgent?.({
            taskId: state.snapshot.id,
            level: "error",
            event: "error",
            summary: "照片主体预检失败，继续由 Pi Agent 分析",
            details: { error: error instanceof Error ? error.message : String(error) }
          });
        }
      }
      this.logPiAgent?.({
        taskId: state.snapshot.id,
        event: "image_ready",
        summary: "本地图片读取完成",
        durationMs: Date.now() - imageReadStartedAt,
        details: {
          byteLength: image.byteLength,
          encodedLength: image.data.length,
          mimeType: image.mimeType,
          width: actualSize.width,
          height: actualSize.height
        }
      });
      const takeReferenceImage = createOneShotReferenceImage(image);
      this.updateTask(state, "planning", 18, "Pi Agent 正在获取 MasterGo 页面规则");
      const tools: AgentTool[] = [
        {
          name: "prepare_mastergo",
          label: "读取 MasterGo 页面规则",
          description: "调用 MasterGo 官方 design_page，读取本次页面协议并创建生成占位。",
          parameters: Type.Object({}),
          executionMode: "sequential",
          execute: async () => {
            this.throwIfAborted(state);
            this.updateTask(state, "planning", 24, "正在通过官方 MCP 读取页面规则");
            const designRules = await this.callTool("design_page", {
              requirement: preparation.requirement,
              projectDir: this.workspaceDir,
              designSource: "free-draw",
              userConfirmedDesignSource: true
            });
            placeholderNodeId = extractMasterGoNodeId(designRules, "placeholderNodeId") ?? "";
            masterGoPrepared = true;
            this.throwIfAborted(state);
            this.updateTask(
              state,
              "analyzing",
              34,
              placeholderNodeId
                ? "已创建生成占位，正在上传参考图片并识别界面"
                : "正在上传参考图片并识别界面"
            );
            return {
              content: [{ type: "text", text: designRules }],
              details: { placeholderNodeId }
            };
          }
        },
        {
          name: "record_ui_analysis",
          label: "记录界面结构并提取素材",
          description: request.mode === "photo-layers"
            ? "记录照片的完整前景清单：完整原图背景，以及每个可独立移动的显著人物、动物、产品、车辆、箱包、花朵或路牌。"
            : "记录 Pi Agent 对参考图的结构化分析；程序仅校验坐标，并按标注裁切照片、插画和品牌图形素材。",
          parameters: Type.Object({
            canvasWidth: Type.Integer({ minimum: 1 }),
            canvasHeight: Type.Integer({ minimum: 1 }),
            regions: Type.Array(Type.Object({
              name: Type.String({ minLength: 1, maxLength: 64 }),
              kind: Type.Union([
                Type.Literal("ui"),
                Type.Literal("text"),
                Type.Literal("image"),
                Type.Literal("logo"),
                Type.Literal("decoration")
              ]),
              x: Type.Integer({ minimum: 0 }),
              y: Type.Integer({ minimum: 0 }),
              width: Type.Integer({ minimum: 1 }),
              height: Type.Integer({ minimum: 1 }),
              handling: Type.Union([Type.Literal("editable"), Type.Literal("local-asset")]),
              backgroundMode: Type.Union([
                Type.Literal("preserve"),
                Type.Literal("remove-connected")
              ]),
              containsEmbeddedUi: Type.Boolean(),
              description: Type.String({ minLength: 1, maxLength: 240 })
            }), { minItems: 1, maxItems: MAX_ANALYSIS_REGIONS })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            this.throwIfAborted(state);
            if (!masterGoPrepared) throw new Error("必须先调用 prepare_mastergo 获取页面协议。");
            if (uiAnalysis) throw new Error("界面分析已经记录，不能重复提取素材。");
            let analysis = validateMasterGoUiAnalysis(args, actualSize);
            if (request.mode === "photo-layers") {
              photoAnalysisAttempts += 1;
              analysis = mergePhotoForegroundInventory(analysis, photoForegroundInventory);
              analysis = mergePhotoLayerSupports(analysis);
              validatePhotoLayerAnalysis(analysis, actualSize);
              const subjectCount = analysis.regions.filter((region) => region.name !== "photo-background").length;
              if (subjectCount === 1 && photoAnalysisAttempts <= 2) {
                throw new Error(
                  "照片中目前只记录了 1 个主体。请按左、中、右三个区域重新逐块查看参考图，重点检查画面边缘被截断的大圆路牌、广告牌，以及人物旁的车辆、箱包、花朵、产品或动物，并再次调用 record_ui_analysis；若两轮复核后确实只有一个主体，第三次可保持单主体结果。"
                );
              }
            }
            this.updateTask(state, "analyzing", 48, "Pi Agent 已识别界面，正在提取原图素材");
            localAssets = await extractMasterGoLocalAssets(
              analysis,
              request.sourcePath,
              this.workspaceDir,
              state.snapshot.id,
              this.imageProcessor,
              request.mode
            );
            uiAnalysis = analysis;
            analysisRegionCount = analysis.regions.length;
            this.updateTask(state, "building", 56, "素材已准备，Pi Agent 正在生成可编辑图层");
            return {
              content: [{
                type: "text",
                text: [
                  `结构分析已记录：画布 ${actualSize.width}×${actualSize.height}px，共 ${analysis.regions.length} 个区域。`,
                  localAssets.length > 0
                    ? `必须在 HTML 中使用以下本地素材：\n${JSON.stringify(localAssets, null, 2)}`
                    : "没有提取本地素材；所有区域都必须使用独立可编辑 HTML 图层重建。",
                  `HTML 根节点必须使用固定尺寸 w-[${actualSize.width}px] h-[${actualSize.height}px]。`,
                  request.mode === "photo-layers"
                    ? "照片分层模式只允许本地图片图层，禁止生成文字、容器或 CSS 图形。"
                    : "普通文字和 UI 控件必须保持独立可编辑，禁止使用随机图片占位。",
                  localAssets.some((asset) => asset.containsEmbeddedUi)
                    ? "警告：部分素材已经烘焙了 UI、文字或图标。HTML 不得再次创建这些可见内容，否则会产生重复图层。"
                    : "所有本地素材均不包含已烘焙 UI，可按区域结构创建独立可编辑控件。"
                ].join("\n\n")
              }],
              details: {
                regionCount: analysis.regions.length,
                localAssetCount: localAssets.length,
                localAssets
              }
            };
          }
        },
        {
          name: "submit_editable_ui",
          label: "提交可编辑 UI",
          description: "提交 Pi Agent 根据图片和 MasterGo 规则生成的完整 HTML。",
          parameters: Type.Object({
            html: Type.String({ minLength: 200 })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            this.throwIfAborted(state);
            if (!uiAnalysis) throw new Error("必须先调用 record_ui_analysis 分析参考图并准备素材。");
            const { html: rawHtml } = args as { html: string };
            const html = extractMasterGoHtml(rawHtml);
            if (request.mode === "photo-layers") {
              validatePhotoLayerAnalysis(uiAnalysis, actualSize);
            }
            validateReconstructionAgainstAnalysis(html, {
              width: actualSize.width,
              height: actualSize.height,
              assetSources: localAssets.map((asset) => asset.src),
              strategy: request.strategy,
              frameName: request.frameName.trim(),
              mode: request.mode
            });
            htmlLength = html.length;
            generatedHtml = html;
            this.updateTask(state, "submitting", 78, "正在通过官方 MCP 写入 MasterGo 画布");
            const result = await this.callTool("submit_page_to_canvas", {
              code: html,
              projectDir: this.workspaceDir,
              saveCodeToLocal: true
            });
            submissionStarted = true;
            submittedTargetNodeId = extractMasterGoNodeId(result) ?? placeholderNodeId;
            this.updateTask(state, "rendering", 86, "MasterGo 已收到页面，Pi Agent 正在核验最终图层");
            return {
              content: [{
                type: "text",
                text: [
                  submittedTargetNodeId ? `本次目标节点 ID：${submittedTargetNodeId}` : "本次提交未解析到目标节点 ID。",
                  "以下是 MasterGo 原始返回，请由 Pi Agent 判断下一步：",
                  result
                ].join("\n\n")
              }],
              details: { htmlLength, submittedTargetNodeId }
            };
          }
        },
        {
          name: "wait_for_mastergo",
          label: "等待 MasterGo",
          description: "等待 MasterGo 后台继续生成。生成未结束时可以多次调用。",
          parameters: Type.Object({
            milliseconds: Type.Optional(Type.Number({ minimum: 500, maximum: PI_AGENT_MAX_WAIT_MS })),
            reason: Type.String({ minLength: 1 })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            this.throwIfAborted(state);
            const waitArgs = args as { milliseconds?: number; reason: string };
            const milliseconds = Math.min(
              PI_AGENT_MAX_WAIT_MS,
              Math.max(500, Math.round(waitArgs.milliseconds ?? 1_500))
            );
            this.updateTask(state, "rendering", 88, "MasterGo 正在生成可编辑图层，Pi Agent 将继续核验");
            await abortableDelay(milliseconds, state.controller.signal);
            return {
              content: [{ type: "text", text: `已等待 ${milliseconds}ms。原因：${waitArgs.reason}` }],
              details: { milliseconds, reason: waitArgs.reason }
            };
          }
        },
        {
          name: "inspect_mastergo_node",
          label: "读取 MasterGo 目标节点",
          description: "读取指定目标节点的实时结构，由 Pi Agent 判断它是否仍是占位或已经成为完整可编辑设计稿。",
          parameters: Type.Object({
            targetNodeId: Type.String({ pattern: "^\\d+:\\d+$" })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            this.throwIfAborted(state);
            const { targetNodeId } = args as { targetNodeId: string };
            if (!submissionStarted) throw new Error("尚未提交页面，不能核验最终节点。");
            if (submittedTargetNodeId && targetNodeId !== submittedTargetNodeId) {
              throw new Error(`必须核验本次提交节点 ${submittedTargetNodeId}。`);
            }
            this.updateTask(state, "rendering", 92, "Pi Agent 正在检查 MasterGo 最终图层");
            const snapshot = await this.callTool("get_selection_node", {
              projectDir: this.workspaceDir,
              targetNodeId,
              syncToBase: false
            });
            const snapshotHtml = await readMasterGoSnapshotHtml(snapshot, this.workspaceDir);
            lastInspectedTargetNodeId = targetNodeId;
            lastInspectedHtml = snapshotHtml ?? "";
            return {
              content: [{
                type: "text",
                text: [
                  `请求核验的目标节点 ID：${targetNodeId}`,
                  "以下是 MasterGo MCP 原始返回：",
                  snapshot,
                  snapshotHtml
                    ? `以下是 MCP 落盘的完整目标节点 HTML，请基于它判断是否完成：\n${snapshotHtml}`
                    : "本次未能读取 MCP 落盘的目标节点 HTML；没有完整结构证据时不得确认完成。"
                ].join("\n\n")
              }],
              details: { targetNodeId, snapshotHtmlLength: snapshotHtml?.length ?? 0 }
            };
          }
        },
        {
          name: "review_mastergo_visual",
          label: "检查 MasterGo 最终视觉",
          description: "导出本次目标节点截图并与原始参考图做视觉比对，检查背景色块、素材接缝、重复 UI、错位、裁切和层级问题。",
          parameters: Type.Object({
            targetNodeId: Type.String({ pattern: "^\\d+:\\d+$" })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            this.throwIfAborted(state);
            const { targetNodeId } = args as { targetNodeId: string };
            if (!submissionStarted || !submittedTargetNodeId) {
              throw new Error("尚未提交页面，不能检查最终视觉。");
            }
            if (
              targetNodeId !== submittedTargetNodeId
              || lastInspectedTargetNodeId !== submittedTargetNodeId
              || !lastInspectedHtml
            ) {
              throw new Error(`视觉检查前必须先读取本次目标节点 ${submittedTargetNodeId} 的完整 HTML。`);
            }
            this.updateTask(state, "rendering", 96, "Pi Agent 正在比对 MasterGo 最终视觉");
            const screenshotResult = await this.callToolResult("get_screenshot", {
              projectDir: this.workspaceDir,
              targetNodeId
            });
            const screenshot = await loadMasterGoScreenshot(screenshotResult, this.workspaceDir);
            lastVisualReviewedTargetNodeId = targetNodeId;
            return {
              content: [
                {
                  type: "text",
                  text: [
                    `本次目标节点 ${targetNodeId} 的最终截图如下。`,
                    "必须与最初参考图片逐区比对。重点检查：素材矩形背景色块、图片边缘接缝、重复文字/按钮/图标、裁切范围、坐标、尺寸和图层重叠。",
                    "若有明显差异，调用 revise_mastergo_node 修正；只有视觉无明显问题时才能确认完成。",
                    masterGoToolText(screenshotResult)
                  ].filter(Boolean).join("\n\n")
                },
                {
                  type: "image",
                  data: screenshot.data,
                  mimeType: screenshot.mimeType
                }
              ],
              details: {
                targetNodeId,
                byteLength: screenshot.byteLength,
                source: screenshot.source
              }
            };
          }
        },
        {
          name: "revise_mastergo_node",
          label: "修正 MasterGo 设计稿",
          description: "根据最终截图检查结果，使用包含 data-node-id 的完整目标节点 HTML 修正视觉问题；修正后必须重新读取结构并截图复检。",
          parameters: Type.Object({
            targetNodeId: Type.String({ pattern: "^\\d+:\\d+$" }),
            code: Type.String({ minLength: 200 }),
            reason: Type.String({ minLength: 1, maxLength: 500 })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            this.throwIfAborted(state);
            const revision = args as { targetNodeId: string; code: string; reason: string };
            if (
              revision.targetNodeId !== submittedTargetNodeId
              || lastVisualReviewedTargetNodeId !== submittedTargetNodeId
            ) {
              throw new Error(`修正前必须完成本次目标节点 ${submittedTargetNodeId} 的视觉检查。`);
            }
            if (revisionCount >= 2) {
              throw new Error("视觉修正已达到 2 次上限；如果仍不准确，请调用 report_failure 返回明确原因。");
            }
            validateMasterGoRevision(revision.code, revision.targetNodeId);
            this.updateTask(state, "rendering", 94, "Pi Agent 正在修正 MasterGo 视觉细节");
            const result = await this.callTool("agent_update_node", {
              targetNodeId: revision.targetNodeId,
              code: revision.code,
              projectDir: this.workspaceDir
            });
            revisionCount += 1;
            lastInspectedTargetNodeId = "";
            lastInspectedHtml = "";
            lastVisualReviewedTargetNodeId = "";
            return {
              content: [{
                type: "text",
                text: [
                  `第 ${revisionCount} 次视觉修正已提交。原因：${revision.reason}`,
                  "必须重新调用 inspect_mastergo_node，再调用 review_mastergo_visual 复检。",
                  result
                ].join("\n\n")
              }],
              details: { targetNodeId: revision.targetNodeId, revisionCount }
            };
          }
        },
        {
          name: "complete_reconstruction",
          label: "确认还原完成",
          description: "仅当 Pi Agent 已核验本次目标节点结构完整，并完成最终截图视觉比对且无明显差异时调用。",
          parameters: Type.Object({
            targetNodeId: Type.String({ pattern: "^\\d+:\\d+$" }),
            evidence: Type.String({ minLength: 1 })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            const completionArgs = args as { targetNodeId: string; evidence: string };
            if (!submissionStarted || !submittedTargetNodeId) {
              throw new Error("MasterGo 尚未返回本次提交的目标节点，不能确认完成。");
            }
            if (
              completionArgs.targetNodeId !== submittedTargetNodeId
              || lastInspectedTargetNodeId !== submittedTargetNodeId
              || lastVisualReviewedTargetNodeId !== submittedTargetNodeId
            ) {
              throw new Error(`确认完成前必须读取本次目标节点 ${submittedTargetNodeId}，并通过最终截图视觉检查。`);
            }
            agentCompleted = true;
            return {
              content: [{ type: "text", text: `Pi Agent 已确认完成：${completionArgs.evidence}` }],
              details: {
                targetNodeId: completionArgs.targetNodeId,
                evidence: completionArgs.evidence
              },
              terminate: true
            };
          }
        },
        {
          name: "report_failure",
          label: "报告无法完成",
          description: "确认 MasterGo 拒绝提交、持续无结果或无法可靠核验时，返回明确失败原因。",
          parameters: Type.Object({
            reason: Type.String({ minLength: 1 })
          }),
          executionMode: "sequential",
          execute: async (_toolCallId, args) => {
            const { reason } = args as { reason: string };
            agentFailure = reason;
            return {
              content: [{ type: "text", text: reason }],
              details: { reason },
              terminate: true
            };
          }
        }
      ];

      const decisionFactory = createPiDecisionFactory(textTransport, {
        takeReferenceImage: () => masterGoPrepared ? takeReferenceImage() : null,
        onModelRequestStart: (modelRequest) => {
          if (modelRequest.includesImage) {
            this.updateTask(state, "analyzing", 38, "Pi Agent 正在识别界面并生成可编辑结构");
          } else if (!masterGoPrepared) {
            this.updateTask(state, "planning", 20, "Pi Agent 正在获取 MasterGo 页面规则");
          }
          this.logPiAgent?.({
            taskId: state.snapshot.id,
            event: "model_start",
            summary: modelRequest.includesImage
              ? `开始第 ${modelRequest.requestNumber} 次模型请求（含一次性参考图片）`
              : `开始第 ${modelRequest.requestNumber} 次模型请求`,
            details: { ...modelRequest }
          });
        },
        onModelRequestEnd: (modelRequest) => {
          this.logPiAgent?.({
            taskId: state.snapshot.id,
            level: modelRequest.ok ? "info" : "error",
            event: "model_end",
            summary: modelRequest.ok
              ? `第 ${modelRequest.requestNumber} 次模型请求完成`
              : `第 ${modelRequest.requestNumber} 次模型请求失败`,
            durationMs: modelRequest.durationMs,
            details: { ...modelRequest }
          });
        }
      });
      fauxProvider.setResponses(
        Array.from({ length: PI_AGENT_MAX_TURNS }, () => decisionFactory)
      );
      const agent = new Agent({
        initialState: {
          systemPrompt: buildPiAgentSystemPrompt(
            request,
            photoForegroundInventory,
            evolutionEnabled ? this.evolutionStore?.getGuidance(request.mode, request.strategy) : undefined
          ),
          model: fauxProvider.getModel(),
          tools,
          thinkingLevel: "off"
        },
        toolExecution: "sequential"
      });
      let turnNumber = 0;
      const toolStartedAt = new Map<string, number>();
      agent.subscribe((event) => {
        const base = { taskId: state.snapshot.id };
        switch (event.type) {
          case "agent_start":
            this.logPiAgent?.({
              ...base,
              event: "agent_start",
              summary: "Pi Agent Loop 已启动"
            });
            break;
          case "turn_start":
            turnNumber += 1;
            this.logPiAgent?.({
              ...base,
              event: "turn_start",
              summary: `开始第 ${turnNumber} 轮判断`,
              details: { turn: turnNumber }
            });
            break;
          case "message_end": {
            const decision = summarizePiAgentDecision(event);
            if (decision) {
              this.logPiAgent?.({
                ...base,
                event: "decision",
                summary: decision,
                details: { turn: turnNumber }
              });
            }
            if (assistantRequestedTool(event, "submit_editable_ui")) {
              this.updateTask(state, "building", 62, "Pi Agent 已完成识别，正在构建可编辑图层");
            }
            break;
          }
          case "tool_execution_start":
            toolStartedAt.set(event.toolCallId, Date.now());
            this.logPiAgent?.({
              ...base,
              event: "tool_start",
              summary: `开始执行 ${event.toolName}`,
              toolName: event.toolName,
              details: {
                toolCallId: event.toolCallId,
                args: event.args
              }
            });
            break;
          case "tool_execution_end": {
            const startedAt = toolStartedAt.get(event.toolCallId);
            toolStartedAt.delete(event.toolCallId);
            this.logPiAgent?.({
              ...base,
              level: event.isError ? "error" : "info",
              event: "tool_end",
              summary: event.isError
                ? `${event.toolName} 执行失败`
                : `${event.toolName} 执行完成`,
              toolName: event.toolName,
              ...(startedAt ? { durationMs: Date.now() - startedAt } : {}),
              details: {
                toolCallId: event.toolCallId,
                result: event.result
              }
            });
            break;
          }
          case "agent_end":
            this.logPiAgent?.({
              ...base,
              event: "agent_end",
              summary: `Pi Agent Loop 已结束，共执行 ${turnNumber} 轮`,
              details: { turns: turnNumber }
            });
            break;
          default:
            break;
        }
      });
      state.controller.signal.addEventListener("abort", () => agent.abort(), { once: true });
      await agent.prompt(
        [
          `把参考图片“${request.sourceName}”还原为 MasterGo 当前页面中的可编辑 UI 设计稿。`,
          `最终设计稿名称：${request.frameName.trim()}。`,
          "第一轮只调用 prepare_mastergo 获取官方协议；参考图片会在协议返回后的下一轮一次性提供。",
          "看到参考图片后先调用 record_ui_analysis 记录结构、素材坐标、去背景方式和素材是否包含已烘焙 UI；收到本地素材 manifest 后再调用 submit_editable_ui。",
          "提交后持续等待并读取本次目标节点，再调用 review_mastergo_visual 对比最终截图；只有结构和视觉都通过后才能调用 complete_reconstruction。"
        ].join("\n")
      );
      this.throwIfAborted(state);
      if (agentFailure) throw new Error(agentFailure);
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
      if (!agentCompleted) {
        throw new Error("Pi Agent 未能确认 MasterGo 最终可编辑图层，任务未标记为完成。");
      }
      this.updateTask(state, "completed", 100, "已在 MasterGo 当前页面创建可编辑设计稿", {
        frameName: request.frameName.trim(),
        targetName: preparation.targetName,
        htmlLength,
        mode: request.mode,
        targetNodeId: submittedTargetNodeId || undefined,
        html: lastInspectedHtml || generatedHtml,
        canvas: { width: actualSize.width, height: actualSize.height },
        layers: localAssets.map((asset, index) => ({
          id: `${asset.name}-${index + 1}`,
          name: asset.name,
          path: asset.src,
          x: asset.x,
          y: asset.y,
          width: asset.width,
          height: asset.height
        }))
      });
      this.logPiAgent?.({
        taskId: state.snapshot.id,
        event: "agent_end",
        summary: "可编辑 UI 设计稿已完成并通过最终图层核验",
        details: {
          frameName: request.frameName.trim(),
          htmlLength,
          targetNodeId: submittedTargetNodeId
        }
      });
      if (evolutionEnabled) {
        this.recordEvolution(state.snapshot.id, {
          mode: request.mode,
          strategy: request.strategy,
          outcome: "completed",
          analysisRegionCount,
          localAssetCount: localAssets.length,
          revisionCount
        });
      }
    } catch (error) {
      if (!submissionStarted && placeholderNodeId) {
        await this.removePlaceholder(placeholderNodeId);
      }
      if (state.controller.signal.aborted) {
        this.updateTask(state, "cancelled", state.snapshot.progress, "任务已取消");
        this.logPiAgent?.({
          taskId: state.snapshot.id,
          level: "warn",
          event: "agent_end",
          summary: "Pi Agent 任务已取消"
        });
      } else {
        const message = normalizeMasterGoError(error, "还原失败，请重试。");
        console.error("[mastergo] reconstruction failed", message);
        this.logPiAgent?.({
          taskId: state.snapshot.id,
          level: "error",
          event: "error",
          summary: message
        });
        this.updateTask(state, "failed", state.snapshot.progress, message, undefined, message);
        if (evolutionEnabled) {
          this.recordEvolution(state.snapshot.id, {
            mode: request.mode,
            strategy: request.strategy,
            outcome: "failed",
            analysisRegionCount,
            localAssetCount: localAssets.length,
            revisionCount,
            failureKind: classifyEvolutionFailure(message)
          });
        }
      }
    } finally {
      fauxProvider.unregister();
    }
  }

  private recordEvolution(taskId: string, outcome: PiAgentEvolutionOutcome): void {
    this.evolutionStore?.record(outcome);
    this.logPiAgent?.({
      taskId,
      event: "decision",
      summary: outcome.outcome === "completed" ? "Pi Agent 已沉淀本次已核验的执行经验" : "Pi Agent 已记录本次未完成任务的规避信号",
      details: { evolution: outcome }
    });
  }

  private async removePlaceholder(targetNodeId: string): Promise<void> {
    await this.callTool("agent_remove_node", { targetNodeId }).catch(() => undefined);
  }

  private async ensureClient(endpoint: string): Promise<void> {
    if (this.client && this.transport && this.endpoint === endpoint) return;
    await this.closeClient();
    const entry = require.resolve("@mastergo/vibe-mcp");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry, `--url=${endpoint}`],
      cwd: this.workspaceDir,
      env: {
        ...stringEnvironment(process.env),
        ELECTRON_RUN_AS_NODE: "1",
        CALL_API_TIMEOUT_MS: "30000"
      },
      stderr: "pipe"
    });
    const client = new Client(
      { name: "iterlay-mastergo", version: this.appVersion },
      { capabilities: {} }
    );
    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    if (!names.has("design_page") || !names.has("submit_page_to_canvas")) {
      await client.close();
      throw new Error("MasterGo 官方 MCP 缺少页面生成工具，请更新 MasterGo。");
    }
    this.client = client;
    this.transport = transport;
    this.endpoint = endpoint;
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.callToolResult(name, args);
    const text = masterGoToolText(result);
    if (!text) throw new Error(`MasterGo MCP 工具 ${name} 未返回文本结果。`);
    return text;
  }

  private async callToolResult(
    name: string,
    args: Record<string, unknown>
  ): Promise<MasterGoToolResult> {
    if (!this.client || !this.endpoint) {
      const connection = await this.getConnection(true);
      if (connection.status !== "connected") throw new Error(connection.message);
    }
    const rawResult = await this.client!.callTool({ name, arguments: args }) as {
      content?: Array<Record<string, unknown>>;
      isError?: boolean;
    };
    const content = (rawResult.content ?? []).flatMap((item): MasterGoToolContent[] => {
      if (item.type === "text" && typeof item.text === "string") {
        return [{ type: "text", text: item.text }];
      }
      if (
        item.type === "image"
        && typeof item.data === "string"
        && typeof item.mimeType === "string"
      ) {
        return [{ type: "image", data: item.data, mimeType: item.mimeType }];
      }
      return [];
    });
    const result: MasterGoToolResult = { content, isError: rawResult.isError };
    const text = masterGoToolText(result);
    if (result.isError || /^❌/u.test(text)) {
      throw new Error(text || `MasterGo MCP 工具 ${name} 执行失败。`);
    }
    if (content.length === 0) throw new Error(`MasterGo MCP 工具 ${name} 未返回结果。`);
    return result;
  }

  private updateTask(
    state: TaskState,
    stage: MasterGoReconstructionStage,
    progress: number,
    message: string,
    result?: MasterGoReconstructionTask["result"],
    error?: string
  ): void {
    const terminal = stage === "completed" || stage === "failed" || stage === "cancelled";
    state.snapshot = {
      ...state.snapshot,
      status: stage === "completed" ? "completed" : stage === "failed" ? "failed" : stage === "cancelled" ? "cancelled" : "running",
      stage,
      progress,
      message,
      updatedAt: new Date().toISOString(),
      ...(result ? { result } : {}),
      ...(error ? { error } : {}),
      ...(!terminal ? { error: undefined, result: undefined } : {})
    };
  }

  private throwIfAborted(state: TaskState): void {
    if (state.controller.signal.aborted) throw new DOMException("任务已取消。", "AbortError");
  }

  private cacheConnection(value: MasterGoConnectionState): MasterGoConnectionState {
    this.connectionCache = { expiresAt: Date.now() + CONNECTION_CACHE_MS, value };
    return value;
  }

  private prunePreparations(): void {
    const oldestAllowed = Date.now() - 10 * 60_000;
    for (const [id, preparation] of this.preparations) {
      if (preparation.createdAt < oldestAllowed) this.preparations.delete(id);
    }
  }

  private async closeClient(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.transport = null;
    this.endpoint = null;
    if (client) await client.close().catch(() => undefined);
  }
}

function summarizePiAgentDecision(event: Extract<AgentEvent, { type: "message_end" }>): string | null {
  const message = event.message;
  if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) return null;
  const toolNames = message.content.flatMap((block) => {
    if (!isRecord(block) || block.type !== "toolCall" || typeof block.name !== "string") return [];
    return [block.name];
  });
  if (toolNames.length > 0) return `Pi Agent 决定调用 ${toolNames.join("、")}`;

  const text = message.content
    .flatMap((block) => {
      if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") return [];
      return [block.text];
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  return text ? `Pi Agent 返回：${text}` : null;
}

function assistantRequestedTool(
  event: Extract<AgentEvent, { type: "message_end" }>,
  toolName: string
): boolean {
  const message = event.message;
  return isRecord(message)
    && message.role === "assistant"
    && Array.isArray(message.content)
    && message.content.some((block) => (
      isRecord(block)
      && block.type === "toolCall"
      && block.name === toolName
    ));
}

export function buildPageRequirement(request: PrepareMasterGoReconstructionRequest): string {
  const size = request.width && request.height ? `，参考尺寸 ${request.width}×${request.height}px` : "";
  if (request.mode === "photo-layers") {
    return [
      `将照片“${request.sourceName}”拆分为名为“${request.frameName}”的独立位图图层${size}。`,
      request.width && request.height
        ? `页面根节点必须严格使用固定尺寸 w-[${request.width}px] h-[${request.height}px]，不得改成其他尺寸或仅使用 min-h。`
        : "页面根节点必须严格沿用参考图片的真实像素尺寸。",
      "保留完整原图作为独立背景图层，并把人物、物体、动物、车辆、产品或装饰拆成可单独移动的本地图片图层；背景不得挖空主体区域。",
      "不要重绘文字、容器、按钮或 CSS UI；这不是 UI 还原任务。"
    ].join("");
  }
  return [
    `将 UI 截图“${request.sourceName}”高保真还原为名为“${request.frameName}”的可编辑页面${size}。`,
    request.width && request.height
      ? `页面根节点必须严格使用固定尺寸 w-[${request.width}px] h-[${request.height}px]，不得改成其他尺寸或仅使用 min-h。`
      : "页面根节点必须严格沿用参考图片的真实像素尺寸。",
    "必须把文字、容器、按钮、图标、图片区域和装饰元素拆分为独立可编辑图层。",
    "照片、插画和品牌图形使用从原图坐标裁切的本地素材；禁止使用随机关键词图片。",
    "不得把原截图作为整页背景或单张图片覆盖；优先保证布局、间距、字号、颜色、圆角和层级关系准确。"
  ].join("");
}

export function validateMasterGoUiAnalysis(
  value: unknown,
  expectedSize: { width: number; height: number }
): MasterGoUiAnalysis {
  assertValidCanvasSize(expectedSize.width, expectedSize.height);
  if (!isRecord(value)) throw new Error("Pi Agent 返回的界面分析不是有效对象。");
  const canvasWidth = value.canvasWidth;
  const canvasHeight = value.canvasHeight;
  if (canvasWidth !== expectedSize.width || canvasHeight !== expectedSize.height) {
    throw new Error(
      `界面分析尺寸必须与原图 ${expectedSize.width}×${expectedSize.height}px 完全一致。`
    );
  }
  if (!Array.isArray(value.regions) || value.regions.length < 1) {
    throw new Error("界面分析至少需要包含一个区域。");
  }
  if (value.regions.length > MAX_ANALYSIS_REGIONS) {
    throw new Error(`界面分析最多支持 ${MAX_ANALYSIS_REGIONS} 个区域。`);
  }

  const validKinds = new Set<MasterGoAnalysisRegionKind>(["ui", "text", "image", "logo", "decoration"]);
  const validHandling = new Set<MasterGoAnalysisRegionHandling>(["editable", "local-asset"]);
  const validBackgroundModes = new Set<MasterGoAssetBackgroundMode>(["preserve", "remove-connected"]);
  const localAssetNames = new Set<string>();
  let localAssetCount = 0;
  const regions = value.regions.map((rawRegion, index): MasterGoAnalysisRegion => {
    if (!isRecord(rawRegion)) throw new Error(`第 ${index + 1} 个区域不是有效对象。`);
    const region = rawRegion as unknown as MasterGoAnalysisRegion;
    if (
      typeof region.name !== "string" || !region.name.trim()
      || typeof region.description !== "string" || !region.description.trim()
      || !validKinds.has(region.kind)
      || !validHandling.has(region.handling)
      || !validBackgroundModes.has(region.backgroundMode)
      || typeof region.containsEmbeddedUi !== "boolean"
    ) {
      throw new Error(`第 ${index + 1} 个区域缺少有效名称、类型、处理方式、背景方式、内嵌 UI 标记或描述。`);
    }
    for (const key of ["x", "y", "width", "height"] as const) {
      if (!Number.isInteger(region[key])) throw new Error(`区域“${region.name}”的 ${key} 必须是整数。`);
    }
    if (
      region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1
      || region.x + region.width > expectedSize.width
      || region.y + region.height > expectedSize.height
    ) {
      throw new Error(`区域“${region.name}”超出原图 ${expectedSize.width}×${expectedSize.height}px 的范围。`);
    }
    if (region.handling === "local-asset") {
      localAssetCount += 1;
      if (localAssetCount > MAX_LOCAL_ASSETS) {
        throw new Error(`本地素材最多支持 ${MAX_LOCAL_ASSETS} 个。`);
      }
      if (region.kind === "text" || region.kind === "ui") {
        throw new Error(`区域“${region.name}”必须保持可编辑，不能裁切为图片素材。`);
      }
    } else if (region.backgroundMode !== "preserve" || region.containsEmbeddedUi) {
      throw new Error(`可编辑区域“${region.name}”不能设置去背景或内嵌 UI。`);
    }
    const name = region.handling === "local-asset"
      ? uniqueLocalAssetSlug(region.name, index, localAssetNames)
      : region.name.trim();
    return {
      name,
      kind: region.kind,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      handling: region.handling,
      backgroundMode: region.backgroundMode,
      containsEmbeddedUi: region.containsEmbeddedUi,
      description: region.description.trim()
    };
  });
  return { canvasWidth, canvasHeight, regions };
}

export async function extractMasterGoLocalAssets(
  analysis: MasterGoUiAnalysis,
  sourcePath: string,
  workspaceDir: string,
  taskId: string,
  imageProcessor: MasterGoImageProcessor,
  reconstructionMode: MasterGoReconstructionMode = "ui"
): Promise<MasterGoLocalAsset[]> {
  // Vibe MCP only applies its created-directory fallback to the documented ./asset/... prefix.
  const assetDirectory = path.join(workspaceDir, ".mastergo", "created", "asset", taskId);
  const assetRegions = analysis.regions.filter((region) => region.handling === "local-asset");
  if (assetRegions.length === 0) return [];
  await rm(assetDirectory, { recursive: true, force: true });
  await mkdir(assetDirectory, { recursive: true });
  const assetsByName = new Map<string, MasterGoLocalAsset>();
  type PhotoSubject = {
    bytes: Buffer;
    name: string;
    description: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const extractRegion = async (
    region: MasterGoAnalysisRegion,
    photoSubjects: readonly PhotoSubject[] = []
  ): Promise<{ asset: MasterGoLocalAsset; subject?: PhotoSubject }> => {
    let bytes: Buffer;
    try {
      const rect = { x: region.x, y: region.y, width: region.width, height: region.height };
      if (reconstructionMode === "photo-layers" && region.name === "photo-background") {
        bytes = imageProcessor.cleanBackground
          ? await imageProcessor.cleanBackground(sourcePath, photoSubjects)
          : await imageProcessor.crop(sourcePath, rect);
      } else {
        const personSubject = reconstructionMode === "photo-layers"
          && /(?:person|people|human|woman|women|man|men|girl|boy|child|人物|人像|女人|男人|女孩|男孩|儿童)/iu
            .test(`${region.name} ${region.description}`);
        const repairSubject = imageProcessor.repairSubject;
        const canRepairWithImageModel = (
          reconstructionMode === "photo-layers"
          && !personSubject
          && Boolean(repairSubject)
          && shouldRepairPhotoSubject(region)
        );
        let localCutoutError: unknown;
        try {
          bytes = await imageProcessor.crop(sourcePath, rect, {
            removeConnectedBackground: region.backgroundMode === "remove-connected",
            segmentationMode: region.backgroundMode === "remove-connected"
              ? reconstructionMode === "photo-layers"
                ? personSubject ? "person-instance" : "foreground-instance"
                : "connected-color"
              : undefined,
            fillSubjectInterior: reconstructionMode === "photo-layers"
              && !personSubject
              && /(?:sign|board|advert|poster|billboard|pole|product|bottle|box|package|device|screen|vase|lamp|vehicle|car|motorcycle|motorbike|bike|scooter|路牌|标牌|广告牌|立柱|产品|瓶|盒|包装|设备|屏幕|花瓶|灯|车辆|汽车|摩托车|自行车)/iu.test(`${region.name} ${region.description}`)
          });
        } catch (error) {
          if (!canRepairWithImageModel) throw error;
          localCutoutError = error;
          bytes = await imageProcessor.crop(sourcePath, rect);
        }
        if (canRepairWithImageModel) {
          try {
            bytes = await repairSubject!(sourcePath, region, bytes, !localCutoutError);
          } catch (error) {
            if (localCutoutError) {
              const localDetail = localCutoutError instanceof Error
                ? localCutoutError.message
                : String(localCutoutError);
              const modelDetail = error instanceof Error ? error.message : String(error);
              throw new Error(`本地分割失败：${localDetail} 图片模型修复也失败：${modelDetail}`);
            }
            console.warn(`图片模型未能完整修复主体“${region.name}”，保留本地分割结果。`, error);
            // Keep the deterministic local cutout when the configured image model is unavailable.
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        reconstructionMode === "photo-layers" && region.backgroundMode === "remove-connected"
          ? `照片主体“${region.name}”无法稳定分割，请扩大裁切范围并让主体位于裁切框中心；人物、路牌、车辆等不同语义主体必须保持独立，不能合并后重试。${detail}`
          : `素材“${region.name}”裁切失败：${detail}`
      );
    }
    if (bytes.byteLength === 0) throw new Error(`素材“${region.name}”裁切失败。`);
    if (bytes.byteLength > MASTERGO_LOCAL_ASSET_MAX_BYTES) {
      throw new Error(`素材“${region.name}”超过 MasterGo 本地图片 5MB 上限，请缩小素材区域。`);
    }
    const fileName = `${region.name}.png`;
    await writeFile(path.join(assetDirectory, fileName), bytes);
    const subject = reconstructionMode === "photo-layers" && region.name !== "photo-background"
      ? {
        bytes,
        name: region.name,
        description: region.description,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height
      }
      : undefined;
    return {
      asset: {
        ...region,
        src: `./asset/${taskId}/${fileName}`
      },
      ...(subject ? { subject } : {})
    };
  };

  if (reconstructionMode === "photo-layers") {
    const subjectRegions = assetRegions.filter((region) => region.name !== "photo-background");
    const subjectResults = await Promise.all(subjectRegions.map((region) => extractRegion(region)));
    const photoSubjects = subjectResults.flatMap((result) => result.subject ? [result.subject] : []);
    const backgroundRegions = assetRegions.filter((region) => region.name === "photo-background");
    const backgroundResults = await Promise.all(
      backgroundRegions.map((region) => extractRegion(region, photoSubjects))
    );
    for (const result of [...subjectResults, ...backgroundResults]) {
      assetsByName.set(result.asset.name, result.asset);
    }
  } else {
    for (const region of assetRegions) {
      const result = await extractRegion(region);
      assetsByName.set(result.asset.name, result.asset);
    }
  }
  return assetRegions.flatMap((region) => {
    const asset = assetsByName.get(region.name);
    return asset ? [asset] : [];
  });
}

function shouldRepairPhotoSubject(region: MasterGoAnalysisRegion): boolean {
  return /(?:sign|board|advert|poster|billboard|product|bottle|box|package|device|screen|vase|lamp|furniture|animal|dog|cat|horse|bird|pet|vehicle|car|motorcycle|motorbike|bike|scooter|路牌|标牌|广告牌|产品|瓶|盒|包装|设备|屏幕|花瓶|灯|家具|动物|狗|猫|马|鸟|宠物|车辆|汽车|摩托车|自行车)/iu
    .test(`${region.name} ${region.description}`);
}

export function validateReconstructionAgainstAnalysis(
  html: string,
  constraints: {
    width: number;
    height: number;
    assetSources: readonly string[];
    strategy: MasterGoReconstructionRequest["strategy"];
    frameName: string;
    mode: MasterGoReconstructionRequest["mode"];
  }
): void {
  const document = parseHtml(html);
  const root = document.querySelector("main");
  if (!root) throw new Error("页面必须包含一个 main 根节点。");
  const classes = new Set((root.getAttribute("class") ?? "").split(/\s+/u).filter(Boolean));
  if (!classes.has(`w-[${constraints.width}px]`) || !classes.has(`h-[${constraints.height}px]`)) {
    throw new Error(
      `页面根节点必须严格使用 w-[${constraints.width}px] h-[${constraints.height}px] 固定尺寸。`
    );
  }
  if (root.getAttribute("data-name") !== constraints.frameName) {
    throw new Error(`页面根节点 data-name 必须为设计稿名称“${constraints.frameName}”。`);
  }
  if (/\{\{[^{}]+\}\}/u.test(html)) {
    const mode = constraints.strategy === "fidelity" ? "高保真" : "易维护";
    throw new Error(`${mode}还原禁止使用随机关键词图片，请使用已提取的本地素材。`);
  }
  const imageSources = new Set(
    document.querySelectorAll("img")
      .map((node) => node.getAttribute("src"))
      .filter((src): src is string => Boolean(src))
  );
  const missingAssets = constraints.assetSources.filter((src) => !imageSources.has(src));
  if (missingAssets.length > 0) {
    throw new Error(`HTML 未使用 Pi Agent 已提取的本地素材：${missingAssets.join("、")}`);
  }
}

export function validatePhotoLayerAnalysis(
  analysis: MasterGoUiAnalysis,
  size: { width: number; height: number }
): void {
  const baseLayers = analysis.regions.filter((region) => (
    region.name === "photo-background"
    && region.handling === "local-asset"
    && region.backgroundMode === "preserve"
    && region.x === 0
    && region.y === 0
    && region.width === size.width
    && region.height === size.height
  ));
  if (baseLayers.length !== 1) {
    throw new Error("照片分层必须包含覆盖整张原图的 photo-background 本地底图。");
  }
  const subjectLayers = analysis.regions.filter((region) => region.name !== "photo-background");
  if (subjectLayers.length < 1 || subjectLayers.length > 6) {
    throw new Error("照片分层必须提取 1～6 个显著主体图层，不能只保留底图或拆出过多背景碎片。");
  }
  for (const region of subjectLayers) {
    const semanticLabel = region.name;
    const isPerson = /(?:person|people|human|woman|women|man|men|girl|boy|child|人物|人像|女人|男人|女孩|男孩|儿童)/iu
      .test(semanticLabel);
    const isSign = /(?:traffic[\s-]?sign|road[\s-]?sign|billboard|advert|poster|signboard|路牌|标牌|广告牌|交通标志)/iu
      .test(semanticLabel);
    if (isPerson && isSign) {
      throw new Error(`照片主体“${region.name}”混合了人物与路牌；两类主体必须分别记录为独立图层。`);
    }
    if (region.handling !== "local-asset" || region.backgroundMode !== "remove-connected") {
      throw new Error(`照片主体“${region.name}”必须使用可去背景的本地图片图层。`);
    }
    if (region.width >= size.width * 0.9) {
      throw new Error(`照片主体“${region.name}”裁切范围过宽；不要提取电线、天空、整条地面等背景结构。`);
    }
  }
}

function assertValidCanvasSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("无法读取参考图片的真实像素尺寸。");
  }
}

function uniqueLocalAssetSlug(
  value: string,
  index: number,
  existing: Set<string>
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || `asset-${index + 1}`;
  let candidate = normalized;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${normalized}-${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
}

async function discoverMasterGoEndpoint(
  preferred: string | null
): Promise<{
  connectedEndpoint: string | null;
  connectedProbe: MasterGoProbeResult | null;
  serviceEndpoint: string | null;
}> {
  const configured = process.env.MASTERGO_VIBE_URL?.trim();
  const urls = [
    configured,
    preferred,
    ...Array.from({ length: DISCOVERY_PORT_COUNT }, (_, index) => `http://127.0.0.1:${DEFAULT_PORT + index}`)
  ].filter((value): value is string => Boolean(value));
  const unique = [...new Set(urls)];
  const results = await Promise.all(unique.map(async (endpoint) => ({
    endpoint,
    probe: await probeMasterGoEndpoint(endpoint)
  })));
  const connected = results.find((result) => result.probe.status === "connected");
  return {
    connectedEndpoint: connected?.endpoint ?? null,
    connectedProbe: connected?.probe ?? null,
    serviceEndpoint: results.find((result) => result.probe.status !== "unavailable")?.endpoint ?? null
  };
}

async function probeMasterGoEndpoint(endpoint: string): Promise<MasterGoProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${endpoint}/api/getVariables`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    const body = await response.text();
    return parseMasterGoProbeResponse(response.ok, body);
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export function parseMasterGoProbeResponse(responseOk: boolean, body: string): MasterGoProbeResult {
  if (/no online mg canvas|no active connection|not connected/iu.test(body)) {
    return { status: "offline-canvas" };
  }
  if (!responseOk) return { status: "unavailable" };

  try {
    const payload = JSON.parse(body) as unknown;
    if (!isRecord(payload)) return { status: "unavailable" };
    if (payload.success === false) {
      const message = typeof payload.message === "string" ? payload.message : "";
      return /no online mg canvas|no active connection|not connected/iu.test(message)
        ? { status: "offline-canvas" }
        : { status: "unavailable" };
    }
    if (payload.success !== true || !isRecord(payload.data)) {
      return { status: "unavailable" };
    }
    const documentName = typeof payload.data.documentName === "string"
      ? payload.data.documentName.trim()
      : "";
    const documentId = typeof payload.data.documentId === "string"
      ? payload.data.documentId.trim()
      : "";
    return {
      status: "connected",
      ...(documentName ? { documentName } : {}),
      ...(documentId ? { documentId } : {})
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function extractMasterGoNodeId(
  result: string,
  preferredKey?: "placeholderNodeId" | "targetNodeId"
): string | null {
  const keys = preferredKey
    ? [preferredKey]
    : ["targetNodeId", "节点 ID", "placeholderNodeId"];
  for (const key of keys) {
    const match = result.match(new RegExp(`${escapeRegExp(key)}\\s*[:：]\\s*(\\d+:\\d+)`, "iu"));
    if (match?.[1]) return match[1];
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("任务已取消。", "AbortError"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("任务已取消。", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface PiReferenceImageInput {
  data: string;
  mimeType: string;
  byteLength: number;
}

async function loadImageInput(sourcePath: string): Promise<PiReferenceImageInput> {
  const bytes = await readFile(sourcePath);
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("图片超过 20MB，请压缩后再试。");
  const mimeType = mimeTypeFromPath(sourcePath);
  return {
    data: bytes.toString("base64"),
    mimeType,
    byteLength: bytes.byteLength
  };
}

async function analyzePhotoForegroundInventory(
  textTransport: TextTransport,
  image: PiReferenceImageInput,
  size: { width: number; height: number },
  signal: AbortSignal
): Promise<PhotoForegroundInventoryItem[]> {
  const raw = await textTransport.complete([{
    role: "system",
    content: [
      "你是照片前景主体盘点器，只负责找出 1～6 个可独立移动的显著前景对象。",
      "必须逐块检查画面左侧、中间和右侧，特别留意贴边或被画面截断的大型路牌、广告牌、车辆、花朵、箱包、产品、动物和人物。",
      "不要记录天空、地面、墙、草地、电线、阴影或纹理。广告牌、路牌等主体的立柱或支架属于主体本身，必须合并进对应主体框，不得单独输出支架层。",
      "只返回 JSON：{\"subjects\":[{\"name\":\"小写英文类别-slug\",\"description\":\"中文描述\",\"x\":0,\"y\":0,\"width\":100,\"height\":100}]}。",
      `坐标基于左上角原点，画布为 ${size.width}×${size.height}px；框必须完整包住对象且不得越界。`
    ].join("\n")
  }, {
    role: "user",
    content: [{
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.data}`, detail: "high" }
    }]
  }], { temperature: 0.1, maxTokens: 4_000 }, signal);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("照片主体预检未返回 JSON。");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { subjects?: unknown };
  if (!Array.isArray(parsed.subjects)) throw new Error("照片主体预检缺少 subjects 数组。");
  const minimumArea = size.width * size.height * 0.005;
  return parsed.subjects.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const subject = value as Record<string, unknown>;
    const x = Math.max(0, Math.round(Number(subject.x)));
    const y = Math.max(0, Math.round(Number(subject.y)));
    const width = Math.min(size.width - x, Math.round(Number(subject.width)));
    const height = Math.min(size.height - y, Math.round(Number(subject.height)));
    if (!Number.isFinite(x + y + width + height) || width < 1 || height < 1 || width * height < minimumArea) {
      return [];
    }
    const rawName = typeof subject.name === "string" ? subject.name : `foreground-object-${index + 1}`;
    const name = (
      rawName.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")
      || `foreground-object-${index + 1}`
    ).slice(0, 64);
    return [{
      name,
      description: typeof subject.description === "string" && subject.description.trim()
        ? subject.description.trim().slice(0, 240)
        : `显著前景对象 ${index + 1}`,
      x,
      y,
      width,
      height
    }];
  }).slice(0, 6);
}

export function mergePhotoForegroundInventory(
  analysis: MasterGoUiAnalysis,
  inventory: readonly PhotoForegroundInventoryItem[]
): MasterGoUiAnalysis {
  const regions = [...analysis.regions];
  const names = new Set(regions.map((region) => region.name));
  for (const item of inventory) {
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    const covered = regions.some((region) => (
      region.name !== "photo-background"
      && centerX >= region.x && centerX <= region.x + region.width
      && centerY >= region.y && centerY <= region.y + region.height
    ));
    if (covered) continue;
    let name = item.name;
    let suffix = 2;
    while (names.has(name)) {
      name = `${item.name}-${suffix}`;
      suffix += 1;
    }
    names.add(name);
    regions.push({
      ...item,
      name,
      kind: "image",
      handling: "local-asset",
      backgroundMode: "remove-connected",
      containsEmbeddedUi: false
    });
  }
  return { ...analysis, regions };
}

export function mergePhotoLayerSupports(analysis: MasterGoUiAnalysis): MasterGoUiAnalysis {
  const supportPattern = /(?:^|[-_ ])(?:pole|post|support|stand)(?:$|[-_ ])|立柱|支架|支撑杆/iu;
  const parentPattern = /sign|board|advert|poster|billboard|display|路牌|标牌|广告牌|展示牌/iu;
  const supports = analysis.regions.filter((region) => (
    region.name !== "photo-background"
    && !region.containsEmbeddedUi
    && supportPattern.test(region.name)
  ));
  if (supports.length === 0) return analysis;
  const parents = analysis.regions.filter((region) => (
    region.name !== "photo-background"
    && !supports.some((support) => support.name === region.name)
    && parentPattern.test(`${region.name} ${region.description}`)
  ));
  const assigned = new Map<string, MasterGoAnalysisRegion[]>();
  for (const support of supports) {
    let best: { parent: MasterGoAnalysisRegion; distance: number } | null = null;
    for (const parent of parents) {
      const horizontalGap = Math.max(
        0,
        Math.max(parent.x, support.x) - Math.min(parent.x + parent.width, support.x + support.width)
      );
      const verticalGap = Math.max(
        0,
        Math.max(parent.y, support.y) - Math.min(parent.y + parent.height, support.y + support.height)
      );
      const closeEnough = horizontalGap <= Math.max(24, parent.width * 0.2)
        && verticalGap <= Math.max(24, parent.height * 0.2);
      if (!closeEnough) continue;
      const distance = horizontalGap * horizontalGap + verticalGap * verticalGap;
      if (!best || distance < best.distance) best = { parent, distance };
    }
    if (!best) continue;
    assigned.set(best.parent.name, [...(assigned.get(best.parent.name) ?? []), support]);
  }
  const consumed = new Set([...assigned.values()].flat().map((support) => support.name));
  const regions = analysis.regions.flatMap((region) => {
    if (consumed.has(region.name)) return [];
    const attachments = assigned.get(region.name);
    if (!attachments?.length) return [region];
    let merged = { ...region };
    for (const support of attachments) {
      const left = Math.min(merged.x, support.x);
      const top = Math.min(merged.y, support.y);
      const right = Math.max(merged.x + merged.width, support.x + support.width);
      const bottom = Math.max(merged.y + merged.height, support.y + support.height);
      merged = {
        ...merged,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        description: `${merged.description}；包含相连的${support.description}`.slice(0, 240)
      };
    }
    return [merged];
  });
  return { ...analysis, regions };
}

export function buildPiAgentSystemPrompt(
  request: MasterGoReconstructionRequest,
  photoForegroundInventory: readonly PhotoForegroundInventoryItem[] = [],
  evolutionGuidance?: string
): string {
  const strategy = request.strategy === "fidelity"
    ? "视觉还原优先：尽可能逐像素匹配原图，同时保持合理图层结构。"
    : "平衡视觉还原与图层可维护性，重复区域使用一致的结构。";
  const expectedSize = request.width && request.height
    ? `参考图片尺寸为 ${request.width}×${request.height}px；最终 main 根节点必须使用 w-[${request.width}px] h-[${request.height}px]。`
    : "最终 main 根节点必须使用工具返回的真实图片宽高作为固定尺寸。";
  return [
    request.mode === "photo-layers"
      ? "你是运行在 Pi Agent Core 中的照片分层 Agent。你负责把参考照片拆分为可独立移动的 MasterGo 位图图层。"
      : "你是运行在 Pi Agent Core 中的 UI 截图逆向重建 Agent。你负责自主选择工具、生成页面并核验 MasterGo 最终结果。",
    `最终 main 根节点必须使用 data-name="${request.frameName.trim()}"，这是 MasterGo 中显示的设计稿名称。`,
    strategy,
    expectedSize,
    evolutionGuidance
      ? `以下是历史任务的自动进化提示，仅作辅助约束；当前参考图和本次 MasterGo 官方协议优先，不能照搬历史设计：${evolutionGuidance}`
      : "",
    request.mode === "photo-layers" && photoForegroundInventory.length > 0
      ? `专用主体预检已找到以下候选，record_ui_analysis 必须逐项覆盖：${JSON.stringify(photoForegroundInventory)}。`
      : "",
    "第一轮不会提供参考图片，你必须只调用 prepare_mastergo，并把它返回的 MasterGo 官方协议作为生成 HTML 的硬约束。",
    request.mode === "photo-layers"
      ? "prepare_mastergo 成功后的下一轮会一次性提供参考图片。你必须调用 record_ui_analysis：先记录覆盖整张图片的 photo-background 本地素材（preserve），再提取 1～6 个可独立移动的显著主体，例如人物、车辆、路牌或产品。photo-background 必须保留完整原图，不得挖空主体区域。所有区域都标为 local-asset，名称是唯一且能明确表达主体类别的小写英文 slug；主体使用 remove-connected，底图使用 preserve。本轮不要提交 HTML。"
      : "prepare_mastergo 成功后的下一轮会一次性提供参考图片。你必须在该轮完整分析画布尺寸、页面结构、区域坐标和素材边界，并调用 record_ui_analysis；本轮不要提交 HTML。图片不会在后续轮次重复提供。",
    request.mode === "photo-layers"
      ? "HTML 必须以 data-name 精确使用最终设计稿名称，并只用 record_ui_analysis 返回的本地图片构成照片图层；不得重绘 UI、文字或 CSS 图形。"
      : "record_ui_analysis 中由你自主判断区域：普通文字和 UI 控件标为 editable；照片、复杂插画和需要视觉一致的品牌图形标为 local-asset。每个区域必须声明 backgroundMode 和 containsEmbeddedUi；Logo 等需要融入页面背景的独立图形使用 remove-connected，照片通常使用 preserve。local-asset 名称必须是唯一的小写英文 slug，坐标必须是原图中的整数像素且不得越界。",
    "record_ui_analysis 返回本地素材 manifest 后，再调用 submit_editable_ui。html 参数必须由你根据结构分析、素材 manifest 和官方协议生成；程序只负责裁切与硬校验，不会代替你分析或生成页面。",
    request.mode === "photo-layers"
      ? "photo-background 必须作为最底层，独立人物、物体、动物、车辆或产品图层按原坐标叠加在其上。"
      : "绝对禁止把整张参考图作为背景或单个 img；页面中的每一段可见文字都要成为独立文本图层。",
    request.mode === "photo-layers"
      ? "逐一盘点画面中所有轮廓明确、面积显著、可独立移动的前景实例，不能只提取最大主体而遗漏与它并列的花朵、箱包、路牌、车辆、产品或动物；画面存在多个此类对象时，每个对象都必须对应独立区域。禁止提取细电线、天空、阴影、纹理、整幅宽度的地面或其他背景结构；广告牌、路牌等主体的立柱或支架必须并入对应主体，不得拆成冗余小层。裁切框中心必须落在目标主体上，并完整包住头发、四肢、鞋和物体边缘，不能裁断轮廓。人物、路牌、产品等语义不同的主体即使接触或裁切框重叠也必须分别记录，程序会按裁切框中心选择目标实例；不要把人物与其旁边的物体合并。人物名称或描述必须明确包含 person、woman、man、girl、boy、人物或人像等类别词。"
      : "UI 素材裁切应紧贴视觉边界，并避免把相邻文字或控件烘焙进图片。",
    "严禁使用 {{英文关键词}} 或任何随机图片占位。照片、插画和品牌图形只能使用 record_ui_analysis 返回的 ./asset/... 本地路径；UI 图标使用 FontAwesome 或可编辑 CSS 图形。",
    "containsEmbeddedUi=true 表示素材像素里已经包含可见文字、按钮、图标或控件；HTML 绝对不得再次生成这些内容。优先重新选择只含照片/插画的干净裁切区域，无法避开时保留素材内视觉并避免重复叠加。",
    "提交后读取 MasterGo 原始返回中的本次目标节点 ID。生成未结束时调用 wait_for_mastergo，然后用 inspect_mastergo_node 读取该节点，可重复多轮。结构完整后必须调用 review_mastergo_visual 获取最终截图。",
    "视觉检查必须与最初参考图逐区对比：禁止素材矩形背景色块、图片边缘接缝、重复文字/按钮/图标、错误裁切、明显错位和不合理重叠。发现问题时调用 revise_mastergo_node，并在修正后重新 inspect 和 review。",
    "只有当读取结果中的根节点 ID 与本次目标节点一致、节点已不再是 AI Generating Page、包含多个独立可编辑子图层，且最终截图无明显视觉问题时，才能调用 complete_reconstruction。",
    "inspect_mastergo_node 必须返回“完整目标节点 HTML”才算具有完成证据；如果只返回文件路径、成功提示或旧节点名称，绝对不得确认完成。",
    "不得因为提交被 accepted、工具调用没有报错、结构完整、读到了旧设计稿或读到了其他选中节点就宣告完成；没有最终截图视觉证据时一律不得完成。",
    "若 MasterGo 明确拒绝、目标节点长期不可读取或无法可靠确认，调用 report_failure，理由必须包含最后一次原始返回的关键信息。",
    "每轮只调用一个工具，等待工具结果后再决定下一步。"
  ].join("\n\n");
}

interface PiModelRequestStart {
  requestNumber: number;
  attempt: number;
  includesImage: boolean;
  imageByteLength: number;
  imageEncodedLength: number;
  messageCount: number;
}

interface PiModelRequestEnd extends PiModelRequestStart {
  ok: boolean;
  durationMs: number;
  responseLength?: number;
  error?: string;
}

interface PiDecisionFactoryOptions {
  takeReferenceImage?: () => PiReferenceImageInput | null;
  onModelRequestStart?: (request: PiModelRequestStart) => void;
  onModelRequestEnd?: (request: PiModelRequestEnd) => void;
  terminalToolNames?: string[];
}

export function createPiDecisionFactory(
  textTransport: TextTransport,
  factoryOptions: PiDecisionFactoryOptions = {}
): FauxResponseFactory {
  let modelRequestNumber = 0;
  return async (context, streamOptions) => {
    const allowedToolNames = new Set((context.tools ?? []).map((tool) => tool.name));
    const messages = convertPiContextToCompletionMessages(context, factoryOptions.terminalToolNames);
    let latestError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const referenceImage = attempt === 0
        ? factoryOptions.takeReferenceImage?.() ?? null
        : null;
      const messagesWithReference = appendReferenceImageToDecisionMessages(messages, referenceImage);
      const attemptMessages = attempt === 0
        ? messagesWithReference
        : [
            ...messagesWithReference,
            {
              role: "user",
              content: [
                "上一条响应无法解析为 Pi 工具决策。",
                latestError instanceof Error ? latestError.message : String(latestError),
                "请严格只返回一个 JSON 对象：",
                "{\"text\":\"简短说明\",\"toolCalls\":[{\"name\":\"工具名\",\"arguments\":{}}]}"
              ].join("\n")
            }
          ];
      const requestNumber = ++modelRequestNumber;
      const startedAt = Date.now();
      const requestDetails: PiModelRequestStart = {
        requestNumber,
        attempt: attempt + 1,
        includesImage: Boolean(referenceImage),
        imageByteLength: referenceImage?.byteLength ?? 0,
        imageEncodedLength: referenceImage?.data.length ?? 0,
        messageCount: attemptMessages.length
      };
      factoryOptions.onModelRequestStart?.(requestDetails);
      let raw: string;
      try {
        raw = await textTransport.complete(
          attemptMessages,
          { temperature: 0.1, maxTokens: 16_000 },
          streamOptions?.signal
        );
        factoryOptions.onModelRequestEnd?.({
          ...requestDetails,
          ok: true,
          durationMs: Date.now() - startedAt,
          responseLength: raw.length
        });
      } catch (error) {
        factoryOptions.onModelRequestEnd?.({
          ...requestDetails,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
      try {
        const decision = parsePiAgentDecision(raw, allowedToolNames);
        const content: FauxContentBlock[] = [];
        if (decision.text) content.push(fauxText(decision.text));
        content.push(...decision.toolCalls.map((toolCall) => (
          fauxToolCall(toolCall.name, toolCall.arguments)
        )));
        return fauxAssistantMessage(content, {
          stopReason: decision.toolCalls.length > 0 ? "toolUse" : "stop"
        });
      } catch (error) {
        latestError = error;
      }
    }
    throw latestError instanceof Error
      ? latestError
      : new Error("Pi Agent 未返回可执行决策。");
  };
}

export function createOneShotReferenceImage(
  image: PiReferenceImageInput
): () => PiReferenceImageInput | null {
  let pending: PiReferenceImageInput | null = image;
  return () => {
    const current = pending;
    pending = null;
    return current;
  };
}

export function appendReferenceImageToDecisionMessages(
  messages: readonly unknown[],
  image: PiReferenceImageInput | null
): unknown[] {
  if (!image) return [...messages];
  return [
    ...messages,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "这是本次唯一一次提供参考图片。",
            "请完整分析画布尺寸、页面结构、区域坐标和素材边界，并在本轮调用 record_ui_analysis。",
            "本轮不要提交 HTML；下一轮根据工具返回的结构和本地素材 manifest 生成页面。"
          ].join("\n")
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${image.data}`,
            detail: "high"
          }
        }
      ]
    }
  ];
}

function masterGoToolText(result: MasterGoToolResult): string {
  return result.content
    .filter((item): item is Extract<MasterGoToolContent, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

interface MasterGoScreenshot {
  data: string;
  mimeType: string;
  byteLength: number;
  source: "mcp-image" | "saved-file";
}

async function loadMasterGoScreenshot(
  result: MasterGoToolResult,
  workspaceDir: string
): Promise<MasterGoScreenshot> {
  const directImage = result.content.find(
    (item): item is Extract<MasterGoToolContent, { type: "image" }> => item.type === "image"
  );
  if (directImage) {
    return {
      data: directImage.data,
      mimeType: directImage.mimeType,
      byteLength: Buffer.byteLength(directImage.data, "base64"),
      source: "mcp-image"
    };
  }

  const screenshotPath = extractMasterGoScreenshotPath(masterGoToolText(result));
  if (!screenshotPath) throw new Error("MasterGo 未返回最终截图或可读取的截图路径。");
  const allowedRoot = `${path.resolve(workspaceDir, ".mastergo")}${path.sep}`;
  const resolvedPath = path.resolve(screenshotPath);
  if (!resolvedPath.startsWith(allowedRoot)) {
    throw new Error("MasterGo 返回了工作区以外的截图路径，已阻止读取。");
  }
  const bytes = await readFile(resolvedPath);
  if (bytes.byteLength === 0) throw new Error("MasterGo 最终截图为空。");
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("MasterGo 最终截图超过 20MB，无法进行视觉检查。");
  return {
    data: bytes.toString("base64"),
    mimeType: mimeTypeFromPath(resolvedPath),
    byteLength: bytes.byteLength,
    source: "saved-file"
  };
}

export function extractMasterGoScreenshotPath(toolResult: string): string | null {
  const match = toolResult.match(
    /(?:^|\n)-\s*\[\d+:\d+\]\s+(.+?\.(?:png|jpe?g|webp))(?=，|,|\s*$)/iu
  );
  return match?.[1]?.trim() ?? null;
}

export function validateMasterGoRevision(code: string, targetNodeId: string): void {
  const normalized = code.trim();
  if (!normalized) throw new Error("修正代码不能为空。");
  if (!new RegExp(`data-node-id=["']${escapeRegExp(targetNodeId)}["']`, "u").test(normalized)) {
    throw new Error(`修正代码必须包含本次目标根节点 data-node-id="${targetNodeId}"。`);
  }
  const document = parseHtml(normalized);
  if (document.querySelector("script, iframe, object, embed")) {
    throw new Error("修正代码包含 MasterGo 不支持的节点。");
  }
  if (/data:image\//iu.test(normalized) || /\{\{[^{}]+\}\}/u.test(normalized)) {
    throw new Error("修正代码不能使用 Base64 图片或随机关键词图片。");
  }
}

async function readMasterGoSnapshotHtml(
  toolResult: string,
  workspaceDir: string
): Promise<string | null> {
  const match = toolResult.match(/(?:文件|file)\s*[:：]\s*([^\r\n]+?\.html)\s*(?:\r?\n|$)/iu);
  const reportedPath = match?.[1]?.trim();
  if (!reportedPath) return null;

  const allowedRoot = `${path.resolve(workspaceDir, ".mastergo")}${path.sep}`;
  const snapshotPath = path.resolve(reportedPath);
  if (!snapshotPath.startsWith(allowedRoot)) {
    throw new Error("MasterGo 返回了工作区以外的节点快照路径，已阻止读取。");
  }
  const html = await readFile(snapshotPath, "utf8");
  if (!html.trim()) throw new Error("MasterGo 节点快照为空。");
  if (html.length > 2_000_000) throw new Error("MasterGo 节点快照过大，无法交给 Pi Agent 核验。");
  return html;
}

export function extractMasterGoHtml(raw: string): string {
  const fenced = [...raw.matchAll(/```(?:html)?\s*([\s\S]*?)```/giu)]
    .map((match) => match[1]?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));
  const candidates = [...fenced, raw];
  const mainNodes = candidates.flatMap((candidate) => {
    const root = parseHtml(candidate, { comment: false });
    return root.querySelectorAll("main")
      .filter((main) => !main.querySelector("main"))
      .map((main) => main.outerHTML.trim());
  });
  if (mainNodes.length === 0) {
    throw new Error("AI 未能生成符合 MasterGo 协议的页面结构，请重试。");
  }

  let latestError: Error | null = null;
  for (const html of mainNodes.reverse()) {
    try {
      validateMasterGoHtml(html);
      return html;
    } catch (error) {
      latestError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw latestError ?? new Error("AI 未能生成符合 MasterGo 协议的页面结构，请重试。");
}

function validateMasterGoHtml(html: string): void {
  if (html.length < 200) throw new Error("生成的可编辑页面结构不完整，请重试。");
  if (html.length > 2_000_000) throw new Error("生成的页面结构过大，请简化图片后重试。");
  if ((html.match(/<main\b/giu) ?? []).length !== 1) {
    throw new Error("生成结果包含嵌套页面根节点，请重试。");
  }
  if (/<(?:script|iframe|object|canvas)\b/iu.test(html)) {
    throw new Error("生成结果包含 MasterGo 不支持的节点，请重试。");
  }
  if (!/data-name\s*=/iu.test(html)) {
    throw new Error("生成结果缺少可编辑图层名称，请重试。");
  }
  if (
    /所有\s*DOM\s*节点|未使用原生表单|渐变按钮使用\s*CSS|布局与语法红线|MasterGo\s*协议编译器/iu.test(html)
  ) {
    throw new Error("生成结果混入了 MasterGo 协议说明，已阻止提交，请重试。");
  }
}

function mimeTypeFromPath(sourcePath: string): string {
  switch (path.extname(sourcePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

function stringEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

export function normalizeMasterGoError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/未找到 API 终结点|活跃连接|no online mg canvas|ECONNREFUSED|请求超时|MCP server 是否可达/iu.test(message)) {
    return "MasterGo 连接已中断。请确认客户端和目标文件仍保持打开，然后重新检查。";
  }
  if (/文本 Provider|API Key|模型|余额|Credit/iu.test(message)) return message;
  return message || fallback;
}

function classifyEvolutionFailure(message: string): PiAgentEvolutionOutcome["failureKind"] {
  if (/连接|MCP|客户端|目标文件|ECONNREFUSED|超时/iu.test(message)) return "connection";
  if (/视觉|截图|错位|重叠|裁切|素材矩形|接缝/iu.test(message)) return "visual";
  if (/校验|结构|素材路径|根节点|HTML|图层/iu.test(message)) return "validation";
  return "other";
}
