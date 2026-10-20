import type {
  AiAssistantResizeCorner
} from "@/components/assistant/AiAssistant";
import {
  ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH,
  readAssistantDockLayout,
  resolveAssistantDockMagnet,
  resolveAssistantDockWidth,
  writeAssistantDockLayout,
  type AssistantDockLayout,
  type AssistantDockSide
} from "@/lib/assistant-panel-docking";
import { readAssistantPanelSize, writeAssistantPanelSize, type AssistantPanelSize } from "@/lib/assistant-panel-size";
import { startPointerDragSession, type PointerDragSession } from "@/lib/pointer-drag-session";
import type {
  AssistantSurface
} from "@shared/types";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
export const ASSISTANT_VIEWPORT_MARGIN = 12;
const ASSISTANT_MIN_WIDTH = 300;
const ASSISTANT_MIN_HEIGHT = 360;

interface AssistantDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: { x: number; y: number };
  startRect: DOMRect;
  dockCandidate: AssistantDockSide | null;
  originDockSide: AssistantDockSide | null;
  detached: boolean;
  position?: { left: number; top: number; bottom: number };
  translation?: { x: number; y: number };
  detachMetrics?: {
    width: number;
    height: number;
    grabX: number;
    grabY: number;
  };
}

interface AssistantResizeState {
  pointerId: number;
  corner: AiAssistantResizeCorner;
  startX: number;
  startY: number;
  startOffset: { x: number; y: number };
  startRect: DOMRect;
  currentSize: AssistantPanelSize;
}

interface AssistantDockResizeState {
  pointerId: number;
  side: AssistantDockSide;
  startX: number;
  startWidth: number;
  currentWidth: number;
}

