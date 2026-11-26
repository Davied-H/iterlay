import { toast } from "sonner";
import { translateSourceText } from "@/i18n/ui-text";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, missingImageWorkbenchMessage } from "@/lib/image-workbench-api";
import { resolveVideoGenerationImageInputs } from "@/components/canvas/video-generation-image-inputs";
import { VIDEO_MAX_REFERENCE_IMAGES, type VideoReferenceInput } from "@/components/canvas/video-node-model";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import { GENERATION_OUTPUT_HORIZONTAL_GAP } from "@shared/generation-output-layout";
import { pendingVideoJobId, reconcileVideoGenerationPlaceholder } from "@shared/video-generation-placeholder";
import { isBoardVideoNode, isBoardVideoGenerationNode, type BoardVideoNode, type BoardVideoGenerationNode, type VideoGenerationJob, type VideoGenerationInput, type VideoProviderConfig, type BoardDetail } from "@shared/types";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { ImageWorkbenchApi } from "@shared/workbench-client";
import type { ActiveBoard, CanvasLayoutState, CanvasPersistedNode } from "@/features/boards/types";
import type { BoardDetailCache } from "@/lib/board-detail-cache";
import type { GenerationConfirmationRequest } from "./confirmation";
import { findVideoProviderModelOption } from "@shared/video-provider-models";
import { videoCostEstimate } from "@/components/canvas/video-generation-presentation";

export function isTerminalVideoJob(job: VideoGenerationJob): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

/** 编辑会话默认跟随原图尺寸；原图尺寸不满足生成约束时返回 null（保持现值）。 */
interface VideoGenerationOptions {
  activeBoardRef: RefObject<ActiveBoard | null>;
  getWorkbenchApi: () => ImageWorkbenchApi | null;
  videoProviders: VideoProviderConfig[];
  activeVideoProviderId: string;
  updateWorkflowNode: (id: string, patch: Partial<CanvasPersistedNode>) => void;
  paidSubmissionInFlightRef: RefObject<Set<string>>;
  requestGenerationConfirmation: (request: GenerationConfirmationRequest) => Promise<boolean>;
  workflowNodesRef: RefObject<CanvasPersistedNode[]>;
  canvasStateRef: RefObject<CanvasLayoutState>;
  setWorkflowNodes: Dispatch<SetStateAction<CanvasPersistedNode[]>>;
  setCanvasConnectionsVersion: Dispatch<SetStateAction<number>>;
  scheduleBoardSave: () => void;
  flushBoardSave: () => Promise<void>;
  videoPollingStoppedRef: RefObject<Set<string>>;
  refreshHistory: () => Promise<void>;
  boardDetailCacheRef: RefObject<BoardDetailCache<BoardDetail | null>>;
  openBoard: (id: string, focus?: undefined, options?: { forceReload?: boolean }) => Promise<void>;
  notifyVideoJob: (job: VideoGenerationJob) => void;
}

