import { AssistantHistoryList } from "./AssistantHistoryList";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  History,
  Pencil,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { AssistantMessageFrame, AssistantResponse } from "./AssistantMessage";
import { useI18n, useUiText } from "@/i18n";
import type { AssistantHistoryConversation } from "@/lib/assistant-history";
import type { AiAssistantMessage, AiAssistantProps } from "./assistant-types";
import {
  AssistantMessageAttachments,
  AssistantProcessDetails,
} from "./AssistantMessageDetails";
import "./conversation.css";
import "./assistant-decision-cards.css";
import "./conversation-theme.css";
import { AssistantComposer } from "./AssistantComposer";
import {
  AssistantImageContext,
  AssistantWorkflow,
  AssistantComicDramaPlan,
} from "./AssistantCards";
import { AssistantInteraction } from "./AssistantInteraction";
import { AssistantPromptReview } from "./AssistantPromptReview";
import "./assistant-chat.css";

interface Props extends AiAssistantProps {
  beforeMessages?: ReactNode;
  afterMessages?: ReactNode;
  workflowContent?: ReactNode;
  interactionContent?: ReactNode;
  renderMessageExtra?: (message: AiAssistantMessage) => ReactNode;
}

/** Shared conversation surface for every assistant entry point. */
export function AssistantChat(props: Props): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const reduceMotion = Boolean(useReducedMotion());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  const title = props.title ?? t("assistant.title.default");
  const busy = Boolean(
    props.streaming || props.disabled || props.activityLabel,
  );
  const empty = props.messages.every((message) =>
    /^(fusion-greeting|assistant-greeting)/.test(message.id),
  );
  const greeting = empty ? props.messages[0] : undefined;

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );
  const copy = useCallback(
    async (id: string, content: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        setCopyFailed(false);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
      } catch {
        setCopyFailed(true);
      }
    },
    [],
  );
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && followRef.current)
      scroller.scrollTop = scroller.scrollHeight;
  }, [props.messages, props.interaction, props.activityLabel, historyOpen]);
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followRef.current && scrollerRef.current)
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [empty]);
  useEffect(() => {
    if (!historyOpen) return;
    const previous = document.activeElement;
    historyCloseRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setHistoryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [historyOpen]);

  function startNew(): void {
    if (busy) return;
    followRef.current = true;
    setShowLatest(false);
    setHistoryOpen(false);
    props.onNewConversation?.();
  }
  function openHistory(): void {
    if (busy) return;
    props.onHistoryOpen?.();
    setHistoryOpen(true);
  }
  function restore(conversation: AssistantHistoryConversation): void {
    followRef.current = true;
    setShowLatest(false);
    props.onHistorySelect?.(conversation);
    setHistoryOpen(false);
  }
  const suggestions = props.intentSuggestions ?? [];
  const suggestionContent =
    props.intentSuggestionsEnabled &&
    (suggestions.length || props.intentSuggestionsLoading) ? (
      <div
        className="assistant-chat-suggestions"
        data-assistant-suggestions=""
        aria-label={t("assistant.suggestions")}
      >
        {suggestions.map((suggestion, index) => (
          <button
            type="button"
            key={suggestion}
            className="assistant-chat-suggestion-bubble"
            style={{ "--suggestion-delay": `${Math.min(index, 5) * 120}ms` } as CSSProperties}
            disabled={busy}
            onClick={() => props.onIntentSuggestionSelect?.(suggestion)}
          >
            {suggestion}
            <ArrowUp size={13} aria-hidden="true" />
          </button>
        ))}
        {props.intentSuggestionsLoading ? (
          <span role="status">{t("assistant.suggestions.loading")}</span>
        ) : props.onRefreshIntentSuggestions ? (
          <button
            type="button"
            className="assistant-chat-refresh"
            disabled={busy}
            aria-label={t("assistant.suggestions.refresh")}
            onClick={props.onRefreshIntentSuggestions}
          >
            {uiText("换一批")}
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <section
      className={`create-chat assistant-chat ${props.className ?? ""}`}
      data-assistant-appearance="shared"
      aria-label={title}
    >
      {!props.hideHeader ? (
        <header
          className="create-chat-header assistant-chat-header"
          data-assistant-drag-handle={props.headerPointerHandlers ? "" : undefined}
          {...props.headerPointerHandlers}
          inert={historyOpen}
        >
          <div className="assistant-chat-heading">
            <h2>{title}</h2>
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          <div className="create-chat-header-actions">
            {props.headerActions}
            {props.onHistoryOpen ? (
              <button
                type="button"
                className="create-chat-icon-button"
                aria-label={t("assistant.viewHistory")}
                title={t("assistant.history")}
                disabled={busy}
                onClick={openHistory}
              >
                <History size={17} />
              </button>
            ) : null}
            {props.onNewConversation ? (
              <button
                type="button"
                className="create-chat-icon-button"
                aria-label={t("assistant.startNewConversation")}
                title={t("assistant.newConversation")}
                disabled={busy}
                onClick={startNew}
              >
                <Pencil size={17} />
              </button>
            ) : null}
            {props.onClose ? (
              <button
                type="button"
                className="create-chat-icon-button"
                aria-label={t("assistant.close")}
                onClick={props.onClose}
              >
                <X size={17} />
              </button>
            ) : null}
          </div>
        </header>
      ) : null}
      <div className="assistant-chat-body" inert={historyOpen}>
        <div
          className="assistant-chat-scroll"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          ref={scrollerRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            followRef.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 96;
            setShowLatest(!followRef.current);
          }}
        >
          <div
            className={`create-chat-thread assistant-chat-thread ${empty ? "assistant-chat-thread-empty" : ""}`}
            ref={threadRef}
          >
            {props.beforeMessages}
            {empty ? (
              <div className="assistant-chat-welcome">
                <h3>{title}</h3>
                {greeting?.content ? <p>{greeting.content}</p> : null}
              </div>
            ) : (
              props.messages
                .filter(
                  (message) =>
                    !/^(fusion-greeting|assistant-greeting)/.test(message.id),
                )
                .map((message) => (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    activityLabel={message.streaming ? props.activityLabel : undefined}
                    copied={copiedId === message.id}
                    onCopy={copy}
                    onApply={props.onApplyGeneratedPrompt}
                    extra={
                      props.renderMessageExtra?.(message) ??
                      (message.comicDramaPlan ? (
                        <AssistantComicDramaPlan
                          value={message.comicDramaPlan}
                        />
                      ) : null)
                    }
                  />
                ))
            )}
            {props.workflowContent ??
              (props.workflow ? (
                <AssistantWorkflow workflow={props.workflow} />
              ) : null)}
            {props.afterMessages}
            {(props.activityLabel || props.streaming) && !props.messages.some((message) => message.streaming) ? (
              <div
                className="create-chat-thinking"
                data-assistant-activity=""
                role="status"
              >
                <span className="create-chat-thinking-dot" />
                <span>
                  {props.activityLabel
                    ? uiText(props.activityLabel)
                    : t("assistant.thinking")}
                </span>
              </div>
            ) : null}
            {!props.hideInteraction &&
            (props.interactionContent || props.interaction) ? (
              <div className="assistant-chat-interaction">
                {props.interactionContent ?? (
                  <AssistantInteraction
                    state={props.interaction!}
                    disabled={Boolean(props.disabled || props.activityLabel)}
                    onSubmit={props.onInteractionSubmit}
                    onDismiss={props.onInteractionDismiss}
                    onRefine={props.onInteractionRefine}
                    onGenerate={props.onInteractionGenerate}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
        {showLatest ? (
          <button
            type="button"
            className="create-chat-jump assistant-chat-jump"
            aria-label={uiText("回到最新消息")}
            onClick={() => {
              followRef.current = true;
              setShowLatest(false);
              scrollerRef.current?.scrollTo({
                top: scrollerRef.current.scrollHeight,
                behavior: reduceMotion ? "auto" : "smooth",
              });
            }}
          >
            <ArrowDown size={16} />
          </button>
        ) : null}
        {copyFailed ? (
          <p role="status" className="assistant-chat-copy-error">
            {uiText("复制失败，请选择文字后手动复制。")}
          </p>
        ) : null}
      </div>
      {!props.hideComposer ? (
        <div
          className="create-chat-compose-area assistant-chat-compose-area"
          inert={historyOpen}
        >
          {props.contextImages?.length ? (
            <AssistantImageContext images={props.contextImages} />
          ) : null}
          {suggestionContent}
          <AssistantComposer
            value={props.value}
            onValueChange={props.onValueChange}
            onSubmit={props.onSubmit}
            onStop={props.onStop}
            streaming={props.streaming}
            disabled={Boolean(
              props.disabled || props.activityLabel || props.interaction,
            )}
            canSubmitWithoutText={props.canSubmitWithoutText}
            placeholder={props.placeholder}
            autoFocus={props.composerAutoFocus}
            expandable={props.expandableComposer}
            onAttach={props.onAttach}
            onPasteImages={props.onPasteImages}
          />
        </div>
      ) : null}
      {historyOpen ? (
        <aside
          className="assistant-chat-history"
          role="dialog"
          aria-label={t("assistant.history")}
        >
          <header>
            <button
              ref={historyCloseRef}
              type="button"
              className="create-chat-icon-button"
              aria-label={t("assistant.backToChat")}
              onClick={() => setHistoryOpen(false)}
            >
              <ArrowLeft size={17} />
            </button>
            <h3>{t("assistant.history")}</h3>
            {props.onNewConversation ? (
              <button
                type="button"
                className="create-chat-icon-button"
                aria-label={t("assistant.startNewConversation")}
                onClick={startNew}
              >
                <Pencil size={17} />
              </button>
            ) : null}
          </header>
          {props.onHistoryScopeChange ? (
            <div className="assistant-chat-history-scope">
              {(["board", "all"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={(props.historyScope ?? "board") === scope}
                  onClick={() => props.onHistoryScopeChange?.(scope)}
                >
                  {uiText(scope === "board" ? "当前画板" : "全部画板")}
                </button>
              ))}
            </div>
          ) : null}
          <AssistantHistoryList
            conversations={props.history}
            loading={props.historyLoading}
            currentId={props.currentConversationId}
            showBoardName={props.historyScope === "all"}
            onSelect={restore}
          />
        </aside>
      ) : null}
      {props.variant === "floating" && props.resizePointerHandlers
        ? (["nw", "ne", "sw", "se"] as const).map((corner) => (
            <button
              key={corner}
              type="button"
              className={`assistant-chat-resize assistant-chat-resize-${corner}`}
              data-assistant-resize-handle=""
              data-corner={corner}
              aria-label={t(`assistant.resize.${corner}`)}
              onPointerDown={(event) =>
                props.resizePointerHandlers?.onPointerDown(corner, event)
              }
              onPointerMove={props.resizePointerHandlers?.onPointerMove}
              onPointerUp={props.resizePointerHandlers?.onPointerUp}
              onPointerCancel={props.resizePointerHandlers?.onPointerCancel}
            />
          ))
        : null}
    </section>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  activityLabel,
  copied,
  onCopy,
  onApply,
  extra,
}: {
  message: AiAssistantMessage;
  activityLabel?: string;
  copied: boolean;
  onCopy: (id: string, content: string) => Promise<void>;
  onApply?: (prompt: string, message?: AiAssistantMessage) => void;
  extra?: ReactNode;
}): React.ReactElement | null {
  const { t } = useI18n();
  const uiText = useUiText();
  const user = message.role === "user";
  // Streaming rounds may contain an empty placeholder before any visible output arrives.
  if (!message.streaming && !message.content.trim() && !message.reasoningSummary?.trim() &&
      !message.attachments?.length && !message.toolCalls?.length &&
      !message.generatedPrompt?.trim() && !message.directions?.length &&
      !message.receipt && !extra) return null;
  return (
    <AssistantMessageFrame role={message.role}>
      {message.attachments?.length ? (
        <AssistantMessageAttachments attachments={message.attachments} />
      ) : null}
      {!user ? <AssistantProcessDetails reasoningSummary={message.reasoningSummary} streaming={message.streaming && !message.content.trim()} calls={message.toolCalls} statusLabel={activityLabel} /> : null}
      {message.tone === "error" ? (
        <div className="create-chat-error" role="alert">
          <div>
            <p>{message.content}</p>
            <div className="create-chat-error-actions">
              {message.receipt?.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onAction}
                >
                  {uiText(action.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : user ? (
        <p data-assistant-message-body="">{message.content}</p>
      ) : message.content.trim() ? (
        <AssistantResponse
          content={message.content}
          streaming={message.streaming}
        />
      ) : null}
      {extra}
      {!user && !message.streaming && message.generatedPrompt?.trim() ? (
        <AssistantPromptReview
          messageId={message.id}
          prompt={message.generatedPrompt}
          onApply={onApply ? (prompt) => message.mediaType === "video" ? onApply(prompt, message) : onApply(prompt) : undefined}
        />
      ) : null}
      {message.directions?.length ? (
        <div
          className="assistant-chat-directions"
          aria-label={t("assistant.directions")}
        >
          {message.directions.map((direction) => (
            <section key={direction.id} className="ct-card">
              <h3>{direction.title}</h3>
              {direction.description ? <p>{direction.description}</p> : null}
              <div className="ct-card-actions">
                <button
                  type="button"
                  className="ct-button ct-button-quiet"
                  aria-label={t("assistant.directions.apply", {
                    title: direction.title,
                  })}
                  onClick={direction.onApply}
                >
                  {t("assistant.promptReview.apply")}
                </button>
                <button
                  type="button"
                  className="ct-button ct-button-primary"
                  aria-label={t("assistant.directions.generate", {
                    title: direction.title,
                  })}
                  onClick={direction.onGenerate}
                >
                  <Play size={13} />
                  {uiText("生成")}
                </button>
              </div>
            </section>
          ))}
          {message.onGenerateAllDirections && message.directions.length > 1 ? (
            <button
              type="button"
              className="ct-button ct-button-primary"
              onClick={message.onGenerateAllDirections}
            >
              {t("assistant.directions.generateAll")}
            </button>
          ) : null}
        </div>
      ) : null}
      {message.receipt && message.tone !== "error" ? (
        <div className="assistant-chat-receipt">
          <Check size={13} />
          <span>{uiText(message.receipt.label)}</span>
          {message.receipt.actions?.map((action) => (
            <button key={action.label} type="button" onClick={action.onAction}>
              {action.kind === "undo" ? <RotateCcw size={12} /> : null}
              {uiText(action.label)}
            </button>
          ))}
        </div>
      ) : null}
      {message.content && !message.streaming ? (
        <div className="create-chat-message-actions">
          <button
            type="button"
            className="create-chat-icon-button"
            aria-label={uiText(user ? "复制消息" : "复制回复")}
            title={uiText(copied ? "已复制" : "复制")}
            onClick={() => void onCopy(message.id, message.content)}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      ) : null}
    </AssistantMessageFrame>
  );
});
