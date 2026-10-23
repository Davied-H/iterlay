import {
  AssistantComposerFrame,
  AssistantComposerToolbar,
} from "../assistant/AssistantComposer";
import { useUiText } from "@/i18n";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type HTMLAttributes,
} from "react";
import { ArrowUp, MessageSquare, Square, X } from "lucide-react";
import type {
  AiAssistantContextImage,
  AiAssistantResizeHandlers,
} from "@/components/assistant/AiAssistant";
import { ImageZoomLightbox } from "./asset/ImageZoomLightbox";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { extractCanvasClipboardItems } from "@/components/canvas/canvas-clipboard";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import { isSendEnter } from "@/lib/send-on-enter";
import { ASSISTANT_WIDTHS, useAssistantWidth } from "@/lib/assistant-width";
import "./prompt-fusion.css";
import "@/components/assistant/conversation-theme.css";

interface DockResizePointerHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

interface Props {
  assistantEnabled?: boolean;
  panelRef?: RefObject<HTMLDivElement | null>;
  panelStyle?: CSSProperties;
  dockSide?: "left" | "right" | null;
  collapsed?: boolean;
  dragging?: boolean;
  resizePointerHandlers?: AiAssistantResizeHandlers;
  dockResizePointerHandlers?: DockResizePointerHandlers;
  headerPointerHandlers?: Pick<
    HTMLAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
  rightRailOpen?: boolean;
  open: boolean;
  busy: boolean;
  inputDisabled: boolean;
  assistant: ReactNode;
  value: string;
  directValue: string;
  getDirectValue?: () => string;
  latestPrompt?: string;
  contextImages: AiAssistantContextImage[];
  controls: ReactNode;
  directEditor: ReactNode;
  directAction: ReactNode;
  extra?: ReactNode;
  confirmation?: ReactNode;
  confirmationId?: string;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  onDirectValueChange: (value: string) => void;
  onPromptContextChange: (value: string | null) => void;
  onSubmit: () => void;
  onStop: () => void;
  onPasteImages: (files: File[]) => void;
  onPasteCanvasReferences: (images: GeneratedImage[]) => void;
}

