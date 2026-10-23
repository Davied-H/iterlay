import "./conversation.css";
import "./conversation-theme.css";
import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowUp, Maximize2, Paperclip, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { isSendEnter } from "@/lib/send-on-enter";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";

/** Slot-based surface also accommodates the board's rich editor and workbench controls. */
export function AssistantComposerFrame({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div {...props} className={`create-chat-composer ${className}`}>
      {children}
    </div>
  );
}
export function AssistantComposerToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={`create-chat-composer-toolbar ${className}`}>
      {children}
    </div>
  );
}
interface Props {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming?: boolean;
  disabled?: boolean;
  canSubmitWithoutText?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  expandable?: boolean;
  onAttach?: () => void;
  onPasteImages?: (files: File[]) => void;
}
export function AssistantComposer(props: Props): React.ReactElement {
  const { t } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(160, Math.max(52, input.scrollHeight))}px`;
  }, [props.value]);
  function submit(): void {
    if (
      !props.disabled &&
      !props.streaming &&
      (props.value.trim() || props.canSubmitWithoutText)
    ) {
      props.onSubmit();
      setExpanded(false);
    }
  }
  function editor(large: boolean): React.ReactElement {
    return (
      <textarea
        ref={large ? undefined : inputRef}
        value={props.value}
        rows={large ? 12 : 1}
        aria-label={t(
          large ? "assistant.composer.dialogAria" : "assistant.composer.aria",
        )}
        placeholder={props.placeholder ?? t("assistant.placeholder.default")}
        autoFocus={large || props.autoFocus}
        disabled={props.disabled}
        onChange={(event) => props.onValueChange(event.target.value)}
        onPaste={(event) => {
          const files = extractClipboardImageFiles(event.clipboardData);
          if (files.length && props.onPasteImages) {
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
    );
  }
  function toolbar(): React.ReactElement {
    return (
      <AssistantComposerToolbar>
        {props.onAttach ? (
          <button
            type="button"
            className="create-chat-icon-button"
            aria-label={t("assistant.composer.attach")}
            disabled={props.disabled || props.streaming}
            onClick={props.onAttach}
          >
            <Paperclip size={17} />
          </button>
        ) : null}
        {props.expandable && !expanded ? (
          <button
            type="button"
            className="create-chat-icon-button"
            aria-label={t("assistant.composer.expand")}
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="create-chat-send assistant-chat-send"
          aria-label={t(
            props.streaming
              ? "assistant.composer.stop"
              : "assistant.composer.send",
          )}
          disabled={
            !props.streaming &&
            (props.disabled ||
              (!props.value.trim() && !props.canSubmitWithoutText))
          }
          onClick={props.streaming ? props.onStop : submit}
        >
          {props.streaming ? <Square size={15} /> : <ArrowUp size={19} />}
        </button>
      </AssistantComposerToolbar>
    );
  }
  return (
    <>
      <AssistantComposerFrame>
        {editor(false)}
        {toolbar()}
      </AssistantComposerFrame>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          aria-label={t("assistant.composer.dialogAria")}
          className="create-chat assistant-chat-editor-dialog"
          onCloseAutoFocus={() => inputRef.current?.focus()}
        >
          <DialogHeader>
            <DialogTitle>{t("assistant.composer.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("assistant.composer.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <AssistantComposerFrame>
            {editor(true)}
            {toolbar()}
          </AssistantComposerFrame>
        </DialogContent>
      </Dialog>
    </>
  );
}
