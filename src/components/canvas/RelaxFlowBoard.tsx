import { useUiText } from "@/i18n";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Node,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Brush,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  Focus,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Loader2,
  MousePointer2,
  Redo2,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  WandSparkles,
  X
} from "lucide-react";
import { AiAssistant, type AiAssistantMessage, type AiAssistantWorkflow } from "@/components/assistant/AiAssistant";
import { Button } from "@/components/ui/button";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getGenerationTiming } from "@/lib/generation-timing";
import { isSendEnter } from "@/lib/send-on-enter";
import { cn } from "@/lib/utils";
import {
  buildRelaxFlowAnnotationSummary,
  cloneRelaxElements,
  getRelaxElementBounds,
  relaxElementLabel,
  resizeRelaxElement,
  translateRelaxElement,
  type RelaxBounds,
  type RelaxFlowElement,
  type RelaxPoint
} from "./relax-flow-model";
import type { GeneratedImage, ImageVersion } from "./ImageNode";
import { resolveCanvasWheelInteraction } from "./canvas-viewport";

export interface RelaxFlowRequest {
  boardDataUrl: string;
  annotationSummary: string;
}

export interface RelaxFlowInterpretation {
  prompt: string;
  explanation: string;
}

interface RelaxFlowBoardProps {
  sessionKey: string;
  versions: ImageVersion[];
  activeVersion: number;
  aspectRatio: number;
  providerName: string;
  providerLimitation?: string;
  interpretationLimitation?: string;
  onInterpret: (request: RelaxFlowRequest, onDelta: (delta: string) => void) => Promise<RelaxFlowInterpretation>;
  onRefine: (
    request: RelaxFlowRequest,
    interpretation: RelaxFlowInterpretation,
    instruction: string,
    onDelta: (delta: string) => void
  ) => Promise<RelaxFlowInterpretation>;
  onGenerate: (prompt: string) => Promise<GeneratedImage[]>;
  onSwitchVersion: (index: number) => void;
  onBack: () => void;
  onClose: () => void;
}

type RelaxFlowTool = "select" | "brush" | "rect" | "ellipse" | "arrow" | "text" | "eraser";
type InspectorTab = "properties" | "layers";
type ResizeDirection = "nw" | "ne" | "sw" | "se";

interface RelaxImageNodeData extends Record<string, unknown> {
  source: string;
  analysisState: "idle" | "understanding" | "understood";
  annotationCount: number;
  activeVersion: number;
}

type RelaxImageNode = Node<RelaxImageNodeData>;

interface GeneratedVersionNodeData extends Record<string, unknown> {
  source?: string;
  versionNumber: number;
  pending: boolean;
  startedAt?: number;
}

type GeneratedVersionNode = Node<GeneratedVersionNodeData>;

interface DrawingState {
  id: string;
  kind: Exclude<RelaxFlowTool, "select" | "text" | "eraser">;
  pointerId: number;
  start: RelaxPoint;
}

interface PendingTextPlacement {
  pointerId: number;
  point: RelaxPoint;
}

interface TransformState {
  mode: "move" | "resize";
  pointerId: number;
  id: string;
  start: RelaxPoint;
  original: RelaxFlowElement;
  originalBounds: RelaxBounds;
  direction?: ResizeDirection;
  snapshot: RelaxFlowElement[];
  changed: boolean;
}

const IMAGE_NODE_ID = "relax-flow-image";
const IMAGE_WIDTH = 560;
const MIN_VECTOR_SIZE = 16;
const TEXT_LINE_HEIGHT = 1.25;
const TEXT_SIZE_PADDING = 2;
const PRO_OPTIONS = { hideAttribution: true };
const COLORS = ["#ff3b30", "#ff9500", "#ffd60a", "#30b864", "#0a84ff", "#af52de", "#ffffff", "#171717"] as const;
const TOOL_LABELS: Record<RelaxFlowTool, string> = {
  select: "选择",
  brush: "画笔",
  rect: "矩形",
  ellipse: "圆形",
  arrow: "箭头",
  text: "文字",
  eraser: "橡皮擦"
};

let textMeasureContext: CanvasRenderingContext2D | null = null;

function measureRelaxText(text: string, fontSize: number): Pick<RelaxBounds, "width" | "height"> {
  if (!textMeasureContext && typeof document !== "undefined") {
    textMeasureContext = document.createElement("canvas").getContext("2d");
  }
  const lines = (text || "文字").split("\n");
  if (textMeasureContext) textMeasureContext.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const measuredWidth = Math.max(...lines.map((line) => (
    textMeasureContext?.measureText(line || " ").width ?? (line.length || 1) * fontSize
  )));
  return {
    width: Math.max(1, Math.ceil(measuredWidth + TEXT_SIZE_PADDING)),
    height: Math.max(1, Math.ceil(lines.length * fontSize * TEXT_LINE_HEIGHT + TEXT_SIZE_PADDING))
  };
}

function resizeAutoText(
  element: Extract<RelaxFlowElement, { kind: "text" }>,
  text = element.text,
  fontSize = element.fontSize
): Extract<RelaxFlowElement, { kind: "text" }> {
  if (!element.autoSize) return { ...element, text, fontSize };
  return {
    ...element,
    text,
    fontSize,
    bounds: { ...element.bounds, ...measureRelaxText(text, fontSize) }
  };
}

function ImageFlowNode({ data }: NodeProps<RelaxImageNode>): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div
        className={cn(
          "relax-flow-target relative h-full w-full overflow-hidden rounded-lg bg-background shadow-[0_2px_8px_rgba(0,0,0,0.16)]",
          data.analysisState === "understanding" && "relax-flow-target--analyzing",
          data.analysisState === "understood" && "relax-flow-target--understood"
        )}
        aria-busy={data.analysisState === "understanding" || undefined}
      >
        <img
          key={data.source}
          src={data.source}
          alt={uiText("Relax Flow 图片版本 {{ui:0}}", [data.activeVersion + 1])}
          draggable={false}
          className="h-full w-full select-none object-fill animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        />
        <span className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded bg-background/92 px-1.5 py-1 text-[10px] font-medium text-foreground shadow-sm">
          {data.analysisState === "understanding" ? <Loader2 className="h-3 w-3 animate-spin text-[hsl(var(--ai-accent))] motion-reduce:animate-none" /> : null}
          {data.analysisState === "understanding"
            ? uiText("正在理解 {{ui:0}} 个标注", [data.annotationCount])
            : data.analysisState === "understood"
              ? uiText("编辑意图已识别")
              : uiText("编辑目标")}
        </span>
        {data.analysisState === "understanding" ? <span className="relax-flow-target__scan" aria-hidden /> : null}
      </div>
    </div>
  );
}

function GeneratedVersionFlowNode({ data }: NodeProps<GeneratedVersionNode>): React.ReactElement {
  const uiText = useUiText();

  const timing = useGenerationTiming(data.pending, data.startedAt);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-background shadow-[0_2px_8px_rgba(0,0,0,0.16)]">
      {data.source ? (
        <img
          key={data.source}
          src={data.source}
          alt={uiText("Relax Flow 新版本 {{ui:0}}", [data.versionNumber])}
          draggable={false}
          className="h-full w-full select-none object-fill animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        />
      ) : (
        <div
          data-generation-status
          aria-busy="true"
          className="flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-lg border border-border bg-card shadow-sm"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground [animation-duration:1.4s] motion-reduce:animate-none" />
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-xs font-medium text-foreground">{uiText("正在生成新版本")}</span>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {uiText("已用 ")}<time className="tabular-nums">{timing.elapsedLabel}</time>
            </p>
            {timing.overdue ? (
              <p className="max-w-[13rem] text-pretty text-[11px] leading-4 text-muted-foreground">
                {uiText("比预计久一点，任务仍在处理中")}</p>
            ) : (
              <p className="text-[11px] leading-4 text-muted-foreground">
                {uiText("预计剩余 ")}<time className="tabular-nums">{timing.remainingLabel}</time>
              </p>
            )}
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-background/92 px-1.5 py-1 text-[10px] font-medium text-foreground shadow-sm">
        {data.pending ? uiText("生成中") : uiText("新版本 v{{ui:0}}", [data.versionNumber])}
      </span>
    </div>
  );
}

const NODE_TYPES = {
  relaxImage: memo(ImageFlowNode),
  generatedVersion: memo(GeneratedVersionFlowNode)
};

function useGenerationTiming(active: boolean, startedAt?: number): ReturnType<typeof getGenerationTiming> {
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

function boundsFromPoints(start: RelaxPoint, end: RelaxPoint): RelaxBounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y))
  };
}

