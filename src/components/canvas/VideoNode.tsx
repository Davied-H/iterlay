import { CanvasSelectionCountContext } from "./canvas-selection-context";
import { useUiText } from "@/i18n";
import { memo, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Film,
  FolderOpen,
  ImageDown,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Shuffle,
  StepForward
} from "lucide-react";
import { Handle, NodeToolbar, Position, useStore, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveImageToolbarSide } from "./image-toolbar-position";
import { useDelayedConnectionPoints } from "./use-delayed-connection-points";
import type { ConnectionTargetPresentation } from "./connection-target-presentation";
import {
  VIDEO_NODE_MIN_WIDTH,
  VIDEO_NODE_WIDTH,
  formatVideoDuration,
  normalizedVideoVersions,
  videoAspectRatio,
  videoNodeStatusLabel,
  type GeneratedVideo,
  type VideoNodeStatus
} from "./video-node-model";

export { VIDEO_NODE_MIN_WIDTH, VIDEO_NODE_WIDTH } from "./video-node-model";
export type { GeneratedVideo, VideoNodeStatus } from "./video-node-model";

type CanvasNodeSide = "top" | "right" | "bottom" | "left";

export interface VideoNodeData extends ConnectionTargetPresentation {
  video: GeneratedVideo;
  versions?: readonly GeneratedVideo[];
  activeVersionIndex?: number;
  onMetadataLoaded?: (video: GeneratedVideo, metadata: { width: number; height: number; durationMs?: number }) => void;
  onRetry?: (video: GeneratedVideo) => void;
  onDownload?: (video: GeneratedVideo) => void;
  onExtractFrame?: (video: GeneratedVideo, frameDataUrl: string) => void;
  onReveal?: (video: GeneratedVideo) => void;
  onOpenDetails?: (video: GeneratedVideo) => void;
  onSelectVersion?: (video: GeneratedVideo, versionIndex: number) => void;
  onExtend?: (video: GeneratedVideo) => void;
  onRemix?: (video: GeneratedVideo) => void;
  onCompareVersions?: (left: GeneratedVideo, right: GeneratedVideo) => void;
  onConnectionHandlePointerDown?: (
    nodeId: string,
    side: CanvasNodeSide,
    clientX: number,
    clientY: number,
    pointerId: number | null
  ) => void;
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;
const SIDE_LABELS: Record<CanvasNodeSide, string> = { top: "上", right: "右", bottom: "下", left: "左" };
const BUSY_STATUSES: ReadonlySet<VideoNodeStatus> = new Set(["submitting", "queued", "generating", "post_processing", "recovering"]);

export function isVideoControlPointer(clientY: number, rect: Pick<DOMRect, "top" | "bottom" | "height">): boolean {
  const controlHeight = Math.min(52, rect.height * 0.28);
  return clientY >= rect.bottom - controlHeight && clientY <= rect.bottom;
}

export function resolveVideoInteractionPresentation(
  dragging: boolean,
  hovered: boolean,
  toolbarInteractionOpen: boolean
): { showToolbar: boolean; showNativeControls: boolean } {
  return {
    showToolbar: !dragging && (hovered || toolbarInteractionOpen),
    showNativeControls: !dragging && (hovered || toolbarInteractionOpen)
  };
}

function VideoNodeComponent({ id, data, selected, dragging, width, height }: NodeProps): React.ReactElement {
  const uiText = useUiText();
  const hasMultipleSelection = useContext(CanvasSelectionCountContext) > 1;

  const {
  video,
  versions: suppliedVersions,
  activeVersionIndex = 0,
  onRetry,
  onMetadataLoaded,
  onDownload,
  onExtractFrame,
  onReveal,
  onOpenDetails,
  onSelectVersion,
  onExtend,
  onRemix,
  onCompareVersions,
  onConnectionHandlePointerDown,
  connectionTargetActive,
  connectionSnapTargetHandle
} = data as unknown as VideoNodeData;
  const versions = normalizedVideoVersions(video, suppliedVersions);
  const [compareLeft, setCompareLeft] = useState(0);
  const [compareRight, setCompareRight] = useState(Math.min(1, Math.max(0, versions.length - 1)));
  const [hovered, setHovered] = useState(false);
  const [toolbarInteractionOpen, setToolbarInteractionOpen] = useState(false);
  const connectionPoints = useDelayedConnectionPoints();
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const status = video.status ?? (video.dataUrl || video.path ? "completed" : "draft");
  const busy = BUSY_STATUSES.has(status);
  const playableSource = video.dataUrl || video.path;
  const poster = video.posterDataUrl || video.posterPath;
  const [decodedMetadata, setDecodedMetadata] = useState<{ source: string; width: number; height: number } | null>(null);
  const currentMetadata = decodedMetadata?.source === playableSource ? decodedMetadata : null;
  const ratio = videoAspectRatio(currentMetadata ?? video);
  const title = video.title?.trim() || "视频";
  const playerRef = useRef<HTMLVideoElement>(null);
  const resumePlaybackAfterDragRef = useRef(false);
  const interactionPresentation = resolveVideoInteractionPresentation(
    Boolean(dragging),
    hovered,
    toolbarInteractionOpen
  );
  const toolbarVisible = !hasMultipleSelection && !dragging && (selected || interactionPresentation.showToolbar);
  const showNativeControls = interactionPresentation.showNativeControls;

  function keepToolbarVisible(): void {
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setHovered(true);
  }

  function scheduleToolbarHide(): void {
    if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      hoverLeaveTimerRef.current = null;
      setHovered(false);
    }, 120);
  }

  useEffect(() => () => {
    if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (dragging) {
      resumePlaybackAfterDragRef.current = !player.paused;
      if (resumePlaybackAfterDragRef.current) player.pause();
      return;
    }
    if (!resumePlaybackAfterDragRef.current) return;
    resumePlaybackAfterDragRef.current = false;
    void player.play().catch(() => undefined);
  }, [dragging]);

  function extractCurrentFrame(): void {
    const player = playerRef.current;
    if (!player || player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !player.videoWidth || !player.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = player.videoWidth;
    canvas.height = player.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(player, 0, 0, canvas.width, canvas.height);
    onExtractFrame?.(video, canvas.toDataURL("image/png"));
  }

  return (
    <article
      data-video-node=""
      data-selected={selected ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      data-static-drag-preview={poster ? "true" : undefined}
      data-connection-points-visible={connectionPoints.visible ? "true" : undefined}
      data-connection-target-active={connectionTargetActive ? "true" : undefined}
      data-connection-snap-target={connectionSnapTargetHandle}
      className={cn(
        "canvas-node-card video-node-card group relative cursor-grab overflow-visible rounded-lg border border-border bg-card shadow-sm active:cursor-grabbing",
        selected && "video-node-card--selected"
      )}
      style={{
        width: Math.max(VIDEO_NODE_MIN_WIDTH, width || VIDEO_NODE_WIDTH),
        height: Math.max(1, currentMetadata || (video.width && video.height) || video.aspectRatio
          ? Math.max(VIDEO_NODE_MIN_WIDTH, width || VIDEO_NODE_WIDTH) / ratio
          : height || Math.max(VIDEO_NODE_MIN_WIDTH, width || VIDEO_NODE_WIDTH) / ratio)
      }}
      aria-label={uiText("{{ui:0}}节点，{{ui:1}}{{ui:2}}", [title, videoNodeStatusLabel(status), video.version ? `，版本 ${video.version}` : ""])}
      onPointerEnter={() => {
        connectionPoints.showConnectionPoints();
        keepToolbarVisible();
      }}
      onPointerLeave={() => {
        connectionPoints.scheduleConnectionPointsHide();
        scheduleToolbarHide();
      }}
    >
      <NodeHandles nodeId={id} onConnectionHandlePointerDown={onConnectionHandlePointerDown} />
      <div className="video-node-media nowheel">
        {playableSource && !busy ? (
          <>
            <video
              ref={playerRef}
              src={playableSource}
              poster={poster || undefined}
              controls={showNativeControls}
              preload="auto"
              onLoadedMetadata={(event) => {
                const player = event.currentTarget;
                if (!Number.isFinite(player.videoWidth) || !Number.isFinite(player.videoHeight)
                  || player.videoWidth <= 0 || player.videoHeight <= 0) return;
                const metadata = {
                  width: player.videoWidth,
                  height: player.videoHeight,
                  ...(Number.isFinite(player.duration) && player.duration >= 0
                    ? { durationMs: Math.round(player.duration * 1000) } : {})
                };
                setDecodedMetadata({ source: playableSource, width: metadata.width, height: metadata.height });
                if (video.width !== metadata.width || video.height !== metadata.height
                  || (metadata.durationMs !== undefined && video.durationMs !== metadata.durationMs)) {
                  onMetadataLoaded?.(video, metadata);
                }
              }}
              playsInline
              draggable={false}
              aria-label={uiText("{{ui:0}}播放器", [title])}
              onPointerDown={(event) => {
                if (showNativeControls && isVideoControlPointer(event.clientY, event.currentTarget.getBoundingClientRect())) {
                  event.stopPropagation();
                }
              }}
              onDragStart={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key.toLowerCase() !== "m") return;
                event.preventDefault();
                event.currentTarget.muted = !event.currentTarget.muted;
              }}
              onPlay={(event) => {
                document.querySelectorAll<HTMLVideoElement>("[data-video-node] video").forEach((player) => {
                  if (player !== event.currentTarget) player.pause();
                });
              }}
            />
            {poster ? <img className="video-node-drag-poster" src={poster} alt="" draggable={false} aria-hidden /> : null}
            <span className="video-node-drag-surface" aria-hidden="true" />
          </>
        ) : poster ? (
          <img src={poster} alt={uiText("{{ui:0}}预览", [title])} draggable={false} />
        ) : (
          <div className="video-node-placeholder" aria-busy={busy || undefined}>
            <VideoStatusIcon status={status} large />
            <strong>{videoNodeStatusLabel(status)}</strong>
            <span>{status === "post_processing"
              ? uiText("视频已生成，正在下载到本机")
              : busy
                ? uiText("任务会在后台继续，可先处理画布中的其他内容")
                : uiText("等待视频结果")}</span>
          </div>
        )}
        {busy && poster ? (
          <div className="video-node-progress-overlay" aria-hidden="true">
            <VideoStatusIcon status={status} large />
            <span>{videoNodeStatusLabel(status)}</span>
          </div>
        ) : null}
      </div>
      {status !== "completed" && status !== "modified" ? (
        <span className={cn("video-node-status video-node-status-overlay", `video-node-status--${status}`)} role="status" aria-live="polite">
          <VideoStatusIcon status={status} />{videoNodeStatusLabel(status)}
        </span>
      ) : null}
      {toolbarVisible ? (
        <PositionedVideoToolbar nodeId={id}>
          <div
            role="toolbar"
            aria-label={uiText("视频操作")}
            className="video-node-toolbar nodrag nopan nowheel"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={keepToolbarVisible}
            onPointerLeave={scheduleToolbarHide}
          >
            <span className="video-node-toolbar-title" title={title}><Film aria-hidden />{title}</span>
            {versions.length > 1 ? (
              <VideoVersionMenu
                versions={versions}
                activeVersionIndex={activeVersionIndex}
                compareLeft={compareLeft}
                compareRight={compareRight}
                onCompareLeftChange={setCompareLeft}
                onCompareRightChange={setCompareRight}
                onSelectVersion={onSelectVersion}
                onCompareVersions={onCompareVersions}
                onOpenChange={setToolbarInteractionOpen}
              />
            ) : video.version ? <span className="video-node-toolbar-meta">v{video.version}</span> : null}
            <span className="video-node-toolbar-meta">{formatVideoDuration(video.durationMs)}</span>
            <span className="video-node-toolbar-meta">{video.width && video.height ? `${video.width}×${video.height}` : uiText("自适应")}</span>
            <span className="video-node-toolbar-meta">{video.hasAudio === false ? uiText("无音频") : uiText("音频")}</span>
            {status === "failed" ? (
              <span className="video-node-toolbar-error" title={video.error}>
                {video.error || uiText("视频生成失败")}
              </span>
            ) : null}
            {status === "failed" && onRetry ? <IconButton label={uiText("重试视频生成")} onClick={() => onRetry(video)}><RotateCcw /></IconButton> : null}
            {onExtend ? <IconButton label={uiText("继续视频")} disabled={!playableSource} onClick={() => onExtend(video)}><StepForward /></IconButton> : null}
            {onRemix ? <IconButton label={uiText("改编视频")} disabled={!playableSource} onClick={() => onRemix(video)}><Shuffle /></IconButton> : null}
            {onExtractFrame ? <IconButton label={uiText("提取当前帧")} disabled={!playableSource || busy} onClick={extractCurrentFrame}><ImageDown /></IconButton> : null}
            {onReveal ? <IconButton label={uiText("在访达中显示")} disabled={!video.path} onClick={() => onReveal(video)}><FolderOpen /></IconButton> : null}
            {onDownload ? <IconButton label={uiText("下载原视频")} disabled={!playableSource} onClick={() => onDownload(video)}><Download /></IconButton> : null}
            {onOpenDetails ? <IconButton label={uiText("查看视频详情")} onClick={() => onOpenDetails(video)}><Info /></IconButton> : null}
          </div>
        </PositionedVideoToolbar>
      ) : null}
    </article>
  );
}

