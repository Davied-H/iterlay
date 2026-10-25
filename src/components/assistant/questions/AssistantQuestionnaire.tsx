import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type {
  SceneAssistantInteraction,
  SceneAssistantInteractionField,
} from "@shared/types";
import { useUiText } from "@/i18n";
import { assistantInteractionSupplementKey } from "@/lib/assistant-interaction";
import {
  AnswerSupplement,
  MultipleChoice,
  QuestionField,
  SingleChoice,
  TextAnswer,
} from "./QuestionControls";
import "../assistant-decision-cards.css";

type QuestionInteraction = Extract<SceneAssistantInteraction, { type: "form" }>;
export type QuestionAnswers = Record<string, string | string[]>;

interface Props {
  interaction: QuestionInteraction;
  allowSupplements?: boolean;
  disabled: boolean;
  onSubmit: (values: QuestionAnswers) => void;
  onDismiss: () => void;
}

function allowsSupplement(
  field: SceneAssistantInteractionField,
  defaultValue: boolean,
): boolean {
  return field.allowSupplement ?? (field.type === "select" && defaultValue);
}

function hasAnswer(
  field: SceneAssistantInteractionField,
  answers: QuestionAnswers,
  supplements: boolean,
): boolean {
  const value = answers[field.id];
  const supplement = answers[assistantInteractionSupplementKey(field.id)];
  return (
    (Array.isArray(value) ? value.length > 0 : Boolean(value?.trim())) ||
    (allowsSupplement(field, supplements) &&
      typeof supplement === "string" &&
      Boolean(supplement.trim()))
  );
}

/** One question at a time; draft answers belong to the whole questionnaire. */
export function AssistantQuestionnaire({
  interaction,
  allowSupplements = true,
  disabled,
  onSubmit,
  onDismiss,
}: Props): React.ReactElement {
  const uiText = useUiText();
  const id = useId();
  const [answers, setAnswers] = useState<QuestionAnswers>({});
  const [step, setStep] = useState(0);
  const field = interaction.fields[step];
  const last = step === interaction.fields.length - 1;
  const multiple = interaction.fields.length > 1;
  const heading = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  const submitted = useRef(false);
  useLayoutEffect(() => {
    if (step !== previousStep.current)
      heading.current?.focus({ preventScroll: true });
    previousStep.current = step;
  }, [step]);

  const update = (key: string, value: string | string[]): void => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };
  const complete = Boolean(
    field && (!field.required || hasAnswer(field, answers, allowSupplements)),
  );

  function advance(): void {
    if (disabled || !complete || submitted.current) return;
    if (!last) {
      setStep(step + 1);
      return;
    }
    const missing = interaction.fields.findIndex(
      (question) =>
        question.required && !hasAnswer(question, answers, allowSupplements),
    );
    if (missing !== -1) {
      setStep(missing);
      return;
    }
    // Only submit current fields and visible supplements; never leak a stale hidden draft.
    const values: QuestionAnswers = {};
    for (const question of interaction.fields) {
      if (answers[question.id] !== undefined)
        values[question.id] = answers[question.id];
      const key = assistantInteractionSupplementKey(question.id);
      if (
        allowsSupplement(question, allowSupplements) &&
        typeof answers[key] === "string" &&
        answers[key].trim()
      )
        values[key] = answers[key];
    }
    submitted.current = true;
    try {
      onSubmit(values);
    } finally {
      queueMicrotask(() => {
        submitted.current = false;
      });
    }
  }

  return (
    <section className="ct-card ct-question" aria-labelledby={`${id}-title`}>
      <header className="ct-card-heading">
        <h3 id={`${id}-title`}>{uiText(interaction.title)}</h3>
        {interaction.description ? (
          <p>{uiText(interaction.description)}</p>
        ) : null}
      </header>
      {multiple ? (
        <div className="ct-question-progress" aria-live="polite">
          <span>
            {uiText("问题 {{ui:0}} / {{ui:1}}", [
              step + 1,
              interaction.fields.length,
            ])}
          </span>
          <span>
            {uiText("已回答 {{ui:0}} 题", [
              interaction.fields.filter((question) =>
                hasAnswer(question, answers, allowSupplements),
              ).length,
            ])}
          </span>
        </div>
      ) : null}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          advance();
        }}
      >
        <div
          ref={heading}
          className="ct-question-current"
          tabIndex={-1}
          key={field?.id}
          role="group"
          aria-label={field ? uiText(field.label) : undefined}
        >
          {field ? (
            <QuestionField
              label={field.label}
              disabled={disabled}
              hint={
                field.required
                  ? field.type === "select"
                    ? field.multiple
                      ? uiText("多选")
                      : uiText("单选")
                    : undefined
                  : uiText("可选")
              }
            >
              {field.type === "select" ? (
                field.multiple ? (
                  <MultipleChoice
                    name={`${id}-${field.id}`}
                    options={field.options ?? []}
                    value={
                      Array.isArray(answers[field.id])
                        ? (answers[field.id] as string[])
                        : []
                    }
                    disabled={disabled}
                    onChange={(value) => update(field.id, value)}
                  />
                ) : (
                  <SingleChoice
                    name={`${id}-${field.id}`}
                    options={field.options ?? []}
                    value={
                      typeof answers[field.id] === "string"
                        ? (answers[field.id] as string)
                        : ""
                    }
                    disabled={disabled}
                    onChange={(value) => update(field.id, value)}
                  />
                )
              ) : (
                <TextAnswer
                  id={`${id}-${field.id}`}
                  label={field.label}
                  multiline={field.type === "textarea"}
                  placeholder={field.placeholder}
                  value={
                    typeof answers[field.id] === "string"
                      ? (answers[field.id] as string)
                      : ""
                  }
                  disabled={disabled}
                  onChange={(value) => update(field.id, value)}
                />
              )}
              {allowsSupplement(field, allowSupplements) ? (
                <AnswerSupplement
                  label={field.label}
                  value={
                    typeof answers[
                      assistantInteractionSupplementKey(field.id)
                    ] === "string"
                      ? (answers[
                          assistantInteractionSupplementKey(field.id)
                        ] as string)
                      : ""
                  }
                  disabled={disabled}
                  onChange={(value) =>
                    update(assistantInteractionSupplementKey(field.id), value)
                  }
                />
              ) : null}
            </QuestionField>
          ) : null}
        </div>
        <footer className="ct-card-actions">
          <button
            type="button"
            className="ct-button ct-button-quiet ct-question-dismiss"
            disabled={disabled}
            onClick={onDismiss}
          >
            {interaction.cancelLabel
              ? uiText(interaction.cancelLabel)
              : uiText("用文字回答")}
          </button>
          {multiple && step > 0 ? (
            <button
              type="button"
              className="ct-button ct-button-quiet"
              disabled={disabled}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {uiText("上一题")}
            </button>
          ) : null}
          <button
            type="submit"
            className="ct-button ct-button-primary"
            disabled={disabled || !complete}
          >
            {!last
              ? uiText("下一题")
              : interaction.submitLabel
                ? uiText(interaction.submitLabel)
                : uiText(multiple ? "提交回答" : "继续")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </footer>
      </form>
    </section>
  );
}
