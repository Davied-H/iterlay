import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ChevronUp, Pencil, Play, Sparkles } from "lucide-react";
import type { AiAssistantInteractionState } from "@/components/assistant/AiAssistant";
import { useI18n } from "@/i18n";
import { isSendEnter } from "@/lib/send-on-enter";

interface Props {
  state: AiAssistantInteractionState;
  disabled: boolean;
  onApply: () => void;
  onGenerate: () => void;
  onDismiss: () => void;
  onRefine: (value: string) => void;
}

/** Mounted by interaction ID so each proposal owns its refinement draft. */
export function FusionPromptConfirmation({ state, disabled, onApply, onGenerate, onDismiss, onRefine }: Props): React.ReactElement | null {
  const { t } = useI18n();
  const [refinement, setRefinement] = useState("");
  const [editing, setEditing] = useState(false);
  const refinementId = useId();
  const refinementRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (editing) refinementRef.current?.focus({ preventScroll: true });
  }, [editing]);
  const submitted = useRef(false);
  if (state.interaction.type !== "confirm") return null;
  const interaction = state.interaction;
  const run = (action: () => void): void => {
    if (disabled || submitted.current) return;
    submitted.current = true;
    try {
      action();
    } finally {
      // Accepted actions remove the proposal. A no-op or failed action must
      // not leave a still-visible confirmation permanently locked.
      queueMicrotask(() => { submitted.current = false; });
    }
  };
  const refine = (): void => {
    const value = refinement.trim();
    if (editing && value) run(() => onRefine(value));
  };
  return <section className="fusion-confirmation" aria-label={interaction.title}>
    <div className="fusion-confirmation-scroll">
      <header className="fusion-confirmation-heading" tabIndex={-1}>
        <Sparkles aria-hidden="true" />
        <h3>{interaction.title}</h3>
      </header>
      {interaction.description ? <p className="fusion-confirmation-description">{interaction.description}</p> : null}
      {state.confirmationPreview ? <div className="fusion-confirmation-preview" aria-label={state.confirmationPreview.title}>
        {state.confirmationPreview.items.map((item, index) => <div key={index}>
          {item.label ? <p className="fusion-confirmation-label">{item.label}</p> : null}
          <p className="fusion-confirmation-prompt">{item.value}</p>
        </div>)}
      </div> : null}
      <div className="fusion-confirmation-edit-row">
        <button type="button" className="fusion-confirmation-edit" disabled={disabled}
          aria-expanded={editing} aria-controls={refinementId}
          onClick={() => setEditing((value) => !value)}>
          {editing ? <ChevronUp aria-hidden="true" /> : <Pencil aria-hidden="true" />}
          {t(editing ? "assistant.interaction.hideEdit" : "assistant.interaction.edit")}
        </button>
      </div>
    </div>
    <div className="fusion-confirmation-actions">
      <button type="button" className="fusion-confirmation-dismiss" disabled={disabled} onClick={() => run(onDismiss)}>
        {interaction.cancelLabel ?? t("assistant.interaction.keepRefining")}
      </button>
      <button type="button" className={state.canGenerateImmediately ? "fusion-confirmation-secondary" : "fusion-confirmation-primary"} disabled={disabled} onClick={() => run(onApply)}>
        {interaction.confirmLabel ?? t("assistant.interaction.confirm")}
      </button>
      {state.canGenerateImmediately ? <button type="button" className="fusion-confirmation-primary" disabled={disabled} onClick={() => run(onGenerate)}>
        <Play aria-hidden="true" />{t("assistant.interaction.applyAndGenerate")}
      </button> : null}
    </div>
    <form id={refinementId} hidden={!editing} inert={!editing} className="fusion-confirmation-refine" onSubmit={(event) => { event.preventDefault(); refine(); }}>
      <textarea ref={refinementRef} rows={2} value={refinement} disabled={disabled}
        aria-label={t("assistant.interaction.refineAria")}
        placeholder={t("assistant.interaction.refinePlaceholder")}
        onChange={(event) => setRefinement(event.target.value)}
        onKeyDown={(event) => { if (isSendEnter(event)) { event.preventDefault(); refine(); } }}
      />
      <div className="fusion-confirmation-toolbar">
        <span className="fusion-confirmation-mode"><span><Sparkles aria-hidden="true" /></span>{t("assistant.interaction.refineMode")}</span>
        <button type="submit" className="fusion-confirmation-primary" disabled={disabled || !refinement.trim()}>
          {t("assistant.composer.send")}<ArrowUp aria-hidden="true" />
        </button>
      </div>
    </form>
  </section>;
}
