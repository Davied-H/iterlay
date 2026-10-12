import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Circle, CircleAlert, Clock3, FileText, Image as ImageIcon, Loader2, Minus, Play, Plus, SlidersHorizontal } from "lucide-react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import type { ProviderConfig } from "@shared/types";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { getProviderImageSizeOptions } from "@/lib/provider-image-sizes";
import { getProviderMaxImageCount } from "@/lib/provider-image-count";
import type { GeneratedImage } from "./image-node-model";
import { extractClipboardImageFiles } from "./canvas-clipboard";
import { useDebouncedNodeCommit } from "./use-debounced-node-commit";
import { useDelayedConnectionPoints } from "./use-delayed-connection-points";
import type { ConnectionTargetPresentation } from "./connection-target-presentation";
import { GENERATION_NODE_HEIGHT } from "./canvas-node-layout";

export {
  GENERATION_NODE_HEIGHT,
  GENERATION_NODE_MIN_WIDTH,
  GENERATION_NODE_WIDTH
} from "./canvas-node-layout";
export const GENERATION_NODE_MAX_HEIGHT = 560;
export const GENERATION_PROMPT_MAX_LENGTH = 2000;

type CanvasNodeSide = "top" | "right" | "bottom" | "left";
export type GenerationNodeStatus = "idle" | "queued" | "running" | "succeeded" | "failed";

export interface GenerationNodeConfig {
  prompt: string;
  model: string;
  size: string;
  count: number;
}

