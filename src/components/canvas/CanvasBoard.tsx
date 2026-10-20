import { CanvasToolHint, CanvasToolHintProvider, CANVAS_TOOL_HINTS } from "./CanvasToolHint";
import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import type {
  AssetComment,
  AssetLibraryItem,
  BoardConnection,
  BoardComicDramaEntryNode,
  BoardGenerationNode,
  BoardEnterOrigin,
  BoardTextNode,
  BoardVideoGenerationNode,
  BoardVideoNode,
  BoardViewport,
  CopyImageFormat,
  ComicCharacterNode,
  ImageDoubleClickAction,
  ProviderConfig,
  VideoProviderConfig
} from "@shared/types";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Clapperboard, ImagePlus, Type, Video, MousePointer2, Hand, Maximize, MoreHorizontal } from "lucide-react";
import { canvasToolShortcut, type CanvasToolMode } from "./canvas-tool-mode";
import "./canvas-tool-mode.css";
import {
  IMAGE_NODE_WIDTH,
  imageKey,
  imageNodeHeight,
  type GeneratedImage,
  type ImageNodeData,
  type VersionSeparationPlacement
} from "./ImageNode";
import { centerNodeAtDrop, type CanvasDropPoint } from "./canvas-drop";
import type { CanvasClipboardItem } from "./canvas-clipboard";
import type { EmptyCanvasMode } from "./EmptyCanvasStart";
import { copyImageDataUrlToClipboard } from "@/lib/clipboard-images";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { CANVAS_FIT_VIEW_OPTIONS, resolveCanvasWheelInteraction } from "./canvas-viewport";
import { type CanvasNodeLayout, type CanvasRestoreSnapshot, type CanvasSelectionSnapshot } from "./canvas-history";
import { useCanvasController } from "./CanvasController";
import { CanvasSurface } from "./CanvasSurface";
import {
  CanvasDropTarget,
  CanvasEmptyState,
  CanvasMiniMap,
  CanvasSelectionToolbar,
  CanvasVideoMergeToolbar,
  CanvasViewportOverlays
} from "./CanvasOverlays";
import { edgeFromConnection } from "./ConnectionController";
import { nodeImage, nodeRenderedHeight, nodeRenderedWidth } from "./NodeRegistry";
import { CanvasContextMenu, CanvasNodeCreateMenu, CanvasZoomToolbar } from "./CanvasInteractionOverlays";
import { useCanvasConnectionPresentation } from "./use-canvas-connection-presentation";
import { useCanvasConnectionMutations } from "./use-canvas-connection-mutations";
import { useFreeConnectionGesture } from "./use-free-connection-gesture";
import { useCanvasConnectionEdgeActions } from "./use-canvas-connection-edge-actions";
import { useCanvasDropController, type CanvasDropPayload } from "./use-canvas-drop-controller";
import { projectCanvasNodes, type CanvasNodeProjectionBindings, type CanvasWorkflowNode } from "./canvas-node-projection";
import { resolveGenerationNodeInput } from "./canvas-workflow";
import { resolveGeneratedImageVersion } from "./image-node-model";
import type { GenerationNodeData } from "./GenerationNode";
import type { GenerationReferencePlacementTarget } from "./generation-reference-paste";
import type { VideoNodeData } from "./VideoNode";
import type { AudioReferenceInput, GeneratedVideo, VideoReferenceInput } from "./video-node-model";
import type { VideoGenerationNodeConfig } from "./VideoGenerationNode";
import { useCanvasNodeLayoutInteractions } from "./use-canvas-node-layout-interactions";
import { useCanvasNodeBindings } from "./use-canvas-node-bindings";
import { useCanvasWorkflowNodeActions } from "./use-canvas-workflow-node-actions";
import { useCanvasSelectionActions } from "./use-canvas-selection-actions";
import { useCanvasClipboardController, type CanvasClipboardDropPayload } from "./use-canvas-clipboard-controller";
import type { CanvasOptionalAssetShortcut, CanvasShortcutSnapshot } from "./canvas-shortcut-plan";
import { useCanvasShortcutController } from "./use-canvas-shortcut-controller";
import { useCanvasCommandApi } from "./use-canvas-command-api";
import { useCanvasViewportController } from "./use-canvas-viewport-controller";
import { useCanvasMenuController } from "./use-canvas-menu-controller";
import { useCanvasRelationshipController } from "./use-canvas-relationship-controller";
import { VIDEO_GENERATION_NODE_HEIGHT, VIDEO_GENERATION_NODE_WIDTH } from "./canvas-node-layout";

function isImageCanvasNode(node: Node): boolean {
  return node.type === "imageNode";
}

