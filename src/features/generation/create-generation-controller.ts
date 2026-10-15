import { translateSourceText } from "@/i18n/ui-text";

import { getPendingEditCount, type GeneratedImage, type ImageVersion } from "@/components/canvas/image-node-model";

import { type ParticleBurstTrigger } from "@/components/canvas/ParticleBurst";

import { iterlayToast } from "@/components/ui/iterlay-toast";

import type { ActiveBoardGeneration } from "@/lib/active-board-generation";

import { BoardDetailCache } from "@/lib/board-detail-cache";

import { createMissingGenerationOutputConnections } from "@/lib/generation-output-connections";
import { centerGenerationOutputs, removeGeneratedPlaceholders, settleGeneratedPlaceholders } from "@/lib/generation-placeholders";
import { GenerationQueue } from "@/lib/generation-queue";
import { GENERATION_ESTIMATE_MS } from "@/lib/generation-timing";
import { getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

import { providerSupportsTransparentBackground } from "@/lib/provider-transparent-background";

import type {
  BoardDetail,
  BoardSummary,
  GenerateImageInput,
  GenerateResponse,
  ProviderConfig,
  ReferenceImagePayload,
  ReferenceImageRole
} from "@shared/types";
import { parseGptImageSize } from "@shared/workflow";

import { toast } from "sonner";

import type { Dispatch, SetStateAction, RefObject } from "react";
import type { ImageWorkbenchApi } from "@shared/workbench-client";
import type { ActiveBoard, CanvasLayoutState, CanvasPersistedNode } from "../boards/types";

export interface GenerationControllerDependencies {
  inputRef: RefObject<GenerateImageInput>;
  getBlockedGenerateMessage: (targetInput?: GenerateImageInput) => string | null;
  setStatus: (message: string) => void;
  getWorkbenchApi: () => ImageWorkbenchApi | null;
  activeBoardRef: RefObject<ActiveBoard | null>;
  boardOpenSequenceRef: RefObject<number>;
  editTargetId: string | null;
  imagesRef: RefObject<GeneratedImage[]>;
  activeProvider: ProviderConfig;

  activeProviderId: string;

  dataUrlToReferencePayload: (dataUrl: string, name: string, role: ReferenceImageRole) => ReferenceImagePayload | null;
  generationQueueRef: RefObject<GenerationQueue | null>;
  parseSizeDimensions: (size: string) => { width: number; height: number; } | null;
  setImages: Dispatch<SetStateAction<GeneratedImage[]>>;
  canvasStateRef: RefObject<CanvasLayoutState>;
  workflowNodesRef: RefObject<CanvasPersistedNode[]>;
  setCanvasConnectionsVersion: Dispatch<SetStateAction<number>>;
  setFocusTarget: Dispatch<SetStateAction<{ key: string; nonce: number; } | null>>;
  setInput: Dispatch<SetStateAction<GenerateImageInput>>;
  triggerParticleBurst: (text: string, rect: ParticleBurstTrigger["rect"], targetNodeId?: ParticleBurstTrigger["targetNodeId"]) => void;
  setActiveGenerations: Dispatch<SetStateAction<number>>;
  setActiveBoardGenerations: Dispatch<SetStateAction<ActiveBoardGeneration[]>>;
  
  loadImageSize: (dataUrl: string) => Promise<{ width: number; height: number; }>;
  boardDetailCacheRef: RefObject<BoardDetailCache<BoardDetail | null>>;
  refreshBoards: () => Promise<BoardSummary[]>;
  locateGenerationResult: (boardId: string, imagePaths: string[]) => Promise<void>;
  refreshHistory: () => Promise<void>;
  updateWorkflowNode: (id: string, patch: Partial<CanvasPersistedNode>) => void;
  persistBoard: () => Promise<void>;
  window: Pick<Window, "setTimeout" | "clearTimeout">;
  toast: Pick<typeof toast, "error" | "warning">;
  iterlayToast: Pick<typeof iterlayToast, "result" | "dismiss" | "balance" | "generationPending" | "partial">;
}

export function createImageGenerationController(dependencies: GenerationControllerDependencies) {
  const {
  inputRef,
  getBlockedGenerateMessage,
  setStatus,
  getWorkbenchApi,
  activeBoardRef,
  boardOpenSequenceRef,
  editTargetId,
  imagesRef,
  activeProvider,
  activeProviderId,
  dataUrlToReferencePayload,
  generationQueueRef,
  parseSizeDimensions,
  setImages,
  canvasStateRef,
  workflowNodesRef,
  setCanvasConnectionsVersion,
  setFocusTarget,
  setInput,
  triggerParticleBurst,
  setActiveGenerations,
  setActiveBoardGenerations,
  loadImageSize,
  boardDetailCacheRef,
  refreshBoards,
  locateGenerationResult,
  refreshHistory,
  updateWorkflowNode,
  persistBoard,
  window,
  toast,
  iterlayToast
} = dependencies;
  return async function generate(
    sourceRect?: ParticleBurstTrigger["rect"],
    inputOverride?: Partial<GenerateImageInput>,
    options?: {
      skipOfficialCreditCheck?: boolean;
      preservePrompt?: boolean;
      createDerivedEditNode?: boolean;
      placementAnchorId?: string;
      preserveModelOverride?: boolean;
    }
  ): Promise<GeneratedImage[]> {
    let generationInput: GenerateImageInput = { ...inputRef.current, ...inputOverride };
    const blockedMessage = getBlockedGenerateMessage(generationInput);
    if (blockedMessage) {
      const message = blockedMessage;
      setStatus(message);
      toast.error(message);
      return [];
    }
    const api = getWorkbenchApi();
    if (!api) return [];
    const originBoard = activeBoardRef.current;
    if (!originBoard) {
      toast.error(translateSourceText("请先打开一个画板。"));
      return [];
    }
    if (inputOverride?.boardId && inputOverride.boardId !== originBoard.id) {
      toast.error(translateSourceText("画板已切换，请回到原画板重新发起生成。"));
      return [];
    }
    const originBoardSequence = boardOpenSequenceRef.current;
    const isOriginBoardCurrent = (): boolean =>
      activeBoardRef.current?.id === originBoard.id
      && boardOpenSequenceRef.current === originBoardSequence;
    const editTargetImage =
      generationInput.workflowMode === "edit" && editTargetId
        ? (imagesRef.current.find((image) => image.id === editTargetId) ?? null)
        : null;
    if (!providerSupportsTransparentBackground(activeProvider)) {
      generationInput = { ...generationInput, background: "auto", outputFormat: "png" };
    }

    const submittedPrompt = generationInput.prompt.trim();

    // 编辑会话把生成结果叠加为当前图片的新版本。
    const isEditSession = editTargetImage !== null && !options?.createDerivedEditNode;
    const requestedEditCount = Math.max(1, generationInput.n);
    let editReferencePayload: ReferenceImagePayload | null = null;
    if (editTargetImage) {
      try {
        const source = editTargetImage.dataUrl.startsWith("data:")
          ? editTargetImage.dataUrl
          : await api.readAssetDataUrl(editTargetImage.path);
        editReferencePayload = dataUrlToReferencePayload(source, "编辑目标", "edit-target");
      } catch {
        editReferencePayload = null;
      }
    }
    if (editTargetImage && !editReferencePayload) {
      toast.error(translateSourceText("无法读取目标图片，请重试。"));
      return [];
    }
    // Reference reads can yield while the user switches boards.
    // Never insert placeholders or clear the composer in a different board.
    if (!isOriginBoardCurrent()) {
      toast.error(translateSourceText("画板已切换，本次生成尚未提交，请回到原画板重试。"));
      return [];
    }

    const activeGenerationId = crypto.randomUUID();
    const queueTicket = generationQueueRef.current!.enqueue(activeGenerationId);

    // Put loading placeholder nodes on the canvas immediately; they keep their id
    // through pending → done so the finished image lands in the same spot.
    // Placeholders carry the requested output dimensions so the pending card
    // already shows the final aspect ratio instead of a generic square.
    const placeholderSize = parseSizeDimensions(generationInput.size);
    const outputConnectionSourceId = generationInput.generationNodeId ?? options?.placementAnchorId;
    const clientIds: string[] = isEditSession
      ? []
      : Array.from({ length: Math.max(1, generationInput.n) }, () => crypto.randomUUID());
    if (isEditSession) {
      const editingStartedAt = queueTicket.queued ? undefined : Date.now();
      setImages((current) =>
        current.map((image) =>
          image.id === editTargetImage.id
            ? {
                ...image,
                editing: true,
                pendingEditCount: getPendingEditCount(image) + requestedEditCount,
                queuedEditCount: (image.queuedEditCount ?? 0) + (queueTicket.queued ? requestedEditCount : 0),
                editingStartedAt: image.editingStartedAt ?? editingStartedAt
              }
            : image
        )
      );
    } else {
      const pendingStartedAt = queueTicket.queued ? undefined : Date.now();
      const referenceAnchorId = options?.placementAnchorId ?? (options?.createDerivedEditNode && editTargetImage
        ? editTargetImage.id
        : generationInput.referenceImages
        .map((reference) => reference.sourceNodeId)
        .find((nodeId): nodeId is string => Boolean(nodeId && imagesRef.current.some((image) => image.id === nodeId))));
      const placeholderDrafts: GeneratedImage[] = clientIds.map((id, index) => ({
        id,
        path: "",
        dataUrl: "",
        jobId: "",
        pending: true,
        generationStatus: queueTicket.queued ? "queued" : "running",
        pendingStartedAt,
        pendingPrompt: submittedPrompt,
        pendingReferenceImages: generationInput.referenceImages.map((reference) => ({
          name: reference.name,
          dataUrl: `data:${reference.mimeType};base64,${reference.dataBase64}`
        })),
        placementAnchorId: generationInput.generationNodeId
          ? generationInput.generationNodeId
          : index === 0 ? referenceAnchorId : clientIds[index - 1],
        selectOnCreate: Boolean(options?.createDerivedEditNode),
        source: "generated",
        width: placeholderSize?.width,
        height: placeholderSize?.height
      }));
      let nextImages = [...placeholderDrafts, ...imagesRef.current];
      if (generationInput.generationNodeId) {
        const anchor = canvasStateRef.current.positions[generationInput.generationNodeId];
        if (anchor) {
          nextImages = centerGenerationOutputs(
            nextImages,
            generationInput.generationNodeId,
            anchor,
            canvasStateRef.current.positions
          );
        }
      }
      imagesRef.current = nextImages;
      setImages(nextImages);
      if (outputConnectionSourceId && workflowNodesRef.current.some((node) => node.id === outputConnectionSourceId)) {
        const sourceNode = workflowNodesRef.current.find((node) => node.id === outputConnectionSourceId);
        const connections = canvasStateRef.current.connections;
        const additions = createMissingGenerationOutputConnections({
          sourceId: outputConnectionSourceId,
          targetIds: clientIds,
          existing: connections,
          label: sourceNode?.type === "comic-character" ? "角色形象" : "生成结果"
        });
        if (additions.length > 0) {
          canvasStateRef.current = {
            ...canvasStateRef.current,
            connections: [...connections, ...additions]
          };
          window.setTimeout(() => {
            setCanvasConnectionsVersion((value) => value + 1);
          }, 80);
        }
      }
      // Reuse the same targeted canvas focus used by history clicks. The placeholder keeps
      // this id after completion, so the camera does not jump again when the result arrives.
      const firstPlaceholderId = clientIds[0];
      if (firstPlaceholderId) {
        setFocusTarget((current) => ({ key: firstPlaceholderId, nonce: (current?.nonce ?? 0) + 1 }));
      }
    }
    // The composer text "left" as particles — clear it so the input is ready for the next prompt.
    if (!options?.preservePrompt) {
      setInput((current) => ({ ...current, prompt: "" }));
    }

    // Track the placeholder by id so the burst follows it while React Flow pans or zooms.
    if (!isEditSession && sourceRect && submittedPrompt) {
      const firstId = clientIds[0];
      if (firstId) triggerParticleBurst(submittedPrompt, sourceRect, firstId);
    }

    setActiveGenerations((count) => count + 1);
    setActiveBoardGenerations((current) => [
      ...current,
      {
        id: activeGenerationId,
        boardId: originBoard.id,
        mode: generationInput.workflowMode,
        prompt: submittedPrompt,
        requestedCount: Math.max(1, generationInput.n),
        startedAt: Date.now(),
        status: queueTicket.queued ? "queued" : "running"
      }
    ]);
    setStatus(queueTicket.queued
      ? "任务排队中..."
      : options?.createDerivedEditNode || generationInput.workflowMode !== "edit" ? "正在生成图片..." : "正在编辑图片...");
    let delayedNoticeId: string | number | undefined;
    let delayedNoticeTimer: number | null = null;
    try {
      await queueTicket.ready;
      if (queueTicket.queued) {
        const startedAt = Date.now();
        setActiveBoardGenerations((current) => current.map((task) =>
          task.id === activeGenerationId ? { ...task, status: "running", startedAt } : task
        ));
        if (isEditSession && activeBoardRef.current?.id === originBoard.id) {
          setImages((current) => current.map((image) => {
            if (image.id !== editTargetImage.id) return image;
            return {
              ...image,
              queuedEditCount: Math.max(0, (image.queuedEditCount ?? 0) - requestedEditCount) || undefined,
              editingStartedAt: image.editingStartedAt ?? startedAt
            };
          }));
        } else if (activeBoardRef.current?.id === originBoard.id) {
          const clientIdSet = new Set(clientIds);
          setImages((current) => current.map((image) => clientIdSet.has(image.id)
            ? { ...image, generationStatus: "running", pendingStartedAt: startedAt }
            : image));
        }
      }
      setStatus(options?.createDerivedEditNode || generationInput.workflowMode !== "edit" ? "正在生成图片..." : "正在编辑图片...");
      if (!isEditSession) {
        delayedNoticeTimer = window.setTimeout(() => {
          delayedNoticeId = iterlayToast.generationPending();
        }, GENERATION_ESTIMATE_MS);
      }
      // 负面提示（避免出现）在发送时并入提示词，真正到达 provider（对纯文本与结构化都生效）。
      const avoid = generationInput.promptSpec?.avoid?.trim();
      const finalPrompt =
        avoid && !/(^|\n)\s*avoid\s*[:：]/i.test(generationInput.prompt)
          ? `${generationInput.prompt}\n\nAvoid: ${avoid}`
          : generationInput.prompt;
      const payload: GenerateImageInput = {
        ...generationInput,
        prompt: finalPrompt,
        model: options?.preserveModelOverride
          ? generationInput.model
          : activeProvider.model || generationInput.model,
        size: parseGptImageSize(generationInput.size),
        background: generationInput.background,
        outputFormat: generationInput.outputFormat,
        boardId: originBoard.id,
        providerId: activeProviderId,
        // 编辑任务始终把当前目标图（当前激活版本）作为首个参考图传给 Provider。
        referenceImages: editReferencePayload
          ? [editReferencePayload, ...generationInput.referenceImages]
          : generationInput.referenceImages
      };
      const result: GenerateResponse = await api.generateImage(payload);
      
      const produced = await Promise.all(
        result.images.map(async (image) => {
          const size = await loadImageSize(image.dataUrl);
          return { ...image, width: size.width || undefined, height: size.height || undefined };
        })
      );
      if (isEditSession) {
        // 结果按顺序追加为新版本（n>1 时全部入栈，版本条里翻着对比），激活最新版。
        const newVersions: ImageVersion[] = produced.map((output) => ({
          path: output.path,
          dataUrl: output.dataUrl,
          jobId: result.job.id,
          width: output.width,
          height: output.height
        }));
        // 无论当前在哪个画板，先把新版本落盘到发起画板，保证在途编辑结果始终可恢复
        // （退出编辑 / 退出画板再进来都能看到）；后续自动保存是全量覆盖，内容一致不会重复。
        await api.appendBoardNodeVersions(
          originBoard.id,
          editTargetImage.id,
          newVersions.map((version) => ({
            imagePath: version.path,
            jobId: version.jobId,
            width: version.width,
            height: version.height
          }))
        );
        boardDetailCacheRef.current.delete(originBoard.id);
        if (activeBoardRef.current?.id === originBoard.id) {
          // 当前就在发起画板：同步更新内存即时呈现（与已落盘内容一致）。
          setImages((current) =>
            current.map((image) => {
              if (image.id !== editTargetImage.id) return image;
              const base: ImageVersion[] = image.versions ?? [
                { path: image.path, dataUrl: image.dataUrl, jobId: image.jobId, width: image.width, height: image.height }
              ];
              const versions = [...base, ...newVersions];
              const newest = versions[versions.length - 1];
              const pendingEditCount = Math.max(0, getPendingEditCount(image) - requestedEditCount);
              const queuedEditCount = Math.min(pendingEditCount, image.queuedEditCount ?? 0);
              return {
                ...image,
                versions,
                activeVersion: versions.length - 1,
                path: newest.path,
                dataUrl: newest.dataUrl,
                jobId: newest.jobId,
                width: newest.width,
                height: newest.height,
                editing: pendingEditCount > 0,
                pendingEditCount: pendingEditCount || undefined,
                queuedEditCount: queuedEditCount || undefined,
                editingStartedAt: pendingEditCount > queuedEditCount ? image.editingStartedAt : undefined
              };
            })
          );
        } else {
          // 编辑期间切走了画板：已落盘，刷新画板库摘要即可。
          void refreshBoards();
        }
        setStatus("编辑完成。");
        iterlayToast.result({
          count: newVersions.length,
          title: newVersions.length > 1 ? translateSourceText("已生成 {{ui:0}} 个编辑版本", [newVersions.length]) : translateSourceText("编辑已应用"),
          detail: activeBoardRef.current?.id === originBoard.id ? translateSourceText("新版本已叠加到原图") : translateSourceText("已存入「{{ui:0}}」", [originBoard.name]),
          previews: newVersions.map((version) => version.dataUrl),
          onNavigate: () => void locateGenerationResult(
            originBoard.id,
            newVersions.map((version) => version.path)
          )
        });
        if (result.warnings?.length) result.warnings.forEach((warning) => toast.warning(warning));
        await refreshHistory();
        return newVersions.map((version) => ({
          id: crypto.randomUUID(),
          path: version.path,
          dataUrl: version.dataUrl,
          jobId: version.jobId,
          pending: false,
          source: "generated" as const,
          width: version.width,
          height: version.height
        }));
      }

      let completedImages: GeneratedImage[] = produced.map((output, index) => ({
        id: clientIds[index] ?? crypto.randomUUID(),
        path: output.path,
        dataUrl: output.dataUrl,
        jobId: result.job.id,
        pending: false,
        source: "generated" as const,
        width: output.width,
        height: output.height
      }));
      if (generationInput.generationNodeId) {
        completedImages = completedImages.map((image) => ({
          ...image,
          placementAnchorId: generationInput.generationNodeId
        }));
      }
      const completedOnOriginBoard = activeBoardRef.current?.id === originBoard.id;
      if (completedOnOriginBoard) {
        let nextImages = settleGeneratedPlaceholders(imagesRef.current, clientIds, completedImages);
        if (generationInput.generationNodeId) {
          const anchor = canvasStateRef.current.positions[generationInput.generationNodeId];
          if (anchor) {
            nextImages = centerGenerationOutputs(
              nextImages,
              generationInput.generationNodeId,
              anchor,
              canvasStateRef.current.positions
            );
            const completedById = new Map(nextImages.map((image) => [image.id, image]));
            completedImages = completedImages.map((image) => completedById.get(image.id) ?? image);
          }
        }
        imagesRef.current = nextImages;
        setImages(nextImages);
        if (generationInput.generationNodeId) {
          updateWorkflowNode(generationInput.generationNodeId, {
            status: "succeeded",
            lastGenerationId: result.job.id,
            error: undefined
          });
        }
        if (outputConnectionSourceId) {
          const connections = canvasStateRef.current.connections;
          const sourceNode = workflowNodesRef.current.find((node) => node.id === outputConnectionSourceId);
          const additions = createMissingGenerationOutputConnections({
            sourceId: outputConnectionSourceId,
            targetIds: completedImages.map((image) => image.id),
            existing: connections,
            label: sourceNode?.type === "comic-character" ? "角色形象" : "生成结果"
          });
          if (additions.length > 0) {
            canvasStateRef.current = {
              ...canvasStateRef.current,
              connections: [...connections, ...additions]
            };
            setCanvasConnectionsVersion((value) => value + 1);
          }
        }
        // 创作页会在 generate 返回后立刻展示成功结果。先把终态落盘，避免用户
        // 随即进入画板时仍读到 pending 占位节点。
        await persistBoard();
        setStatus(`已生成 ${result.images.length} 张图片。`);
        if (produced.length < clientIds.length) {
          iterlayToast.partial({ actual: produced.length, expected: clientIds.length });
        } else {
          iterlayToast.result({
            count: result.images.length,
            previews: completedImages.map((output) => output.dataUrl),
            onNavigate: () => void locateGenerationResult(
              originBoard.id,
              completedImages.map((output) => output.path)
            )
          });
        }
      } else {
        // 用户已切到别的画板：结果直接写进发起画板的文件（摆在现有内容右侧）。
        await api.appendBoardNodes(
          originBoard.id,
          completedImages.map((output) => ({
            id: output.id,
            imagePath: output.path,
            jobId: output.jobId,
            source: output.source ?? "generated",
            width: output.width,
            height: output.height
          }))
        );
        boardDetailCacheRef.current.delete(originBoard.id);
        void refreshBoards();
        setStatus(`已生成 ${result.images.length} 张图片。`);
        iterlayToast.result({
          count: result.images.length,
          boardName: originBoard.name,
          previews: produced.map((output) => output.dataUrl),
          onNavigate: () => void locateGenerationResult(
            originBoard.id,
            completedImages.map((output) => output.path)
          )
        });
      }
      // Provider 侧的非致命问题（部分失败/返回张数不足）要说清楚，不能让占位符静默消失。
      if (result.warnings?.length) {
        result.warnings.forEach((warning) => toast.warning(warning));
      } else if (produced.length < clientIds.length && !completedOnOriginBoard) {
        toast.warning(translateSourceText("请求 {{ui:0}} 张，实际返回 {{ui:1}} 张。", [clientIds.length, produced.length]));
      }
      await refreshHistory();
      return completedImages;
    } catch (error) {
      const message = getWorkbenchErrorMessage(error, "生成失败。");
      if (isEditSession && activeBoardRef.current?.id === originBoard.id) {
        setImages((current) =>
          current.map((image) =>
            image.id === editTargetImage.id
              ? (() => {
                  const pendingEditCount = Math.max(0, getPendingEditCount(image) - requestedEditCount);
                  const queuedEditCount = Math.min(pendingEditCount, image.queuedEditCount ?? 0);
                  return {
                    ...image,
                    editing: pendingEditCount > 0,
                    pendingEditCount: pendingEditCount || undefined,
                    queuedEditCount: queuedEditCount || undefined,
                    editingStartedAt: pendingEditCount > queuedEditCount ? image.editingStartedAt : undefined
                  };
                })()
              : image
          )
        );
      } else if (!isEditSession && activeBoardRef.current?.id === originBoard.id) {
        const nextImages = removeGeneratedPlaceholders(imagesRef.current, clientIds);
        imagesRef.current = nextImages;
        setImages(nextImages);
      }
      setStatus(message);
      toast.error(message);
      await refreshHistory();
      return [];
    } finally {
      if (delayedNoticeTimer !== null) window.clearTimeout(delayedNoticeTimer);
      if (delayedNoticeId !== undefined) iterlayToast.dismiss(delayedNoticeId);
      generationQueueRef.current?.release(activeGenerationId);
      setActiveGenerations((count) => count - 1);
      setActiveBoardGenerations((current) => current.filter((task) => task.id !== activeGenerationId));
    }
  };
}