export interface GenerationNodeData extends GenerationNodeConfig, ConnectionTargetPresentation {
  title?: string;
  provider?: ProviderConfig;
  status?: GenerationNodeStatus;
  lastGenerationId?: string;
  latestGenerationId?: string;
  comicFrameRole?: "first-frame" | "last-frame";
  error?: string;
  upstreamPrompt?: string;
  referenceImages?: GeneratedImage[];
  displayHeight?: number;
  heightMode?: "auto" | "manual";
  onBeforeChange?: () => void;
  onChange?: (nodeId: string, patch: Partial<GenerationNodeConfig>) => void;
  onRun?: (nodeId: string, config: GenerationNodeConfig) => void;
  onAdopt?: (nodeId: string, versionId: string) => void;
  onPasteReferenceImages?: (nodeId: string, files: File[]) => void;
  onHeightChange?: (nodeId: string, height: number, mode: "auto" | "manual") => void;
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
const BUSY_STATUSES: ReadonlySet<GenerationNodeStatus> = new Set(["queued", "running"]);

export function generationStatusLabel(status: GenerationNodeStatus): string {
  switch (status) {
    case "queued": return "排队中";
    case "running": return "生成中";
    case "succeeded": return "已完成";
    case "failed": return "失败";
    default: return "待运行";
  }
}

function GenerationNodeComponent({ id, data, selected }: NodeProps): React.ReactElement {
  const connectionPoints = useDelayedConnectionPoints();
  const { getZoom } = useReactFlow();
  const nodeData = data as unknown as GenerationNodeData;
  const {
    title = "图片生成",
    prompt,
    model,
    size,
    count,
    status = "idle",
    error,
    upstreamPrompt = "",
    referenceImages = [],
    provider,
    displayHeight = GENERATION_NODE_HEIGHT,
    heightMode = "auto",
    onBeforeChange,
    onChange,
    onRun,
    onAdopt,
    latestGenerationId,
    lastGenerationId,
    comicFrameRole,
    onPasteReferenceImages,
    onHeightChange,
    onConnectionHandlePointerDown,
    connectionTargetActive,
    connectionSnapTargetHandle
  } = nodeData;
  const [draft, setDraft] = useState<GenerationNodeConfig>(() => configFromData(nodeData));
  const [referenceExpanded, setReferenceExpanded] = useState(false);
  const [nodeHeight, setNodeHeight] = useState(() => clampGenerationNodeHeight(displayHeight));
  const [promptOwnsWheel, setPromptOwnsWheel] = useState(false);
  const nodeHeightRef = useRef(nodeHeight);
  const [manualHeight, setManualHeight] = useState(heightMode === "manual");
  const nodeRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const minimumHeightRef = useRef(GENERATION_NODE_HEIGHT);
  const resizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const busy = BUSY_STATUSES.has(status);
  const { schedule, flush, finish, cancel } = useDebouncedNodeCommit(
    (config: GenerationNodeConfig) => onChange?.(id, config),
    undefined,
    onBeforeChange
  );
  nodeHeightRef.current = nodeHeight;

  useEffect(() => {
    cancel();
    setDraft(configFromData({ prompt, model, size, count }));
  }, [cancel, prompt, model, size, count]);

  useEffect(() => {
    if (resizeRef.current) return;
    setNodeHeight(clampGenerationNodeHeight(displayHeight));
    setManualHeight(heightMode === "manual");
  }, [displayHeight, heightMode]);

  useLayoutEffect(() => {
    if (resizeRef.current) return;
    const node = nodeRef.current;
    const composer = composerRef.current;
    const textarea = promptRef.current;
    if (!node || !composer || !textarea) return;

    const previousHeight = textarea.style.height;
    textarea.style.height = "0px";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = previousHeight;
    const promptShell = textarea.parentElement;
    const promptMeta = promptShell?.querySelector<HTMLElement>(".canvas-generation-prompt-meta");
    const promptShellMinHeight = promptShell ? Number.parseFloat(getComputedStyle(promptShell).minHeight) || 0 : 0;
    const promptShellHeight = Math.max(promptShellMinHeight, contentHeight + (promptMeta?.offsetHeight ?? 0));
    const fixedHeight = node.clientHeight - composer.clientHeight;
    const reference = composer.querySelector<HTMLElement>(".canvas-generation-reference");
    const imageTray = composer.querySelector<HTMLElement>(".canvas-generation-image-tray");
    const requiredHeight = clampGenerationNodeHeight(
      fixedHeight + outerBlockSize(reference) + promptShellHeight + outerBlockSize(imageTray)
    );
    minimumHeightRef.current = requiredHeight;
    const nextHeight = manualHeight ? Math.max(nodeHeight, requiredHeight) : requiredHeight;
    if (manualHeight && nextHeight === nodeHeight) return;
    setNodeHeight((current) => current === nextHeight ? current : nextHeight);
    const nextMode = manualHeight ? "manual" : "auto";
    if (Math.abs(nextHeight - displayHeight) >= 1 || heightMode !== nextMode) {
      onHeightChange?.(id, nextHeight, nextMode);
    }
  }, [displayHeight, draft.prompt, heightMode, id, manualHeight, nodeHeight, onHeightChange, referenceExpanded, referenceImages.length, upstreamPrompt]);

  useLayoutEffect(() => {
    const textarea = promptRef.current;
    if (!textarea || document.activeElement !== textarea) return;
    setPromptOwnsWheel(textarea.scrollHeight > textarea.clientHeight + 1);
  }, [draft.prompt, nodeHeight]);

  function update(patch: Partial<GenerationNodeConfig>): void {
    setDraft((current) => {
      const next = { ...current, ...patch };
      schedule(next);
      return next;
    });
  }

  return (
    <section
      ref={nodeRef}
      data-generation-node=""
      data-selected={selected ? "true" : undefined}
      data-connection-points-visible={connectionPoints.visible ? "true" : undefined}
      data-connection-target-active={connectionTargetActive ? "true" : undefined}
      data-connection-snap-target={connectionSnapTargetHandle}
      className={cn(
        "canvas-node-card canvas-workflow-node canvas-workflow-node--generation group relative flex w-[340px] cursor-grab flex-col overflow-visible active:cursor-grabbing",
        selected && "canvas-workflow-node--selected"
      )}
      style={{ height: nodeHeight }}
      aria-label={`${title}节点，${generationStatusLabel(status)}`}
      onPointerEnter={connectionPoints.showConnectionPoints}
      onPointerLeave={connectionPoints.scheduleConnectionPointsHide}
    >
      <NodeHandles nodeId={id} onConnectionHandlePointerDown={onConnectionHandlePointerDown} />
      <header className="canvas-workflow-node__header">
        <span className="canvas-workflow-node__icon canvas-workflow-node__icon--generation">
          <ImageIcon aria-hidden />
        </span>
        <span className="canvas-workflow-node__title">{title}</span>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-generation-node-status={status}
          className={cn(
            "canvas-generation-status",
            status === "failed"
              ? "bg-destructive/10 text-destructive"
              : status === "succeeded"
                ? "bg-[hsl(var(--success-muted))] text-[hsl(var(--success))]"
                : busy
                  ? "bg-[hsl(var(--canvas-ai-muted))] text-[hsl(var(--canvas-ai-accent))]"
                  : "bg-muted text-muted-foreground"
          )}
        >
          <GenerationStatusIcon status={status} />
          {generationStatusLabel(status)}
        </span>
      </header>

      <div className="nodrag canvas-generation-body" onPointerDown={(event) => event.stopPropagation()}>
        <div ref={composerRef} className="canvas-generation-composer">
          {upstreamPrompt ? (
            <div className="canvas-generation-reference" data-expanded={referenceExpanded ? "true" : "false"}>
              <div className="canvas-generation-reference__head">
                <FileText aria-hidden />
                <span className="canvas-generation-reference__copy">
                  <strong>引用：上游文本</strong>
                  <span>{upstreamPrompt}</span>
                </span>
                <button
                  type="button"
                  className="canvas-generation-reference__toggle"
                  aria-label={referenceExpanded ? "收起提示词引用" : "展开提示词引用"}
                  aria-expanded={referenceExpanded}
                  onClick={() => setReferenceExpanded((current) => !current)}
                >
                  <ChevronDown aria-hidden />
                </button>
              </div>
              <p>{upstreamPrompt}</p>
            </div>
          ) : null}
          <div className="canvas-generation-prompt-shell">
            <textarea
              ref={promptRef}
              aria-label="生成提示词"
              value={draft.prompt}
              maxLength={GENERATION_PROMPT_MAX_LENGTH}
              placeholder="补充本次画面的主体、环境或风格..."
              disabled={busy}
              className={cn("canvas-generation-prompt", promptOwnsWheel && "nopan nowheel")}
              onChange={(event) => update({ prompt: event.target.value })}
              onPaste={(event) => {
                if (!onPasteReferenceImages) return;
                const files = extractClipboardImageFiles(event.clipboardData);
                if (files.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                onPasteReferenceImages(id, files);
              }}
              onFocus={(event) => {
                setPromptOwnsWheel(event.currentTarget.scrollHeight > event.currentTarget.clientHeight + 1);
              }}
              onBlur={() => {
                setPromptOwnsWheel(false);
                finish();
              }}
              onWheel={(event) => {
                if (promptOwnsWheel) event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter" || busy) return;
                event.preventDefault();
                flush();
                onRun?.(id, draft);
              }}
            />
            <div className="canvas-generation-prompt-meta">
              <span className={cn("canvas-generation-shortcut", draft.prompt.trim() && "canvas-generation-shortcut--active")}>
                ⌘ Enter 生成
              </span>
              <span>{draft.prompt.length} / {GENERATION_PROMPT_MAX_LENGTH}</span>
            </div>
            <GenerationPromptResizeHandle
              id={id}
              nodeHeight={nodeHeight}
              nodeHeightRef={nodeHeightRef}
              minimumHeightRef={minimumHeightRef}
              resizeRef={resizeRef}
              displayHeight={displayHeight}
              heightMode={heightMode}
              getZoom={getZoom}
              onBeforeChange={onBeforeChange}
              onHeightChange={onHeightChange}
              setManualHeight={setManualHeight}
              setNodeHeight={setNodeHeight}
            />
          </div>
          {referenceImages.length > 0 ? (
            <div className="canvas-generation-image-tray" aria-label="参考图">
              {referenceImages.slice(0, 4).map((image, index) => (
                <span className="canvas-generation-thumb" key={image.id}>
                  <img src={image.dataUrl || image.path} alt={`参考图 ${index + 1}`} />
                  <small>参考</small>
                </span>
              ))}
              <span className="canvas-generation-reference-count">参考图 {Math.min(referenceImages.length, 4)}/4</span>
            </div>
          ) : null}
        </div>
        <div className="canvas-generation-settings">
          <input
            aria-label="生成模型"
            value={draft.model}
            disabled={busy}
            className="canvas-generation-setting canvas-generation-setting--model"
            onChange={(event) => update({ model: event.target.value })}
            onBlur={finish}
          />
          <GenerationNodeSettingsPicker
            size={draft.size}
            count={draft.count}
            maxCount={Math.min(8, getProviderMaxImageCount(provider))}
            provider={provider}
            disabled={busy}
            onChange={update}
          />
        </div>
      </div>

      <footer className="nodrag canvas-generation-footer" onPointerDown={(event) => event.stopPropagation()}>
        <span className={cn("canvas-generation-summary", status === "failed" && error && "text-destructive")} role={status === "failed" && error ? "alert" : undefined} title={error}>
          {status === "failed" && error
            ? error
            : generationInputSummary(Boolean(upstreamPrompt), referenceImages.length)}
        </span>
        {comicFrameRole && latestGenerationId && latestGenerationId !== lastGenerationId ? (
          <button type="button" disabled={busy} className="canvas-generation-run" onClick={() => onAdopt?.(id, latestGenerationId)}>
            <Check aria-hidden className="h-3.5 w-3.5" />采用此版本
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          aria-label={busy ? generationStatusLabel(status) : "运行生成节点"}
          className="canvas-generation-run"
          onClick={() => {
            flush();
            onRun?.(id, draft);
          }}
        >
          {busy ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
          {busy ? generationStatusLabel(status) : "生成图片"}
        </button>
      </footer>
    </section>
  );
}

function GenerationNodeSettingsPicker({
  size,
  count,
  maxCount,
  provider,
  disabled,
  onChange
}: {
  size: string;
  count: number;
  maxCount: number;
  provider?: ProviderConfig;
  disabled: boolean;
  onChange: (patch: Partial<GenerationNodeConfig>) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const providerOptions = getProviderImageSizeOptions(provider);
  const options = providerOptions.some((option) => option.value === size)
    ? providerOptions
    : [{ value: size, ratio: "当前自定义尺寸" }, ...providerOptions];

  function updateCount(next: number): void {
    onChange({ count: Math.max(1, Math.min(maxCount, Math.trunc(next) || 1)) });
  }

  function selectSize(nextSize: string): void {
    onChange({ size: nextSize });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="生成设置"
          aria-expanded={open}
          className="canvas-generation-settings-trigger"
        >
          <SlidersHorizontal aria-hidden />
          <span>{count} 张</span>
          <span aria-hidden className="canvas-generation-settings-trigger__divider" />
          <span className="canvas-generation-settings-trigger__size">{size === "auto" ? "自动" : size}</span>
          <ChevronDown aria-hidden className="canvas-generation-settings-trigger__chevron" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        className="nodrag nopan nowheel w-64 p-2.5"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="mb-2.5 text-sm font-semibold text-foreground">生成设置</p>
        <div>
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">尺寸</p>
          <div className="flex flex-col gap-0.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectSize(option.value)}
                className={cn(
                  "flex min-h-8 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                  size === option.value && "bg-accent"
                )}
              >
                <span className="text-xs font-medium tabular-nums text-foreground">
                  {option.value === "auto" ? "自动" : option.value}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {option.value === "auto" ? "由模型决定" : option.ratio}
                </span>
              </button>
            ))}
          </div>
        </div>
        <Separator className="my-2" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">生成数量</span>
          <div className="flex h-8 w-28 items-stretch overflow-hidden rounded-md border border-border bg-background">
            <button
              type="button"
              aria-label="减少生成数量"
              disabled={count <= 1}
              onClick={() => updateCount(count - 1)}
              className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-35"
            >
              <Minus aria-hidden className="h-3.5 w-3.5" />
            </button>
            <span className="flex min-w-0 flex-1 items-center justify-center border-x border-border text-xs font-medium tabular-nums">
              {count}
            </span>
            <button
              type="button"
              aria-label="增加生成数量"
              disabled={count >= maxCount}
              onClick={() => updateCount(count + 1)}
              className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-35"
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface GenerationPromptResizeHandleProps {
  id: string;
  nodeHeight: number;
  nodeHeightRef: React.MutableRefObject<number>;
  minimumHeightRef: React.MutableRefObject<number>;
  resizeRef: React.MutableRefObject<{ pointerId: number; startY: number; startHeight: number } | null>;
  displayHeight: number;
  heightMode: "auto" | "manual";
  getZoom: () => number;
  onBeforeChange?: () => void;
  onHeightChange?: GenerationNodeData["onHeightChange"];
  setManualHeight: React.Dispatch<React.SetStateAction<boolean>>;
  setNodeHeight: React.Dispatch<React.SetStateAction<number>>;
}

function GenerationPromptResizeHandle({
  id,
  nodeHeight,
  nodeHeightRef,
  minimumHeightRef,
  resizeRef,
  displayHeight,
  heightMode,
  getZoom,
  onBeforeChange,
  onHeightChange,
  setManualHeight,
  setNodeHeight
}: GenerationPromptResizeHandleProps): React.ReactElement {
  return (
    <button
      type="button"
      role="separator"
      aria-label="调整生成提示词输入框高度"
      aria-orientation="horizontal"
      aria-valuemin={GENERATION_NODE_HEIGHT}
      aria-valuemax={GENERATION_NODE_MAX_HEIGHT}
      aria-valuenow={Math.round(nodeHeight)}
      title="拖拽调整高度 · 双击恢复自动适应"
      data-resizing={resizeRef.current ? "true" : undefined}
      className="nodrag nopan canvas-generation-prompt-resize-handle"
      onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          onBeforeChange?.();
          resizeRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: nodeHeight };
          setManualHeight(true);
          event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
          const resize = resizeRef.current;
          if (!resize || resize.pointerId !== event.pointerId) return;
          const nextHeight = clampGenerationNodeHeight(
            Math.max(
              minimumHeightRef.current,
              resize.startHeight + (event.clientY - resize.startY) / Math.max(getZoom(), 0.01)
            )
          );
          nodeHeightRef.current = nextHeight;
          setNodeHeight(nextHeight);
      }}
      onPointerUp={(event) => {
          const resize = resizeRef.current;
          if (!resize || resize.pointerId !== event.pointerId) return;
          resizeRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          onHeightChange?.(id, nodeHeightRef.current, "manual");
      }}
      onPointerCancel={(event) => {
          if (resizeRef.current?.pointerId !== event.pointerId) return;
          resizeRef.current = null;
          setNodeHeight(clampGenerationNodeHeight(displayHeight));
          setManualHeight(heightMode === "manual");
      }}
      onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBeforeChange?.();
          setManualHeight(false);
          onHeightChange?.(id, nodeHeight, "auto");
      }}
      onKeyDown={(event) => {
          const direction = event.key === "ArrowUp" ? -8 : event.key === "ArrowDown" ? 8 : 0;
          const targetHeight = event.key === "Home"
            ? GENERATION_NODE_HEIGHT
            : event.key === "End"
              ? GENERATION_NODE_MAX_HEIGHT
              : direction ? nodeHeight + direction : null;
          if (targetHeight === null) return;
          event.preventDefault();
          event.stopPropagation();
          onBeforeChange?.();
          const nextHeight = clampGenerationNodeHeight(targetHeight);
          const constrainedHeight = Math.max(minimumHeightRef.current, nextHeight);
          nodeHeightRef.current = constrainedHeight;
          setManualHeight(true);
          setNodeHeight(constrainedHeight);
          onHeightChange?.(id, constrainedHeight, "manual");
      }}
    >
      <span aria-hidden />
    </button>
  );
}

