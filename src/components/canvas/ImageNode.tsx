import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, NodeResizeControl, Position, useStore, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { toast } from "sonner";
import { Clock3, ChevronDown, ChevronUp, Loader2, MessageSquareText, Plus, Scissors, TriangleAlert } from "lucide-react";
import type { AssetComment, CopyImageFormat } from "@shared/types";
import { cn } from "@/lib/utils";
import { getGenerationTiming } from "@/lib/generation-timing";
import { MAX_CONCURRENT_GENERATIONS } from "@/lib/generation-queue";
import { shouldShowImageToolbar } from "./image-toolbar-visibility";
import {
  IMAGE_NODE_MAX_WIDTH,
  IMAGE_NODE_MIN_WIDTH,
  IMAGE_NODE_WIDTH,
  getPendingEditCount,
  imageNodeHeight,
  type GeneratedImage,
  type VersionSeparationPlacement
} from "./image-node-model";
import { ImageNodeComments } from "./image-node/ImageNodeComments";
import { ImageNodeToolbar } from "./image-node/ImageNodeToolbar";
import { ImageNodeVersions } from "./image-node/ImageNodeVersions";
import { useImageNodeSource } from "./image-node/use-image-node-source";
import { useDelayedConnectionPoints } from "./use-delayed-connection-points";
import type { ConnectionTargetPresentation } from "./connection-target-presentation";

export {
  IMAGE_NODE_MAX_WIDTH,
  IMAGE_NODE_MIN_WIDTH,
  IMAGE_NODE_WIDTH,
  getPendingEditCount,
  imageKey,
  imageNodeHeight
} from "./image-node-model";
export type { GeneratedImage, ImageVersion, VersionSeparationPlacement } from "./image-node-model";

export interface ImageNodeData extends ConnectionTargetPresentation {
  image: GeneratedImage;
  comments?: AssetComment[];
  onOpenComments?: () => void;
  onMoveComment?: (id: string, position: NonNullable<AssetComment["position"]>) => void;
  onDeleteComment?: (id: string) => void;
  canEdit?: boolean;
  useThumbnailPreview?: boolean;
  imageToolbarOnHover?: boolean;
  copyImageFormat?: CopyImageFormat;
  onCopy: () => void;
  onDuplicate?: (image: GeneratedImage) => void;
  onSave: (path: string) => Promise<void> | void;
  onQuickShare?: (images: GeneratedImage[]) => void;
  onExportWechat?: (images: GeneratedImage[]) => void;
  onReconstructInMasterGo?: (image: GeneratedImage) => void;
  onRemoveBackground?: (image: GeneratedImage) => Promise<void> | void;
  onUseReference: (image: GeneratedImage) => void;
  canAddReference?: boolean;
  isReference?: boolean;
  onEdit?: (image: GeneratedImage) => void;
  onSlice?: (image: GeneratedImage) => void;
  onSaveAsTemplate?: (image: GeneratedImage) => void;
  onOpenSourceTemplate?: (image: GeneratedImage) => void;
  onViewDetails?: (image: GeneratedImage) => void;
  onSwitchVersion?: (imageId: string, index: number) => void;
  onSeparateVersions?: (
    imageId: string,
    versionIndex: number | undefined,
    placement: VersionSeparationPlacement
  ) => void;
  onDelete?: (image: GeneratedImage) => void;
  resizable?: boolean;
  onResizeStart?: (imageId: string) => void;
  onResizeEnd?: (imageId: string, width: number, height: number) => void;
  onConnectionHandlePointerDown?: (
    nodeId: string,
    side: "top" | "right" | "bottom" | "left",
    clientX: number,
    clientY: number,
    pointerId: number | null
  ) => void;
  connectionRevision?: string;
}

export type { CanvasZoomTier } from "./image-node/use-image-node-source";
export { resolveCanvasZoomTier } from "./image-node/use-image-node-source";

export const CanvasSelectionCountContext = createContext(0);

function usePendingTiming(active: boolean, startedAt?: number): ReturnType<typeof getGenerationTiming> {
  const fallbackStartedAtRef = useRef(Date.now());
  const resolvedStartedAt = startedAt ?? fallbackStartedAtRef.current;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, resolvedStartedAt]);

  return getGenerationTiming(resolvedStartedAt, now);
}