export function createVideoGenerationController({ activeBoardRef, getWorkbenchApi, videoProviders, activeVideoProviderId, updateWorkflowNode, paidSubmissionInFlightRef, requestGenerationConfirmation, workflowNodesRef, canvasStateRef, setWorkflowNodes, setCanvasConnectionsVersion, scheduleBoardSave, flushBoardSave, videoPollingStoppedRef, refreshHistory, boardDetailCacheRef, openBoard, notifyVideoJob }: VideoGenerationOptions) {
  async function runVideoGenerationNode(
    node: BoardVideoGenerationNode,
    resolved: {
      prompt: string;
      images: GeneratedImage[];
      sourceNodeIds: string[];
      versionConflicts?: string[];
      startFrame?: GeneratedImage;
      endFrame?: GeneratedImage;
      referenceImages: GeneratedImage[];
      referenceVideos: VideoReferenceInput[];
      requiresFirstLastFrame: boolean;
    }
  ): Promise<void> {
    if ((resolved.versionConflicts?.length ?? 0) > 0) {
      toast.error(translateSourceText("固定版本冲突：{{ui:0}}", [resolved.versionConflicts![0]]));
      return;
    }
    const boardId = activeBoardRef.current?.id;
    if (!boardId) {
      toast.error(translateSourceText("请先打开一个画板。"));
      return;
    }
    const api = getWorkbenchApi();
    if (!api) {
      toast.error(missingImageWorkbenchMessage);
      return;
    }
    const prompt = resolved.prompt.trim();
    if (resolved.referenceImages.length > VIDEO_MAX_REFERENCE_IMAGES) {
      toast.error(translateSourceText("当前模型最多接收 {{ui:0}} 张参考图，请先移除多余连接。", [VIDEO_MAX_REFERENCE_IMAGES]));
      return;
    }
    if (!prompt && resolved.images.length === 0 && resolved.referenceVideos.length === 0 && !node.sourceVideoPath) {
      toast.error(translateSourceText("请填写运动描述，或连接图片/视频参考。"));
      return;
    }
    const selectedVideoProvider = videoProviders.find((provider) => provider.id === (node.providerId || activeVideoProviderId));
    if (!selectedVideoProvider) {
      const message = "当前视频服务已被删除，请重新选择模型。";
      updateWorkflowNode(node.id, { status: "failed", error: message });
      toast.error(message);
      return;
    }

    if (resolved.requiresFirstLastFrame && (!resolved.startFrame || !resolved.endFrame)) {
      toast.error(translateSourceText("请先分别采用首帧和尾帧，并保持固定版本连接。"));
      return;
    }
    if (paidSubmissionInFlightRef.current.has(node.id)) return;
    const metadata: Partial<VideoGenerationInput> = {};
    const estimate = videoCostEstimate(findVideoProviderModelOption(selectedVideoProvider.modelOptions, node.model?.trim() || selectedVideoProvider.model), node.duration ?? 5);
    const videoCostLabel = estimate ?? "费用未知，由服务商结算";
    const confirmed = await requestGenerationConfirmation({
      title: "确认生成视频",
      providerLabel: selectedVideoProvider.name,
      model: node.model?.trim() || selectedVideoProvider.model,
      totalCostLabel: videoCostLabel,
      items: [{
        id: node.id,
        label: node.title || "片段视频",
        task: `${node.duration ?? 5} 秒 · ${node.resolution || "720p"} · ${node.aspectRatio || "16:9"} · ${node.generateAudio ? "生成声音" : "无生成声音"}`,
        costLabel: videoCostLabel,
        quoteId: metadata.quoteId,
        quoteExpiresAt: metadata.quoteExpiresAt
      }],
      costNote: estimate ? "根据模型目录的每秒单价估算，参考素材等附加费用不包含在内，最终以服务商账单为准。" : "服务商未提供可计算的价格，提交后可能产生费用，请以服务商账单为准。",
      confirmLabel: "确认并生成视频"
    });
    if (!confirmed || activeBoardRef.current?.id !== boardId) return;
    if (paidSubmissionInFlightRef.current.has(node.id)) return;
    paidSubmissionInFlightRef.current.add(node.id);
    const pendingJobId = pendingVideoJobId(node.id);
    const pendingOutputId = `video-output-${pendingJobId}`;
    let submittedJobId = pendingJobId;
    updateWorkflowNode(node.id, { status: "submitting", lastGenerationId: undefined, error: undefined });
    const syncPlaceholder = (
      job: Pick<VideoGenerationJob, "id" | "status" | "outputVideoPath" | "outputPosterPath" | "error">
    ): void => {
      if (node.mode === "remix" || activeBoardRef.current?.id !== boardId) return;
      const placeholderId = `video-output-${job.id}`;
      const reconciled = reconcileVideoGenerationPlaceholder(
        workflowNodesRef.current, canvasStateRef.current.connections, node.id, job.id
      );
      const current = reconciled.nodes as CanvasPersistedNode[];
      canvasStateRef.current.connections = reconciled.connections;
      const existing = current.find((candidate): candidate is BoardVideoNode => (
        (candidate.id === placeholderId || candidate.id === pendingOutputId) && isBoardVideoNode(candidate)
      ));
      const placeholder: BoardVideoNode = {
        ...existing,
        id: placeholderId,
        type: "video",
        title: "视频结果",
        videoPath: job.outputVideoPath ?? existing?.videoPath ?? "",
        posterPath: job.outputPosterPath ?? existing?.posterPath,
        jobId: job.id,
        source: "generated",
        generationNodeId: node.id,
        aspectRatio: existing?.aspectRatio ?? node.aspectRatio ?? "16:9",
        status: job.status,
        error: job.error,
        x: existing?.x ?? node.x + Math.max(1, node.displayWidth ?? 340)
          + GENERATION_OUTPUT_HORIZONTAL_GAP,
        y: existing?.y ?? node.y
      };
      const next = existing
        ? current.map((candidate) => candidate.id === existing.id ? placeholder : candidate)
        : [...current, placeholder];
      workflowNodesRef.current = next;
      setWorkflowNodes(next);
      const existingConnection = canvasStateRef.current.connections.find((connection) => (
        connection.source === node.id
        && (connection.target === placeholderId || connection.target === pendingOutputId)
      ));
      if (existingConnection) {
        canvasStateRef.current.connections = canvasStateRef.current.connections.map((connection) => (
          connection.id === existingConnection.id
            ? {
                ...connection,
                target: placeholderId,
                sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
                targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
                routing: { mode: "auto", kind: "curved", waypoints: [] }
              }
            : connection
        ));
        setCanvasConnectionsVersion((value) => value + 1);
      } else {
        canvasStateRef.current.connections = [...canvasStateRef.current.connections, {
          id: crypto.randomUUID(), source: node.id, target: placeholderId,
          sourceHandle: "source-right", targetHandle: "target-left", kind: "visual", label: "生成结果",
          sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
          targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
          routing: { mode: "auto", kind: "curved", waypoints: [] }
        }];
        setCanvasConnectionsVersion((value) => value + 1);
      }
      scheduleBoardSave();
    };
      const segmentNode = workflowNodesRef.current.find((candidate) => resolved.sourceNodeIds.includes(candidate.id) && candidate.type === "comic-segment-script");
      const comicDramaContextSnapshot = resolved.requiresFirstLastFrame && segmentNode?.type === "comic-segment-script" && resolved.startFrame && resolved.endFrame ? {
        segmentNodeId: segmentNode.id,
        segmentScriptVersionId: segmentNode.activeVersionId,
        characterVersions: canvasStateRef.current.connections.flatMap((connection) => {
          if (connection.kind !== "reference" || connection.target !== segmentNode.id) return [];
          const source = workflowNodesRef.current.find((candidate) => candidate.id === connection.source);
          if (!source || source.type !== "comic-character") return [];
          return [{ nodeId: source.id, versionId: connection.versionBinding?.mode === "pinned" ? connection.versionBinding.versionId : source.activeVersionId }];
        }),
        sharedVisualVersions: [],
        adoptedFirstFrame: { nodeId: resolved.startFrame.id, versionId: resolved.startFrame.jobId },
        adoptedLastFrame: { nodeId: resolved.endFrame.id, versionId: resolved.endFrame.jobId }
      } : undefined;
    syncPlaceholder({
      id: pendingJobId,
      status: "submitting",
      outputVideoPath: undefined,
      outputPosterPath: undefined,
      error: undefined
    });
    try {
      await flushBoardSave();
      const imageInputs = resolveVideoGenerationImageInputs(
        selectedVideoProvider.type === "official",
        resolved.startFrame,
        resolved.endFrame,
        resolved.referenceImages
      );
      const input: VideoGenerationInput = {
        mode: node.mode ?? "generate",
        prompt,
        model: node.model?.trim() || selectedVideoProvider.model,
        aspectRatio: node.aspectRatio || "16:9",
        resolution: node.resolution || "720p",
        durationSeconds: node.duration ?? 5,
        referenceImagePaths: imageInputs.referenceImagePaths,
        referenceVideoPaths: Array.from(new Set([
          ...(node.referenceVideoPaths ?? []),
          ...resolved.referenceVideos.map((video) => video.path)
        ].filter(Boolean))),
        referenceAudioPaths: node.referenceAudioPaths ?? [],
        requireFirstLastFrameCapability: resolved.requiresFirstLastFrame,
        comicDramaContextSnapshot,
        sourceVideoPath: node.sourceVideoPath,
        targetVideoNodeId: node.targetVideoNodeId,
        firstFramePath: imageInputs.firstFramePath,
        lastFramePath: imageInputs.lastFramePath,
        generateAudio: node.generateAudio ?? false,
        watermark: node.watermark ?? false,
        providerId: node.providerId,
        boardId,
        generationNodeId: node.id,
        ...metadata
      };
      let job = await api.startVideoGeneration(input);
      submittedJobId = job.id;
      videoPollingStoppedRef.current.delete(job.id);
      if (activeBoardRef.current?.id === boardId) {
        updateWorkflowNode(node.id, {
          status: job.status,
          lastGenerationId: job.id,
          error: job.error,
          ...(job.input.prompt !== prompt ? { prompt: job.input.prompt } : {})
        });
        syncPlaceholder(job);
      }
      void refreshHistory();
      for (let attempt = 0; attempt < 300 && !isTerminalVideoJob(job) && !videoPollingStoppedRef.current.has(job.id); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        let latest: VideoGenerationJob | null;
        try {
          latest = await api.getVideoJob(job.id);
          if (!latest) throw new Error("暂时无法读取任务状态");
        } catch {
          if (videoPollingStoppedRef.current.has(job.id)) break;
          if (activeBoardRef.current?.id === boardId) updateWorkflowNode(node.id, {
            status: "recovering", lastGenerationId: job.id,
            error: "连接暂时中断，正在重新查询原任务，请勿重复提交。"
          });
          syncPlaceholder({ ...job, status: "recovering", error: "正在恢复任务查询" });
          continue;
        }
        if (videoPollingStoppedRef.current.has(job.id)) break;
        job = latest;
        if (activeBoardRef.current?.id === boardId) {
          updateWorkflowNode(node.id, {
            status: job.status,
            error: job.error,
            lastGenerationId: job.id
          });
          syncPlaceholder(job);
        }
      }
      if (job.status === "completed") {
        boardDetailCacheRef.current.delete(boardId);
        if (activeBoardRef.current?.id === boardId) await openBoard(boardId, undefined, { forceReload: true });
        notifyVideoJob(job);
      } else if (job.status === "failed") {
        notifyVideoJob(job);
      }
      void refreshHistory();
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "视频生成失败。");
      const status = submittedJobId === pendingJobId ? "failed" : "recovering";
      if (activeBoardRef.current?.id === boardId) updateWorkflowNode(node.id, { status, error: message });
      syncPlaceholder({
        id: submittedJobId,
        status,
        outputVideoPath: undefined,
        outputPosterPath: undefined,
        error: message
      });
      toast.error(message);
    } finally {
      paidSubmissionInFlightRef.current.delete(node.id);

    }
  }

  async function stopVideoPolling(nodeId: string): Promise<void> {
    const boardId = activeBoardRef.current?.id;
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoGenerationNode => candidate.id === nodeId && isBoardVideoGenerationNode(candidate)
    );
    if (!node?.lastGenerationId) return;
    try {
      videoPollingStoppedRef.current.add(node.lastGenerationId);
      await getImageWorkbenchApi().stopVideoPolling(node.lastGenerationId);
      if (activeBoardRef.current?.id === boardId) updateWorkflowNode(nodeId, {
        status: "polling_stopped",
        error: "仅停止本地等待，远端任务可能继续运行并产生费用。"
      });
      toast.info(translateSourceText("已停止本地等待，远端任务可能仍在运行"));
    } catch (error) {
      videoPollingStoppedRef.current.delete(node.lastGenerationId);
      toast.error(getWorkbenchErrorMessage(error, "停止本地等待失败。"));
    }
  }

  async function resumeVideoPolling(nodeId: string): Promise<void> {
    const node = workflowNodesRef.current.find(
      (candidate): candidate is BoardVideoGenerationNode => candidate.id === nodeId && isBoardVideoGenerationNode(candidate)
    );
    const boardId = activeBoardRef.current?.id;
    if (!node?.lastGenerationId || !boardId) return;
    try {
      const api = getWorkbenchApi();
      if (!api) throw new Error(missingImageWorkbenchMessage);
      videoPollingStoppedRef.current.delete(node.lastGenerationId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const recovered = await api.recoverVideoGenerations();
      let job = recovered.find((candidate) => candidate.id === node.lastGenerationId)
        ?? await api.getVideoJob(node.lastGenerationId);
      if (!job) throw new Error("视频任务已不存在。");
      if (activeBoardRef.current?.id === boardId) updateWorkflowNode(nodeId, { status: job.status, error: undefined });
      for (let attempt = 0; attempt < 300 && !isTerminalVideoJob(job) && !videoPollingStoppedRef.current.has(job.id); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const latest = await api.getVideoJob(job.id);
        if (!latest) break;
        job = latest;
        if (activeBoardRef.current?.id === boardId) updateWorkflowNode(nodeId, { status: job.status, error: job.error });
      }
      if (job.status === "completed") {
        boardDetailCacheRef.current.delete(boardId);
        if (activeBoardRef.current?.id === boardId) await openBoard(boardId, undefined, { forceReload: true });
        notifyVideoJob(job);
      } else if (job.status === "failed") {
        notifyVideoJob(job);
      }
    } catch (error) {
      if (activeBoardRef.current?.id === boardId) updateWorkflowNode(nodeId, { status: "polling_stopped" });
      toast.error(getWorkbenchErrorMessage(error, "恢复本地等待失败。"));
    }
  }

  // ---------- 图片编辑会话 ----------

  return { runVideoGenerationNode, stopVideoPolling, resumeVideoPolling };
}
