import { useUiText } from "@/i18n";

export type AiSettingsSection = "provider" | "ai" | "pi-agent";
const SECTIONS: Array<{ value: AiSettingsSection; label: string }> = [
  { value: "provider", label: "模型与服务" },
  { value: "ai", label: "创作助手" },
  { value: "pi-agent", label: "工具与技能" }
];

export function isAiSettingsSection(value: string): value is AiSettingsSection {
  return SECTIONS.some((section) => section.value === value);
}

export function AiSettingsNavigation({
  value,
  panelId,
  onChange
}: {
  value: AiSettingsSection;
  panelId: string;
  onChange: (value: AiSettingsSection) => void;
}): React.ReactElement {
  const uiText = useUiText();
  return (
    <div className="settings-ai-tabs" role="tablist" aria-label={uiText("AI 设置")}>
      {SECTIONS.map((section, index) => (
        <button
          key={section.value}
          id={`${panelId}-${section.value}`}
          type="button"
          role="tab"
          aria-controls={panelId}
          aria-selected={value === section.value}
          tabIndex={value === section.value ? 0 : -1}
          data-settings-tab={section.value}
          onClick={() => onChange(section.value)}
          onKeyDown={(event) => {
            const target =
              event.key === "ArrowRight"
                ? (index + 1) % SECTIONS.length
                : event.key === "ArrowLeft"
                  ? (index + SECTIONS.length - 1) % SECTIONS.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? SECTIONS.length - 1
                      : -1;
            if (target < 0) return;
            event.preventDefault();
            const next = SECTIONS[target].value;
            onChange(next);
            event.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>(`[data-settings-tab="${next}"]`)
              ?.focus();
          }}
        >
          {uiText(section.label)}
        </button>
      ))}
    </div>
  );
}
