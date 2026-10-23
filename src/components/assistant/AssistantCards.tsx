import "./assistant-details.css";
import { Streamdown } from "streamdown";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  Circle,
  CircleCheck,
  Image,
  Loader2,
  Maximize2,
  Pencil,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { cn } from "@/lib/utils";
import { useI18n, useUiText } from "@/i18n";
import type {
  AiAssistantContextImage,
  AiAssistantWorkflow,
  AiAssistantComicDramaPlan,
} from "./assistant-types";
export function AssistantImageContext({
  images,
}: {
  images: AiAssistantContextImage[];
}): React.ReactElement {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{
    src: string;
    alt: string;
    sourceRect: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const editTargetCount = images.filter(
    (image) => image.role === "edit-target",
  ).length;
  const referenceCount = images.filter(
    (image) => image.role === "reference",
  ).length;
  const summary = [
    editTargetCount > 0
      ? t("assistant.imageContext.editCount", { count: editTargetCount })
      : "",
    referenceCount > 0
      ? t("assistant.imageContext.referenceCount", { count: referenceCount })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const collapsedImages = images.slice(0, 3);
  const collapsedOverflow = Math.max(0, images.length - collapsedImages.length);

  function openPreview(
    event: React.MouseEvent<HTMLButtonElement>,
    image: AiAssistantContextImage,
  ): void {
    const { left, top, width, height } =
      event.currentTarget.getBoundingClientRect();
    setPreview({
      src: image.src,
      alt: image.alt,
      sourceRect: { left, top, width, height },
    });
  }

  return (
    <>
      <section
        className="mb-1 border-b border-[var(--chat-border)] px-0.5 pb-1.5 "
        aria-label={t("assistant.imageContext")}
      >
        <div className="group/context-toggle flex h-8 w-full min-w-0 items-center gap-2 rounded-xl px-1 transition-colors duration-150 hover:bg-[var(--chat-subtle)] motion-reduce:transition-none ">
          {!expanded ? (
            <span className="flex shrink-0 -space-x-1">
              {collapsedImages.map((image) => {
                const isEditTarget = image.role === "edit-target";
                return (
                  <button
                    type="button"
                    key={`${image.role}:${image.id}`}
                    onClick={(event) => openPreview(event, image)}
                    aria-label={t("assistant.imageContext.preview", {
                      name: image.alt,
                    })}
                    title={t("assistant.imageContext.preview", {
                      name: image.alt,
                    })}
                    className={cn(
                      "relative h-6 w-6 overflow-hidden rounded-lg bg-[var(--chat-subtle)] ring-1 ring-[var(--chat-border)] transition-[transform,filter] duration-150 hover:z-30 hover:scale-110 hover:brightness-105 focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-border)] motion-reduce:transform-none motion-reduce:transition-none  ",
                      isEditTarget &&
                        "z-10 ring-1 ring-[hsl(var(--ai-accent))]",
                    )}
                  >
                    <img
                      src={image.src}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
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
                  className="relative z-20 flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--chat-subtle)] text-[9px] font-semibold text-[var(--chat-secondary)] ring-1 ring-[var(--chat-border)] transition-colors hover:bg-[var(--chat-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-border)]    "
                >
                  +{collapsedOverflow}
                </button>
              ) : null}
            </span>
          ) : (
            <Image
              className="h-3.5 w-3.5 shrink-0 text-[var(--chat-secondary)] "
              aria-hidden
            />
          )}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={t(
              expanded
                ? "assistant.imageContext.collapse"
                : "assistant.imageContext.expand",
            )}
            onClick={() => setExpanded((current) => !current)}
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-border)] "
          >
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--chat-secondary)] ">
              {summary}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-[var(--chat-secondary)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover/context-toggle:text-[var(--chat-secondary)] motion-reduce:transition-none  dark:group-hover/context-toggle:text-foreground",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="expanded-image-context"
              initial={
                reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -2 }
              }
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={
                reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -2 }
              }
              transition={{
                duration: reduceMotion ? 0.1 : 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="overflow-hidden"
            >
              <div className="flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5 pt-1">
                {images.map((image) => {
                  const isEditTarget = image.role === "edit-target";
                  const roleLabel = t(
                    isEditTarget
                      ? "assistant.imageContext.editRole"
                      : "assistant.imageContext.referenceRole",
                  );
                  return (
                    <figure
                      key={`${image.role}:${image.id}`}
                      className={cn(
                        "group/context-image relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[var(--chat-subtle)] ",
                        isEditTarget
                          ? "ring-1 ring-[hsl(var(--ai-accent))]"
                          : "ring-1 ring-inset ring-[var(--chat-border)] ",
                      )}
                      aria-label={`${roleLabel}：${image.alt}`}
                      title={`${roleLabel}：${image.alt}`}
                    >
                      <button
                        type="button"
                        onClick={(event) => openPreview(event, image)}
                        aria-label={t("assistant.imageContext.preview", {
                          name: image.alt,
                        })}
                        className="absolute inset-0 cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/85"
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
                        <span
                          className={cn(
                            "pointer-events-none absolute inset-x-0 bottom-0 flex h-3.5 items-center justify-center text-[9px] font-semibold leading-none text-white",
                            isEditTarget
                              ? "bg-[hsl(var(--ai-accent)/0.94)]"
                              : "bg-[var(--chat-subtle)]/78",
                          )}
                        >
                          {roleLabel}
                        </span>
                      </button>
                      {image.onRemove ? (
                        <button
                          type="button"
                          onClick={image.onRemove}
                          aria-label={t("assistant.imageContext.remove", {
                            name: image.alt,
                          })}
                          className="absolute right-0.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--chat-subtle)]/80 text-white opacity-0 transition-[opacity,background-color,transform] duration-150 hover:bg-[var(--chat-subtle)] active:scale-90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/context-image:opacity-100 motion-reduce:transform-none motion-reduce:transition-none"
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

export function AssistantWorkflow({
  workflow,
}: {
  workflow: AiAssistantWorkflow;
}): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const reduceMotion = Boolean(useReducedMotion());
  const currentStepId =
    workflow.steps.find((step) => step.status === "active")?.id ??
    [...workflow.steps].reverse().find((step) => step.status === "complete")
      ?.id;
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() =>
    currentStepId ? new Set([currentStepId]) : new Set(),
  );
  const previousCurrentStepRef = useRef(currentStepId);

  useEffect(() => {
    if (!currentStepId || previousCurrentStepRef.current === currentStepId)
      return;
    previousCurrentStepRef.current = currentStepId;
    setExpandedStepIds(new Set([currentStepId]));
  }, [currentStepId]);

  return (
    <section
      className="border-b border-[var(--chat-border)] pb-3 "
      aria-label={workflow.label ?? t("assistant.workflow")}
    >
      {workflow.label ? (
        <p className="mb-2 text-[11px] font-medium text-[var(--chat-secondary)] ">
          {workflow.label}
        </p>
      ) : null}
      <ol>
        {workflow.steps.map((step, index) => {
          const nextStep = workflow.steps[index + 1];
          const connectorComplete =
            step.status === "complete" && nextStep?.status !== "pending";
          const hasResult = Boolean(step.result) || Boolean(step.streaming);
          const expanded = hasResult && expandedStepIds.has(step.id);
          return (
            <li
              key={step.id}
              className="relative flex min-w-0 items-start gap-2.5 pb-2.5 last:pb-0"
            >
              {nextStep ? (
                <span
                  className={cn(
                    "absolute left-[7px] top-[18px] h-[calc(100%-12px)] w-px origin-top bg-[var(--chat-subtle)] ",
                    connectorComplete && "bg-emerald-500/70 ",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"
                aria-hidden
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={step.status}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.72 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      reduceMotion ? undefined : { opacity: 0, scale: 0.84 }
                    }
                    transition={{
                      duration: reduceMotion ? 0 : 0.18,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="relative flex h-4 w-4 items-center justify-center"
                  >
                    {step.status === "active" ? (
                      <>
                        <motion.span
                          className="absolute inset-[-3px] rounded-full bg-[hsl(var(--ai-accent)/0.14)]"
                          animate={
                            reduceMotion
                              ? undefined
                              : {
                                  opacity: [0.35, 0.9, 0.35],
                                  scale: [0.82, 1.08, 0.82],
                                }
                          }
                          transition={{
                            duration: 1.6,
                            ease: "easeInOut",
                            repeat: Infinity,
                          }}
                        />
                        <Loader2
                          className={cn(
                            "relative h-3.5 w-3.5 text-[hsl(var(--ai-accent))]",
                            !reduceMotion && "animate-spin",
                          )}
                        />
                      </>
                    ) : step.status === "complete" ? (
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-600 " />
                    ) : step.status === "error" ? (
                      <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-[var(--chat-secondary)] " />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              <motion.div
                layout={!reduceMotion}
                className={cn(
                  "min-w-0 flex-1 rounded-xl px-2 py-1 transition-colors duration-200 motion-reduce:transition-none",
                  step.status === "active" && "bg-[hsl(var(--ai-muted))]",
                )}
              >
                <button
                  type="button"
                  disabled={!hasResult}
                  aria-expanded={hasResult ? expanded : undefined}
                  aria-controls={
                    hasResult
                      ? `assistant-workflow-result-${step.id}`
                      : undefined
                  }
                  onClick={() => {
                    setExpandedStepIds((current) => {
                      const next = new Set(current);
                      if (next.has(step.id)) next.delete(step.id);
                      else next.add(step.id);
                      return next;
                    });
                  }}
                  className="flex w-full min-w-0 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-border)] disabled:cursor-default "
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-xs font-medium leading-5 transition-colors duration-200 motion-reduce:transition-none",
                        step.status === "pending"
                          ? "text-[var(--chat-secondary)] "
                          : step.status === "active"
                            ? "text-[hsl(var(--ai-accent))]"
                            : "text-[var(--chat-secondary)] ",
                      )}
                    >
                      {step.label}
                    </span>
                    <AnimatePresence initial={false} mode="popLayout">
                      {step.detail ? (
                        <motion.span
                          key={step.detail}
                          initial={reduceMotion ? false : { opacity: 0, y: 2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? undefined : { opacity: 0 }}
                          transition={{
                            duration: reduceMotion ? 0 : 0.18,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="block text-[11px] leading-4 text-[var(--chat-secondary)] "
                        >
                          {step.detail}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                  {hasResult ? (
                    <ChevronDown
                      className={cn(
                        "mt-1 h-3.5 w-3.5 shrink-0 text-[var(--chat-secondary)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ",
                        expanded && "rotate-180",
                      )}
                    />
                  ) : null}
                </button>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      id={`assistant-workflow-result-${step.id}`}
                      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={
                        reduceMotion ? undefined : { opacity: 0, height: 0 }
                      }
                      transition={{
                        duration: reduceMotion ? 0 : 0.22,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <div
                        className="mt-2 border-t border-[var(--chat-border)] pt-2 text-[11px] leading-[1.55] text-[var(--chat-secondary)]  "
                        aria-live={step.streaming ? "polite" : undefined}
                      >
                        {step.streaming && !step.result ? (
                          <span className="flex items-center gap-1.5 text-[var(--chat-secondary)] ">
                            <Loader2
                              className={cn(
                                "h-3 w-3",
                                !reduceMotion && "animate-spin",
                              )}
                            />
                            {t("assistant.workflow.streaming")}
                          </span>
                        ) : (
                          <Streamdown
                            mode={step.streaming ? "streaming" : "static"}
                            animated={
                              reduceMotion
                                ? false
                                : {
                                    animation: "fadeIn",
                                    duration: 100,
                                    sep: "char",
                                    stagger: 6,
                                  }
                            }
                            isAnimating={Boolean(
                              step.streaming && !reduceMotion,
                            )}
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
        <p
          role="alert"
          className="mt-3 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-4 text-destructive"
        >
          {workflow.notice}
        </p>
      ) : null}

      {workflow.actions?.length ? (
        <div
          className={cn(
            "mt-3 grid gap-2",
            workflow.actions.length > 1 && "grid-cols-2",
          )}
        >
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
                  transition={{
                    duration: reduceMotion ? 0 : 0.15,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex items-center gap-1.5"
                >
                  {action.loading ? (
                    <Loader2
                      className={cn(
                        "h-3.5 w-3.5",
                        !reduceMotion && "animate-spin",
                      )}
                    />
                  ) : null}
                  {uiText(action.label)}
                </motion.span>
              </AnimatePresence>
              {action.loading ? (
                <motion.span
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[hsl(var(--ai-accent))]"
                  initial={reduceMotion ? { scaleX: 1 } : { scaleX: 0.08 }}
                  animate={
                    reduceMotion
                      ? { scaleX: 1 }
                      : { scaleX: [0.08, 0.72, 0.96] }
                  }
                  transition={{
                    duration: 1.8,
                    times: [0, 0.68, 1],
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AssistantComicDramaPlan({
  value,
}: {
  value: AiAssistantComicDramaPlan;
}): React.ReactElement {
  const uiText = useUiText();

  const { plan } = value;
  const additions = plan.preview.additions;
  const characterDrafts =
    plan.action?.kind === "propose-characters"
      ? plan.action.characterDrafts
      : [];
  const [selectedDraftIds, setSelectedDraftIds] = useState(() =>
    characterDrafts.filter((draft) => draft.required).map((draft) => draft.id),
  );
  const steps = ["设定", "角色", "片段", "首尾帧", "视频", "合并"];
  const currentStep =
    plan.action?.kind === "create-setting" ||
    plan.action?.kind === "update-setting"
      ? 0
      : plan.action?.kind === "propose-characters" ||
          plan.action?.kind === "create-characters" ||
          plan.action?.kind === "update-character"
        ? 1
        : plan.action?.kind === "create-segment" ||
            plan.action?.kind === "update-segment"
          ? 2
          : 3;
  const blocked =
    value.status === "applying" ||
    value.status === "applied" ||
    value.status === "conflict";
  const updatedNodeCount = plan.preview.updates?.nodes ?? 0;
  const primaryLabel =
    plan.action?.kind === "update-setting"
      ? "保存设定新版本"
      : plan.action?.kind === "update-character"
        ? "保存角色新版本"
        : plan.action?.kind === "update-segment"
          ? "保存片段新版本"
          : characterDrafts.length
            ? "添加所选角色卡 · " + selectedDraftIds.length
            : "添加 " + additions.nodes + " 个节点到画板";
  return (
    <section
      className="ct-card assistant-comic-plan"
      aria-label={uiText("节点计划预览")}
    >
      <div className="border-b border-[var(--chat-border)] px-3 py-2 ">
        <p className="text-xs font-semibold text-[var(--chat-secondary)] ">
          {plan.preview.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-[var(--chat-secondary)] ">
          {value.contextLabel}
        </p>
      </div>
      <div
        className="border-b border-[var(--chat-border)] px-3 py-2 "
        aria-label={uiText("漫剧制作步骤")}
      >
        <ol className="comic-plan-steps">
          {steps.map((step, index) => (
            <li
              key={step}
              className="comic-plan-step"
              data-complete={index < currentStep || undefined}
              aria-current={index === currentStep ? "step" : undefined}
            >
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {uiText("当前：")}
          {steps[currentStep]} {uiText("· 下一步：")}
          {steps[Math.min(currentStep + 1, steps.length - 1)]}
        </p>
      </div>
      {characterDrafts.length ? (
        <div
          className="grid gap-1.5 border-b border-[var(--chat-border)] px-3 py-2 "
          aria-label={uiText("角色阵容方案")}
        >
          {characterDrafts.map((draft) => (
            <label
              key={draft.id}
              className="flex items-start gap-2 rounded border border-border px-2 py-1.5 text-[11px]"
            >
              <input
                type="checkbox"
                disabled={blocked}
                checked={selectedDraftIds.includes(draft.id)}
                onChange={(event) =>
                  setSelectedDraftIds((current) =>
                    event.target.checked
                      ? [...current, draft.id]
                      : current.filter((id) => id !== draft.id),
                  )
                }
              />
              <span className="min-w-0">
                <b>
                  {draft.name}
                  {draft.required ? uiText(" · 必需") : ""}
                </b>
                <small className="mt-0.5 block break-words text-muted-foreground">
                  {draft.role}
                </small>
                <small className="mt-0.5 block break-words text-muted-foreground">
                  {draft.profile}
                </small>
                <small className="mt-0.5 block break-words text-muted-foreground">
                  {uiText("外观锚点：")}
                  {draft.appearanceAnchors.join(" · ")}
                </small>
                <small className="mt-0.5 block break-words text-muted-foreground">
                  {draft.visualDescription} {uiText("· 落板后逐个生成形象")}
                </small>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={blocked}
                className="ml-auto h-6 shrink-0 px-1.5 text-[10px]"
                onClick={(event) => {
                  event.preventDefault();
                  value.onApply([draft.id]);
                }}
              >
                {uiText("单独添加")}
              </Button>
            </label>
          ))}
        </div>
      ) : null}
      {plan.preview.details?.length ? (
        <dl
          className="grid gap-1.5 border-b border-[var(--chat-border)] px-3 py-2.5 text-[11px] "
          aria-label={uiText("文本版本预览")}
        >
          {plan.preview.details.map((detail) => (
            <div
              key={detail.label}
              className="grid grid-cols-[68px_minmax(0,1fr)] gap-2"
            >
              <dt className="font-medium text-muted-foreground">
                {detail.label}
              </dt>
              <dd className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words text-foreground">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="grid gap-2 px-3 py-2.5 text-[11px] leading-4">
        <div>
          <dt className="font-semibold">
            {updatedNodeCount ? uiText("将更新画板") : uiText("将添加到画板")}
          </dt>
          <dd className="mt-0.5 text-[var(--chat-secondary)] ">
            {updatedNodeCount
              ? uiText(
                  "更新 {{ui:0}} 个节点 · {{ui:1}} 个新增节点 · {{ui:2}} 条连接 · {{ui:3}} 个分组",
                  [
                    updatedNodeCount,
                    additions.nodes,
                    additions.connections,
                    additions.groups,
                  ],
                )
              : uiText("{{ui:0}} 个节点 · {{ui:1}} 条连接 · {{ui:2}} 个分组", [
                  additions.nodes,
                  additions.connections,
                  additions.groups,
                ])}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{uiText("影响")}</dt>
          <dd className="mt-0.5 break-words text-[var(--chat-secondary)] ">
            {plan.preview.impact}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{uiText("费用")}</dt>
          <dd className="mt-0.5 break-words text-[var(--chat-secondary)] ">
            {plan.preview.cost}
            {plan.preview.costItems?.length ? (
              <ul className="mt-1 space-y-0.5">
                {plan.preview.costItems.map((item) => (
                  <li key={item.stage}>
                    {item.stage === "character"
                      ? uiText("角色图片费用")
                      : item.stage === "first-frame"
                        ? uiText("首帧图片费用")
                        : item.stage === "last-frame"
                          ? uiText("尾帧图片费用")
                          : uiText("视频费用")}{" "}
                    ·{" "}
                    {item.authoritative
                      ? uiText("权威报价")
                      : uiText("生成前报价")}
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
        </div>
        {value.readiness ? (
          <div>
            <dt className="font-semibold">{uiText("首尾帧 readiness")}</dt>
            <dd className="mt-0.5 break-words text-[var(--chat-secondary)] ">
              {value.readiness}
            </dd>
          </div>
        ) : null}
      </dl>
      {value.status === "conflict" ? (
        <p
          className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
          role="alert"
        >
          {uiText("预览后画板内容发生了变化。请基于最新内容重新预览后再应用。")}
        </p>
      ) : null}
      {value.status === "error" ? (
        <p
          className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
          role="alert"
        >
          {value.error || uiText("添加失败，未添加任何节点。")}
        </p>
      ) : null}
      {value.status === "applied" ? (
        <p
          className="border-t border-emerald-600/20 bg-emerald-600/5 px-3 py-2 text-[11px] text-emerald-700 "
          role="status"
        >
          {updatedNodeCount
            ? uiText("文本新版本已保存，未自动推进阶段或调用媒体模型。")
            : characterDrafts.length
              ? uiText(
                  "角色卡及完整设定已添加。下一步请在画板中逐个点击“生成形象”并采用满意版本。",
                )
              : uiText("节点已添加到普通画板，未调用媒体模型。")}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-1.5 border-t border-[var(--chat-border)] px-2 py-2 ">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={value.onRefine}
        >
          {value.status === "conflict"
            ? uiText("保留到输入框")
            : uiText("继续修改")}
        </Button>
        {value.status === "conflict" || value.status === "error" ? (
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={value.onRetry}
          >
            {uiText("重新预览")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={
              blocked ||
              (characterDrafts.length > 0 && selectedDraftIds.length === 0)
            }
            onClick={() =>
              value.onApply(
                characterDrafts.length ? selectedDraftIds : undefined,
              )
            }
          >
            {value.status === "applying" ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                {updatedNodeCount ? uiText("正在保存…") : uiText("正在添加…")}
              </>
            ) : value.status === "applied" ? (
              uiText("已应用")
            ) : (
              primaryLabel
            )}
          </Button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {value.status === "applied"
          ? updatedNodeCount
            ? uiText("已更新 {{ui:0}} 个节点", [updatedNodeCount])
            : uiText("已添加 {{ui:0}} 个节点到画板", [additions.nodes])
          : ""}
      </span>
    </section>
  );
}