export function resolveVideoGenerationPresentation(
  generationNodeId: string,
  nodes: readonly Node[],
  edges: readonly Edge[]
): {
  prompt: string;
  images: GeneratedImage[];
  sourceNodeIds: string[];
  versionConflicts?: string[];
  startFrame?: GeneratedImage;
  endFrame?: GeneratedImage;
  referenceImages: GeneratedImage[];
  referenceVideos: VideoReferenceInput[];
  requiresFirstLastFrame: boolean;
} {
  const resolved = resolveGenerationNodeInput(generationNodeId, nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let startFrame: GeneratedImage | undefined;
  let endFrame: GeneratedImage | undefined;
  const referenceImages: GeneratedImage[] = [];
  const referenceVideos: VideoReferenceInput[] = [];
  for (const edge of edges) {
    if (edge.target !== generationNodeId) continue;
    const source = nodeById.get(edge.source);
    if (!source) continue;
    if (source.type === "videoNode" && edge.targetHandle === "target-video-reference") {
      const video = (source.data as unknown as Partial<VideoNodeData>).video;
      if (video && !referenceVideos.some((candidate) => candidate.id === video.id)) {
        referenceVideos.push({
          id: video.id,
          name: video.title?.trim() || video.path.split(/[\\/]/).pop() || "参考视频",
          path: video.path,
          dataUrl: video.dataUrl,
          posterDataUrl: video.posterDataUrl,
          durationMs: video.durationMs
        });
      }
      continue;
    }
    const binding = (edge.data as { versionBinding?: { mode?: string; versionId?: string } } | undefined)?.versionBinding;
    const baseImage = source.type === "imageNode"
      ? nodeImage(source)
      : source.type === "generationNode"
        ? resolveGenerationOutputImage(source, nodeById, edges, edge)
        : undefined;
    const selected = baseImage
      ? resolveGeneratedImageVersion(baseImage, binding?.mode === "pinned" ? binding.versionId : undefined)
      : undefined;
    const image = selected?.image;
    if (!image) {
      if (binding?.mode === "pinned") {
        (resolved.versionConflicts ??= []).push(`${source.id}: ${selected?.conflict ?? `固定版本 ${binding.versionId} 与实际生成媒体不一致。`}`);
      }
      continue;
    }
    if (source.type === "generationNode"
      && (edge.targetHandle === "target-start-frame" || edge.targetHandle === "target-end-frame")
      && binding?.mode !== "pinned") continue;
    if (edge.targetHandle === "target-start-frame") startFrame = image;
    else if (edge.targetHandle === "target-end-frame") endFrame = image;
    else if (!referenceImages.some((candidate) => candidate.id === image.id)) referenceImages.push(image);
  }
  const images = [startFrame, endFrame, ...referenceImages]
    .filter((image): image is GeneratedImage => Boolean(image));
  return {
    prompt: resolved.prompt,
    images,
    sourceNodeIds: [...new Set([...resolved.sourceNodeIds, ...images.map((image) => image.id), ...referenceVideos.map((video) => video.id)])],
    versionConflicts: [...new Set(resolved.versionConflicts ?? [])],
    startFrame,
    endFrame,
    referenceImages,
    referenceVideos,
    requiresFirstLastFrame: edges.some((edge) => edge.target === generationNodeId && nodeById.get(edge.source)?.type === "comicSegmentNode")
  };
}

function resolveGenerationOutputImage(
  generation: Node,
  nodeById: ReadonlyMap<string, Node>,
  edges: readonly Edge[],
  inputEdge: Edge
): GeneratedImage | undefined {
  const outputs = edges.flatMap((edge) => {
    if (edge.source !== generation.id || edge.data?.kind === "reference") return [];
    const target = nodeById.get(edge.target);
    return target?.type === "imageNode" ? [nodeImage(target)] : [];
  });
  const binding = (inputEdge.data as { versionBinding?: { mode?: string; versionId?: string } } | undefined)?.versionBinding;
  if (binding?.mode !== "pinned" || !binding.versionId) return undefined;
  const matches = outputs.flatMap((image) => {
    const selected = resolveGeneratedImageVersion(image, binding.versionId);
    return selected.image ? [selected.image] : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function videoReferenceFromPath(
  path: string,
  index: number,
  mediaUrls: Readonly<Record<string, string>>
): VideoReferenceInput {
  return {
    id: `video-reference-${index}-${path}`,
    name: path.split(/[\\/]/).pop() || `参考视频 ${index + 1}`,
    path,
    dataUrl: mediaUrls[path] ?? ""
  };
}

export function mergeVideoReferences(
  connected: readonly VideoReferenceInput[],
  persisted: readonly VideoReferenceInput[]
): VideoReferenceInput[] {
  const byPath = new Map<string, VideoReferenceInput>();
  for (const reference of [...connected, ...persisted]) {
    if (!reference.path || byPath.has(reference.path)) continue;
    byPath.set(reference.path, reference);
  }
  return Array.from(byPath.values());
}

export {
  canvasSelectionSnapshot,
  type CanvasNodeLayout,
  type CanvasRestoreSnapshot,
  type CanvasSelectionSnapshot
} from "./canvas-history";
export { connectionSelectionCommandChanges } from "./ConnectionController";
export {
  connectionRoutingWorkerCandidates,
  connectionWorkerObstacles,
  resolveConnectionWorkerRefinements
} from "./connection-route-projection";
export {
  canvasPlacementGapAfterAnchorType,
  resolveNewPlacement,
  settleCompletedNodePosition,
  shallowCanvasNodeDataEqual
} from "./canvas-node-projection";
export {
  resolveCanvasDeleteShortcut,
  type CanvasDeleteShortcutTargets
} from "./canvas-shortcut-plan";

const EMPTY_CONNECTIONS: BoardConnection[] = [];
const EMPTY_ASSET_COMMENTS: AssetComment[] = [];
const DOUBLE_CLICK_FOCUS_ZOOM = 1.6;

interface MiddleMouseEvent {
  button: number;
  preventDefault: () => void;
}

// React Flow handles the drag itself; this only suppresses Chromium's competing
// middle-click autoscroll behavior, which can otherwise keep the viewport drifting.
export function preventMiddleMouseAutoScroll(event: MiddleMouseEvent): void {
  if (event.button === 1) event.preventDefault();
}

interface CanvasBoardProps {
  images: GeneratedImage[];
  workflowNodes?: CanvasWorkflowNode[];
  videoUrls?: Record<string, string>;
  activeImageProvider?: ProviderConfig;
  videoProviders?: VideoProviderConfig[];
  activeVideoProviderId?: string;
  goldBeanBalance?: number;
  goldBeanLoading?: boolean;
  videoGoldBeanCostPerSecond?: number;
  advancedVideoModesEnabled?: boolean;
  onStartComicDrama?: (position: CanvasDropPoint) => void;
  comicDramaBoard?: boolean;
  onOpenComicDramaProject?: (node: BoardComicDramaEntryNode, origin?: BoardEnterOrigin) => void;
  onCreateWorkflowNode?: (
    type: "text" | "generation" | "video-generation" | "comic-setting" | "comic-character" | "comic-segment-script",
    position: CanvasDropPoint,
    initial?: {
      text?: string;
      prompt?: string;
      model?: string;
      size?: string;
      count?: number;
      duration?: number;
      aspectRatio?: string;
      resolution?: string;
      generateAudio?: boolean;
      focusOnCreate?: boolean;
    }
  ) => string | void;
  onUpdateWorkflowNode?: (
    id: string,
    patch: Partial<CanvasWorkflowNode>
  ) => void;
  onSelectionChange?: (nodeIds: string[]) => void;
  onRequestDeleteWorkflowNodes?: (ids: string[]) => Promise<boolean> | boolean | void;
  onDeleteWorkflowNodes?: (ids: string[]) => void;
  onContinueComicDrama?: (nodeId: string) => void;
  onRetryComicCharacter?: (node: ComicCharacterNode) => void;
  onRunGenerationNode?: (
    node: BoardGenerationNode,
    resolved: { prompt: string; images: GeneratedImage[]; sourceNodeIds: string[]; versionConflicts?: string[] }
  ) => Promise<GeneratedImage[]>;
  onImportGenerationReferences?: (
    files: File[],
    target: GenerationReferencePlacementTarget
  ) => Promise<GeneratedImage[]>;
  onRunVideoGenerationNode?: (
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
  ) => Promise<void>;
  onDownloadVideo?: (video: GeneratedVideo) => Promise<void> | void;
  onExtractVideoFrame?: (video: GeneratedVideo, frameDataUrl: string) => Promise<void> | void;
  onRevealVideo?: (video: GeneratedVideo) => Promise<void> | void;
  onChooseVideoReferenceAudio?: (nodeId: string) => void;
  onRemoveVideoReferenceAudio?: (nodeId: string, audioPath: string) => void;
  onSelectVideoVersion?: (nodeId: string, versionIndex: number) => void;
  onCreateVideoIteration?: (nodeId: string, mode: "extend" | "remix") => void;
  onCompareVideoVersions?: (nodeId: string, leftIndex: number, rightIndex: number) => void;
  onStopVideoPolling?: (nodeId: string) => void;
  onResumeVideoPolling?: (nodeId: string) => void;
  comments?: AssetComment[];
  /** 画板恢复时的节点坐标（按节点 id），没有记录的节点走自动排布。 */
  initialPositions?: Record<string, CanvasNodeLayout>;
  /** 画板恢复时的视口；提供时不做初始 fitView。 */
  initialViewport?: BoardViewport;
  /** 画板恢复时的节点连接关系。 */
  initialConnections?: BoardConnection[];
  /** 外部连接仅写入 ref 时，用于通知已 memo 的画布重新投影。 */
  connectionRevision?: number;
  /** 右侧常驻面板占用的屏幕宽度，用于保持画布可见右边界稳定。 */
  rightRailInset?: number;
  /** 布局（坐标/视口）变化时上报，供画板自动保存。 */
  onCanvasChange?: (
    positions: Record<string, CanvasNodeLayout>,
    viewport: BoardViewport,
    connections: BoardConnection[]
  ) => void;
  focusKey?: string | null;
  focusNonce?: number;
  selectionTargetIds?: string[];
  selectionTargetNonce?: number;
  canEditImages?: boolean;
  useThumbnailPreview?: boolean;
  showMinimap?: boolean;
  onShowMinimapChange?: (visible: boolean) => void;
  imageToolbarOnHover?: boolean;
  relationshipHoverHighlight?: boolean;
  copyImageFormat?: CopyImageFormat;
  imageDoubleClickAction?: ImageDoubleClickAction;
  /** 评论模式：光标换成评论气泡、禁用节点拖拽，点击图片触发 onCommentImage。 */
  commentMode?: boolean;
  onCommentImage?: (
    image: GeneratedImage,
    clientX: number,
    clientY: number,
    position: NonNullable<AssetComment["position"]>
  ) => void;
  onOpenComments?: () => void;
  onMoveComment?: (id: string, position: NonNullable<AssetComment["position"]>) => void;
  onDeleteComment?: (id: string) => void;
  /** 删除画布图片（生成/上传）：由上层弹确认框。传入选中或指定节点的 id。 */
  onRequestDelete?: (ids: string[]) => Promise<boolean> | boolean | void;
  onSave: (path: string) => Promise<void> | void;
  onQuickShareImage?: (images: GeneratedImage[]) => void;
  onRemoveBackground?: (image: GeneratedImage) => Promise<void> | void;
  onUseReference: (image: GeneratedImage) => void;
  /** 将当前多选中的可用图片批量加入参考图。 */
  onUseReferences: (images: GeneratedImage[]) => Promise<void> | void;
  /** 参考图达到上限时禁用批量加入入口。 */
  canAddReferences?: boolean;
  /** 当前提示词输入区已经引用的画板节点，用于显示节点级参考状态。 */
  referenceNodeIds?: string[];
  referenceCount?: number;
  /** 将当前多选中的可用图片打包为 ZIP 下载。 */
  onDownloadImages: (images: GeneratedImage[]) => Promise<void> | void;
  /** 将当前多选中的图片按微信表情规范导出。 */
  onExportWechatImages?: (images: GeneratedImage[]) => void;
  /** 将当前多选中的可用图片按画布阅读顺序创建为镜头序列。 */
  onCreateVideoSequence?: (images: GeneratedImage[]) => Promise<void> | void;
  /** 将按画布阅读顺序选择的完成视频直接创建为合并序列。 */
  onCreateVideoAssembly?: (videos: BoardVideoNode[]) => Promise<void> | void;
  onOpenVideoSequence?: (sequenceId: string) => Promise<void> | void;
  onReconstructInMasterGo?: (image: GeneratedImage) => void;
  onEditImage?: (image: GeneratedImage) => void;
  onSliceImage?: (image: GeneratedImage) => void;
  onSaveAsTemplate?: (image: GeneratedImage) => void;
  /** 由模板生成的图片节点，用于显示其来源模板入口。 */
  sourceTemplateImageIds?: string[];
  onOpenSourceTemplate?: (image: GeneratedImage) => void;
  onViewImageDetails?: (image: GeneratedImage) => void;
  onSwitchVersion?: (imageId: string, index: number) => void;
  onSeparateVersions?: (
    imageId: string,
    versionIndex: number | undefined,
    placement: VersionSeparationPlacement
  ) => void;
  /** 画板处于前景时才接管系统复制粘贴。 */
  clipboardEnabled?: boolean;
  restoreSnapshot?: CanvasRestoreSnapshot | null;
  onBeforeCanvasChange?: (snapshot: CanvasSelectionSnapshot) => void;
  /** 撤销/重做：回调携带当前节点的实时快照，供上层压入对向历史栈。 */
  onUndo?: (current: CanvasSelectionSnapshot) => void;
  onRedo?: (current: CanvasSelectionSnapshot) => void;
  onPasteImages: (items: CanvasClipboardItem[], action?: "paste" | "duplicate") => void;
  onDropImages: (payload: { files: File[]; imageUrls: string[]; position?: CanvasDropPoint }) => void;
  /** 仅在画板数据恢复完成、且已确认当前画板为空时展示空画板入口。 */
  showEmptyCanvasStart: boolean;
  emptyCanvasSuggestedMode: EmptyCanvasMode;
  promptFocused: boolean;
  onStartPrompt: (prompt?: string) => void;
  onAddRecentAssets: (assets: AssetLibraryItem[]) => void;
  onOpenAssetLibrary: () => void;
  showDemoStart: boolean;
  onOpenDemoStart: () => void;
  onOpenShortcutHelp?: () => void;
  /** 画板空闲时按 Esc 退出当前画板。 */
  onExitCanvas?: () => void;
}

export function CanvasBoard({
  images,
  workflowNodes = [],
  videoUrls = {},
  activeImageProvider,
  videoProviders = [],
  activeVideoProviderId,
  goldBeanBalance,
  goldBeanLoading = false,
  videoGoldBeanCostPerSecond,
  advancedVideoModesEnabled = false,
  onStartComicDrama,
  comicDramaBoard = false,
  onOpenComicDramaProject,
  onCreateWorkflowNode,
  onUpdateWorkflowNode,
  onSelectionChange,
  onRequestDeleteWorkflowNodes,
  onDeleteWorkflowNodes,
  onContinueComicDrama,
  onRetryComicCharacter,
  onRunGenerationNode,
  onImportGenerationReferences,
  onRunVideoGenerationNode,
  onDownloadVideo,
  onExtractVideoFrame,
  onRevealVideo,
  onChooseVideoReferenceAudio,
  onRemoveVideoReferenceAudio,
  onSelectVideoVersion,
  onCreateVideoIteration,
  onCompareVideoVersions,
  onStopVideoPolling,
  onResumeVideoPolling,
  comments = [],
  initialPositions,
  initialViewport,
  initialConnections = EMPTY_CONNECTIONS,
  connectionRevision,
  rightRailInset = 0,
  onCanvasChange,
  focusKey,
  focusNonce,
  selectionTargetIds,
  selectionTargetNonce,
  canEditImages,
  useThumbnailPreview = false,
  showMinimap = true,
  onShowMinimapChange,
  imageToolbarOnHover = false,
  relationshipHoverHighlight = false,
  copyImageFormat = "png",
  imageDoubleClickAction = "edit",
  commentMode,
  onCommentImage,
  onOpenComments,
  onMoveComment,
  onDeleteComment,
  onRequestDelete,
  onSave,
  onQuickShareImage,
  onRemoveBackground,
  onUseReference,
  onUseReferences,
  canAddReferences = true,
  referenceNodeIds = [],
  referenceCount = 0,
  onDownloadImages,
  onExportWechatImages,
  onCreateVideoSequence,
  onCreateVideoAssembly,
  onOpenVideoSequence,
  onReconstructInMasterGo,
  onEditImage,
  onSliceImage,
  onSaveAsTemplate,
  sourceTemplateImageIds = [],
  onOpenSourceTemplate,
  onViewImageDetails,
  onSwitchVersion,
  onSeparateVersions,
  clipboardEnabled = true,
  restoreSnapshot,
  onBeforeCanvasChange,
  onUndo,
  onRedo,
  onPasteImages,
  onDropImages,
  showEmptyCanvasStart,
  emptyCanvasSuggestedMode,
  promptFocused,
  onStartPrompt,
  onAddRecentAssets,
  onOpenAssetLibrary,
  showDemoStart,
  onOpenDemoStart,
  onOpenShortcutHelp,
  onExitCanvas
}: CanvasBoardProps): React.ReactElement {
  const uiText = useUiText();

  const { fitView, setCenter, setViewport, zoomTo, getViewport, screenToFlowPosition } = useReactFlow();
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const {
  nodes,
  setNodes,
  onNodesChange,
  edges,
  setEdges,
  onEdgesChange,
  reportCanvasState,
  scheduleCanvasReport,
  recordCanvasChange
} = useCanvasController({
    initialConnections,
    nodesRef,
    edgesRef,
    rightRailInset,
    getViewport,
    onCanvasChange,
    onBeforeCanvasChange
  });
  const wheelInteraction = useMemo(() => resolveCanvasWheelInteraction(), []);
  const reduceMotion = Boolean(useReducedMotion());
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasToolMode, setCanvasToolMode] = useState<CanvasToolMode>("select");
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const root = canvasContainerRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!root || commentMode || event.defaultPrevented ||
        target?.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],[role=dialog],[role=menu],[data-radix-popper-content-wrapper]") ||
        (!root.matches(":hover") && !root.contains(document.activeElement))) return;
      const mode = canvasToolShortcut(event);
      if (mode) { event.preventDefault(); setCanvasToolMode(mode); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commentMode]);
  const getCanvasBounds = useCallback(
    (): DOMRect | null => canvasContainerRef.current?.getBoundingClientRect() ?? null,
    []
  );
  const initialPositionsRef = useRef(initialPositions);
  const initialConnectionsRef = useRef<BoardConnection[] | null>(null);
  const initialConnectionsRevisionRef = useRef<number | undefined>(undefined);
  const handleDropImages = useCallback((payload: CanvasDropPayload): void => {
    onDropImages(payload);
  }, [onDropImages]);
  const dropController = useCanvasDropController({
    getViewport,
    screenToFlowPosition,
    recordCanvasChange,
    onDropImages: handleDropImages
  });
  const referencedNodeIdSet = useMemo(() => new Set(referenceNodeIds), [referenceNodeIds]);
  const sourceTemplateImageIdSet = useMemo(() => new Set(sourceTemplateImageIds), [sourceTemplateImageIds]);
  const hasQuickShareHandler = Boolean(onQuickShareImage);

  const handleInvalidConnection = useCallback((): void => {
    toast.error(translateSourceText("这两个节点的端口类型不兼容。"));
  }, []);
  const connectionMutations = useCanvasConnectionMutations({
    nodesRef,
    edgesRef,
    setEdges,
    recordCanvasChange,
    scheduleCanvasReport,
    onInvalidConnection: handleInvalidConnection
  });
  const handlePasteGenerationReferences = useCallback(async (nodeId: string, files: File[]): Promise<void> => {
    if (!onImportGenerationReferences || files.length === 0) return;
    const target = nodesRef.current.find((node) => node.id === nodeId && node.type === "generationNode");
    if (!target) return;
    const referenceCount = ((target.data as unknown as GenerationNodeData).referenceImages ?? []).length;
    const availableSlots = Math.max(0, 4 - referenceCount);
    if (availableSlots === 0) {
      toast.error(translateSourceText("图片生成节点最多连接 4 张参考图。"));
      return;
    }
    const accepted = files.slice(0, availableSlots);
    recordCanvasChange();
    const placementTarget: GenerationReferencePlacementTarget = {
      x: target.position.x,
      y: target.position.y,
      width: nodeRenderedWidth(target),
      height: nodeRenderedHeight(target)
    };
    try {
      const imported = await onImportGenerationReferences(accepted, placementTarget);
      if (imported.length === 0) return;
      if (!nodesRef.current.some((node) => node.id === nodeId && node.type === "generationNode")) return;
      const additions = imported.map((image) => edgeFromConnection({
        id: crypto.randomUUID(),
        source: image.id,
        target: nodeId,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        kind: "reference",
        label: "参考",
        style: { dash: "dashed", endMarker: "arrow" },
        sourceAnchor: { side: "right", ratio: 0.5, mode: "auto" },
        targetAnchor: { side: "left", ratio: 0.5, mode: "auto" },
        routing: { mode: "auto", kind: "curved", waypoints: [] }
      }));
      setEdges((current) => {
        const next = [...current, ...additions];
        edgesRef.current = next;
        return next;
      });
      scheduleCanvasReport();
      const skipped = files.length - accepted.length;
      toast.success(skipped > 0
        ? translateSourceText("已粘贴 {{ui:0}} 张参考图，另有 {{ui:1}} 张超过上限", [imported.length, skipped])
        : translateSourceText("已粘贴并连接 {{ui:0}} 张参考图", [imported.length]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translateSourceText("参考图粘贴失败。"));
    }
  }, [onImportGenerationReferences, recordCanvasChange, scheduleCanvasReport, setEdges]);
  const getViewportZoom = useCallback((): number => getViewport().zoom, [getViewport]);
  const getCanvasNodes = useCallback((): Node[] => nodesRef.current, []);
  const getCanvasEdges = useCallback((): Edge[] => edgesRef.current, []);
  const updateCanvasNodes = useCallback((updater: (current: readonly Node[]) => Node[]): void => {
    setNodes((current) => {
      const next = updater(current);
      nodesRef.current = next;
      return next;
    });
  }, [setNodes]);
  const updateSelectionNodes = useCallback((updater: (current: readonly Node[]) => Node[]): void => {
    const next = updater(nodesRef.current);
    nodesRef.current = next;
    setNodes(next);
  }, [setNodes]);
  const updateSelectionEdges = useCallback((updater: (current: readonly Edge[]) => Edge[]): void => {
    const next = updater(edgesRef.current);
    edgesRef.current = next;
    setEdges(next);
  }, [setEdges]);
  const handleBeforeNodeLayoutChange = useCallback((snapshot: CanvasSelectionSnapshot): void => {
    onBeforeCanvasChange?.(snapshot);
  }, [onBeforeCanvasChange]);
  const {
  onNodeDragStart: handleNodeDragStart,
  onNodeDrag: handleNodeDrag,
  onNodeDragStop: handleNodeDragStop,
  onNodeResizeStart: handleNodeResizeStart,
  onNodeResizeEnd: handleNodeResizeEnd,
  helperLines,
  draggingNodeIds,
  userPositionedNodeIds
} = useCanvasNodeLayoutInteractions({
    getNodes: getCanvasNodes,
    getEdges: getCanvasEdges,
    updateNodes: updateCanvasNodes,
    getZoom: getViewportZoom,
    onBeforeCanvasChange: handleBeforeNodeLayoutChange,
    reportCanvasState,
    scheduleCanvasReport
  });
  const {
    actions: connectionEdgeActions,
    hasActiveTransaction: hasActiveConnectionTransaction
  } = useCanvasConnectionEdgeActions({
    nodesRef,
    edgesRef,
    setEdges,
    recordCanvasChange,
    scheduleCanvasReport,
    onBeforeCanvasChange
  });

  const [viewportMoving, setViewportMoving] = useState(false);
  const { renderedEdges } = useCanvasConnectionPresentation({
    nodes,
    edges,
    edgesRef,
    setEdges,
    draggingNodeIds,
    viewportMoving,
    scheduleCanvasReport
  });

  const relationshipController = useCanvasRelationshipController({
    containerRef: canvasContainerRef,
    getNodes: getCanvasNodes,
    getEdges: getCanvasEdges,
    updateEdges: updateSelectionEdges,
    screenToFlowPosition,
    commentMode: Boolean(commentMode),
    hoverHighlightEnabled: relationshipHoverHighlight
  });

  const renderedNodes = nodes;

  useEffect(() => {
    if (nodes.length === 0 && initialConnections.length > 0) return;
    if (
      initialConnectionsRef.current === initialConnections
      && initialConnectionsRevisionRef.current === connectionRevision
    ) return;
    initialConnectionsRef.current = initialConnections;
    initialConnectionsRevisionRef.current = connectionRevision;
    const next = initialConnections.map((connection) => edgeFromConnection(connection));
    edgesRef.current = next;
    setEdges(next);
  }, [connectionRevision, initialConnections, nodes.length, setEdges]);

  const commentsByImagePath = useMemo(() => {
    const grouped = new Map<string, AssetComment[]>();
    for (const comment of comments) {
      const current = grouped.get(comment.imagePath);
      if (current) current.push(comment);
      else grouped.set(comment.imagePath, [comment]);
    }
    return grouped;
  }, [comments]);

  // 评论模式下点击图片：同时记录屏幕坐标和图片内归一化坐标。
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node): void => {
      if (!commentMode || !onCommentImage || !isImageCanvasNode(node)) return;
      const image = (node.data as unknown as ImageNodeData).image;
      if (image.pending) return;
      const imageNode = (event.target as Element).closest<HTMLElement>("[data-image-node]");
      const rect = imageNode?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      onCommentImage(image, event.clientX, event.clientY, {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
      });
    },
    [commentMode, onCommentImage]
  );

  const handleNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node): void => {
      if (commentMode || !isImageCanvasNode(node) || (event.target as Element).closest("button, input, textarea, select")) return;
      const image = (node.data as unknown as ImageNodeData).image;
      if (image.pending) return;

      if (imageDoubleClickAction === "focus") {
        const zoom = Math.max(getViewport().zoom, DOUBLE_CLICK_FOCUS_ZOOM);
        const centerX = node.position.x + nodeRenderedWidth(node) / 2;
        const centerY = node.position.y + nodeRenderedHeight(node) / 2;
        void setCenter(centerX, centerY, { zoom, duration: 400 });
        return;
      }

      if (imageDoubleClickAction === "reference") {
        onUseReference(image);
        return;
      }

      if (canEditImages) onEditImage?.(image);
    },
    [canEditImages, commentMode, getViewport, imageDoubleClickAction, onEditImage, onUseReference, setCenter]
  );

  const handleCopyImage = useCallback((): void => {
    if (!clipboardEnabled) return;
    if (!document.execCommand("copy")) {
      toast.error(translateSourceText("无法复制图片，请使用键盘快捷键重试"));
    }
  }, [clipboardEnabled]);
  const handleDeleteImage = useCallback((image: GeneratedImage) => {
    onRequestDelete?.([imageKey(image)]);
  }, [onRequestDelete]);

  const selectionImageActions = useMemo(() => ({
    duplicateImages: onPasteImages,
    requestDeleteImages: onRequestDelete,
    useReferences: onUseReferences,
    downloadImages: onDownloadImages,
    exportWechatImages: onExportWechatImages,
    canAddReferences
  }), [
    canAddReferences,
    onDownloadImages,
    onExportWechatImages,
    onPasteImages,
    onRequestDelete,
    onUseReferences
  ]);
  const selectionWorkflowActions = useMemo(() => ({
    createNode: onCreateWorkflowNode,
    requestDeleteNodes: onRequestDeleteWorkflowNodes,
    deleteNodes: onDeleteWorkflowNodes
  }), [onCreateWorkflowNode, onDeleteWorkflowNodes, onRequestDeleteWorkflowNodes]);
  const selectionActions = useCanvasSelectionActions({
    nodes,
    referencedNodeIds: referencedNodeIdSet,
    getNodes: getCanvasNodes,
    getEdges: getCanvasEdges,
    updateNodes: updateSelectionNodes,
    updateEdges: updateSelectionEdges,
    recordCanvasChange,
    reportCanvasChange: scheduleCanvasReport,
    imageActions: selectionImageActions,
    workflowActions: selectionWorkflowActions
  });
  const {
  duplicateNodes,
  arrangeSelectedNodes,
  deleteNodes: deleteNodesFromCanvas,
  useSelectedReferences: handleUseSelectedReferences,
  downloadSelectedImages: handleDownloadSelectedImages,
  exportWechatSelectedImages: handleExportWechatSelectedImages,
  isAddingReferences,
  isDownloading
} = selectionActions;

  const notifyMenu = useCallback((level: "info" | "error", message: string): void => {
    if (level === "error") toast.error(message);
    else toast.info(message);
  }, []);
  const menuController = useCanvasMenuController({
    commentMode: Boolean(commentMode),
    allowedCreateTypes: comicDramaBoard
      ? ["textNode", "generationNode", "videoGenerationNode", "comicSettingNode", "comicCharacterNode", "comicSegmentNode"]
      : ["textNode", "generationNode", "videoGenerationNode"],
    getNodes: getCanvasNodes,
    getCanvasBounds,
    screenToFlowPosition,
    recordCanvasChange,
    createWorkflowNode: onCreateWorkflowNode,
    connect: connectionMutations.connect,
    duplicate: duplicateNodes,
    deleteTargets: deleteNodesFromCanvas,
    notify: notifyMenu
  });
  const freeConnectionGesture = useFreeConnectionGesture({
    nodesRef,
    screenToFlowPosition,
    getZoom: getViewportZoom,
    connect: connectionMutations.connect,
    openNodeCreateMenu: menuController.openNodeCreateMenu
  });
  const onFreeConnectionHandlePointerDown = freeConnectionGesture.onHandlePointerDown;
  const handleConnectionHandlePointerDown = useCallback<typeof onFreeConnectionHandlePointerDown>((...args) => {
    if (canvasToolMode === "pan" || commentMode) return;
    onFreeConnectionHandlePointerDown(...args);
  }, [canvasToolMode, commentMode, onFreeConnectionHandlePointerDown]);
  const connectionTargetPresentations = freeConnectionGesture.presentation;

  const handleDuplicateImage = useCallback((image: GeneratedImage): void => {
    const node = nodesRef.current.find((candidate) => candidate.id === imageKey(image));
    if (node) duplicateNodes([node]);
  }, [duplicateNodes]);

  const updateWorkflowNodes = useCallback((updater: (current: readonly Node[]) => Node[]): void => {
    const next = updater(nodesRef.current);
    nodesRef.current = next;
    setNodes(next);
  }, [setNodes]);
  const updateWorkflowEdges = useCallback((updater: (current: readonly Edge[]) => Edge[]): void => {
    const next = updater(edgesRef.current);
    edgesRef.current = next;
    setEdges(next);
  }, [setEdges]);
  const notifyWorkflowError = useCallback((message: string): void => {
    toast.error(message);
  }, []);
  const imageWorkflowNodes = useMemo(
    () => workflowNodes.filter((node): node is BoardTextNode | BoardGenerationNode => (
      node.type === "text" || node.type === "generation"
    )),
    [workflowNodes]
  );
  const workflowNodeActions = useCanvasWorkflowNodeActions({
    workflowNodes: imageWorkflowNodes,
    getNodes: getCanvasNodes,
    getEdges: getCanvasEdges,
    updateNodes: updateWorkflowNodes,
    updateEdges: updateWorkflowEdges,
    onUpdate: onUpdateWorkflowNode,
    onRun: onRunGenerationNode,
    recordCanvasChange,
    reportCanvasChange: scheduleCanvasReport,
    notifyError: notifyWorkflowError
  });

  const nodeBindingHandlers = useCanvasNodeBindings({
    image: {
      onCopy: handleCopyImage,
      onDuplicate: handleDuplicateImage,
      onSave,
      onQuickShare: onQuickShareImage,
      onExportWechat: onExportWechatImages,
      onReconstructInMasterGo,
      onRemoveBackground,
      onUseReference,
      onEdit: onEditImage,
      onSlice: onSliceImage,
      onSaveAsTemplate,
      onOpenSourceTemplate,
      onViewDetails: onViewImageDetails,
      onSwitchVersion,
      onSeparateVersions,
      onDelete: onRequestDelete ? handleDeleteImage : undefined
    },
    workflow: workflowNodeActions,
    comment: {
      onOpenComments,
      onMoveComment,
      onDeleteComment
    },
    connection: {
      onConnectionHandlePointerDown: handleConnectionHandlePointerDown
    },
    layout: {
      onResizeStart: handleNodeResizeStart,
      onResizeEnd: handleNodeResizeEnd
    }
  });

  const nodeProjectionBindings = useMemo<CanvasNodeProjectionBindings>(() => ({
    imageData: (image) => ({
      comments: image.path ? commentsByImagePath.get(image.path) ?? EMPTY_ASSET_COMMENTS : EMPTY_ASSET_COMMENTS,
      connectionRevision: initialConnections
        .filter((connection) => connection.source === image.id || connection.target === image.id)
        .map((connection) => connection.id)
        .sort()
        .join("|"),
      ...nodeBindingHandlers.comment,
      canEdit: canEditImages,
      useThumbnailPreview,
      imageToolbarOnHover,
      copyImageFormat,
      ...nodeBindingHandlers.image,
      canAddReference: canAddReferences,
      isReference: referencedNodeIdSet.has(imageKey(image)),
      onOpenSourceTemplate: sourceTemplateImageIdSet.has(imageKey(image))
        ? nodeBindingHandlers.image.onOpenSourceTemplate
        : undefined,
      resizable: !commentMode,
      ...nodeBindingHandlers.layout,
      ...nodeBindingHandlers.connection
    }),
    textData: (workflowNode, context) => ({
      text: workflowNode.text,
      title: workflowNode.title,
      displayHeight: context.displayHeight,
      heightMode: workflowNode.heightMode ?? "auto",
      ...nodeBindingHandlers.workflow.text,
      ...nodeBindingHandlers.connection
    }),
    generationData: (workflowNode, context) => ({
      prompt: workflowNode.prompt ?? "",
      model: workflowNode.model ?? "",
      size: workflowNode.size ?? "1024x1024",
      count: workflowNode.count ?? 1,
      provider: activeImageProvider,
      status: workflowNode.status ?? "idle",
      error: workflowNode.error,
      lastGenerationId: workflowNode.lastGenerationId,
      latestGenerationId: workflowNode.latestGenerationId,
      comicFrameRole: workflowNode.comicFrameRole,
      onAdopt: (id, versionId) => {
        recordCanvasChange();
        onUpdateWorkflowNode?.(id, { lastGenerationId: versionId });
        updateWorkflowEdges((current) => current.map((edge) => edge.source === id && edge.data?.kind === "reference"
          ? { ...edge, data: { ...edge.data, versionBinding: { mode: "pinned", versionId } } }
          : edge));
        scheduleCanvasReport();
      },
      displayHeight: context.displayHeight,
      heightMode: workflowNode.heightMode ?? "auto",
      ...nodeBindingHandlers.workflow.generation,
      onPasteReferenceImages: handlePasteGenerationReferences,
      ...nodeBindingHandlers.connection
    }),
    videoData: (workflowNode) => {
      const bindVideoActions = (versions: GeneratedVideo[], activeVersionIndex: number) => ({
        onDownload: onDownloadVideo,
        onExtractFrame: onExtractVideoFrame,
        onReveal: onRevealVideo,
        onSelectVersion: onSelectVideoVersion
          ? (_version: GeneratedVideo, index: number) => onSelectVideoVersion(workflowNode.id, index)
          : undefined,
        onExtend: advancedVideoModesEnabled && onCreateVideoIteration
          ? () => onCreateVideoIteration(workflowNode.id, "extend")
          : undefined,
        onRemix: advancedVideoModesEnabled && onCreateVideoIteration
          ? () => onCreateVideoIteration(workflowNode.id, "remix")
          : undefined,
        onCompareVersions: onCompareVideoVersions
          ? (left: GeneratedVideo, right: GeneratedVideo) => {
              const leftIndex = versions.findIndex((candidate) => candidate.id === left.id);
              const rightIndex = versions.findIndex((candidate) => candidate.id === right.id);
              if (leftIndex >= 0 && rightIndex >= 0) onCompareVideoVersions(workflowNode.id, leftIndex, rightIndex);
            }
          : undefined,
        activeVersionIndex
      });
      if ("video" in workflowNode) {
        const versions = [workflowNode.video];
        return {
          video: workflowNode.video,
          versions,
          ...bindVideoActions(versions, 0),
          ...nodeBindingHandlers.connection
        };
      }
      const boardVideoNode: BoardVideoNode = workflowNode;
      const generationSource = workflowNodes.find((candidate): candidate is BoardVideoGenerationNode => (
        candidate.type === "video-generation" && candidate.id === boardVideoNode.generationNodeId
      ));
      const inheritedAspectRatio = boardVideoNode.aspectRatio
        ?? generationSource?.aspectRatio;
      const versions: GeneratedVideo[] = boardVideoNode.versions?.length
        ? boardVideoNode.versions.map((version, index) => ({
            id: `${workflowNode.id}-v${index + 1}`,
            path: version.videoPath,
            dataUrl: videoUrls[version.videoPath] ?? "",
            posterPath: version.posterPath,
            posterDataUrl: version.posterPath ? videoUrls[version.posterPath] : undefined,
            width: version.width,
            height: version.height,
            aspectRatio: version.aspectRatio ?? inheritedAspectRatio,
            durationMs: version.durationMs,
            mimeType: version.mimeType,
            version: index + 1,
            title: boardVideoNode.title,
            status: "completed"
          }))
        : [{
            id: boardVideoNode.id,
            path: boardVideoNode.videoPath,
            dataUrl: videoUrls[boardVideoNode.videoPath] ?? "",
            posterPath: boardVideoNode.posterPath,
            posterDataUrl: boardVideoNode.posterPath ? videoUrls[boardVideoNode.posterPath] : undefined,
            width: boardVideoNode.width,
            height: boardVideoNode.height,
            aspectRatio: inheritedAspectRatio,
            durationMs: boardVideoNode.durationMs,
            mimeType: boardVideoNode.mimeType,
            version: 1,
            title: boardVideoNode.title,
            status: boardVideoNode.status ?? (boardVideoNode.videoPath ? "completed" : "draft"),
            error: boardVideoNode.error
          }];
      const requestedActiveIndex = boardVideoNode.activeVersion ?? 0;
      const activeVersionIndex = Math.min(Math.max(0, requestedActiveIndex), versions.length - 1);
      return {
        video: versions[activeVersionIndex],
        versions,
        ...bindVideoActions(versions, activeVersionIndex),
        ...nodeBindingHandlers.connection
      };
    },
    comicDramaData: (workflowNode) => ({
      node: workflowNode,
      editRequest: workflowNode.id === focusKey ? focusNonce : 0,
      connectionRevision: initialConnections
        .filter((connection) => connection.source === workflowNode.id || connection.target === workflowNode.id)
        .map((connection) => connection.id)
        .sort()
        .join("|"),
      onChange: onUpdateWorkflowNode,
      onContinueComicDrama,
      onRetryCharacter: onRetryComicCharacter,
      ...nodeBindingHandlers.connection
    }),
    comicDramaEntryData: (workflowNode) => ({
      node: workflowNode,
      onOpen: onOpenComicDramaProject,
      onDelete: (nodeId) => {
        const target = getCanvasNodes().find((node) => node.id === nodeId);
        if (target) void deleteNodesFromCanvas([target]);
      }
    }),
    videoSequenceEntryData: (workflowNode) => ({
      node: workflowNode,
      onOpen: onOpenVideoSequence
    }),
    videoGenerationData: (workflowNode) => {
      const resolved = resolveVideoGenerationPresentation(
        workflowNode.id,
        nodesRef.current,
        edgesRef.current
      );
      const run = (id: string, config: VideoGenerationNodeConfig) => {
        const source = workflowNodes.find((candidate): candidate is BoardVideoGenerationNode => (
          candidate.id === id && candidate.type === "video-generation"
        ));
        if (!source || !onRunVideoGenerationNode) return;
        void onRunVideoGenerationNode({ ...source, ...config }, {
          prompt: resolved.prompt.trim() || config.prompt.trim(),
          images: resolved.images,
          sourceNodeIds: resolved.sourceNodeIds,
          versionConflicts: resolved.versionConflicts,
          startFrame: resolved.startFrame,
          endFrame: resolved.endFrame,
          referenceImages: resolved.referenceImages,
          referenceVideos: resolved.referenceVideos,
        requiresFirstLastFrame: resolved.requiresFirstLastFrame
        });
      };
      return {
        mode: workflowNode.mode ?? "generate",
        advancedVideoModesEnabled,
        prompt: workflowNode.prompt ?? "",
        providerId: workflowNode.providerId ?? activeVideoProviderId ?? "",
        sourceVideoPath: workflowNode.sourceVideoPath,
        providerOptions: videoProviders,
        requiresFirstLastFrame: resolved.requiresFirstLastFrame,
        goldBeanBalance,
        goldBeanLoading,
        videoGoldBeanCostPerSecond,
        model: workflowNode.model ?? "",
        duration: workflowNode.duration ?? 5,
        aspectRatio: workflowNode.aspectRatio ?? "16:9",
        resolution: workflowNode.resolution ?? "720p",
        generateAudio: workflowNode.generateAudio ?? false,
        status: workflowNode.status ?? "draft",
        error: workflowNode.error,
        lastGenerationId: workflowNode.lastGenerationId,
        startFrame: resolved.startFrame,
        endFrame: resolved.endFrame,
        referenceImages: resolved.referenceImages,
        referenceVideos: mergeVideoReferences(
          resolved.referenceVideos,
          [workflowNode.sourceVideoPath, ...(workflowNode.referenceVideoPaths ?? [])]
            .filter((path): path is string => Boolean(path))
            .map((path, index) => videoReferenceFromPath(path, index, videoUrls))
        ),
        referenceAudios: (workflowNode.referenceAudioPaths ?? []).map((path, index): AudioReferenceInput => ({
          id: `audio-reference-${workflowNode.id}-${index}`,
          name: workflowNode.referenceAudioNames?.[path] || path.split(/[\\/]/).pop() || `参考音频 ${index + 1}`,
          path
        })),
        onBeforeChange: recordCanvasChange,
        onChange: onUpdateWorkflowNode,
        onRun: run,
        onRetry: run,
        onStopPolling: onStopVideoPolling,
        onResumePolling: onResumeVideoPolling,
        onChooseAudio: onChooseVideoReferenceAudio,
        onRemoveAudio: onRemoveVideoReferenceAudio
          ? (nodeId, audio) => onRemoveVideoReferenceAudio(nodeId, audio.path)
          : undefined
      };
    }
  }), [
    activeImageProvider,
    activeVideoProviderId,
    advancedVideoModesEnabled,
    canAddReferences,
    canEditImages,
    commentMode,
    commentsByImagePath,
    copyImageFormat,
    goldBeanBalance,
    goldBeanLoading,
    focusKey,
    focusNonce,
    getCanvasNodes,
    handlePasteGenerationReferences,
    imageToolbarOnHover,
    initialConnections,
    nodeBindingHandlers,
    onContinueComicDrama,
    onOpenComicDramaProject,
    onDownloadVideo,
    onExtractVideoFrame,
    onRevealVideo,
    onChooseVideoReferenceAudio,
    onRemoveVideoReferenceAudio,
    onRetryComicCharacter,
    onSelectVideoVersion,
    onCreateVideoIteration,
    onCompareVideoVersions,
    onStopVideoPolling,
    onResumeVideoPolling,
    onOpenVideoSequence,
    onRunVideoGenerationNode,
    onUpdateWorkflowNode,
    recordCanvasChange,
    referencedNodeIdSet,
    deleteNodesFromCanvas,
    sourceTemplateImageIdSet,
    scheduleCanvasReport,
    updateWorkflowEdges,
    useThumbnailPreview,
    videoGoldBeanCostPerSecond,
    videoUrls,
    videoProviders,
    workflowNodes
  ]);

  useEffect(() => {
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const presentation = connectionTargetPresentations.get(node.id);
        const active = presentation?.connectionTargetActive;
        const handles = presentation?.compatibleConnectionHandles;
        const snapHandle = presentation?.connectionSnapTargetHandle;
        const previousHandles = node.data.compatibleConnectionHandles as readonly string[] | undefined;
        const handlesEqual = previousHandles === handles
          || Boolean(
            previousHandles
            && handles
            && previousHandles.length === handles.length
            && previousHandles.every((handle, index) => handle === handles[index])
          );
        if (
          node.data.connectionTargetActive === active
          && handlesEqual
          && node.data.connectionSnapTargetHandle === snapHandle
        ) return node;
        changed = true;
        return {
          ...node,
          data: {
            ...node.data,
            connectionTargetActive: active,
            compatibleConnectionHandles: handles,
            connectionSnapTargetHandle: snapHandle
          }
        };
      });
      if (changed) nodesRef.current = next;
      return changed ? next : current;
    });
  }, [connectionTargetPresentations, nodesRef, setNodes]);

  useEffect(() => {
    const previousNodes = nodesRef.current;
    const result = projectCanvasNodes({
      previousNodes,
      images,
      workflowNodes,
      edges,
      initialLayouts: initialPositionsRef.current,
      userPositionedNodeIds,
      bindings: nodeProjectionBindings
    });
    if (result.nodes === previousNodes) return;
    nodesRef.current = result.nodes;
    setNodes(result.nodes);
    if (result.layoutChanged && result.nodes.length === previousNodes.length) {
      scheduleCanvasReport();
    }
  }, [
    edges,
    images,
    userPositionedNodeIds,
    nodeProjectionBindings,
    scheduleCanvasReport,
    setNodes,
    workflowNodes
  ]);

  // 节点增删（含新节点自动落位）后上报一次布局；拖拽和平移由 ReactFlow 回调上报。
  useEffect(() => {
    reportCanvasState();
  }, [nodes.length, reportCanvasState]);

  const imageNodeIds = useMemo(() => images.map(imageKey), [images]);
  const contentNodeIds = useMemo(
    () => [...imageNodeIds, ...workflowNodes.map((node) => node.id)],
    [imageNodeIds, workflowNodes]
  );
  const preserveViewportNodeIds = useMemo(
    () => new Set(images.filter((image) => image.preserveViewportOnCreate).map(imageKey)),
    [images]
  );
  const viewportController = useCanvasViewportController({
    containerRef: canvasContainerRef,
    imageNodeIds,
    contentNodeIds,
    preserveViewportNodeIds,
    initialViewport,
    rightRailInset,
    focusKey,
    focusNonce,
    selectionTargetIds,
    selectionTargetNonce,
    getNodes: getCanvasNodes,
    updateNodes: updateCanvasNodes,
    getViewport,
    setViewport,
    setCenter,
    fitView,
    zoomTo,
    reportCanvasState
  });
  const fitAllCanvas = viewportController.fitAll;
  const fitViewportSelection = viewportController.fitSelection;
  const fitNodesAbovePromptDock = useCallback((targetNodes: Node[]): void => {
    fitViewportSelection(targetNodes);
  }, [fitViewportSelection]);

  useEffect(() => {
    if (!restoreSnapshot) return;
    const selectedIds = new Set(restoreSnapshot.selectedIds);
    const selectedConnectionIds = new Set(restoreSnapshot.selectedConnectionIds ?? []);
    setNodes((current) => {
      const next = current.map((node) => ({
        ...node,
        position: restoreSnapshot.positions[node.id] ?? node.position,
        width: restoreSnapshot.positions[node.id]?.width ?? node.width,
        height: restoreSnapshot.positions[node.id]?.width && isImageCanvasNode(node)
          ? imageNodeHeight(nodeImage(node)) * restoreSnapshot.positions[node.id].width! / IMAGE_NODE_WIDTH
          : restoreSnapshot.positions[node.id]?.height ?? node.height,
        selected: selectedIds.has(node.id)
      }));
      nodesRef.current = next;
      return next;
    });
    if (restoreSnapshot.connections) {
      const next = restoreSnapshot.connections.map((connection) =>
        edgeFromConnection(connection, selectedConnectionIds.has(connection.id))
      );
      edgesRef.current = next;
      setEdges(next);
    }
    scheduleCanvasReport();
  }, [reportCanvasState, restoreSnapshot, scheduleCanvasReport, setEdges, setNodes]);

  const handleClipboardPasteImages = useCallback((items: CanvasClipboardItem[]): void => {
    onPasteImages(items);
  }, [onPasteImages]);
  const handleClipboardDropImages = useCallback((payload: CanvasClipboardDropPayload): void => {
    onDropImages(payload);
  }, [onDropImages]);
  const handleClipboardText = useCallback((position: CanvasDropPoint, text: string): void => {
    onCreateWorkflowNode?.("text", position, { text });
  }, [onCreateWorkflowNode]);
  const handleClipboardCopied = useCallback((count: number, shortcut: string): void => {
    iterlayToast.copied({ count, shortcut });
  }, []);
  const handleClipboardNotice = useCallback((message: string): void => {
    toast.info(message);
  }, []);
  const clipboardController = useCanvasClipboardController({
    enabled: clipboardEnabled,
    getNodes: getCanvasNodes,
    getCanvasBounds,
    screenToFlowPosition,
    recordCanvasChange,
    onPasteImages: handleClipboardPasteImages,
    onDropImages: handleClipboardDropImages,
    createText: onCreateWorkflowNode ? handleClipboardText : undefined,
    notifyCopied: handleClipboardCopied,
    notify: handleClipboardNotice
  });

  const availableShortcutAssetActions = useMemo<ReadonlySet<CanvasOptionalAssetShortcut>>(() => {
    const actions = new Set<CanvasOptionalAssetShortcut>();
    if (canEditImages && onEditImage) actions.add("edit");
    if (onSliceImage) actions.add("slice");
    if (onViewImageDetails) actions.add("view-details");
    if (onSaveAsTemplate) actions.add("save-as-template");
    if (onExportWechatImages) actions.add("export-wechat");
    if (onQuickShareImage) actions.add("quick-share");
    if (onRemoveBackground) actions.add("remove-background");
    if (onSwitchVersion) actions.add("switch-version");
    return actions;
  }, [
    canEditImages,
    onEditImage,
    onExportWechatImages,
    onQuickShareImage,
    onRemoveBackground,
    onSaveAsTemplate,
    onSliceImage,
    onSwitchVersion,
    onViewImageDetails
  ]);
  const createWorkflowNode = useCallback((type: "text" | "generation" | "video-generation" | "comic-setting" | "comic-character" | "comic-segment-script"): void => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    recordCanvasChange();
    const viewportCenter = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
    const comicNodeCount = nodesRef.current.filter((node) => (
      node.type === "comicSettingNode"
      || node.type === "comicCharacterNode"
      || node.type === "comicSegmentNode"
    )).length;
    const comicOffset = {
      x: (comicNodeCount % 4) * 28,
      y: (comicNodeCount % 4) * 24
    };
    const position = type === "video-generation"
      ? centerNodeAtDrop(
          viewportCenter,
          VIDEO_GENERATION_NODE_WIDTH,
          VIDEO_GENERATION_NODE_WIDTH,
          VIDEO_GENERATION_NODE_HEIGHT
        )
      : type === "comic-setting" || type === "comic-character" || type === "comic-segment-script"
        ? { x: viewportCenter.x + comicOffset.x, y: viewportCenter.y + comicOffset.y }
      : viewportCenter;
    onCreateWorkflowNode?.(type, position, { focusOnCreate: true });
  }, [onCreateWorkflowNode, recordCanvasChange, screenToFlowPosition]);

  const getShortcutSnapshot = useCallback((): CanvasShortcutSnapshot => ({
    enabled: clipboardEnabled,
    commentMode: Boolean(commentMode),
    gestureActive: hasActiveConnectionTransaction(),
    canAddReferences,
    availableAssetActions: availableShortcutAssetActions,
    availableCreateTypes: onCreateWorkflowNode ? (comicDramaBoard ? ["video-generation"] : ["generation", "video-generation", "text"]) : [],
    nodes: nodesRef.current,
    edges: edgesRef.current
  }), [
    availableShortcutAssetActions,
    onCreateWorkflowNode,
    comicDramaBoard,
    canAddReferences,
    clipboardEnabled,
    commentMode,
    hasActiveConnectionTransaction
  ]);

  const notifyShortcutImageCopied = useCallback((): void => {
    iterlayToast.copied({ title: translateSourceText("已复制图片"), detail: translateSourceText("可粘贴到其他应用") });
  }, []);
  const notifyShortcutImageCopyFailed = useCallback((): void => {
    toast.error(translateSourceText("无法复制图片到剪贴板"));
  }, []);
  const rejectCanvasShortcut = useCallback((message: string): void => {
    toast(message);
  }, []);
  const shortcutCommandApi = useCanvasCommandApi({
    createNode: createWorkflowNode,
    selection: {
      updateNodes: updateSelectionNodes,
      updateEdges: updateSelectionEdges,
      deleteTargets: deleteNodesFromCanvas,
      duplicateNodes,
      useSelectedReferences: handleUseSelectedReferences,
      exportWechatSelectedImages: handleExportWechatSelectedImages
    },
    history: {
      undo: onUndo,
      redo: onRedo
    },
    viewport: {
      fitCanvas: fitAllCanvas,
      fitSelection: fitNodesAbovePromptDock
    },
    assets: {
      copyImage: copyImageDataUrlToClipboard,
      copyImageFormat,
      notifyImageCopied: notifyShortcutImageCopied,
      notifyImageCopyFailed: notifyShortcutImageCopyFailed,
      editImage: onEditImage,
      sliceImage: onSliceImage,
      viewImageDetails: onViewImageDetails,
      saveAsTemplate: onSaveAsTemplate,
      quickShareImage: onQuickShareImage,
      downloadOriginal: onSave,
      removeBackground: onRemoveBackground,
      switchVersion: onSwitchVersion
    },
    shell: {
      reject: rejectCanvasShortcut,
      exitCanvas: onExitCanvas,
      openShortcutHelp: onOpenShortcutHelp,
      focusPrompt: onStartPrompt
    }
  });
  useCanvasShortcutController({
    getSnapshot: getShortcutSnapshot,
    commandApi: shortcutCommandApi
  });

  const miniMapImages = useMemo(
    () => new Map(images.map((image) => [imageKey(image), {
      path: image.path || undefined,
      dataUrl: image.dataUrl || undefined
    }])),
    [images]
  );
  const {
  selectedNodes,
  selectedImageNodes,
  selectedReadyCount,
  selectedReferenceCandidateCount,
  selectedDownloadableCount,
  selectedShareableImages
} = selectionActions.selection;
  const reportedSelectionRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!onSelectionChange) return;
    const selectedIds = selectedNodes.map((node) => node.id);
    if (
      reportedSelectionRef.current
      && sameCanvasNodeSelection(reportedSelectionRef.current, selectedIds)
    ) return;
    reportedSelectionRef.current = selectedIds;
    onSelectionChange(selectedIds);
  }, [onSelectionChange, selectedNodes]);
  const selectedSequenceImages = useMemo(() => selectedImageNodes
    .filter((node) => {
      const image = (node.data as unknown as ImageNodeData).image;
      return !image.pending && Boolean(image.path);
    })
    .sort((left, right) => {
      const rowTolerance = 48;
      const yDelta = left.position.y - right.position.y;
      return Math.abs(yDelta) > rowTolerance ? yDelta : left.position.x - right.position.x;
    })
    .map((node) => (node.data as unknown as ImageNodeData).image), [selectedImageNodes]);
  const selectedAssemblyVideos = useMemo(() => selectedNodes
    .map((node) => ({ node, persisted: workflowNodes.find((item) => item.id === node.id) }))
    .filter((item): item is { node: Node; persisted: BoardVideoNode } => Boolean(
      item.persisted
      && item.persisted.type === "video"
      && !("video" in item.persisted)
      && item.persisted.videoPath
      && (!item.persisted.status || item.persisted.status === "completed")
    ))
    .sort((left, right) => {
      const yDelta = left.node.position.y - right.node.position.y;
      return Math.abs(yDelta) > 48 ? yDelta : left.node.position.x - right.node.position.x;
    })
    .map((item) => item.persisted), [selectedNodes, workflowNodes]);
  const shareDisabled = selectedShareableImages.length === 0;
  const downloadDisabled = selectedDownloadableCount === 0 || isDownloading;
  const referenceDisabled = !canAddReferences || selectedReferenceCandidateCount === 0 || isAddingReferences;
  const referenceTooltip = !canAddReferences
    ? "参考图已达 4 张上限"
    : selectedReadyCount === 0
      ? "生成中的图片暂不能加入参考"
      : selectedReferenceCandidateCount === 0
        ? "所选图片已在参考图中"
      : `将所选图片加入参考 · R · 当前 ${referenceCount}/4`;

  const handleEmptyCanvasFiles = useCallback((files: File[]): void => {
    if (files.length === 0) return;
    recordCanvasChange();
    onDropImages({ files, imageUrls: [] });
  }, [onDropImages, recordCanvasChange]);


  const startComicDrama = useCallback((): void => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    recordCanvasChange();
    onStartComicDrama?.(screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
  }, [onStartComicDrama, recordCanvasChange, screenToFlowPosition]);

  const fitSelectedNodes = useCallback((): void => {
    const selected = nodesRef.current.filter((node) => node.selected);
    if (!selected.length) return;
    fitNodesAbovePromptDock(selected);
  }, [fitNodesAbovePromptDock]);

  return (
    <TooltipProvider delayDuration={200}>
    <div
      ref={canvasContainerRef}
      className={cn(
        "relative h-full w-full",
        canvasToolMode === "pan" && !commentMode && "canvas-mode-pan",
        commentMode && "comment-mode"
      )}
      {...dropController.rootHandlers}
      {...clipboardController.rootHandlers}
      {...menuController.rootHandlers}
      onPointerDownCapture={relationshipController.onCanvasPointerDownCapture}
      onMouseDownCapture={preventMiddleMouseAutoScroll}
    >
      <CanvasToolHintProvider delayDuration={400} skipDelayDuration={100}>
      <div className="canvas-mode-toolbar" data-canvas-create-toolbar="" role="toolbar" aria-label={uiText("画布工具")}>
        <CanvasToolHint kind="select"><button type="button" aria-keyshortcuts={CANVAS_TOOL_HINTS.select.aria} aria-label={uiText("选择 (V)")} aria-pressed={canvasToolMode === "select"} disabled={Boolean(commentMode)} onClick={() => setCanvasToolMode("select")}><MousePointer2 /></button></CanvasToolHint>
        <CanvasToolHint kind="pan"><button type="button" aria-keyshortcuts={CANVAS_TOOL_HINTS.pan.aria} aria-label={uiText("平移 (H)")} aria-pressed={canvasToolMode === "pan"} disabled={Boolean(commentMode)} onClick={() => setCanvasToolMode("pan")}><Hand /></button></CanvasToolHint>
        {!comicDramaBoard ? <span className="canvas-tool-divider" /> : null}
        {onCreateWorkflowNode && !comicDramaBoard ?
          <CanvasToolHint kind="image"><button type="button" aria-keyshortcuts={CANVAS_TOOL_HINTS.image.aria} aria-label={uiText("生成图片")} onClick={() => createWorkflowNode("generation")}><ImagePlus /></button></CanvasToolHint>
        : null}
        {onCreateWorkflowNode ? <CanvasToolHint kind="video"><button type="button" aria-keyshortcuts={CANVAS_TOOL_HINTS.video.aria} aria-label={uiText("生成视频")} onClick={() => createWorkflowNode("video-generation")}><Video /></button></CanvasToolHint> : null}
        {onCreateWorkflowNode && !comicDramaBoard ?
          <CanvasToolHint kind="text"><button type="button" aria-keyshortcuts={CANVAS_TOOL_HINTS.text.aria} aria-label={uiText("添加文本")} onClick={() => createWorkflowNode("text")}><Type /></button></CanvasToolHint>
        : null}
        <CanvasToolHint kind="fit"><button type="button" aria-keyshortcuts={CANVAS_TOOL_HINTS.fit.aria} aria-label={uiText("适应画布")} onClick={viewportController.fitAll}><Maximize /></button></CanvasToolHint>
        {onCreateWorkflowNode && onStartComicDrama ? <details><CanvasToolHint kind="more"><summary aria-label={uiText("更多画布工具")}><MoreHorizontal /></summary></CanvasToolHint><div>
          <button type="button" onClick={startComicDrama}><Clapperboard />{comicDramaBoard ? uiText("打开漫剧设定") : uiText("新建漫剧项目")}</button>
          {comicDramaBoard ? <>
            <button type="button" onClick={() => createWorkflowNode("comic-character")}><ImagePlus />{uiText("添加角色卡")}</button>
            <button type="button" onClick={() => createWorkflowNode("comic-segment-script")}><Video />{uiText("添加片段卡")}</button>
          </> : null}
        </div></details> : null}
      </div>
      </CanvasToolHintProvider>
      <CanvasSurface
        flowProps={{
          nodes: renderedNodes,
          edges: renderedEdges,
          onNodesChange,
          onEdgesChange,
          onConnect: connectionMutations.onConnect,
          onReconnect: connectionMutations.onReconnect,
          onEdgeClick: (event, edge) => canvasToolMode === "select" && connectionEdgeActions.select(
            edge.id,
            event.shiftKey || event.metaKey || event.ctrlKey
          ),
          onNodeDragStart: handleNodeDragStart,
          onNodeDrag: handleNodeDrag,
          onNodeDragStop: handleNodeDragStop,
          onNodeClick: handleNodeClick,
          onNodeDoubleClick: canvasToolMode === "select" ? handleNodeDoubleClick : undefined,
          onNodeMouseEnter: relationshipController.onNodeMouseEnter,
          onNodeMouseLeave: relationshipController.onNodeMouseLeave,
          ...menuController.flowHandlers,
          onMoveStart: () => {
            setViewportMoving(true);
            menuController.nodeCreateMenu?.onClose();
          },
          onMoveEnd: (_event, viewport) => {
            setViewportMoving(false);
            viewportController.onMoveEnd(viewport);
          }
        }}
        selectedNodeCount={selectedNodes.length}
        connectionActions={connectionEdgeActions}
        commentMode={Boolean(commentMode)}
        toolMode={canvasToolMode}
        initialViewport={initialViewport}
        shouldFitInitialView={viewportController.shouldFitInitialView}
        fitViewOptions={CANVAS_FIT_VIEW_OPTIONS}
        wheelInteraction={wheelInteraction}
      >
        <CanvasViewportOverlays
          freeConnectionDrag={freeConnectionGesture.drag ?? menuController.connectionPreview}
          helperLines={helperLines}
        />
        <CanvasSelectionToolbar
          selectedNodes={selectedImageNodes}
          commentMode={Boolean(commentMode)}
          selectedReadyCount={selectedReadyCount}
          selectedDownloadableCount={selectedDownloadableCount}
          selectedReferenceCandidateCount={selectedReferenceCandidateCount}
          selectedShareableImages={selectedShareableImages}
          showWechatExport={Boolean(onExportWechatImages)}
          showQuickShare={hasQuickShareHandler}
          showCreateSequence={Boolean(onCreateVideoSequence)}
          sequenceImageCount={selectedSequenceImages.length}
          isDownloading={isDownloading}
          isAddingReferences={isAddingReferences}
          downloadDisabled={downloadDisabled}
          referenceDisabled={referenceDisabled}
          shareDisabled={shareDisabled}
          referenceTooltip={referenceTooltip}
          onArrange={arrangeSelectedNodes}
          onDuplicate={duplicateNodes}
          onExportWechat={handleExportWechatSelectedImages}
          onQuickShare={(selectedImages) => onQuickShareImage?.(selectedImages)}
          onDownload={() => void handleDownloadSelectedImages()}
          onUseReferences={() => void handleUseSelectedReferences()}
          onCreateSequence={() => void onCreateVideoSequence?.(selectedSequenceImages)}
        />
        <CanvasVideoMergeToolbar
          nodeIds={selectedAssemblyVideos.map((video) => video.id)}
          count={selectedAssemblyVideos.length}
          onMerge={() => void onCreateVideoAssembly?.(selectedAssemblyVideos)}
        />
        <CanvasMiniMap
          visible={showMinimap && nodes.length > 0}
          images={miniMapImages}
          reduceMotion={reduceMotion}
        />
      </CanvasSurface>

      <CanvasZoomToolbar
        zoom={viewportController.zoom}
        onZoomChange={viewportController.onZoomChange}
        onFitAll={viewportController.fitAll}
        onFitSelection={fitSelectedNodes}
        onToggleMiniMap={() => onShowMinimapChange?.(!showMinimap)}
        hasSelection={selectedNodes.length > 0}
        miniMapOpen={showMinimap}
      />

      {menuController.nodeCreateMenu ? (
        <CanvasNodeCreateMenu {...menuController.nodeCreateMenu} />
      ) : null}
      {menuController.contextMenu ? (
        <CanvasContextMenu {...menuController.contextMenu} />
      ) : null}

      <CanvasEmptyState
        visible={showEmptyCanvasStart && images.length === 0 && workflowNodes.length === 0 && !dropController.preview}
        reduceMotion={reduceMotion}
        suggestedMode={emptyCanvasSuggestedMode}
        promptFocused={promptFocused}
        pasteShortcut={clipboardController.pasteShortcut}
        showDemoStart={showDemoStart}
        onChooseFiles={handleEmptyCanvasFiles}
        onPaste={clipboardController.pasteFromSystemClipboard}
        onStartPrompt={onStartPrompt}
        onAddRecentAssets={onAddRecentAssets}
        onOpenAssetLibrary={onOpenAssetLibrary}
        onOpenDemoStart={onOpenDemoStart}
      />
      <CanvasDropTarget preview={dropController.preview} />
    </div>
    </TooltipProvider>
  );
}

export function sameCanvasNodeSelection(
  previous: readonly string[],
  next: readonly string[]
): boolean {
  return previous.length === next.length
    && previous.every((id, index) => id === next[index]);
}
