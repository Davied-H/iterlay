import { useUiText } from "@/i18n";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  MessageSquareText,
  Send,
  Trash2,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FeedbackDetail, FeedbackHistoryItem, FeedbackKind, FeedbackStatus } from "../../../shared/feedback";

const POSITION_KEY = "iterlay:feedback-widget-position:v1";
const DRAFT_KEY = "iterlay:feedback-draft:v1";
const HISTORY_KEY = "iterlay:feedback-history:v1";
const NUDGE_KEY = "iterlay:feedback-incentive-nudge:v1";
const WIDGET_HITBOX_WIDTH = 48;
const WIDGET_HITBOX_HEIGHT = 56;
const VIEWPORT_MARGIN = 16;
const EDGE_SNAP_DISTANCE = 72;
const DOCK_IDLE_DELAY_MS = 3_000;
const HOVER_GUIDE_DELAY_MS = 220;
const HOVER_GUIDE_CLOSE_DELAY_MS = 120;
const NUDGE_IDLE_DELAY_MS = 60_000;
const NUDGE_DURATION_MS = 12_000;
const NUDGE_COOLDOWN_MS = 10 * 60 * 1_000;

interface WidgetPosition {
  x: number;
  y: number;
}

type DockSide = "left" | "right";

interface FeedbackDraft {
  content: string;
  kind: FeedbackKind;
}

interface FeedbackNudgeMemory {
  shownAt: number;
  nextVariant: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  origin: WidgetPosition;
  moved: boolean;
}

type FeedbackView = "form" | "success" | "history" | "detail";

const kindOptions: Array<{ value: FeedbackKind; label: string }> = [
  { value: "experience", label: "体验问题" },
  { value: "feature", label: "新功能" },
  { value: "other", label: "其他" }
];

const kindPlaceholders: Record<FeedbackKind, string> = {
  experience: "描述你遇到的问题，以及你期待的结果",
  feature: "描述你希望增加的功能，以及它能解决什么问题",
  other: "告诉我们你的想法，或哪里需要改进"
};

const kindLabels: Record<FeedbackKind, string> = {
  experience: "体验问题",
  feature: "新功能",
  other: "其他"
};

const statusLabels: Record<FeedbackStatus, string> = {
  pending: "等待处理",
  evaluating: "正在评估",
  needs_human: "等待人工处理",
  rejected: "暂不采纳",
  accepted: "已采纳",
  implementing: "正在实现",
  pr_open: "已提交合并申请",
  failed: "处理异常",
  released: "已上线",
  voided: "已废除"
};

const feedbackNudges = [
  { title: "哪一步不顺手？", description: "说出来，优质反馈被采纳可获 Credit。", action: "说说问题" },
  { title: "一个好点子，值得被看见", description: "告诉我们你想怎样创作，优质建议可获 Credit。", action: "提交点子" },
  { title: "帮 Iterlay 再好用一点", description: "你的工作流建议，可能变成下一次更新。", action: "参与共创" },
  { title: "我们正在收集真实创作体验", description: "遇到卡点或有新想法？优质反馈可获 Credit。", action: "留下建议" }
] as const;

function readHistory(): FeedbackHistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isHistoryItem).slice(0, 100);
  } catch {
    return [];
  }
}

function isHistoryItem(value: unknown): value is FeedbackHistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FeedbackHistoryItem>;
  return typeof item.id === "string" && typeof item.content === "string" && typeof item.createdAt === "string" &&
    (item.kind === "experience" || item.kind === "feature" || item.kind === "other") && typeof item.status === "string";
}