function PositionedVideoToolbar({ nodeId, children }: { nodeId: string; children: ReactNode }): React.ReactElement {
  const position = useStore<Position>((state) => {
    const node = state.nodeLookup.get(nodeId);
    if (!node) return Position.Top;
    const screenTop = node.internals.positionAbsolute.y * state.transform[2] + state.transform[1];
    return resolveImageToolbarSide(screenTop) === "bottom" ? Position.Bottom : Position.Top;
  });
  return <NodeToolbar isVisible position={position} offset={10} align="center">{children}</NodeToolbar>;
}

function VideoVersionMenu({
  versions,
  activeVersionIndex,
  compareLeft,
  compareRight,
  onCompareLeftChange,
  onCompareRightChange,
  onSelectVersion,
  onCompareVersions,
  onOpenChange
}: {
  versions: GeneratedVideo[];
  activeVersionIndex: number;
  compareLeft: number;
  compareRight: number;
  onCompareLeftChange: (index: number) => void;
  onCompareRightChange: (index: number) => void;
  onSelectVersion?: VideoNodeData["onSelectVersion"];
  onCompareVersions?: VideoNodeData["onCompareVersions"];
  onOpenChange?: (open: boolean) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const safeActiveIndex = Math.min(Math.max(0, activeVersionIndex), versions.length - 1);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    }}>
      <PopoverTrigger asChild>
        <button type="button" className="video-node-version-trigger" aria-label={uiText("选择视频版本，当前版本 {{ui:0}}", [safeActiveIndex + 1])}>
          v{safeActiveIndex + 1}<ChevronDown aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="video-node-version-menu nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="video-node-version-menu-title">{uiText("版本")}</div>
        <div className="video-node-version-list" role="listbox" aria-label={uiText("视频版本")}>
          {versions.map((version, index) => (
            <button
              key={version.id || `${version.path}-${index}`}
              type="button"
              role="option"
              aria-selected={index === safeActiveIndex}
              onClick={() => {
                onSelectVersion?.(version, index);
                setOpen(false);
                onOpenChange?.(false);
              }}
            >
              <span>v{index + 1}</span>
              <small>{formatVideoDuration(version.durationMs)} · {version.width && version.height ? `${version.width}×${version.height}` : uiText("自适应")}</small>
              {index === safeActiveIndex ? <Check aria-hidden /> : null}
            </button>
          ))}
        </div>
        {onCompareVersions ? (
          <div className="video-node-compare" aria-label={uiText("比较两个视频版本")}>
            <span>{uiText("对比")}</span>
            <select aria-label={uiText("对比版本 A")} value={compareLeft} onChange={(event) => onCompareLeftChange(Number(event.target.value))}>
              {versions.map((_, index) => <option key={index} value={index}>v{index + 1}</option>)}
            </select>
            <span aria-hidden>{uiText("与")}</span>
            <select aria-label={uiText("对比版本 B")} value={compareRight} onChange={(event) => onCompareRightChange(Number(event.target.value))}>
              {versions.map((_, index) => <option key={index} value={index}>v{index + 1}</option>)}
            </select>
            <button type="button" disabled={compareLeft === compareRight} onClick={() => {
              setOpen(false);
              onOpenChange?.(false);
              onCompareVersions(versions[compareLeft], versions[compareRight]);
            }}>{uiText("比较")}</button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }): React.ReactElement {
  return <button type="button" aria-label={label} title={label} disabled={disabled} className="video-node-icon-button" onClick={onClick}>{children}</button>;
}

