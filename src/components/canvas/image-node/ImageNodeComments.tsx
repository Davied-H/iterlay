import { useEffect, useRef, useState } from "react";
import { MessageSquareText, Trash2 } from "lucide-react";
import type { AssetComment } from "@shared/types";

interface ImageNodeCommentsProps {
  comments: AssetComment[];
  onOpenComments?: () => void;
  onMoveComment?: (id: string, position: NonNullable<AssetComment["position"]>) => void;
  onDeleteComment?: (id: string) => void;
}

export function ImageNodeComments({
  comments,
  onOpenComments,
  onMoveComment,
  onDeleteComment
}: ImageNodeCommentsProps): React.ReactElement {
  return (
    <>
      {comments.filter((comment) => comment.position).map((comment, index) => (
        <CommentMarker
          key={comment.id}
          comment={comment}
          number={index + 1}
          onOpenComments={onOpenComments}
          onMoveComment={onMoveComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </>
  );
}

function CommentMarker({
  comment,
  number,
  onOpenComments,
  onMoveComment,
  onDeleteComment
}: {
  comment: AssetComment;
  number: number;
  onOpenComments?: () => void;
  onMoveComment?: (id: string, position: NonNullable<AssetComment["position"]>) => void;
  onDeleteComment?: (id: string) => void;
}): React.ReactElement {
  const position = comment.position ?? { x: 0.5, y: 0.5 };
  const [draftPosition, setDraftPosition] = useState(position);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: NonNullable<AssetComment["position"]>;
    imageRect: DOMRect;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const previewId = `comment-marker-${comment.id}`;

  useEffect(() => {
    if (!dragRef.current) setDraftPosition(comment.position ?? { x: 0.5, y: 0.5 });
  }, [comment.position]);

  function positionForPointer(event: React.PointerEvent<HTMLButtonElement>): NonNullable<AssetComment["position"]> {
    const drag = dragRef.current;
    if (!drag) return draftPosition;
    return {
      x: Math.min(1, Math.max(0, drag.startPosition.x + (event.clientX - drag.startClientX) / drag.imageRect.width)),
      y: Math.min(1, Math.max(0, drag.startPosition.y + (event.clientY - drag.startClientY) / drag.imageRect.height))
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    const imageNode = event.currentTarget.closest<HTMLElement>("[data-image-node]");
    const imageRect = imageNode?.getBoundingClientRect();
    if (!imageRect || imageRect.width <= 0 || imageRect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: draftPosition,
      imageRect,
      moved: false
    };
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= 3) drag.moved = true;
    setDraftPosition(positionForPointer(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextPosition = positionForPointer(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
    if (!drag.moved) return;
    suppressClickRef.current = true;
    setDraftPosition(nextPosition);
    onMoveComment?.(comment.id, nextPosition);
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLButtonElement>): void {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setDraftPosition(position);
  }

  function handleMarkerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const direction = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.05 : 0.01;
    const nextPosition = {
      x: Math.min(1, Math.max(0, draftPosition.x + direction.x * step)),
      y: Math.min(1, Math.max(0, draftPosition.y + direction.y * step))
    };
    setDraftPosition(nextPosition);
    onMoveComment?.(comment.id, nextPosition);
  }

  return (
    <div
      className="comment-marker nodrag nowheel group/comment absolute z-20"
      data-align={draftPosition.x < 0.28 ? "start" : draftPosition.x > 0.72 ? "end" : "center"}
      data-dragging={dragging ? "true" : undefined}
      style={{ left: `${draftPosition.x * 100}%`, top: `${draftPosition.y * 100}%` }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="comment-marker__trigger"
        aria-label={`评论 ${number}：${comment.text}。可拖动或使用方向键调整位置`}
        aria-describedby={previewId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleMarkerKeyDown}
        onClick={() => { if (!suppressClickRef.current) onOpenComments?.(); }}
      >
        <CommentBubbleCanvas number={number} />
      </button>
      <div id={previewId} className="comment-marker__preview">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <MessageSquareText aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">评论 {number}</span><span aria-hidden>·</span>
            <time className="truncate tabular-nums">{new Date(comment.createdAt).toLocaleString()}</time>
          </div>
          {onDeleteComment ? (
            <button
              type="button"
              className="comment-marker__delete"
              aria-label={`删除评论 ${number}`}
              title="删除评论"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onDeleteComment(comment.id); }}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-popover-foreground">{comment.text}</p>
      </div>
    </div>
  );
}

function CommentBubbleCanvas({ number }: { number: number }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 32;
    const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(size * pixelRatio);
    canvas.height = Math.round(size * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(pixelRatio, pixelRatio);
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.moveTo(10, 2); context.lineTo(22, 2); context.quadraticCurveTo(30, 2, 30, 10);
    context.lineTo(30, 17); context.quadraticCurveTo(30, 25, 22, 25); context.lineTo(15, 25);
    context.lineTo(8, 30); context.lineTo(9.2, 24); context.quadraticCurveTo(2, 22.5, 2, 15);
    context.lineTo(2, 10); context.quadraticCurveTo(2, 2, 10, 2); context.closePath();
    context.fillStyle = "#111111";
    context.shadowColor = "rgba(0, 0, 0, 0.3)"; context.shadowBlur = 4; context.shadowOffsetY = 2;
    context.fill(); context.shadowColor = "transparent"; context.lineWidth = 2.25;
    context.lineJoin = "round"; context.strokeStyle = "rgba(255, 255, 255, 0.98)"; context.stroke(); context.restore();
    context.fillStyle = "#ffffff";
    context.font = "700 12px ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif";
    context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(number), 16, 13.5);
  }, [number]);
  return <canvas ref={canvasRef} className="comment-marker__icon" aria-hidden />;
}