function isFeedbackStatus(value: string): value is FeedbackStatus {
  return value === "pending" || value === "evaluating" || value === "needs_human" || value === "rejected" ||
    value === "accepted" || value === "implementing" || value === "pr_open" || value === "failed" || value === "released" ||
    value === "voided";
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function clampPosition(position: WidgetPosition): WidgetPosition {
  return {
    x: Math.max(0, Math.min(window.innerWidth - WIDGET_HITBOX_WIDTH, position.x)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(window.innerHeight - WIDGET_HITBOX_HEIGHT - VIEWPORT_MARGIN, position.y))
  };
}

function defaultPosition(): WidgetPosition {
  return clampPosition({
    x: window.innerWidth - WIDGET_HITBOX_WIDTH - 20,
    y: window.innerHeight - WIDGET_HITBOX_HEIGHT - 20
  });
}

function nearestDockSide(position: WidgetPosition): DockSide {
  return position.x + WIDGET_HITBOX_WIDTH / 2 < window.innerWidth / 2 ? "left" : "right";
}

function dockSideWithinRange(position: WidgetPosition): DockSide | null {
  const clamped = clampPosition(position);
  const leftDistance = clamped.x;
  const rightDistance = window.innerWidth - WIDGET_HITBOX_WIDTH - clamped.x;
  if (Math.min(leftDistance, rightDistance) > EDGE_SNAP_DISTANCE) return null;
  return leftDistance <= rightDistance ? "left" : "right";
}

function snapPositionToEdge(position: WidgetPosition, side: DockSide): WidgetPosition {
  const clamped = clampPosition(position);
  return {
    x: side === "left" ? 0 : window.innerWidth - WIDGET_HITBOX_WIDTH,
    y: clamped.y
  };
}

function normalizePosition(position: WidgetPosition): WidgetPosition {
  const clamped = clampPosition(position);
  const side = dockSideWithinRange(clamped);
  return side ? snapPositionToEdge(clamped, side) : clamped;
}

function readWidgetPosition(): WidgetPosition {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as Partial<WidgetPosition> | null;
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return normalizePosition({ x: Number(parsed.x), y: Number(parsed.y) });
    }
  } catch {
    // A malformed local preference should never block the feedback entry point.
  }
  return defaultPosition();
}

function readDraft(): FeedbackDraft {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<FeedbackDraft> | null;
    const kind = parsed?.kind === "feature" || parsed?.kind === "other" ? parsed.kind : "experience";
    return { content: typeof parsed?.content === "string" ? parsed.content.slice(0, 2_000) : "", kind };
  } catch {
    return { content: "", kind: "experience" };
  }
}

function readNudgeMemory(): FeedbackNudgeMemory | null {
  try {
    const raw = localStorage.getItem(NUDGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "number" && Number.isFinite(parsed)) return { shownAt: parsed, nextVariant: 0 };
    if (!parsed || typeof parsed !== "object") return null;
    const memory = parsed as Partial<FeedbackNudgeMemory>;
    return Number.isFinite(memory.shownAt) && Number.isFinite(memory.nextVariant)
      ? { shownAt: Number(memory.shownAt), nextVariant: Number(memory.nextVariant) }
      : null;
  } catch {
    return null;
  }
}

function canShowNudge(): boolean {
  const memory = readNudgeMemory();
  return !memory || Date.now() - memory.shownAt >= NUDGE_COOLDOWN_MS;
}

function recordNudgeShown(): number {
  const variantIndex = (readNudgeMemory()?.nextVariant ?? 0) % feedbackNudges.length;
  try {
    localStorage.setItem(NUDGE_KEY, JSON.stringify({
      shownAt: Date.now(),
      nextVariant: (variantIndex + 1) % feedbackNudges.length
    } satisfies FeedbackNudgeMemory));
  } catch {
    // Nudge rotation is best-effort; feedback remains available without local storage.
  }
  return variantIndex;
}

function isEditingText(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && Boolean(active.closest("input, textarea, select, [contenteditable='true']"));
}

