import { useUiText } from "@/i18n";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Copy,
  History,
  Image,
  ListPlus,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  TriangleAlert,
  X
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { AssistantIntentSuggestionCount, BoardMutationPlan, SceneAssistantInteraction } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { assistantInteractionSupplementKey, type AssistantConfirmationPreview } from "@/lib/assistant-interaction";
import type { AssistantHistoryConversation } from "@/lib/assistant-history";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { isSendEnter } from "@/lib/send-on-enter";
import { hasStructuredPromptFields, parseStructuredPromptLines } from "@/lib/structured-prompt";
import { cn } from "@/lib/utils";
import { useI18n, type MessageKey } from "@/i18n";
import type { AssistantAttachmentSnapshot, AssistantToolCall } from "@shared/assistant-display";
import { AssistantMessageAttachments, AssistantToolGroup } from "./AssistantMessageDetails";
import companionAvatar from "@/assets/app-icon-mascot.png";

export interface AiAssistantReceiptAction {
  label: string;
  /** undo 显示撤销图标，toggle 显示切换图标；缺省不带图标。 */
  kind?: "undo" | "toggle";
  onAction: () => void;
}

export interface AiAssistantReceipt {
  label: string;
  actions?: AiAssistantReceiptAction[];
}

export interface AiAssistantMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  reasoningSummary?: string;
  attachments?: AssistantAttachmentSnapshot[];
  toolCalls?: AssistantToolCall[];
  streaming?: boolean;
  tone?: "default" | "error";
  receipt?: AiAssistantReceipt;
  /** 仅发送给后续模型轮次的完整上下文，不在气泡中展示。 */
  assistantContext?: string;
  /** 本轮实际生成的完整提示词，默认折叠供回顾与复用。 */
  generatedPrompt?: string;
  directions?: AiAssistantDirection[];
  onGenerateAllDirections?: () => void;
  comicDramaPlan?: AiAssistantComicDramaPlan;
}

export interface AiAssistantComicDramaPlan {
  plan: BoardMutationPlan;
  contextLabel: string;
  readiness?: string;
  status: "preview" | "applying" | "applied" | "conflict" | "error";
  error?: string;
  onApply: (characterDraftIds?: string[]) => void;
  onRefine: () => void;
  onRetry: () => void;
}

export interface AiAssistantDirection {
  id: string;
  title: string;
  description?: string;
  onApply: () => void;
  onGenerate: () => void;
}

export interface AiAssistantInteractionState {
  id: string;
  interaction: SceneAssistantInteraction;
  confirmationPreview?: AssistantConfirmationPreview;
  canGenerateImmediately?: boolean;
}

export interface AiAssistantWorkflowStep {
  id: string;
  label: string;
  detail?: string;
  result?: string;
  streaming?: boolean;
  status: "pending" | "active" | "complete" | "error";
}

export interface AiAssistantWorkflowAction {
  id: string;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  onAction: () => void;
}

export interface AiAssistantWorkflow {
  label?: string;
  steps: AiAssistantWorkflowStep[];
  actions?: AiAssistantWorkflowAction[];
  notice?: string;
}

export type AiAssistantInteractionValues = Record<string, string | string[]>;
export type AiAssistantResizeCorner = "nw" | "ne" | "sw" | "se";