function smoothBrushPath(points: RelaxPoint[], offset: RelaxPoint = { x: 0, y: 0 }): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x - offset.x} ${points[0].y - offset.y}`;
  let path = `M${points[0].x - offset.x} ${points[0].y - offset.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const midX = (point.x + next.x) / 2 - offset.x;
    const midY = (point.y + next.y) / 2 - offset.y;
    path += ` Q${point.x - offset.x} ${point.y - offset.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  return `${path} L${last.x - offset.x} ${last.y - offset.y}`;
}

function elementIcon(kind: RelaxFlowElement["kind"]): ReactNode {
  if (kind === "brush") return <Brush className="h-3.5 w-3.5" />;
  if (kind === "rect") return <Square className="h-3.5 w-3.5" />;
  if (kind === "ellipse") return <Circle className="h-3.5 w-3.5" />;
  if (kind === "arrow") return <ArrowUpRight className="h-3.5 w-3.5" />;
  return <Type className="h-3.5 w-3.5" />;
}

function ToolButton({
  tool,
  activeTool,
  disabled,
  icon,
  onSelect
}: {
  tool: RelaxFlowTool;
  activeTool: RelaxFlowTool;
  disabled: boolean;
  icon: ReactNode;
  onSelect: (tool: RelaxFlowTool) => void;
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={TOOL_LABELS[tool]}
          aria-pressed={activeTool === tool}
          disabled={disabled}
          onClick={() => onSelect(tool)}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
            activeTool === tool && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{TOOL_LABELS[tool]}</TooltipContent>
    </Tooltip>
  );
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取当前图片。"));
    image.src = source;
  });
}

function drawVectorElement(
  context: CanvasRenderingContext2D,
  element: RelaxFlowElement,
  offset: RelaxPoint,
  scale: number
): void {
  if (!element.visible) return;
  context.save();
  context.globalAlpha = element.opacity;
  context.strokeStyle = element.color;
  context.fillStyle = element.color;
  context.lineWidth = Math.max(1, element.strokeWidth * scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (element.kind === "brush") {
    const path = new Path2D(smoothBrushPath(element.points.map((point) => ({
      x: (point.x - offset.x) * scale,
      y: (point.y - offset.y) * scale
    }))));
    context.stroke(path);
  } else if (element.kind === "rect" || element.kind === "ellipse") {
    const { x, y, width, height } = element.bounds;
    const left = (x - offset.x) * scale;
    const top = (y - offset.y) * scale;
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    context.globalAlpha = element.opacity * element.fillOpacity;
    if (element.kind === "rect") context.fillRect(left, top, scaledWidth, scaledHeight);
    else {
      context.beginPath();
      context.ellipse(left + scaledWidth / 2, top + scaledHeight / 2, scaledWidth / 2, scaledHeight / 2, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = element.opacity;
    if (element.kind === "rect") context.strokeRect(left, top, scaledWidth, scaledHeight);
    else {
      context.beginPath();
      context.ellipse(left + scaledWidth / 2, top + scaledHeight / 2, scaledWidth / 2, scaledHeight / 2, 0, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (element.kind === "arrow") {
    const start = { x: (element.start.x - offset.x) * scale, y: (element.start.y - offset.y) * scale };
    const end = { x: (element.end.x - offset.x) * scale, y: (element.end.y - offset.y) * scale };
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = Math.max(10, element.strokeWidth * scale * 3.2);
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - Math.cos(angle - Math.PI / 6) * head, end.y - Math.sin(angle - Math.PI / 6) * head);
    context.lineTo(end.x - Math.cos(angle + Math.PI / 6) * head, end.y - Math.sin(angle + Math.PI / 6) * head);
    context.closePath();
    context.fill();
  } else {
    const x = (element.bounds.x - offset.x) * scale;
    const y = (element.bounds.y - offset.y) * scale;
    const maxWidth = element.bounds.width * scale;
    const fontSize = element.fontSize * scale;
    context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    context.textBaseline = "top";
    context.textAlign = element.align;
    const textX = element.align === "left" ? x : element.align === "center" ? x + maxWidth / 2 : x + maxWidth;
    context.lineWidth = Math.max(3, fontSize * 0.12);
    context.strokeStyle = element.color === "#171717" ? "rgba(255,255,255,.92)" : "rgba(0,0,0,.72)";
    context.strokeText(element.text.trim() || "文字", textX, y, maxWidth);
    context.fillStyle = element.color;
    context.fillText(element.text.trim() || "文字", textX, y, maxWidth);
  }
  context.restore();
}

async function exportFlowBoard(
  source: string,
  imageBounds: RelaxBounds,
  elements: RelaxFlowElement[]
): Promise<string> {
  const image = await loadImage(source);
  const visibleBounds = elements.filter((element) => element.visible).map(getRelaxElementBounds);
  const boxes = [imageBounds, ...visibleBounds];
  const padding = 120;
  const left = Math.min(...boxes.map((box) => box.x)) - padding;
  const top = Math.min(...boxes.map((box) => box.y)) - padding;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + padding;
  const width = right - left;
  const height = bottom - top;
  const scale = Math.min(1.5, 1800 / width, 1400 / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成 Relax Flow 画板。 ");
  context.fillStyle = "#f5f5f6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#d7d7da";
  for (let x = 20 * scale; x < canvas.width; x += 24 * scale) {
    for (let y = 20 * scale; y < canvas.height; y += 24 * scale) {
      context.beginPath();
      context.arc(x, y, Math.max(0.75, scale), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.drawImage(
    image,
    (imageBounds.x - left) * scale,
    (imageBounds.y - top) * scale,
    imageBounds.width * scale,
    imageBounds.height * scale
  );
  elements.forEach((element) => drawVectorElement(context, element, { x: left, y: top }, scale));
  return canvas.toDataURL("image/png");
}

function VectorElement({
  element,
  index,
  selected,
  editing,
  interactive,
  erasing,
  onPointerDown,
  onDoubleClick,
  onTextChange,
  onTextBlur
}: {
  element: RelaxFlowElement;
  index: number;
  selected: boolean;
  editing: boolean;
  interactive: boolean;
  erasing: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement | SVGElement>, element: RelaxFlowElement) => void;
  onDoubleClick: (element: RelaxFlowElement) => void;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: () => void;
}): React.ReactElement | null {
  if (!element.visible) return null;
  const bounds = getRelaxElementBounds(element);
  const pointerClass = erasing ? "cursor-cell" : interactive ? "cursor-move" : "pointer-events-none";
  const commonStyle = { zIndex: index + 2, opacity: element.opacity };
  if (element.kind === "brush") {
    const path = smoothBrushPath(element.points, { x: bounds.x, y: bounds.y });
    return (
      <svg className={cn("absolute overflow-visible", pointerClass)} style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, ...commonStyle }}>
        <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(18, element.strokeWidth + 12)} strokeLinecap="round" className={interactive || erasing ? "pointer-events-auto" : "pointer-events-none"} onPointerDown={(event) => onPointerDown(event, element)} />
        <path d={path} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none" />
      </svg>
    );
  }
  if (element.kind === "rect" || element.kind === "ellipse") {
    return (
      <div
        className={cn("absolute", element.kind === "ellipse" && "rounded-full", pointerClass, selected && "drop-shadow-[0_0_1px_hsl(var(--background))]")}
        style={{
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
          border: `${element.strokeWidth}px solid ${element.color}`,
          backgroundColor: `${element.color}${Math.round(element.fillOpacity * 255).toString(16).padStart(2, "0")}`,
          pointerEvents: interactive || erasing ? "auto" : "none",
          ...commonStyle
        }}
        onPointerDown={(event) => onPointerDown(event, element)}
      />
    );
  }
  if (element.kind === "arrow") {
    const localStart = { x: element.start.x - bounds.x, y: element.start.y - bounds.y };
    const localEnd = { x: element.end.x - bounds.x, y: element.end.y - bounds.y };
    const arrowHeadSize = Math.max(14, Math.min(28, element.strokeWidth * 2.5));
    return (
      <svg className={cn("absolute overflow-visible", pointerClass)} style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, ...commonStyle }}>
        <defs>
          <marker id={`relax-arrow-${element.id}`} markerWidth={arrowHeadSize} markerHeight={arrowHeadSize} refX={arrowHeadSize - 1} refY={arrowHeadSize / 2} orient="auto" markerUnits="userSpaceOnUse">
            <path d={`M0,0 L${arrowHeadSize},${arrowHeadSize / 2} L0,${arrowHeadSize} Z`} fill={element.color} />
          </marker>
        </defs>
        <line x1={localStart.x} y1={localStart.y} x2={localEnd.x} y2={localEnd.y} stroke="transparent" strokeWidth={Math.max(18, element.strokeWidth + 12)} className={interactive || erasing ? "pointer-events-auto" : "pointer-events-none"} onPointerDown={(event) => onPointerDown(event, element)} />
        <line x1={localStart.x} y1={localStart.y} x2={localEnd.x} y2={localEnd.y} stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" markerEnd={`url(#relax-arrow-${element.id})`} className="pointer-events-none" />
      </svg>
    );
  }
  if (editing) {
    return (
      <textarea
        autoFocus
        value={element.text}
        maxLength={240}
        onChange={(event) => onTextChange(element.id, event.target.value)}
        onKeyDown={(event) => {
          if (!isSendEnter(event)) return;
          event.preventDefault();
          event.currentTarget.blur();
        }}
        onBlur={onTextBlur}
        wrap={element.autoSize ? "off" : "soft"}
        className={cn(
          "nodrag nopan absolute resize-none overflow-hidden border-0 bg-transparent p-0 font-semibold outline outline-1 outline-offset-2 outline-[hsl(var(--ai-accent)/0.55)]",
          element.autoSize ? "whitespace-pre" : "whitespace-pre-wrap break-words"
        )}
        style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, zIndex: index + 3, color: element.color, fontSize: element.fontSize, lineHeight: TEXT_LINE_HEIGHT, textAlign: element.align, opacity: element.opacity }}
      />
    );
  }
  return (
    <div
      className={cn(
        "absolute overflow-hidden font-semibold",
        element.autoSize ? "whitespace-pre" : "whitespace-pre-wrap break-words",
        pointerClass
      )}
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, color: element.color, fontSize: element.fontSize, lineHeight: TEXT_LINE_HEIGHT, textAlign: element.align, pointerEvents: interactive || erasing ? "auto" : "none", ...commonStyle }}
      onPointerDown={(event) => onPointerDown(event, element)}
      onDoubleClick={() => onDoubleClick(element)}
    >
      {element.text || "文字"}
    </div>
  );
}

