import { useCallback, useEffect, useRef, useState, type DragEventHandler } from "react";
import type { Viewport } from "@xyflow/react";
import { extractDroppedImageUrls, isDragLeavingDropZone, type CanvasDropPoint } from "./canvas-drop";
import { IMAGE_NODE_WIDTH } from "./image-node-model";
import { createLatestFrameTask, type LatestFrameTask } from "./latest-frame-task";

const DROP_PREVIEW_MIN_WIDTH = 120;
const DROP_PREVIEW_MAX_WIDTH = 360;
const SUPPORTED_DROP_TYPES = new Set([
  "Files",
  "text/html",
  "text/uri-list",
  "text/plain",
  "text/x-moz-url"
]);

export interface CanvasDropPayload {
  files: File[];
  imageUrls: string[];
  position: CanvasDropPoint;
}

export interface CanvasDropPreview {
  x: number;
  y: number;
  width: number;
  kind: "file" | "link";
}

interface CanvasDropControllerOptions {
  getViewport: () => Viewport;
  screenToFlowPosition: (point: CanvasDropPoint) => CanvasDropPoint;
  recordCanvasChange: () => void;
  onDropImages: (payload: CanvasDropPayload) => void;
}

export interface CanvasDropRootHandlers {
  onDragEnter: DragEventHandler<HTMLDivElement>;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
}

export interface CanvasDropController {
  preview: CanvasDropPreview | null;
  rootHandlers: CanvasDropRootHandlers;
}

function hasSupportedDropData(types: readonly string[]): boolean {
  return types.some((type) => SUPPORTED_DROP_TYPES.has(type));
}

export function useCanvasDropController({
  getViewport,
  screenToFlowPosition,
  recordCanvasChange,
  onDropImages
}: CanvasDropControllerOptions): CanvasDropController {
  const [preview, setPreview] = useState<CanvasDropPreview | null>(null);
  const previewFrameTaskRef = useRef<LatestFrameTask<CanvasDropPreview> | null>(null);

  const clearPreview = useCallback((): void => {
    previewFrameTaskRef.current?.cancel();
    setPreview(null);
  }, []);

  useEffect(() => {
    window.addEventListener("drop", clearPreview, true);
    window.addEventListener("dragend", clearPreview, true);
    window.addEventListener("blur", clearPreview);
    return () => {
      window.removeEventListener("drop", clearPreview, true);
      window.removeEventListener("dragend", clearPreview, true);
      window.removeEventListener("blur", clearPreview);
      previewFrameTaskRef.current?.cancel();
    };
  }, [clearPreview]);

  const queuePreview = useCallback((event: Parameters<DragEventHandler<HTMLDivElement>>[0]): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const zoom = getViewport().zoom;
    const nextPreview = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      width: Math.min(
        DROP_PREVIEW_MAX_WIDTH,
        Math.max(DROP_PREVIEW_MIN_WIDTH, IMAGE_NODE_WIDTH * zoom)
      ),
      kind: Array.from(event.dataTransfer.types).includes("Files") ? "file" : "link"
    } satisfies CanvasDropPreview;
    if (!previewFrameTaskRef.current) {
      previewFrameTaskRef.current = createLatestFrameTask(setPreview);
    }
    previewFrameTaskRef.current.schedule(nextPreview);
  }, [getViewport]);

  const handleDragEnter = useCallback<DragEventHandler<HTMLDivElement>>((event) => {
    if (!hasSupportedDropData(Array.from(event.dataTransfer.types))) return;
    event.preventDefault();
    queuePreview(event);
  }, [queuePreview]);

  const handleDragOver = useCallback<DragEventHandler<HTMLDivElement>>((event) => {
    if (!hasSupportedDropData(Array.from(event.dataTransfer.types))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    queuePreview(event);
  }, [queuePreview]);

  const handleDragLeave = useCallback<DragEventHandler<HTMLDivElement>>((event) => {
    if (!isDragLeavingDropZone(event.currentTarget, event.relatedTarget)) return;
    clearPreview();
  }, [clearPreview]);

  const handleDrop = useCallback<DragEventHandler<HTMLDivElement>>((event) => {
    if (!hasSupportedDropData(Array.from(event.dataTransfer.types))) return;
    event.preventDefault();
    clearPreview();
    recordCanvasChange();
    onDropImages({
      files: Array.from(event.dataTransfer.files),
      imageUrls: extractDroppedImageUrls(event.dataTransfer),
      position: screenToFlowPosition({ x: event.clientX, y: event.clientY })
    });
  }, [clearPreview, onDropImages, recordCanvasChange, screenToFlowPosition]);

  return {
    preview,
    rootHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop
    }
  };
}
