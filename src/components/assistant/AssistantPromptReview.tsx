import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useI18n, useUiText } from "@/i18n";
import {
  hasStructuredPromptFields,
  parseStructuredPromptLines,
} from "@/lib/structured-prompt";

export function AssistantPromptReview({
  messageId,
  prompt,
  onApply,
}: {
  messageId: string;
  prompt: string;
  onApply?: (prompt: string) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const uiText = useUiText();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const contentId = `assistant-prompt-review-${messageId}`;
  const fields = hasStructuredPromptFields(prompt)
    ? parseStructuredPromptLines(prompt).filter(
        (line) => line.label.trim() || line.content.trim(),
      )
    : [];
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  return (
    <section
      className="ct-plan-archive assistant-chat-prompt"
      aria-label={t("assistant.promptReview")}
    >
      <button
        type="button"
        className="assistant-chat-prompt-toggle"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={t(
          open
            ? "assistant.promptReview.collapse"
            : "assistant.promptReview.expand",
        )}
        onClick={() => setOpen(!open)}
      >
        <span>{t("assistant.promptReview")}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div id={contentId} className="assistant-chat-prompt-content">
          {fields.length ? (
            <dl aria-label={t("assistant.promptReview.structured")}>
              {fields.map((line, index) => (
                <div key={index}>
                  {line.separator ? <dt>{line.label.trim()}</dt> : null}
                  <dd>{line.content.trim()}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{prompt}</p>
          )}
          <div className="ct-card-actions">
            <button
              type="button"
              className="ct-button ct-button-quiet"
              aria-label={t(
                copied
                  ? "assistant.promptReview.copied"
                  : "assistant.promptReview.copy",
              )}
              onClick={() => void copy()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {t("assistant.promptReview.copy")}
            </button>
            {onApply ? (
              <button
                type="button"
                className="ct-button ct-button-primary"
                aria-label={t("assistant.promptReview.apply")}
                onClick={() => onApply(prompt)}
              >
                {t("assistant.promptReview.apply")}
              </button>
            ) : null}
          </div>
          {failed ? (
            <p role="status">{uiText("复制失败，请选择文字后手动复制。")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
