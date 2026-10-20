import { useUiText } from "@/i18n";

export type AiSettingsSection = "provider" | "ai" | "pi-agent";
const SECTIONS: Array<{ value: AiSettingsSection; label: string }> = [
  { value: "provider", label: "模型与服务" },
  { value: "ai", label: "创作助手" },
  { value: "pi-agent", label: "助手能力" }
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
    <div className="settings-subnavigation" role="group" aria-label={uiText("AI 设置")}>
      {SECTIONS.map((section) => (
        <button
          key={section.value}
          id={`${panelId}-${section.value}`}
          type="button"
          aria-controls={panelId}
          aria-current={value === section.value ? "page" : undefined}
          onClick={() => onChange(section.value)}
        >
          {uiText(section.label)}
        </button>
      ))}
    </div>
  );
}