function ImageNodeComponent({ data, id, selected, width, height }: NodeProps): React.ReactElement {
  const uiText = useUiText();

  const {
  image,
  comments = [],
  onOpenComments,
  onMoveComment,
  onDeleteComment,
  canEdit,
  useThumbnailPreview,
  imageToolbarOnHover = false,
  copyImageFormat = "png",
  onCopy,
  onDuplicate,
  onSave,
  onQuickShare,
  onExportWechat,
  onReconstructInMasterGo,
  onRemoveBackground,
  onUseReference,
  canAddReference = true,
  isReference = false,
  onEdit,
  onSlice,
  onSaveAsTemplate,
  onOpenSourceTemplate,
  onViewDetails,
  onSwitchVersion,
  onSeparateVersions,
  onDelete,
  resizable = true,
  onResizeStart,
  onResizeEnd,
  onConnectionHandlePointerDown,
  connectionTargetActive,
  connectionSnapTargetHandle,
  connectionRevision
} = data as unknown as ImageNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updateNodeInternals(id));
    return () => window.cancelAnimationFrame(frame);
  }, [connectionRevision, id, updateNodeInternals]);
  const [isHovered, setIsHovered] = useState(false);
  const [toolbarInteractionOpen, setToolbarInteractionOpen] = useState(false);
  const [resizeSize, setResizeSize] = useState<{ width: number; height: number } | null>(null);
  const [pendingPromptExpanded, setPendingPromptExpanded] = useState(false);
  const [pendingPromptOverflowing, setPendingPromptOverflowing] = useState(false);
  const connectionPoints = useDelayedConnectionPoints();
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const pendingPromptRef = useRef<HTMLParagraphElement>(null);
  const maxResizeNoticeShownRef = useRef(false);
  const hasMultipleSelection = useContext(CanvasSelectionCountContext) > 1;
  const { displayUrl, imageLoadFailed, zoomTier } = useImageNodeSource(
    image.path,
    image.dataUrl,
    Boolean(useThumbnailPreview)
  );
  const toolbarVisible = shouldShowImageToolbar({
    hasMultipleSelection,
    selected,
    hoverEnabled: imageToolbarOnHover,
    hovered: isHovered,
    menuOpen: toolbarInteractionOpen,
    noticeOpen: false
  });
  const showNodeChrome = zoomTier !== "low" || toolbarVisible;
  const generationQueued = image.pending && image.generationStatus === "queued";
  const pendingTiming = usePendingTiming(Boolean(image.pending) && !generationQueued, image.pendingStartedAt);
  const editingTiming = usePendingTiming(Boolean(image.editing), image.editingStartedAt);
  const pendingEditCount = getPendingEditCount(image);
  const renderedWidth = Math.max(IMAGE_NODE_MIN_WIDTH, width || IMAGE_NODE_WIDTH);
  const renderedHeight = Math.max(
    1,
    height || imageNodeHeight(image) * renderedWidth / IMAGE_NODE_WIDTH
  );

  useEffect(() => {
    setPendingPromptExpanded(false);
  }, [image.pendingPrompt]);

  useLayoutEffect(() => {
    const prompt = pendingPromptRef.current;
    if (!prompt || pendingPromptExpanded) return;
    setPendingPromptOverflowing(prompt.scrollHeight > prompt.clientHeight + 1);
  }, [image.pendingPrompt, pendingPromptExpanded, renderedHeight, renderedWidth]);

  function keepToolbarVisible(): void {
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setIsHovered(true);
  }

  function scheduleToolbarHide(): void {
    if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      hoverLeaveTimerRef.current = null;
      setIsHovered(false);
    }, 120);
  }

  useEffect(() => {
    if (imageToolbarOnHover) return;
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setIsHovered(false);
  }, [imageToolbarOnHover]);

  const handleToolbarInteractionOpenChange = useCallback((open: boolean): void => {
    setToolbarInteractionOpen(open);
  }, []);

  useEffect(() => {
    if (hasMultipleSelection) setToolbarInteractionOpen(false);
  }, [hasMultipleSelection]);

  useEffect(() => () => {
    if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
  }, []);

  if (image.pending) {
    return (
      <div
        style={{
          width: renderedWidth,
          height: renderedHeight,
          aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : "1 / 1"
        }}
        tabIndex={image.pendingPrompt || image.pendingReferenceImages?.length ? 0 : undefined}
        aria-label={image.pendingPrompt
          ? uiText("{{ui:0}}。提示词：{{ui:1}}{{ui:2}}", [generationQueued ? "排队中" : "正在生成", image.pendingPrompt, image.pendingReferenceImages?.length ? `。引用图片 ${image.pendingReferenceImages.length} 张` : ""])
          : generationQueued ? uiText("排队中") : uiText("正在生成")}
        className={cn(
          "group relative cursor-grab rounded-lg duration-500 animate-in fade-in zoom-in-95 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:animate-none",
          selected && "image-node-pending--selected"
        )}
      >
        <Handle type="target" position={Position.Left} id="system-input" className="canvas-programmatic-handle" />
        <div
          data-generation-status
          aria-busy="true"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-lg border border-border bg-card shadow-sm transition-[opacity,transform] duration-200 group-focus-within:scale-[0.98] group-focus-within:opacity-0 group-hover:scale-[0.98] group-hover:opacity-0 motion-reduce:transform-none"
        >
          {generationQueued ? (
            <Clock3 aria-hidden className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Loader2
              aria-hidden
              className="h-6 w-6 animate-spin text-muted-foreground [animation-duration:1.4s] motion-reduce:animate-none"
            />
          )}
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-xs font-medium text-foreground">{generationQueued ? uiText("排队中") : uiText("正在生成")}</span>
            {generationQueued ? (
              <p className="max-w-[13rem] text-pretty text-[11px] leading-4 text-muted-foreground">{uiText("已有 ")}{MAX_CONCURRENT_GENERATIONS} {uiText("个任务正在处理，稍后自动开始")}</p>
            ) : (
              <p className="text-[11px] leading-4 text-muted-foreground">
                {uiText("已用 ")}<time className="tabular-nums">{pendingTiming.elapsedLabel}</time>
              </p>
            )}
            {!generationQueued && pendingTiming.overdue ? (
              <p className="max-w-[13rem] text-pretty text-[11px] leading-4 text-muted-foreground">
                {uiText("比预计久一点，任务仍在处理中")}</p>
            ) : !generationQueued ? (
              <p className="text-[11px] leading-4 text-muted-foreground">
                {uiText("预计剩余 ")}<time className="tabular-nums">{pendingTiming.remainingLabel}</time>
              </p>
            ) : null}
          </div>
        </div>
        {image.pendingPrompt || image.pendingReferenceImages?.length ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex flex-col rounded-lg bg-black/90 px-4 py-3 text-white opacity-0 transition-opacity duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
              pendingPromptExpanded ? "overflow-y-auto overscroll-contain" : "overflow-hidden"
            )}
            onWheel={pendingPromptExpanded ? (event) => event.stopPropagation() : undefined}
          >
            <div className="flex shrink-0 items-center gap-1.5 border-b border-white/15 pb-2 text-[11px] font-medium text-white/70">
              <MessageSquareText aria-hidden className="h-3.5 w-3.5" />
              <span>{uiText("提示词")}</span>
            </div>
            {image.pendingPrompt ? (
              <>
                <p
                  ref={pendingPromptRef}
                  className={cn(
                    "shrink-0 whitespace-pre-wrap break-words pt-2.5 text-xs leading-5 text-white selection:bg-white/25",
                    !pendingPromptExpanded && "line-clamp-5"
                  )}
                >
                  {image.pendingPrompt}
                </p>
                {pendingPromptOverflowing ? (
                  <button
                    type="button"
                    aria-expanded={pendingPromptExpanded}
                    className="nodrag nopan mt-1.5 inline-flex w-fit shrink-0 items-center gap-1 text-[11px] font-medium text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPendingPromptExpanded((value) => !value);
                    }}
                  >
                    {pendingPromptExpanded ? uiText("收起") : uiText("查看更多")}
                    {pendingPromptExpanded
                      ? <ChevronUp aria-hidden className="h-3 w-3" />
                      : <ChevronDown aria-hidden className="h-3 w-3" />}
                  </button>
                ) : null}
              </>
            ) : null}
            {image.pendingReferenceImages?.length ? (
              <div className="mt-3 shrink-0">
                <p className="mb-2 text-[11px] font-medium text-white/70">{uiText("引用图片")}</p>
                <div className="flex flex-wrap gap-2">
                  {image.pendingReferenceImages.map((reference, index) => (
                    <div key={`${reference.name}:${index}`} className="h-12 w-12 overflow-hidden rounded-md border border-white/20 bg-white/10">
                      <img
                        src={reference.dataUrl}
                        alt={reference.name || `引用图片 ${index + 1}`}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Soft light arc gliding around the edge while the image materializes. */}
        <span aria-hidden className="pending-shimmer" />
      </div>
    );
  }

  return (
    <div
      data-image-node=""
      data-resizing={resizeSize ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-connection-points-visible={connectionPoints.visible ? "true" : undefined}
      data-connection-target-active={connectionTargetActive ? "true" : undefined}
      data-connection-snap-target={connectionSnapTargetHandle}
      style={{ width: renderedWidth, height: renderedHeight }}
      className={cn(
        "canvas-node-card image-node-card group relative overflow-visible rounded-lg border bg-card shadow-sm transition-[border-color,box-shadow] duration-200",
        selected ? "image-node-card--selected" : "border-border"
      )}
      onPointerEnter={() => {
        connectionPoints.showConnectionPoints();
        if (imageToolbarOnHover) keepToolbarVisible();
      }}
      onPointerLeave={() => {
        connectionPoints.scheduleConnectionPointsHide();
        if (imageToolbarOnHover) scheduleToolbarHide();
      }}
    >
      {([Position.Top, Position.Right, Position.Bottom, Position.Left] as const).map((position) => {
        const side = position.toLowerCase() as "top" | "right" | "bottom" | "left";
        return (
          <div key={side} className={`image-node-connection-point image-node-connection-point--${side}`}>
            <Handle
              type="target"
              position={position}
              id={`target-${side}`}
              isConnectableStart
              className="image-node-connection-handle image-node-connection-handle--target nodrag nopan"
            />
            <Handle
              type="source"
              position={position}
              id={`source-${side}`}
              isConnectableEnd
              className="image-node-connection-handle image-node-connection-handle--source nodrag nopan"
            />
            <button
              type="button"
              aria-label={uiText("从{{ui:0}}侧创建连接", [({ top: "上", right: "右", bottom: "下", left: "左" } as const)[side]])}
              className="nodrag nopan image-node-connection-trigger"
              onPointerDownCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onConnectionHandlePointerDown?.(id, side, event.clientX, event.clientY, event.pointerId);
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.detail !== 0) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onConnectionHandlePointerDown?.(
                  id,
                  side,
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                  null
                );
              }}
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <Handle type="target" position={Position.Left} id="system-input" className="canvas-programmatic-handle" />
      {!hasMultipleSelection && resizable ? (
        <NodeResizeControl
          position="bottom-right"
          minWidth={IMAGE_NODE_MIN_WIDTH}
          maxWidth={IMAGE_NODE_MAX_WIDTH}
          keepAspectRatio
          className={cn("group image-node-resize-handle", selected && "is-visible")}
          onResizeStart={(_event, params) => {
            maxResizeNoticeShownRef.current = false;
            setResizeSize({ width: params.width, height: params.height });
            onResizeStart?.(id);
          }}
          onResize={(_event, params) => {
            setResizeSize({ width: params.width, height: params.height });
            if (params.width >= IMAGE_NODE_MAX_WIDTH - 0.5 && !maxResizeNoticeShownRef.current) {
              maxResizeNoticeShownRef.current = true;
              toast.info(translateSourceText("已达到最大尺寸"), {
                id: `image-resize-max-${id}`,
                description: translateSourceText("图片最大可放大至 {{ui:0}} px 宽", [IMAGE_NODE_MAX_WIDTH])
              });
            }
          }}
          onResizeEnd={(_event, params) => {
            setResizeSize(null);
            onResizeEnd?.(id, params.width, params.height);
          }}
        >
          <span
            aria-hidden
            className="absolute bottom-1 right-1 h-3.5 w-3.5 scale-75 rounded-[4px] bg-[#e8e8e4]/0 transition-[background-color,transform] duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:bg-[#e8e8e4]/80 group-focus-visible:scale-100 group-focus-visible:bg-[#e8e8e4]/80 group-active:scale-90 group-active:bg-[#dededa] motion-reduce:transition-none dark:group-hover:bg-accent dark:group-focus-visible:bg-accent dark:group-active:bg-input"
          />
          <span
            aria-hidden
            className="relative h-2.5 w-2.5 origin-bottom-right rounded-br-[7px] border-b-[1.5px] border-r-[1.5px] border-current transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-focus-visible:scale-110 group-active:scale-100 motion-reduce:transition-none"
          />
        </NodeResizeControl>
      ) : null}
      {resizeSize ? (
        <ResizeSizeIndicator size={resizeSize} />
      ) : null}
      <div
        className="relative h-full w-full overflow-hidden rounded-[7px] bg-muted"
        style={{ aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : "1 / 1" }}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={image.source === "upload" ? uiText("上传图片") : image.source === "slice" ? uiText("切图结果") : uiText("生成结果")}
            className="h-full w-full object-cover"
            draggable={false}
            decoding="async"
          />
        ) : null}
        {imageLoadFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            <span className="px-4 text-[11px] font-medium">{uiText("图片暂时无法读取")}</span>
          </div>
        ) : null}
      </div>

      <ImageNodeComments
        comments={comments}
        onOpenComments={onOpenComments}
        onMoveComment={onMoveComment}
        onDeleteComment={onDeleteComment}
      />

      {showNodeChrome && toolbarVisible ? (
        <ImageNodeToolbar
          nodeId={id}
          image={image}
          canEdit={canEdit}
          copyImageFormat={copyImageFormat}
          canAddReference={canAddReference}
          isReference={isReference}
          hoverEnabled={imageToolbarOnHover}
          onPointerEnter={keepToolbarVisible}
          onPointerLeave={scheduleToolbarHide}
          onInteractionOpenChange={handleToolbarInteractionOpenChange}
          onCopy={onCopy}
          onDuplicate={onDuplicate}
          onSave={onSave}
          onQuickShare={onQuickShare}
          onExportWechat={onExportWechat}
          onReconstructInMasterGo={onReconstructInMasterGo}
          onRemoveBackground={onRemoveBackground}
          onUseReference={onUseReference}
          onEdit={onEdit}
          onSlice={onSlice}
          onSaveAsTemplate={onSaveAsTemplate}
          onOpenSourceTemplate={onOpenSourceTemplate}
          onViewDetails={onViewDetails}
          onDelete={onDelete}
        />
      ) : null}
      {showNodeChrome && image.source === "upload" ? (
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-opacity group-hover:opacity-0">
          {uiText("上传")}</span>
      ) : null}
      {showNodeChrome && image.source === "slice" ? (
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-opacity group-hover:opacity-0">
          <Scissors className="h-3 w-3" />
          {uiText("切图")}</span>
      ) : null}

      <ImageNodeVersions
        image={image}
        visible={showNodeChrome}
        onSwitchVersion={onSwitchVersion}
        onSeparateVersions={onSeparateVersions}
      />

      {image.editing ? (
        <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {image.queuedEditCount === pendingEditCount
            ? <Clock3 className="h-3 w-3" />
            : <Loader2 className="h-3 w-3 animate-spin" />}
          {image.queuedEditCount === pendingEditCount
            ? uiText("排队中{{ui:0}}", [pendingEditCount > 1 ? ` ${pendingEditCount} 个版本` : ""])
            : uiText("编辑中{{ui:0}}", [image.queuedEditCount ? ` · ${image.queuedEditCount} 个排队` : pendingEditCount > 1 ? ` ${pendingEditCount} 个版本` : ""])}{" "}
          {image.queuedEditCount === pendingEditCount ? null : <time className="tabular-nums">{editingTiming.elapsedLabel}</time>}
        </span>
      ) : null}
    </div>
  );
}

function ResizeSizeIndicator({ size }: { size: { width: number; height: number } }): React.ReactElement {
  const zoom = useStore((state) => state.transform[2]);
  return (
    <span
      className="image-node-size-indicator"
      style={{ top: 8 / zoom, transform: `scale(${1 / zoom})` }}
      aria-hidden="true"
    >
      {Math.round(size.width)} × {Math.round(size.height)} px
    </span>
  );
}

export const ImageNode = memo(ImageNodeComponent);
