import { useUiText } from "@/i18n";
import { createContext, lazy, Suspense, useContext, useId } from "react";
import { MiniMap, NodeToolbar, Position, ViewportPortal, type MiniMapNodeProps, type Node } from "@xyflow/react";
import type { AssetLibraryItem } from "@shared/types";
import { AnimatePresence, motion } from "framer-motion";
import {
  CopyPlus,
  Download,
  GalleryHorizontal,
  GalleryVertical,
  Grid3X3,
  GripHorizontal,
  ImagePlus,
  Clapperboard,
  Link2,
  Loader2,
  Merge,
  Share2,
  Sticker
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { SelectionLayoutMode } from "./selection-layout";
import type { EmptyCanvasMode } from "./EmptyCanvasStart";
import { HelperLines } from "./HelperLines";
import type { HelperLineGuide } from "./helper-lines";
import { FreeConnectionPreviewPath, type FreeConnectionDrag } from "./ConnectionController";
import { useCanvasThumbnail } from "./use-canvas-thumbnail";
import type { GeneratedImage } from "./image-node-model";
import type { CanvasMiniMapViewProps } from "./use-canvas-minimap-controller";
import { MINIMAP_HEIGHT, MINIMAP_WIDTH } from "./canvas-minimap-model";

const LazyEmptyCanvasStart = lazy(() => import("./EmptyCanvasStart").then((module) => ({
  default: module.EmptyCanvasStart
})));

export interface CanvasDropPreview {
  x: number;
  y: number;
  width: number;
  kind: "file" | "link";
}

export function CanvasViewportOverlays({
  freeConnectionDrag,
  helperLines
}: {
  freeConnectionDrag: FreeConnectionDrag | null;
  helperLines: { horizontal: HelperLineGuide | null; vertical: HelperLineGuide | null };
}): React.ReactElement {
  return (
    <>
      {freeConnectionDrag ? (
        <ViewportPortal>
          <svg className="canvas-free-connection-preview" aria-hidden="true">
            <FreeConnectionPreviewPath drag={freeConnectionDrag} />
          </svg>
        </ViewportPortal>
      ) : null}
      {helperLines.horizontal === null && helperLines.vertical === null ? null : (
        <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
      )}
    </>
  );
}

interface CanvasSelectionToolbarProps {
  selectedNodes: Node[];
  commentMode: boolean;
  selectedReadyCount: number;
  selectedDownloadableCount: number;
  selectedReferenceCandidateCount: number;
  selectedShareableImages: GeneratedImage[];
  showWechatExport: boolean;
  showQuickShare: boolean;
  showCreateSequence: boolean;
  sequenceImageCount: number;
  isDownloading: boolean;
  isAddingReferences: boolean;
  downloadDisabled: boolean;
  referenceDisabled: boolean;
  shareDisabled: boolean;
  referenceTooltip: string;
  onArrange: (mode: SelectionLayoutMode) => void;
  onDuplicate: (nodes: Node[]) => void;
  onExportWechat: () => void;
  onQuickShare: (images: GeneratedImage[]) => void;
  onDownload: () => void;
  onUseReferences: () => void;
  onCreateSequence: () => void;
}

export function CanvasVideoMergeToolbar({ nodeIds, count, onMerge }: {
  nodeIds: string[];
  count: number;
  onMerge: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  return <NodeToolbar nodeId={nodeIds} isVisible={count >= 2} position={Position.Top} offset={12} className="nodrag nopan">
    <div role="toolbar" aria-label={uiText("所选 {{ui:0}} 个视频的批量操作", [count])} className="flex items-center gap-2 rounded-lg border border-border bg-popover p-1 pl-2.5 text-popover-foreground shadow-md" onPointerDown={(event) => event.stopPropagation()}>
      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{uiText("已选 ")}{count} {uiText("个完成视频")}</span>
      <button type="button" className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground" onClick={onMerge}><Merge className="h-4 w-4" />{uiText("合并视频 · ")}{count}</button>
    </div>
  </NodeToolbar>;
}

const ICON_BUTTON_CLASS = "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 active:scale-95";

export function CanvasSelectionToolbar(props: CanvasSelectionToolbarProps): React.ReactElement {
  const uiText = useUiText();

  const { selectedNodes } = props;
  return (
    <NodeToolbar
      nodeId={selectedNodes.map((node) => node.id)}
      isVisible={!props.commentMode && selectedNodes.length > 1}
      position={Position.Top}
      offset={12}
      className="nodrag nopan"
    >
      <div
        role="toolbar"
        aria-label={uiText("所选 {{ui:0}} 张图片的批量操作", [selectedNodes.length])}
        className="flex select-none items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{uiText("已选 ")}{selectedNodes.length} {uiText("张")}</span>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <ToolbarIcon title={uiText("横向排列")} onClick={() => props.onArrange("horizontal")}><GalleryHorizontal className="h-4 w-4" /></ToolbarIcon>
        <ToolbarIcon title={uiText("纵向排列")} onClick={() => props.onArrange("vertical")}><GalleryVertical className="h-4 w-4" /></ToolbarIcon>
        <ToolbarIcon title={uiText("表格排列")} onClick={() => props.onArrange("grid")}><Grid3X3 className="h-4 w-4" /></ToolbarIcon>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <ToolbarIcon title={uiText("创建副本 · ⌘/Ctrl D")} disabled={props.selectedReadyCount === 0} onClick={() => props.onDuplicate(selectedNodes)}>
          <CopyPlus className="h-4 w-4" />
        </ToolbarIcon>
        {props.showWechatExport ? (
          <ToolbarIcon
            title={props.selectedDownloadableCount > 0 ? uiText("将 {{ui:0}} 张图片导出为微信表情", [props.selectedDownloadableCount]) : uiText("所选图片暂不可导出")}
            disabled={props.selectedDownloadableCount === 0}
            onClick={props.onExportWechat}
          >
            <Sticker className="h-4 w-4" />
          </ToolbarIcon>
        ) : null}
        {props.showQuickShare ? (
          <ToolbarIcon
            title={props.selectedShareableImages.length > 0 ? uiText("在线分享 {{ui:0}} 张图片", [props.selectedShareableImages.length]) : uiText("所选图片暂不可分享")}
            disabled={props.shareDisabled}
            onClick={() => props.onQuickShare(props.selectedShareableImages)}
          >
            <Share2 className="h-4 w-4" />
          </ToolbarIcon>
        ) : null}
        <ToolbarIcon
          title={props.selectedDownloadableCount > 0 ? uiText("将 {{ui:0}} 张图片打包为 ZIP", [props.selectedDownloadableCount]) : uiText("所选图片暂不可下载")}
          disabled={props.downloadDisabled}
          onClick={props.onDownload}
        >
          {props.isDownloading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}
        </ToolbarIcon>
        {props.showCreateSequence ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <button
                  type="button"
                  disabled={props.sequenceImageCount < 2}
                  onClick={props.onCreateSequence}
                  className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
                  aria-label={uiText("创建镜头序列")}
                >
                  <Clapperboard className="h-3.5 w-3.5" aria-hidden />
                  {uiText("创建序列")}{props.sequenceImageCount > 1 ? ` · ${props.sequenceImageCount}` : ""}
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {props.sequenceImageCount < 2 ? uiText("至少选择 2 张可用图片") : uiText("按画布位置创建镜头序列")}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                disabled={props.referenceDisabled}
                onClick={props.onUseReferences}
                aria-label={uiText("将所选图片加入参考")}
                className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]"
              >
                {props.isAddingReferences ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {uiText("加入参考")}{props.selectedReferenceCandidateCount > 1 ? ` · ${props.selectedReferenceCandidateCount}` : ""}
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{props.referenceTooltip}</TooltipContent>
        </Tooltip>
      </div>
    </NodeToolbar>
  );
}

function ToolbarIcon({ title, disabled, onClick, children }: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button type="button" aria-label={title} disabled={disabled} onClick={onClick} className={ICON_BUTTON_CLASS}>{children}</button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{title}</TooltipContent>
    </Tooltip>
  );
}

export interface MiniMapImagePreview {
  path?: string;
  dataUrl?: string;
}

const MiniMapImagesContext = createContext<ReadonlyMap<string, MiniMapImagePreview>>(new Map());

function MiniMapImageNode({ id, x, y, width, height, borderRadius, className, selected, onClick }: MiniMapNodeProps): React.ReactElement {
  const image = useContext(MiniMapImagesContext).get(id);
  const thumbnailUrl = useCanvasThumbnail(image?.path, image?.dataUrl, 192);
  const clipId = `canvas-minimap-image-${useId().replace(/:/g, "")}`;
  const radius = Math.min(borderRadius, width / 2, height / 2);

  return (
    <g className={cn("react-flow__minimap-node", selected && "selected", className)} onClick={onClick ? (event) => onClick(event, id) : undefined}>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={x} y={y} width={width} height={height} rx={radius} ry={radius} /></clipPath></defs>
      <rect x={x} y={y} width={width} height={height} rx={radius} ry={radius} fill="hsl(var(--muted-foreground) / 0.24)" />
      {thumbnailUrl ? <image href={thumbnailUrl} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} /> : null}
      <rect x={x} y={y} width={width} height={height} rx={radius} ry={radius} fill="none" stroke={selected ? "hsl(var(--foreground))" : "hsl(var(--background) / 0.72)"} strokeWidth={selected ? 2 : 0.75} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

interface CanvasMiniMapProps {
  visible: boolean;
  images: ReadonlyMap<string, MiniMapImagePreview>;
  reduceMotion: boolean;
  controller: CanvasMiniMapViewProps;
}

export function CanvasMiniMap(props: CanvasMiniMapProps): React.ReactElement {
  const uiText = useUiText();

  const controller = props.controller;
  return (
    <AnimatePresence initial={false}>
      {props.visible && controller.position ? (
        <motion.div
          key="canvas-minimap"
          data-canvas-minimap=""
          className={cn(
            "nodrag nopan absolute z-[6] transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none",
            controller.isPositionDragging && "shadow-[0_0_0_4px_hsl(var(--muted-foreground)/0.14)]"
          )}
          style={{ left: controller.position.x, top: controller.position.y, width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT, transformOrigin: "top center" }}
          initial={props.reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98, filter: "blur(4px)" }}
          animate={props.reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={props.reduceMotion ? { opacity: 0, transition: { duration: 0.08 } } : { opacity: 0, y: 6, scale: 0.985, filter: "blur(3px)", transition: { duration: 0.16, ease: EASE_OUT } }}
          transition={{ duration: props.reduceMotion ? 0.1 : 0.22, ease: EASE_OUT }}
        >
          <MiniMapImagesContext.Provider value={props.images}>
            <MiniMap position="top-left" pannable={false} zoomable={false} ariaLabel="画布图片预览" className="pointer-events-none !m-0 overflow-hidden !rounded-xl !border !border-border !bg-card shadow-lg" style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT, left: 0, top: 0 }} bgColor="transparent" maskColor="hsl(var(--foreground) / 0.06)" maskStrokeWidth={0} nodeComponent={MiniMapImageNode} nodeBorderRadius={4} />
          </MiniMapImagesContext.Provider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={uiText("移动画布小地图")} data-minimap-position-handle="" className={cn("nodrag nopan absolute z-[7] flex h-4 w-8 -translate-x-1/2 touch-none select-none items-center justify-center overflow-hidden rounded bg-foreground/[0.035] text-foreground/25 transition-[width,color,background-color] duration-150 ease-out hover:w-10 hover:bg-foreground/[0.075] hover:text-foreground/45 focus-visible:w-10 focus-visible:bg-foreground/10 focus-visible:text-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-foreground/10 motion-reduce:transition-none [-webkit-app-region:no-drag]", controller.isPositionDragging ? "cursor-grabbing" : "cursor-move")} style={{ left: MINIMAP_WIDTH / 2, top: 7 }} onPointerDown={controller.onPositionPointerDown} onPointerMove={controller.onPositionPointerMove} onPointerUp={controller.onPositionPointerUp} onPointerCancel={controller.onPositionPointerCancel} onLostPointerCapture={controller.onPositionLostCapture}>
                <GripHorizontal className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{uiText("拖动小地图")}</TooltipContent>
          </Tooltip>
          <div role="application" aria-label={uiText("拖动画布缩略图以移动视口")} tabIndex={0} data-minimap-interaction-layer="" className={cn("nodrag nopan absolute z-[6] touch-none select-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag]", controller.isDragging ? "cursor-grabbing" : "cursor-grab")} style={{ left: 0, top: 0, width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }} onPointerDown={controller.onPointerDown} onPointerMove={controller.onPointerMove} onPointerUp={controller.onPointerUp} onPointerCancel={controller.onPointerCancel} onLostPointerCapture={controller.onLostCapture} onWheel={controller.onWheel} onKeyDown={controller.onKeyDown} onClick={(event) => event.currentTarget.focus()} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

interface CanvasEmptyStateProps {
  visible: boolean;
  reduceMotion: boolean;
  suggestedMode: EmptyCanvasMode;
  promptFocused: boolean;
  pasteShortcut: string;
  showDemoStart: boolean;
  onChooseFiles: (files: File[]) => void;
  onPaste: () => Promise<void>;
  onStartPrompt: (prompt?: string) => void;
  onAddRecentAssets: (assets: AssetLibraryItem[]) => void;
  onOpenAssetLibrary: () => void;
  onOpenDemoStart: () => void;
}

export function CanvasEmptyState(props: CanvasEmptyStateProps): React.ReactElement {
  return (
    <AnimatePresence initial={false}>
      {props.visible ? (
        <motion.div key="empty-canvas-start" initial={props.reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={props.reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.975, filter: "blur(2px)" }} transition={{ duration: props.reduceMotion ? 0.1 : 0.2, ease: EASE_OUT }} className="empty-canvas-shell pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-4 pb-48 pt-16">
          <Suspense fallback={<CanvasEmptyStateLoadingFallback />}>
            <LazyEmptyCanvasStart suggestedMode={props.suggestedMode} promptFocused={props.promptFocused} pasteShortcut={props.pasteShortcut} onChooseFiles={props.onChooseFiles} onPaste={props.onPaste} onStartPrompt={props.onStartPrompt} onAddRecentAssets={props.onAddRecentAssets} onOpenAssetLibrary={props.onOpenAssetLibrary} showDemoStart={props.showDemoStart} onOpenDemoStart={props.onOpenDemoStart} />
          </Suspense>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function CanvasEmptyStateLoadingFallback(): React.ReactElement {
  const uiText = useUiText();

  return (
    <div
      role="status"
      data-canvas-empty-loading=""
      className="flex h-[385px] w-full max-w-[880px] items-center justify-center text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
      <span className="sr-only">{uiText("正在加载画板起始选项")}</span>
    </div>
  );
}

export function CanvasDropTarget({ preview }: { preview: CanvasDropPreview | null }): React.ReactElement | null {
  const uiText = useUiText();

  if (!preview) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      <div className="absolute flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-foreground/55 bg-card text-foreground shadow-lg" style={{ left: preview.x, top: preview.y, width: preview.width, transform: "translate(-50%, -50%)" }}>
        <div className="flex flex-col items-center gap-2 text-center">
          {preview.kind === "link" ? <Link2 className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-xs font-medium">{preview.kind === "link" ? uiText("图片链接") : uiText("图片")}</span>
        </div>
      </div>
    </div>
  );
}
