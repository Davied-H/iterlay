import { useUiLocale, useUiText } from "@/i18n";
import "./prompt-mode-switch.css";
import type { KeyboardEvent } from "react";

/** A shared selection surface slides between the two input modes. */
export function PromptModeSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const uiText = useUiText();
  const locale = useUiLocale();
  function changeMode(next: boolean) {
    if (next !== enabled) onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home" ? true : event.key === "End" ? false : !enabled;
    changeMode(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(
        `[data-mode="${next ? "ai" : "direct"}"]`,
      )
      ?.focus();
  }
  return (
    <div
      className="prompt-mode-switch"
      role="radiogroup"
      aria-label={uiText("输入模式")}
      data-locale={locale}
      data-active={enabled ? "ai" : "direct"}
    >
      <span className="prompt-mode-indicator" aria-hidden="true" />
      <button
        type="button"
        role="radio"
        data-mode="ai"
        aria-checked={enabled}
        aria-label="AI"
        title={uiText("AI 对话模式")}
        tabIndex={enabled ? 0 : -1}
        onClick={() => changeMode(true)}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m10 3 2.2 5.8L18 11l-5.8 2.2L10 19l-2.2-5.8L2 11l5.8-2.2L10 3Z" />
          <path d="m19 3 .9 2.1L22 6l-2.1.9L19 9l-.9-2.1L16 6l2.1-.9L19 3Z" />
          <path d="M19 15v6m-3-3h6" />
        </svg>
        <span>AI</span>
      </button>
      <button
        type="button"
        role="radio"
        data-mode="direct"
        aria-checked={!enabled}
        aria-label={uiText("普通")}
        title={uiText("普通")}
        tabIndex={enabled ? -1 : 0}
        onClick={() => changeMode(false)}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m14.5 4.5 5 5M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
          <path d="M12 20h8" />
        </svg>
        <span>{uiText("普通")}</span>
      </button>
    </div>
  );
}