export interface AiAssistantResizeHandlers {
  onPointerDown: (
    corner: AiAssistantResizeCorner,
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

export interface AiAssistantContextImage {
  id: string;
  src: string;
  alt: string;
  role: "edit-target" | "reference";
  onRemove?: () => void;
}

interface AiAssistantProps {
  appearance?: "classic" | "fusion";
  hideComposer?: boolean;
  hideInteraction?: boolean;
  variant: "docked" | "floating";
  dockSide?: "left" | "right";
  title?: string;
  subtitle?: string;
  /** 用于嵌入已有页面标题/标签的助手视图。 */
  hideHeader?: boolean;
  messages: AiAssistantMessage[];
  value: string;
  placeholder?: string;
  disabled?: boolean;
  streaming?: boolean;
  activityLabel?: string;
  interaction?: AiAssistantInteractionState | null;
  workflow?: AiAssistantWorkflow;
  /** 调用方控制是否展示意图建议；开关应放在所属业务的设置中。 */
  intentSuggestionsEnabled?: boolean;
  intentSuggestionCount?: AssistantIntentSuggestionCount;
  intentSuggestions?: string[];
  intentSuggestionsLoading?: boolean;
  contextImages?: AiAssistantContextImage[];
  history?: AssistantHistoryConversation[];
  historyLoading?: boolean;
  historyScope?: "board" | "all";
  currentConversationId?: string;
  compact?: boolean;
  composerAutoFocus?: boolean;
  /** 在输入区提供全画板层级的大尺寸编辑弹窗。 */
  expandableComposer?: boolean;
  canSubmitWithoutText?: boolean;
  resizePointerHandlers?: AiAssistantResizeHandlers;
  headerPointerHandlers?: Pick<
    React.HTMLAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
  headerActions?: ReactNode;
  className?: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onClose?: () => void;
  onAttach?: () => void;
  onPasteImages?: (files: File[]) => void;
  onIntentSuggestionSelect?: (suggestion: string) => void;
  onRefreshIntentSuggestions?: () => void;
  onInteractionSubmit?: (values: AiAssistantInteractionValues) => void;
  onInteractionDismiss?: () => void;
  onInteractionRefine?: (value: string) => void;
  onInteractionGenerate?: () => void;
  onHistoryOpen?: () => void;
  onHistoryScopeChange?: (scope: "board" | "all") => void;
  onHistorySelect?: (conversation: AssistantHistoryConversation) => void;
  onNewConversation?: () => void;
  onApplyGeneratedPrompt?: (prompt: string) => void;
}

export function AssistantImageContext({ images }: { images: AiAssistantContextImage[] }): React.ReactElement {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{
    src: string;
    alt: string;
    sourceRect: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const editTargetCount = images.filter((image) => image.role === "edit-target").length;
  const referenceCount = images.filter((image) => image.role === "reference").length;
  const summary = [
    editTargetCount > 0 ? t("assistant.imageContext.editCount", { count: editTargetCount }) : "",
    referenceCount > 0 ? t("assistant.imageContext.referenceCount", { count: referenceCount }) : ""
  ].filter(Boolean).join(" · ");
  const collapsedImages = images.slice(0, 3);
  const collapsedOverflow = Math.max(0, images.length - collapsedImages.length);

  function openPreview(
    event: React.MouseEvent<HTMLButtonElement>,
    image: AiAssistantContextImage
  ): void {
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    setPreview({ src: image.src, alt: image.alt, sourceRect: { left, top, width, height } });
  }

  return (
    <>
      <section className="mb-1 border-b border-[#e4e4e0] px-0.5 pb-1.5 dark:border-border" aria-label={t("assistant.imageContext")}>
        <div className="group/context-toggle flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 transition-colors duration-150 hover:bg-[#eeeeeb] motion-reduce:transition-none dark:hover:bg-accent">
          {!expanded ? (
            <span className="flex shrink-0 -space-x-1">
              {collapsedImages.map((image) => {
                const isEditTarget = image.role === "edit-target";
                return (
                  <button
                    type="button"
                    key={`${image.role}:${image.id}`}
                    onClick={(event) => openPreview(event, image)}
                    aria-label={t("assistant.imageContext.preview", { name: image.alt })}
                    title={t("assistant.imageContext.preview", { name: image.alt })}
                    className={cn(
                      "relative h-6 w-6 overflow-hidden rounded-[6px] bg-[#e8e8e4] ring-1 ring-[#f8f8f6] transition-[transform,filter] duration-150 hover:z-30 hover:scale-110 hover:brightness-105 focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/60 motion-reduce:transform-none motion-reduce:transition-none dark:bg-muted dark:ring-card",
                      isEditTarget && "z-10 ring-1 ring-[hsl(var(--ai-accent))]"
                    )}
                  >
                    <img src={image.src} alt="" className="h-full w-full object-cover" draggable={false} />
                    {isEditTarget ? (
                      <span className="pointer-events-none absolute bottom-0 right-0 flex h-2.5 w-2.5 items-center justify-center rounded-tl-[4px] bg-[hsl(var(--ai-accent))] text-white">
                        <Pencil className="h-1.5 w-1.5" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {collapsedOverflow > 0 ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  aria-label={t("assistant.imageContext.expand")}
                  className="relative z-20 flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#dededa] text-[9px] font-semibold text-[#4b4b47] ring-1 ring-[#f8f8f6] transition-colors hover:bg-[#d2d2cd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/60 dark:bg-muted dark:text-muted-foreground dark:ring-card dark:hover:bg-accent"
                >
                  +{collapsedOverflow}
                </button>
              ) : null}
            </span>
          ) : (
            <Image className="h-3.5 w-3.5 shrink-0 text-[#686865] dark:text-muted-foreground" aria-hidden />
          )}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={t(expanded ? "assistant.imageContext.collapse" : "assistant.imageContext.expand")}
            onClick={() => setExpanded((current) => !current)}
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 dark:focus-visible:ring-ring/45"
          >
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#4b4b47] dark:text-foreground/85">{summary}</span>
            <ChevronDown className={cn(
              "h-3.5 w-3.5 shrink-0 text-[#777772] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover/context-toggle:text-[#3f3f3c] motion-reduce:transition-none dark:text-muted-foreground dark:group-hover/context-toggle:text-foreground",
              expanded && "rotate-180"
            )} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="expanded-image-context"
              initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -2 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -2 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5 pt-1">
                {images.map((image) => {
                  const isEditTarget = image.role === "edit-target";
                  const roleLabel = t(isEditTarget
                    ? "assistant.imageContext.editRole"
                    : "assistant.imageContext.referenceRole");
                  return (
                    <figure
                      key={`${image.role}:${image.id}`}
                      className={cn(
                        "group/context-image relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[#e8e8e4] dark:bg-muted",
                        isEditTarget
                          ? "ring-1 ring-[hsl(var(--ai-accent))]"
                          : "ring-1 ring-inset ring-[#d2d2cd] dark:ring-border"
                      )}
                      aria-label={`${roleLabel}：${image.alt}`}
                      title={`${roleLabel}：${image.alt}`}
                    >
                      <button
                        type="button"
                        onClick={(event) => openPreview(event, image)}
                        aria-label={t("assistant.imageContext.preview", { name: image.alt })}
                        className="absolute inset-0 cursor-zoom-in overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/85"
                      >
                        <img
                          src={image.src}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-200 group-hover/context-image:scale-105 motion-reduce:transition-none"
                          draggable={false}
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-white opacity-0 transition-opacity duration-150 group-hover/context-image:opacity-100 group-focus-within/context-image:opacity-100 motion-reduce:transition-none">
                          <Maximize2 className="h-3.5 w-3.5 drop-shadow-sm" />
                        </span>
                        <span className={cn(
                          "pointer-events-none absolute inset-x-0 bottom-0 flex h-3.5 items-center justify-center text-[9px] font-semibold leading-none text-white",
                          isEditTarget ? "bg-[hsl(var(--ai-accent)/0.94)]" : "bg-[#242422]/78"
                        )}>
                          {roleLabel}
                        </span>
                      </button>
                      {image.onRemove ? (
                        <button
                          type="button"
                          onClick={image.onRemove}
                          aria-label={t("assistant.imageContext.remove", { name: image.alt })}
                          className="absolute right-0.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#242422]/80 text-white opacity-0 transition-[opacity,background-color,transform] duration-150 hover:bg-[#242422] active:scale-90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/context-image:opacity-100 motion-reduce:transform-none motion-reduce:transition-none"
                        >
                          <X className="h-2 w-2" />
                        </button>
                      ) : null}
                    </figure>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {preview ? (
          <ImageZoomLightbox
            key={`${preview.src}:${preview.alt}`}
            src={preview.src}
            alt={preview.alt}
            sourceRect={preview.sourceRect}
            backdrop="dim"
            closeButtonPlacement="image"
            onClose={() => setPreview(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function AssistantWorkflow({ workflow }: { workflow: AiAssistantWorkflow }): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const reduceMotion = Boolean(useReducedMotion());
  const currentStepId = workflow.steps.find((step) => step.status === "active")?.id
    ?? [...workflow.steps].reverse().find((step) => step.status === "complete")?.id;
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() => (
    currentStepId ? new Set([currentStepId]) : new Set()
  ));
  const previousCurrentStepRef = useRef(currentStepId);

  useEffect(() => {
    if (!currentStepId || previousCurrentStepRef.current === currentStepId) return;
    previousCurrentStepRef.current = currentStepId;
    setExpandedStepIds(new Set([currentStepId]));
  }, [currentStepId]);

  return (
    <section className="border-b border-[#dededa] pb-3 dark:border-border" aria-label={workflow.label ?? t("assistant.workflow")}>
      {workflow.label ? (
        <p className="mb-2 text-[11px] font-medium text-[#686865] dark:text-muted-foreground">{workflow.label}</p>
      ) : null}
      <ol>
        {workflow.steps.map((step, index) => {
          const nextStep = workflow.steps[index + 1];
          const connectorComplete = step.status === "complete" && nextStep?.status !== "pending";
          const hasResult = Boolean(step.result) || Boolean(step.streaming);
          const expanded = hasResult && expandedStepIds.has(step.id);
          return (
            <li key={step.id} className="relative flex min-w-0 items-start gap-2.5 pb-2.5 last:pb-0">
              {nextStep ? (
                <span
                  className={cn(
                    "absolute left-[7px] top-[18px] h-[calc(100%-12px)] w-px origin-top bg-[#d6d6d1] dark:bg-border",
                    connectorComplete && "bg-emerald-500/70 dark:bg-emerald-500/60"
                  )}
                  aria-hidden
                />
              ) : null}
              <span className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={step.status}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.72 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.84 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="relative flex h-4 w-4 items-center justify-center"
                  >
                    {step.status === "active" ? (
                      <>
                        <motion.span
                          className="absolute inset-[-3px] rounded-full bg-[hsl(var(--ai-accent)/0.14)]"
                          animate={reduceMotion ? undefined : { opacity: [0.35, 0.9, 0.35], scale: [0.82, 1.08, 0.82] }}
                          transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
                        />
                        <Loader2 className={cn("relative h-3.5 w-3.5 text-[hsl(var(--ai-accent))]", !reduceMotion && "animate-spin")} />
                      </>
                    ) : step.status === "complete" ? (
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                    ) : step.status === "error" ? (
                      <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-[#b0b0aa] dark:text-muted-foreground/55" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              <motion.div
                layout={!reduceMotion}
                className={cn(
                  "min-w-0 flex-1 rounded-md px-2 py-1 transition-colors duration-200 motion-reduce:transition-none",
                  step.status === "active" && "bg-[hsl(var(--ai-muted))]"
                )}
              >
                <button
                  type="button"
                  disabled={!hasResult}
                  aria-expanded={hasResult ? expanded : undefined}
                  aria-controls={hasResult ? `assistant-workflow-result-${step.id}` : undefined}
                  onClick={() => {
                    setExpandedStepIds((current) => {
                      const next = new Set(current);
                      if (next.has(step.id)) next.delete(step.id);
                      else next.add(step.id);
                      return next;
                    });
                  }}
                  className="flex w-full min-w-0 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 disabled:cursor-default dark:focus-visible:ring-ring/45"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn(
                      "block text-xs font-medium leading-5 transition-colors duration-200 motion-reduce:transition-none",
                      step.status === "pending"
                        ? "text-[#777772] dark:text-muted-foreground"
                        : step.status === "active"
                          ? "text-[hsl(var(--ai-accent))]"
                          : "text-[#3f3f3c] dark:text-foreground/90"
                    )}>
                      {step.label}
                    </span>
                    <AnimatePresence initial={false} mode="popLayout">
                      {step.detail ? (
                        <motion.span
                          key={step.detail}
                          initial={reduceMotion ? false : { opacity: 0, y: 2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? undefined : { opacity: 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="block text-[11px] leading-4 text-[#686865] dark:text-muted-foreground"
                        >
                          {step.detail}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                  {hasResult ? (
                    <ChevronDown className={cn(
                      "mt-1 h-3.5 w-3.5 shrink-0 text-[#777772] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:text-muted-foreground",
                      expanded && "rotate-180"
                    )} />
                  ) : null}
                </button>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      id={`assistant-workflow-result-${step.id}`}
                      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 border-t border-[#d6d6d1] pt-2 text-[11px] leading-[1.55] text-[#3f3f3c] dark:border-border dark:text-foreground/90" aria-live={step.streaming ? "polite" : undefined}>
                        {step.streaming && !step.result ? (
                          <span className="flex items-center gap-1.5 text-[#686865] dark:text-muted-foreground">
                            <Loader2 className={cn("h-3 w-3", !reduceMotion && "animate-spin")} />
                            {t("assistant.workflow.streaming")}
                          </span>
                        ) : (
                          <Streamdown
                            mode={step.streaming ? "streaming" : "static"}
                            animated={reduceMotion ? false : { animation: "fadeIn", duration: 100, sep: "char", stagger: 6 }}
                            isAnimating={Boolean(step.streaming && !reduceMotion)}
                            caret={step.streaming ? "block" : undefined}
                            controls={false}
                            className="[&_li]:my-1 [&_ol]:my-1.5 [&_ol]:pl-4 [&_p]:my-0 [&_ul]:my-1.5 [&_ul]:pl-4"
                          >
                            {step.result ?? ""}
                          </Streamdown>
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </li>
          );
        })}
      </ol>

      {workflow.notice ? (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-4 text-destructive">
          {workflow.notice}
        </p>
      ) : null}

      {workflow.actions?.length ? (
        <div className={cn("mt-3 grid gap-2", workflow.actions.length > 1 && "grid-cols-2")}>
          {workflow.actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant={action.variant === "secondary" ? "outline" : "default"}
              className="relative h-8 gap-1.5 overflow-hidden text-xs transition-[background-color,transform] duration-150 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              disabled={action.disabled || action.loading}
              aria-busy={action.loading || undefined}
              onClick={action.onAction}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={action.loading ? "loading" : "idle"}
                  initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-1.5"
                >
                  {action.loading ? <Loader2 className={cn("h-3.5 w-3.5", !reduceMotion && "animate-spin")} /> : null}
                  {uiText(action.label)}
                </motion.span>
              </AnimatePresence>
              {action.loading ? (
                <motion.span
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[hsl(var(--ai-accent))]"
                  initial={reduceMotion ? { scaleX: 1 } : { scaleX: 0.08 }}
                  animate={reduceMotion ? { scaleX: 1 } : { scaleX: [0.08, 0.72, 0.96] }}
                  transition={{ duration: 1.8, times: [0, 0.68, 1], ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const resizeHandles: Array<{
  corner: AiAssistantResizeCorner;
  labelKey: MessageKey;
  positionClass: string;
  indicatorClass: string;
}> = [
  {
    corner: "nw",
    labelKey: "assistant.resize.nw",
    positionClass: "left-0 top-0 cursor-nwse-resize items-start justify-start",
    indicatorClass: "origin-top-left rounded-tl-[10px] border-l-[1.5px] border-t-[1.5px]"
  },
  {
    corner: "ne",
    labelKey: "assistant.resize.ne",
    positionClass: "right-0 top-0 cursor-nesw-resize items-start justify-end",
    indicatorClass: "origin-top-right rounded-tr-[10px] border-r-[1.5px] border-t-[1.5px]"
  },
  {
    corner: "sw",
    labelKey: "assistant.resize.sw",
    positionClass: "bottom-0 left-0 cursor-nesw-resize items-end justify-start",
    indicatorClass: "origin-bottom-left rounded-bl-[10px] border-b-[1.5px] border-l-[1.5px]"
  },
  {
    corner: "se",
    labelKey: "assistant.resize.se",
    positionClass: "bottom-0 right-0 cursor-nwse-resize items-end justify-end",
    indicatorClass: "origin-bottom-right rounded-br-[10px] border-b-[1.5px] border-r-[1.5px]"
  }
];

function AssistantPromptReview({
  messageId,
  prompt,
  reduceMotion,
  onApply
}: {
  messageId: string;
  prompt: string;
  reduceMotion: boolean;
  onApply?: (prompt: string) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<number | null>(null);
  const contentId = `assistant-prompt-review-${messageId}`;
  const structuredLines = hasStructuredPromptFields(prompt)
    ? parseStructuredPromptLines(prompt).filter((line) => line.label.trim() || line.content.trim())
    : [];

  useEffect(() => () => {
    if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
  }, []);

  async function copyPrompt(): Promise<void> {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      return;
    }
    setCopied(true);
    if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => {
      setCopied(false);
      copyResetRef.current = null;
    }, 1_500);
  }

  return (
    <section
      className="mt-1.5 overflow-hidden rounded-md border border-[#dededa] bg-[#fbfbf9] dark:border-border dark:bg-card"
      aria-label={t("assistant.promptReview")}
    >
      <div className="flex min-h-8 items-center">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={t(expanded ? "assistant.promptReview.collapse" : "assistant.promptReview.expand")}
          onClick={() => setExpanded((current) => !current)}
          className="group/prompt-review flex min-h-8 min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#747470]/35 dark:focus-visible:ring-ring/45"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 -rotate-90 text-[#777772] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover/prompt-review:text-[#3f3f3c] motion-reduce:transition-none dark:text-muted-foreground dark:group-hover/prompt-review:text-foreground",
              expanded && "rotate-0"
            )}
            aria-hidden
          />
          <span className="truncate text-[11px] font-medium text-[#4b4b47] dark:text-foreground/85">
            {t("assistant.promptReview")}
          </span>
          {!expanded ? (
            <span className="min-w-0 flex-1 truncate text-[10px] text-[#858580] dark:text-muted-foreground/80">
              {prompt.replace(/\s+/g, " ")}
            </span>
          ) : null}
        </button>

        {expanded ? (
          <TooltipProvider delayDuration={250}>
            <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    aria-label={t(copied ? "assistant.promptReview.copied" : "assistant.promptReview.copy")}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[#686865] transition-colors duration-150 hover:bg-[#e8e8e4] hover:text-[#242422] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t(copied ? "assistant.promptReview.copiedTooltip" : "assistant.promptReview.copyTooltip")}
                </TooltipContent>
              </Tooltip>
              {onApply ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onApply(prompt)}
                      aria-label={t("assistant.promptReview.apply")}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#686865] transition-colors duration-150 hover:bg-[#e8e8e4] hover:text-[#242422] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("assistant.promptReview.applyTooltip")}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </TooltipProvider>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={contentId}
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto border-t border-[#e4e4e0] px-3 py-2.5 text-xs leading-[1.6] text-[#3f3f3c] dark:border-border dark:text-foreground/90">
              {structuredLines.length > 0 ? (
                <dl className="space-y-2" aria-label={t("assistant.promptReview.structured")}>
                  {structuredLines.map((line, index) => line.separator ? (
                    <div key={`${line.label}-${index}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                      <dt className="font-medium text-[#777772] dark:text-muted-foreground">{line.label.trim()}</dt>
                      <dd className="min-w-0 whitespace-pre-wrap break-words">{line.content.trim()}</dd>
                    </div>
                  ) : (
                    <div key={`continuation-${index}`} className="pl-20">
                      <dd className="whitespace-pre-wrap break-words">{line.content.trim()}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="whitespace-pre-wrap break-words">{prompt}</p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {copied ? t("assistant.promptReview.copiedAnnouncement") : ""}
      </span>
    </section>
  );
}

function AssistantComicDramaPlan({ value }: { value: AiAssistantComicDramaPlan }): React.ReactElement {
  const uiText = useUiText();

  const { plan } = value;
  const additions = plan.preview.additions;
  const characterDrafts = plan.action?.kind === "propose-characters" ? plan.action.characterDrafts : [];
  const [selectedDraftIds, setSelectedDraftIds] = useState(() => characterDrafts.filter((draft) => draft.required).map((draft) => draft.id));
  const steps = ["设定", "角色", "片段", "首尾帧", "视频", "合并"];
  const currentStep = plan.action?.kind === "create-setting" || plan.action?.kind === "update-setting"
    ? 0
    : plan.action?.kind === "propose-characters" || plan.action?.kind === "create-characters" || plan.action?.kind === "update-character"
      ? 1
      : plan.action?.kind === "create-segment" || plan.action?.kind === "update-segment" ? 2 : 3;
  const blocked = value.status === "applying" || value.status === "applied" || value.status === "conflict";
  const updatedNodeCount = plan.preview.updates?.nodes ?? 0;
  const primaryLabel = plan.action?.kind === "update-setting"
    ? "保存设定新版本"
    : plan.action?.kind === "update-character"
      ? "保存角色新版本"
      : plan.action?.kind === "update-segment"
        ? "保存片段新版本"
    : characterDrafts.length
      ? "添加所选角色卡 · " + selectedDraftIds.length
      : "添加 " + additions.nodes + " 个节点到画板";
  return (
    <section className="mt-2 overflow-hidden rounded-md border border-[#dededa] bg-background dark:border-border" aria-label={uiText("节点计划预览")}>
      <div className="border-b border-[#e4e4e0] px-3 py-2 dark:border-border">
        <p className="text-xs font-semibold text-[#30302e] dark:text-foreground">{plan.preview.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-[#686865] dark:text-muted-foreground">{value.contextLabel}</p>
      </div>
      <div className="border-b border-[#e4e4e0] px-3 py-2 dark:border-border" aria-label={uiText("漫剧制作步骤")}>
        <ol className="comic-plan-steps">{steps.map((step, index) => <li key={step} className="comic-plan-step" data-complete={index < currentStep || undefined} aria-current={index === currentStep ? "step" : undefined}>{step}</li>)}</ol>
        <p className="mt-1 text-[10px] text-muted-foreground">{uiText("当前：")}{steps[currentStep]} {uiText("· 下一步：")}{steps[Math.min(currentStep + 1, steps.length - 1)]}</p>
      </div>
      {characterDrafts.length ? <div className="grid gap-1.5 border-b border-[#e4e4e0] px-3 py-2 dark:border-border" aria-label={uiText("角色阵容方案")}>{characterDrafts.map((draft) => <label key={draft.id} className="flex items-start gap-2 rounded border border-border px-2 py-1.5 text-[11px]"><input type="checkbox" disabled={blocked} checked={selectedDraftIds.includes(draft.id)} onChange={(event) => setSelectedDraftIds((current) => event.target.checked ? [...current, draft.id] : current.filter((id) => id !== draft.id))} /><span className="min-w-0"><b>{draft.name}{draft.required ? uiText(" · 必需") : ""}</b><small className="mt-0.5 block break-words text-muted-foreground">{draft.role}</small><small className="mt-0.5 block break-words text-muted-foreground">{draft.profile}</small><small className="mt-0.5 block break-words text-muted-foreground">{uiText("外观锚点：")}{draft.appearanceAnchors.join(" · ")}</small><small className="mt-0.5 block break-words text-muted-foreground">{draft.visualDescription} {uiText("· 落板后逐个生成形象")}</small></span><Button type="button" variant="ghost" size="sm" disabled={blocked} className="ml-auto h-6 shrink-0 px-1.5 text-[10px]" onClick={(event) => { event.preventDefault(); value.onApply([draft.id]); }}>{uiText("单独添加")}</Button></label>)}</div> : null}
      {plan.preview.details?.length ? <dl className="grid gap-1.5 border-b border-[#e4e4e0] px-3 py-2.5 text-[11px] dark:border-border" aria-label={uiText("文本版本预览")}>
        {plan.preview.details.map((detail) => <div key={detail.label} className="grid grid-cols-[68px_minmax(0,1fr)] gap-2">
          <dt className="font-medium text-muted-foreground">{detail.label}</dt>
          <dd className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words text-foreground">{detail.value}</dd>
        </div>)}
      </dl> : null}
      <dl className="grid gap-2 px-3 py-2.5 text-[11px] leading-4">
        <div>
          <dt className="font-semibold">{updatedNodeCount ? uiText("将更新画板") : uiText("将添加到画板")}</dt>
          <dd className="mt-0.5 text-[#686865] dark:text-muted-foreground">
            {updatedNodeCount
              ? uiText("更新 {{ui:0}} 个节点 · {{ui:1}} 个新增节点 · {{ui:2}} 条连接 · {{ui:3}} 个分组", [updatedNodeCount, additions.nodes, additions.connections, additions.groups])
              : uiText("{{ui:0}} 个节点 · {{ui:1}} 条连接 · {{ui:2}} 个分组", [additions.nodes, additions.connections, additions.groups])}
          </dd>
        </div>
        <div><dt className="font-semibold">{uiText("影响")}</dt><dd className="mt-0.5 break-words text-[#686865] dark:text-muted-foreground">{plan.preview.impact}</dd></div>
        <div><dt className="font-semibold">{uiText("费用")}</dt><dd className="mt-0.5 break-words text-[#686865] dark:text-muted-foreground">{plan.preview.cost}{plan.preview.costItems?.length ? <ul className="mt-1 space-y-0.5">{plan.preview.costItems.map((item) => <li key={item.stage}>{item.stage === "character" ? uiText("角色图片费用") : item.stage === "first-frame" ? uiText("首帧图片费用") : item.stage === "last-frame" ? uiText("尾帧图片费用") : uiText("视频费用")} · {item.authoritative ? uiText("权威报价") : uiText("生成前报价")}</li>)}</ul> : null}</dd></div>
        {value.readiness ? <div><dt className="font-semibold">{uiText("首尾帧 readiness")}</dt><dd className="mt-0.5 break-words text-[#686865] dark:text-muted-foreground">{value.readiness}</dd></div> : null}
      </dl>
      {value.status === "conflict" ? <p className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive" role="alert">{uiText("预览后画板内容发生了变化。请基于最新内容重新预览后再应用。")}</p> : null}
      {value.status === "error" ? <p className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive" role="alert">{value.error || uiText("添加失败，未添加任何节点。")}</p> : null}
      {value.status === "applied" ? <p className="border-t border-emerald-600/20 bg-emerald-600/5 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400" role="status">{updatedNodeCount ? uiText("文本新版本已保存，未自动推进阶段或调用媒体模型。") : characterDrafts.length ? uiText("角色卡及完整设定已添加。下一步请在画板中逐个点击“生成形象”并采用满意版本。") : uiText("节点已添加到普通画板，未调用媒体模型。")}</p> : null}
      <div className="flex items-center justify-end gap-1.5 border-t border-[#e4e4e0] px-2 py-2 dark:border-border">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={value.onRefine}>{value.status === "conflict" ? uiText("保留到输入框") : uiText("继续修改")}</Button>
        {value.status === "conflict" || value.status === "error" ? (
          <Button type="button" size="sm" className="h-8 text-xs" onClick={value.onRetry}>{uiText("重新预览")}</Button>
        ) : (
          <Button type="button" size="sm" className="h-8 text-xs" disabled={blocked || (characterDrafts.length > 0 && selectedDraftIds.length === 0)} onClick={() => value.onApply(characterDrafts.length ? selectedDraftIds : undefined)}>
            {value.status === "applying" ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{updatedNodeCount ? uiText("正在保存…") : uiText("正在添加…")}</>
              : value.status === "applied" ? uiText("已应用") : primaryLabel}
          </Button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">{value.status === "applied" ? updatedNodeCount ? uiText("已更新 {{ui:0}} 个节点", [updatedNodeCount]) : uiText("已添加 {{ui:0}} 个节点到画板", [additions.nodes]) : ""}</span>
    </section>
  );
}

const AssistantMessage = memo(function AssistantMessage({
  message,
  reduceMotion,
  compact,
  isLatestError,
  greetingSuggestions,
  onApplyGeneratedPrompt
}: {
  message: AiAssistantMessage;
  reduceMotion: boolean;
  compact: boolean;
  isLatestError: boolean;
  greetingSuggestions?: ReactNode;
  onApplyGeneratedPrompt?: (prompt: string) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const isUser = message.role === "user";
  const errorActions = message.receipt?.actions ?? [];

  if (!isUser && message.tone === "error") {
    if (!isLatestError) {
      return (
        <div data-assistant-message="assistant" className="flex w-full justify-start">
          <div className="w-full max-w-[88%]">
            <details className="assistant-error-previous rounded-[10px] border border-[#e4e4e0] bg-[#f8f8f6] text-xs text-[#686865] dark:border-border dark:bg-card dark:text-muted-foreground">
              <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#747470]/45">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[#a92323]" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t("assistant.retry.previous")}</span>
                <ChevronDown className="assistant-error-chevron h-3.5 w-3.5 shrink-0" aria-hidden />
              </summary>
              <p className="border-t border-[#e4e4e0] px-3 pb-2.5 pt-2 text-[11px] leading-5 dark:border-border">{t("assistant.retry.checkState")}</p>
            </details>
          </div>
        </div>
      );
    }

    return (
      <div data-assistant-message="assistant" className="flex w-full justify-start">
        <div className="w-full max-w-[88%]">
          <div className="assistant-error-current rounded-[10px] border border-[#ebcdca] bg-[#fcf4f3] px-3.5 py-3 dark:border-destructive/35 dark:bg-destructive/10" role="alert">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a92323] dark:text-destructive" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-5 text-[#242422] dark:text-foreground">{t("assistant.retry.title")}</h3>
                <p className="mt-0.5 text-xs leading-5 text-[#5e4543] dark:text-muted-foreground">{t("assistant.retry.description")}</p>
              </div>
            </div>
            {message.content ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#4d3e3c] dark:text-muted-foreground">{message.content}</p> : null}
            <p className="mt-3 border-t border-[#ecd8d5] pt-2.5 text-xs leading-5 text-[#5d514f] dark:border-destructive/20 dark:text-muted-foreground">{t("assistant.retry.guidance")}</p>
            {errorActions.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {errorActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onAction}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[#d9b7b3] bg-white px-2.5 text-xs font-semibold text-[#7b2424] transition-colors hover:bg-[#fff8f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e6ad1] motion-reduce:transition-none dark:border-destructive/40 dark:bg-card dark:text-destructive-foreground dark:hover:bg-destructive/10"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {uiText(action.label)}
                  </button>
                ))}
                <span className="text-[11px] text-[#766765] dark:text-muted-foreground">{t("assistant.retry.noAutoSend")}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-assistant-message={message.role} data-assistant-greeting={message.id === "fusion-greeting" || undefined} className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%]", isUser && "max-w-[82%]")}>
        {message.attachments?.length ? <AssistantMessageAttachments attachments={message.attachments} /> : null}
        {!isUser && message.reasoningSummary?.trim() ? <details className="assistant-reasoning">
          <summary>
            {message.streaming ? <Loader2 className={cn(!reduceMotion && "animate-spin")} /> : <Check />}
            <span>{t("assistant.reasoningSummary")}</span>
            <ChevronDown className="assistant-reasoning-chevron" />
          </summary>
          <div className="assistant-reasoning-content">
            <p>{message.reasoningSummary.trim()}</p>
          </div>
        </details> : null}
        <div
          data-assistant-message-body=""
          className={cn(
            "text-[#242422] dark:text-foreground",
            compact
              ? "rounded-[9px] px-3 py-2 text-[13px] leading-[1.5]"
              : "rounded-[10px] px-3.5 py-2.5 text-sm leading-[1.55]",
            isUser
              ? "bg-[#e8e8e4] dark:bg-accent"
              : "bg-[#f0f0ed] dark:bg-muted",
            message.tone === "error" && "ring-1 ring-destructive/40"
          )}
        >
          {message.streaming && !message.content && message.reasoningSummary?.trim() ? null : message.streaming && !message.content ? (
            <div className="flex min-h-5 items-center gap-2 text-[#686865] dark:text-muted-foreground" role="status">
              <Loader2 className={cn("h-3.5 w-3.5", !reduceMotion && "animate-spin")} />
              <span>{t("assistant.thinking")}</span>
            </div>
          ) : (
            <Streamdown
              mode={message.streaming ? "streaming" : "static"}
              animated={reduceMotion ? false : { animation: "fadeIn", duration: 110, sep: "char", stagger: 7 }}
              isAnimating={Boolean(message.streaming && !reduceMotion)}
              caret={message.streaming ? "block" : undefined}
              controls={false}
              className="assistant-message-markdown [&_li]:my-1 [&_ol]:my-2 [&_ol]:pl-5 [&_p]:my-0 [&_ul]:my-2 [&_ul]:pl-5"
            >
              {message.content}
            </Streamdown>
          )}
          {greetingSuggestions ? <div className="mt-3">{greetingSuggestions}</div> : null}
        </div>

        {message.toolCalls?.length ? <AssistantToolGroup calls={message.toolCalls} /> : null}
        {!isUser && message.comicDramaPlan ? <AssistantComicDramaPlan value={message.comicDramaPlan} /> : null}

        {!isUser && !message.streaming && message.generatedPrompt?.trim() ? (
          <AssistantPromptReview
            messageId={message.id}
            prompt={message.generatedPrompt.trim()}
            reduceMotion={reduceMotion}
            onApply={onApplyGeneratedPrompt}
          />
        ) : null}

        {message.directions?.length ? (
          <div className="mt-2 space-y-1.5" aria-label={t("assistant.directions")}>
            {message.directions.map((direction) => (
              <div
                key={direction.id}
                className="flex min-h-14 items-center gap-2 rounded-lg border border-[#dededa] bg-[#f8f8f6] px-2.5 py-2 dark:border-border dark:bg-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#3f3f3c] dark:text-card-foreground">{direction.title}</p>
                  {direction.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#686865] dark:text-muted-foreground">
                      {direction.description}
                    </p>
                  ) : null}
                </div>
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={direction.onApply}
                        aria-label={t("assistant.directions.apply", { title: direction.title })}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#686865] transition-colors hover:bg-[#e8e8e4] hover:text-[#242422] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                      >
                        <ListPlus className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("assistant.directions.applyTooltip")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={direction.onGenerate}
                        aria-label={t("assistant.directions.generate", { title: direction.title })}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#30302e] text-[#f4f4f1] transition-[background-color,transform] hover:bg-[#242422] active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/45 motion-reduce:transform-none dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("assistant.directions.generateTooltip")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ))}
            {message.directions.length > 1 && message.onGenerateAllDirections ? (
              <button
                type="button"
                onClick={message.onGenerateAllDirections}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#dededa] bg-[#fbfbf9] text-xs font-medium text-[#3f3f3c] transition-colors hover:bg-[#e8e8e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 dark:border-border dark:bg-background dark:text-foreground/90 dark:hover:bg-accent"
              >
                <Play className="h-3 w-3 fill-current" />
                {t("assistant.directions.generateAll")}
              </button>
            ) : null}
          </div>
        ) : null}

        {message.receipt ? (
          <div className={cn(
            "mt-2 flex items-center gap-2 rounded-[10px] border border-[#dededa] bg-[#f8f8f6] text-xs text-[#686865] dark:border-border dark:bg-card dark:text-muted-foreground",
            compact ? "min-h-8 px-2.5" : "min-h-9 px-3"
          )}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current" aria-hidden>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span className="min-w-0 flex-1 truncate">{uiText(message.receipt.label)}</span>
            {(message.receipt.actions ?? []).map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onAction}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 font-medium text-[#3f3f3c] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/45 motion-reduce:transform-none motion-reduce:transition-none dark:text-foreground/90 dark:hover:bg-accent dark:focus-visible:ring-ring/50"
              >
                {action.kind === "undo" ? <RotateCcw className="h-3 w-3" /> : null}
                {action.kind === "toggle" ? <ArrowLeftRight className="h-3 w-3" /> : null}
                {uiText(action.label)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

function AssistantActivity({ label, reduceMotion }: { label: string; reduceMotion: boolean }): React.ReactElement {
  const uiText = useUiText();
  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      <div
        data-assistant-activity=""
        className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-lg bg-[#f0f0ed] px-2.5 py-1.5 text-xs font-medium text-[#686865] dark:bg-accent dark:text-muted-foreground"
      >
        <Loader2 className={cn("h-3.5 w-3.5 shrink-0", !reduceMotion && "animate-spin")} />
        <span className="min-w-0 leading-5">{uiText(label)}</span>
      </div>
    </div>
  );
}

function AssistantIntentSuggestions({
  suggestions,
  suggestionCount,
  loading,
  disabled,
  onSelect,
  onRefresh
}: {
  suggestions: string[];
  suggestionCount: AssistantIntentSuggestionCount;
  loading: boolean;
  disabled: boolean;
  onSelect?: (suggestion: string) => void;
  onRefresh?: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("assistant.suggestions")}
      data-assistant-suggestions=""
      className="w-full"
    >
      <div className="flex items-end gap-1.5" aria-live="polite">
        <div className="assistant-suggestion-list flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {loading && suggestions.length === 0 ? (
              <motion.div
                key="intent-suggestion-skeletons"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="assistant-suggestion-list flex w-full flex-col items-start gap-1.5"
                role="status"
                aria-label={t("assistant.suggestions.loadingAria")}
              >
                <span className="flex min-h-6 items-center gap-1.5 px-1 text-[11px] font-medium text-[#686865] dark:text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  {t("assistant.suggestions.loading")}
                </span>
                <span className="assistant-suggestion-list flex w-full flex-col items-start gap-1.5" aria-hidden>
                  {["w-[78%]", "w-[62%]", "w-[70%]", "w-[66%]", "w-[74%]"]
                    .slice(0, suggestionCount)
                    .map((width, index) => (
                      <span
                        key={`${width}:${index}`}
                        className={cn(
                          "h-7 animate-pulse rounded-[11px] rounded-bl-[4px] bg-[#eeeeeb] motion-reduce:animate-none dark:bg-secondary",
                          width
                        )}
                      />
                    ))}
                </span>
              </motion.div>
            ) : suggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion}
                type="button"
                disabled={disabled}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 2, scale: 0.98 }}
                transition={{ duration: 0.18, delay: Math.min(index * 0.035, 0.12), ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onSelect?.(suggestion)}
                className="assistant-suggestion max-w-full rounded-[6px] rounded-bl-[4px] bg-[#eeeeeb] px-2.5 py-1.5 text-left text-xs leading-[1.45] text-[#3f3f3c] transition-colors hover:bg-[#e4e4e0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-accent"
              >
                {suggestion}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
        {onRefresh && suggestions.length > 0 ? (
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 h-7 w-7 shrink-0 rounded-md text-[#686865] hover:bg-[#e8e8e4] hover:text-[#242422] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                  aria-label={t(loading ? "assistant.suggestions.refreshing" : "assistant.suggestions.refresh")}
                  disabled={loading || disabled}
                  onClick={onRefresh}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin motion-reduce:animate-none")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("assistant.suggestions.refresh")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </section>
  );
}

function AssistantInteractionPanel({
  state,
  disabled,
  compact,
  onSubmit,
  onDismiss,
  onRefine,
  onGenerate
}: {
  state: AiAssistantInteractionState;
  disabled: boolean;
  compact: boolean;
  onSubmit?: (values: AiAssistantInteractionValues) => void;
  onDismiss?: () => void;
  onRefine?: (value: string) => void;
  onGenerate?: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const { interaction } = state;
  const [values, setValues] = useState<AiAssistantInteractionValues>({});
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});
  const [refinement, setRefinement] = useState("");
  const canGenerateImmediately = interaction.type === "confirm"
    && Boolean(state.canGenerateImmediately && onGenerate);

  useEffect(() => {
    setValues({});
    setExpandedInputs({});
    setRefinement("");
  }, [state.id]);

  const formComplete = interaction.type === "confirm" || interaction.fields.every((field) => {
    if (!field.required) return true;
    const value = values[field.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
  });

  function updateValue(id: string, value: string | string[]): void {
    setValues((current) => ({ ...current, [id]: value }));
  }

  function setExpanded(id: string, expanded: boolean): void {
    setExpandedInputs((current) => ({ ...current, [id]: expanded }));
  }

  function submitRefinement(): void {
    const value = refinement.trim();
    if (!value || disabled) return;
    onRefine?.(value);
  }

  function submitForm(): void {
    if (disabled || !formComplete) return;
    onSubmit?.(values);
  }

  return (
    <div className={cn(
      "absolute inset-x-2 bottom-2 z-10 flex animate-in flex-col overflow-hidden rounded-[10px] border border-[#d8d8d4] bg-[#fbfbf9] shadow-[0_4px_8px_rgba(22,22,20,0.1)] fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none dark:border-border dark:bg-popover dark:shadow-none",
      compact
        ? "max-h-[min(340px,calc(100%_-_60px))]"
        : "max-h-[min(380px,calc(100%_-_68px))]"
    )}>
      <section
        aria-label={uiText(interaction.title)}
        className="flex min-h-0 flex-col"
      >
        <div className={cn("min-h-0 overflow-y-auto", compact ? "p-2.5" : "p-3")}>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold leading-5 text-[#242422] dark:text-popover-foreground">
              {uiText(interaction.title)}
            </h3>
            {interaction.description ? (
              <p className="mt-0.5 text-xs leading-[1.5] text-[#686865] dark:text-muted-foreground">
                {uiText(interaction.description)}
              </p>
            ) : null}
          </div>

          {interaction.type === "form" ? (
            <div className={cn("space-y-3", compact ? "mt-2.5" : "mt-3")}>
              {interaction.fields.map((field) => {
                const value = values[field.id];
                const supplementKey = assistantInteractionSupplementKey(field.id);
                const supplementValue = values[supplementKey];
                const selected = Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
                const supplementExpanded = Boolean(expandedInputs[supplementKey]);
                const inputExpanded = Boolean(expandedInputs[field.id]) || selected;
                return (
                  <fieldset key={field.id} className="min-w-0 space-y-1.5">
                    <legend className="flex w-full items-center gap-2 text-xs font-medium leading-5 text-[#3f3f3c] dark:text-foreground/90">
                      <span className="min-w-0 flex-1">{uiText(field.label)}</span>
                      {!field.required ? (
                        <span className="shrink-0 font-normal text-[#777772] dark:text-muted-foreground">
                          {t("assistant.interaction.optional")}
                        </span>
                      ) : null}
                    </legend>

                    {field.type === "select" ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1.5" role={field.multiple ? "group" : "radiogroup"}>
                          {(field.options ?? []).map((option) => {
                            const optionSelected = field.multiple
                              ? Array.isArray(value) && value.includes(option.value)
                              : value === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role={field.multiple ? "checkbox" : "radio"}
                                aria-checked={optionSelected}
                                disabled={disabled}
                                onClick={() => {
                                  if (!field.multiple) {
                                    updateValue(field.id, option.value);
                                    return;
                                  }
                                  const current = Array.isArray(value) ? value : [];
                                  const next = optionSelected
                                    ? current.filter((item) => item !== option.value)
                                    : [...current, option.value];
                                  updateValue(field.id, next);
                                  if (next.length === 0) {
                                    updateValue(supplementKey, "");
                                    setExpanded(supplementKey, false);
                                  }
                                }}
                                className={cn(
                                  "group inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium leading-4 transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none dark:focus-visible:ring-ring/45",
                                  optionSelected
                                    ? "border-[#747470] bg-[#3f3f3c] text-[#f4f4f1] hover:bg-[#30302e] dark:border-ring dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                                    : "border-[#dededa] bg-[#f8f8f6] text-[#4b4b47] hover:border-[#c8c8c2] hover:bg-[#f0f0ed] dark:border-border dark:bg-secondary dark:text-secondary-foreground dark:hover:border-input dark:hover:bg-accent"
                                )}
                              >
                                <span className="min-w-0 break-words">{uiText(option.label)}</span>
                                {optionSelected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                              </button>
                            );
                          })}
                        </div>

                        {selected ? (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              aria-expanded={supplementExpanded}
                              disabled={disabled}
                              onClick={() => setExpanded(supplementKey, !supplementExpanded)}
                              className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-[#686865] transition-[background-color,color] hover:bg-[#e8e8e4] hover:text-[#242422] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                            >
                              <MessageSquarePlus className="h-3.5 w-3.5" />
                              {t(supplementExpanded
                                ? "assistant.interaction.collapseSupplement"
                                : "assistant.interaction.supplement")}
                            </button>
                            {supplementExpanded ? (
                              <textarea
                                autoFocus
                                rows={2}
                                value={typeof supplementValue === "string" ? supplementValue : ""}
                                disabled={disabled}
                                aria-label={t("assistant.interaction.supplementAria", { label: field.label })}
                                placeholder={t("assistant.interaction.supplementPlaceholder")}
                                onChange={(event) => updateValue(supplementKey, event.target.value)}
                                onKeyDown={(event) => {
                                  if (!isSendEnter(event)) return;
                                  event.preventDefault();
                                  submitForm();
                                }}
                                className="mt-1 min-h-[64px] w-full resize-none rounded-lg border border-[#dededa] bg-[#f8f8f6] px-2.5 py-2 text-[13px] leading-5 text-[#242422] outline-none transition-[border-color,box-shadow] placeholder:text-[#777772] focus:border-[#747470] focus:ring-2 focus:ring-[#747470]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-secondary dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-ring dark:focus:ring-ring/20"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : inputExpanded ? (
                      <textarea
                        autoFocus={Boolean(expandedInputs[field.id]) && !selected}
                        rows={2}
                        value={typeof value === "string" ? value : ""}
                        disabled={disabled}
                        aria-required={field.required}
                        placeholder={field.placeholder ? uiText(field.placeholder) : undefined}
                        onChange={(event) => updateValue(field.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (!isSendEnter(event)) return;
                          event.preventDefault();
                          submitForm();
                        }}
                        className="min-h-[64px] w-full resize-none rounded-lg border border-[#dededa] bg-[#f8f8f6] px-2.5 py-2 text-[13px] leading-5 text-[#242422] outline-none transition-[border-color,box-shadow] placeholder:text-[#686865] focus:border-[#747470] focus:ring-2 focus:ring-[#747470]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-secondary dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-ring dark:focus:ring-ring/20"
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setExpanded(field.id, true)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#dededa] bg-[#f8f8f6] px-2.5 text-xs font-medium text-[#686865] transition-[background-color,border-color,color] hover:border-[#c8c8c2] hover:bg-[#f0f0ed] hover:text-[#242422] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/35 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-secondary dark:text-muted-foreground dark:hover:border-input dark:hover:bg-accent dark:hover:text-accent-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t("assistant.interaction.fill")}
                      </button>
                    )}
                  </fieldset>
                );
              })}
            </div>
          ) : state.confirmationPreview ? (
            <section className={cn(
              "border-t border-[#e4e4e0] dark:border-border",
              compact ? "mt-2.5 pt-2.5" : "mt-3 pt-3"
            )}>
              <p className="text-[11px] font-medium leading-4 text-[#686865] dark:text-muted-foreground">
                {uiText(state.confirmationPreview.title)}
              </p>
              <div className="mt-2 space-y-2.5">
                {state.confirmationPreview.items.map((item, index) => (
                  <div key={`${item.label ?? "content"}:${index}`} className="min-w-0">
                    {item.label ? (
                      <p className="text-[11px] leading-4 text-[#777772] dark:text-muted-foreground">
                        {uiText(item.label)}
                      </p>
                    ) : null}
                    <p className={cn(
                      "whitespace-pre-wrap break-words text-xs leading-[1.55] text-[#30302e] dark:text-popover-foreground",
                      item.label && "mt-0.5"
                    )}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {interaction.type === "confirm" && onRefine ? (
            <div className={cn(
              "border-t border-[#e4e4e0] dark:border-border",
              compact ? "mt-2.5 pt-2.5" : "mt-3 pt-3"
            )}>
              <div className="relative">
                <textarea
                  rows={2}
                  value={refinement}
                  disabled={disabled}
                  aria-label={t("assistant.interaction.refineAria")}
                  placeholder={t("assistant.interaction.refinePlaceholder")}
                  onChange={(event) => setRefinement(event.target.value)}
                  onKeyDown={(event) => {
                    if (!isSendEnter(event)) return;
                    event.preventDefault();
                    submitRefinement();
                  }}
                  className="min-h-[64px] w-full resize-none rounded-lg border border-[#dededa] bg-[#f8f8f6] px-2.5 py-2 pr-10 text-[13px] leading-5 text-[#242422] outline-none transition-[border-color,box-shadow] placeholder:text-[#777772] focus:border-[#747470] focus:ring-2 focus:ring-[#747470]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-secondary dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-ring dark:focus:ring-ring/20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || !refinement.trim()}
                  aria-label={t("assistant.interaction.refineSubmit")}
                  onClick={submitRefinement}
                  className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-md text-[#686865] transition-[background-color,color,transform] hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.96] disabled:opacity-35 motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={cn(
          "flex shrink-0 items-center justify-end gap-1.5 border-t border-[#e4e4e0] dark:border-border",
          compact ? "px-2.5 py-2" : "px-3 py-2.5"
        )}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg px-2.5 text-xs text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
            disabled={disabled}
            onClick={onDismiss}
          >
            {(interaction.cancelLabel ? uiText(interaction.cancelLabel) : undefined) ?? t(interaction.type === "confirm"
              ? "assistant.interaction.keepRefining"
              : "assistant.interaction.skip")}
          </Button>
          <Button
            type="button"
            variant={canGenerateImmediately ? "outline" : "default"}
            size="sm"
            className={cn(
              "h-8 rounded-lg px-2.5 text-xs transition-[background-color,color,transform] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
              canGenerateImmediately
                ? "border-[#d1d1cc] bg-transparent text-[#3f3f3c] hover:bg-[#eeeeeb] hover:text-[#242422] dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-accent"
                : "bg-[#30302e] text-[#f4f4f1] hover:bg-[#242422] dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
            )}
            disabled={disabled || !formComplete}
            onClick={() => onSubmit?.(values)}
          >
            {interaction.type === "confirm"
              ? (interaction.confirmLabel ? uiText(interaction.confirmLabel) : undefined) ?? t("assistant.interaction.confirm")
              : (interaction.submitLabel ? uiText(interaction.submitLabel) : undefined) ?? t("assistant.interaction.continue")}
          </Button>
          {canGenerateImmediately ? (
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-lg bg-[#30302e] px-2.5 text-xs text-[#f4f4f1] transition-[background-color,transform] duration-150 ease-out hover:-translate-y-px hover:bg-[#242422] active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
              disabled={disabled}
              onClick={onGenerate}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {t("assistant.interaction.generateNow")}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AssistantHistoryList({
  conversations,
  loading,
  currentConversationId,
  showBoardName = false,
  onSelect
}: {
  conversations: AssistantHistoryConversation[];
  loading: boolean;
  currentConversationId?: string;
  showBoardName?: boolean;
  onSelect: (conversation: AssistantHistoryConversation) => void;
}): React.ReactElement {
  const { locale, t } = useI18n();
  const uiText = useUiText();
  if (loading) {
    return (
      <div className="space-y-1 px-3 py-2" aria-busy="true" aria-label={t("assistant.history.loading")}>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="space-y-2 border-b border-[#e8e8e4] px-2 py-3 dark:border-border">
            <div className="h-3 w-2/3 animate-pulse rounded bg-[#e4e4e0] motion-reduce:animate-none dark:bg-muted" />
            <div className="h-2.5 w-full animate-pulse rounded bg-[#eeeeeb] motion-reduce:animate-none dark:bg-muted/70" />
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 pb-8 text-center">
        <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#eeeeeb] text-[#686865] dark:bg-accent dark:text-muted-foreground">
          <History className="h-4 w-4" />
        </span>
        <p className="text-[13px] font-medium text-[#30302e] dark:text-foreground">
          {t("assistant.history.emptyTitle")}
        </p>
        <p className="mt-1 max-w-[24ch] text-xs leading-5 text-[#686865] dark:text-muted-foreground">
          {t("assistant.history.emptyDescription")}
        </p>
      </div>
    );
  }

  const groups = conversations.reduce<Array<{ label: string; items: AssistantHistoryConversation[] }>>(
    (result, conversation) => {
      const label = formatHistoryDay(conversation.updatedAt, locale, t);
      const current = result.at(-1);
      if (current?.label === label) current.items.push(conversation);
      else result.push({ label, items: [conversation] });
      return result;
    },
    []
  );

  return (
    <div className="px-2 pb-3">
      {groups.map((group) => (
        <section key={group.label} aria-label={uiText(group.label)}>
          <h3 className="sticky top-0 z-10 bg-[#fbfbf9]/95 px-2 pb-1 pt-3 text-[11px] font-medium text-[#686865] backdrop-blur-sm dark:bg-background/95 dark:text-muted-foreground">
            {uiText(group.label)}
          </h3>
          <div className="divide-y divide-[#e8e8e4] dark:divide-border">
            {group.items.map((conversation) => {
              const active = conversation.id === currentConversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={cn(
                    "group flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-[#eeeeeb] focus-visible:ring-2 focus-visible:ring-[#747470]/35 motion-reduce:transition-none dark:hover:bg-accent dark:focus-visible:ring-ring/45",
                    active && "bg-[#eeeeeb] dark:bg-accent"
                  )}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(conversation)}
                >
                  <span className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c5c5c0] transition-colors dark:bg-muted-foreground/50",
                    active && "bg-[hsl(var(--ai-accent))] dark:bg-[hsl(var(--ai-accent))]"
                  )} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-[#30302e] dark:text-foreground">
                        {conversation.title}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-[#777772] dark:text-muted-foreground">
                        {formatHistoryTime(conversation.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-4 text-[#686865] dark:text-muted-foreground">
                      {conversation.preview}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-[#777772] dark:text-muted-foreground">
                        {showBoardName && conversation.boardName ? `${conversation.boardName} · ` : ""}{t("assistant.history.exchanges", { count: conversation.exchangeCount })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function formatHistoryDay(
  value: string,
  locale: "zh-CN" | "en-US",
  t: ReturnType<typeof useI18n>["t"]
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("assistant.history.earlier");
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (dayDifference === 0) return t("assistant.history.today");
  if (dayDifference === 1) return t("assistant.history.yesterday");
  return new Intl.DateTimeFormat(locale, date.getFullYear() === today.getFullYear()
    ? { month: "long", day: "numeric" }
    : { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function AiAssistant({
  appearance = "classic",
  hideComposer = false,
  hideInteraction = false,
  variant,
  dockSide = "right",
  title,
  subtitle,
  hideHeader = false,
  messages,
  value,
  placeholder,
  disabled = false,
  streaming = false,
  activityLabel,
  interaction,
  workflow,
  intentSuggestionsEnabled,
  intentSuggestionCount = 3,
  intentSuggestions = [],
  intentSuggestionsLoading = false,
  contextImages = [],
  history = [],
  historyLoading = false,
  historyScope = "board",
  currentConversationId,
  compact = false,
  composerAutoFocus = false,
  expandableComposer = false,
  canSubmitWithoutText = false,
  resizePointerHandlers,
  headerPointerHandlers,
  headerActions,
  className,
  onValueChange,
  onSubmit,
  onStop,
  onClose,
  onAttach,
  onPasteImages,
  onIntentSuggestionSelect,
  onRefreshIntentSuggestions,
  onInteractionSubmit,
  onInteractionDismiss,
  onInteractionRefine,
  onInteractionGenerate,
  onHistoryOpen,
  onHistoryScopeChange,
  onHistorySelect,
  onNewConversation,
  onApplyGeneratedPrompt
}: AiAssistantProps): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const segmentedControlId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const composerLayoutRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerMeasureRef = useRef<HTMLTextAreaElement>(null);
  const composerSyncFrameRef = useRef<number | null>(null);
  const latestComposerValueRef = useRef(value);
  const [preparingNextStep, setPreparingNextStep] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerMultiline, setComposerMultiline] = useState(() => value.includes("\n"));
  const reduceMotion = Boolean(useReducedMotion());
  const inputDisabled = disabled || Boolean(activityLabel) || Boolean(interaction);
  const canSubmit = Boolean(value.trim()) || canSubmitWithoutText;
  const streamingMessageContent = messages.find((message) => message.streaming)?.content ?? "";
  const resolvedTitle = title ?? t("assistant.title.default");
  const resolvedPlaceholder = placeholder ?? t("assistant.placeholder.default");

  const syncComposerLayout = useCallback((nextValue: string): void => {
    const textarea = composerInputRef.current;
    const measure = composerMeasureRef.current;
    if (!textarea || !measure) return;

    measure.value = nextValue;
    const shouldExpand = nextValue.includes("\n") || (measure.clientWidth > 0 && measure.scrollHeight > 32);
    setComposerMultiline((current) => current === shouldExpand ? current : shouldExpand);

    textarea.style.height = "32px";
    if (shouldExpand) {
      textarea.style.height = `${Math.min(compact ? 128 : 160, Math.max(32, textarea.scrollHeight))}px`;
    }
  }, [compact]);

  const scheduleComposerSync = useCallback((nextValue: string): void => {
    latestComposerValueRef.current = nextValue;
    if (composerSyncFrameRef.current !== null) return;
    composerSyncFrameRef.current = window.requestAnimationFrame(() => {
      composerSyncFrameRef.current = null;
      syncComposerLayout(latestComposerValueRef.current);
    });
  }, [syncComposerLayout]);

  useEffect(() => {
    setPreparingNextStep(false);
    if (!streaming || !streamingMessageContent) return;
    const timer = window.setTimeout(() => setPreparingNextStep(true), 650);
    return () => window.clearTimeout(timer);
  }, [streaming, streamingMessageContent]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let frame: number | null = null;
    const syncScroll = (): void => {
      frame = null;
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (distanceFromBottom < 160 || streaming) {
        scroller.scrollTo({
          top: scroller.scrollHeight,
          behavior: reduceMotion || streaming ? "auto" : "smooth"
        });
      }
    };
    const observer = new ResizeObserver(() => {
      if (frame === null) frame = window.requestAnimationFrame(syncScroll);
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [reduceMotion, streaming]);

  useEffect(() => {
    if (!intentSuggestionsEnabled || (!intentSuggestionsLoading && intentSuggestions.length === 0)) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [intentSuggestionCount, intentSuggestions, intentSuggestionsEnabled, intentSuggestionsLoading, reduceMotion]);

  useLayoutEffect(() => {
    latestComposerValueRef.current = value;
    if (composerSyncFrameRef.current === null) syncComposerLayout(value);
  }, [compact, expandableComposer, onAttach, syncComposerLayout, value]);

  useLayoutEffect(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    textarea.style.height = "32px";
    if (composerMultiline) {
      textarea.style.height = `${Math.min(compact ? 128 : 160, Math.max(32, textarea.scrollHeight))}px`;
    }
  }, [compact, composerMultiline]);

  useEffect(() => {
    const layout = composerLayoutRef.current;
    if (!layout || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scheduleComposerSync(latestComposerValueRef.current));
    observer.observe(layout);
    return () => observer.disconnect();
  }, [expandableComposer, onAttach, scheduleComposerSync]);

  useEffect(() => () => {
    if (composerSyncFrameRef.current !== null) window.cancelAnimationFrame(composerSyncFrameRef.current);
  }, []);

  function submit(): void {
    if (!streaming && !inputDisabled && canSubmit) onSubmit();
  }

  function submitExpandedComposer(): void {
    if (streaming) {
      onStop();
      return;
    }
    if (inputDisabled || !canSubmit) return;
    setComposerExpanded(false);
    onSubmit();
  }

  function pasteComposerImages(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    if (!onPasteImages) return;
    const files = extractClipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    onPasteImages(files);
  }

  function openHistory(): void {
    if (streaming || inputDisabled || !onHistoryOpen) return;
    onHistoryOpen();
    setView("history");
  }

  function selectHistory(conversation: AssistantHistoryConversation): void {
    onHistorySelect?.(conversation);
    setView("chat");
  }

  function startNewConversation(): void {
    onNewConversation?.();
    setView("chat");
  }

  const composerCollapsedLeftPadding = onAttach ? 38 : 6;
  const composerCollapsedRightPadding = 38 + (expandableComposer ? 36 : 0);
  const composerMaxHeight = compact ? 128 : 160;

  return (
    <>
      <section
      aria-label={resolvedTitle}
      data-assistant-appearance={appearance}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden bg-[#fbfbf9] text-[#242422] dark:bg-background dark:text-foreground",
        variant === "docked"
          ? cn(
              "h-full border-[#dededa] dark:border-border",
              dockSide === "left" ? "border-r" : "border-l"
            )
          : "h-full rounded-xl border border-[#dededa] shadow-[0_4px_8px_rgba(22,22,20,0.1)] dark:border-border dark:shadow-none",
        className
      )}
    >
      {!hideHeader ? <header
        {...headerPointerHandlers}
        className={cn(
          "z-10 flex shrink-0 select-none items-center gap-3 bg-[#fbfbf9] dark:bg-background",
          view === "history"
            ? compact ? "h-[60px] px-3.5" : "h-[68px] px-4"
            : compact ? "h-11 px-3.5" : "h-[52px] px-4",
          headerPointerHandlers && "touch-none cursor-grab active:cursor-grabbing"
        )}
      >
        {view === "history" ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                  aria-label={t("assistant.backToChat")}
                  onClick={() => setView("chat")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("assistant.backToChat")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {appearance === "fusion" && view === "chat" ? (
          <img src={companionAvatar} alt="" className="h-6 w-6 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-5">
            {view === "history" ? t("assistant.history") : resolvedTitle}
          </h2>
          {view === "history" && onHistoryScopeChange ? (
            <div className="mt-1 inline-flex h-6 rounded-md bg-[#eeeeeb] p-0.5 text-[10px] dark:bg-accent">
              <button
                type="button"
                aria-pressed={historyScope === "board"}
                onClick={() => onHistoryScopeChange("board")}
                className={cn(
                  "relative isolate rounded px-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/45",
                  historyScope === "board" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {historyScope === "board" ? <SegmentedControlIndicator layoutId={`assistant-history-${segmentedControlId}`} className="rounded bg-background shadow-sm" /> : null}
                <span className="relative z-10">{uiText("当前画板")}</span>
              </button>
              <button
                type="button"
                aria-pressed={historyScope === "all"}
                onClick={() => onHistoryScopeChange("all")}
                className={cn(
                  "relative isolate rounded px-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#747470]/45",
                  historyScope === "all" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {historyScope === "all" ? <SegmentedControlIndicator layoutId={`assistant-history-${segmentedControlId}`} className="rounded bg-background shadow-sm" /> : null}
                <span className="relative z-10">{uiText("全部画板")}</span>
              </button>
            </div>
          ) : null}
          {view === "chat" && subtitle ? <p className="truncate text-xs leading-4 text-[#686865] dark:text-muted-foreground">{subtitle}</p> : null}
        </div>
        {view === "chat" ? headerActions : null}
        {view === "chat" && onNewConversation ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                  aria-label={t("assistant.startNewConversation")}
                  disabled={streaming || inputDisabled}
                  onClick={startNewConversation}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("assistant.newConversation")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {view === "chat" && onHistoryOpen ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                  aria-label={t("assistant.viewHistory")}
                  disabled={streaming || inputDisabled}
                  onClick={openHistory}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("assistant.history")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {view === "history" && onNewConversation ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                  aria-label={t("assistant.startNewChat")}
                  onClick={startNewConversation}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("assistant.newConversation")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
            aria-label={appearance === "fusion" ? t("assistant.collapse") : t("assistant.close")}
            onClick={onClose}
          >
            {appearance === "fusion" ? (
              variant === "docked"
                ? (dockSide === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)
                : <ChevronDown className="h-4 w-4" />
            ) : <X className="h-4 w-4" />}
          </Button>
        ) : null}
      </header> : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="wait">
          {view === "history" ? (
            <motion.div
              key="assistant-history"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 14 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 overflow-y-auto border-t border-[#eeeeeb] dark:border-border"
            >
              <AssistantHistoryList
                conversations={history}
                loading={historyLoading}
                currentConversationId={currentConversationId}
                showBoardName={historyScope === "all"}
                onSelect={selectHistory}
              />
            </motion.div>
          ) : (
            <motion.div
              key="assistant-chat"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex min-h-0 flex-col"
            >
              <div className="relative min-h-0 flex-1">
                <div
                  ref={scrollRef}
                  role="log"
                  aria-live="polite"
                  className={cn("absolute inset-0 overflow-y-auto", compact ? "px-3 py-3" : "px-4 py-5")}
                >
                  <div ref={contentRef} className={cn("flex min-h-full flex-col", compact ? "gap-3" : "gap-4")}>
                    {workflow ? <AssistantWorkflow workflow={workflow} /> : null}
                    {(() => {
                      const lastAssistantMessage = [...messages].reverse().find((item) => item.role === "assistant");
                      const latestErrorId = lastAssistantMessage?.tone === "error" ? lastAssistantMessage.id : undefined;
                      return messages.map((message) => (
                        activityLabel && message.streaming && !message.content
                          ? null
                          : <AssistantMessage
                              key={message.id}
                              message={message}
                              reduceMotion={reduceMotion}
                              compact={compact}
                              isLatestError={message.id === latestErrorId}
                              greetingSuggestions={appearance === "fusion" && messages.length === 1 && message.id === "fusion-greeting" && intentSuggestionsEnabled ? (
                                <AssistantIntentSuggestions suggestions={intentSuggestions.slice(0, intentSuggestionCount)} suggestionCount={intentSuggestionCount}
                                  loading={intentSuggestionsLoading} disabled={inputDisabled || streaming} onSelect={onIntentSuggestionSelect} onRefresh={onRefreshIntentSuggestions} />
                              ) : undefined}
                              onApplyGeneratedPrompt={onApplyGeneratedPrompt}
                            />
                      ));
                    })()}
                    {appearance === "fusion" && !(messages.length === 1 && messages[0].id === "fusion-greeting") && intentSuggestionsEnabled && (intentSuggestionsLoading || intentSuggestions.length > 0) ? (
                      <AssistantIntentSuggestions suggestions={intentSuggestions.slice(0, intentSuggestionCount)}
                        suggestionCount={intentSuggestionCount} loading={intentSuggestionsLoading}
                        disabled={inputDisabled || streaming} onSelect={onIntentSuggestionSelect} onRefresh={onRefreshIntentSuggestions} />
                    ) : null}
                    {!interaction && (activityLabel || (streaming && preparingNextStep)) ? (
                      <AssistantActivity label={activityLabel ?? t("assistant.activity.default")} reduceMotion={reduceMotion} />
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={cn("shrink-0 bg-[#fbfbf9] dark:bg-background", compact ? "p-3" : "p-4", hideComposer && "hidden")}>
                {appearance !== "fusion" && intentSuggestionsEnabled && (intentSuggestionsLoading || intentSuggestions.length > 0) ? (
                  <div className={cn(compact ? "mb-2" : "mb-3")}>
                    <AssistantIntentSuggestions
                      suggestions={intentSuggestions.slice(0, intentSuggestionCount)}
                      suggestionCount={intentSuggestionCount}
                      loading={intentSuggestionsLoading}
                      disabled={inputDisabled || streaming}
                      onSelect={onIntentSuggestionSelect}
                      onRefresh={onRefreshIntentSuggestions}
                    />
                  </div>
                ) : null}
                {!hideComposer ? <div className={cn(
                  "border border-[#dededa] bg-[#f8f8f6] transition-[border-color,box-shadow] duration-150 focus-within:border-[#747470] focus-within:ring-2 focus-within:ring-[#747470]/20 dark:border-border dark:bg-card dark:focus-within:border-ring dark:focus-within:ring-ring/20",
                  compact ? "rounded-[10px] p-1.5" : "rounded-xl p-2"
                )}>
                  {contextImages.length > 0 ? <AssistantImageContext images={contextImages} /> : null}
                  <div
                    ref={composerLayoutRef}
                    data-composer-mode={composerMultiline ? "multiline" : "single-line"}
                    data-composer-max-height={composerMaxHeight}
                    className="relative overflow-hidden"
                  >
                    <textarea
                      ref={composerMeasureRef}
                      aria-hidden
                      readOnly
                      tabIndex={-1}
                      defaultValue={value}
                      rows={1}
                      className={cn(
                        "pointer-events-none invisible absolute inset-x-0 top-0 h-8 w-full resize-none overflow-hidden py-1",
                        compact ? "text-[13px] leading-5" : "text-sm leading-6"
                      )}
                      style={{
                        paddingLeft: composerCollapsedLeftPadding,
                        paddingRight: composerCollapsedRightPadding
                      }}
                    />
                    <textarea
                      ref={composerInputRef}
                      autoFocus={composerAutoFocus}
                      value={value}
                      rows={1}
                      disabled={inputDisabled}
                      aria-label={t("assistant.composer.aria")}
                      onChange={(event) => {
                        scheduleComposerSync(event.target.value);
                        onValueChange(event.target.value);
                      }}
                      onPaste={pasteComposerImages}
                      onKeyDown={(event) => {
                        if (!isSendEnter(event)) return;
                        event.preventDefault();
                        submit();
                      }}
                      className={cn(
                        "relative z-[1] block h-8 min-h-8 w-full resize-none bg-transparent py-1 text-[#242422] outline-none [transition-property:height,margin,padding] disabled:cursor-not-allowed disabled:opacity-60 dark:text-foreground",
                        reduceMotion ? "duration-0" : "duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
                        compact ? "text-[13px] leading-5" : "text-sm leading-6",
                        composerMultiline ? "mb-9 whitespace-pre-wrap overflow-y-auto" : "mb-0 whitespace-nowrap overflow-hidden text-ellipsis"
                      )}
                      style={{
                        height: 32,
                        maxHeight: composerMaxHeight,
                        paddingLeft: composerMultiline ? 6 : composerCollapsedLeftPadding,
                        paddingRight: composerMultiline ? 6 : composerCollapsedRightPadding
                      }}
                    />
                    {!value ? (
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute top-0 z-[2] flex h-8 items-center truncate py-1 text-[#686865] dark:text-muted-foreground",
                          compact ? "text-[13px] leading-5" : "text-sm leading-6"
                        )}
                        style={{
                          left: composerCollapsedLeftPadding,
                          right: composerCollapsedRightPadding
                        }}
                      >
                        {resolvedPlaceholder}
                      </span>
                    ) : null}
                    {onAttach ? (
                      <div className="absolute bottom-0 left-0 z-10 h-8 w-8">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                                aria-label={t("assistant.composer.attach")}
                                disabled={inputDisabled}
                                onClick={onAttach}
                              >
                                <Paperclip className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("assistant.composer.attach")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : null}
                    {expandableComposer ? (
                      <div className="absolute bottom-0 right-9 z-10 h-8 w-8">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                                aria-label={t("assistant.composer.expand")}
                                aria-haspopup="dialog"
                                aria-expanded={composerExpanded}
                                disabled={inputDisabled}
                                onClick={() => setComposerExpanded(true)}
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("assistant.composer.expandTooltip")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : null}
                    <div className="absolute bottom-0 right-0 z-10 h-8 w-8">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              className="group h-8 w-8 rounded-full bg-[#30302e] text-[#f4f4f1] transition-[background-color,transform] duration-150 ease-out hover:scale-[1.04] hover:bg-[#242422] active:scale-[0.94] focus-visible:ring-[#747470]/50 motion-reduce:transform-none motion-reduce:transition-none dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90 dark:focus-visible:ring-ring/50"
                              aria-label={t(streaming ? "assistant.composer.stop" : "assistant.composer.send")}
                              disabled={streaming ? false : inputDisabled || !canSubmit}
                              onClick={streaming ? onStop : submit}
                            >
                              {streaming
                                ? <Square className="h-3 w-3 fill-current" />
                                : <Send className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-px group-hover:-translate-y-px motion-reduce:transform-none motion-reduce:transition-none" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {t(streaming ? "assistant.composer.stop" : "assistant.composer.send")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div> : null}
              </div>

               {interaction && !hideInteraction ? (
                 <AssistantInteractionPanel
                   state={interaction}
                   disabled={disabled}
                   compact={compact}
                  onSubmit={onInteractionSubmit}
                  onDismiss={onInteractionDismiss}
                  onRefine={onInteractionRefine}
                  onGenerate={onInteractionGenerate}
                />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {variant === "floating" && resizePointerHandlers ? resizeHandles.map((handle) => (
        <button
          key={handle.corner}
          type="button"
          data-assistant-resize-handle=""
          data-corner={handle.corner}
          aria-label={t(handle.labelKey)}
          title={t(handle.labelKey)}
          onPointerDown={(event) => resizePointerHandlers.onPointerDown(handle.corner, event)}
          onPointerMove={resizePointerHandlers.onPointerMove}
          onPointerUp={resizePointerHandlers.onPointerUp}
          onPointerCancel={resizePointerHandlers.onPointerCancel}
          className={cn(
            "group absolute z-20 flex h-7 w-7 touch-none border-0 bg-transparent p-0 text-[#92928c] opacity-60 outline-none transition-[color,opacity] duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:text-[#3f3f3c] hover:opacity-100 focus-visible:text-[#3f3f3c] focus-visible:opacity-100 active:text-[#242422] motion-reduce:transition-none dark:text-muted-foreground dark:hover:text-foreground/90 dark:focus-visible:text-foreground/90 dark:active:text-foreground",
            handle.positionClass
          )}
        >
          <span
            className="absolute h-5 w-5 scale-75 rounded-md bg-[#e8e8e4]/0 transition-[background-color,transform] duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:bg-[#e8e8e4]/90 group-focus-visible:scale-100 group-focus-visible:bg-[#e8e8e4]/90 group-active:scale-90 group-active:bg-[#dededa] motion-reduce:transition-none dark:group-hover:bg-accent dark:group-focus-visible:bg-accent dark:group-active:bg-input"
            aria-hidden
          />
          <span
            className={cn(
              "relative h-3 w-3 border-current transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.18] group-focus-visible:scale-[1.18] group-active:scale-100 motion-reduce:transition-none",
              handle.indicatorClass
            )}
            aria-hidden
          />
        </button>
      )) : null}
      </section>

      {expandableComposer ? (
        <Dialog open={composerExpanded} onOpenChange={setComposerExpanded}>
          <DialogContent className="flex h-[min(680px,calc(100dvh-48px))] w-[min(760px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0">
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
              <DialogTitle>{t("assistant.composer.dialogTitle")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("assistant.composer.dialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 p-5">
              <textarea
                autoFocus
                value={value}
                disabled={inputDisabled}
                aria-label={t("assistant.composer.dialogAria")}
                placeholder={resolvedPlaceholder}
                onChange={(event) => onValueChange(event.target.value)}
                onPaste={pasteComposerImages}
                onKeyDown={(event) => {
                  if (!isSendEnter(event)) return;
                  event.preventDefault();
                  submitExpandedComposer();
                }}
                className="h-full min-h-56 w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
              {onAttach ? (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground"
                        aria-label={t("assistant.composer.attach")}
                        disabled={inputDisabled}
                        onClick={onAttach}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t("assistant.composer.attach")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setComposerExpanded(false)}>
                  {t("assistant.composer.done")}
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={streaming ? false : inputDisabled || !canSubmit}
                  onClick={submitExpandedComposer}
                >
                  {streaming ? <Square className="h-3 w-3 fill-current" /> : <Send className="h-4 w-4" />}
                  {t(streaming ? "assistant.composer.stopShort" : "assistant.composer.sendShort")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export default AiAssistant;