export function FeedbackWidget({
  boardId,
  boardName,
  view
}: {
  boardId?: string;
  boardName?: string;
  view: string;
}): React.ReactElement {
  const uiText = useUiText();

  const initialDraft = useRef(readDraft()).current;
  const [open, setOpen] = useState(false);
  const [viewState, setViewState] = useState<FeedbackView>("form");
  const [content, setContent] = useState(initialDraft.content);
  const [kind, setKind] = useState<FeedbackKind>(initialDraft.kind);
  const [position, setPosition] = useState(readWidgetPosition);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<FeedbackHistoryItem[]>(readHistory);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDetail | FeedbackHistoryItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FeedbackHistoryItem | FeedbackDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [hoverGuideOpen, setHoverGuideOpen] = useState(false);
  const [nudgeVariant, setNudgeVariant] = useState(() => readNudgeMemory()?.nextVariant ?? 0);
  const [docked, setDocked] = useState(false);
  const drag = useRef<DragState | null>(null);
  const dockTimer = useRef<number | null>(null);
  const hoverGuideTimer = useRef<number | null>(null);
  const hoverGuideCloseTimer = useRef<number | null>(null);
  const nudgeDismissTimer = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const onResize = (): void => setPosition((current) => normalizePosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let idleTimer: number | null = null;

    const clearIdleTimer = (): void => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = null;
    };
    const showAfterIdle = (): void => {
      clearIdleTimer();
      idleTimer = window.setTimeout(() => {
        if (nudgeOpen || !canShowNudge() || document.visibilityState !== "visible" || isEditingText() || document.querySelector('[role="dialog"]')) return;
        setNudgeVariant(recordNudgeShown());
        setHoverGuideOpen(false);
        setNudgeOpen(true);
        nudgeDismissTimer.current = window.setTimeout(() => setNudgeOpen(false), NUDGE_DURATION_MS);
      }, NUDGE_IDLE_DELAY_MS);
    };
    const onActivity = (): void => showAfterIdle();
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") showAfterIdle();
      else clearIdleTimer();
    };

    const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);
    showAfterIdle();
    return () => {
      clearIdleTimer();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [nudgeOpen]);

  useEffect(() => () => {
    if (nudgeDismissTimer.current !== null) window.clearTimeout(nudgeDismissTimer.current);
    if (dockTimer.current !== null) window.clearTimeout(dockTimer.current);
    if (hoverGuideTimer.current !== null) window.clearTimeout(hoverGuideTimer.current);
    if (hoverGuideCloseTimer.current !== null) window.clearTimeout(hoverGuideCloseTimer.current);
  }, []);

  useEffect(() => {
    try {
      if (content.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, kind } satisfies FeedbackDraft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Draft persistence is best-effort; submission remains available without it.
    }
  }, [content, kind]);

  function persistPosition(next: WidgetPosition): void {
    setPosition(next);
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(next));
    } catch {
      // Position persistence is best-effort.
    }
  }

  const clearDockTimer = useCallback((): void => {
    if (dockTimer.current !== null) window.clearTimeout(dockTimer.current);
    dockTimer.current = null;
  }, []);

  const scheduleDocking = useCallback((): void => {
    clearDockTimer();
    if (open || nudgeOpen || submitting || drag.current || !dockSideWithinRange(position)) return;
    dockTimer.current = window.setTimeout(() => setDocked(true), DOCK_IDLE_DELAY_MS);
  }, [clearDockTimer, nudgeOpen, open, position, submitting]);

  const wakeWidget = useCallback((): void => {
    setDocked(false);
    scheduleDocking();
  }, [scheduleDocking]);

  function clearHoverGuideTimers(): void {
    if (hoverGuideTimer.current !== null) window.clearTimeout(hoverGuideTimer.current);
    if (hoverGuideCloseTimer.current !== null) window.clearTimeout(hoverGuideCloseTimer.current);
    hoverGuideTimer.current = null;
    hoverGuideCloseTimer.current = null;
  }

  function showHoverGuide(): void {
    wakeWidget();
    if (nudgeOpen || hoverGuideOpen) return;
    if (hoverGuideTimer.current !== null) window.clearTimeout(hoverGuideTimer.current);
    if (hoverGuideCloseTimer.current !== null) window.clearTimeout(hoverGuideCloseTimer.current);
    hoverGuideCloseTimer.current = null;
    hoverGuideTimer.current = window.setTimeout(() => {
      hoverGuideTimer.current = null;
      setHoverGuideOpen(true);
    }, HOVER_GUIDE_DELAY_MS);
  }

  function deferCloseHoverGuide(): void {
    if (hoverGuideTimer.current !== null) window.clearTimeout(hoverGuideTimer.current);
    hoverGuideTimer.current = null;
    if (!hoverGuideOpen) {
      scheduleDocking();
      return;
    }
    if (hoverGuideCloseTimer.current !== null) return;
    hoverGuideCloseTimer.current = window.setTimeout(() => {
      hoverGuideCloseTimer.current = null;
      setHoverGuideOpen(false);
    }, HOVER_GUIDE_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    if (open || nudgeOpen || hoverGuideOpen || submitting) {
      clearDockTimer();
      setDocked(false);
      return;
    }
    scheduleDocking();
    return clearDockTimer;
  }, [clearDockTimer, hoverGuideOpen, nudgeOpen, open, scheduleDocking, submitting, wakeWidget]);

  function persistHistory(next: FeedbackHistoryItem[]): void {
    const bounded = next.slice(0, 100);
    setHistory(bounded);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(bounded));
    } catch {
      // History cache is only a local fallback; remote status remains authoritative.
    }
  }

  function openForm(): void {
    if (nudgeDismissTimer.current !== null) window.clearTimeout(nudgeDismissTimer.current);
    setNudgeOpen(false);
    clearHoverGuideTimers();
    setHoverGuideOpen(false);
    wakeWidget();
    setError("");
    setHistoryError("");
    setViewState("form");
    setOpen(true);
  }

  function closeNudge(): void {
    if (nudgeDismissTimer.current !== null) window.clearTimeout(nudgeDismissTimer.current);
    setNudgeOpen(false);
    clearHoverGuideTimers();
    setHoverGuideOpen(false);
  }

  async function showHistory(): Promise<void> {
    setViewState("history");
    setHistoryError("");
    if (!window.imageWorkbench?.listFeedbackHistory) {
      setHistoryError("当前版本暂时无法同步记录。");
      return;
    }
    setHistoryLoading(true);
    try {
      const page = await window.imageWorkbench.listFeedbackHistory(50);
      persistHistory(page.items);
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : "记录暂时无法同步。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function showDetail(item: FeedbackHistoryItem): Promise<void> {
    setSelectedFeedback(item);
    setViewState("detail");
    setHistoryError("");
    if (!window.imageWorkbench?.getFeedbackDetail) return;
    setHistoryLoading(true);
    try {
      const detail = await window.imageWorkbench.getFeedbackDetail(item.id);
      setSelectedFeedback(detail);
      persistHistory(history.map((entry) => entry.id === detail.id ? { ...entry, ...detail } : entry));
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : "详情暂时无法同步。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteFeedback(): Promise<void> {
    if (!deleteTarget || deleting) return;
    if (!window.imageWorkbench?.deleteFeedback) {
      setDeleteError("当前版本暂时无法删除反馈。");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await window.imageWorkbench.deleteFeedback(deleteTarget.id);
      persistHistory(history.filter((item) => item.id !== deleteTarget.id));
      if (selectedFeedback?.id === deleteTarget.id) {
        setSelectedFeedback(null);
        setViewState("history");
      }
      setDeleteTarget(null);
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : "删除失败，请稍后重试。");
    } finally {
      setDeleting(false);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    wakeWidget();
    clearDockTimer();
    clearHoverGuideTimers();
    setHoverGuideOpen(false);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const moved = current.moved || Math.abs(dx) + Math.abs(dy) > 5;
    drag.current = { ...current, moved };
    if (moved) setPosition(clampPosition({ x: current.origin.x + dx, y: current.origin.y + dy }));
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>, cancelled = false): void {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.moved) {
      const releasedPosition = clampPosition({
        x: current.origin.x + event.clientX - current.startX,
        y: current.origin.y + event.clientY - current.startY
      });
      const nextDockSide = dockSideWithinRange(releasedPosition);
      const nextPosition = nextDockSide
        ? snapPositionToEdge(releasedPosition, nextDockSide)
        : releasedPosition;
      persistPosition(nextPosition);
      setDocked(nextDockSide !== null);
      if (!nextDockSide) clearDockTimer();
    }
    else if (!cancelled) openForm();
    else scheduleDocking();
  }

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openForm();
      return;
    }
    if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    persistPosition(clampPosition({
      x: position.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      y: position.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)
    }));
  }

  function handleKindKeyboard(event: KeyboardEvent<HTMLButtonElement>, optionIndex: number): void {
    const lastIndex = kindOptions.length - 1;
    let nextIndex = optionIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = optionIndex === 0 ? lastIndex : optionIndex - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = optionIndex === lastIndex ? 0 : optionIndex + 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else return;

    event.preventDefault();
    setKind(kindOptions[nextIndex].value);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalized = content.trim();
    if (normalized.length < 3 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (!window.imageWorkbench?.submitFeedback) throw new Error("当前环境暂时无法提交反馈。");
      const pageContext = {
        view,
        route: `${window.location.pathname}${window.location.hash}`,
        ...(boardId ? { boardId } : {}),
        ...(boardName ? { boardName } : {}),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        locale: navigator.language || "zh-CN"
      };
      const result = await window.imageWorkbench.submitFeedback({
        kind,
        content: normalized,
        pageContext
      });
      const submitted: FeedbackHistoryItem = {
        id: result.id,
        kind,
        content: normalized,
        status: isFeedbackStatus(result.status) ? result.status : "pending",
        pageContext,
        createdAt: result.createdAt,
        updatedAt: result.createdAt
      };
      persistHistory([submitted, ...history.filter((item) => item.id !== submitted.id)]);
      setSelectedFeedback(submitted);
      setContent("");
      setKind("experience");
      setViewState("success");
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* best-effort */ }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedKindIndex = kindOptions.findIndex((option) => option.value === kind);
  const activeNudge = feedbackNudges[nudgeVariant % feedbackNudges.length];
  const dockSide = nearestDockSide(position);
  const expandedControlClipPath = "inset(8px 4px round 999px)";
  const dockedControlClipPath = dockSide === "left"
    ? "inset(0 20px 0 0 round 0 8px 8px 0)"
    : "inset(0 0 0 20px round 8px 0 0 8px)";
  const dockedControlOffset = dockSide === "left"
    ? -position.x
    : window.innerWidth - WIDGET_HITBOX_WIDTH - position.x;

  return (
    <>
      <Popover open={nudgeOpen || hoverGuideOpen} onOpenChange={(next) => {
        if (!next) {
          closeNudge();
          clearHoverGuideTimers();
          setHoverGuideOpen(false);
        }
      }}>
        <PopoverAnchor asChild>
          <motion.button
            initial={false}
            type="button"
            data-feedback
            data-feedback-docked={docked ? "true" : "false"}
            data-feedback-dock-side={dockSide}
            aria-label={uiText("提交反馈")}
            title={docked ? uiText("提交反馈") : uiText("提交反馈；拖拽可移动位置")}
            className="fixed z-40 block h-14 w-12 touch-none bg-transparent text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            style={{ left: position.x, top: position.y }}
            animate={{ x: docked ? dockedControlOffset : 0 }}
            transition={reduceMotion
              ? { duration: 0 }
              : docked
                ? { duration: 0.28, ease: [0.16, 1, 0.3, 1] }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onPointerEnter={showHoverGuide}
            onPointerLeave={deferCloseHoverGuide}
            onFocus={wakeWidget}
            onBlur={deferCloseHoverGuide}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => finishPointer(event)}
            onPointerCancel={(event) => finishPointer(event, true)}
            onKeyDown={handleKeyboard}
          >
            <motion.span
              initial={false}
              data-feedback-control
              className="absolute inset-0 block bg-foreground shadow-sm"
              animate={{ clipPath: docked ? dockedControlClipPath : expandedControlClipPath }}
              transition={reduceMotion
                ? { duration: 0 }
                : docked
                  ? { duration: 0.28, ease: [0.16, 1, 0.3, 1] }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.span
                initial={false}
                className="absolute inset-0 grid place-items-center"
                animate={reduceMotion
                  ? { opacity: docked ? 0 : 1 }
                  : { opacity: docked ? 0 : 1, scale: docked ? 0.82 : 1, x: docked ? (dockSide === "left" ? -5 : 5) : 0 }}
                transition={reduceMotion
                  ? { duration: 0 }
                  : docked
                    ? { duration: 0.12, ease: [0.25, 1, 0.5, 1] }
                    : { delay: 0.06, duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                <MessageSquareText className="size-[18px]" aria-hidden="true" />
              </motion.span>
              <motion.span
                initial={false}
                data-feedback-edge-label
                className={`absolute inset-y-0 flex w-7 flex-col items-center justify-center gap-1 ${dockSide === "left" ? "left-0" : "right-0"}`}
                animate={reduceMotion
                  ? { opacity: docked ? 1 : 0 }
                  : { opacity: docked ? 1 : 0, y: docked ? 0 : 3, scale: docked ? 1 : 0.96 }}
                transition={reduceMotion
                  ? { duration: 0 }
                  : docked
                    ? { delay: 0.08, duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                    : { duration: 0.1, ease: [0.25, 1, 0.5, 1] }}
              >
                <MessageSquareText className="size-3.5" aria-hidden="true" />
                <span data-feedback-edge-text className="flex flex-col text-[10px] font-medium leading-none">
                  <span>{uiText("反")}</span>
                  <span>{uiText("馈")}</span>
                </span>
              </motion.span>
            </motion.span>
          </motion.button>
        </PopoverAnchor>
        <PopoverContent
          side={dockSide === "left" ? "right" : "left"}
          align="end"
          sideOffset={12}
          className="z-40 w-72 rounded-lg p-3.5"
          aria-label={uiText("反馈激励提示")}
          onPointerEnter={showHoverGuide}
          onPointerLeave={deferCloseHoverGuide}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"><MessageSquareText className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{activeNudge.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeNudge.description}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 size-7 shrink-0" aria-label={uiText("关闭反馈激励提示")} title={uiText("关闭提示")} onClick={closeNudge}><X className="size-4" /></Button>
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" onClick={openForm}>{activeNudge.action}</Button>
        </PopoverContent>
      </Popover>

      <Dialog open={open} onOpenChange={(next) => { if (!submitting) setOpen(next); }}>
        <DialogContent
          data-feedback
          overlayClassName="feedback-overlay"
          className="w-[calc(100vw-2rem)] max-w-xl gap-5 rounded-lg p-6 sm:p-7"
        >
          <DialogHeader>
            <DialogTitle className="flex min-h-7 items-center gap-1">
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={viewState}
                  className="block shrink-0"
                  initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -2 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  {viewState === "form" ? uiText("提交反馈") : viewState === "success" ? uiText("提交成功") : viewState === "history" ? uiText("提交记录") : uiText("提交详情")}
                </motion.span>
              </AnimatePresence>
              {viewState === "form" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={uiText("查看提交记录")}
                  title={uiText("查看提交记录")}
                  onClick={() => void showHistory()}
                >
                  <ClipboardList className="size-4" />
                </Button>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">{uiText("查看或提交产品反馈。")}</DialogDescription>
          </DialogHeader>

          <motion.div layout transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="relative">
          <AnimatePresence initial={false}>
          <motion.div
            key={viewState}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
          {viewState === "form" ? <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <div className="rounded-lg bg-muted p-1">
              <div className="relative grid grid-cols-3" role="radiogroup" aria-label={uiText("反馈类型")}>
                <span
                  data-feedback-kind-indicator
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-md bg-foreground shadow-sm transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ transform: `translate3d(${selectedKindIndex * 100}%, 0, 0)` }}
                />
                {kindOptions.map((option, optionIndex) => (
                  <Button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === option.value}
                    tabIndex={kind === option.value ? 0 : -1}
                    variant="ghost"
                    size="sm"
                    className={kind === option.value
                      ? "relative z-10 min-w-0 bg-transparent text-background transition-colors duration-150 hover:bg-transparent hover:text-background motion-reduce:transition-none"
                      : "relative z-10 min-w-0 bg-transparent text-muted-foreground transition-colors duration-150 hover:bg-transparent hover:text-foreground motion-reduce:transition-none"}
                    disabled={submitting}
                    onClick={() => setKind(option.value)}
                    onKeyDown={(event) => handleKindKeyboard(event, optionIndex)}
                  >
                    <Check
                      className={kind === option.value
                        ? "size-3.5 scale-100 opacity-100 transition-[opacity,transform] duration-150 motion-reduce:transition-none"
                        : "size-3.5 scale-75 opacity-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none"}
                      aria-hidden="true"
                    />
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="relative" data-feedback-input>
                <Textarea
                  autoFocus
                  value={content}
                  onChange={(event) => { setContent(event.target.value); if (error) setError(""); }}
                  placeholder={kindPlaceholders[kind]}
                  className="min-h-52 resize-none pb-12 leading-6 transition-[border-color,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] focus-visible:border-foreground/55 focus-visible:ring-foreground/10 motion-reduce:transition-none"
                  maxLength={2_000}
                  disabled={submitting}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "feedback-error" : "feedback-count"}
                />
                <span
                  id="feedback-count"
                  className="pointer-events-none absolute bottom-3 left-3 text-xs tabular-nums text-muted-foreground"
                >
                  {content.length}/2000
                </span>
                <Button
                  type="submit"
                  size="sm"
                  className="absolute bottom-2 right-2"
                  disabled={content.trim().length < 3 || submitting}
                >
                  {submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Send className="size-4" />}
                  {submitting ? uiText("正在提交") : uiText("提交反馈")}
                </Button>
              </div>
              <p
                id="feedback-error"
                className={error ? "mt-1.5 text-xs text-destructive" : "sr-only"}
                aria-live="polite"
              >
                {error}
              </p>
            </div>
          </form> : viewState === "success" ? (
            <section className="flex flex-col gap-5" aria-label={uiText("提交成功")}>
              <div className="rounded-lg bg-muted px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background"><CheckCircle2 className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{uiText("反馈已收到")}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{uiText("我们会评估这条反馈，并在这里同步处理进度。")}</p>
                  </div>
                </div>
                {selectedFeedback ? <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground"><span className="truncate">{selectedFeedback.content}</span><StatusPill status={selectedFeedback.status} /></div> : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={openForm}>{uiText("再提一条")}</Button>
                <Button type="button" onClick={() => void showHistory()}>{uiText("查看提交记录")}<ChevronRight className="size-4" /></Button>
              </div>
            </section>
          ) : viewState === "history" ? (
            <section className="flex min-h-48 flex-col gap-3" aria-label={uiText("提交记录")}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{history.length ? uiText("共 {{ui:0}} 条记录", [history.length]) : uiText("提交后会在这里显示")}</p>
                <Button type="button" variant="ghost" size="sm" disabled={historyLoading} onClick={() => void showHistory()}>
                  {historyLoading ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                  {uiText("刷新")}</Button>
              </div>
              {historyError ? <p className="text-xs text-muted-foreground" role="status">{historyError}</p> : null}
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {history.map((item) => <div key={item.id} className="flex items-center gap-2 px-3 py-3 transition-colors duration-150 hover:bg-muted/70 motion-reduce:transition-none">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => void showDetail(item)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.content}</span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>{kindLabels[item.kind]}</span><span>{formatSubmittedAt(item.createdAt)}</span></span>
                    </span>
                    <StatusPill status={item.status} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  {canDeleteFeedback(item.status) ? <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={uiText("删除反馈")} title={uiText("删除反馈")} onClick={() => { setDeleteError(""); setDeleteTarget(item); }}><Trash2 className="size-4" /></Button> : null}
                </div>)}
                {!historyLoading && history.length === 0 ? <div className="px-3 py-8 text-center text-sm text-muted-foreground">{uiText("还没有提交记录")}</div> : null}
              </div>
            </section>
          ) : (
            <section className="flex min-h-48 flex-col gap-4" aria-label={uiText("提交详情")}>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={uiText("返回提交记录")} title={uiText("返回提交记录")} onClick={() => void showHistory()}><ChevronLeft className="size-4" /></Button>
                  {selectedFeedback ? <StatusPill status={selectedFeedback.status} /> : null}
                  {selectedFeedback && canDeleteFeedback(selectedFeedback.status) ? <Button type="button" variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => { setDeleteError(""); setDeleteTarget(selectedFeedback); }}><Trash2 className="size-3.5" />{uiText("删除反馈")}</Button> : null}
              </div>
              {selectedFeedback ? <>
                <div className="rounded-lg bg-muted px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-6">{selectedFeedback.content}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">{uiText("类型")}</dt><dd className="mt-1">{kindLabels[selectedFeedback.kind]}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{uiText("提交时间")}</dt><dd className="mt-1">{formatSubmittedAt(selectedFeedback.createdAt)}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-muted-foreground">{uiText("所在界面")}</dt><dd className="mt-1 truncate">{selectedFeedback.pageContext.boardName || selectedFeedback.pageContext.view || "Iterlay"}</dd></div>
                </dl>
                {selectedFeedback.decisionSummary ? <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">{uiText("处理说明")}</p><p className="mt-1.5 text-sm leading-6">{selectedFeedback.decisionSummary}</p></div> : null}
                {"runs" in selectedFeedback && selectedFeedback.runs.length ? <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">{uiText("处理进度")}</p><div className="mt-2 space-y-2">{selectedFeedback.runs[0].events.slice(-3).map((event) => <div key={event.id} className="flex gap-2 text-sm"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/45" /><span>{event.summary}</span></div>)}</div></div> : null}
              </> : <p className="text-sm text-muted-foreground">{uiText("正在加载详情…")}</p>}
              {historyError ? <p className="text-xs text-muted-foreground" role="status">{historyError}</p> : null}
            </section>
          )}
          </motion.div>
          </AnimatePresence>
          </motion.div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(next) => { if (!next && !deleting) { setDeleteError(""); setDeleteTarget(null); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm gap-5 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle>{uiText("删除这条反馈？")}</DialogTitle>
            <DialogDescription>{uiText("删除后将无法恢复，也不会影响已经处理完成的反馈。")}</DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive" role="alert">{deleteError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={deleting} onClick={() => { setDeleteError(""); setDeleteTarget(null); }}>{uiText("取消")}</Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void deleteFeedback()}>{deleting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Trash2 className="size-4" />}{deleting ? uiText("正在删除") : uiText("删除反馈")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function canDeleteFeedback(status: FeedbackStatus): boolean {
  return status === "needs_human" || status === "rejected";
}

function StatusPill({ status }: { status: FeedbackStatus }): React.ReactElement {
  const tone = status === "accepted" || status === "implementing" || status === "pr_open" || status === "released"
    ? "bg-foreground text-background"
    : status === "rejected" || status === "failed" || status === "voided"
      ? "bg-muted text-muted-foreground"
      : "bg-muted text-foreground";
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${tone}`}>{statusLabels[status]}</span>;
}
