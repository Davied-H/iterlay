import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { SceneAssistantInteractionOption } from "@shared/types";
import { useUiText } from "@/i18n";

interface ChoiceProps {
  name: string;
  options: SceneAssistantInteractionOption[];
  disabled?: boolean;
}

/** Native radios retain arrow-key navigation and a single selection. */
export function SingleChoice({
  name,
  options,
  value,
  disabled,
  onChange,
}: ChoiceProps & {
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="ct-question-options">
      {options.map((option) => (
        <ChoiceOption
          key={option.value}
          name={name}
          option={option}
          selected={value === option.value}
          disabled={disabled}
          onChange={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

export function MultipleChoice({
  name,
  options,
  value,
  disabled,
  onChange,
}: ChoiceProps & {
  value: string[];
  onChange: (value: string[]) => void;
}): React.ReactElement {
  return (
    <div className="ct-question-options">
      {options.map((option) => (
        <ChoiceOption
          key={option.value}
          name={name}
          option={option}
          multiple
          selected={value.includes(option.value)}
          disabled={disabled}
          onChange={() =>
            onChange(
              value.includes(option.value)
                ? value.filter((item) => item !== option.value)
                : [...value, option.value],
            )
          }
        />
      ))}
    </div>
  );
}

function ChoiceOption({
  name,
  option,
  selected,
  multiple = false,
  disabled,
  onChange,
}: {
  name: string;
  option: SceneAssistantInteractionOption;
  selected: boolean;
  multiple?: boolean;
  disabled?: boolean;
  onChange: () => void;
}): React.ReactElement {
  const uiText = useUiText();
  return (
    <label className="ct-question-option" data-selected={selected}>
      <input
        type={multiple ? "checkbox" : "radio"}
        name={name}
        value={option.value}
        checked={selected}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className="ct-option-indicator"
        aria-hidden="true"
        data-multiple={multiple}
      >
        {multiple ? <Check size={11} strokeWidth={2.5} /> : <span />}
      </span>
      <span>{uiText(option.label)}</span>
    </label>
  );
}

export function QuestionField({
  label,
  hint,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  children: ReactNode;
}): React.ReactElement {
  const uiText = useUiText();
  return (
    <fieldset className="ct-question-field" disabled={disabled}>
      <legend>
        {uiText(label)}
        {hint ? (
          <span className="ct-field-optional">{uiText(hint)}</span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

export function TextAnswer({
  id,
  label,
  value,
  multiline = false,
  placeholder,
  disabled,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}): React.ReactElement {
  const uiText = useUiText();
  const props = {
    id,
    value,
    disabled,
    "aria-label": uiText(label),
    placeholder: placeholder ? uiText(placeholder) : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
  };
  return multiline ? (
    <textarea {...props} rows={3} />
  ) : (
    <input {...props} type="text" />
  );
}

/** Independent of the choice controls so it can also be used for custom answers. */
export function AnswerSupplement({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}): React.ReactElement {
  const uiText = useUiText();
  return (
    <label className="ct-question-supplement">
      <span>{uiText("补充说明（可选）")}</span>
      <TextAnswer
        label={uiText("补充说明：{{ui:0}}", [label])}
        value={value}
        multiline
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}