export function PromptFusionDock(props: Props): React.ReactElement {
  const uiText = useUiText();

  const width = useAssistantWidth();
  const assistantEnabled = props.assistantEnabled ?? true;
  const mode = assistantEnabled ? "chat" : "generate";
  const [dirty, setDirty] = useState(false);
  const [contextPrompt, setContextPrompt] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiAssistantContextImage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const localDockRef = useRef<HTMLDivElement>(null);
  const dockRef = props.panelRef ?? localDockRef;
  const previousHeight = useRef<number | null>(null);
  const previousDragging = useRef(Boolean(props.dragging));
  const composerRef = useRef<HTMLDivElement>(null);
  const replacementRef = useRef<HTMLDivElement>(null);
  const composerHeight = useRef<number | null>(null);
  const composerAnimation = useRef<Animation | null>(null);
  const restoreComposerFocus = useRef(false);
  const hasConfirmation = assistantEnabled && Boolean(props.confirmation);
  const previousConfirmation = useRef(hasConfirmation);
  const conversationOpen =
    assistantEnabled && (props.open || Boolean(props.dockSide));
  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const from = composerHeight.current;
    composerAnimation.current?.cancel();
    const height = composer.getBoundingClientRect().height;
    composerHeight.current = height;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (from !== null && from !== height && composer.animate && !reduced) {
      composerAnimation.current = composer.animate(
        [{ height: `${from}px` }, { height: `${height}px` }],
        {
          duration: hasConfirmation ? 280 : 220,
          easing: "cubic-bezier(.22,1,.36,1)",
        },
      );
    }
    const entered = previousConfirmation.current !== hasConfirmation;
    if (entered) {
      const layer = composer.querySelector<HTMLElement>(
        hasConfirmation
          ? ".prompt-fusion-replacement"
          : ".prompt-fusion-original",
      );
      if (!reduced)
        layer?.animate?.(
          [
            {
              opacity: 0,
              transform: `translateY(${hasConfirmation ? 8 : 4}px)`,
            },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: hasConfirmation ? 220 : 160,
            easing: "cubic-bezier(.22,1,.36,1)",
          },
        );
      if (
        hasConfirmation &&
        (dockRef.current?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        restoreComposerFocus.current = true;
        replacementRef.current
          ?.querySelector<HTMLElement>("[tabindex='-1'], input:not(:disabled), textarea:not(:disabled), button:not(:disabled)")
          ?.focus({ preventScroll: true });
      } else if (!hasConfirmation && restoreComposerFocus.current) {
        inputRef.current?.focus({ preventScroll: true });
        restoreComposerFocus.current = false;
      }
    }
    previousConfirmation.current = hasConfirmation;
    return () => {
      // Layout-effect cleanup can see the newly committed children. Only sample
      // a running animation; otherwise retain the previous surface's height.
      if (composerAnimation.current?.playState === "running") {
        composerHeight.current = composer.getBoundingClientRect().height;
      }
      composerAnimation.current?.cancel();
    };
  }, [hasConfirmation, props.confirmationId, dockRef]);
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (composerAnimation.current?.playState !== "running") {
        composerHeight.current = composer.getBoundingClientRect().height;
      }
    });
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);
  const { open, dockSide, collapsed, dragging, onOpenChange } = props;
  useEffect(() => {
    if (!open || dockSide || collapsed || dragging) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element) || dockRef.current?.contains(target))
        return;
      // Portaled menus and dialogs remain part of the dock interaction.
      if (
        target.closest(
          '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      previousHeight.current =
        dockRef.current?.getBoundingClientRect().height ??
        previousHeight.current;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, dockSide, collapsed, dragging, onOpenChange, dockRef]);
  const submit = (): void => {
    if (
      !assistantEnabled ||
      props.busy ||
      props.inputDisabled ||
      !props.value.trim()
    )
      return;
    if (!conversationOpen) {
      previousHeight.current =
        dockRef.current?.getBoundingClientRect().height ??
        previousHeight.current;
      props.onOpenChange(true);
    }
    props.onSubmit();
  };
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const height = dock.getBoundingClientRect().height;
    const from = previousHeight.current;
    previousHeight.current = height;
    const wasDragging = previousDragging.current;
    previousDragging.current = Boolean(props.dragging);
    if (
      props.dragging ||
      wasDragging ||
      props.dockSide ||
      from === null ||
      from === height ||
      !dock.animate ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animation = dock.animate(
      [{ height: `${from}px` }, { height: `${height}px` }],
      { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    return () => {
      if (animation.playState === "running")
        previousHeight.current = dock.getBoundingClientRect().height;
      animation.cancel();
    };
  }, [props.open, mode, props.dockSide, props.dragging, dockRef]);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "56px";
    inputRef.current.style.height = `${Math.min(128, inputRef.current.scrollHeight)}px`;
  }, [props.value, conversationOpen]);
  const nudge = (): void => setDirty(true);
  const resizePointerHandlers = props.resizePointerHandlers;
  return (
    <div
      ref={dockRef}
      className="prompt-fusion nodrag nopan nowheel"
      style={
        {
          "--assistant-width": `${ASSISTANT_WIDTHS[width]}px`,
          ...props.panelStyle,
        } as CSSProperties
      }
      onPointerMove={props.headerPointerHandlers?.onPointerMove}
      onPointerUp={props.headerPointerHandlers?.onPointerUp}
      onPointerCancel={props.headerPointerHandlers?.onPointerCancel}
      data-assistant-dock-side={props.dockSide ?? "floating"}
      data-assistant-dock-collapsed={props.collapsed || undefined}
      data-assistant-dragging={props.dragging ? "" : undefined}
      inert={props.collapsed}
      aria-hidden={props.collapsed || undefined}
      data-assistant-width={width}
      data-edit-dock=""
      data-right-rail-open={props.rightRailOpen || undefined}
      data-fusion-mode={mode}
      data-assistant-enabled={assistantEnabled}
      data-fusion-expanded={conversationOpen}
      data-tour="prompt-card"
      aria-label={uiText("融合创作助手")}
    >
      {!props.dockSide && (mode === "chat" || conversationOpen) ? (
        <>
          <button
            type="button"
            className="prompt-fusion-expand-handle"
            aria-label={uiText(
              conversationOpen ? "收起创作助手" : "展开创作助手",
            )}
            title={uiText(conversationOpen ? "收起创作助手" : "展开创作助手")}
            aria-expanded={conversationOpen}
            data-expanded={conversationOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              previousHeight.current =
                dockRef.current?.getBoundingClientRect().height ??
                previousHeight.current;
              props.onOpenChange(!conversationOpen);
            }}
          >
            <svg
              className="prompt-fusion-expand-arrow"
              viewBox="0 0 64 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M 8 12 L 28 5.5 Q 32 4 36 5.5 L 56 12"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </button>
        </>
      ) : null}
      {assistantEnabled ? (
        <div className="prompt-fusion-conversation" hidden={!conversationOpen}>
          {props.assistant}
        </div>
      ) : null}
      {!conversationOpen && mode === "chat" ? (
        <div
          className="prompt-fusion-collapsed"
          data-assistant-drag-handle=""
          onPointerDown={props.headerPointerHandlers?.onPointerDown}
        >
          <MessageSquare size={17} aria-hidden="true" />
          <span className="prompt-fusion-collapsed-label">
            {uiText("创作助手")}
          </span>
          {props.busy ? (
            <span className="prompt-fusion-collapsed-status text-muted-foreground">
              {uiText("正在处理")}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="prompt-fusion-composer"
        data-confirming={hasConfirmation || undefined}
      >
        <div ref={composerRef} className="prompt-fusion-composer-swap">
          {hasConfirmation ? (
            <div
              ref={replacementRef}
              className="prompt-fusion-replacement"
              onFocusCapture={() => {
                restoreComposerFocus.current = true;
              }}
            >
              {props.confirmation}
            </div>
          ) : null}
          <div
            className="prompt-fusion-original"
            hidden={hasConfirmation}
            inert={hasConfirmation}
            aria-hidden={hasConfirmation || undefined}
          >
            <AssistantComposerFrame className="prompt-fusion-surface">
              <div className="prompt-fusion-extra">{props.extra}</div>
              <div className="prompt-fusion-context">
                {props.contextImages.map((image) => (
                  <div key={image.id} className="prompt-fusion-image">
                    <button
                      type="button"
                      onClick={() => setPreview(image)}
                      aria-label={uiText("查看 {{ui:0}}", [image.alt])}
                    >
                      <img src={image.src} alt={image.alt} />
                    </button>
                    {image.role !== "edit-target" ? (
                      <span>
                        <strong>{image.alt}</strong>
                        <small>{uiText("参考图")}</small>
                      </span>
                    ) : null}
                    {image.onRemove ? (
                      <button
                        type="button"
                        onClick={image.onRemove}
                        disabled={props.busy}
                        aria-label={uiText("移除 {{ui:0}}", [image.alt])}
                      >
                        <X />
                      </button>
                    ) : null}
                  </div>
                ))}
                {mode === "chat" && contextPrompt ? (
                  <span
                    className="prompt-fusion-context-chip"
                    title={contextPrompt}
                  >
                    {uiText("当前提示词")}
                    <button
                      type="button"
                      disabled={props.busy}
                      aria-label={uiText("移除提示词上下文")}
                      onClick={() => {
                        setContextPrompt(null);
                        props.onPromptContextChange(null);
                      }}
                    >
                      <X />
                    </button>
                  </span>
                ) : null}
              </div>
              {mode === "chat" ? (
                <textarea
                  ref={inputRef}
                  value={props.value}
                  rows={2}
                  aria-label={uiText("对话规划输入")}
                  placeholder={uiText("说说你的想法，或告诉我哪里需要调整…")}
                  disabled={props.inputDisabled}
                  onChange={(event) => props.onValueChange(event.target.value)}
                  onPaste={(event) => {
                    const canvasItems = extractCanvasClipboardItems(
                      event.clipboardData,
                    );
                    if (canvasItems?.length) {
                      event.preventDefault();
                      props.onPasteCanvasReferences(
                        canvasItems.map((item) => item.image),
                      );
                      return;
                    }
                    const files = extractClipboardImageFiles(
                      event.clipboardData,
                    );
                    if (files.length) {
                      event.preventDefault();
                      props.onPasteImages(files);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (isSendEnter(event)) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              ) : (
                <div
                  className="prompt-fusion-direct-editor"
                  onInputCapture={nudge}
                >
                  {props.directEditor}
                </div>
              )}
              <AssistantComposerToolbar className="prompt-fusion-toolbar">
                <fieldset
                  disabled={props.busy}
                  className="prompt-fusion-controls"
                >
                  {props.controls}
                </fieldset>
                <div className="prompt-fusion-action">
                  {mode === "chat" ? (
                    <button
                      type="button"
                      className="prompt-fusion-send"
                      aria-label={props.busy ? uiText("停止") : uiText("发送")}
                      disabled={
                        !props.busy &&
                        (props.inputDisabled || !props.value.trim())
                      }
                      onClick={props.busy ? props.onStop : submit}
                    >
                      <span className="prompt-fusion-send-label">
                        {props.busy ? uiText("停止") : uiText("发送")}
                      </span>
                      {props.busy ? <Square /> : <ArrowUp />}
                    </button>
                  ) : (
                    props.directAction
                  )}
                </div>
              </AssistantComposerToolbar>
              {assistantEnabled &&
              mode === "generate" &&
              dirty &&
              props.latestPrompt &&
              props.latestPrompt !== props.directValue ? (
                <button
                  type="button"
                  className="prompt-fusion-update"
                  onClick={() => {
                    props.onDirectValueChange(props.latestPrompt!);
                    setDirty(false);
                  }}
                >
                  {uiText("使用 AI 最新提示词（替换当前草稿）")}
                </button>
              ) : null}
            </AssistantComposerFrame>
          </div>
        </div>
      </div>
      {props.open && !props.dockSide && resizePointerHandlers
        ? (["nw", "ne", "sw", "se"] as const).map((corner) => (
            <button
              key={corner}
              type="button"
              data-assistant-resize-handle=""
              data-corner={corner}
              aria-label={uiText("调整助手大小")}
              title={uiText("调整助手大小")}
              onPointerDown={(event) =>
                resizePointerHandlers.onPointerDown(corner, event)
              }
              onPointerMove={resizePointerHandlers.onPointerMove}
              onPointerUp={resizePointerHandlers.onPointerUp}
              onPointerCancel={resizePointerHandlers.onPointerCancel}
              className={`prompt-fusion-resize-handle prompt-fusion-resize-${corner}`}
            />
          ))
        : null}
      {conversationOpen && props.dockSide && props.dockResizePointerHandlers ? (
        <button
          type="button"
          data-assistant-dock-resize-handle=""
          aria-label={uiText("调整助手侧栏宽度")}
          title={uiText("调整助手侧栏宽度")}
          onPointerDown={props.dockResizePointerHandlers.onPointerDown}
          onPointerMove={props.dockResizePointerHandlers.onPointerMove}
          onPointerUp={props.dockResizePointerHandlers.onPointerUp}
          onPointerCancel={props.dockResizePointerHandlers.onPointerCancel}
          onKeyDown={props.dockResizePointerHandlers.onKeyDown}
          className={`prompt-fusion-dock-resize-handle prompt-fusion-dock-resize-${props.dockSide}`}
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
      {preview ? (
        <ImageZoomLightbox
          src={preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