interface AssistantPanelLayoutOptions {
  boardId: string;
  assistantSurface: AssistantSurface;
  assistantOpen: boolean;
  assistantAvailable: boolean;
  rightRailOpen: boolean;
  setAssistantOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onAssistantDockLayoutChange?: (layout: AssistantDockLayout | null) => Promise<AssistantDockLayout | null>;
}
export function useAssistantPanelLayout({ boardId, assistantSurface, assistantOpen, assistantAvailable, rightRailOpen, setAssistantOpen, onAssistantDockLayoutChange }: AssistantPanelLayoutOptions) {

  const [assistantOffset, setAssistantOffset] = useState({ x: 0, y: 0 });

  const [fusionAnchor, setFusionAnchor] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => { setFusionAnchor(null); }, [boardId]);

  const [assistantDockPreference, setAssistantDockPreference] =
    useState<AssistantDockLayout | null>(readAssistantDockLayout);

  const [assistantDockSide, setAssistantDockSide] = useState<AssistantDockSide | null>(null);

  const [assistantDockCollapsed, setAssistantDockCollapsed] = useState(false);

  const [assistantDockPreview, setAssistantDockPreview] = useState<{
    side: AssistantDockSide;
    strength: number;
    centerY: number;
  } | null>(null);

  const [assistantDragging, setAssistantDragging] = useState(false);

  const [assistantSize, setAssistantSize] = useState<AssistantPanelSize | null>(readAssistantPanelSize);

  const [assistantDockWidthOverride, setAssistantDockWidthOverride] = useState<number | null>(null);

  const assistantPanelRef = useRef<HTMLDivElement>(null);

  const assistantExpandButtonRef = useRef<HTMLButtonElement>(null);

  const assistantDragRef = useRef<AssistantDragState | null>(null);

  const assistantDragSessionRef = useRef<PointerDragSession | null>(null);

  const assistantDragSequenceRef = useRef(0);

  useLayoutEffect(() => {
    if (!assistantDragging) assistantPanelRef.current?.style.removeProperty("translate");
  }, [assistantDragging, assistantDockSide, fusionAnchor, assistantOffset]);

  const assistantResizeRef = useRef<AssistantResizeState | null>(null);

  const assistantDockResizeRef = useRef<AssistantDockResizeState | null>(null);

  const onAssistantDockLayoutChangeRef = useRef(onAssistantDockLayoutChange);

  onAssistantDockLayoutChangeRef.current = onAssistantDockLayoutChange;

  useEffect(() => {
    return () => {
      void onAssistantDockLayoutChangeRef.current?.(null);
    };
  }, []);

  // The fusion composer is the only generation UI, even with the assistant disabled.
  useEffect(() => {
    const panel = assistantPanelRef.current;
    // Reset on board/surface changes, and release native listeners on unmount.
    setAssistantDragging(false);
    setAssistantDockPreview(null);
    setAssistantDockWidthOverride(null);
    assistantResizeRef.current = null;
    assistantDockResizeRef.current = null;
    return () => {
      assistantDragSequenceRef.current += 1;
      assistantDragSessionRef.current?.dispose();
      assistantDragSessionRef.current = null;
      assistantDragRef.current = null;
      panel?.style.removeProperty("translate");
    };
  }, [boardId, assistantSurface]);

  useEffect(() => {
    if (!assistantOpen) return;

    function clampToViewport(): void {
      const panel = assistantPanelRef.current;
      // 历史记录打开时 Dock 隐藏，不使用零尺寸边界重置助手位置。
      if (!panel || panel.getClientRects().length === 0) return;
      if (assistantDockSide) {
        if (
          window.innerWidth < ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH
          || (assistantDockSide === "right" && rightRailOpen)
        ) {
          setAssistantDockSide(null);
          setAssistantDockPreview(null);
          setAssistantOffset({ x: 0, y: 0 });
          void onAssistantDockLayoutChange?.(null);
        }
        return;
      }
      const rect = panel.getBoundingClientRect();
      const margin = ASSISTANT_VIEWPORT_MARGIN;
      const availableWidth = Math.max(1, window.innerWidth - margin * 2);
      const availableHeight = Math.max(1, window.innerHeight - margin * 2);
      if (
        assistantSize &&
        (rect.width > availableWidth + 0.5 || rect.height > availableHeight + 0.5)
      ) {
        setAssistantSize({
          width: Math.min(rect.width, availableWidth),
          height: Math.min(rect.height, availableHeight)
        });
        return;
      }
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      const targetLeft = Math.min(maxLeft, Math.max(margin, rect.left));
      const targetTop = Math.min(maxTop, Math.max(margin, rect.top));
      const deltaX = targetLeft - rect.left;
      const deltaY = targetTop - rect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      setAssistantOffset({ x: targetLeft, y: targetTop });
    }

    const frame = window.requestAnimationFrame(clampToViewport);
    window.addEventListener("resize", clampToViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", clampToViewport);
    };
  }, [
    assistantDockSide,
    assistantOpen,
    assistantSize,
    rightRailOpen,
    onAssistantDockLayoutChange
  ]);

  useEffect(() => {
    if (assistantDockSide || !assistantDockCollapsed) return;
    setAssistantDockCollapsed(false);
  }, [assistantDockCollapsed, assistantDockSide]);

  useEffect(() => {
    if (assistantDockSide && !assistantOpen) setAssistantOpen(true);
  }, [assistantDockSide, assistantOpen, setAssistantOpen]);

  const restoreAssistantDockPreference = useCallback((): void => {
    if (
      !assistantDockPreference
      || window.innerWidth < ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH
      || (assistantDockPreference.side === "right" && rightRailOpen)
    ) {
      setAssistantDockSide(null);
      void onAssistantDockLayoutChange?.(null);
      return;
    }
    const layout = {
      side: assistantDockPreference.side,
      width: resolveAssistantDockWidth(assistantDockPreference.width, window.innerWidth)
    } satisfies AssistantDockLayout;
    setAssistantDockSide(layout.side);
    void onAssistantDockLayoutChange?.(layout);
  }, [assistantDockPreference, rightRailOpen, onAssistantDockLayoutChange]);

  useEffect(() => {
    if (assistantAvailable) restoreAssistantDockPreference();
    else {
      setAssistantDockSide(null);
      setAssistantDockCollapsed(false);
      void onAssistantDockLayoutChange?.(null);
    }
  }, [assistantAvailable, restoreAssistantDockPreference, onAssistantDockLayoutChange]);

  function startAssistantDrag(event: React.PointerEvent<HTMLElement>): void {
    if (event.button !== 0 || event.isPrimary === false || assistantDragRef.current ||
      (event.target as HTMLElement).closest("button, input, textarea, select, a, [role='button'], [contenteditable='true']")) return;
    const panel = assistantPanelRef.current;
    if (!panel) return;
    // Measure the settled panel, not an intermediate open/close animation.
    for (const animation of panel.getAnimations?.() ?? []) {
      if (animation.effect instanceof KeyframeEffect &&
        animation.effect.getKeyframes().some((frame) => "height" in frame)) animation.cancel();
    }
    event.preventDefault();
    event.stopPropagation();
    assistantDragSequenceRef.current += 1;
    setAssistantDragging(true);

    if (assistantDockSide) {
      const margin = ASSISTANT_VIEWPORT_MARGIN;
      const width = Math.min(
        Number.parseFloat(getComputedStyle(panel).getPropertyValue("--assistant-width")) || 560,
        Math.max(1, window.innerWidth - margin * 2)
      );
      const composerHeight = panel.querySelector(".prompt-fusion-composer")?.getBoundingClientRect().height ?? 128;
      const collapsedHeight = panel.getAttribute("data-fusion-mode") === "generate"
        ? composerHeight
        : composerHeight + (panel.querySelector(".prompt-fusion-collapsed")?.getBoundingClientRect().height ?? 0);

      const defaultHeight = assistantOpen ? Math.min(640, window.innerHeight * 0.72) : collapsedHeight;
      const height = Math.min(
        defaultHeight,
        Math.max(1, window.innerHeight - margin * 2)
      );
      const dockedRect = panel.getBoundingClientRect();
      const grabX = Math.min(width - 24, Math.max(24, event.clientX - dockedRect.left));
      const grabY = Math.min(43, Math.max(0, event.clientY - dockedRect.top));

      assistantDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: assistantOffset,
        startRect: dockedRect,
        dockCandidate: assistantDockSide,
        originDockSide: assistantDockSide,
        detached: false,
        detachMetrics: {
          width,
          height,
          grabX,
          grabY
        }
      };
    } else {
      setAssistantDockPreview(null);
      const rect = panel.getBoundingClientRect();
      assistantDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: { x: rect.left, y: rect.top },
        startRect: rect,
        dockCandidate: null,
        originDockSide: null,
        detached: true
      };
    }
    assistantDragSessionRef.current = startPointerDragSession({
      target: panel,
      pointerId: event.pointerId,
      onMove: moveAssistant,
      onEnd: endAssistantDrag,
      onCancel: cancelAssistantDrag
    });
  }

  function moveAssistant(event: PointerEvent): void {
    const drag = assistantDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const margin = ASSISTANT_VIEWPORT_MARGIN;
    let deltaX = event.clientX - drag.startX;
    let deltaY = event.clientY - drag.startY;

    if (!drag.detached && drag.detachMetrics) {
      if (Math.hypot(deltaX, deltaY) < 10) return;
      const {
        width,
        height,
        grabX,
        grabY
      } = drag.detachMetrics;
      const targetLeft = Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, event.clientX - grabX)
      );
      const targetTop = Math.min(
        window.innerHeight - height - margin,
        Math.max(margin, event.clientY - grabY)
      );
      const detachedOffset = {
        x: targetLeft,
        y: targetTop
      };
      drag.detached = true;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.startOffset = detachedOffset;
      drag.startRect = new DOMRect(targetLeft, targetTop, width, height);
      setAssistantDockSide(null);
      void onAssistantDockLayoutChange?.(null);
      setAssistantOffset(detachedOffset);
      setFusionAnchor({ left: targetLeft, bottom: window.innerHeight - targetTop - height });
      drag.position = { left: targetLeft, top: targetTop, bottom: window.innerHeight - targetTop - height };
      drag.dockCandidate = null;
      setAssistantDockPreview(null);
      // React changes the base layout once on detachment. Start compositor
      // translation on the next frame, after that layout has committed.
      return;
    }

    const rawLeft = drag.startRect.left + deltaX;
    const magnet = resolveAssistantDockMagnet({
      panelLeft: rawLeft,
      panelWidth: drag.startRect.width,
      viewportWidth: window.innerWidth,
      rightAvailable: !rightRailOpen
    });
    const targetLeft = magnet
      ? Math.min(
        window.innerWidth - drag.startRect.width,
        Math.max(0, magnet.left)
      )
      : Math.min(
        window.innerWidth - drag.startRect.width - margin,
        Math.max(margin, rawLeft)
      );
    const targetTop = Math.min(
      window.innerHeight - drag.startRect.height - margin,
      Math.max(margin, drag.startRect.top + deltaY)
    );
    drag.dockCandidate = magnet?.side ?? null;
    const preview = magnet ? {
      side: magnet.side,
      strength: magnet.strength,
      centerY: targetTop + drag.startRect.height / 2
    } : null;
    setAssistantDockPreview((current) => {
      if (!current && !preview) return current;
      if (current && preview && current.side === preview.side &&
        Math.abs(current.strength - preview.strength) < 0.04 &&
        Math.abs(current.centerY - preview.centerY) < 4) return current;
      return preview;
    });
    drag.position = { left: targetLeft, top: targetTop, bottom: window.innerHeight - targetTop - drag.startRect.height };
    const panel = assistantPanelRef.current;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const x = (drag.translation?.x ?? 0) + targetLeft - rect.left;
      const y = (drag.translation?.y ?? 0) + targetTop - rect.top;
      drag.translation = { x, y };
      // Keep high-frequency coordinates out of React; commit once on release.
      panel.style.translate = `${x}px ${y}px`;
    }
  }

  function endAssistantDrag(): void {
    const drag = assistantDragRef.current;
    if (!drag) return;
    assistantDragRef.current = null;
    assistantDragSessionRef.current = null;
    if (drag.position) {
      setFusionAnchor({ left: drag.position.left, bottom: drag.position.bottom });
      setAssistantOffset({ x: drag.position.left, y: drag.position.top });
    }
    setAssistantDragging(false);
    setAssistantDockPreview(null);
    if (drag.originDockSide && !drag.detached) {
      return;
    }
    if (drag.dockCandidate) {
      const requestedLayout = {
        side: drag.dockCandidate,
        width: resolveAssistantDockWidth(assistantSize?.width, window.innerWidth)
      } satisfies AssistantDockLayout;
      setAssistantDockPreference(requestedLayout);
      writeAssistantDockLayout(requestedLayout);
      setAssistantDockSide(requestedLayout.side);
      setAssistantOffset({ x: 0, y: 0 });
      const sequence = assistantDragSequenceRef.current;
      void onAssistantDockLayoutChange?.(requestedLayout).then((resolvedLayout) => {
        if (sequence !== assistantDragSequenceRef.current) return;
        if (resolvedLayout?.side === requestedLayout.side) return;
        setAssistantDockSide(resolvedLayout?.side ?? null);
        if (!resolvedLayout) setAssistantOffset({ x: 0, y: 0 });
      });
    } else if (drag.originDockSide) {
      setAssistantDockPreference(null);
      writeAssistantDockLayout(null);
      void onAssistantDockLayoutChange?.(null);
    }
  }

  function cancelAssistantDrag(): void {
    const drag = assistantDragRef.current;
    if (!drag) return;
    assistantDragRef.current = null;
    assistantDragSessionRef.current = null;
    if (!drag.originDockSide && drag.position) {
      setFusionAnchor({ left: drag.position.left, bottom: drag.position.bottom });
      setAssistantOffset({ x: drag.position.left, y: drag.position.top });
    }
    setAssistantDragging(false);
    setAssistantDockPreview(null);
    if (drag.originDockSide && drag.detached) {
      setAssistantDockSide(drag.originDockSide);
      setAssistantOffset({ x: 0, y: 0 });
      void onAssistantDockLayoutChange?.({
        side: drag.originDockSide,
        width: resolveAssistantDockWidth(assistantSize?.width, window.innerWidth)
      });
    }
  }

  function startAssistantResize(
    corner: AiAssistantResizeCorner,
    event: React.PointerEvent<HTMLButtonElement>
  ): void {
    if (assistantDockSide) return;
    const panel = assistantPanelRef.current;
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startRect = panel.getBoundingClientRect();
    assistantResizeRef.current = {
      pointerId: event.pointerId,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: assistantOffset,
      startRect,
      currentSize: { width: startRect.width, height: startRect.height }
    };
  }

  function startAssistantDockResize(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!assistantDockSide || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    assistantDockResizeRef.current = {
      pointerId: event.pointerId,
      side: assistantDockSide,
      startX: event.clientX,
      startWidth: assistantDockWidth,
      currentWidth: assistantDockWidth
    };
  }

  function resizeAssistantDock(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantDockResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const direction = resize.side === "left" ? 1 : -1;
    resize.currentWidth = resolveAssistantDockWidth(
      resize.startWidth + (event.clientX - resize.startX) * direction,
      window.innerWidth
    );
    setAssistantDockWidthOverride(resize.currentWidth);
  }

  function endAssistantDockResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantDockResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    assistantDockResizeRef.current = null;
    setAssistantDockWidthOverride(null);
    const layout = {
      side: resize.side,
      width: resize.currentWidth
    } satisfies AssistantDockLayout;
    setAssistantDockPreference(layout);
    writeAssistantDockLayout(layout);
    void onAssistantDockLayoutChange?.(layout);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelAssistantDockResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantDockResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    assistantDockResizeRef.current = null;
    setAssistantDockWidthOverride(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleAssistantDockResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (!assistantDockSide) return;
    const step = event.shiftKey ? 48 : 16;
    const direction = assistantDockSide === "left" ? 1 : -1;
    const delta = event.key === "ArrowRight" ? step * direction : event.key === "ArrowLeft" ? -step * direction : 0;
    if (!delta) return;
    event.preventDefault();
    const layout = {
      side: assistantDockSide,
      width: resolveAssistantDockWidth(assistantDockWidth + delta, window.innerWidth)
    } satisfies AssistantDockLayout;
    setAssistantDockPreference(layout);
    writeAssistantDockLayout(layout);
    void onAssistantDockLayoutChange?.(layout);
  }

  function resizeAssistant(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const margin = ASSISTANT_VIEWPORT_MARGIN;
    const availableWidth = Math.max(1, window.innerWidth - margin * 2);
    const availableHeight = Math.max(1, window.innerHeight - margin * 2);
    const minWidth = Math.min(ASSISTANT_MIN_WIDTH, availableWidth);
    const minHeight = Math.min(ASSISTANT_MIN_HEIGHT, availableHeight);
    const deltaX = event.clientX - resize.startX;
    const deltaY = event.clientY - resize.startY;
    let left = resize.startRect.left;
    let top = resize.startRect.top;
    let right = resize.startRect.right;
    let bottom = resize.startRect.bottom;

    if (resize.corner.includes("w")) {
      left = Math.min(right - minWidth, Math.max(margin, resize.startRect.left + deltaX));
    } else {
      right = Math.max(
        resize.startRect.left + minWidth,
        Math.min(window.innerWidth - margin, resize.startRect.right + deltaX)
      );
    }
    if (resize.corner.includes("n")) {
      top = Math.min(bottom - minHeight, Math.max(margin, resize.startRect.top + deltaY));
    } else {
      bottom = Math.max(
        resize.startRect.top + minHeight,
        Math.min(window.innerHeight - margin, resize.startRect.bottom + deltaY)
      );
    }

    const nextSize = { width: right - left, height: bottom - top };
    resize.currentSize = nextSize;
    setAssistantSize(nextSize);
    setFusionAnchor({ left, bottom: window.innerHeight - bottom });
  }

  function endAssistantResize(event: React.PointerEvent<HTMLButtonElement>): void {
    const resize = assistantResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    assistantResizeRef.current = null;
    if (
      Math.abs(resize.currentSize.width - resize.startRect.width) >= 0.5 ||
      Math.abs(resize.currentSize.height - resize.startRect.height) >= 0.5
    ) {
      writeAssistantPanelSize(resize.currentSize);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const assistantDockWidth = resolveAssistantDockWidth(
    assistantDockWidthOverride ?? assistantDockPreference?.width ?? assistantSize?.width,
    typeof window === "undefined" ? 1440 : window.innerWidth
  );

  function collapseDockedAssistant(event?: React.MouseEvent<HTMLButtonElement>): void {
    if (!assistantDockSide) return;
    if (event && event.detail !== 0) event.currentTarget.blur();
    setAssistantDockCollapsed(true);
    void onAssistantDockLayoutChange?.(null);
    if (!event || event.detail === 0) {
      window.requestAnimationFrame(() => assistantExpandButtonRef.current?.focus());
    }
  }

  function expandDockedAssistant(): void {
    if (!assistantDockSide) return;
    const layout = {
      side: assistantDockSide,
      width: assistantDockWidth
    } satisfies AssistantDockLayout;
    setAssistantDockCollapsed(false);
    void onAssistantDockLayoutChange?.(layout);
  }
  return {
    setAssistantOffset,
    fusionAnchor,
    assistantDockSide,
    setAssistantDockSide,
    assistantDockCollapsed,
    setAssistantDockCollapsed,
    assistantDockPreview,
    assistantDragging,
    assistantSize,
    assistantPanelRef,
    assistantExpandButtonRef,
    restoreAssistantDockPreference,
    startAssistantDrag,
    startAssistantResize,
    startAssistantDockResize,
    resizeAssistantDock,
    endAssistantDockResize,
    cancelAssistantDockResize,
    handleAssistantDockResizeKeyDown,
    resizeAssistant,
    endAssistantResize,
    assistantDockWidth,
    collapseDockedAssistant,
    expandDockedAssistant
  };
}
