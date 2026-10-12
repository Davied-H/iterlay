import { useCallback, useEffect, useRef, type PointerEventHandler } from "react";
import type { Node } from "@xyflow/react";
import {
  CANVAS_CLIPBOARD_TYPE,
  extractClipboardImageFiles,
  extractCanvasClipboardItems,
  placeClipboardItemsAtPoint,
  serializeCanvasClipboardItems,
  type CanvasClipboardItem
} from "./canvas-clipboard";
import type { CanvasDropPoint } from "./canvas-drop";
import type { GeneratedImage } from "./image-node-model";
import { nodeRenderedWidth } from "./canvas-node-layout";

export interface CanvasClipboardDropPayload {
  files: File[];
  imageUrls: string[];
  position?: CanvasDropPoint;
}

interface CanvasClipboardControllerOptions {
  enabled: boolean;
  getNodes: () => readonly Node[];
  getCanvasBounds: () => DOMRect | null;
  screenToFlowPosition: (point: CanvasDropPoint) => CanvasDropPoint;
  recordCanvasChange: () => void;
  onPasteImages: (items: CanvasClipboardItem[]) => void;
  onDropImages: (payload: CanvasClipboardDropPayload) => void;
  createText?: (position: CanvasDropPoint, text: string) => void;
  notifyCopied: (count: number, shortcut: string) => void;
  notify: (message: string) => void;
}

export interface CanvasClipboardRootHandlers {
  onPointerEnter: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
}

export interface CanvasClipboardController {
  pasteShortcut: string;
  pasteFromSystemClipboard: () => Promise<void>;
  rootHandlers: CanvasClipboardRootHandlers;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element
    && (
      element.tagName === "INPUT"
      || element.tagName === "TEXTAREA"
      || element.tagName === "SELECT"
      || element.isContentEditable
    )
  );
}

function nodeImage(node: Node): GeneratedImage | null {
  if (node.type !== "imageNode") return null;
  return (node.data as { image?: GeneratedImage }).image ?? null;
}

export function canvasPasteShortcutLabel(
  platform = typeof navigator === "undefined" ? "" : navigator.platform
): string {
  return /Mac|iPhone|iPad|iPod/u.test(platform) ? "⌘ V" : "Ctrl+V";
}

function copiedCanvasItems(nodes: readonly Node[]): CanvasClipboardItem[] {
  return nodes.flatMap((node) => {
    const image = node.selected ? nodeImage(node) : null;
    if (!image || image.pending) return [];
    return [{
      image,
      position: { ...node.position },
      width: nodeRenderedWidth(node)
    }];
  });
}

export function useCanvasClipboardController(
  options: CanvasClipboardControllerOptions
): CanvasClipboardController {
  const optionsRef = useRef(options);
  const pointerClientPositionRef = useRef<CanvasDropPoint | null>(null);
  optionsRef.current = options;

  const resolveClientPoint = useCallback((): CanvasDropPoint | null => {
    if (pointerClientPositionRef.current) return pointerClientPositionRef.current;
    const bounds = optionsRef.current.getCanvasBounds();
    return bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : null;
  }, []);

  useEffect(() => {
    function handleCopyEvent(event: ClipboardEvent): void {
      const current = optionsRef.current;
      if (!current.enabled || isEditableTarget(event.target) || !event.clipboardData) return;
      const items = copiedCanvasItems(current.getNodes());
      if (items.length === 0) return;

      event.clipboardData.setData(CANVAS_CLIPBOARD_TYPE, serializeCanvasClipboardItems(items));
      event.preventDefault();
      current.notifyCopied(items.length, canvasPasteShortcutLabel());
    }

    function handlePasteEvent(event: ClipboardEvent): void {
      const current = optionsRef.current;
      if (!current.enabled || isEditableTarget(event.target) || !event.clipboardData) return;
      const copiedItems = extractCanvasClipboardItems(event.clipboardData);
      if (copiedItems) {
        const clientPoint = resolveClientPoint();
        if (!clientPoint) return;
        event.preventDefault();
        current.recordCanvasChange();
        current.onPasteImages(placeClipboardItemsAtPoint(
          copiedItems,
          current.screenToFlowPosition(clientPoint)
        ));
        return;
      }

      const files = extractClipboardImageFiles(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        current.recordCanvasChange();
        current.onDropImages({
          files,
          imageUrls: [],
          position: pointerClientPositionRef.current
            ? current.screenToFlowPosition(pointerClientPositionRef.current)
            : undefined
        });
        return;
      }

      const text = event.clipboardData.getData("text/plain").trim();
      if (!text || !current.createText) return;
      const clientPoint = resolveClientPoint();
      if (!clientPoint) return;
      event.preventDefault();
      current.recordCanvasChange();
      current.createText(current.screenToFlowPosition(clientPoint), text);
    }

    document.addEventListener("copy", handleCopyEvent);
    document.addEventListener("paste", handlePasteEvent);
    return () => {
      document.removeEventListener("copy", handleCopyEvent);
      document.removeEventListener("paste", handlePasteEvent);
    };
  }, [resolveClientPoint]);

  const updatePointerPosition = useCallback<PointerEventHandler<HTMLDivElement>>((event) => {
    pointerClientPositionRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const clearPointerPosition = useCallback((): void => {
    pointerClientPositionRef.current = null;
  }, []);

  const pasteFromSystemClipboard = useCallback(async (): Promise<void> => {
    if (!navigator.clipboard?.read) {
      optionsRef.current.notify(`请按 ${canvasPasteShortcutLabel()} 粘贴图片`);
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const extension = imageType.split("/")[1]?.replace("jpeg", "jpg") || "png";
        files.push(new File([blob], `clipboard-${files.length + 1}.${extension}`, { type: imageType }));
      }
      if (files.length === 0) {
        optionsRef.current.notify("剪贴板中没有可用的图片");
        return;
      }
      const current = optionsRef.current;
      current.recordCanvasChange();
      current.onDropImages({ files, imageUrls: [] });
    } catch {
      optionsRef.current.notify(`无法直接读取剪贴板，请按 ${canvasPasteShortcutLabel()} 粘贴图片`);
    }
  }, []);

  return {
    pasteShortcut: canvasPasteShortcutLabel(),
    pasteFromSystemClipboard,
    rootHandlers: {
      onPointerEnter: updatePointerPosition,
      onPointerMove: updatePointerPosition,
      onPointerLeave: clearPointerPosition
    }
  };
}