function VideoStatusIcon({ status, large = false }: { status: VideoNodeStatus; large?: boolean }): React.ReactElement {
  const className = cn(large ? "h-6 w-6" : "h-3 w-3", BUSY_STATUSES.has(status) && status !== "queued" && "animate-spin motion-reduce:animate-none");
  if (status === "queued") return <Clock3 aria-hidden className={className} />;
  if (status === "failed") return <CircleAlert aria-hidden className={className} />;
  if (status === "completed") return <Check aria-hidden className={className} />;
  if (status === "draft" || status === "cancelled") return <Film aria-hidden className={className} />;
  return <Loader2 aria-hidden className={className} />;
}

function NodeHandles({ nodeId, onConnectionHandlePointerDown }: { nodeId: string; onConnectionHandlePointerDown?: VideoNodeData["onConnectionHandlePointerDown"] }): React.ReactElement {
  const uiText = useUiText();

  return <>{SIDES.map((position) => {
    const side = position.toLowerCase() as CanvasNodeSide;
    return (
      <div key={side} className={`image-node-connection-point image-node-connection-point--${side}`}>
        <Handle type="target" position={position} id={`target-${side}`} isConnectableStart className="image-node-connection-handle image-node-connection-handle--target nodrag nopan" />
        <Handle type="source" position={position} id={`source-${side}`} isConnectableEnd className="image-node-connection-handle image-node-connection-handle--source nodrag nopan" />
        <button type="button" aria-label={uiText("从{{ui:0}}侧创建连接", [uiText(SIDE_LABELS[side])])} className="nodrag nopan image-node-connection-trigger" onPointerDownCapture={(event) => {
          event.preventDefault(); event.stopPropagation();
          onConnectionHandlePointerDown?.(nodeId, side, event.clientX, event.clientY, event.pointerId);
        }}><Plus aria-hidden className="h-3.5 w-3.5" /></button>
      </div>
    );
  })}</>;
}

export const VideoNode = memo(VideoNodeComponent);