function outerBlockSize(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = getComputedStyle(element);
  return element.offsetHeight
    + (Number.parseFloat(style.marginTop) || 0)
    + (Number.parseFloat(style.marginBottom) || 0);
}

export function clampGenerationNodeHeight(value: number): number {
  if (!Number.isFinite(value)) return GENERATION_NODE_HEIGHT;
  return Math.round(Math.max(GENERATION_NODE_HEIGHT, Math.min(GENERATION_NODE_MAX_HEIGHT, value)));
}

function GenerationStatusIcon({ status }: { status: GenerationNodeStatus }): React.ReactElement | null {
  if (status === "queued") return <Clock3 aria-hidden className="h-3 w-3" />;
  if (status === "running") return <Loader2 aria-hidden className="h-3 w-3 animate-spin motion-reduce:animate-none" />;
  if (status === "succeeded") return <Check aria-hidden className="h-3 w-3" />;
  if (status === "failed") return <CircleAlert aria-hidden className="h-3 w-3" />;
  return <Circle aria-hidden className="h-3 w-3" />;
}

function generationInputSummary(hasPromptReference: boolean, referenceCount: number): string {
  const parts = [
    hasPromptReference ? "1 条引用" : "",
    referenceCount > 0 ? `${Math.min(referenceCount, 4)} 张参考图` : ""
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "等待输入";
}

function configFromData(data: GenerationNodeData): GenerationNodeConfig {
  return {
    prompt: data.prompt ?? "",
    model: data.model ?? "",
    size: data.size ?? "1024x1024",
    count: clampCount(data.count)
  };
}

function clampCount(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(8, Math.floor(value))) : 1;
}