function SelectionFrame({
  bounds,
  onResizeStart
}: {
  bounds: RelaxBounds;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>, direction: ResizeDirection) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const handles: Array<{ direction: ResizeDirection; className: string }> = [
    { direction: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
    { direction: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
    { direction: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { direction: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" }
  ];
  return (
    <div className="pointer-events-none absolute border border-[hsl(var(--ai-accent))]" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, zIndex: 100 }}>
      {handles.map((handle) => (
        <button
          key={handle.direction}
          type="button"
          aria-label={uiText("缩放 {{ui:0}}", [handle.direction])}
          className={cn("pointer-events-auto absolute h-3 w-3 rounded-[2px] border-2 border-background bg-[hsl(var(--ai-accent))]", handle.className)}
          onPointerDown={(event) => onResizeStart(event, handle.direction)}
        />
      ))}
    </div>
  );
}

export function RelaxFlowBoard({
  sessionKey,
  versions,
  activeVersion,
  aspectRatio,
  providerName,
  providerLimitation,
  interpretationLimitation,
  onInterpret,
  onRefine,
  onGenerate,
  onSwitchVersion,
  onBack,
  onClose
}: RelaxFlowBoardProps): React.ReactElement {
  const uiText = useUiText();

  const segmentedLayoutId = useId();
  const wheelInteraction = useMemo(() => resolveCanvasWheelInteraction(), []);
  const flowRef = useRef<ReactFlowInstance<Node<Record<string, unknown>>, never> | null>(null);
  const elementsRef = useRef<RelaxFlowElement[]>([]);
  const drawingRef = useRef<DrawingState | null>(null);
  const pendingTextPlacementRef = useRef<PendingTextPlacement | null>(null);
  const transformRef = useRef<TransformState | null>(null);
  const propertySnapshotRef = useRef<RelaxFlowElement[] | null>(null);
  const textSnapshotRef = useRef<RelaxFlowElement[] | null>(null);
  const [tool, setTool] = useState<RelaxFlowTool>("select");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [fillOpacity, setFillOpacity] = useState(0.12);
  const [fontSize, setFontSize] = useState(24);
  const [elements, setElements] = useState<RelaxFlowElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [past, setPast] = useState<RelaxFlowElement[][]>([]);
  const [future, setFuture] = useState<RelaxFlowElement[][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"understanding" | "generating" | null>(null);
  const [workflowErrorStep, setWorkflowErrorStep] = useState<"intent" | "generate" | null>(null);
  const [interpretation, setInterpretation] = useState<RelaxFlowInterpretation | null>(null);
  const [activeRequest, setActiveRequest] = useState<RelaxFlowRequest | null>(null);
  const [intentStale, setIntentStale] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantValue, setAssistantValue] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AiAssistantMessage[]>([]);
  const [assistantStreaming, setAssistantStreaming] = useState(false);
  const [intentResult, setIntentResult] = useState("");
  const [generationResult, setGenerationResult] = useState("");
  const [generationComplete, setGenerationComplete] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | undefined>();
  const [generatedPreview, setGeneratedPreview] = useState<{ image: GeneratedImage; versionNumber: number } | null>(null);
  const [sourceVersionIndex, setSourceVersionIndex] = useState(() => (
    Math.min(Math.max(0, activeVersion), Math.max(0, versions.length - 1))
  ));
  const sessionInitialVersionRef = useRef({
    sessionKey,
    index: Math.min(Math.max(0, activeVersion), Math.max(0, versions.length - 1))
  });
  if (sessionInitialVersionRef.current.sessionKey !== sessionKey) {
    sessionInitialVersionRef.current = {
      sessionKey,
      index: Math.min(Math.max(0, activeVersion), Math.max(0, versions.length - 1))
    };
  }
  const interpretationSignatureRef = useRef<string | null>(null);
  const assistantRequestRef = useRef(0);
  const generationVersionNumberRef = useRef(versions.length + 1);
  const initialRatioRef = useRef(Math.max(0.25, Math.min(4, aspectRatio)));
  const ratio = initialRatioRef.current;
  const resolvedActiveVersion = Math.min(Math.max(0, sourceVersionIndex), Math.max(0, versions.length - 1));
  const source = versions[resolvedActiveVersion]?.dataUrl ?? versions[0]?.dataUrl ?? "";
  const imageBounds = useMemo<RelaxBounds>(() => ({
    x: -IMAGE_WIDTH / 2,
    y: -(IMAGE_WIDTH / ratio) / 2,
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH / ratio
  }), [ratio]);
  const visibleCount = elements.filter((element) => element.visible).length;
  const understandingActive = activeOperation === "understanding";
  const intentReady = Boolean(interpretation) && !intentStale;
  const switchSourceVersion = useCallback((index: number): void => {
    setSourceVersionIndex(index);
    onSwitchVersion(index);
  }, [onSwitchVersion]);
  const imageNodes = useMemo<RelaxImageNode[]>(() => [{
    id: IMAGE_NODE_ID,
    type: "relaxImage",
    position: { x: imageBounds.x, y: imageBounds.y },
    data: {
      source,
      analysisState: understandingActive ? "understanding" : intentReady ? "understood" : "idle",
      annotationCount: visibleCount,
      activeVersion: resolvedActiveVersion
    },
    style: { width: imageBounds.width, height: imageBounds.height },
    draggable: false,
    selectable: false,
    deletable: false
  }], [imageBounds, intentReady, resolvedActiveVersion, source, understandingActive, visibleCount]);
  const generationActive = activeOperation === "generating";
  const generatedVersionNodes = useMemo<GeneratedVersionNode[]>(() => {
    if (!generationActive && !generatedPreview) return [];
    return [{
      id: "relax-flow-generated-version",
      type: "generatedVersion",
      position: { x: imageBounds.x + imageBounds.width + 96, y: imageBounds.y },
      data: {
        source: generatedPreview?.image.dataUrl,
        versionNumber: generatedPreview?.versionNumber ?? generationVersionNumberRef.current,
        pending: generationActive,
        startedAt: generationStartedAt
      },
      style: { width: imageBounds.width, height: imageBounds.height },
      draggable: false,
      selectable: false,
      deletable: false
    }];
  }, [generatedPreview, generationActive, generationStartedAt, imageBounds]);
  const blockedMessage = providerLimitation ?? interpretationLimitation;
  elementsRef.current = elements;
  const selectedElement = elements.find((element) => element.id === selectedId) ?? null;
  const selectedBounds = selectedElement ? getRelaxElementBounds(selectedElement) : null;

  useEffect(() => {
    if (!interpretationSignatureRef.current) return;
    if (interpretationSignatureRef.current !== JSON.stringify(elements)) {
      setIntentStale(true);
    }
  }, [elements]);

  useEffect(() => {
    setGenerationComplete(false);
    setGeneratedPreview(null);
    setSourceVersionIndex(sessionInitialVersionRef.current.index);
    setElements([]);
    setSelectedId(null);
    setEditingTextId(null);
    setPast([]);
    setFuture([]);
    setInterpretation(null);
    setActiveRequest(null);
    setIntentStale(false);
    setAssistantValue("");
    setAssistantMessages([]);
    setAssistantStreaming(false);
    setIntentResult("");
    setGenerationResult("");
    setGenerationStartedAt(undefined);
    setActiveOperation(null);
    setWorkflowErrorStep(null);
    assistantRequestRef.current += 1;
    interpretationSignatureRef.current = null;
  }, [sessionKey]);

  useEffect(() => {
    if (!generationActive && !generatedPreview) return;
    const frame = requestAnimationFrame(() => {
      void flowRef.current?.fitView({ padding: 0.2, maxZoom: 1.05, duration: 220 });
    });
    return () => cancelAnimationFrame(frame);
  }, [generatedPreview, generationActive]);

  const pushSnapshot = useCallback((snapshot: RelaxFlowElement[]): void => {
    setPast((history) => [...history.slice(-59), cloneRelaxElements(snapshot)]);
    setFuture([]);
  }, []);

  const commitElements = useCallback((next: RelaxFlowElement[]): void => {
    pushSnapshot(elementsRef.current);
    setElements(next);
  }, [pushSnapshot]);

  const undo = useCallback((): void => {
    setPast((history) => {
      const previous = history[history.length - 1];
      if (!previous) return history;
      setElements((current) => {
        setFuture((redoHistory) => [cloneRelaxElements(current), ...redoHistory].slice(0, 60));
        return cloneRelaxElements(previous);
      });
      setSelectedId(null);
      setEditingTextId(null);
      return history.slice(0, -1);
    });
  }, []);

  const redo = useCallback((): void => {
    setFuture((history) => {
      const next = history[0];
      if (!next) return history;
      setElements((current) => {
        setPast((undoHistory) => [...undoHistory.slice(-59), cloneRelaxElements(current)]);
        return cloneRelaxElements(next);
      });
      setSelectedId(null);
      setEditingTextId(null);
      return history.slice(1);
    });
  }, []);

  function toFlowPoint(clientX: number, clientY: number): RelaxPoint | null {
    return flowRef.current?.screenToFlowPosition({ x: clientX, y: clientY }) ?? null;
  }

  function createBase(): Pick<RelaxFlowElement, "id" | "color" | "strokeWidth" | "opacity" | "visible"> {
    return { id: crypto.randomUUID(), color, strokeWidth, opacity, visible: true };
  }

  function handleDrawPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || submitting || tool === "select" || tool === "eraser") return;
    const point = toFlowPoint(event.clientX, event.clientY);
    if (!point) return;
    if (tool === "text") {
      pendingTextPlacementRef.current = { pointerId: event.pointerId, point };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const base = createBase();
    const element: RelaxFlowElement = tool === "brush"
      ? { ...base, kind: "brush", points: [point] }
      : tool === "arrow"
        ? { ...base, kind: "arrow", start: point, end: point }
        : { ...base, kind: tool, bounds: { x: point.x, y: point.y, width: 1, height: 1 }, fillOpacity };
    pushSnapshot(elementsRef.current);
    setElements((current) => [...current, element]);
    setSelectedId(element.id);
    setEditingTextId(null);
    drawingRef.current = { id: element.id, kind: tool, pointerId: event.pointerId, start: point };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDrawPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const point = toFlowPoint(event.clientX, event.clientY);
    if (!point) return;
    setElements((current) => current.map((element) => {
      if (element.id !== drawing.id) return element;
      if (element.kind === "brush") {
        const last = element.points[element.points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return element;
        return { ...element, points: [...element.points, point] };
      }
      if (element.kind === "arrow") return { ...element, end: point };
      if (element.kind === "rect" || element.kind === "ellipse") {
        return { ...element, bounds: boundsFromPoints(drawing.start, point) };
      }
      return element;
    }));
  }

  function handleDrawPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const pendingText = pendingTextPlacementRef.current;
    if (pendingText?.pointerId === event.pointerId) {
      pendingTextPlacementRef.current = null;
      const naturalSize = measureRelaxText("", fontSize);
      const element: RelaxFlowElement = {
        ...createBase(),
        kind: "text",
        bounds: { x: pendingText.point.x, y: pendingText.point.y, ...naturalSize },
        text: "",
        fontSize,
        align: "left",
        autoSize: true
      };
      const nextElements = [...elementsRef.current, element];
      commitElements(nextElements);
      textSnapshotRef.current = cloneRelaxElements(nextElements);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      requestAnimationFrame(() => {
        setTool("select");
        setSelectedId(element.id);
        setEditingTextId(element.id);
      });
      return;
    }
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    drawingRef.current = null;
    const element = elementsRef.current.find((item) => item.id === drawing.id);
    if (element) {
      const bounds = getRelaxElementBounds(element);
      const usable = element.kind === "brush"
        ? element.points.length > 1
        : Math.hypot(bounds.width, bounds.height) >= MIN_VECTOR_SIZE;
      if (!usable) {
        setElements((current) => current.filter((item) => item.id !== drawing.id));
        setPast((history) => history.slice(0, -1));
        setSelectedId(null);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleElementPointerDown(
    event: ReactPointerEvent<HTMLElement | SVGElement>,
    element: RelaxFlowElement
  ): void {
    if (tool === "eraser") {
      event.stopPropagation();
      commitElements(elementsRef.current.filter((item) => item.id !== element.id));
      if (selectedId === element.id) setSelectedId(null);
      return;
    }
    if (tool !== "select" || submitting) return;
    event.stopPropagation();
    if (editingTextId === element.id) return;
    const point = toFlowPoint(event.clientX, event.clientY);
    if (!point) return;
    setSelectedId(element.id);
    setEditingTextId(null);
    transformRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      id: element.id,
      start: point,
      original: cloneRelaxElements([element])[0],
      originalBounds: getRelaxElementBounds(element),
      snapshot: cloneRelaxElements(elementsRef.current),
      changed: false
    };
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>, direction: ResizeDirection): void {
    if (!selectedElement || !selectedBounds) return;
    event.preventDefault();
    event.stopPropagation();
    const point = toFlowPoint(event.clientX, event.clientY);
    if (!point) return;
    transformRef.current = {
      mode: "resize",
      pointerId: event.pointerId,
      id: selectedElement.id,
      start: point,
      original: cloneRelaxElements([selectedElement])[0],
      originalBounds: { ...selectedBounds },
      direction,
      snapshot: cloneRelaxElements(elementsRef.current),
      changed: false
    };
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      const transform = transformRef.current;
      if (!transform || transform.pointerId !== event.pointerId) return;
      const point = toFlowPoint(event.clientX, event.clientY);
      if (!point) return;
      const delta = { x: point.x - transform.start.x, y: point.y - transform.start.y };
      transform.changed = transform.changed || Math.hypot(delta.x, delta.y) > 1;
      let next = transform.original;
      if (transform.mode === "move") {
        next = translateRelaxElement(transform.original, delta);
      } else {
        const original = transform.originalBounds;
        let left = original.x;
        let top = original.y;
        let right = original.x + original.width;
        let bottom = original.y + original.height;
        if (transform.direction?.includes("w")) left = Math.min(right - MIN_VECTOR_SIZE, original.x + delta.x);
        if (transform.direction?.includes("e")) right = Math.max(left + MIN_VECTOR_SIZE, original.x + original.width + delta.x);
        if (transform.direction?.includes("n")) top = Math.min(bottom - MIN_VECTOR_SIZE, original.y + delta.y);
        if (transform.direction?.includes("s")) bottom = Math.max(top + MIN_VECTOR_SIZE, original.y + original.height + delta.y);
        next = resizeRelaxElement(transform.original, original, { x: left, y: top, width: right - left, height: bottom - top });
        if (next.kind === "text") next = { ...next, autoSize: false };
      }
      setElements((current) => current.map((element) => element.id === transform.id ? next : element));
    }
    function handlePointerUp(event: PointerEvent): void {
      const transform = transformRef.current;
      if (!transform || transform.pointerId !== event.pointerId) return;
      transformRef.current = null;
      if (transform.changed) pushSnapshot(transform.snapshot);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [pushSnapshot]);

  const deleteSelected = useCallback((): void => {
    if (!selectedId) return;
    commitElements(elementsRef.current.filter((element) => element.id !== selectedId));
    setSelectedId(null);
    setEditingTextId(null);
  }, [commitElements, selectedId]);

  const duplicateSelected = useCallback((): void => {
    const selected = elementsRef.current.find((element) => element.id === selectedId);
    if (!selected) return;
    const duplicate = translateRelaxElement({ ...cloneRelaxElements([selected])[0], id: crypto.randomUUID() }, { x: 24, y: 24 });
    commitElements([...elementsRef.current, duplicate]);
    setSelectedId(duplicate.id);
  }, [commitElements, selectedId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      const command = event.metaKey || event.ctrlKey;
      if (!typing && command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (!typing && command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!typing && !command && !event.altKey) {
        const shortcuts: Partial<Record<string, RelaxFlowTool>> = {
          v: "select",
          b: "brush",
          r: "rect",
          o: "ellipse",
          a: "arrow",
          t: "text",
          e: "eraser"
        };
        const nextTool = shortcuts[event.key.toLowerCase()];
        if (nextTool) setTool(nextTool);
      }
      if (event.key === "Escape") {
        if (editingTextId) setEditingTextId(null);
        else if (selectedId) setSelectedId(null);
        else onBack();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, duplicateSelected, editingTextId, onBack, redo, selectedId, undo]);

  useEffect(() => {
    let frame = 0;
    function handleResize(): void {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void flowRef.current?.fitView({ padding: 0.3, maxZoom: 1.1 });
      });
    }
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function beginPropertyMutation(): void {
    if (!propertySnapshotRef.current) propertySnapshotRef.current = cloneRelaxElements(elementsRef.current);
  }

  function endPropertyMutation(): void {
    const snapshot = propertySnapshotRef.current;
    propertySnapshotRef.current = null;
    if (snapshot) pushSnapshot(snapshot);
  }

  function updateSelected(patch: Partial<RelaxFlowElement>): void {
    if (!selectedId) return;
    setElements((current) => current.map((element) => element.id === selectedId
      ? { ...element, ...patch } as RelaxFlowElement
      : element));
  }

  function updateFontSize(nextFontSize: number): void {
    setFontSize(nextFontSize);
    if (!selectedId) return;
    setElements((current) => current.map((element) => (
      element.id === selectedId && element.kind === "text"
        ? resizeAutoText(element, element.text, nextFontSize)
        : element
    )));
  }

  function setElementVisibility(id: string): void {
    const next = elementsRef.current.map((element) => element.id === id ? { ...element, visible: !element.visible } : element);
    commitElements(next);
  }

  function moveLayer(id: string, direction: -1 | 1): void {
    const current = elementsRef.current;
    const index = current.findIndex((element) => element.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    commitElements(next);
  }

  function updateSelectedBounds(key: keyof RelaxBounds, value: number): void {
    if (!selectedElement || !selectedBounds || !Number.isFinite(value)) return;
    const nextBounds = { ...selectedBounds, [key]: key === "width" || key === "height" ? Math.max(MIN_VECTOR_SIZE, value) : value };
    setElements(elementsRef.current.map((element) => {
      if (element.id !== selectedElement.id) return element;
      const resized = resizeRelaxElement(element, selectedBounds, nextBounds);
      return resized.kind === "text" && (key === "width" || key === "height")
        ? { ...resized, autoSize: false }
        : resized;
    }));
  }

  function endTextEditing(): void {
    const snapshot = textSnapshotRef.current;
    textSnapshotRef.current = null;
    if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(elementsRef.current)) pushSnapshot(snapshot);
    setEditingTextId(null);
    setTool("select");
  }

  function buildAssistantUnderstanding(result: RelaxFlowInterpretation): string {
    return [
      "**编辑意图已识别**",
      result.explanation.trim(),
      "**当前编辑方案**",
      result.prompt.trim()
    ].filter(Boolean).join("\n\n");
  }

  async function recognizeIntent(): Promise<void> {
    if (submitting || elements.filter((element) => element.visible).length === 0 || blockedMessage) return;
    setSubmitting(true);
    setActiveOperation("understanding");
    setWorkflowErrorStep(null);
    setGenerationComplete(false);
    setSelectedId(null);
    setEditingTextId(null);
    setIntentResult("");
    try {
      const boardDataUrl = await exportFlowBoard(source, imageBounds, elementsRef.current);
      const request = {
        boardDataUrl,
        annotationSummary: buildRelaxFlowAnnotationSummary(elementsRef.current, imageBounds)
      };
      const result = await onInterpret(request, (delta) => setIntentResult((current) => current + delta));
      interpretationSignatureRef.current = JSON.stringify(elementsRef.current);
      setActiveRequest(request);
      setInterpretation(result);
      setIntentStale(false);
      setIntentResult(buildAssistantUnderstanding(result));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "AI 无法理解当前 Flow 画板，请重试。 ";
      setWorkflowErrorStep("intent");
      setIntentResult(message);
    } finally {
      setSubmitting(false);
      setActiveOperation(null);
    }
  }

  async function refineIntent(): Promise<void> {
    const instruction = assistantValue.trim();
    if (!instruction || assistantStreaming || !interpretation || !activeRequest || intentStale) return;
    const requestId = assistantRequestRef.current + 1;
    assistantRequestRef.current = requestId;
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: instruction }
    ]);
    setAssistantValue("");
    setAssistantStreaming(true);
    setWorkflowErrorStep(null);
    setGenerationComplete(false);
    setIntentResult("");
    try {
      const result = await onRefine(
        activeRequest,
        interpretation,
        instruction,
        (delta) => {
          if (assistantRequestRef.current === requestId) setIntentResult((current) => current + delta);
        }
      );
      if (assistantRequestRef.current !== requestId) return;
      setInterpretation(result);
      setIntentResult(buildAssistantUnderstanding(result));
    } catch (caught) {
      if (assistantRequestRef.current !== requestId) return;
      const message = caught instanceof Error ? caught.message : "暂时无法更新编辑意图，请重试。";
      setWorkflowErrorStep("intent");
      setIntentResult(message);
    } finally {
      if (assistantRequestRef.current === requestId) setAssistantStreaming(false);
    }
  }

  async function generateEdit(): Promise<void> {
    if (submitting || !interpretation || intentStale) return;
    setSubmitting(true);
    setActiveOperation("generating");
    setWorkflowErrorStep(null);
    setGenerationComplete(false);
    setGeneratedPreview(null);
    setGenerationStartedAt(Date.now());
    generationVersionNumberRef.current = versions.length + 1;
    setGenerationResult("正在应用已确认的编辑方案。\n\n新版本将在右侧等尺寸显示，并加入版本历史。");
    try {
      const generated = await onGenerate(interpretation.prompt);
      const nextImage = generated[0];
      if (nextImage) {
        setGeneratedPreview({ image: nextImage, versionNumber: generationVersionNumberRef.current });
        onSwitchVersion(resolvedActiveVersion);
        setGenerationComplete(true);
        setGenerationResult("新版本已在右侧显示并加入版本历史。可在源图下方切换版本进行对比。");
      } else {
        setWorkflowErrorStep("generate");
        setGenerationResult("本次没有生成可用结果，请重试。");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "无法生成编辑，请重试。 ";
      setWorkflowErrorStep("generate");
      setGenerationResult(message);
    } finally {
      setSubmitting(false);
      setActiveOperation(null);
    }
  }

  const activeColor = selectedElement?.color ?? color;
  const activeWidth = selectedElement?.strokeWidth ?? strokeWidth;
  const activeOpacity = selectedElement?.opacity ?? opacity;
  const activeFill = selectedElement && (selectedElement.kind === "rect" || selectedElement.kind === "ellipse")
    ? selectedElement.fillOpacity
    : fillOpacity;
  const activeFontSize = selectedElement?.kind === "text" ? selectedElement.fontSize : fontSize;
  const drawingToolActive = tool !== "select" && tool !== "eraser" && !editingTextId;
  const intentActive = understandingActive || assistantStreaming;
  const assistantWorkflow: AiAssistantWorkflow = {
    label: `由 ${providerName} 协助完成`,
    steps: [
      {
        id: "target",
        label: "编辑目标已识别",
        detail: "当前中心图片将作为编辑基准",
        result: "已锁定当前中心图片。后续编辑只修改标注指向的对象与区域，未涉及的内容保持不变。",
        status: "complete"
      },
      {
        id: "intent",
        label: intentStale ? "画板已更新，需重新识别" : intentActive ? "正在识别编辑意图" : intentReady ? "编辑意图已识别" : "识别编辑意图",
        detail: intentActive
          ? `正在分析 ${visibleCount} 个标注与中心图片的空间关系`
          : intentReady
            ? "可继续对话修订编辑方案"
            : "AI 将理解标注、位置关系与文字说明",
        result: intentResult || undefined,
        streaming: intentActive,
        status: intentActive ? "active" : workflowErrorStep === "intent" ? "error" : intentReady ? "complete" : "pending"
      },
      {
        id: "generate",
        label: generationComplete ? "编辑已生成" : "生成编辑",
        detail: generationActive
          ? "正在应用编辑方案，新版本将在右侧等尺寸显示"
          : generationComplete
            ? "右侧查看新版本，源图下方切换版本"
            : "使用确认后的编辑方案生成新图片",
        result: generationResult || undefined,
        streaming: generationActive,
        status: generationActive
          ? "active"
          : workflowErrorStep === "generate"
            ? "error"
          : generationComplete
            ? "complete"
            : "pending"
      }
    ],
    actions: !intentReady
      ? [{
          id: "understand",
          label: understandingActive ? "正在 AI 理解" : intentStale ? "重新理解" : "AI 理解",
          loading: understandingActive,
          disabled: Boolean(blockedMessage) || visibleCount === 0 || submitting,
          onAction: () => void recognizeIntent()
        }]
      : [{
          id: "generate",
          label: generationActive ? "正在生成编辑" : "生成编辑",
          loading: generationActive,
          disabled: submitting || assistantStreaming,
          onAction: () => void generateEdit()
        }],
    notice: blockedMessage ?? undefined
  };

  return (
    <ReactFlowProvider>
      <TooltipProvider delayDuration={160}>
        <div className={cn(
          "fixed inset-0 z-[61] grid grid-rows-[52px_minmax(0,1fr)] bg-background",
          assistantOpen
            ? "grid-cols-[48px_minmax(0,1fr)_400px] max-[1080px]:grid-cols-[44px_minmax(0,1fr)_344px]"
            : "grid-cols-[48px_minmax(0,1fr)_304px] max-[920px]:grid-cols-[44px_minmax(0,1fr)_256px]"
        )}>
        <header className="col-span-3 flex min-w-0 items-center gap-2 border-b border-border bg-background py-0 pl-[84px] pr-3 [-webkit-app-region:drag]">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 [-webkit-app-region:no-drag]" disabled={submitting && !generationActive} onClick={onBack}><ArrowLeft className="h-4 w-4" />{uiText("高级编辑")}</Button>
          <div className="h-4 w-px bg-border" />
          <WandSparkles className="h-4 w-4 text-[hsl(var(--ai-accent))]" />
          <strong className="text-sm font-semibold">Relax Flow</strong>
          <span className="text-xs tabular-nums text-muted-foreground">v{resolvedActiveVersion + 1} / {versions.length}</span>
          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground">{visibleCount} {uiText("个元素")}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 [-webkit-app-region:no-drag]" aria-label={uiText("关闭编辑")} onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>

        <nav className="row-start-2 flex flex-col items-center gap-1 border-r border-border bg-background py-2.5" aria-label={uiText("Relax Flow 工具")}>
          <ToolButton tool="select" activeTool={tool} disabled={submitting} icon={<MousePointer2 className="h-4 w-4" />} onSelect={setTool} />
          <div className="my-0.5 h-px w-6 bg-border" />
          <ToolButton tool="brush" activeTool={tool} disabled={submitting} icon={<Brush className="h-4 w-4" />} onSelect={setTool} />
          <ToolButton tool="rect" activeTool={tool} disabled={submitting} icon={<Square className="h-4 w-4" />} onSelect={setTool} />
          <ToolButton tool="ellipse" activeTool={tool} disabled={submitting} icon={<Circle className="h-4 w-4" />} onSelect={setTool} />
          <ToolButton tool="arrow" activeTool={tool} disabled={submitting} icon={<ArrowUpRight className="h-4 w-4" />} onSelect={setTool} />
          <ToolButton tool="text" activeTool={tool} disabled={submitting} icon={<Type className="h-4 w-4" />} onSelect={setTool} />
          <ToolButton tool="eraser" activeTool={tool} disabled={submitting} icon={<Eraser className="h-4 w-4" />} onSelect={setTool} />
          <div className="my-0.5 h-px w-6 bg-border" />
          <Tooltip><TooltipTrigger asChild><button type="button" aria-label={uiText("撤销")} disabled={past.length === 0 || submitting} onClick={undo} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"><Undo2 className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="right">{uiText("撤销")}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button type="button" aria-label={uiText("重做")} disabled={future.length === 0 || submitting} onClick={redo} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"><Redo2 className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="right">{uiText("重做")}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><button type="button" aria-label={uiText("适应画板")} onClick={() => void flowRef.current?.fitView({ padding: 0.24, duration: 220, maxZoom: 1.15 })} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Focus className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="right">{uiText("适应画板")}</TooltipContent></Tooltip>
        </nav>

        <main className="relative row-start-2 min-h-0 min-w-0 overflow-hidden bg-muted/35" aria-label={uiText("Relax Flow 画板")} aria-busy={submitting || undefined}>
          <ReactFlow<Node<Record<string, unknown>>, never>
            nodes={[...imageNodes, ...generatedVersionNodes]}
            edges={[]}
            nodeTypes={NODE_TYPES}
            onInit={(instance) => { flowRef.current = instance; }}
            onPaneClick={() => { if (tool === "select") { setSelectedId(null); setEditingTextId(null); } }}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
            minZoom={0.1}
            maxZoom={4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            panActivationKeyCode="Space"
            panOnDrag={[1]}
            {...wheelInteraction}
            zoomOnPinch
            zoomOnDoubleClick={false}
            proOptions={PRO_OPTIONS}
            className="figma-canvas relax-flow-canvas"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.15} color="hsl(var(--canvas-dot))" />
            <ViewportPortal>
              <>
                {elements.map((element, index) => (
                  <VectorElement
                    key={element.id}
                    element={element}
                    index={index}
                    selected={selectedId === element.id}
                    editing={editingTextId === element.id}
                    interactive={tool === "select"}
                    erasing={tool === "eraser"}
                    onPointerDown={handleElementPointerDown}
                    onDoubleClick={(target) => {
                      if (target.kind === "text") {
                        textSnapshotRef.current = cloneRelaxElements(elementsRef.current);
                        setSelectedId(target.id);
                        setEditingTextId(target.id);
                      }
                    }}
                    onTextChange={(id, text) => setElements((current) => current.map((item) => (
                      item.id === id && item.kind === "text" ? resizeAutoText(item, text) : item
                    )))}
                    onTextBlur={endTextEditing}
                  />
                ))}
                {selectedBounds && tool === "select" && !editingTextId ? <SelectionFrame bounds={selectedBounds} onResizeStart={handleResizeStart} /> : null}
              </>
            </ViewportPortal>
          </ReactFlow>
          {drawingToolActive ? (
            <div
              className={cn("absolute inset-0 z-20 touch-none", tool === "text" ? "cursor-text" : "cursor-crosshair")}
              onPointerDown={handleDrawPointerDown}
              onPointerMove={handleDrawPointerMove}
              onPointerUp={handleDrawPointerUp}
              onPointerCancel={handleDrawPointerUp}
            />
          ) : null}
          {versions.length > 1 ? (
            <div
              className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-1.5 rounded-lg border border-border bg-background/96 p-1.5 shadow-sm backdrop-blur-sm"
              role="group"
              aria-label={uiText("图片版本")}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={uiText("上一个版本")}
                disabled={submitting || resolvedActiveVersion <= 0}
                onClick={() => switchSourceVersion(resolvedActiveVersion - 1)}
                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 gap-1.5 overflow-x-auto p-0.5">
                {versions.map((version, index) => (
                  <button
                    key={`${version.path}-${index}`}
                    type="button"
                    aria-label={uiText("切换到版本 {{ui:0}}", [index + 1])}
                    aria-pressed={index === resolvedActiveVersion}
                    disabled={submitting}
                    onClick={() => switchSourceVersion(index)}
                    className={cn(
                      "relative h-11 w-16 shrink-0 overflow-hidden rounded-md border bg-muted transition-[border-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                      index === resolvedActiveVersion
                        ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                        : "border-border opacity-70 hover:opacity-100"
                    )}
                  >
                    <img src={version.dataUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                    <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/92 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-foreground shadow-sm">
                      v{index + 1}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={uiText("下一个版本")}
                disabled={submitting || resolvedActiveVersion >= versions.length - 1}
                onClick={() => switchSourceVersion(resolvedActiveVersion + 1)}
                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-border/80 bg-background/92 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">{TOOL_LABELS[tool]}</div>
          {submitting ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2" aria-live="polite">
              <div className="flex items-center gap-2 rounded-md bg-background/96 px-3 py-2 text-xs font-medium shadow-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--ai-accent))] motion-reduce:animate-none" />
                {generationActive ? uiText("正在生成新版本") : uiText("正在理解 {{ui:0}} 个标注", [visibleCount])}
              </div>
            </div>
          ) : null}
        </main>

        <aside className="row-start-2 flex min-h-0 flex-col border-l border-border bg-background" aria-label={uiText("Relax Flow 检查器")}>
          {assistantOpen ? (
            <AiAssistant
              variant="docked"
              title={uiText("Relax Flow AI 助手")}
              subtitle={understandingActive
                ? "正在分析标注与图片的关系"
                : generationActive
                  ? "正在应用确认后的编辑方案"
                  : intentReady
                    ? "编辑方案可通过对话继续修改"
                    : "理解画板并生成编辑方案"}
              messages={assistantMessages}
              value={assistantValue}
              placeholder={intentReady ? uiText("继续描述你想怎样调整…") : uiText("完成 AI 理解后可继续对话修改")}
              streaming={assistantStreaming}
              workflow={assistantWorkflow}
              disabled={submitting || !intentReady}
              compact
              className="h-auto min-h-0 flex-1 border-0"
              onValueChange={setAssistantValue}
              onSubmit={() => void refineIntent()}
              onStop={() => {
                assistantRequestRef.current += 1;
                setAssistantStreaming(false);
                setAssistantMessages((current) => current.map((message) => (
                  message.streaming
                    ? { ...message, content: message.content || "已停止本次理解。", streaming: false }
                    : message
                )));
              }}
              onClose={() => setAssistantOpen(false)}
            />
          ) : <>
          <div className="flex h-11 shrink-0 items-end border-b border-border px-2">
            <button type="button" aria-pressed={inspectorTab === "properties"} onClick={() => setInspectorTab("properties")} className={cn("flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-b-2 border-transparent text-xs font-medium text-muted-foreground", inspectorTab === "properties" && "border-foreground text-foreground")}><SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />{uiText("属性")}</button>
            <button type="button" aria-pressed={inspectorTab === "layers"} onClick={() => setInspectorTab("layers")} className={cn("flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-b-2 border-transparent text-xs font-medium text-muted-foreground", inspectorTab === "layers" && "border-foreground text-foreground")}><Layers3 className="h-3.5 w-3.5 shrink-0" />{uiText("图层")}</button>
            <button type="button" aria-pressed="false" onClick={() => setAssistantOpen(true)} className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-b-2 border-transparent text-xs font-medium text-[hsl(var(--ai-accent))] hover:bg-accent/60"><WandSparkles className="h-3.5 w-3.5 shrink-0" />{uiText("AI 助手")}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {inspectorTab === "properties" ? (
              <>
                <section className="border-b border-border p-3.5">
                  <div className="mb-2.5 flex items-center justify-between"><span className="text-xs font-medium text-foreground">{selectedElement ? relaxElementLabel(selectedElement) : TOOL_LABELS[tool]}</span>{selectedElement ? <div className="flex items-center gap-0.5"><button type="button" aria-label={uiText("复制元素")} onClick={duplicateSelected} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button><button type="button" aria-label={uiText("删除元素")} onClick={deleteSelected} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div> : null}</div>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label={uiText("颜色")}>
                    {COLORS.map((swatch) => <button key={swatch} type="button" aria-label={uiText("选择颜色 {{ui:0}}", [swatch])} aria-pressed={activeColor === swatch} onClick={() => { if (selectedElement) { pushSnapshot(elementsRef.current); updateSelected({ color: swatch }); } setColor(swatch); }} className={cn("h-7 rounded-md border border-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", activeColor === swatch && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={{ backgroundColor: swatch }} />)}
                  </div>
                </section>
                {selectedBounds ? (
                  <section className="border-b border-border p-3.5">
                    <span className="mb-2 block text-xs font-medium text-muted-foreground">{uiText("位置与尺寸")}</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-[11px] text-muted-foreground"><span className="w-3 uppercase">{key === "width" ? "W" : key === "height" ? "H" : key}</span><input type="number" value={Math.round(selectedBounds[key])} onFocus={beginPropertyMutation} onBlur={endPropertyMutation} onChange={(event) => updateSelectedBounds(key, Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-right text-xs tabular-nums text-foreground outline-none" /></label>)}
                    </div>
                  </section>
                ) : null}
                {(selectedElement ? selectedElement.kind !== "text" : tool !== "text") ? <section className="border-b border-border p-3.5">
                  <label htmlFor="relax-stroke-width" className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground"><span>{uiText("线条")}</span><span className="tabular-nums text-foreground">{activeWidth}px</span></label>
                  <input id="relax-stroke-width" type="range" min="2" max="32" step="1" value={activeWidth} onPointerDown={beginPropertyMutation} onPointerUp={endPropertyMutation} onChange={(event) => { const next = Number(event.target.value); setStrokeWidth(next); updateSelected({ strokeWidth: next }); }} className="w-full accent-primary" />
                </section> : null}
                {(selectedElement?.kind === "rect" || selectedElement?.kind === "ellipse" || (!selectedElement && (tool === "rect" || tool === "ellipse"))) ? (
                  <section className="border-b border-border p-3.5"><label htmlFor="relax-fill" className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground"><span>{uiText("填充")}</span><span className="tabular-nums text-foreground">{Math.round(activeFill * 100)}%</span></label><input id="relax-fill" type="range" min="0" max="0.5" step="0.02" value={activeFill} onPointerDown={beginPropertyMutation} onPointerUp={endPropertyMutation} onChange={(event) => { const next = Number(event.target.value); setFillOpacity(next); if (selectedElement?.kind === "rect" || selectedElement?.kind === "ellipse") updateSelected({ fillOpacity: next }); }} className="w-full accent-primary" /></section>
                ) : null}
                {(selectedElement?.kind === "text" || (!selectedElement && tool === "text")) ? (
                  <section className="border-b border-border p-3.5">
                    <label htmlFor="relax-font-size" className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>{uiText("字号")}</span>
                      <span className="tabular-nums text-foreground">{activeFontSize}px</span>
                    </label>
                    <input id="relax-font-size" type="range" min="12" max="72" step="1" value={activeFontSize} onPointerDown={beginPropertyMutation} onPointerUp={endPropertyMutation} onChange={(event) => updateFontSize(Number(event.target.value))} className="w-full accent-primary" />
                    {selectedElement?.kind === "text" ? (
                      <div className="mt-3 flex rounded-md bg-muted p-0.5" role="group" aria-label={uiText("文字对齐")}>
                        {(["left", "center", "right"] as const).map((align) => {
                          const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                          const active = selectedElement.align === align;
                          return (
                            <button
                              key={align}
                              type="button"
                              aria-label={uiText("文字{{ui:0}}", [align])}
                              aria-pressed={active}
                              onClick={() => {
                                pushSnapshot(elementsRef.current);
                                updateSelected({ align });
                              }}
                              className={cn(
                                "relative isolate flex h-7 flex-1 items-center justify-center rounded-[5px] text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                active && "text-foreground"
                              )}
                            >
                              {active ? (
                                <SegmentedControlIndicator
                                  layoutId={`${segmentedLayoutId}-relax-text-alignment`}
                                  className="rounded-[5px] bg-background shadow-sm"
                                />
                              ) : null}
                              <Icon className="relative z-10 h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <section className="border-b border-border p-3.5"><label htmlFor="relax-opacity" className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground"><span>{uiText("不透明度")}</span><span className="tabular-nums text-foreground">{Math.round(activeOpacity * 100)}%</span></label><input id="relax-opacity" type="range" min="0.1" max="1" step="0.05" value={activeOpacity} onPointerDown={beginPropertyMutation} onPointerUp={endPropertyMutation} onChange={(event) => { const next = Number(event.target.value); setOpacity(next); updateSelected({ opacity: next }); }} className="w-full accent-primary" /></section>
              </>
            ) : (
              <div className="p-2">
                <div className="mb-1 flex h-8 items-center justify-between px-1.5"><span className="text-[11px] font-medium text-muted-foreground">{elements.length} {uiText("个图层")}</span>{selectedElement ? <div className="flex"><button type="button" aria-label={uiText("上移图层")} onClick={() => moveLayer(selectedElement.id, 1)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" aria-label={uiText("下移图层")} onClick={() => moveLayer(selectedElement.id, -1)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowDown className="h-3.5 w-3.5" /></button></div> : null}</div>
                <div className="space-y-0.5">
                  {[...elements].reverse().map((element) => (
                    <div key={element.id} className={cn("flex h-9 w-full items-center rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground", selectedId === element.id && "bg-accent text-foreground")}>
                      <button type="button" onClick={() => { setSelectedId(element.id); setEditingTextId(null); }} className="flex min-w-0 flex-1 items-center gap-2 self-stretch px-2 text-left">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-background" style={{ color: element.color }}>{elementIcon(element.kind)}</span>
                        <span className="min-w-0 flex-1 truncate">{relaxElementLabel(element)}</span>
                      </button>
                      <button type="button" aria-label={element.visible ? uiText("隐藏图层") : uiText("显示图层")} onClick={() => setElementVisibility(element.id)} className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background">
                        {element.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>}
        </aside>
        </div>
      </TooltipProvider>
    </ReactFlowProvider>
  );
}
