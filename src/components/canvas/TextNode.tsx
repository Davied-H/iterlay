import { useUiText } from "@/i18n";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useDebouncedNodeCommit } from "./use-debounced-node-commit";
import { useDelayedConnectionPoints } from "./use-delayed-connection-points";
import type { ConnectionTargetPresentation } from "./connection-target-presentation";
import { TEXT_NODE_HEIGHT, TEXT_NODE_WIDTH } from "./canvas-node-layout";

export { TEXT_NODE_HEIGHT, TEXT_NODE_MIN_WIDTH, TEXT_NODE_WIDTH } from "./canvas-node-layout";
export const TEXT_NODE_MAX_HEIGHT = 560;
export const TEXT_NODE_MAX_LENGTH = 2000;

type CanvasNodeSide = "top" | "right" | "bottom" | "left";

export interface TextNodeData extends ConnectionTargetPresentation {
  text: string;
  title?: string;
  displayHeight?: number;
  heightMode?: "auto" | "manual";
  onBeforeChange?: () => void;
  onChange?: (nodeId: string, text: string) => void;
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

function TextNodeComponent({ id, data, selected }: NodeProps): React.ReactElement {
  const uiText = useUiText();

  const connectionPoints = useDelayedConnectionPoints();
  const { getZoom } = useReactFlow();
  const {
  text,
  title = "文本",
  displayHeight = TEXT_NODE_HEIGHT,
  heightMode = "auto",
  onBeforeChange,
  onChange,
  onHeightChange,
  onConnectionHandlePointerDown,
  connectionTargetActive,
  connectionSnapTargetHandle
} = data as unknown as TextNodeData;
  const [draft, setDraft] = useState(text);
  const [nodeHeight, setNodeHeight] = useState(() => clampTextNodeHeight(displayHeight));
  const [manualHeight, setManualHeight] = useState(heightMode === "manual");
  const [textareaOwnsWheel, setTextareaOwnsWheel] = useState(false);
  const nodeRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeHeightRef = useRef(nodeHeight);
  const resizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const { schedule, finish, cancel } = useDebouncedNodeCommit(
    (nextText: string) => onChange?.(id, nextText),
    undefined,
    onBeforeChange
  );
  nodeHeightRef.current = nodeHeight;

  useEffect(() => {
    cancel();
    setDraft(text);
  }, [cancel, text]);

  useEffect(() => {
    if (resizeRef.current) return;
    setNodeHeight(clampTextNodeHeight(displayHeight));
    setManualHeight(heightMode === "manual");
  }, [displayHeight, heightMode]);

  useLayoutEffect(() => {
    if (manualHeight || resizeRef.current) return;
    const node = nodeRef.current;
    const textarea = textareaRef.current;
    if (!node || !textarea) return;

    const previousHeight = textarea.style.height;
    textarea.style.height = "0px";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = previousHeight;
    const fixedHeight = node.getBoundingClientRect().height - textarea.clientHeight;
    const nextHeight = clampTextNodeHeight(fixedHeight + Math.max(128, contentHeight));
    setNodeHeight((current) => current === nextHeight ? current : nextHeight);
    if (Math.abs(nextHeight - displayHeight) >= 1 || heightMode !== "auto") {
      onHeightChange?.(id, nextHeight, "auto");
    }
  }, [displayHeight, draft, heightMode, id, manualHeight, onHeightChange]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || document.activeElement !== textarea) return;
    setTextareaOwnsWheel(textarea.scrollHeight > textarea.clientHeight + 1);
  }, [draft, nodeHeight]);

  return (
    <section
      ref={nodeRef}
      data-text-node=""
      data-selected={selected ? "true" : undefined}
      data-connection-points-visible={connectionPoints.visible ? "true" : undefined}
      data-connection-target-active={connectionTargetActive ? "true" : undefined}
      data-connection-snap-target={connectionSnapTargetHandle}
      className={cn(
        "canvas-node-card canvas-workflow-node canvas-workflow-node--text group relative flex cursor-grab flex-col overflow-visible active:cursor-grabbing",
        selected && "canvas-workflow-node--selected"
      )}
      style={{ width: TEXT_NODE_WIDTH, height: nodeHeight }}
      aria-label={uiText("{{ui:0}}节点", [title])}
      onPointerEnter={connectionPoints.showConnectionPoints}
      onPointerLeave={connectionPoints.scheduleConnectionPointsHide}
    >
      <NodeHandles nodeId={id} onConnectionHandlePointerDown={onConnectionHandlePointerDown} />
      <header className="canvas-workflow-node__header">
        <span className="canvas-workflow-node__icon canvas-workflow-node__icon--text">
          <FileText aria-hidden />
        </span>
        <span className="canvas-workflow-node__title">{title}</span>
      </header>
      <div className="canvas-workflow-node__editor">
        <textarea
          ref={textareaRef}
          aria-label={uiText("文本内容")}
          value={draft}
          maxLength={TEXT_NODE_MAX_LENGTH}
          placeholder={uiText("写下画面意图、语气与关键约束...")}
          className={cn(
            "nodrag canvas-workflow-node__textarea",
            textareaOwnsWheel && "nopan nowheel"
          )}
          onChange={(event) => {
            const nextText = event.target.value;
            setDraft(nextText);
            schedule(nextText);
          }}
          onFocus={(event) => {
            setTextareaOwnsWheel(event.currentTarget.scrollHeight > event.currentTarget.clientHeight + 1);
          }}
          onBlur={() => {
            setTextareaOwnsWheel(false);
            finish();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => {
            if (textareaOwnsWheel) event.stopPropagation();
          }}
        />
        <footer className="canvas-workflow-node__meta">
          <span>{uiText("自动保存")}</span>
          <span className="canvas-workflow-node__count" aria-label={uiText("{{ui:0}} / {{ui:1}} 个字符", [draft.length, TEXT_NODE_MAX_LENGTH])}>
            {draft.length} / {TEXT_NODE_MAX_LENGTH}
          </span>
        </footer>
        <button
          type="button"
          role="separator"
          aria-label={uiText("调整文本输入框高度")}
          aria-orientation="horizontal"
          aria-valuemin={TEXT_NODE_HEIGHT}
          aria-valuemax={TEXT_NODE_MAX_HEIGHT}
          aria-valuenow={Math.round(nodeHeight)}
          title={uiText("拖拽调整高度 · 双击恢复自动适应")}
          data-resizing={resizeRef.current ? "true" : undefined}
          className="nodrag nopan canvas-text-resize-handle"
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
            const nextHeight = clampTextNodeHeight(
              resize.startHeight + (event.clientY - resize.startY) / Math.max(getZoom(), 0.01)
            );
            nodeHeightRef.current = nextHeight;
            setNodeHeight(nextHeight);
          }}
          onPointerUp={(event) => {
            if (resizeRef.current?.pointerId !== event.pointerId) return;
            resizeRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
            onHeightChange?.(id, nodeHeightRef.current, "manual");
          }}
          onPointerCancel={(event) => {
            if (resizeRef.current?.pointerId !== event.pointerId) return;
            resizeRef.current = null;
            setNodeHeight(clampTextNodeHeight(displayHeight));
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
              ? TEXT_NODE_HEIGHT
              : event.key === "End"
                ? TEXT_NODE_MAX_HEIGHT
                : direction ? nodeHeight + direction : null;
            if (targetHeight === null) return;
            event.preventDefault();
            event.stopPropagation();
            onBeforeChange?.();
            const nextHeight = clampTextNodeHeight(targetHeight);
            nodeHeightRef.current = nextHeight;
            setManualHeight(true);
            setNodeHeight(nextHeight);
            onHeightChange?.(id, nextHeight, "manual");
          }}
        >
          <span aria-hidden />
        </button>
      </div>
    </section>
  );
}

export function clampTextNodeHeight(value: number): number {
  if (!Number.isFinite(value)) return TEXT_NODE_HEIGHT;
  return Math.round(Math.max(TEXT_NODE_HEIGHT, Math.min(TEXT_NODE_MAX_HEIGHT, value)));
}

interface NodeHandlesProps {
  nodeId: string;
  onConnectionHandlePointerDown?: TextNodeData["onConnectionHandlePointerDown"];
}

function NodeHandles({ nodeId, onConnectionHandlePointerDown }: NodeHandlesProps): React.ReactElement {
  const uiText = useUiText();

  return (
    <>
      {SIDES.map((position) => {
        const side = position.toLowerCase() as CanvasNodeSide;
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
              aria-label={uiText("从{{ui:0}}侧创建连接", [SIDE_LABELS[side]])}
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

export const TextNode = memo(TextNodeComponent);