interface NodeHandlesProps {
  nodeId: string;
  onConnectionHandlePointerDown?: GenerationNodeData["onConnectionHandlePointerDown"];
}

function NodeHandles({ nodeId, onConnectionHandlePointerDown }: NodeHandlesProps): React.ReactElement {
  return (
    <>
      {SIDES.map((position) => {
        const side = position.toLowerCase() as CanvasNodeSide;
        return (
          <div key={side} className={`image-node-connection-point image-node-connection-point--${side}`}>
            <Handle type="target" position={position} id={`target-${side}`} isConnectableStart className="image-node-connection-handle image-node-connection-handle--target nodrag nopan" />
            <Handle type="source" position={position} id={`source-${side}`} isConnectableEnd className="image-node-connection-handle image-node-connection-handle--source nodrag nopan" />
            <button
              type="button"
              aria-label={`从${SIDE_LABELS[side]}侧创建连接`}
              className="nodrag nopan image-node-connection-trigger"
              onPointerDownCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onConnectionHandlePointerDown?.(
                  nodeId,
                  side,
                  event.clientX,
                  event.clientY,
                  event.pointerId
                );
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.detail !== 0) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onConnectionHandlePointerDown?.(
                  nodeId,
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
    </>
  );
}

export const GenerationNode = memo(GenerationNodeComponent);
