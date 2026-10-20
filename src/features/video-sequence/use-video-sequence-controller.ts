import { exportVideoSequence } from "./export-video-sequence";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { translateSourceText } from "@/i18n/ui-text";
import { generationFingerprint } from "@/compat/paid-media";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import type { ActiveBoard } from "@/features/boards/types";
import type { GenerationConfirmationRequest } from "@/features/generation/confirmation";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import type { VideoSequence as EditorVideoSequence, VideoSequenceExportOptions } from "@/components/video-sequence";
import { DEFAULT_VIDEO_PROVIDER_CONFIG, type BoardVideoNode, type GenerateImageInput, type VideoSequence as PersistedVideoSequence, type VideoSequenceTask, type VideoSequenceTemplate, type VideoProviderConfig } from "@shared/types";
import { toEditorVideoSequence } from "./editor-adapter";

interface VideoSequenceOptions {
  activeBoard: ActiveBoard | null;
  activeBoardRef: RefObject<ActiveBoard | null>;
  activeVideoProviderId: string;
  videoProviders: VideoProviderConfig[];
  openBoard: (id: string, focus?: undefined, options?: { forceReload?: boolean; suppressLoadingScreen?: boolean }) => Promise<void>;
  ensureMediaToolsReady: () => Promise<boolean>;
  requestGenerationConfirmation: (request: GenerationConfirmationRequest) => Promise<boolean>;
}

type ActiveSequence = PersistedVideoSequence & { mediaUrls: Record<string, string>; sequenceTasks?: VideoSequenceTask[] };

export function useVideoSequenceController({ activeBoard, activeBoardRef, activeVideoProviderId, videoProviders, openBoard, ensureMediaToolsReady, requestGenerationConfirmation }: VideoSequenceOptions) {
  const [activeVideoSequence, setActiveSequenceState] = useState<ActiveSequence | null>(null);
  const activeVideoSequenceRef = useRef<ActiveSequence | null>(null);
  const openRequestRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const setActiveVideoSequence: Dispatch<SetStateAction<ActiveSequence | null>> = useCallback((action) => {
    const next = typeof action === "function" ? action(activeVideoSequenceRef.current) : action;
    if (next?.id !== activeVideoSequenceRef.current?.id || next?.boardId !== activeVideoSequenceRef.current?.boardId) {
      mutationRequestRef.current += 1;
      setVideoSequenceSaving(false);
      setVideoSequenceSaveError(undefined);
    }
    activeVideoSequenceRef.current = next;
    openRequestRef.current += 1;
    setActiveSequenceState(next);
  }, []);
  useEffect(() => {
    if (activeVideoSequenceRef.current?.boardId !== activeBoard?.id) setActiveVideoSequence(null);
  }, [activeBoard?.id, setActiveVideoSequence]);
  const [videoSequenceTemplates, setVideoSequenceTemplates] = useState<VideoSequenceTemplate[]>([]);
  const [videoSequenceSaving, setVideoSequenceSaving] = useState(false);
  const [videoSequenceSaveError, setVideoSequenceSaveError] = useState<string>();
  const refreshActiveVideoSequence = useCallback(async (): Promise<void> => {
    const current = activeVideoSequenceRef.current;
    if (!current) return;
    const next = await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id });
    if (next && activeVideoSequenceRef.current === current) setActiveVideoSequence(next);
  }, [setActiveVideoSequence]);

  useEffect(() => {
    if (!activeVideoSequence || !hasImageWorkbenchApi()) return;
    return getImageWorkbenchApi().onVideoSequenceEvent((event) => {
      const update = event as { boardId?: string; sequenceId?: string };
      if (update.boardId === activeVideoSequence.boardId && update.sequenceId === activeVideoSequence.id) {
        void refreshActiveVideoSequence();
      }
    });
  }, [activeVideoSequence, refreshActiveVideoSequence]);

  const openPersistedVideoSequence = useCallback(async (sequenceId: string): Promise<void> => {
    const boardId = activeBoardRef.current?.id;
    if (!boardId) return;
    const requestId = ++openRequestRef.current;
    try {
      const sequence = await getImageWorkbenchApi().getVideoSequence({ boardId, sequenceId });
      if (requestId !== openRequestRef.current || activeBoardRef.current?.id !== boardId) return;
      if (!sequence) throw new Error("视频序列不存在或已被删除。");
      setActiveVideoSequence(sequence);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法打开视频序列。"));
    }
  }, [activeBoardRef, setActiveVideoSequence]);

  const createVideoSequenceFromImages = useCallback(async (selected: GeneratedImage[]): Promise<void> => {
    if (!activeBoard || selected.length < 2) return;
    const requestId = ++openRequestRef.current;
    const isCurrent = () => activeBoardRef.current?.id === activeBoard.id && openRequestRef.current === requestId;
    try {
      const sequence = await getImageWorkbenchApi().createVideoSequence({
        boardId: activeBoard.id,
        name: `${activeBoard.name}镜头序列`,
        imageNodeIds: selected.map((image) => image.id),
        defaults: {
          providerId: activeVideoProviderId,
          model: videoProviders.find((provider) => provider.id === activeVideoProviderId)?.model ?? DEFAULT_VIDEO_PROVIDER_CONFIG.model
        }
      });
      const templates = await getImageWorkbenchApi().listVideoSequenceTemplates();
      if (!isCurrent()) return;
      setVideoSequenceTemplates(templates);
      if (!isCurrent()) return;
      await openBoard(activeBoard.id, undefined, { forceReload: true, suppressLoadingScreen: true });
      if (!isCurrent()) return;
      setActiveVideoSequence(sequence);
      toast.success(translateSourceText("已创建 {{ui:0}} 个视频片段", [selected.length - 1]));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "创建镜头序列失败。"));
    }
  }, [activeBoard, activeBoardRef, activeVideoProviderId, openBoard, videoProviders, setActiveVideoSequence]);

  const createVideoAssemblyFromVideos = useCallback(async (selected: BoardVideoNode[]): Promise<void> => {
    if (!activeBoard || selected.length < 2) return;
    const requestId = ++openRequestRef.current;
    const isCurrent = () => activeBoardRef.current?.id === activeBoard.id && openRequestRef.current === requestId;
    try {
      const sequence = await getImageWorkbenchApi().createVideoSequenceFromVideos({
        boardId: activeBoard.id,
        name: activeBoard.name + "成片序列",
        videoNodeIds: selected.map((video) => video.id),
        defaults: {
          providerId: activeVideoProviderId,
          model: videoProviders.find((provider) => provider.id === activeVideoProviderId)?.model ?? DEFAULT_VIDEO_PROVIDER_CONFIG.model
        }
      });
      if (!isCurrent()) return;
      await openBoard(activeBoard.id, undefined, { forceReload: true, suppressLoadingScreen: true });
      if (!isCurrent()) return;
      setActiveVideoSequence(sequence);
      toast.success("已按画布顺序合并 " + selected.length + " 个视频；未调用生成服务");
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "合并视频失败，画板未发生变化。"));
    }
  }, [activeBoard, activeBoardRef, activeVideoProviderId, openBoard, videoProviders, setActiveVideoSequence]);

  const mutateActiveVideoSequence = useCallback(async (
    operation: Parameters<ReturnType<typeof getImageWorkbenchApi>["mutateVideoSequence"]>[0],
    input: Record<string, unknown>
  ): Promise<void> => {
    const current = activeVideoSequenceRef.current;
    if (!current) return;
    const requestId = ++mutationRequestRef.current;
    setVideoSequenceSaving(true);
    setVideoSequenceSaveError(undefined);
    try {
      const next = await getImageWorkbenchApi().mutateVideoSequence(operation, {
        boardId: current.boardId,
        sequenceId: current.id,
        expectedRevision: current.revision,
        ...input
      });
      if (activeVideoSequenceRef.current === current) setActiveVideoSequence(next);
    } catch (error) {
      if (activeVideoSequenceRef.current === current) setVideoSequenceSaveError(getWorkbenchErrorMessage(error, "保存失败。"));
      throw error;
    } finally {
      if (requestId === mutationRequestRef.current) setVideoSequenceSaving(false);
    }
  }, [setActiveVideoSequence]);

  const updateActiveVideoSequence = useCallback((draft: EditorVideoSequence): void => {
    const current = activeVideoSequenceRef.current;
    if (!current) return;
    const currentFrameIds = [...current.keyframes].sort((a, b) => a.order - b.order).map((frame) => frame.id);
    const draftFrameIds = [...draft.keyframes].sort((a, b) => a.order - b.order).map((frame) => frame.id);
    if (current.kind === "video-assembly") {
      const currentSegmentIds = [...current.segments].sort((a, b) => a.order - b.order).map((segment) => segment.id);
      const draftSegmentIds = [...draft.segments].sort((a, b) => a.order - b.order).map((segment) => segment.id);
      if (currentSegmentIds.join(":") !== draftSegmentIds.join(":")) {
        void mutateActiveVideoSequence("reorderSegments", { segmentIds: draftSegmentIds });
        return;
      }
    }
    if (draftFrameIds.length < currentFrameIds.length) {
      const removedId = currentFrameIds.find((id) => !draftFrameIds.includes(id));
      if (removedId) void mutateActiveVideoSequence("removeKeyframe", { keyframeId: removedId });
      return;
    }
    if (currentFrameIds.join(":") !== draftFrameIds.join(":")) {
      void mutateActiveVideoSequence("reorderKeyframes", { keyframeIds: draftFrameIds });
      return;
    }
    const changed = draft.segments.find((segment) => {
      const source = current.segments.find((item) => item.id === segment.id);
      if (!source) return false;
      return segment.prompt !== source.config.prompt
        || segment.providerId !== source.config.providerId
        || segment.model !== source.config.model
        || segment.durationSeconds !== source.config.durationSeconds
        || segment.aspectRatio !== source.config.aspectRatio
        || segment.resolution !== source.config.resolution
        || segment.generateAudio !== source.config.generateAudio
        || segment.watermark !== source.config.watermark
        || segment.trimInMs !== source.trim.inMs
        || segment.trimOutMs !== source.trim.outMs
        || segment.muted !== source.trim.muted
        || segment.activeVersionId !== source.activeVersionId;
    });
    if (!changed) return;
    const source = current.segments.find((item) => item.id === changed.id)!;
    if (changed.activeVersionId !== source.activeVersionId && changed.activeVersionId) {
      void mutateActiveVideoSequence("selectSegmentVersion", { segmentId: changed.id, versionId: changed.activeVersionId });
      return;
    }
    void mutateActiveVideoSequence("updateSegment", {
      segmentId: changed.id,
      configPatch: {
        prompt: changed.prompt,
        providerId: changed.providerId,
        model: changed.model,
        durationSeconds: changed.durationSeconds,
        aspectRatio: changed.aspectRatio,
        resolution: changed.resolution,
        generateAudio: changed.generateAudio,
        watermark: changed.watermark
      },
      trimPatch: { inMs: changed.trimInMs, outMs: changed.trimOutMs, muted: changed.muted }
    });
  }, [mutateActiveVideoSequence]);

  const prepareActiveVideoSequence = useCallback(async () => {
    const current = activeVideoSequenceRef.current;
    if (!current || !await ensureMediaToolsReady()) return null;
    try {
      const latest = await getImageWorkbenchApi().getVideoSequence({ boardId: current.boardId, sequenceId: current.id });
      if (!latest) throw new Error("视频序列不存在或已被删除。");
      const active = activeVideoSequenceRef.current;
      if (active?.boardId !== current.boardId || active.id !== current.id) return null;
      setActiveVideoSequence(latest);
      return latest;
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法读取视频序列，请重试。"));
      return null;
    }
  }, [ensureMediaToolsReady, setActiveVideoSequence]);

  const runActiveVideoSequence = useCallback(async (segmentIds?: string[]): Promise<VideoSequenceTask[]> => {
    const current = await prepareActiveVideoSequence();
    if (!current) return [];
    const selected = current.segments.filter((segment) => !segmentIds || segmentIds.includes(segment.id));
    if (selected.length === 0) return [];
    const fingerprintItems = selected.map((segment) => ({
      id: segment.id,
      segmentRevision: segment.desiredRevision,
      inputFingerprint: segment.inputFingerprint,
      providerId: segment.config.providerId ?? current.defaults.providerId,
      durationSeconds: segment.config.durationSeconds ?? current.defaults.durationSeconds
    }));
    const inputFingerprint = await generationFingerprint(fingerprintItems);
    const metadata: Partial<GenerateImageInput> = { inputFingerprint };
    const confirmationItems = selected.map((segment) => {
      const duration = segment.config.durationSeconds ?? current.defaults.durationSeconds;
      const cost = "Provider 计费";
      return {
        id: segment.id,
        label: `片段 ${segment.order + 1}`,
        task: `更新 ${duration} 秒视频`,
        costLabel: cost,
        quoteId: metadata.quoteId,
        quoteExpiresAt: metadata.quoteExpiresAt
      };
    });
    const quotedCost = metadata.priceSnapshot
      ? `${metadata.priceSnapshot.amount} ${metadata.priceSnapshot.currency === "gold-bean" ? "金豆" : metadata.priceSnapshot.currency}`
      : "由 Provider 计费";
    const confirmed = await requestGenerationConfirmation({
      title: segmentIds ? "确认更新片段" : "确认批量生成",
      providerLabel: selected.map((segment) => videoProviders.find((provider) => provider.id === (segment.config.providerId ?? current.defaults.providerId ?? activeVideoProviderId))?.name ?? "未知 Provider").filter((value, index, values) => values.indexOf(value) === index).join("、"),
      model: selected.map((segment) => segment.config.model ?? current.defaults.model).filter((value, index, values) => values.indexOf(value) === index).join("、"),
      totalCostLabel: quotedCost,
      items: confirmationItems,
      confirmLabel: `确认提交 ${selected.length} 个片段`
    });
    if (!confirmed || activeVideoSequenceRef.current?.id !== current.id
      || activeVideoSequenceRef.current?.boardId !== current.boardId) return [];
    const result = await getImageWorkbenchApi().runVideoSequence({
      boardId: current.boardId,
      sequenceId: current.id,
      expectedRevision: current.revision,
      scope: segmentIds ? { segmentIds } : "affected",
      ...metadata
    });
    setActiveVideoSequence((value) => value?.id === current.id && value.boardId === current.boardId ? { ...value, sequenceTasks: [...(value.sequenceTasks ?? []), ...result.jobs] } : value);
    await refreshActiveVideoSequence();
    return result.jobs;
  }, [
    activeVideoProviderId,
    prepareActiveVideoSequence,
    refreshActiveVideoSequence,
    requestGenerationConfirmation,
    videoProviders,
    setActiveVideoSequence
  ]);

  const exportActiveVideoSequence = useCallback((options: VideoSequenceExportOptions) => exportVideoSequence(options, {
    prepareActiveVideoSequence, runActiveVideoSequence, refreshActiveVideoSequence
  }), [prepareActiveVideoSequence, refreshActiveVideoSequence, runActiveVideoSequence]);

  const saveActiveVideoSequenceTemplate = useCallback(async (name: string): Promise<void> => {
    const current = activeVideoSequenceRef.current;
    if (!current) return;
    const template = await getImageWorkbenchApi().createVideoSequenceTemplate({ sequence: current, name, description: "" });
    if (activeVideoSequenceRef.current === current) setVideoSequenceTemplates(items => [...items.filter(item => item.id !== template.id), template]);
  }, []);

  const applyActiveVideoSequenceTemplate = useCallback(async (templateId: string): Promise<void> => {
    const current = activeVideoSequenceRef.current;
    if (!current) return;
    const sequence = await getImageWorkbenchApi().instantiateVideoSequenceTemplate({
      boardId: current.boardId, templateId,
      imageNodeIds: current.keyframes.map(frame => frame.source.nodeId).filter((id): id is string => Boolean(id))
    });
    const hydrated = await getImageWorkbenchApi().getVideoSequence({ boardId: sequence.boardId, sequenceId: sequence.id });
    if (hydrated && activeVideoSequenceRef.current === current && activeBoardRef.current?.id === current.boardId) setActiveVideoSequence(hydrated);
  }, [activeBoardRef, setActiveVideoSequence]);

  const editorVideoSequence = useMemo(() => activeVideoSequence ? toEditorVideoSequence(activeVideoSequence, activeBoard?.name) : null, [activeBoard?.name, activeVideoSequence]);

  return { saveActiveVideoSequenceTemplate, applyActiveVideoSequenceTemplate, activeVideoSequence, setActiveVideoSequence, videoSequenceTemplates, setVideoSequenceTemplates, videoSequenceSaving, videoSequenceSaveError, refreshActiveVideoSequence, openPersistedVideoSequence, createVideoSequenceFromImages, createVideoAssemblyFromVideos, mutateActiveVideoSequence, updateActiveVideoSequence, prepareActiveVideoSequence, runActiveVideoSequence, exportActiveVideoSequence, editorVideoSequence };
}
